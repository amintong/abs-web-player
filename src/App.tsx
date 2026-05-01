import { useState, useEffect, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './store/appStore';
import { usePlayerStore } from './store/playerStore';
import { useMediaSession } from './hooks/useMediaSession';
import { getCurrentUser, getLibraries, getItem } from './api/audiobookshelf';
import { getSession } from './store/playerStore';

import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import LibraryPage from './pages/LibraryPage';
import ItemDetailPage from './pages/ItemDetailPage';
import PlayerPage from './pages/PlayerPage';
import SearchPage from './pages/SearchPage';
import SettingsPage from './pages/SettingsPage';

import MiniPlayer from './components/MiniPlayer';
import DebugMode, { DebugTag } from './components/DebugOverlay';

function ProtectedRoutes() {
  const { isAuthenticated, setLibraries, setMediaProgress } = useAppStore();
  useMediaSession();

  const fetched = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || fetched.current) return;
    fetched.current = true;
    (async () => {
      try {
        const user = await getCurrentUser();
        if (user.mediaProgress) setMediaProgress(user.mediaProgress);
        const libs = await getLibraries();
        setLibraries(libs);

        const session = getSession();
        if (session?.libraryItemId) {
          try {
            const item = await getItem(session.libraryItemId);
            if (item) {
              usePlayerStore.getState().play(item as any);
            }
          } catch {
            console.warn('Session restore: failed to fetch item', session.libraryItemId);
          }
        }
      } catch { /* 使用 persist 数据 */ }
    })();
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div
      className="flex flex-col"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* 主内容区 — flex-1 填满剩余空间 */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <Routes>
          <Route path="/" element={<DebugTag id="home" name="HomePage"><HomePage /></DebugTag>} />
          <Route path="/library/:libraryId" element={<DebugTag id="library" name="LibraryPage"><LibraryPage /></DebugTag>} />
          <Route path="/item/:itemId" element={<DebugTag id="detail" name="ItemDetailPage"><ItemDetailPage /></DebugTag>} />
          <Route path="/player" element={<DebugTag id="player" name="PlayerPage"><PlayerPage /></DebugTag>} />
          <Route path="/search" element={<DebugTag id="search" name="SearchPage"><SearchPage /></DebugTag>} />
          <Route path="/settings" element={<DebugTag id="settings" name="SettingsPage"><SettingsPage /></DebugTag>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      {/* MiniPlayer 固定在底部 */}
      <MiniPlayer />
    </div>
  );
}

function App() {
  const [hydrated, setHydrated] = useState(useAppStore.persist.hasHydrated());

  useEffect(() => {
    const unsub = useAppStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAppStore.persist.hasHydrated()) {
      setHydrated(true);
    }
    return unsub;
  }, []);

  if (!hydrated) {
    return (
      <div className="bg-black flex items-center justify-center" style={{ position: 'fixed', inset: 0 }}>
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <DebugMode>
      <ProtectedRoutes />
    </DebugMode>
  );
}

export default App;
