/**
 * PlayerService — 播放器后端单例
 *
 * 职责：
 * 1. 管理 HTMLAudioElement（唯一音频实例）
 * 2. 管理结构状态（当前书籍、章节、播放/暂停、音量等）
 * 3. Session 持久化（锁屏/后台恢复）
 * 4. 进度同步到服务端
 * 5. 后台保护（visibilitychange / pagehide）
 *
 * 不负责：
 * - currentTime / duration（由前端 useAudioTime() 直接从 audio 读取）
 */

import { create } from 'zustand';
import { ABSMediaItem } from '../types';
import { getAudioUrl, getProgress, syncProgress, syncProgressNow } from '../api/audiobookshelf';
import { useAppStore } from './appStore';
import { ABSProgress } from '../types';
import { AudioCache } from '../utils/audioCache';
import { Config } from '../utils/configManager';
import { playerLog, playerWarn } from '../utils/playerLogger';

// ========== Session 持久化 ==========
const SESSION_KEY = 'abs-player-session';

interface PlayerSession {
  libraryItemId: string;
  mediaItemId: string;
  currentChapterIndex: number;
  chapterIno: string;
  chapterDuration: number;
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  volume: number;
  timestamp: number;
}

function saveSession(state: PlayerState) {
  try {
    const audio = getAudio();
    const actualTime = audio.src ? (audio.currentTime || 0) : 0;
    const s: PlayerSession = {
      libraryItemId: state.libraryItemId || '',
      mediaItemId: state.mediaItemId || '',
      currentChapterIndex: state.currentChapterIndex ?? 0,
      chapterIno: state.chapters?.[state.currentChapterIndex ?? 0]?.ino || '',
      chapterDuration: state.chapters?.[state.currentChapterIndex ?? 0]?.duration || 0,
      currentTime: actualTime,
      isPlaying: !!state.isPlaying,
      playbackRate: state.playbackRate ?? 1,
      volume: state.volume ?? 1,
      timestamp: Date.now(),
    };
    playerLog('session', '保存 session', { chapter: s.currentChapterIndex + 1, currentTime: Math.round(actualTime * 100) / 100 + 's', isPlaying: s.isPlaying, audioSrc: !!audio.src, audioPaused: audio.paused });
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {}
}

export function getSession(): PlayerSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s: PlayerSession = JSON.parse(raw);
    if (Date.now() - s.timestamp > 24 * 3600 * 1000) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch { return null; }
}

export function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}

// ========== 类型定义 ==========

export interface PlayerChapter {
  id: number; title: string; start: number; end: number;
  index: number; ino: string; duration: number;
}

// 结构状态（不含实时时间，时间由 useAudioTime 从 audio 直接读取）
export interface PlayerState {
  // 结构数据
  currentItem: ABSMediaItem | null;
  chapters: PlayerChapter[];
  currentChapterIndex: number;
  currentChapter: PlayerChapter | null;   // derived: chapters[currentChapterIndex]
  // 播放控制
  isPlaying: boolean;
  volume: number;
  playbackRate: number;
  // 睡眠定时器
  sleepTimer: number | null;
  sleepTimeRemaining: number | null;
  // UI 可见性
  isMiniPlayerVisible: boolean;
  isFullPlayerVisible: boolean;
  // 服务端同步标识
  libraryItemId: string | null;
  mediaItemId: string | null;

  // 命令方法
  play: (item: ABSMediaItem) => void;
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

  // 获取当前 audio 实例（给 useAudioTime 用）
  _getAudio: () => HTMLAudioElement;
}

// ========== Audio 单例管理 ==========

let audioEl: HTMLAudioElement | null = null;
let syncInterval: ReturnType<typeof setInterval> | null = null;
let sleepIntervalId: ReturnType<typeof setInterval> | null = null;
let cleanupFns: (() => void)[] = [];

// 恢复令牌：防止锁屏恢复的异步 play() 覆盖用户操作
// 每次 visibilitychange 尝试自动恢复时记录当前代数
// 用户主动操作（pause/resume/stop）时递增代数，使过期回调失效
let restoreGen = 0;

// Watchdog 监听器引用（用于切章时精确清理，不碰 sync/sleep/visibility）
let wdOnTimeUpdate: (() => void) | null = null;

function getAudio(): HTMLAudioElement {
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

function cleanupAll() {
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
  if (sleepIntervalId) { clearInterval(sleepIntervalId); sleepIntervalId = null; }
  wdOnTimeUpdate = null;
}

/** 仅清理 watchdog 的 timeupdate + onended（切章时调用，保留 sync/sleep/visibility） */
function cleanupWatchdog() {
  const audio = audioEl;
  if (audio && wdOnTimeUpdate) {
    audio.removeEventListener('timeupdate', wdOnTimeUpdate);
    audio.onended = null;
    // 从 cleanupFns 中移除对应的 watchdog 清理函数（最后两个）
    cleanupFns = cleanupFns.slice(0, -2);
  }
  wdOnTimeUpdate = null;
}

function pushCleanup(fn: () => void) {
  cleanupFns.push(fn);
}

// ========== 内部逻辑 ==========

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

// 累计时间计算（服务端上报用）
function getCumulativeTime(chapters: PlayerChapter[], chapterIdx: number, time: number): number {
  let cum = 0;
  for (let i = 0; i < chapterIdx; i++) cum += chapters[i]?.duration || 0;
  return cum + time;
}

// 更新本地 mediaProgress（"继续收听"立即可见）
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

/**
 * 加载并切换到指定章节（内部使用，不暴露给组件）
 * 组件应通过 switchToChapter(index) 调用
 */
async function loadChapterInternal(index: number, state: PlayerState): Promise<boolean> {
  const chapter = state.chapters[index];
  if (!chapter || !state.currentItem) return false;
  const audio = getAudio();
  const rate = state.playbackRate;

  playerLog('chapter', `加载章节 ${index + 1}/${state.chapters.length}`, { title: chapter.title });

  cleanupWatchdog(); // ← 清理旧 watchdog（防止监听器叠加）

  const url = getAudioUrl(state.currentItem.id, chapter.ino);
  const cachedUrl = await AudioCache.getInstance().getCached(url).catch(() => url);
  if (cachedUrl !== url) {
    playerLog('cache', `缓存命中 · 第${index + 1}章`);
  }
  audio.src = cachedUrl;

  // 预取后续章节
  const chapterUrls = state.chapters.map(ch => getAudioUrl(state.currentItem!.id, ch.ino));
  AudioCache.getInstance().prefetchAhead(chapterUrls, index, 3);
  playerLog('cache', `预取章节 ${index + 2}~${Math.min(index + 3, state.chapters.length) + 1}`);

  if (rate !== 1) audio.playbackRate = rate;
  audio.volume = state.volume;

  // 错误处理：音频加载失败时记录日志并尝试继续
  const onError = () => {
    playerWarn('play', `章节音频加载失败 · 第${index + 1}章`, { error: audio.error?.message || 'unknown' });
  };
  audio.addEventListener('error', onError);

  audio.play().catch(() => {
    usePlayerStore.setState({ isPlaying: false });
  });

  // 等待就绪后启动看门狗（带超时保护，防止死循环）
  const TIMEOUT_MS = 15000; // 15 秒超时
  const startTime = performance.now();
  let settled = false;

  const checkLoaded = () => {
    if (settled) return;
    if (audio.readyState >= 3) {
      settled = true;
      audio.removeEventListener('error', onError);
      if (audio.playbackRate !== rate) audio.playbackRate = rate;
      usePlayerStore.setState({ isPlaying: !audio.paused });
      setupChapterWatchdog();
    } else if (performance.now() - startTime > TIMEOUT_MS) {
      settled = true;
      audio.removeEventListener('error', onError);
      playerWarn('chapter', `章节加载超时 · 第${index + 1}章 · readyState=${audio.readyState}`, {
        timeout: TIMEOUT_MS + 'ms',
        networkState: audio.networkState,
        error: audio.error?.message || 'none',
      });
      // 超时也尝试启动 watchdog（部分数据可能已可播放）
      setupChapterWatchdog();
    } else {
      requestAnimationFrame(checkLoaded);
    }
  };
  requestAnimationFrame(checkLoaded);
  return true;
}

/**
 * 章节看门狗：处理片头跳过、片尾自动切章、自然结束
 * 只监听事件驱动逻辑，不写 currentTime 到 store
 */
function setupChapterWatchdog() {
  const audio = getAudio();
  cleanupWatchdog(); // ← 先清理旧的 watchdog（防止切章时监听器叠加）

  const onTimeUpdate = () => {
    if (audio.paused) return;
    const curState = usePlayerStore.getState();
    if (!curState.currentItem || !curState.currentChapter) return;
    const ct = audio.currentTime;
    const settings = Config.getBook(curState.currentItem.id);
    const chapterEnd = curState.currentChapter.duration;

    // 片头自动跳过
    if (settings.autoSkipIntro && settings.introSeconds > 0 && ct < settings.introSeconds && chapterEnd > settings.introSeconds) {
      playerLog('chapter', `⚠️ Watchdog 片头跳过触发 · ${ct.toFixed(2)}s → ${settings.introSeconds}s`, { chapter: curState.currentChapterIndex + 1, chapterEnd });
      audio.currentTime = settings.introSeconds;
      return;
    }

    // 片尾自动切章
    if (settings.autoSkipOutro && settings.outroSeconds > 0 && ct >= chapterEnd - settings.outroSeconds && ct < chapterEnd) {
      const { currentChapterIndex: idx, chapters: chs } = usePlayerStore.getState();
      if (idx < chs.length - 1) {
        playerLog('chapter', `片尾自动切章 · 第${idx + 1}章 → 第${idx + 2}章`);
        usePlayerStore.getState().playNextChapter();
      } else {
        audio.pause();
        usePlayerStore.setState({ isPlaying: false });
        saveSession(usePlayerStore.getState());
      }
      return;
    }

    // 自然结束切章
    if (ct >= chapterEnd) {
      const { currentChapterIndex: idx, chapters: chs } = usePlayerStore.getState();
      if (idx < chs.length - 1) {
        playerLog('chapter', `章节结束 · 第${idx + 1}章 → 第${idx + 2}章`);
        usePlayerStore.getState().playNextChapter();
      } else {
        playerLog('play', '全书播放完毕');
        audio.pause();
        usePlayerStore.setState({ isPlaying: false });
        saveSession(usePlayerStore.getState());
      }
    }
  };

  audio.addEventListener('timeupdate', onTimeUpdate);
  wdOnTimeUpdate = onTimeUpdate; // 记录引用，供 cleanupWatchdog 使用
  onTimeUpdate(); // 立即检查一次

  // onended 兜底
  audio.onended = () => {
    const { currentChapterIndex: idx, chapters: chs } = usePlayerStore.getState();
    if (idx < chs.length - 1) usePlayerStore.getState().playNextChapter();
    else usePlayerStore.setState({ isPlaying: false });
  };

  pushCleanup(() => {
    audio.removeEventListener('timeupdate', onTimeUpdate);
    audio.onended = null;
  });
}

// 启动进度同步和睡眠定时器
function startSyncAndSleep(libraryItemId: string, mediaItemId: string, savedCumulativeTime: number) {
  const audio = getAudio();

  // 定时同步进度（15s 一次）
  syncInterval = setInterval(() => {
    const state = usePlayerStore.getState();
    if (state.libraryItemId && state.isPlaying) {
      const cumTime = getCumulativeTime(state.chapters, state.currentChapterIndex, audio.currentTime);
      syncProgress(state.libraryItemId, cumTime, state.chapters[state.currentChapterIndex]?.duration || 0);
      updateLocalProgress(state.libraryItemId, state.mediaItemId || '', cumTime, state.chapters[state.currentChapterIndex]?.duration || 0);
    }
  }, 15000);

  playerLog('sync', `进度同步启动 · 累计${Math.round(savedCumulativeTime)}s`);

  // 首次立即同步
  const dur = usePlayerStore.getState().chapters?.[usePlayerStore.getState().currentChapterIndex]?.duration || 0;
  syncProgress(libraryItemId, savedCumulativeTime, dur);
  updateLocalProgress(libraryItemId, mediaItemId, savedCumulativeTime, dur);

  // 睡眠模式
  sleepIntervalId = setInterval(() => {
    const state = usePlayerStore.getState();
    if (!state.isPlaying) return;
    if (state.sleepTimeRemaining !== null) {
      const remaining = state.sleepTimeRemaining - 1;
      if (remaining <= 0) {
        audio.pause();
        playerLog('sleep', '睡眠定时到 → 暂停');
        usePlayerStore.setState({ isPlaying: false, sleepTimer: null, sleepTimeRemaining: null });
        clearInterval(sleepIntervalId!); sleepIntervalId = null;
      } else {
        usePlayerStore.setState({ sleepTimeRemaining: remaining });
      }
    }
  }, 1000);

  // 页面关闭前保存 session + 同步
  const doFinalSync = () => {
    const state = usePlayerStore.getState();
    if (state.libraryItemId) {
      const ct = getCumulativeTime(state.chapters, state.currentChapterIndex, audio.currentTime);
      syncProgressNow(state.libraryItemId, ct, state.chapters[state.currentChapterIndex]?.duration || 0);
      saveSession(state);
      playerLog('background', `页面关闭 → 最终同步 + 保存 session · 累计${Math.round(ct)}s`);
    }
  };

  window.addEventListener('beforeunload', doFinalSync);
  window.addEventListener('pagehide', doFinalSync);

  // visibilitychange：后台保存 + 前台恢复同步
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      // 后台：保存精确位置 + 立即同步（后台时 setInterval 会冻结）
      saveSession(usePlayerStore.getState());
      const st = usePlayerStore.getState();
      if (st.libraryItemId) {
        const ct = getCumulativeTime(st.chapters, st.currentChapterIndex, audio.currentTime);
        syncProgressNow(st.libraryItemId, ct, st.chapters[st.currentChapterIndex]?.duration || 0);
        playerLog('background', `页面隐藏 → 保存 session + 最终同步 · 累计${Math.round(ct)}s`);
      }
    } else if (document.visibilityState === 'visible') {
      // 前台恢复：根据 session 记录的状态决定是否恢复播放
      // iOS 锁屏/后台会强制暂停 audio 元素，不能仅靠 audio.paused 判断
      if (audio.src) {
        const session = getSession();
        const wasPlayingBeforeHide = session?.isPlaying === true;
        const currentTimeBeforePlay = audio.currentTime;

        playerLog('background', `页面可见 · 音频状态检查`, {
          audioSrc: !!audio.src,
          audioPaused: audio.paused,
          currentTime: Math.round(currentTimeBeforePlay * 100) / 100 + 's',
          wasPlayingBeforeHide,
          sessionChapter: session ? session.currentChapterIndex + 1 : 'N/A',
          sessionTime: session ? Math.round(session.currentTime * 100) / 100 + 's' : 'N/A',
        });

        if (wasPlayingBeforeHide && audio.paused) {
          // 之前在播放但被系统暂停了 → 尝试自动恢复（带令牌校验防竞态）
          const token = ++restoreGen;
          playerLog('background', `尝试恢复播放（audio被系统暂停）· token=${token}`, { currentTime: Math.round(currentTimeBeforePlay * 100) / 100 + 's' });
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.then(() => {
              // 校验令牌：如果用户在此期间操作了播放控制，token 会不匹配，跳过
              if (token !== restoreGen) {
                playerLog('background', `恢复播放回调已过期 · token=${token} ≠ current=${restoreGen}，忽略`);
                return;
              }
              const ctAfter = audio.currentTime;
              playerLog('background', `播放已恢复 · token=${token}`, { currentTimeAfterPlay: Math.round(ctAfter * 100) / 100 + 's', timeChanged: Math.abs(ctAfter - currentTimeBeforePlay) > 0.5 ? `⚠️ 变化了 ${Math.round((ctAfter - currentTimeBeforePlay) * 100) / 100}s` : '无变化' });
              usePlayerStore.setState({ isPlaying: true });
            }).catch((err) => {
              if (token !== restoreGen) return;
              usePlayerStore.setState({ isPlaying: false });
              playerWarn('background', `恢复播放失败`, { error: (err as Error).message || 'unknown' });
            });
          } else {
            if (token !== restoreGen) return;
            usePlayerStore.setState({ isPlaying: true });
          }
        } else {
          // 未在播放或 audio 仍在正常播放（桌面浏览器等场景）
          usePlayerStore.setState({ isPlaying: !audio.paused });
          playerLog('background', `状态同步`, { reason: wasPlayingBeforeHide ? 'audio未暂停（桌面？）' : '之前未在播放', audioPaused: audio.paused, currentTime: Math.round(audio.currentTime * 100) / 100 + 's' });
        }
      }
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  pushCleanup(() => {
    window.removeEventListener('beforeunload', doFinalSync);
    window.removeEventListener('pagehide', doFinalSync);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });
}

// ========== Store 定义 ==========

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

  // ====== 播放控制 ======

  play: async (item) => {
    const audio = getAudio();
    cleanupAll();
    audio.pause();
    audio.src = '';

    playerLog('play', '开始播放', { title: item.media?.metadata?.title || item.id, itemId: item.id });

    const chapters = createChapters(item);
    if (chapters.length === 0) { console.warn('No chapters'); return; }

    const libraryItemId = item.id;
    const mediaItemId = item.media?.id || '';

    // ====== 进度恢复：session（精确）→ 服务端（兜底）======
    const session = getSession();
    let targetChapterIndex = 0;
    let chapterOffset = 0;
    let savedCumulativeTime = 0;

    if (session && session.libraryItemId === libraryItemId) {
      targetChapterIndex = Math.min(session.currentChapterIndex, chapters.length - 1);
      chapterOffset = session.currentTime || 0;
      savedCumulativeTime = getCumulativeFromChapters(chapters, targetChapterIndex, chapterOffset);
      clearSession();
      playerLog('session', 'Session 恢复', { chapter: targetChapterIndex + 1, offset: Math.round(chapterOffset) + 's', cumulative: Math.round(savedCumulativeTime) + 's' });
    } else {
      const serverProgress = await getProgress(libraryItemId);
      savedCumulativeTime = serverProgress.currentTime;
      if (savedCumulativeTime > 0) {
        let cumulative = 0;
        for (let i = 0; i < chapters.length; i++) {
          if (cumulative + chapters[i].duration > savedCumulativeTime) {
            targetChapterIndex = i;
            chapterOffset = savedCumulativeTime - cumulative;
            break;
          }
          cumulative += chapters[i].duration;
        }
        if (targetChapterIndex === 0 && savedCumulativeTime >= cumulative && chapters.length > 0) {
          targetChapterIndex = chapters.length - 1;
          chapterOffset = chapters[targetChapterIndex].duration;
        }
        playerLog('sync', '服务端进度恢复', { chapter: targetChapterIndex + 1, offset: Math.round(chapterOffset) + 's', cumulative: Math.round(serverProgress.currentTime) + 's' });
      }
      clearSession();
    }

    const targetChapter = chapters[targetChapterIndex];

    set({
      currentItem: item, chapters, currentChapterIndex: targetChapterIndex,
      currentChapter: targetChapter,
      isMiniPlayerVisible: true, isFullPlayerVisible: false,
      libraryItemId, mediaItemId,
    });

    // 加载音频（先设置 onerror，再设置 src）
    const url = getAudioUrl(item.id, targetChapter.ino);
    const cachedUrl = await AudioCache.getInstance().getCached(url).catch(() => url);

    audio.onerror = () => {
      console.warn('Audio error:', audio.error?.message);
      playerWarn('play', '音频加载错误', { error: audio.error?.message || 'unknown' });
      set({ isPlaying: false });
    };
    audio.src = cachedUrl;

    const chapterUrls = chapters.map(ch => getAudioUrl(item.id, ch.ino));
    AudioCache.getInstance().prefetchAhead(chapterUrls, targetChapterIndex, 3);

    audio.volume = get().volume;
    audio.playbackRate = get().playbackRate;

    audio.play().then(() => {
      const ctBeforeSeek = audio.currentTime;
      if (chapterOffset > 0) {
        audio.currentTime = Math.min(chapterOffset, audio.duration || targetChapter.duration);
      }
      playerLog('play', `播放已启动 · 第${targetChapterIndex + 1}/${chapters.length}章${chapterOffset ? ` · ${Math.round(chapterOffset)}s处恢复` : '（从头）'}`, {
        ctBeforeSeek: Math.round(ctBeforeSeek * 100) / 100 + 's',
        ctAfterSeek: Math.round(audio.currentTime * 100) / 100 + 's',
        chapterOffset: Math.round(chapterOffset * 100) / 100 + 's',
        source: session && session.libraryItemId === libraryItemId ? 'session' : 'server',
      });
      set({ isPlaying: true });
      setupChapterWatchdog();
      startSyncAndSleep(libraryItemId, mediaItemId, savedCumulativeTime);
    }).catch((err) => {
      console.warn('Audio play rejected:', err.message);
      playerWarn('play', '播放启动失败', { error: err.message });
      set({ isPlaying: false });
    });
  },

  pause: () => {
    restoreGen++; // 失效待处理的锁屏恢复回调
    getAudio().pause();
    playerLog('play', '暂停');
    set({ isPlaying: false });
  },

  resume: () => {
    restoreGen++; // 失效待处理的锁屏恢复回调
    getAudio().play().then(() => { set({ isPlaying: true }); }).catch(() => {});
    playerLog('play', '恢复播放');
  },

  stop: () => {
    restoreGen++; // 失效待处理的锁屏恢复回调
    const audio = getAudio();
    audio.pause(); audio.src = '';
    cleanupAll();
    clearSession();
    playerLog('play', '完全停止');
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
    const volClamped = Math.max(0, Math.min(1, vol));
    getAudio().volume = volClamped;
    Config.updatePlayer({ volume: volClamped });
    set({ volume: volClamped });
  },

  setPlaybackRate: (rate: number) => {
    getAudio().playbackRate = rate;
    Config.updatePlayer({ playbackRate: rate });
    set({ playbackRate: rate });
  },

  skipForward: (seconds = 30) => { const a = getAudio(); a.currentTime = Math.min(a.currentTime + seconds, a.duration); },
  skipBackward: (seconds = 10) => { const a = getAudio(); a.currentTime = Math.max(a.currentTime - seconds, 0); },

  // ====== 章节切换 ======

  playNextChapter: async () => {
    const { currentChapterIndex: idx, chapters } = get();
    if (idx >= chapters.length - 1) return;
    const nextIdx = idx + 1;
    playerLog('chapter', `下一章 · ${idx + 1} → ${nextIdx + 1}`);
    await loadChapterInternal(nextIdx, get());
    set({ currentChapterIndex: nextIdx, currentChapter: chapters[nextIdx], isPlaying: true });
  },

  playPreviousChapter: async () => {
    const { currentChapterIndex: idx, chapters } = get();
    const ct = getAudio().currentTime;
    if (ct > 3) {
      playerLog('chapter', `重播当前章 · 第${idx + 1}章开头`);
      await loadChapterInternal(idx, get());
      getAudio().currentTime = 0;
    } else if (idx > 0) {
      const prevIdx = idx - 1;
      playerLog('chapter', `上一章 · ${idx + 1} → ${prevIdx + 1}`);
      await loadChapterInternal(prevIdx, get());
      set({ currentChapterIndex: prevIdx, currentChapter: chapters[prevIdx], isPlaying: true });
    }
  },

  switchToChapter: async (index: number) => {
    const { chapters } = get();
    if (index < 0 || index >= chapters.length) return;
    playerLog('chapter', `切换章节 → 第${index + 1}章 · ${chapters[index].title}`);
    await loadChapterInternal(index, get());
    set({ currentChapterIndex: index, currentChapter: chapters[index], isPlaying: true });
  },

  // ====== 睡眠定时器 ======

  setSleepTimer: (m: number | null) => {
    if (m !== null) playerLog('sleep', `设定睡眠定时器 · ${m}分钟`);
    set({ sleepTimer: m, sleepTimeRemaining: m ? m * 60 : null });
  },
  clearSleepTimer: () => {
    playerLog('sleep', '清除睡眠定时器');
    set({ sleepTimer: null, sleepTimeRemaining: null });
  },

  // ====== UI 可见性 ======

  showMiniPlayer: () => set({ isMiniPlayerVisible: true }),
  hideMiniPlayer: () => set({ isMiniPlayerVisible: false }),
  showFullPlayer: () => set({ isFullPlayerVisible: true, isMiniPlayerVisible: false }),
  hideFullPlayer: () => set({ isFullPlayerVisible: false }),

  // ====== 片头片尾 ======

  skipIntro: () => {
    const { currentItem } = get();
    if (!currentItem) return;
    const settings = Config.getBook(currentItem.id);
    getAudio().currentTime = Math.min(settings.introSeconds || 15, getAudio().duration);
  },

  skipOutro: () => { get().playNextChapter(); },
}));

// 辅助函数：静态累计时间计算
function getCumulativeFromChapters(chapters: PlayerChapter[], chapterIdx: number, time: number): number {
  let cum = 0;
  for (let i = 0; i < chapterIdx; i++) cum += chapters[i]?.duration || 0;
  return cum + time;
}
