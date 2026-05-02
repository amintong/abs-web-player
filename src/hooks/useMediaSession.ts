import { useEffect } from 'react';
import { usePlayerStore } from '../controller/playerController';
import { getCoverUrl } from '../api/audiobookshelf';
import { getAuthorName, getTitle } from '../utils/helpers';
import { Config } from '../utils/configManager';

export function useMediaSession() {
  const {
    currentItem,
    isPlaying,
    pause,
    resume,
    seek,
    skipForward,
    skipBackward,
    playNextChapter,
    playPreviousChapter,
  } = usePlayerStore();
  const { skipForwardSeconds, skipBackwardSeconds } = Config.getApp();

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

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => { isPlaying ? pause() : resume(); });
    navigator.mediaSession.setActionHandler('pause', () => pause());
    navigator.mediaSession.setActionHandler('seekbackward', () => skipBackward(skipBackwardSeconds));
    navigator.mediaSession.setActionHandler('seekforward', () => skipForward(skipForwardSeconds));
    navigator.mediaSession.setActionHandler('previoustrack', () => playPreviousChapter());
    navigator.mediaSession.setActionHandler('nexttrack', () => playNextChapter());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) seek(details.seekTime);
    });
  }, [isPlaying, pause, resume, skipBackward, skipForward, playNextChapter, playPreviousChapter, seek]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);
}
