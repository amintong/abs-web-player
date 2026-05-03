import { useEffect } from 'react';
import { usePlayerStore } from '../controller/playerController';
import { getCoverUrl } from '../api/audiobookshelf';
import { getAuthorName, getTitle } from '../utils/helpers';
import { Config } from '../utils/configManager';

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

  // 注册 action handlers — 直接调用 store 方法避免闭包陷阱
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => {
      usePlayerStore.getState().resume();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      usePlayerStore.getState().pause();
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
