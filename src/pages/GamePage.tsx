import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BatmanLogo } from "../components/BatmanLogo";
import { JokerLogo } from "../components/JokerLogo";
import { useAuth } from "../context/AuthContext";
import { useGameEngine } from "../hooks/useGameEngine";
import { useHandTracking } from "../hooks/useHandTracking";
import type { Point } from "../types/tracking";
import "../App.css";

export function GamePage() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [gameStarted, setGameStarted] = useState(false);
  const [startFlash, setStartFlash] = useState(false);

  const gameStartedRef = useRef(false);
  const batmanRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const speedTrailRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<Point>({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  });
  const tiltRef = useRef(0);
  const jokerElsRef = useRef<Map<number, HTMLDivElement>>(new Map());

  const beginGame = () => {
    if (gameStartedRef.current) return;
    gameStartedRef.current = true;
    setGameStarted(true);
    setStartFlash(true);
    window.setTimeout(() => setStartFlash(false), 700);
  };

  const {
    stepMotion,
    connection,
    statusMessage,
    hasPreview,
    gesture,
    handSpeed,
    tracking,
    isOffline,
    disconnect,
    reconnect,
  } = useHandTracking({
    token,
    enabled: Boolean(token),
    onGameStart: beginGame,
    previewCanvasRef,
    gameStartedRef,
  });

  const { jokers, jokersRef, normalScore, bossScore, bossActive, tick } = useGameEngine(
    gameStarted,
    posRef,
    gesture,
  );

  const isExtreme = gesture === "punch";

  const statusClass = useMemo(
    () => `status-pill status-pill--${connection}`,
    [connection],
  );

  const handleSignOut = () => {
    disconnect();
    logout();
    navigate("/login", { replace: true });
  };

  useEffect(() => {
    let frameId = 0;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;

      const { position, velocity, speedFactor } = stepMotion(dt);
      posRef.current = position;

      const scale = 1 + speedFactor * 0.14;
      const targetTilt = Math.max(-24, Math.min(24, velocity.x * (0.04 + speedFactor * 0.05)));
      tiltRef.current += (targetTilt - tiltRef.current) * Math.min(1, dt * (8 + speedFactor * 14));

      if (batmanRef.current) {
        batmanRef.current.style.left = `${position.x}px`;
        batmanRef.current.style.top = `${position.y}px`;
        batmanRef.current.style.transform = `translate(-50%, -50%) rotate(${tiltRef.current}deg) scale(${scale})`;
      }

      if (speedTrailRef.current) {
        const showTrail = speedFactor > 0.2;
        speedTrailRef.current.style.opacity = showTrail
          ? String(Math.min(0.85, speedFactor * 0.9 + 0.15))
          : "0";
      }

      tick(time);

      for (const joker of jokersRef.current) {
        const el = jokerElsRef.current.get(joker.id);
        if (!el) continue;
        el.style.left = `${joker.x}px`;
        el.style.top = `${joker.y}px`;
        el.style.transform = `translate(-50%, -50%) rotate(${joker.spin}deg) scale(${joker.type === "boss" ? 1.35 : 1})`;
      }

      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [stepMotion, tick, jokersRef]);

  return (
    <div
      className={`app${isExtreme ? " app--extreme" : ""}${gameStarted ? " app--live" : ""}${isOffline ? " app--offline" : ""}`}
    >
      {connection === "reconnecting" && (
        <div className="connection-banner connection-banner--subtle" role="status" aria-live="polite">
          <p className="connection-banner__text">Reconnecting…</p>
        </div>
      )}

      {isOffline && (
        <div className="connection-banner" role="alert">
          <p className="connection-banner__text">Hand tracking offline</p>
          <button type="button" className="connection-banner__btn" onClick={reconnect}>
            Retry now
          </button>
        </div>
      )}

      {isExtreme && <div className="extreme-vignette" aria-hidden />}

      <header className="header">
        <div className="brand">
          <h1 className="brand-title">Gotham Telekinesis</h1>
          <p className="brand-sub">Batman vs Joker</p>
        </div>

        <div className="header-tools">
          {user && <span className="user-badge">{user.username}</span>}
          {gameStarted && (
            <>
              <div className="score-board score-board--normal">
                <span className="score-label">Normal</span>
                <span className="score-value">{normalScore}</span>
              </div>
              <div className="score-board score-board--boss">
                <span className="score-label">Boss</span>
                <span className="score-value">{bossScore}</span>
              </div>
            </>
          )}
          <div className={`tracking-badge${tracking ? " tracking-badge--active" : ""}`}>
            {tracking ? "Tracking" : "No hand"}
          </div>
          <div
            className={statusClass}
            title={statusMessage}
            role="status"
            aria-live="polite"
          >
            <span className="status-dot" />
            <span className="status-pill__label">{statusMessage}</span>
          </div>
          <button type="button" className="sign-out-btn" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      {isExtreme && (
        <div className="extreme-banner">
          <span className="extreme-banner-dot" />
          EXTREME MODE
        </div>
      )}

      {bossActive && gameStarted && !isExtreme && (
        <div className="boss-warning">
          <span className="boss-warning-dot" />
          <span className="boss-warning__full">BOSS CARD — close fist to slash</span>
          <span className="boss-warning__short">BOSS — use fist</span>
        </div>
      )}

      {!gameStarted && (
        <div className={`game-start-overlay${startFlash ? " game-start-overlay--clap" : ""}`}>
          <div className="game-start-card">
            <p className="game-start-title">Ready</p>
            <p className="game-start-text">Close your fist to start</p>
            <p className="game-start-hint">
              {!tracking
                ? "Show your hand in the camera"
                : gesture === "punch"
                  ? "Fist locked — extreme mode engaged"
                  : "Make a closed fist to enter extreme mode"}
            </p>
            <div className="game-start-pulse" />
          </div>
        </div>
      )}

      <p className="arena-label">
        {!gameStarted
          ? "Close fist to begin"
          : isExtreme
            ? "Power slash active — boss vulnerable"
            : "Open hand · normal cards · fist · boss slash"}
      </p>

      {gameStarted &&
        jokers.map((joker) => (
          <div
            key={joker.id}
            ref={(el) => {
              if (el) jokerElsRef.current.set(joker.id, el);
              else jokerElsRef.current.delete(joker.id);
            }}
            className={`joker-enemy${joker.type === "boss" ? " joker-enemy--boss" : ""}${joker.slashed ? " joker-enemy--slashed" : ""}`}
            style={{
              left: joker.x,
              top: joker.y,
              transform: `translate(-50%, -50%) rotate(${joker.spin}deg) scale(${joker.type === "boss" ? 1.35 : 1})`,
            }}
            aria-hidden
          >
            {joker.type === "boss" && !joker.slashed && (
              <span className="joker-boss-badge">BOSS</span>
            )}
            {joker.slashed ? (
              <>
                <div className="joker-half joker-half--left">
                  <JokerLogo />
                </div>
                <div className="joker-half joker-half--right">
                  <JokerLogo />
                </div>
                <div className="slash-flash" />
              </>
            ) : (
              <JokerLogo />
            )}
          </div>
        ))}

      <div
        ref={batmanRef}
        className={`batman-logo${!gameStarted ? " batman-logo--idle" : ""}${isExtreme ? " batman-logo--extreme" : ""}${handSpeed > 0.35 ? " batman-logo--fast" : ""}`}
        style={{
          left: posRef.current.x,
          top: posRef.current.y,
          transform: "translate(-50%, -50%)",
        }}
        aria-hidden
      >
        <div ref={speedTrailRef} className="batman-speed-trail" style={{ opacity: 0 }} />
        <div className="batman-aura" />
        {isExtreme && (
          <>
            <div className="batman-slash-field" />
            <div className="batman-extreme-ring batman-extreme-ring--1" />
            <div className="batman-extreme-ring batman-extreme-ring--2" />
          </>
        )}
        {!isExtreme && <div className="batman-normal-aura" />}
        <div className="batman-body">
          <BatmanLogo />
        </div>
      </div>

      <aside className="camera-panel">
        <div className="camera-panel-header">
          <h2 className="camera-panel-title">
            <span className="camera-panel-icon">◎</span>
            Hand Tracking
          </h2>
          <span className={`camera-live-badge${hasPreview ? " camera-live-badge--active" : ""}`}>
            <span className="camera-live-badge-dot" />
            {hasPreview ? "Live" : "Offline"}
          </span>
        </div>

        <div className="camera-viewport">
          <canvas
            ref={previewCanvasRef}
            className={`camera-feed${hasPreview ? "" : " camera-feed--hidden"}`}
            aria-label="Hand tracking preview"
          />
          {!hasPreview && (
            <div className="camera-placeholder">
              <div className="camera-spinner" />
              <p className="camera-placeholder-text">Waiting for camera feed…</p>
            </div>
          )}
        </div>

        <div className="camera-panel-footer">
          Low-latency hand control · Fist to start
        </div>
      </aside>
    </div>
  );
}
