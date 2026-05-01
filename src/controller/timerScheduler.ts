/**
 * TimerScheduler — 定时任务调度器（状态驱动单例）
 *
 * 核心原则：业务代码只负责改 isPlaying 状态，不碰定时器启停。
 * Scheduler 轮询 isPlaying，自动管理 watchdog / sync / sleep 的生命周期。
 *
 * 调用链路：
 *   play() / resume() / recoverFromBackground()
 *     → set({ isPlaying: true })
 *       → Scheduler 检测到 isPlaying → 自动启动全部定时任务
 *
 *   pause() / stop() / finishOrNext()
 *     → set({ isPlaying: false })
 *       → Scheduler 检测到 !isPlaying → 自动清理全部定时任务
 *
 * 幂等保证：已在运行的任务不会重复启动。
 *
 * 零循环引用：所有外部依赖通过 initSchedulerDeps() 注入。
 */

// ── 类型 ──

export interface SchedulerDeps {
  /** 读取 store 快照 */
  getStoreState: () => {
    isPlaying: boolean;
    currentItem: any;
    chapters: any[];
    currentChapterIndex: number;
    currentChapter: any;
    libraryItemId: string | null;
    mediaItemId: string | null;
    sleepTimer: number | null;
    sleepTimeRemaining: number | null;
  };
  /** 写入 store（仅用于 isPlaying / sleep 等状态变更） */
  setState: (patch: Record<string, unknown>) => void;
  /** 获取 audio 单例 */
  getAudio: () => HTMLAudioElement;
  /** 跨章累计时间计算 */
  cumulativeTime: (chapters: any[], idx: number, t: number) => number;
  /** 读取书籍级配置（跳过设置） */
  getBookConfig: (itemId: string) => { autoSkipIntro: boolean; introSeconds: number; autoSkipOutro: boolean; outroSeconds: number };
  /** 进度同步 API */
  syncProgress: (libraryItemId: string, currentTime: number, duration: number) => void;
  /** 日志 */
  log: (module: string, msg: string, data?: Record<string, unknown>) => void;
  warn: (module: string, msg: string, data?: Record<string, unknown>) => void;
}

// ── 注入的依赖（通过 getter 访问，TS 视为非空）──

let _deps: SchedulerDeps | null = null;

/** 获取依赖（未初始化时抛出明确错误） */
function deps(): SchedulerDeps {
  if (!_deps) throw new Error('[TimerScheduler] 未初始化依赖，请先调用 initSchedulerDeps()');
  return _deps;
}

/** 初始化依赖（幂等） */
export function initSchedulerDeps(d: SchedulerDeps) {
  _deps = d;
}

// ════════════════════════════════════════
// 内部定时器句柄
// ════════════════════════════════════════

let wdInterval: ReturnType<typeof setInterval> | null = null;
let syncIntervalId: ReturnType<typeof setInterval> | null = null;
let sleepTimerId: ReturnType<typeof setInterval> | null = null;

// ════════════════════════════════════════
// Scheduler 主循环
// ════════════════════════════════════════

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let lastWasPlaying = false;

/** 启动调度器（幂等，应用启动时调用一次） */
export function initScheduler() {
  if (!_deps) throw new Error('[TimerScheduler] 未初始化依赖，请先调用 initSchedulerDeps()');
  if (schedulerInterval) return;
  schedulerInterval = setInterval(tick, 500);
  tick(); // 立即执行一次，防止初始状态遗漏
  deps().log('system', 'TimerScheduler 已启动 · 轮询频率 500ms');
}

/** 停止调度器（仅测试用） */
export function destroyScheduler() {
  if (schedulerInterval) { clearInterval(schedulerInterval); schedulerInterval = null; }
  shutdownAllTimers();
}

/**
 * 核心轮询：对比上一次状态，只在状态翻转时执行启停。
 *
 * 上升沿 (!playing → playing): 启动全部定时任务
 * 下降沿 (playing → !playing): 关闭全部定时任务
 * 平稳态: 无操作
 */
function tick() {
  if (!_deps) return;
  const s = deps().getStoreState();
  const nowPlaying = s.isPlaying && !!s.currentItem && !!s.currentChapter;

  if (nowPlaying && !lastWasPlaying) {
    startAllTimers();
  } else if (!nowPlaying && lastWasPlaying) {
    shutdownAllTimers();
  }

  lastWasPlaying = nowPlaying;
}

// ════════════════════════════════════════
// 定时任务启动（仅由 Scheduler 内部调用）
// ════════════════════════════════════════

function startAllTimers() {
  if (!_deps) return;
  const d = deps();
  const audio = d.getAudio();
  const s = d.getStoreState();
  const ch = s.chapters[s.currentChapterIndex];

  // ── 4a. Watchdog（章节看门狗） ──
  if (!wdInterval) {
    d.log('watchdog', `启动 · 第${s.currentChapterIndex + 1}/${s.chapters.length}章 · ${ch?.title || '?'} · 频率1s`);

    function check() {
      const st = d.getStoreState();
      if (!st.currentItem || !st.currentChapter) return;

      const ct = audio.currentTime;
      const cfg = d.getBookConfig(st.currentItem.id);
      const end = st.currentChapter.duration;

      // 片头跳过
      if (cfg.autoSkipIntro && cfg.introSeconds > 0 && ct < cfg.introSeconds) {
        d.log('chapter', `片头跳过 · ${ct.toFixed(1)}s → ${cfg.introSeconds}s`);
        audio.currentTime = cfg.introSeconds;
        return;
      }
      // 片尾切章
      if (cfg.autoSkipOutro && cfg.outroSeconds > 0 && ct >= end - cfg.outroSeconds) {
        finishOrNext(audio); return;
      }
      // 自然结束
      if (ct >= end) finishOrNext(audio);
    }

    wdInterval = setInterval(() => { if (!audio.paused) check(); }, 1000);
    check(); // 立即检查一次
    audio.onended = () => finishOrNext(audio);
  }

  // ── 4b. 进度同步 ──
  if (!syncIntervalId && s.libraryItemId && s.chapters.length > 0) {
    const ct = d.cumulativeTime(s.chapters, s.currentChapterIndex, audio.currentTime);
    d.syncProgress(s.libraryItemId, ct, s.chapters[s.currentChapterIndex]?.duration || 0);

    syncIntervalId = setInterval(() => {
      const st = d.getStoreState();
      if (!st.libraryItemId || !st.isPlaying) return;
      const cum = d.cumulativeTime(st.chapters, st.currentChapterIndex, audio.currentTime);
      d.syncProgress(st.libraryItemId, cum, st.chapters[st.currentChapterIndex]?.duration || 0);
    }, 15000);

    d.log('sync', `启动 · 频率15s · 累计${Math.round(ct)}s`);
  }

  // ── 4c. 睡眠倒计时 ──
  if (!sleepTimerId && s.sleepTimer) {
    d.log('sleep', `启动 · ${s.sleepTimer}min(${formatTime(s.sleepTimer * 60)})`);

    sleepTimerId = setInterval(() => {
      const st = d.getStoreState();
      if (!st.isPlaying) return;
      if (st.sleepTimeRemaining !== null) {
        const remaining = st.sleepTimeRemaining - 1;
        if (remaining <= 0) {
          audio.pause();
          d.log('sleep', '睡眠定时到 → 暂停');
          d.setState({ isPlaying: false, sleepTimer: null, sleepTimeRemaining: null });
          clearInterval(sleepTimerId!);
          sleepTimerId = null;
        } else {
          d.setState({ sleepTimeRemaining: remaining });
        }
      }
    }, 1000);
  }

  d.log('lifecycle', '定时子系统已自动启动（Scheduler 驱动）');
}

// ════════════════════════════════════════
// 定时任务停止（仅由 Scheduler 内部调用）
// ════════════════════════════════════════

function shutdownAllTimers() {
  const hadAny = wdInterval || syncIntervalId || sleepTimerId;
  const d = _deps; // 可能未初始化（stop 时清理）

  if (wdInterval) { clearInterval(wdInterval); wdInterval = null; d?.log('watchdog', '关闭'); }
  if (syncIntervalId) { clearInterval(syncIntervalId); syncIntervalId = null; d?.log('sync', '关闭'); }
  if (sleepTimerId) { clearInterval(sleepTimerId); sleepTimerId = null; d?.log('sleep', '关闭'); }

  if (_deps) {
    const audio = _deps.getAudio();
    if (audio) audio.onended = null;
  }

  if (hadAny) d?.log('lifecycle', '全部定时任务已关闭（Scheduler 驱动）');
}

// ════════════════════════════════════════
// 共享工具 & 公开 API
// ════════════════════════════════════════

function finishOrNext(audio: HTMLAudioElement) {
  if (!_deps) return;
  const d = deps();
  const s = d.getStoreState();
  const idx = s.currentChapterIndex;
  const chapters = s.chapters;

  if (idx < chapters.length - 1) {
    d.log('chapter', `章节切换 · ${idx + 1} → ${idx + 2}`);
    // 延迟调用打破同步栈（避免在 watchdog interval callback 中直接修改状态）
    setTimeout(() => {
      if (!_deps) return;
      const dd = deps();
      // 通过 store 的 playNextChapter 方法触发下一章
      const storeWithCommands = dd.getStoreState() as { playNextChapter?: () => void };
      storeWithCommands.playNextChapter?.();
    }, 0);
  } else {
    d.log('lifecycle', '全书播放完毕');
    audio.pause();
    d.setState({ isPlaying: false });
  }
}

/** 秒数 → mm:ss */
function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * 强制重启所有定时任务。
 *
 * 使用场景：章节切换后 chapter 信息变了，watchdog 需要重建。
 * 调用后会关闭当前定时器并在下一个 tick (≤500ms) 自动重新启动。
 */
export function restartTimers() {
  shutdownAllTimers();
  lastWasPlaying = false; // 重置状态，让下次 tick 重新触发上升沿
}
