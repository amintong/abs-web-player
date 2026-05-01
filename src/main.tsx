import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { registerSW } from './sw';
import './index.css';

const baseUrl = import.meta.env.BASE_URL || '/';

// ====== iOS PWA Viewport 修复 ======
// iOS PWA standalone 模式下 100vh/100dvh 不可靠（包含被遮挡的安全区域）。
// 使用 window.innerWidth/Height 动态设置 CSS 变量，确保高度精确匹配可见区域。
function setAppViewport() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}
setAppViewport();
window.addEventListener('resize', setAppViewport);
// iOS Safari visual viewport 变化时也更新（虚拟键盘弹出/收起、方向变化）
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', setAppViewport);
}

registerSW();

registerSW();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={baseUrl.replace(/\/$/, '')}>
      <App />
    </BrowserRouter>
  </StrictMode>
);
