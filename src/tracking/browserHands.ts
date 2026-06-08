import type { HandFrame, HandGesture } from "../types/tracking";

type Landmark = { x: number; y: number; z?: number };

type MpResults = {
  image: CanvasImageSource;
  multiHandLandmarks?: Landmark[][];
};

type MpHands = {
  setOptions: (opts: Record<string, unknown>) => void;
  onResults: (cb: (results: MpResults) => void) => void;
  initialize: () => Promise<void>;
  send: (input: { image: HTMLVideoElement }) => Promise<void>;
  close: () => void;
};

declare global {
  interface Window {
    Hands?: new (config: { locateFile: (file: string) => string }) => MpHands;
    drawConnectors?: (
      ctx: CanvasRenderingContext2D,
      landmarks: Landmark[],
      connections: [number, number][],
      style: { color: string; lineWidth: number },
    ) => void;
    drawLandmarks?: (
      ctx: CanvasRenderingContext2D,
      landmarks: Landmark[],
      style: { color: string; lineWidth: number; radius: number },
    ) => void;
    HAND_CONNECTIONS?: [number, number][];
  }
}

const MP_HANDS_ROOT = "/mediapipe/hands";
const MP_DRAWING_ROOT = "/mediapipe/drawing_utils";

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10],
  [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18],
  [18, 19], [19, 20],
];

const MP_SCRIPTS = [
  `${MP_HANDS_ROOT}/hands.js`,
  `${MP_DRAWING_ROOT}/drawing_utils.js`,
];

let scriptsLoaded: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function loadMediaPipeScripts(): Promise<void> {
  if (!scriptsLoaded) {
    scriptsLoaded = (async () => {
      for (const src of MP_SCRIPTS) {
        await loadScript(src);
      }
    })();
  }
  return scriptsLoaded;
}

const WRIST = 0;
const MIDDLE_MCP = 9;

function landmarkDist(lm: Landmark[], a: number, b: number): number {
  const la = lm[a];
  const lb = lm[b];
  return Math.hypot(la.x - lb.x, la.y - lb.y);
}

function stableHandAnchor(lm: Landmark[]): { x: number; y: number } {
  return {
    x: lm[WRIST].x * 0.65 + lm[MIDDLE_MCP].x * 0.35,
    y: lm[WRIST].y * 0.65 + lm[MIDDLE_MCP].y * 0.35,
  };
}

function controlAnchor(hands: Landmark[][]): { x: number; y: number } {
  if (hands.length === 1) return stableHandAnchor(hands[0]);
  const a1 = stableHandAnchor(hands[0]);
  const a2 = stableHandAnchor(hands[1]);
  return { x: (a1.x + a2.x) / 2, y: (a1.y + a2.y) / 2 };
}

function countExtendedFingers(lm: Landmark[]): number {
  let count = 0;
  if (landmarkDist(lm, 4, 0) > landmarkDist(lm, 3, 0) * 1.08) count += 1;
  for (const [tip, pip] of [
    [8, 6],
    [12, 10],
    [16, 14],
    [20, 18],
  ] as const) {
    if (landmarkDist(lm, tip, 0) > landmarkDist(lm, pip, 0) * 1.05) count += 1;
  }
  return count;
}

function detectGesture(lm: Landmark[], last: HandGesture): HandGesture {
  const extended = countExtendedFingers(lm);
  if (extended <= 1) return "punch";
  if (extended >= 4) return "open";
  return last;
}

export type BrowserHandsCallbacks = {
  onFrame: (frame: HandFrame) => void;
  onPreviewReady: () => void;
  onPreviewFrame?: () => void;
  onError: (message: string) => void;
};

export class BrowserHandTracker {
  private hands: MpHands | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private lastGesture: HandGesture = "open";
  private running = false;
  private disposed = false;
  private previewStarted = false;
  private frameLoopId: number | null = null;
  private callbacks: BrowserHandsCallbacks;

  constructor(callbacks: BrowserHandsCallbacks) {
    this.callbacks = callbacks;
    this.video = document.createElement("video");
    this.video.setAttribute("playsinline", "true");
    this.video.muted = true;
    this.video.autoplay = true;

    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d", { alpha: false })!;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.disposed = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Browser does not support camera access");
    }

    try {
      await loadMediaPipeScripts();
    } catch {
      throw new Error("MediaPipe scripts failed to load");
    }
    if (this.disposed) return;

    const HandsCtor = window.Hands;
    if (!HandsCtor) {
      throw new Error("MediaPipe Hands failed to initialize");
    }

    this.hands = new HandsCtor({
      locateFile: (file) => `${MP_HANDS_ROOT}/${file}`,
    });
    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 0,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.65,
      selfieMode: false,
    });
    this.hands.onResults((results) => this.handleResults(results));

    try {
      await this.hands.initialize();
    } catch {
      throw new Error("MediaPipe model failed to load");
    }
    if (this.disposed) return;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "Error";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        throw new Error("Camera permission denied");
      }
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        throw new Error("No camera found");
      }
      if (name === "NotReadableError" || name === "TrackStartError") {
        throw new Error("Camera is in use by another app");
      }
      throw new Error("Camera unavailable");
    }
    if (this.disposed) {
      this.stopStream();
      return;
    }

    this.video.srcObject = this.stream;
    await this.video.play();

    this.running = true;
    this.startFrameLoop();
    this.callbacks.onPreviewReady();
  }

  stop(): void {
    this.disposed = true;
    this.running = false;

    if (this.frameLoopId !== null) {
      cancelAnimationFrame(this.frameLoopId);
      this.frameLoopId = null;
    }

    this.stopStream();
    this.hands?.close();
    this.hands = null;
  }

  paintPreview(target: HTMLCanvasElement): void {
    const parent = target.parentElement;
    const rect = parent?.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.max(1, Math.round((rect?.width ?? 320) * dpr));
    const targetH = Math.max(1, Math.round((rect?.height ?? 240) * dpr));

    if (target.width !== targetW || target.height !== targetH) {
      target.width = targetW;
      target.height = targetH;
    }

    const tctx = target.getContext("2d");
    if (!tctx) return;

    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = "high";
    tctx.clearRect(0, 0, targetW, targetH);

    if (this.canvas.width > 0 && this.canvas.height > 0) {
      tctx.drawImage(this.canvas, 0, 0, targetW, targetH);
    } else if (this.video.readyState >= 2) {
      tctx.save();
      tctx.translate(targetW, 0);
      tctx.scale(-1, 1);
      tctx.drawImage(this.video, 0, 0, targetW, targetH);
      tctx.restore();
    }
  }

  private stopStream(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    this.video.srcObject = null;
  }

  private startFrameLoop(): void {
    const loop = () => {
      if (!this.running || this.disposed) return;

      if (this.hands && this.video.readyState >= 2) {
        void this.hands.send({ image: this.video }).catch(() => {
          // Ignore transient send errors.
        });
      }

      this.frameLoopId = requestAnimationFrame(loop);
    };

    this.frameLoopId = requestAnimationFrame(loop);
  }

  private handleResults(results: MpResults): void {
    if (this.disposed) return;

    const w = this.video.videoWidth || 640;
    const h = this.video.videoHeight || 480;
    this.canvas.width = w;
    this.canvas.height = h;

    this.ctx.save();
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.translate(w, 0);
    this.ctx.scale(-1, 1);
    this.ctx.drawImage(results.image, 0, 0, w, h);
    this.ctx.restore();

    const handList = results.multiHandLandmarks ?? [];
    const payload: HandFrame = {
      x: -1,
      y: -1,
      gesture: "none",
      tracking: false,
      frame_w: w,
      frame_h: h,
      ts: performance.now(),
    };

    if (handList.length > 0) {
      const gesture = detectGesture(handList[0], this.lastGesture);
      this.lastGesture = gesture;
      const anchor = controlAnchor(handList);
      // Front camera raw coords are mirrored vs on-screen movement; flip for natural control.
      payload.x = 1 - anchor.x;
      payload.y = anchor.y;
      payload.gesture = gesture;
      payload.tracking = true;
      payload.hands = handList.length;

      const connections = window.HAND_CONNECTIONS ?? HAND_CONNECTIONS;
      const drawConnectors = window.drawConnectors;
      const drawLandmarks = window.drawLandmarks;

      if (drawConnectors && drawLandmarks) {
        this.ctx.save();
        this.ctx.translate(w, 0);
        this.ctx.scale(-1, 1);
        for (const landmarks of handList) {
          const g = detectGesture(landmarks, gesture);
          const color = g === "punch" ? "#ff4d4d" : "#4dff7a";
          drawConnectors(this.ctx, landmarks, connections, { color, lineWidth: 2 });
          drawLandmarks(this.ctx, landmarks, { color, lineWidth: 1, radius: 2 });
        }
        this.ctx.restore();
      }
    }

    if (!this.previewStarted) {
      this.previewStarted = true;
      this.callbacks.onPreviewFrame?.();
    }

    this.callbacks.onFrame(payload);
  }
}
