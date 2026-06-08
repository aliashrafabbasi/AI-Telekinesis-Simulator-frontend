export type TrackingMode = "browser" | "server";

type EnvConfig = {
  apiUrl: string;
  wsUrl: string | null;
  previewWsUrl: string | null;
  trackingMode: TrackingMode;
};

function requireEnvUrl(value: string | undefined, name: string): string {
  const resolved = value?.trim();
  if (!resolved) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env and set your backend URLs.`,
    );
  }

  try {
    new URL(resolved.replace(/^ws/, "http"));
  } catch {
    throw new Error(`Invalid ${name}: ${resolved}`);
  }

  return resolved;
}

function derivePreviewWsUrl(wsUrl: string): string {
  if (/\/ws\/?$/.test(wsUrl)) {
    return wsUrl.replace(/\/ws\/?$/, "/ws/preview");
  }
  const base = wsUrl.replace(/\/$/, "");
  return `${base}/preview`;
}

export function loadEnv(): EnvConfig {
  const apiUrl = requireEnvUrl(import.meta.env.VITE_API_URL, "VITE_API_URL");
  const trackingMode: TrackingMode =
    import.meta.env.VITE_TRACKING_MODE === "server" ? "server" : "browser";

  let wsUrl: string | null = null;
  let previewWsUrl: string | null = null;

  if (trackingMode === "server") {
    wsUrl = requireEnvUrl(import.meta.env.VITE_WS_URL, "VITE_WS_URL");
    previewWsUrl = import.meta.env.VITE_PREVIEW_WS_URL?.trim()
      ? requireEnvUrl(import.meta.env.VITE_PREVIEW_WS_URL, "VITE_PREVIEW_WS_URL")
      : derivePreviewWsUrl(wsUrl);
  }

  return { apiUrl, wsUrl, previewWsUrl, trackingMode };
}

export const env = loadEnv();
