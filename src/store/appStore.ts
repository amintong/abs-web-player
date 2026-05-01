import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ABSUser, ABSLibrary, ABSProgress } from '../types';

interface AppState {
  user: ABSUser | null;
  isAuthenticated: boolean;
  libraries: ABSLibrary[];
  mediaProgress: ABSProgress[];
  activeLibraryId: string | null;

  setUser: (user: ABSUser | null) => void;
  setIsAuthenticated: (val: boolean) => void;
  setLibraries: (libraries: ABSLibrary[]) => void;
  setMediaProgress: (progress: ABSProgress[]) => void;
  setActiveLibrary: (libraryId: string | null) => void;
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

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setIsAuthenticated: (val) => set({ isAuthenticated: val }),

      setLibraries: (libraries) => {
        const activeLibraryId = libraries.length > 0 ? libraries[0].id : null;
        set({ libraries, activeLibraryId });
      },

      setMediaProgress: (mediaProgress) => set({ mediaProgress }),

      setActiveLibrary: (libraryId) => set({ activeLibraryId: libraryId }),

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
