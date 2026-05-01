import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ABSUser, ABSLibrary, ABSProgress } from '../types';

interface AppState {
  user: ABSUser | null;
  isAuthenticated: boolean;
  libraries: ABSLibrary[];
  mediaProgress: ABSProgress[];
  activeLibraryId: string | null;
  isDarkMode: boolean;
  skipForwardSeconds: number;
  skipBackwardSeconds: number;
  playbackRate: number;
  volume: number;

  setUser: (user: ABSUser | null) => void;
  setIsAuthenticated: (val: boolean) => void;
  setLibraries: (libraries: ABSLibrary[]) => void;
  setMediaProgress: (progress: ABSProgress[]) => void;
  setActiveLibrary: (libraryId: string | null) => void;
  toggleDarkMode: () => void;
  setSkipForwardSeconds: (seconds: number) => void;
  setSkipBackwardSeconds: (seconds: number) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (vol: number) => void;
  logout: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      libraries: [],
      mediaProgress: [],
      activeLibraryId: null,
      isDarkMode: true,
      skipForwardSeconds: 30,
      skipBackwardSeconds: 10,
      playbackRate: 1,
      volume: 1,

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setIsAuthenticated: (val) => set({ isAuthenticated: val }),

      setLibraries: (libraries) => {
        const activeLibraryId = libraries.length > 0 ? libraries[0].id : null;
        set({ libraries, activeLibraryId });
      },

      setMediaProgress: (mediaProgress) => set({ mediaProgress }),

      setActiveLibrary: (libraryId) => set({ activeLibraryId: libraryId }),

      toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),

      setSkipForwardSeconds: (seconds) => set({ skipForwardSeconds: seconds }),
      setSkipBackwardSeconds: (seconds) => set({ skipBackwardSeconds: seconds }),
      setPlaybackRate: (rate) => set({ playbackRate: rate }),
      setVolume: (vol) => set({ volume: vol }),

      logout: () => set({
        user: null, isAuthenticated: false, libraries: [], mediaProgress: [], activeLibraryId: null,
      }),
    }),
    {
      name: 'abs-app-storage',
      // 持久化用户和进度，避免刷新页面后重新登录
      partialize: (state) => ({
        isDarkMode: state.isDarkMode,
        skipForwardSeconds: state.skipForwardSeconds,
        skipBackwardSeconds: state.skipBackwardSeconds,
        playbackRate: state.playbackRate,
        volume: state.volume,
        activeLibraryId: state.activeLibraryId,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        libraries: state.libraries,
        mediaProgress: state.mediaProgress,
      }),
    }
  )
);
