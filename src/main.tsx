import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { registerSW } from './sw';
import './index.css';

const baseUrl = import.meta.env.BASE_URL || '/';

// ====== iOS PWA Viewport 修复 ======
// iOS PWA standalone 模式下 100vh/100dvh 不可靠。
// 核心问题：visualViewport.height / innerHeight 通常**不包含**底部安全区域，
//           导致布局高度比物理屏幕短 ~34-62px（取决于机型）。
// 策略：用 -webkit-fill-available 让 html 自动填满包含安全区的可用空间，
//       同时导出 --app-height 给其他地方用。
function setAppViewport() {
  const vv = window.visualViewport;
  const h = vv?.height ?? window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${h}px`);
  document.documentElement.style.setProperty('--vh', `${h * 0.01}px`);

  // 安全区域修正高度（用于需要精确知道"屏幕底部在哪"的场景）
  // = 可视高度 + 底部安全区 ≈ 从状态栏下面到 Home 指示条下面
  if (vv) {
    const cs = getComputedStyle(document.documentElement);
    const safeTop    = cs.getPropertyValue('safe-area-inset-top').trim();
    const safeBottom = cs.getPropertyValue('safe-area-inset-bottom').trim();
    document.documentElement.style.setProperty('--safe-top',    safeTop    || '0px');
    document.documentElement.style.setProperty('--safe-bottom', safeBottom || '0px');
    // 屏幕可用总高 = vv.height + safe-bottom
    const sbPx = parseFloat(safeBottom) || 0;
    document.documentElement.style.setProperty('--app-full-height', `${h + sbPx}px`);
  }
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
