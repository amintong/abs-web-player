// ====== Service Worker 生命周期管理 ======
//
// 客户端刷新触发方式：
//   1. 自动 — PWA 检测到新 SW 后自动 skipWaiting + clientsClaim + 页面 reload
//   2. 手动 — 用户在设置页点击"检查更新"，确认后清除缓存并刷新
//

import { registerSW as registerPWASW } from 'virtual:pwa-register';

const baseUrl = import.meta.env.BASE_URL || '/';

/** 注册 SW，利用 vite-plugin-pwa 的 autoUpdate 自动管理生命周期 */
export function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  registerPWASW({
    onOfflineReady() {
      console.log('应用已支持离线使用');
    },
  });
}

/** 手动检查更新：比较服务器 VERSION 文件与本地版本 */
export async function checkForUpdates(): Promise<{ hasUpdate: boolean; message: string }> {
  try {
    const resp = await fetch(`${baseUrl}VERSION?t=${Date.now()}`, { cache: 'no-store' });
    if (!resp.ok) throw new Error('无法获取版本信息');

    const latestVer = (await resp.text()).trim();
    if (latestVer === __APP_VERSION__) {
      return { hasUpdate: false, message: '已是最新版本' };
    }

    return { hasUpdate: true, message: `发现新版本 v${latestVer}，是否更新？` };
  } catch {
    return { hasUpdate: false, message: '检查更新失败（请检查网络）' };
  }
}

/** 用户确认更新：清除本地缓存后硬刷新，强制使用新版本 */
export function applyUpdate() {
  // 清除所有缓存，确保刷新后加载最新资源
  if ('caches' in window) {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
  window.location.reload();
}
