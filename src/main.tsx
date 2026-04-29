import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// ====== PWA 版本管理：新版本自动刷新 ======
// 当 Service Worker 检测到新版本并接管页面时，自动刷新
// 确保用户始终运行最新代码
if ('serviceWorker' in navigator) {
  // 注册 SW
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  });

  // 监听 controller 变化：旧 SW → 新 SW = 新版本上线
  let prevController: ServiceWorker | null = navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (prevController) {
      // 有新版本激活，刷新页面获取最新资源
      window.location.reload();
    }
    prevController = navigator.serviceWorker.controller;
  });
}
