/**
 * 后台事件处理模块（单例，应用启动即初始化）
 *
 * 常驻监听：
 *   - visibilitychange → 隐藏时同步进度 / 显示时恢复播放
 *   - pagehide / beforeunload → 页面关闭前最终同步
 *
 * 不负责：
 *   - watchdog / sync / sleep 定时任务 → 由 playerController 按需启停
 */

import { syncProgressNow } from '../api/audiobookshelf';
import { getAudio } from './playerController';
import { playerLog, playerWarn } from '../utils/playerLogger';

// ── 延迟导入依赖（避免循环引用）──

let getCumulativeTimeFn: ((chapters: any[], idx: number, t: number) => number) | null = null;
let startWatchdogFn: (() => void) | null = null;
let getStore: (() => any) | null = null;

/** 由 playerController 初始化时注入依赖 */
export function initDeps(deps: {
  cumulativeTime: typeof getCumulativeTimeFn;
  startWatchdog: typeof startWatchdogFn;
  getStore: typeof getStore;
}) {
  getCumulativeTimeFn = deps.cumulativeTime;
  startWatchdogFn = deps.startWatchdog;
  getStore = degetStore;
}

// ── 恢复令牌 ──

export let restoreGen = 0;

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
    const s = getStore();
    if (!s.libraryItemId) return;
    const ct = getCumulativeTimeFn(s.chapters, s.currentChapterIndex, audio.currentTime);
    syncProgressNow(s.libraryItemId, ct, s.chapters[s.currentChapterIndex]?.duration || 0);
    playerLog('background', `页面关闭 → 最终同步 · ${Math.round(ct)}s`);
  };

  window.addEventListener('beforeunload', onFinalSync);
  window.addEventListener('pagehide', onFinalSync);

  // ── 前后台切换 ──
  const onVisibilityChange = () => {
    if (!getCumulativeTimeFn || !getStore) return;

    if (document.visibilityState === 'hidden') {
      // 后台：同步当前进度
      const s = getStore();
      if (s.libraryItemId) {
        const ct = getCumulativeTimeFn(s.chapters, s.currentChapterIndex, audio.currentTime);
        syncProgressNow(s.libraryItemId, ct, s.chapters[s.currentChapterIndex]?.duration || 0);
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

/** iOS 锁屏返回后 audio 被暂停，尝试恢复 */
function recoverFromBackground(audio: HTMLAudioElement) {
  if (!audio.src) return;
  if (!getStore) return;

  if (!audio.paused) {
    getStore().setState({ isPlaying: true });
    return;
  }

  const timeBeforePlay = audio.currentTime;
  const token = ++restoreGen;
  const promise = audio.play();

  if (promise === undefined) {
    if (token !== restoreGen) return;
    getStore().setState({ isPlaying: true });
    return;
  }

  promise.then(() => {
    if (token !== restoreGen) return;

    const ctAfter = audio.currentTime;
    if (ctAfter < 1 && timeBeforePlay > 2) {
      audio.currentTime = Math.min(timeBeforePlay, audio.duration || timeBeforePlay);
      playerLog('background', `⚠️ currentTime 重置 · ${ctAfter.toFixed(1)}s → ${timeBeforePlay.toFixed(1)}s`);
    }

    getStore().setState({ isPlaying: true });
    if (startWatchdogFn) startWatchdogFn();
  }).catch((err) => {
    if (token !== restoreGen) return;
    getStore().setState({ isPlaying: false });
    playerWarn('background', `恢复播放失败`, { error: (err as Error).message || 'unknown' });
  });
}
