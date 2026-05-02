import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ABSUser, ABSLibrary, ABSProgress } from '../types';

interface AppState {
  user: ABSUser | null;
  isAuthenticated: boolean;
  libraries: ABSLibrary[];
  mediaProgress: ABSProgress[];
  activeLibraryId: string | null;
  debugMode: boolean;

  setUser: (user: ABSUser | null) => void;
  setIsAuthenticated: (val: boolean) => void;
  setLibraries: (libraries: ABSLibrary[]) => void;
  setMediaProgress: (progress: ABSProgress[]) => void;
  setActiveLibrary: (libraryId: string | null) => void;
  setDebugMode: (val: boolean) => void;
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
      debugMode: false,

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setIsAuthenticated: (val) => set({ isAuthenticated: val }),

      setLibraries: (libraries) => {
        set((state) => {
          // 如果之前选的库仍在列表中，保留；否则默认第一个
          const stillExists = state.activeLibraryId && libraries.some(l => l.id === state.activeLibraryId);
          return {
            libraries,
            activeLibraryId: stillExists ? state.activeLibraryId : (libraries[0]?.id ?? null),
          };
        });
      },

      setMediaProgress: (mediaProgress) => set({ mediaProgress }),

      setActiveLibrary: (libraryId) => set({ activeLibraryId: libraryId }),

      setDebugMode: (debugMode) => set({ debugMode }),

      logout: () => set({
        user: null, isAuthenticated: false, libraries: [], mediaProgress: [], activeLibraryId: null,
      }),
    }),
    {
      name: 'abs-app-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        libraries: state.libraries,
        mediaProgress: state.mediaProgress,
        activeLibraryId: state.activeLibraryId,
      }),
    }
  )
);
