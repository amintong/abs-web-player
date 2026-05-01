// ====== Service Worker 生命周期管理 ======
//
// 更新流程：
//   1. 自动检测 — PWA 检测到新 SW 时，通过 onNeedRefresh 通知
//   2. 延迟刷新 — 等待页面稳定后执行 skipWaiting + clientsClaim + reloadPage
//   3. 手动检查 — 设置页"检查更新"按钮，对比 VERSION 文件
//
// 白屏问题根因：
//   autoUpdate 模式会立即 skipWaiting + reload，但旧页面可能还在用旧缓存资源，
//   新 SW 接管时资源版本不一致导致白屏。
//   改为 prompt 模式 + 延迟刷新，确保用户在合适的时机切换。

import { registerSW as registerPWASW } from 'virtual:pwa-register';

const baseUrl = import.meta.env.BASE_URL || '/';

let _reloadPage: ((reloadPage?: boolean) => Promise<void>) | null = null;

/** 注册 SW（prompt 模式），检测到更新时延迟自动刷新 */
export function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  _reloadPage = registerPWASW({
    onOfflineReady() {
      console.log('[SW] 应用已支持离线使用');
    },
    onNeedRefresh() {
      console.log('[SW] 发现新版本，延迟执行更新');
      // 延迟刷新：等当前页面操作完成后再切换
      requestIdleCallback?.(() => _reloadPage?.(true))
        ?? setTimeout(() => _reloadPage?.(true), 1500);
    },
    onRegistered(reg) {
      console.log('[SW] 已注册', reg?.scope);
    },
    onRegisterError(err) {
      console.error('[SW] 注册失败', err);
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
