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
import DebugConsole, { DebugLabel } from './components/DebugOverlay';

function ProtectedRoutes() {
  const { isAuthenticated, setLibraries, setMediaProgress } = useAppStore();
  useMediaSession();

  // 已认证后，从服务器拉取最新数据（媒体进度、库列表）
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

        // ====== 锁屏/PWA 后台恢复：检查 session 自动续播 ======
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
    <div className="overflow-y-auto bg-black text-white" style={{ height: 'var(--app-height, 100%)', paddingTop: 'env(safe-area-inset-top)' }}>
      <Routes>
        <Route path="/" element={<DebugLabel id="home" name="HomePage"><HomePage /></DebugLabel>} />
        <Route path="/library/:libraryId" element={<DebugLabel id="library" name="LibraryPage"><LibraryPage /></DebugLabel>} />
        <Route path="/item/:itemId" element={<DebugLabel id="detail" name="ItemDetailPage"><ItemDetailPage /></DebugLabel>} />
        <Route path="/player" element={<DebugLabel id="player" name="PlayerPage"><PlayerPage /></DebugLabel>} />
        <Route path="/search" element={<DebugLabel id="search" name="SearchPage"><SearchPage /></DebugLabel>} />
        <Route path="/settings" element={<DebugLabel id="settings" name="SettingsPage"><SettingsPage /></DebugLabel>} />
        {/* 未匹配路由重定向到首页 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <DebugLabel id="miniplayer" name="MiniPlayer">
        <MiniPlayer />
      </DebugLabel>
    </div>
  );
}

function App() {
  // 等待 Zustand persist 水合完成
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
      <div className="bg-black flex items-center justify-center" style={{ height: 'var(--app-height, 100dvh)' }}>
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <DebugConsole>
      <ProtectedRoutes />
    </DebugConsole>
  );
}

export default App;
