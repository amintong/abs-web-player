import { useSyncExternalStore, useCallback } from 'react';
import { Config, type BookSkipConfig } from '../utils/configManager';

export type { BookSkipConfig };

interface SkipSettingsState {
  defaultIntroSeconds: number;
  defaultOutroSeconds: number;

  getBookSettings: (bookId: string) => BookSkipConfig;
  setBookIntro: (bookId: string, seconds: number) => void;
  setBookOutro: (bookId: string, seconds: number) => void;
  setBookAutoSkipIntro: (bookId: string, enabled: boolean) => void;
  setBookAutoSkipOutro: (bookId: string, enabled: boolean) => void;
  toggleBookAutoSkipIntro: (bookId: string) => void;
  toggleBookAutoSkipOutro: (bookId: string) => void;
}

/**
 * useSkipSettings — 兼容旧接口的 React Hook
 * 所有读写委托给 ConfigManager
 */
export function useSkipSettings(): SkipSettingsState {
  useSyncExternalStore(
    useCallback((cb: () => void) => Config.subscribe(cb), []),
    useCallback(() => ({}), []),
  );

  return {
    get defaultIntroSeconds() { return Config.getApp().defaultIntroSeconds; },
    get defaultOutroSeconds() { return Config.getApp().defaultOutroSeconds; },

    getBookSettings: (bookId) => Config.getBook(bookId),
    setBookIntro: (bookId, seconds) => Config.updateBook(bookId, { introSeconds: seconds }),
    setBookOutro: (bookId, seconds) => Config.updateBook(bookId, { outroSeconds: seconds }),
    setBookAutoSkipIntro: (bookId, enabled) => Config.updateBook(bookId, { autoSkipIntro: enabled }),
    setBookAutoSkipOutro: (bookId, enabled) => Config.updateBook(bookId, { autoSkipOutro: enabled }),
    toggleBookAutoSkipIntro: (bookId) => {
      const cur = Config.getBook(bookId);
      Config.updateBook(bookId, { autoSkipIntro: !cur.autoSkipIntro });
    },
    toggleBookAutoSkipOutro: (bookId) => {
      const cur = Config.getBook(bookId);
      Config.updateBook(bookId, { autoSkipOutro: !cur.autoSkipOutro });
    },
  };
}
