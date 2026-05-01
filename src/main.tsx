import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { registerSW } from './sw';
import './index.css';

const baseUrl = import.meta.env.BASE_URL || '/';

// ====== iOS PWA Viewport 修复 ======
//
// 关键认知（血泪教训）：
//   当 <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" /> 时，
//   visualViewport.height === screen.height，视口已覆盖完整物理屏幕（含安全区）。
//   此时绝不能再加 safeBottom，否则 html 会超出屏幕导致布局崩坏。
//
//   反之如果是 "black" 或默认样式，vv.height 不含安全区，才需要加。
//
// 本项目用 black-translucent，所以：
//   html 高度 = vv.height（已含安全区，无需修正）
//   safe-top / safe-bottom 仅用于 padding/margin 等内边距场景
//
function setAppViewport() {
  const vv = window.visualViewport;
  const vh = vv?.height ?? window.innerHeight;

  // 从 CSS 变量读取安全区值（index.css 已通过 --sat/--sab 中转 env()）
  const cs = getComputedStyle(document.documentElement);
  const satRaw = cs.getPropertyValue('--sat').trim();
  const sabRaw = cs.getPropertyValue('--sab').trim();
  const safeTop = parseFloat(satRaw) || 0;
  const safeBottom = parseFloat(sabRaw) || 0;

  // 写入 CSS 变量供全局使用
  document.documentElement.style.setProperty('--app-height', `${vh}px`);
  document.documentElement.style.setProperty('--app-full-height', `${vh}px`);
  document.documentElement.style.setProperty('--vh', `${vh * 0.01}px`);
  document.documentElement.style.setProperty('--safe-top', `${safeTop}px`);
  document.documentElement.style.setProperty('--safe-bottom', `${safeBottom}px`);

  // ★ html 高度 = 视口高度（black-translucent 下已含安全区）
  document.documentElement.style.setProperty('height', `${vh}px`);
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
