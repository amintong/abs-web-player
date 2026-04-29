/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ABS_SERVER: string;
  readonly VITE_ABS_USERNAME: string;
  readonly VITE_ABS_PASSWORD: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
