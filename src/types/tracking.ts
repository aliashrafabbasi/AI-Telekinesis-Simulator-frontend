export type HandGesture = "open" | "punch" | "none";

export type HandFrame = {
  x: number;
  y: number;
  gesture: HandGesture;
  clap?: boolean;
  hands?: number;
  palm_dist?: number;
  frame_w?: number;
  frame_h?: number;
  ts?: number;
  frame?: string;
  tracking?: boolean;
  speed?: number;
};

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

export type Point = { x: number; y: number };

export function parseHandFrame(data: unknown): HandFrame | null {
  if (!data || typeof data !== "object") return null;

  const frame = data as Record<string, unknown>;
  if (typeof frame.x !== "number" || typeof frame.y !== "number") return null;

  const gesture = frame.gesture;
  if (gesture !== "open" && gesture !== "punch" && gesture !== "none") return null;

  return {
    x: frame.x,
    y: frame.y,
    gesture,
    clap: typeof frame.clap === "boolean" ? frame.clap : undefined,
    hands: typeof frame.hands === "number" ? frame.hands : undefined,
    palm_dist: typeof frame.palm_dist === "number" ? frame.palm_dist : undefined,
    frame_w: typeof frame.frame_w === "number" ? frame.frame_w : undefined,
    frame_h: typeof frame.frame_h === "number" ? frame.frame_h : undefined,
    ts: typeof frame.ts === "number" ? frame.ts : undefined,
    tracking: typeof frame.tracking === "boolean" ? frame.tracking : undefined,
    speed: typeof frame.speed === "number" ? frame.speed : undefined,
  };
}
