import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { registerSW } from './sw';
import './index.css';

const baseUrl = import.meta.env.BASE_URL || '/';

// ====== iOS PWA Viewport 修复 ======
// iOS PWA standalone 模式下 100vh/100dvh 不可靠（包含被遮挡的安全区域）。
// 使用 visualViewport.height（优先）或 window.innerHeight 动态设置 CSS 变量。
function setAppViewport() {
  // visualViewport 更精确，能正确排除安全区域
  const h = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${h}px`);
  document.documentElement.style.setProperty('--vh', `${h * 0.01}px`);
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
