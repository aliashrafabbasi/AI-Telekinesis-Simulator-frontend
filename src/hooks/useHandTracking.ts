import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  FIST_HOLD_FRAMES,
  FIST_START_COOLDOWN_MS,
  getPlayMargin,
  MOTION_PROFILE,
  PREVIEW_WS_URL,
  TRACKING_MODE,
  WS_URL,
  wsUrlWithToken,
} from "../config/game";
import { BrowserHandTracker } from "../tracking/browserHands";
import { PointerMotionController } from "../motion/pointerMotion";
import { parseHandFrame, type ConnectionState, type HandFrame, type HandGesture } from "../types/tracking";

const MAX_RECONNECT_DELAY_MS = 8_000;
const BASE_RECONNECT_DELAY_MS = 2_000;

type TrackingCallbacks = {
  token?: string | null;
  enabled?: boolean;
  onGameStart?: () => void;
  previewCanvasRef?: RefObject<HTMLCanvasElement | null>;
  gameStartedRef?: RefObject<boolean>;
};

export function useHandTracking(callbacks: TrackingCallbacks = {}) {
  const motionRef = useRef(new PointerMotionController(MOTION_PROFILE));
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [statusMessage, setStatusMessage] = useState("Connecting…");
  const [hasPreview, setHasPreview] = useState(false);
  const [gesture, setGesture] = useState<HandGesture>("open");
  const [handSpeed, setHandSpeed] = useState(0);
  const [tracking, setTracking] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);

  const fistFramesRef = useRef(0);
  const lastStartTriggerRef = useRef(0);
  const handSpeedRef = useRef(0);
  const handSpeedStateRef = useRef(0);
  const gestureRef = useRef<HandGesture>("open");
  const trackingRef = useRef(false);
  const hasPreviewRef = useRef(false);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const wsGenerationRef = useRef(0);
  const controlConnectedRef = useRef(false);
  const onGameStartRef = useRef(callbacks.onGameStart);
  const previewCanvasRef = useRef(callbacks.previewCanvasRef);
  const gameStartedRef = useRef(callbacks.gameStartedRef);
  const tokenRef = useRef(callbacks.token);
  const enabledRef = useRef(callbacks.enabled ?? true);

  previewCanvasRef.current = callbacks.previewCanvasRef;
  gameStartedRef.current = callbacks.gameStartedRef;
  onGameStartRef.current = callbacks.onGameStart;
  tokenRef.current = callbacks.token;
  enabledRef.current = callbacks.enabled ?? true;

  const invalidateSessions = () => {
    wsGenerationRef.current += 1;
  };

  const clearReconnectTimer = () => {
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  };

  const scheduleReconnect = () => {
    if (!tokenRef.current || !enabledRef.current) return;
    if (reconnectTimeoutRef.current !== null) return;

    setConnection("reconnecting");
    setStatusMessage("Reconnecting…");

    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttemptRef.current,
      MAX_RECONNECT_DELAY_MS,
    );
    reconnectAttemptRef.current += 1;

    reconnectTimeoutRef.current = window.setTimeout(() => {
      reconnectTimeoutRef.current = null;
      setSessionKey((key) => key + 1);
    }, delay);
  };

  const disconnect = useCallback(() => {
    invalidateSessions();
    controlConnectedRef.current = false;
    clearReconnectTimer();
    trackingRef.current = false;
    hasPreviewRef.current = false;
    setTracking(false);
    setHasPreview(false);
    setConnection("disconnected");
    setStatusMessage("Disconnected");
  }, []);

  const reconnect = useCallback(() => {
    if (!tokenRef.current || !enabledRef.current) return;
    clearReconnectTimer();
    reconnectAttemptRef.current = 0;
    setConnection("connecting");
    setStatusMessage("Connecting…");
    setSessionKey((key) => key + 1);
  }, []);

  const tryFistStart = () => {
    if (gameStartedRef.current?.current) return;

    const now = performance.now();
    if (now - lastStartTriggerRef.current < FIST_START_COOLDOWN_MS) return;
    lastStartTriggerRef.current = now;
    fistFramesRef.current = 0;
    motionRef.current.markMovementStarted();
    onGameStartRef.current?.();
  };

  const applyControlFrame = (data: HandFrame) => {
    if (data.x >= 0 && data.y >= 0) {
      const frameW = data.frame_w ?? window.innerWidth;
      const frameH = data.frame_h ?? window.innerHeight;
      const timestamp = typeof data.ts === "number" ? data.ts : performance.now();
      motionRef.current.setHandSample(data.x, data.y, frameW, frameH, timestamp);
      if (!trackingRef.current) {
        trackingRef.current = true;
        setTracking(true);
      }
    } else if (trackingRef.current) {
      motionRef.current.clearHand();
      trackingRef.current = false;
      setTracking(false);
    }

    if (data.gesture === "open" || data.gesture === "punch") {
      if (data.gesture !== gestureRef.current) {
        gestureRef.current = data.gesture;
        setGesture(data.gesture);
      }

      if (!gameStartedRef.current?.current) {
        if (data.gesture === "punch" && trackingRef.current) {
          fistFramesRef.current += 1;
          if (fistFramesRef.current >= FIST_HOLD_FRAMES) {
            tryFistStart();
          }
        } else {
          fistFramesRef.current = 0;
        }
      }
    }
  };

  useEffect(() => {
    const syncViewport = () => {
      motionRef.current.syncViewport(getPlayMargin());
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    if (TRACKING_MODE !== "browser") return;

    const token = callbacks.token;
    const enabled = callbacks.enabled ?? true;

    if (!token || !enabled) {
      invalidateSessions();
      controlConnectedRef.current = false;
      setTracking(false);
      setHasPreview(false);
      setConnection("disconnected");
      setStatusMessage("Sign in required");
      return;
    }

    let tracker: BrowserHandTracker | null = null;
    let previewRafId: number | null = null;
    let active = true;

    const paintPreviewLoop = () => {
      if (!active) return;
      const canvas = previewCanvasRef.current?.current;
      if (canvas && tracker && hasPreviewRef.current) {
        tracker.paintPreview(canvas);
      }
      previewRafId = requestAnimationFrame(paintPreviewLoop);
    };

    setConnection("connecting");
    setStatusMessage("Starting camera…");

    paintPreviewLoop();

    tracker = new BrowserHandTracker({
      onFrame: (frame) => {
        if (!active) return;
        applyControlFrame(frame);
      },
      onPreviewReady: () => {
        if (!active) return;
        controlConnectedRef.current = true;
        hasPreviewRef.current = true;
        setHasPreview(true);
        setConnection("connected");
        setStatusMessage("Camera live");
      },
      onPreviewFrame: () => {
        if (!active) return;
        if (!hasPreviewRef.current) {
          hasPreviewRef.current = true;
          setHasPreview(true);
        }
      },
      onError: (message) => {
        if (!active) return;
        setConnection("disconnected");
        setStatusMessage(message);
      },
    });

    void tracker.start().catch((err: unknown) => {
      if (!active) return;
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Camera unavailable — allow webcam access";
      setConnection("disconnected");
      setStatusMessage(message);
    });

    return () => {
      active = false;
      controlConnectedRef.current = false;
      if (previewRafId !== null) {
        cancelAnimationFrame(previewRafId);
      }
      tracker?.stop();
      hasPreviewRef.current = false;
      setHasPreview(false);
      setTracking(false);
      trackingRef.current = false;
    };
  }, [callbacks.token, callbacks.enabled, sessionKey]);

  useEffect(() => {
    if (TRACKING_MODE !== "server") return;

    const token = callbacks.token;
    const enabled = callbacks.enabled ?? true;

    if (!token || !enabled) {
      invalidateSessions();
      clearReconnectTimer();
      controlConnectedRef.current = false;
      setTracking(false);
      setHasPreview(false);
      setConnection("disconnected");
      setStatusMessage("Sign in required");
      return;
    }

    const generation = ++wsGenerationRef.current;
    const isCurrent = () => wsGenerationRef.current === generation;

    controlConnectedRef.current = false;
    clearReconnectTimer();

    let controlWs: WebSocket | null = null;
    let previewWs: WebSocket | null = null;
    let previewReconnectTimer: number | null = null;
    let controlLossHandled = false;
    let controlEverOpened = false;

    let latestPreview: ArrayBuffer | null = null;
    let previewRafId: number | null = null;

    const paintPreviewToCanvas = (bitmap: ImageBitmap) => {
      const canvas = previewCanvasRef.current?.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx || !canvas) return;

      const parent = canvas.parentElement;
      const rect = parent?.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.max(1, Math.round((rect?.width ?? bitmap.width) * dpr));
      const targetH = Math.max(1, Math.round((rect?.height ?? bitmap.height) * dpr));

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, targetW, targetH);
      ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    };

    const renderPreviewFrame = () => {
      previewRafId = null;
      if (!isCurrent()) return;

      const data = latestPreview;
      if (!data) return;
      latestPreview = null;

      void (async () => {
        try {
          const bitmap = await createImageBitmap(new Blob([data], { type: "image/jpeg" }));
          if (!isCurrent()) {
            bitmap.close();
            return;
          }

          paintPreviewToCanvas(bitmap);
          bitmap.close();

          if (!hasPreviewRef.current) {
            hasPreviewRef.current = true;
            setHasPreview(true);
          }
        } catch {
          // skip corrupt preview frames
        } finally {
          if (latestPreview && isCurrent()) {
            schedulePreviewRender();
          }
        }
      })();
    };

    const schedulePreviewRender = () => {
      if (previewRafId !== null) return;
      previewRafId = requestAnimationFrame(renderPreviewFrame);
    };

    const queuePreviewFrame = (data: ArrayBuffer) => {
      if (!isCurrent()) return;
      latestPreview = data;
      schedulePreviewRender();
    };

    const closeSockets = () => {
      if (previewRafId !== null) {
        cancelAnimationFrame(previewRafId);
        previewRafId = null;
      }
      latestPreview = null;

      if (previewReconnectTimer !== null) {
        window.clearTimeout(previewReconnectTimer);
        previewReconnectTimer = null;
      }
      if (previewWs) {
        previewWs.onclose = null;
        previewWs.close();
        previewWs = null;
      }
      if (controlWs) {
        controlWs.onclose = null;
        controlWs.onopen = null;
        controlWs.close();
        controlWs = null;
      }
    };

    const connectPreview = () => {
      if (!isCurrent() || !controlConnectedRef.current) return;

      if (!PREVIEW_WS_URL) return;
      previewWs = new WebSocket(wsUrlWithToken(PREVIEW_WS_URL, token));
      previewWs.binaryType = "arraybuffer";

      previewWs.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          queuePreviewFrame(event.data);
        }
      };

      previewWs.onclose = () => {
        if (!isCurrent()) return;

        hasPreviewRef.current = false;
        setHasPreview(false);

        if (controlConnectedRef.current && previewReconnectTimer === null) {
          previewReconnectTimer = window.setTimeout(() => {
            previewReconnectTimer = null;
            if (isCurrent() && controlConnectedRef.current) {
              connectPreview();
            }
          }, 2_000);
        }
      };
    };

    setConnection((state) => (state === "reconnecting" ? "reconnecting" : "connecting"));
    setStatusMessage("Connecting…");

    if (!WS_URL) return;
    controlWs = new WebSocket(wsUrlWithToken(WS_URL, token));

    controlWs.onopen = () => {
      if (!isCurrent()) return;

      controlEverOpened = true;
      controlConnectedRef.current = true;
      reconnectAttemptRef.current = 0;
      setConnection("connected");
      setStatusMessage("Connected");
      connectPreview();
    };

    controlWs.onmessage = (event) => {
      if (!isCurrent()) return;
      try {
        const frame = parseHandFrame(JSON.parse(event.data as string));
        if (frame) applyControlFrame(frame);
      } catch {
        // ignore malformed frames
      }
    };

    controlWs.onclose = () => {
      if (!isCurrent() || controlLossHandled || !controlEverOpened) return;

      controlLossHandled = true;
      controlConnectedRef.current = false;
      hasPreviewRef.current = false;
      setHasPreview(false);
      setTracking(false);
      trackingRef.current = false;
      closeSockets();
      scheduleReconnect();
    };

    return () => {
      if (wsGenerationRef.current === generation) {
        wsGenerationRef.current += 1;
      }
      controlConnectedRef.current = false;
      clearReconnectTimer();
      closeSockets();
    };
  }, [callbacks.token, callbacks.enabled, sessionKey]);

  const stepMotion = useCallback((dt: number) => {
    const next = motionRef.current.step(dt);
    const speedFactor = motionRef.current.getHandSpeedFactor();
    handSpeedRef.current += (speedFactor - handSpeedRef.current) * Math.min(1, dt * 18);

    if (Math.abs(handSpeedRef.current - handSpeedStateRef.current) > 0.08) {
      handSpeedStateRef.current = handSpeedRef.current;
      setHandSpeed(handSpeedRef.current);
    }

    return {
      position: next,
      velocity: motionRef.current.getVelocity(),
      speedFactor: handSpeedRef.current,
    };
  }, []);

  const isOffline = connection === "disconnected";

  return {
    stepMotion,
    connection,
    statusMessage,
    hasPreview,
    gesture,
    handSpeed,
    tracking,
    isOffline,
    motionRef,
    disconnect,
    reconnect,
  };
}
