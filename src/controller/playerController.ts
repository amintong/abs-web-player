/**
 * PlayerController — 播放器控制器（核心单例）
 *
 * 唯一音频引擎。所有配置、交互都基于此控制器的状态。
 *
 * 架构：
 * ┌──────────────────────────────────────────────┐
 * │  ① Types          接口定义                   │
 * │  ② Audio           底层 <audio> 单例         │
 * │  ③ Utils           纯工具函数                 │
 * │  ④ ChapterLoad     章节加载流程              │
 * │  ⑤ Store           Zustand 状态 + 命令        │
 * └──────────────────────────────────────────────┘
 *
 * 定时任务（watchdog / sync / sleep）→ 由 timerScheduler.ts 自动管理。
 *   业务代码只改 isPlaying 状态，Scheduler 轮询状态自动启停定时器。
 *   切章后需调用 restartTimers() 让 Scheduler 重建 watchdog（章节信息变了）。
 *
 * 后台事件（visibility/pagehide/锁屏恢复）→ controller/background.ts
 *
 * 不负责：currentTime/duration（由 useAudioTime hook 直接读 audio 元素）
 */

import { create } from 'zustand';
import { ABSMediaItem } from '../types';
import { getAudioUrl, getProgress } from '../api/audiobookshelf';
import { AudioCache } from '../utils/audioCache';
import { Config } from '../utils/configManager';
import { playerLog, playerWarn } from '../utils/playerLogger';
import {
  initDeps as initBackgroundDeps,
  initBackground,
  bumpRestoreGen,
} from '../controller/background';
import {
  initSchedulerDeps,
  initScheduler,
  restartTimers,
} from './timerScheduler';

// ════════════════════════════════════════
// ① Types
// ════════════════════════════════════════

export interface PlayerChapter {
  id: number; title: string; start: number; end: number;
  index: number; ino: string; duration: number;
}

export interface PlayerState {
  // 结构数据
  currentItem: ABSMediaItem | null;
  chapters: PlayerChapter[];
  currentChapterIndex: number;
  currentChapter: PlayerChapter | null;
  // 播放状态
  isPlaying: boolean;
  volume: number;
  playbackRate: number;
  // 睡眠定时器
  sleepTimer: number | null;
  sleepTimeRemaining: number | null;
  // UI 可见性
  isMiniPlayerVisible: boolean;
  isFullPlayerVisible: boolean;
  // 服务端标识
  libraryItemId: string | null;
  mediaItemId: string | null;

  // 命令
  play: (item: ABSMediaItem) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => void;
  skipForward: (seconds?: number) => void;
  skipBackward: (seconds?: number) => void;
  playNextChapter: () => Promise<void>;
  playPreviousChapter: () => Promise<void>;
  switchToChapter: (index: number) => Promise<void>;
  setSleepTimer: (minutes: number | null) => void;
  clearSleepTimer: () => void;
  showMiniPlayer: () => void;
  hideMiniPlayer: () => void;
  showFullPlayer: () => void;
  hideFullPlayer: () => void;
  skipIntro: () => void;
  skipOutro: () => void;

  _getAudio: () => HTMLAudioElement;
}

// ════════════════════════════════════════
// ② Audio 单例
// ════════════════════════════════════════

let audioEl: HTMLAudioElement | null = null;

export function getAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.crossOrigin = 'anonymous';
    audioEl.preload = 'auto';
    audioEl.setAttribute('playsinline', '');
    audioEl.style.display = 'none';
    document.body.appendChild(audioEl);
  }
  return audioEl;
}

// ════════════════════════════════════════
// ③ Utils
// ════════════════════════════════════════

/** play() 并发锁：防止 StrictMode 双调用 / 快速双击时两个实例同时操作 audio */
let _playLock = false;

/** 从媒体项构建章节列表 */
function createChapters(item: ABSMediaItem): PlayerChapter[] {
  const result: PlayerChapter[] = (item.media?.chapters || []).map((ch, index) => {
    const af = item.media?.audioFiles?.[index];
    return {
      id: ch.id, title: ch.title || `章节 ${index + 1}`,
      start: 0, end: af?.duration || ch.end - ch.start || 0,
      index, ino: af?.ino || '', duration: af?.duration || ch.end - ch.start || 0,
    };
  });
  if (result.length === 0 && item.media?.audioFiles?.length) {
    item.media.audioFiles.forEach((af, i) => {
      result.push({ id: i, title: af.metadata?.filename || `Track ${i + 1}`, start: 0, end: af.duration, index: i, ino: af.ino, duration: af.duration });
    });
  }
  return result;
}

/** 计算累计时间（跨章节） */
export function cumulativeTime(chapters: PlayerChapter[], chapterIdx: number, timeInChapter: number): number {
  let cum = 0;
  for (let i = 0; i < chapterIdx; i++) cum += chapters[i]?.duration || 0;
  return cum + timeInChapter;
}

/** 从服务端累计时间反算章节索引和偏移 */
function resolveChapterFromTime(chapters: PlayerChapter[], totalSeconds: number): { index: number; offset: number } {
  let cum = 0;
  for (let i = 0; i < chapters.length; i++) {
    if (cum + chapters[i].duration > totalSeconds) {
      return { index: i, offset: totalSeconds - cum };
    }
    cum += chapters[i].duration;
  }
  if (chapters.length > 0) {
    return { index: chapters.length - 1, offset: chapters[chapters.length - 1].duration };
  }
  return { index: 0, offset: 0 };
}

// ════════════════════════════════════════
// ④ Chapter Loading
// ════════════════════════════════════════

async function loadChapter(index: number): Promise<boolean> {
  const s = usePlayerStore.getState();
  const chapter = s.chapters[index];
  if (!chapter || !s.currentItem) return false;

  const audio = getAudio();
  const rate = s.playbackRate;

  playerLog('chapter', `加载章节 ${index + 1}/${s.chapters.length}`, { title: chapter.title });

  const url = getAudioUrl(s.currentItem.id, chapter.ino);
  const cachedUrl = await AudioCache.getInstance().getCached(url).catch(() => url);
  if (cachedUrl !== url) playerLog('cache', `缓存命中 · 第${index + 1}章`);

  audio.src = cachedUrl;

  const allUrls = s.chapters.map(ch => getAudioUrl(s.currentItem!.id, ch.ino));
  AudioCache.getInstance().prefetchAhead(allUrls, index, 3);

  if (rate !== 1) audio.playbackRate = rate;
  audio.volume = s.volume;

  // 等待音频就绪（readyState >= 3 或超时），同时发起 play()
  // 注意：iOS 后台 rAF 不执行，用 setTimeout 兜底保证后台切章也能推进
  await new Promise<void>((resolve) => {
    const TIMEOUT = 15000;
    const t0 = performance.now();
    let settled = false;

    const onError = () => {
      if (settled) return;
      settled = true;
      playerWarn('lifecycle', `章节加载失败 · 第${index + 1}章`, { error: audio.error?.message || 'unknown' });
      audio.removeEventListener('error', onError);
      resolve();
    };
    audio.addEventListener('error', onError);

    audio.play().catch(() => { usePlayerStore.setState({ isPlaying: false }); });

    const tryResolve = () => {
      if (settled) return;
      if (audio.readyState >= 3) {
        settled = true;
        audio.removeEventListener('error', onError);
        if (audio.playbackRate !== rate) audio.playbackRate = rate;
        resolve();
      } else if (performance.now() - t0 > TIMEOUT) {
        settled = true;
        audio.removeEventListener('error', onError);
        playerWarn('chapter', `章节加载超时 · 第${index + 1}章 · readyState=${audio.readyState}`);
        resolve();
      }
    };

    // rAF：前台高频轮询
    const rafPoll = () => { if (!settled) { tryResolve(); if (!settled) requestAnimationFrame(rafPoll); } };
    requestAnimationFrame(rafPoll);

    // setTimeout 兜底：后台 rAF 停止时仍能推进（每200ms检查一次）
    const bgPoll = setInterval(() => { tryResolve(); if (settled) clearInterval(bgPoll); }, 200);
  });

  // 音频就绪后立即跳过片头（不等 watchdog，锁屏下也保证执行）
  // 无条件 seek，不判断 ct 是否 < introSeconds——锁屏下就绪时 ct 可能已经超过 intro
  const itemId = usePlayerStore.getState().currentItem?.id;
  if (itemId) {
    const cfg = Config.getBook(itemId);
    if (cfg.autoSkipIntro && cfg.introSeconds > 0) {
      playerLog('chapter', `片头跳过 · ${audio.currentTime.toFixed(1)}s → ${cfg.introSeconds}s`);
      audio.currentTime = cfg.introSeconds;
    }
  }

  // 切章完成 → 通知 Scheduler 重建定时器
  restartTimers();
  return true;
}

// ════════════════════════════════════════
// ⑤ Store（Zustand）
// ════════════════════════════════════════

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentItem: null,
  chapters: [],
  currentChapterIndex: 0,
  currentChapter: null,
  isPlaying: false,
  volume: Config.getPlayer().volume,
  playbackRate: Config.getPlayer().playbackRate,
  sleepTimer: null,
  sleepTimeRemaining: null,
  isMiniPlayerVisible: false,
  isFullPlayerVisible: false,
  libraryItemId: null,
  mediaItemId: null,

  _getAudio: getAudio,

  // ── 播放控制 ──

  play: async (item) => {
    if (_playLock) {
      playerLog('lifecycle', 'play() 忽略重复调用（并发锁）', { itemId: item.id });
      return;
    }
    // 已在播放同一本书，忽略重复调用
    const cur = usePlayerStore.getState();
    if (cur.isPlaying && cur.libraryItemId === item.id) {
      playerLog('lifecycle', 'play() 忽略：同书已在播放', { itemId: item.id });
      return;
    }
    _playLock = true;
    try {
      const audio = getAudio();
      audio.pause();
      audio.src = '';

      playerLog('lifecycle', '开始播放', { title: item.media?.metadata?.title || item.id, itemId: item.id });

      const chapters = createChapters(item);
      if (chapters.length === 0) { console.warn('No chapters'); return; }

      const libraryItemId = item.id;
      const mediaItemId = item.media?.id || '';

      // 从服务端恢复进度
      let targetIdx = 0;
      let offset = 0;

      const progress = await getProgress(libraryItemId);
      const cumulative = progress.currentTime;
      if (cumulative > 0) {
        const resolved = resolveChapterFromTime(chapters, cumulative);
        targetIdx = resolved.index;
        offset = resolved.offset;
        playerLog('sync', '服务端进度恢复', { chapter: targetIdx + 1, offset: Math.round(offset) + 's' });
      }

      const targetChapter = chapters[targetIdx];

      set({
        currentItem: item, chapters, currentChapterIndex: targetIdx,
        currentChapter: targetChapter,
        isMiniPlayerVisible: true, isFullPlayerVisible: false,
        libraryItemId, mediaItemId,
      });

      // 加载首章音频
      const url = getAudioUrl(item.id, targetChapter.ino);
      const cachedUrl = await AudioCache.getInstance().getCached(url).catch(() => url);

      audio.onerror = () => {
        console.warn('Audio error:', audio.error?.message);
        playerWarn('lifecycle', '音频加载错误', { error: audio.error?.message || 'unknown' });
        set({ isPlaying: false });
      };
      audio.src = cachedUrl;

      AudioCache.getInstance().prefetchAhead(
        chapters.map(ch => getAudioUrl(item.id, ch.ino)), targetIdx, 3
      );

      audio.volume = get().volume;
      audio.playbackRate = get().playbackRate;

      await audio.play().then(() => {
        if (offset > 0) {
          audio.currentTime = Math.min(offset, audio.duration || targetChapter.duration);
        }
        set({ isPlaying: true });
      }).catch((err) => {
        playerWarn('lifecycle', '播放启动失败', { error: err.message });
        set({ isPlaying: false });
      });
    } finally {
      // 整个 async 流程（含 getProgress + getCached + play）全部完成后释放锁
      _playLock = false;
    }
  },

  // ── 播放/暂停/停止（纯状态操作，不碰定时器）──

  pause: () => {
    bumpRestoreGen();
    getAudio().pause();
    // ★ 只设置 isPlaying=false，Scheduler 检测到后会自动清理所有定时任务
    set({ isPlaying: false });
    playerLog('lifecycle', '暂停');
  },

  resume: () => {
    bumpRestoreGen();
    getAudio().play()
      .then(() => {
        // ★ 只设置 isPlaying=true，Scheduler 检测到后会自动启动所有定时任务
        set({ isPlaying: true });
      })
      .catch(() => {});
    playerLog('lifecycle', '恢复播放');
  },

  stop: () => {
    bumpRestoreGen();
    const audio = getAudio();
    audio.pause();
    audio.src = '';
    // ★ 先设 isPlaying=false 触发 Scheduler 清理定时器，再清空状态
    set({ isPlaying: false });
    playerLog('lifecycle', '完全停止');
    set({
      currentItem: null,
      isMiniPlayerVisible: false, isFullPlayerVisible: false,
      libraryItemId: null, mediaItemId: null,
      chapters: [], currentChapter: null, currentChapterIndex: 0,
      sleepTimer: null, sleepTimeRemaining: null,
    });
  },

  seek: (time: number) => {
    getAudio().currentTime = Math.max(0, Math.min(time, getAudio().duration || 0));
  },

  setVolume: (vol: number) => {
    const v = Math.max(0, Math.min(1, vol));
    getAudio().volume = v;
    Config.updatePlayer({ volume: v });
    set({ volume: v });
  },

  setPlaybackRate: (rate: number) => {
    getAudio().playbackRate = rate;
    Config.updatePlayer({ playbackRate: rate });
    set({ playbackRate: rate });
  },

  skipForward: (seconds = 30) => {
    const a = getAudio();
    a.currentTime = Math.min(a.currentTime + seconds, a.duration ?? Infinity);
  },
  skipBackward: (seconds = 10) => {
    const a = getAudio();
    a.currentTime = Math.max(a.currentTime - seconds, 0);
  },

  // ── 章节切换 ──

  playNextChapter: async () => {
    const { currentChapterIndex: idx, chapters } = get();
    if (idx >= chapters.length - 1) return;
    const next = idx + 1;
    playerLog('chapter', `下一章 · ${idx + 1} → ${next + 1}`);
    // 先更新章节索引（watchdog check() 需要正确的 duration），再暂停、加载
    set({ isPlaying: false, currentChapterIndex: next, currentChapter: chapters[next] });
    await loadChapter(next);
    set({ isPlaying: true });
  },

  playPreviousChapter: async () => {
    const { currentChapterIndex: idx, chapters } = get();
    const ct = getAudio().currentTime;
    if (ct > 3) {
      playerLog('chapter', `重播当前章 · 第${idx + 1}章开头`);
      set({ isPlaying: false });
      await loadChapter(idx);
      getAudio().currentTime = 0;
      set({ isPlaying: true });
    } else if (idx > 0) {
      const prev = idx - 1;
      playerLog('chapter', `上一章 · ${idx + 1} → ${prev + 1}`);
      set({ isPlaying: false, currentChapterIndex: prev, currentChapter: chapters[prev] });
      await loadChapter(prev);
      set({ isPlaying: true });
    }
  },

  switchToChapter: async (index: number) => {
    const { chapters } = get();
    if (index < 0 || index >= chapters.length) return;
    playerLog('chapter', `切换章节 → 第${index + 1}章 · ${chapters[index].title}`);
    // 先更新章节索引，再暂停、加载
    set({ isPlaying: false, currentChapterIndex: index, currentChapter: chapters[index] });
    await loadChapter(index);
    set({ isPlaying: true });
  },

  // ── 睡眠定时器 ──

  setSleepTimer: (m: number | null) => {
    if (m !== null) playerLog('sleep', `设定睡眠定时 · ${m}分钟`);
    set({ sleepTimer: m, sleepTimeRemaining: m ? m * 60 : null });
    // 如果正在播放且设定了新的 sleepTimer，通知 Scheduler 启动/更新倒计时
    if (m && usePlayerStore.getState().isPlaying) {
      restartTimers();
    }
  },
  clearSleepTimer: () => {
    playerLog('sleep', '清除睡眠定时');
    set({ sleepTimer: null, sleepTimeRemaining: null });
  },

  // ── UI ──

  showMiniPlayer: () => set({ isMiniPlayerVisible: true }),
  hideMiniPlayer: () => set({ isMiniPlayerVisible: false }),
  showFullPlayer: () => set({ isFullPlayerVisible: true, isMiniPlayerVisible: false }),
  hideFullPlayer: () => set({ isFullPlayerVisible: false }),

  // ── 片头片尾 ──

  skipIntro: () => {
    const { currentItem } = get();
    if (!currentItem) return;
    const cfg = Config.getBook(currentItem.id);
    getAudio().currentTime = Math.min(cfg.introSeconds || 15, getAudio().duration ?? Infinity);
  },
  skipOutro: () => { get().playNextChapter(); },
}));

// ════════════════════════════════════════
// ⑥ 延迟初始化（store 创建完成后调用，避免 TDZ）
// ════════════════════════════════════════

let _initialized = false;

/** 初始化后台事件 + 定时调度器（必须在 store 创建后调用一次） */
export function initPlayerModules() {
  if (_initialized) return;
  _initialized = true;

  // 1. 后台事件（visibility/pagehide/beforeunload）
  initBackgroundDeps({
    cumulativeTime,
    getStore: () => ({ getState: usePlayerStore.getState, setState: usePlayerStore.setState }),
  });
  initBackground();

  // 2. 定时任务调度器（状态驱动，自动管理 watchdog/sync/sleep）
  initSchedulerDeps({
    getStoreState: () => {
      const s = usePlayerStore.getState();
      return {
        isPlaying: s.isPlaying,
        currentItem: s.currentItem,
        chapters: s.chapters,
        currentChapterIndex: s.currentChapterIndex,
        currentChapter: s.currentChapter,
        libraryItemId: s.libraryItemId,
        mediaItemId: s.mediaItemId,
        sleepTimer: s.sleepTimer,
        sleepTimeRemaining: s.sleepTimeRemaining,
      };
    },
    setState: (patch) => usePlayerStore.setState(patch as Partial<PlayerState>),
    getAudio,
    cumulativeTime,
    getBookConfig: (itemId: string) => Config.getBook(itemId),
      syncProgress: (libId, ct, dur) => {
        import('../api/audiobookshelf').then(({ syncProgress }) => syncProgress(libId, ct, dur));
      },
      playNextChapter: () => usePlayerStore.getState().playNextChapter(),
      log: playerLog as (module: string, msg: string, data?: Record<string, unknown>) => void,
    warn: playerWarn as (module: string, msg: string, data?: Record<string, unknown>) => void,
  });
  initScheduler();
}
