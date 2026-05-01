/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ABS_SERVER: string;
  readonly VITE_ABS_USERNAME: string;
  readonly VITE_ABS_PASSWORD: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** 从 VERSION 文件读取的应用版本号 */
declare const __APP_VERSION__: string;

/** vite-plugin-pwa 自动生成的 SW 注册模块 */
declare module 'virtual:pwa-register' {
  interface RegisterSWOptions {
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (reg: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: unknown) => void;
  }
  export function registerSW(options?: RegisterSWOptions): (reloadPage?: boolean) => Promise<void>;
}
