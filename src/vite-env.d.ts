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
