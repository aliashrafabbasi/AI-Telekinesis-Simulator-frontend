import type { PointerMotionConfig } from "../motion/pointerMotion";
import { env } from "./env";

export const OBJECT_MARGIN = 80;

/** Play-area inset that scales down on phones and tablets. */
export function getPlayMargin(): number {
  const short = Math.min(window.innerWidth, window.innerHeight);
  if (short < 400) return 28;
  if (short < 600) return 44;
  if (short < 900) return 60;
  return OBJECT_MARGIN;
}
export const BATMAN_HIT = 78;
export const JOKER_HIT = 68;
export const BOSS_JOKER_HIT = 92;
export const NORMALS_BEFORE_BOSS = 8;
export const SPAWN_MS = 2200;
export const FIST_HOLD_FRAMES = 6;
export const FIST_START_COOLDOWN_MS = 850;

export const TRACKING_MODE = env.trackingMode;
export const WS_URL = env.wsUrl;
export const PREVIEW_WS_URL = env.previewWsUrl;

export function wsUrlWithToken(baseUrl: string, token: string): string {
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
}

/** Low-latency profile: direct hand→screen mapping, minimal smoothing */
export const MOTION_PROFILE: Partial<PointerMotionConfig> = {
  margin: OBJECT_MARGIN,
  sensitivity: 2.9,
  euroMinCutoff: 2.8,
  euroBeta: 0.06,
  followRateActive: 95,
  followRateIdle: 18,
  lostHandReturnSpeed: 2.5,
  maxNormJump: 0.24,
};
