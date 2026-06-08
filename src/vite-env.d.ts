/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_TRACKING_MODE?: "browser" | "server";
  readonly VITE_WS_URL: string;
  readonly VITE_PREVIEW_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
