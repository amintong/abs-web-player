import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { registerSW } from './sw';
import { initPlayerModules } from './controller/playerController';
import { MediaServer, AudiobookshelfAdapter } from './adapters';
import './index.css';

const baseUrl = import.meta.env.BASE_URL || '/';

// ====== iOS PWA Viewport — 最终方案 ======
//
// 问题本质：
//   window.innerHeight / visualViewport.height 在 iOS PWA 下返回的值
//   可能不包含安全区（894px vs 物理屏幕 956px）。
//   不管用什么 CSS 技巧（-webkit-fill-available、fixed、100vh 等），
//   如果底层视口高度就是错的，上层布局永远缺一块。
//
// 解决：
//   直接用 window.screen.height（物理屏幕像素高度）设置 html 高度。
//   这是唯一一个在所有情况下都等于"屏幕底部 y 坐标"的值。
//
function setAppViewport() {
  const vv = window.visualViewport;
  const vh = vv?.height ?? window.innerHeight;
  const screenH = window.screen.height || window.innerHeight;

  // 从 CSS 变量读 safe-area
  const cs = getComputedStyle(document.documentElement);
  const satRaw = cs.getPropertyValue('--sat').trim();
  const sabRaw = cs.getPropertyValue('--sab').trim();
  const safeTop = parseFloat(satRaw) || 0;
  const safeBottom = parseFloat(sabRaw) || 0;

  document.documentElement.style.setProperty('--app-height', `${vh}px`);
  document.documentElement.style.setProperty('--app-full-height', `${screenH}px`);
  document.documentElement.style.setProperty('--vh', `${vh * 0.01}px`);
  document.documentElement.style.setProperty('--safe-top', `${safeTop}px`);
  document.documentElement.style.setProperty('--safe-bottom', `${safeBottom}px`);

  // ★ 直接设为物理屏幕高度，不多不少
  document.documentElement.style.setProperty('height', `${screenH}px`);
}

setAppViewport();
window.addEventListener('resize', setAppViewport);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', setAppViewport);
}

// 恢复上次连接的后端适配器（如果有保存的 token）
if (localStorage.getItem('abs_token')) {
  const adapter = new AudiobookshelfAdapter();
  MediaServer.setAdapter(adapter);
  MediaServer.saveServerType('audiobookshelf');
}

registerSW();
initPlayerModules();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={baseUrl.replace(/\/$/, '')}>
      <App />
    </BrowserRouter>
  </StrictMode>
);
