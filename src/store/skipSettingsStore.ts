import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface BookSkipSettings {
  introSeconds: number;
  outroSeconds: number;
  autoSkipIntro: boolean;
  autoSkipOutro: boolean;
}

interface SkipSettingsState {
  // 全局默认值
  defaultIntroSeconds: number;
  defaultOutroSeconds: number;

  // 按书保存的设置 { [bookId]: BookSkipSettings }
  books: Record<string, BookSkipSettings>;

  // Actions
  setDefaultIntro: (seconds: number) => void;
  setDefaultOutro: (seconds: number) => void;

  getBookSettings: (bookId: string) => BookSkipSettings;
  setBookIntro: (bookId: string, seconds: number) => void;
  setBookOutro: (bookId: string, seconds: number) => void;
  setBookAutoSkipIntro: (bookId: string, enabled: boolean) => void;
  setBookAutoSkipOutro: (bookId: string, enabled: boolean) => void;
  toggleBookAutoSkipIntro: (bookId: string) => void;
  toggleBookAutoSkipOutro: (bookId: string) => void;
}

export const useSkipSettings = create<SkipSettingsState>()(
  persist(
    (set, get) => ({
      defaultIntroSeconds: 15,
      defaultOutroSeconds: 10,
      books: {},

      setDefaultIntro: (seconds) => set({ defaultIntroSeconds: seconds }),
      setDefaultOutro: (seconds) => set({ defaultOutroSeconds: seconds }),

      getBookSettings: (bookId) => {
        const state = get();
        const book = state.books[bookId];
        if (book) return book;
        // 返回全局默认值
        return {
          introSeconds: state.defaultIntroSeconds,
          outroSeconds: state.defaultOutroSeconds,
          autoSkipIntro: false,
          autoSkipOutro: false,
        };
      },

      setBookIntro: (bookId, seconds) => {
        set((state) => ({
          books: {
            ...state.books,
            [bookId]: { ...state.books[bookId] || get().getBookSettings(bookId), introSeconds: seconds },
          },
        }));
      },

      setBookOutro: (bookId, seconds) => {
        set((state) => ({
          books: {
            ...state.books,
            [bookId]: { ...state.books[bookId] || get().getBookSettings(bookId), outroSeconds: seconds },
          },
        }));
      },

      setBookAutoSkipIntro: (bookId, enabled) => {
        set((state) => ({
          books: {
            ...state.books,
            [bookId]: { ...state.books[bookId] || get().getBookSettings(bookId), autoSkipIntro: enabled },
          },
        }));
      },

      setBookAutoSkipOutro: (bookId, enabled) => {
        set((state) => ({
          books: {
            ...state.books,
            [bookId]: { ...state.books[bookId] || get().getBookSettings(bookId), autoSkipOutro: enabled },
          },
        }));
      },

      toggleBookAutoSkipIntro: (bookId) => {
        const current = get().getBookSettings(bookId);
        set((state) => ({
          books: {
            ...state.books,
            [bookId]: { ...current, autoSkipIntro: !current.autoSkipIntro },
          },
        }));
      },

      toggleBookAutoSkipOutro: (bookId) => {
        const current = get().getBookSettings(bookId);
        set((state) => ({
          books: {
            ...state.books,
            [bookId]: { ...current, autoSkipOutro: !current.autoSkipOutro },
          },
        }));
      },
    }),
    {
      name: 'abs-skip-settings',
    }
  )
);
