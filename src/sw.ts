// ====== Service Worker 注册 / 版本更新管理 ======

const baseUrl = import.meta.env.BASE_URL || '/';
let swRegistration: ServiceWorkerRegistration | null = null;

/** 注册 Service Worker */
export function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${baseUrl}sw.js`, { scope: baseUrl }).then((reg) => {
      swRegistration = reg;
    }).catch(() => {});

    // 检测 SW 控制权变更 → 新版本已激活 → 刷新页面
    let prevController: ServiceWorker | null = navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (prevController) {
        window.location.reload();
      }
      prevController = navigator.serviceWorker.controller;
    });
  });
}

/** 手动检查 SW 更新，有新版本时自动刷新页面 */
export function checkForUpdates(): Promise<string> {
  return new Promise((resolve) => {
    if (!swRegistration) {
      resolve('Service Worker 未注册');
      return;
    }

    swRegistration.update().then(() => {
      // update() 后检查是否有 waiting 的 SW
      if (swRegistration!.waiting) {
        // 有等待中的新 SW（autoUpdate 模式下 skipWaiting 会立即激活）
        // controllerchange 监听会自动刷新页面
        resolve('发现新版本，正在更新...');
      } else {
        resolve('已是最新版本');
      }
    }).catch(() => {
      resolve('检查更新失败');
    });
  });
}
