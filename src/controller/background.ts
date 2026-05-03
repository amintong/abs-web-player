/**
 * 后台事件处理模块（单例，应用启动即初始化）
 *
 * 常驻监听：
 *   - visibilitychange → 隐藏时同步进度 / 显示时恢复播放
 *   - pagehide / beforeunload → 页面关闭前最终同步 *
 * 不负责：
 *   - watchdog / sync / sleep 定时任务 → 由 TimerScheduler 根据 isPlaying 状态自动管理
 */

import { syncProgress as syncProgressNow } from '../api/audiobookshelf';
import { getAudio } from './playerController';
import { playerLog, playerWarn } from '../utils/playerLogger';

// ── 延迟导入依赖（避免循环引用）──

let getCumulativeTimeFn: ((chapters: any[], idx: number, t: number) => number) | null = null;
let getStore: (() => {
  getState: () => any;
  setState: (patch: Record<string, unknown>) => void;
}) | null = null;

/** 由 playerController 初始化时注入依赖 */
export function initDeps(deps: {
  cumulativeTime: typeof getCumulativeTimeFn;
  getStore: typeof getStore;
}) {
  getCumulativeTimeFn = deps.cumulativeTime;
  getStore = deps.getStore;
}

// ── 恢复令牌 ──

export let restoreGen = 0;

/** 递增恢复令牌（防止过期回调覆盖用户操作） */
export function bumpRestoreGen(): number {
  return ++restoreGen;
}

// ── 初始化标志 ──

let initialized = false;

/** 初始化后台事件监听（幂等，只执行一次） */
export function initBackground() {
  if (initialized) return;
  initialized = true;

  const audio = getAudio();

  // ── 页面关闭前最终同步 ──
  const onFinalSync = () => {
    if (!getCumulativeTimeFn || !getStore) return;
    const store = getStore();
    const s = store.getState();
    if (!s.libraryItemId) return;
    const ct = getCumulativeTimeFn(s.chapters, s.currentChapterIndex, audio.currentTime);
    const totalDuration = s.chapters.reduce((sum: number, ch: any) => sum + (ch.duration || 0), 0);
    syncProgressNow(s.libraryItemId, ct, totalDuration);
    playerLog('background', `页面关闭 → 最终同步 · ${Math.round(ct)}s`);
  };

  window.addEventListener('beforeunload', onFinalSync);
  window.addEventListener('pagehide', onFinalSync);

  // ── 前后台切换 ──
  const onVisibilityChange = () => {
    if (!getCumulativeTimeFn || !getStore) return;

    if (document.visibilityState === 'hidden') {
      // 后台：同步当前进度
      const store = getStore();
      const s = store.getState();
      if (s.libraryItemId) {
        const ct = getCumulativeTimeFn(s.chapters, s.currentChapterIndex, audio.currentTime);
        const totalDuration = s.chapters.reduce((sum: number, ch: any) => sum + (ch.duration || 0), 0);
        syncProgressNow(s.libraryItemId, ct, totalDuration);
        playerLog('background', `页面隐藏 → 同步 · ${Math.round(ct)}s`);
      }
    } else {
      // 前台：恢复被暂停的播放
      recoverFromBackground(audio);
    }
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  playerLog('background', '后台事件监听已注册（常驻）');
}

/** iOS 锁屏返回后 audio 可能被系统暂停，尝试恢复 */
function recoverFromBackground(audio: HTMLAudioElement) {
  if (!audio.src) return;
  const storeFn = getStore;
  if (!storeFn) return;
  const store = storeFn();
  const s = store.getState();

  playerLog('background', `页面恢复可见 · isPlaying=${s.isPlaying} · audioPaused=${audio.paused} · ct=${audio.currentTime.toFixed(1)}s`);

  // 如果用户主动暂停过（store.isPlaying === false），不自动恢复
  if (!s.isPlaying) {
    playerLog('background', '用户已暂停，跳过自动恢复');
    return;
  }

  if (!audio.paused) {
    playerLog('background', 'audio 仍在播放，无需恢复');
    return;
  }

  // store 认为在播放但 audio 被系统暂停了 → 恢复
  playerLog('background', '检测到 audio 被系统暂停，尝试恢复...');
  const timeBeforePlay = audio.currentTime;
  const token = ++restoreGen;
  const promise = audio.play();

  if (promise === undefined) {
    if (token !== restoreGen) return;
    return;
  }

  promise.then(() => {
    if (token !== restoreGen) return;

    const ctAfter = audio.currentTime;
    if (ctAfter < 1 && timeBeforePlay > 2) {
      audio.currentTime = Math.min(timeBeforePlay, audio.duration || timeBeforePlay);
      playerLog('background', `⚠️ currentTime 重置 · ${ctAfter.toFixed(1)}s → ${timeBeforePlay.toFixed(1)}s`);
    }

    playerLog('background', `后台恢复播放成功 · ct=${audio.currentTime.toFixed(1)}s`);
  }).catch((err) => {
    if (token !== restoreGen) return;
    store.setState({ isPlaying: false });
    playerWarn('background', `恢复播放失败`, { error: (err as Error).message || 'unknown' });
  });
}
