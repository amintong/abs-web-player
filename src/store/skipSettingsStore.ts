import { useSyncExternalStore, useCallback, useMemo } from 'react';
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
 * 所有读写委托给 ConfigManager。使用版本号订阅避免无限 re-render。
 */
export function useSkipSettings(): SkipSettingsState {
  const version = useSyncExternalStore(
    useCallback((cb: () => void) => Config.subscribe(cb), []),
    useCallback(() => Config.getSnapshot(), []),
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const app = useMemo(() => Config.getApp(), [version]);

  return {
    get defaultIntroSeconds() { return app.defaultIntroSeconds; },
    get defaultOutroSeconds() { return app.defaultOutroSeconds; },

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
