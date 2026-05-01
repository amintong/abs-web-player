import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { registerSW } from './sw';
import './index.css';

const baseUrl = import.meta.env.BASE_URL || '/';

// ====== iOS PWA Viewport ======
// v13 策略：纯 CSS 声明式布局。
// 只通过 CSS 变量中转 safe-area 值供其他地方读取，
// 绝不修改任何元素的高度/样式。
function setAppViewport() {
  const vv = window.visualViewport;
  const vh = vv?.height ?? window.innerHeight;

  // 从 CSS 变量读 safe-area（index.css 通过 --sat/--sab 中转 env()）
  const cs = getComputedStyle(document.documentElement);
  const satRaw = cs.getPropertyValue('--sat').trim();
  const sabRaw = cs.getPropertyValue('--sab').trim();
  const safeTop = parseFloat(satRaw) || 0;
  const safeBottom = parseFloat(sabRaw) || 0;

  // 仅写入信息性变量，不改任何 style 属性
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
