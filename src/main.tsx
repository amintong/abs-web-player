import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { registerSW } from './sw';
import './index.css';

const baseUrl = import.meta.env.BASE_URL || '/';

// ====== iOS PWA Viewport ======
// 核心原则：
//   1. 不再用 JS 强制修改 html.style.height（会把容器锁死在 innerHeight 内）
//   2. 只通过 CSS 变量中转 env(safe-area-inset-*) 值供其他地方使用
//   3. html 高度完全交给 CSS (height: 100% + -webkit-fill-available) 处理
function setAppViewport() {
  const vv = window.visualViewport;
  const vh = vv?.height ?? window.innerHeight;

  // 从 CSS 变量读取安全区值（index.css 已通过 --sat/--sab 中转 env()）
  const cs = getComputedStyle(document.documentElement);
  const satRaw = cs.getPropertyValue('--sat').trim();
  const sabRaw = cs.getPropertyValue('--sab').trim();
  const safeTop = parseFloat(satRaw) || 0;
  const safeBottom = parseFloat(sabRaw) || 0;

  // 仅写入信息性 CSS 变量，绝不修改 html.style.height
  document.documentElement.style.setProperty('--app-height', `${vh}px`);
  document.documentElement.style.setProperty('--app-full-height', `${vh}px`);
  document.documentElement.style.setProperty('--vh', `${vh * 0.01}px`);
  document.documentElement.style.setProperty('--safe-top', `${safeTop}px`);
  document.documentElement.style.setProperty('--safe-bottom', `${safeBottom}px`);
}

setAppViewport();
window.addEventListener('resize', setAppViewport);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', setAppViewport);
}

registerSW();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={baseUrl.replace(/\/$/, '')}>
      <App />
    </BrowserRouter>
  </StrictMode>
);
