import { useEffect } from 'react';
import { usePlayerStore, getAudio } from '../controller/playerController';
import { getCoverUrl } from '../api/audiobookshelf';
import { getAuthorName, getTitle } from '../utils/helpers';
import { Config } from '../utils/configManager';
import { playerLog, playerWarn } from '../utils/playerLogger';

export function useMediaSession() {
  const {
    currentItem,
    isPlaying,
  } = usePlayerStore();
  const { skipForwardSeconds, skipBackwardSeconds } = Config.getApp();

  // 设置 metadata
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const metadata = currentItem
      ? new MediaMetadata({
          title: getTitle(currentItem) || 'Unknown',
          artist: getAuthorName(currentItem),
          album: getTitle(currentItem) || '',
          artwork: [
            { src: getCoverUrl(currentItem.id), sizes: '512x512', type: 'image/jpeg' },
          ],
        })
      : null;

    navigator.mediaSession.metadata = metadata;
  }, [currentItem]);

  // 注册 action handlers
  // ★ play/pause 直接操作 audio 元素，不经过 store 的 resume/pause
  //   避免 bumpRestoreGen 和 background recovery 互相打架
  //   iOS 锁屏下必须尽可能同步直接地调用 audio.play()
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const audio = getAudio();

    navigator.mediaSession.setActionHandler('play', () => {
      playerLog('lifecycle', '[MediaSession] play 触发');
      const promise = audio.play();
      if (promise) {
        promise.then(() => {
          usePlayerStore.setState({ isPlaying: true });
          playerLog('lifecycle', '[MediaSession] play 成功');
        }).catch((err) => {
          playerWarn('lifecycle', '[MediaSession] play 失败', { error: (err as Error).message });
        });
      }
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      playerLog('lifecycle', '[MediaSession] pause 触发');
      audio.pause();
      usePlayerStore.setState({ isPlaying: false });
    });

    navigator.mediaSession.setActionHandler('seekbackward', () => {
      usePlayerStore.getState().skipBackward(skipBackwardSeconds);
    });
    navigator.mediaSession.setActionHandler('seekforward', () => {
      usePlayerStore.getState().skipForward(skipForwardSeconds);
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      usePlayerStore.getState().playPreviousChapter();
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      usePlayerStore.getState().playNextChapter();
    });
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) usePlayerStore.getState().seek(details.seekTime);
    });
  }, []);

  // 同步 playbackState
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);
}
