import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { registerSW } from './sw';
import './index.css';

const baseUrl = import.meta.env.BASE_URL || '/';

// ====== iOS PWA Viewport 修复 ======
//
// 核心问题：
//   iOS PWA standby 模式下 visualViewport.height / innerHeight 通常**不包含**
//   底部安全区域（Home 指示条），导致布局比物理屏幕短 ~34-64px。
//
// 修复策略：
//   1. index.css 已定义 --sat / --sab CSS 变量，中转 env(safe-area-inset-*) 值
//   2. 这里从 CSS 变量读取安全区数值（JS 无法直接读 env()）
//   3. 强制设置 html 高度 = vv.height + safeBottom → 覆盖到底部安全区下方
//
function setAppViewport() {
  const vv = window.visualViewport;
  const vh = vv?.height ?? window.innerHeight;

  // 从 CSS 变量读取 safe-area-inset 值（index.css 中已中转）
  const cs = getComputedStyle(document.documentElement);
  const satRaw = cs.getPropertyValue('--sat').trim();
  const sabRaw = cs.getPropertyValue('--sab').trim();

  // 解析 px 数值（env() 返回如 "59px"，空则默认 0）
  const safeTop = parseFloat(satRaw) || 0;
  const safeBottom = parseFloat(sabRaw) || 0;

  // 屏幕可用总高 = 可视区域 + 底部安全区
  const fullH = vh + safeBottom;

  // 写入 CSS 变量供全局使用
  document.documentElement.style.setProperty('--app-height', `${vh}px`);
  document.documentElement.style.setProperty('--app-full-height', `${fullH}px`);
  document.documentElement.style.setProperty('--vh', `${vh * 0.01}px`);
  document.documentElement.style.setProperty('--safe-top', `${safeTop}px`);
  document.documentElement.style.setProperty('--safe-bottom', `${safeBottom}px`);

  // ★ 核心：强制 html 高度延伸到屏幕最底部（含安全区）
  document.documentElement.style.setProperty('height', `${fullH}px`);
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
