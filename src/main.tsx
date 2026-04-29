import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Vite 构建时的 BASE_URL（适配子路径部署如 /abs-web-player/）
const baseUrl = import.meta.env.BASE_URL || '/';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={baseUrl.replace(/\/$/, '')}>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// ====== PWA 版本管理：新版本自动刷新 ======
// 当 Service Worker 检测到新版本并接管页面时，自动刷新
// 确保用户始终运行最新代码
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${baseUrl}sw.js`, { scope: baseUrl }).catch(() => {});
  });

  let prevController: ServiceWorker | null = navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (prevController) {
      window.location.reload();
    }
    prevController = navigator.serviceWorker.controller;
  });
}
