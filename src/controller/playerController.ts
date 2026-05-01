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
 * │  ④ Timers          定时子系统（watchdog/sync）│
 * │  ⑤ ChapterLoad     章节加载流程              │
 * │  ⑥ Store           Zustand 状态 + 命令        │
 * └──────────────────────────────────────────────┘
 * 后台事件（visibility/pagehide/锁屏恢复）→ controller/background.ts
 *
 * 不负责：currentTime/duration（由 useAudioTime hook 直接读 audio 元素）
 */

import { create } from 'zustand';
import { ABSMediaItem } from '../types';
import { getAudioUrl, getProgress, syncProgress, syncProgressNow } from '../api/audiobookshelf';
import { useAppStore } from './appStore';
import { ABSProgress } from '../types';
import { AudioCache } from '../utils/audioCache';
import { Config } from '../utils/configManager';
import { playerLog, playerWarn } from '../utils/playerLogger';
import {
  initDeps as initBackground,
  initBackground as startBackgroundEvents,
  restoreGen,
} from '../controller/background';

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

/** 更新本地进度缓存（用于 UI 展示"继续收听"列表） */
function updateLocalProgress(libraryItemId: string, mediaItemId: string, currentTime: number, duration: number) {
  const appState = useAppStore.getState();
  const existing = appState.mediaProgress || [];
  const idx = existing.findIndex(p => p.libraryItemId === libraryItemId);
  const entry: ABSProgress = {
    id: '', userId: '', libraryItemId,
    episodeId: null, mediaItemId, mediaItemType: 'book',
    duration, progress: duration > 0 ? currentTime / duration : 0,
    currentTime, isFinished: false, hideFromContinueListening: false,
    lastUpdate: Date.now(), startedAt: Date.now(), finishedAt: null,
  };
  if (idx >= 0) {
    const updated = [...existing];
    updated[idx] = { ...updated[idx], currentTime, progress: duration > 0 ? currentTime / duration : 0, lastUpdate: Date.now() };
    useAppStore.getState().setMediaProgress(updated);
  } else {
    useAppStore.getState().setMediaProgress([...existing, entry]);
  }
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
// ④ Timers（定时子系统）
// ════════════════════════════════════════

// ---- 4a. 章节看门狗 ----

let wdInterval: ReturnType<typeof setInterval> | null = null;

export function startWatchdog() {
  stopWatchdog();
  const audio = getAudio();

  const s = usePlayerStore.getState();
  const ch = s.chapters[s.currentChapterIndex];
  playerLog('watchdog', `启动 · 第${s.currentChapterIndex + 1}/${s.chapters.length}章 · ${ch?.title || '?'} · 频率1s`);

  function check() {
    const s = usePlayerStore.getState();
    if (!s.currentItem || !s.currentChapter) return;

    const ct = audio.currentTime;
    const cfg = Config.getBook(s.currentItem.id);
    const end = s.currentChapter.duration;

    // 片头跳过
    if (cfg.autoSkipIntro && cfg.introSeconds > 0 && ct < cfg.introSeconds) {
      playerLog('chapter', `片头跳过 · ${ct.toFixed(1)}s → ${cfg.introSeconds}s`);
      audio.currentTime = cfg.introSeconds;
      return;
    }

    // 片尾切章
    if (cfg.autoSkipOutro && cfg.outroSeconds > 0 && ct >= end - cfg.outroSeconds) {
      finishOrNext(audio);
      return;
    }

    // 自然结束
    if (ct >= end) finishOrNext(audio);
  }

  wdInterval = setInterval(() => { if (!audio.paused) check(); }, 1000);
  check(); // 立即检查一次
  audio.onended = () => finishOrNext(audio);
}

function stopWatchdog() {
  if (wdInterval) { clearInterval(wdInterval); wdInterval = null; playerLog('watchdog', '关闭'); }
  if (audioEl) audioEl.onended = null;
}

function finishOrNext(audio: HTMLAudioElement) {
  const { currentChapterIndex: idx, chapters } = usePlayerStore.getState();
  if (idx < chapters.length - 1) {
    playerLog('chapter', `章节切换 · ${idx + 1} → ${idx + 2}`);
    usePlayerStore.getState().playNextChapter();
  } else {
    playerLog('lifecycle', '全书播放完毕');
    audio.pause();
    usePlayerStore.setState({ isPlaying: false });
  }
}

// ---- 4b. 进度同步 ----

let syncIntervalId: ReturnType<typeof setInterval> | null = null;

function startProgressSync(libId: string, mediaId: string, initialCumulative: number) {
  const audio = getAudio();

  const s = usePlayerStore.getState();
  const dur = s.chapters?.[s.currentChapterIndex]?.duration || 0;
  syncProgress(libId, initialCumulative, dur);
  updateLocalProgress(libId, mediaId, initialCumulative, dur);

  syncIntervalId = setInterval(() => {
    const st = usePlayerStore.getState();
    if (!st.libraryItemId || !st.isPlaying) return;
    const ct = cumulativeTime(st.chapters, st.currentChapterIndex, audio.currentTime);
    syncProgress(st.libraryItemId, ct, st.chapters[st.currentChapterIndex]?.duration || 0);
    updateLocalProgress(st.libraryItemId, st.mediaItemId || '', ct, st.chapters[st.currentChapterIndex]?.duration || 0);
  }, 15000);

  playerLog('sync', `启动 · 频率15s · 累计${Math.round(initialCumulative)}s`);
}

function stopProgressSync() {
  if (syncIntervalId) { clearInterval(syncIntervalId); syncIntervalId = null; playerLog('sync', '关闭'); }
}

// ---- 4c. 睡眠定时器 ----

let sleepTimerId: ReturnType<typeof setInterval> | null = null;

function startSleepCountdown() {
  stopSleepCountdown();
  const audio = getAudio();
  const s = usePlayerStore.getState();
  if (s.sleepTimer) playerLog('sleep', `启动 · ${s.sleepTimer}min(${formatTime(s.sleepTimer * 60)})`);

  sleepTimerId = setInterval(() => {
    const s = usePlayerStore.getState();
    if (!s.isPlaying) return;
    if (s.sleepTimeRemaining !== null) {
      const remaining = s.sleepTimeRemaining - 1;
      if (remaining <= 0) {
        audio.pause();
        playerLog('sleep', '睡眠定时到 → 暂停');
        usePlayerStore.setState({ isPlaying: false, sleepTimer: null, sleepTimeRemaining: null });
        clearInterval(sleepTimerId!);
        sleepTimerId = null;
      } else {
        usePlayerStore.setState({ sleepTimeRemaining: remaining });
      }
    }
  }, 1000);
}

function stopSleepCountdown() {
  if (sleepTimerId) { clearInterval(sleepTimerId); sleepTimerId = null; playerLog('sleep', '关闭'); }
}

/** 秒数 → mm:ss */
function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---- 定时任务清理（不含常驻后台事件）----

function cleanupAll() {
  const hadAny = wdInterval || syncIntervalId || sleepTimerId;
  stopWatchdog();
  stopProgressSync();
  stopSleepCountdown();
  if (hadAny) playerLog('lifecycle', '全部定时任务已关闭');
}

// ════════════════════════════════════════
// ⑤ Chapter Loading
// ════════════════════════════════════════

async function loadChapter(index: number): Promise<boolean> {
  const s = usePlayerStore.getState();
  const chapter = s.chapters[index];
  if (!chapter || !s.currentItem) return false;

  const audio = getAudio();
  const rate = s.playbackRate;

  playerLog('chapter', `加载章节 ${index + 1}/${s.chapters.length}`, { title: chapter.title });

  stopWatchdog();

  const url = getAudioUrl(s.currentItem.id, chapter.ino);
  const cachedUrl = await AudioCache.getInstance().getCached(url).catch(() => url);
  if (cachedUrl !== url) playerLog('cache', `缓存命中 · 第${index + 1}章`);

  audio.src = cachedUrl;

  const allUrls = s.chapters.map(ch => getAudioUrl(s.currentItem!.id, ch.ino));
  AudioCache.getInstance().prefetchAhead(allUrls, index, 3);

  if (rate !== 1) audio.playbackRate = rate;
  audio.volume = s.volume;

  const onError = () => {
    playerWarn('lifecycle', `章节加载失败 · 第${index + 1}章`, { error: audio.error?.message || 'unknown' });
  };
  audio.addEventListener('error', onError);

  audio.play().catch(() => { usePlayerStore.setState({ isPlaying: false }); });

  const TIMEOUT = 15000;
  const t0 = performance.now();
  let done = false;

  const pollReady = () => {
    if (done) return;
    if (audio.readyState >= 3) {
      done = true;
      audio.removeEventListener('error', onError);
      if (audio.playbackRate !== rate) audio.playbackRate = rate;
      usePlayerStore.setState({ isPlaying: !audio.paused });
      startWatchdog();
    } else if (performance.now() - t0 > TIMEOUT) {
      done = true;
      audio.removeEventListener('error', onError);
      playerWarn('chapter', `章节加载超时 · 第${index + 1}章 · readyState=${audio.readyState}`);
      startWatchdog();
    } else {
      requestAnimationFrame(pollReady);
    }
  };
  requestAnimationFrame(pollReady);
  return true;
}

// ════════════════════════════════════════
// ⑥ Store（Zustand）
// ════════════════════════════════════════

export const usePlayerStore = create<PlayerState>((set, get) => ({
  // 初始化后台模块 + 注册常驻事件监听
  ...(() => {
    initBackground({
      cumulativeTime,
      startWatchdog,
      getStore: () => ({ getState: usePlayerStore.getState, setState: usePlayerStore.setState }),
    });
    startBackgroundEvents();
    return {};
  })(),

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
    const audio = getAudio();
    cleanupAll();
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
    let cumulative = 0;

    const progress = await getProgress(libraryItemId);
    cumulative = progress.currentTime;
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

    audio.play().then(() => {
      if (offset > 0) {
        audio.currentTime = Math.min(offset, audio.duration || targetChapter.duration);
      }
      set({ isPlaying: true });
    }).catch((err) => {
      playerWarn('lifecycle', '播放启动失败', { error: err.message });
      set({ isPlaying: false });
    });

    // 就绪后启动全部子系统
    const READY_TIMEOUT = 15000;
    const t0 = performance.now();
    let settled = false;

    const waitAndStart = () => {
      if (settled) return;
      if (audio.readyState >= 3) {
        settled = true;
        if (offset > 0) audio.currentTime = Math.min(offset, audio.duration || targetChapter.duration);
        startWatchdog();
        startProgressSync(libraryItemId, mediaItemId, cumulative);
        startSleepCountdown();
        playerLog('lifecycle', `定时子系统已启动 · readyState=${audio.readyState} · offset=${Math.round(offset)}s`);
      } else if (performance.now() - t0 > READY_TIMEOUT) {
        settled = true;
        if (offset > 0 && audio.duration) audio.currentTime = Math.min(offset, audio.duration);
        playerWarn('lifecycle', `加载超时，仍启动子系统 · readyState=${audio.readyState}`);
        startWatchdog();
        startProgressSync(libraryItemId, mediaItemId, cumulative);
        startSleepCountdown();
      } else {
        requestAnimationFrame(waitAndStart);
      }
    };
    requestAnimationFrame(waitAndStart);
  },

  // ── 播放/暂停/停止 ──

  pause: () => {
    restoreGen++;
    getAudio().pause();
    cleanupAll();          // 播放停止 → 关闭所有定时检查任务
    playerLog('lifecycle', '暂停');
    set({ isPlaying: false });
  },

  resume: () => {
    restoreGen++;
    getAudio().play().then(() => { set({ isPlaying: true }); }).catch(() => {});
    playerLog('lifecycle', '恢复播放');
  },

  stop: () => {
    restoreGen++;
    const audio = getAudio();
    audio.pause();
    audio.src = '';
    cleanupAll();
    playerLog('lifecycle', '完全停止');
    set({
      currentItem: null, isPlaying: false,
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
    await loadChapter(next);
    set({ currentChapterIndex: next, currentChapter: chapters[next], isPlaying: true });
  },

  playPreviousChapter: async () => {
    const { currentChapterIndex: idx, chapters } = get();
    const ct = getAudio().currentTime;
    if (ct > 3) {
      playerLog('chapter', `重播当前章 · 第${idx + 1}章开头`);
      await loadChapter(idx);
      getAudio().currentTime = 0;
    } else if (idx > 0) {
      const prev = idx - 1;
      playerLog('chapter', `上一章 · ${idx + 1} → ${prev + 1}`);
      await loadChapter(prev);
      set({ currentChapterIndex: prev, currentChapter: chapters[prev], isPlaying: true });
    }
  },

  switchToChapter: async (index: number) => {
    const { chapters } = get();
    if (index < 0 || index >= chapters.length) return;
    playerLog('chapter', `切换章节 → 第${index + 1}章 · ${chapters[index].title}`);
    await loadChapter(index);
    set({ currentChapterIndex: index, currentChapter: chapters[index], isPlaying: true });
  },

  // ── 睡眠定时器 ──

  setSleepTimer: (m: number | null) => {
    if (m !== null) playerLog('sleep', `设定睡眠定时 · ${m}分钟`);
    set({ sleepTimer: m, sleepTimeRemaining: m ? m * 60 : null });
  },
  clearSleepTimer: () => {
    playerLog('sleep', '清除睡眠定时器');
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
