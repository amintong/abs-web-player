import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Library, UserInfo } from '../adapters/interface';

interface AppState {
  user: UserInfo | null;
  isAuthenticated: boolean;
  libraries: Library[];
  activeLibraryId: string | null;
  debugMode: boolean;

  setUser: (user: UserInfo | null) => void;
  setIsAuthenticated: (val: boolean) => void;
  setLibraries: (libraries: Library[]) => void;
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
      activeLibraryId: null,
      debugMode: false,

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setIsAuthenticated: (val) => set({ isAuthenticated: val }),

      setLibraries: (libraries) => {
        set((state) => {
          const stillExists = state.activeLibraryId && libraries.some(l => l.id === state.activeLibraryId);
          return {
            libraries,
            activeLibraryId: stillExists ? state.activeLibraryId : (libraries[0]?.id ?? null),
          };
        });
      },

      setActiveLibrary: (libraryId) => set({ activeLibraryId: libraryId }),

      setDebugMode: (debugMode) => set({ debugMode }),

      logout: () => set({
        user: null, isAuthenticated: false, libraries: [], activeLibraryId: null,
      }),
    }),
    {
      name: 'abs-app-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        libraries: state.libraries,
        activeLibraryId: state.activeLibraryId,
      }),
    }
  )
);
