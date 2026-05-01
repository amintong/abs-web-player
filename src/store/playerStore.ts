import { create } from 'zustand';
import { ABSMediaItem } from '../types';
import { getAudioUrl, getProgress, syncProgress, syncProgressNow } from '../api/audiobookshelf';
import { useAppStore } from './appStore';
import { ABSProgress } from '../types';
import { AudioCache } from '../utils/audioCache';
import { Config } from '../utils/configManager';

export interface PlayerChapter {
  id: number; title: string; start: number; end: number;
  index: number; ino: string; duration: number;
}

interface PlayerState {
  isPlaying: boolean;
  currentItem: ABSMediaItem | null;
  currentChapter: PlayerChapter | null;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  chapters: PlayerChapter[];
  currentChapterIndex: number;
  sleepTimer: number | null;
  sleepTimeRemaining: number | null;
  isMiniPlayerVisible: boolean;
  isFullPlayerVisible: boolean;
  // 进度同步
  libraryItemId: string | null;
  mediaItemId: string | null;

  play: (item: ABSMediaItem) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => void;
  skipForward: (seconds?: number) => void;
  skipBackward: (seconds?: number) => void;
  playNextChapter: () => void;
  playPreviousChapter: () => void;
  setSleepTimer: (minutes: number | null) => void;
  clearSleepTimer: () => void;
  showMiniPlayer: () => void;
  hideMiniPlayer: () => void;
  showFullPlayer: () => void;
  hideFullPlayer: () => void;
  skipIntro: () => void;
  skipOutro: () => void;
}

let audioEl: HTMLAudioElement | null = null;
let syncInterval: ReturnType<typeof setInterval> | null = null;

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

function startProgressLoop() {
  const audio = getAudio();

  const onTimeUpdate = () => {
    if (audio.paused) return;
    const state = usePlayerStore.getState();
    const ct = audio.currentTime;
    usePlayerStore.setState({ currentTime: ct });

    if (!state.currentItem || !state.currentChapter) return;
    const settings = Config.getBook(state.currentItem.id);
    const chapterEnd = state.currentChapter.duration;

    // 自动跳过片头
    if (settings.autoSkipIntro && settings.introSeconds > 0 && ct < settings.introSeconds && chapterEnd > settings.introSeconds) {
      audio.currentTime = settings.introSeconds;
      return;
    }

    // 自动跳过片尾 → 直接切到下一章（不是只设 currentTime）
    if (settings.autoSkipOutro && settings.outroSeconds > 0 && ct >= chapterEnd - settings.outroSeconds && ct < chapterEnd) {
      const { currentChapterIndex: idx, chapters: chs } = usePlayerStore.getState();
      if (idx < chs.length - 1) {
        usePlayerStore.getState().playNextChapter();
      } else {
        audio.pause();
        usePlayerStore.setState({ isPlaying: false, currentTime: chapterEnd });
      }
      return;
    }

    // 章节自然结束
    if (ct >= chapterEnd) {
      const { currentChapterIndex: idx, chapters: chs } = usePlayerStore.getState();
      if (idx < chs.length - 1) {
        usePlayerStore.getState().playNextChapter();
      } else {
        audio.pause();
        usePlayerStore.setState({ isPlaying: false, currentTime: chapterEnd });
      }
    }
  };

  audio.addEventListener('timeupdate', onTimeUpdate);

  // 注册后立即检查一次（防止 timeupdate 在监听器注册前已触发）
  onTimeUpdate();

  // onended 作为章节切换的后备检测
  audio.onended = () => {
    const state = usePlayerStore.getState();
    const { currentChapterIndex: idx, chapters: chs } = state;
    if (idx < chs.length - 1) {
      usePlayerStore.getState().playNextChapter();
    } else {
      usePlayerStore.setState({ isPlaying: false });
    }
  };

  // 睡眠模式用 setInterval 独立处理
  const sleepInterval = setInterval(() => {
    const state = usePlayerStore.getState();
    if (!state.isPlaying) return;
    if (state.sleepTimeRemaining !== null) {
      const remaining = state.sleepTimeRemaining - 1;
      if (remaining <= 0) {
        audio.pause();
        usePlayerStore.setState({ isPlaying: false, sleepTimer: null, sleepTimeRemaining: null });
        clearInterval(sleepInterval);
      } else {
        usePlayerStore.setState({ sleepTimeRemaining: remaining });
      }
    }
  }, 1000);

  (audio as any).__cleanupProgress = () => {
    audio.removeEventListener('timeupdate', onTimeUpdate);
    audio.onended = null;
    clearInterval(sleepInterval);
    delete (audio as any).__cleanupProgress;
  };
}

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

// 更新本地的 mediaProgress，使"继续收听"立即可见
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

export async function loadChapter(index: number) {
  const state = usePlayerStore.getState();
  const chapter = state.chapters[index];
  if (!chapter || !state.currentItem) return false;
  const audio = getAudio();
  if ((audio as any).__cleanupProgress) (audio as any).__cleanupProgress();
  const rate = state.playbackRate;

  const url = getAudioUrl(state.currentItem.id, chapter.ino);
  // 从缓存获取 blob URL，播放器只从缓存播放
  const cachedUrl = await AudioCache.getInstance().getCached(url).catch(() => url);
  audio.src = cachedUrl;

  // 预取后续 3 个章节
  const chapterUrls = state.chapters.map(ch => getAudioUrl(state.currentItem!.id, ch.ino));
  AudioCache.getInstance().prefetchAhead(chapterUrls, index, 3);

  // 设置 src 会重置 playbackRate，立即恢复
  if (rate !== 1) audio.playbackRate = rate;
  audio.volume = state.volume;
  audio.play().catch(() => {
    // iOS 锁屏时 audio.play() 可能被拒绝
    usePlayerStore.setState({ isPlaying: false });
  });

  const checkLoaded = () => {
    if (audio.readyState >= 3) {
      // 确保加载完成后速率正确（部分浏览器在 src 变更后重置）
      if (audio.playbackRate !== rate) audio.playbackRate = rate;
      usePlayerStore.setState({ duration: audio.duration, currentTime: audio.currentTime, isPlaying: !audio.paused });
      const settings = Config.getBook(state.currentItem!.id);
      if (settings.autoSkipIntro && settings.introSeconds > 0 && chapter.duration > settings.introSeconds) {
        audio.currentTime = settings.introSeconds;
      }
      startProgressLoop();
    } else {
      requestAnimationFrame(checkLoaded);
    }
  };
  requestAnimationFrame(checkLoaded);
  return true;
}

// 根据各章节时长和当前章内时间，计算累计播放秒数（给服务端上报用）
function getCumulativeTime(): number {
  const { chapters, currentChapterIndex, currentTime } = usePlayerStore.getState();
  let cum = 0;
  for (let i = 0; i < currentChapterIndex; i++) {
    cum += chapters[i]?.duration || 0;
  }
  return cum + currentTime;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  isPlaying: false,
  currentItem: null,
  currentChapter: null,
  currentTime: 0,
  duration: 0,
  volume: Config.getPlayer().volume,
  playbackRate: Config.getPlayer().playbackRate,
  chapters: [],
  currentChapterIndex: 0,
  sleepTimer: null,
  sleepTimeRemaining: null,
  isMiniPlayerVisible: false,
  isFullPlayerVisible: false,
  libraryItemId: null,
  mediaItemId: null,

  play: async (item) => {
    const audio = getAudio();
    // 清理旧的事件监听
    if ((audio as any).__cleanupProgress) (audio as any).__cleanupProgress();
    audio.pause();
    audio.src = '';

    // 清除旧的同步定时器
    if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
    window.removeEventListener('beforeunload', () => {});

    const chapters = createChapters(item);
    if (chapters.length === 0) { console.warn('No chapters'); return; }

    const libraryItemId = item.id;
    const mediaItemId = item.media?.id || '';

    // 从服务器获取保存的播放进度（累计时间）
    const { currentTime: savedCumulativeTime } = await getProgress(libraryItemId);

    // 根据累计时间确定正确的章节和章内偏移
    let targetChapterIndex = 0;
    let chapterOffset = 0;
    let cumulative = 0;

    if (savedCumulativeTime > 0) {
      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        if (cumulative + ch.duration > savedCumulativeTime) {
          targetChapterIndex = i;
          chapterOffset = savedCumulativeTime - cumulative;
          break;
        }
        cumulative += ch.duration;
      }
      // 如果累计时间超过了所有章节总长，定位到最后章节
      if (targetChapterIndex === 0 && savedCumulativeTime >= cumulative && chapters.length > 0) {
        targetChapterIndex = chapters.length - 1;
        chapterOffset = chapters[targetChapterIndex].duration;
      }
    }

    const targetChapter = chapters[targetChapterIndex];

    set({
      currentItem: item, chapters, currentChapterIndex: targetChapterIndex,
      currentChapter: targetChapter, duration: targetChapter.duration,
      isMiniPlayerVisible: true, isFullPlayerVisible: false,
      libraryItemId, mediaItemId,
    });

    const targetUrl = getAudioUrl(item.id, targetChapter.ino);
    // 从缓存获取 blob URL，播放器只从缓存播放
    const cachedUrl = await AudioCache.getInstance().getCached(targetUrl).catch(() => targetUrl);
    audio.src = cachedUrl;

    // 预取后续 3 个章节
    const chapterUrls = chapters.map(ch => getAudioUrl(item.id, ch.ino));
    AudioCache.getInstance().prefetchAhead(chapterUrls, targetChapterIndex, 3);

    audio.volume = get().volume;
    audio.playbackRate = get().playbackRate;

    audio.play().then(() => {
      if (chapterOffset > 0) {
        const seekTo = Math.min(chapterOffset, audio.duration || targetChapter.duration);
        audio.currentTime = seekTo;
      }
      set({ isPlaying: true, currentTime: chapterOffset, duration: audio.duration || targetChapter.duration });
      startProgressLoop();

      // 立即同步首次进度，让继续收听立即可见
      syncProgress(libraryItemId, savedCumulativeTime || 0, audio.duration || targetChapter.duration);
      updateLocalProgress(libraryItemId, mediaItemId, savedCumulativeTime || 0, audio.duration || targetChapter.duration);

      // 定时同步进度（上报累计时间）+ 更新本地继续收听
      syncInterval = setInterval(() => {
        const state = usePlayerStore.getState();
        if (state.libraryItemId && state.isPlaying) {
          const cumTime = getCumulativeTime();
          syncProgress(state.libraryItemId, cumTime, state.duration);
          updateLocalProgress(state.libraryItemId, state.mediaItemId || '', cumTime, state.duration);
        }
      }, 15000);

      // 页面关闭前强制同步
      const doFinalSync = () => {
        const state = usePlayerStore.getState();
        if (state.libraryItemId) {
          syncProgressNow(state.libraryItemId, getCumulativeTime(), state.duration);
        }
      };
      window.addEventListener('beforeunload', doFinalSync);
      audio.dataset.syncHandler = 'true';
    }).catch((err) => {
      console.warn('Audio play rejected:', err.message);
      set({ isPlaying: false });
    });

    audio.onerror = () => {
      console.warn('Audio error:', audio.error?.message);
      set({ isPlaying: false });
    };
  },

  pause: () => { getAudio().pause(); set({ isPlaying: false }); },
  resume: () => { getAudio().play().then(() => set({ isPlaying: true })).catch(() => {}); },

  stop: () => {
    const audio = getAudio();
    audio.pause(); audio.src = '';
    if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
    set({ currentItem: null, isPlaying: false, currentTime: 0, isMiniPlayerVisible: false, isFullPlayerVisible: false, libraryItemId: null, mediaItemId: null, chapters: [], currentChapter: null });
  },

  seek: (time: number) => { getAudio().currentTime = Math.max(0, Math.min(time, getAudio().duration || 0)); },
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

  playNextChapter: async () => {
    const { currentChapterIndex: idx, chapters } = get();
    if (idx >= chapters.length - 1) return;
    const nextIdx = idx + 1;
    await loadChapter(nextIdx);
    set({ currentChapterIndex: nextIdx, currentChapter: chapters[nextIdx], duration: chapters[nextIdx].duration, isPlaying: true });
  },

  playPreviousChapter: async () => {
    const { currentChapterIndex: idx, chapters, currentTime } = get();
    if (currentTime > 3) {
      await loadChapter(idx); set({ currentTime: 0 });
    } else if (idx > 0) {
      const prevIdx = idx - 1;
      await loadChapter(prevIdx);
      set({ currentChapterIndex: prevIdx, currentChapter: chapters[prevIdx], duration: chapters[prevIdx].duration, isPlaying: true });
    }
  },

  setSleepTimer: (m: number | null) => set({ sleepTimer: m, sleepTimeRemaining: m ? m * 60 : null }),
  clearSleepTimer: () => set({ sleepTimer: null, sleepTimeRemaining: null }),
  showMiniPlayer: () => set({ isMiniPlayerVisible: true }),
  hideMiniPlayer: () => set({ isMiniPlayerVisible: false }),
  showFullPlayer: () => set({ isFullPlayerVisible: true, isMiniPlayerVisible: false }),
  hideFullPlayer: () => set({ isFullPlayerVisible: false }),
  skipIntro: () => {
    const { currentItem } = get();
    if (!currentItem) return;
    const settings = Config.getBook(currentItem.id);
    getAudio().currentTime = Math.min(settings.introSeconds || 15, getAudio().duration);
  },
  skipOutro: () => { get().playNextChapter(); },
}));
