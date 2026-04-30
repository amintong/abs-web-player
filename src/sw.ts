// ====== Service Worker 注册 / 手动版本管理 ======
// 用户通过"检查更新"按钮手动检测，确认后才更新

const baseUrl = import.meta.env.BASE_URL || '/';

/** 注册 Service Worker */
export function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${baseUrl}sw.js`, { scope: baseUrl }).catch(() => {});
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

/** 用户确认后刷新页面加载新版本 */
export function applyUpdate() {
  window.location.reload();
}
