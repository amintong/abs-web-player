import { useState, useEffect, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './store/appStore';
import { useMediaSession } from './hooks/useMediaSession';
import { useTheme } from './hooks/useTheme';
import { validateSession, getLibraries } from './api/audiobookshelf';

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
  const { isAuthenticated, setLibraries } = useAppStore();
  useMediaSession();

  const fetched = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || fetched.current) return;
    fetched.current = true;
    (async () => {
      try {
        await validateSession();
        const libs = await getLibraries();
        setLibraries(libs);
      } catch { /* 使用 persist 数据 */ }
    })();
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    /*
     * ★ position: fixed; inset: 0
     * 在 iOS PWA + viewport-fit=cover 下，fixed 容器会占据整个物理屏幕，
     * 包括安全区域。这是和 absolute 的关键区别。
     */
    <div
      className="flex flex-col"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: 'env(safe-area-inset-top)',
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

      {/* MiniPlayer — flex 子元素自然落底，flex-shrink:0 + pb 处理安全区 */}
      <DebugTag id="miniplayer" name="MiniPlayer">
        <MiniPlayer />
      </DebugTag>
    </div>
  );
}

function App() {
  const [hydrated, setHydrated] = useState(useAppStore.persist.hasHydrated());
  useTheme();

  useEffect(() => {
    const unsub = useAppStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAppStore.persist.hasHydrated()) {
      setHydrated(true);
    }
    return unsub;
  }, []);

  if (!hydrated) {
    return (
      <div className="bg-[var(--color-bg)] flex items-center justify-center" style={{ position: 'fixed', inset: 0 }}>
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
