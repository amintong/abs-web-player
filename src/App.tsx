import { useState, useEffect, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './store/appStore';
import { useMediaSession } from './hooks/useMediaSession';
import { getCurrentUser, getLibraries } from './api/audiobookshelf';

import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import LibraryPage from './pages/LibraryPage';
import ItemDetailPage from './pages/ItemDetailPage';
import PlayerPage from './pages/PlayerPage';
import SearchPage from './pages/SearchPage';
import SettingsPage from './pages/SettingsPage';

import MiniPlayer from './components/MiniPlayer';

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
      } catch { /* 使用 persist 数据 */ }
    })();
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/library/:libraryId" element={<LibraryPage />} />
        <Route path="/item/:itemId" element={<ItemDetailPage />} />
        <Route path="/player" element={<PlayerPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        {/* 未匹配路由重定向到首页 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <MiniPlayer />
    </div>
  );
}

function App() {
  // 等待 Zustand persist 水合完成
  const [hydrated, setHydrated] = useState(useAppStore.persist.hasHydrated());

  useEffect(() => {
    const unsub = useAppStore.persist.onFinishHydration(() => setHydrated(true));
    // 如果已经水合完成，直接设置
    if (useAppStore.persist.hasHydrated()) {
      setHydrated(true);
    }
    return unsub;
  }, []);

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <ProtectedRoutes />;
}

export default App;
