export type Point = { x: number; y: number };

export type PointerMotionConfig = {
  margin: number;
  sensitivity: number;
  euroMinCutoff: number;
  euroBeta: number;
  followRateActive: number;
  followRateIdle: number;
  lostHandReturnSpeed: number;
  maxNormJump: number;
};

export const DEFAULT_POINTER_CONFIG: PointerMotionConfig = {
  margin: 80,
  sensitivity: 2.65,
  euroMinCutoff: 1.35,
  euroBeta: 0.14,
  followRateActive: 48,
  followRateIdle: 10,
  lostHandReturnSpeed: 2.2,
  maxNormJump: 0.18,
};

class LowPassFilter {
  private y = 0;
  private initialized = false;

  filter(value: number, alpha: number): number {
    if (!this.initialized) {
      this.y = value;
      this.initialized = true;
      return value;
    }
    this.y = alpha * value + (1 - alpha) * this.y;
    return this.y;
  }

  reset(value = 0) {
    this.y = value;
    this.initialized = false;
  }
}

class OneEuroAxis {
  private valueFilter = new LowPassFilter();
  private derivativeFilter = new LowPassFilter();
  private lastValue = 0;
  private lastTime = 0;
  private minCutoff: number;
  private beta: number;

  constructor(minCutoff: number, beta: number) {
    this.minCutoff = minCutoff;
    this.beta = beta;
  }

  filter(value: number, timestampMs: number): number {
    if (this.lastTime === 0) {
      this.lastTime = timestampMs;
      this.lastValue = value;
      this.valueFilter.reset(value);
      this.derivativeFilter.reset(0);
      return value;
    }

    const dt = Math.max((timestampMs - this.lastTime) / 1000, 1 / 240);
    this.lastTime = timestampMs;

    const derivative = (value - this.lastValue) / dt;
    this.lastValue = value;

    const derivativeAlpha = this.alpha(dt, 1.0);
    const filteredDerivative = this.derivativeFilter.filter(derivative, derivativeAlpha);
    const cutoff = this.minCutoff + this.beta * Math.abs(filteredDerivative);
    const valueAlpha = this.alpha(dt, cutoff);

    return this.valueFilter.filter(value, valueAlpha);
  }

  reset() {
    this.lastTime = 0;
    this.lastValue = 0;
    this.valueFilter.reset();
    this.derivativeFilter.reset();
  }

  private alpha(dt: number, cutoff: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
}

class OneEuroFilter2D {
  private xFilter: OneEuroAxis;
  private yFilter: OneEuroAxis;

  constructor(minCutoff: number, beta: number) {
    this.xFilter = new OneEuroAxis(minCutoff, beta);
    this.yFilter = new OneEuroAxis(minCutoff, beta);
  }

  filter(point: Point, timestampMs: number): Point {
    return {
      x: this.xFilter.filter(point.x, timestampMs),
      y: this.yFilter.filter(point.y, timestampMs),
    };
  }

  reset() {
    this.xFilter.reset();
    this.yFilter.reset();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mapHandToScreen(hand: Point, sensitivity: number, margin: number): Point {
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const amplifiedX = 0.5 + (hand.x - 0.5) * sensitivity;
  const amplifiedY = 0.5 + (hand.y - 0.5) * sensitivity;

  return {
    x: clamp(amplifiedX * viewportW, margin, viewportW - margin),
    y: clamp(amplifiedY * viewportH, margin, viewportH - margin),
  };
}

export class PointerMotionController {
  private config: PointerMotionConfig;
  private euro: OneEuroFilter2D;
  private target: Point;
  private position: Point;
  private prevPosition: Point;
  private vx = 0;
  private vy = 0;
  private lastNorm: Point | null = null;
  private handActive = false;
  private handSpeedT = 0;
  private movementStarted = false;
  private home: Point;

  constructor(config: Partial<PointerMotionConfig> = {}) {
    this.config = { ...DEFAULT_POINTER_CONFIG, ...config };
    this.home = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    this.target = { ...this.home };
    this.position = { ...this.home };
    this.prevPosition = { ...this.home };
    this.euro = new OneEuroFilter2D(this.config.euroMinCutoff, this.config.euroBeta);
  }

  setHandSample(
    handX: number,
    handY: number,
    frameW: number,
    frameH: number,
    timestampMs: number,
  ) {
    const rawX = handX <= 1 ? handX : handX / frameW;
    const rawY = handY <= 1 ? handY : handY / frameH;

    if (this.lastNorm) {
      const jump = Math.hypot(rawX - this.lastNorm.x, rawY - this.lastNorm.y);
      if (jump > this.config.maxNormJump) return;
      if (jump > 0.001) this.movementStarted = true;
    }

    this.lastNorm = { x: rawX, y: rawY };
    this.handActive = true;

    const filtered = this.euro.filter({ x: rawX, y: rawY }, timestampMs);
    this.target = mapHandToScreen(filtered, this.config.sensitivity, this.config.margin);
  }

  clearHand() {
    this.handActive = false;
    this.lastNorm = null;
    this.handSpeedT *= 0.85;
    this.euro.reset();
  }

  step(dt: number): Point {
    if (!this.handActive) {
      this.handSpeedT *= 0.88;
      const t = clamp(dt * this.config.lostHandReturnSpeed, 0, 1);
      this.target = {
        x: this.target.x + (this.home.x - this.target.x) * t,
        y: this.target.y + (this.home.y - this.target.y) * t,
      };
    }

    const followRate = this.handActive
      ? this.config.followRateActive
      : this.config.followRateIdle;
    const blend = 1 - Math.exp(-dt * followRate);

    this.prevPosition = { ...this.position };
    this.position = {
      x: this.position.x + (this.target.x - this.position.x) * blend,
      y: this.position.y + (this.target.y - this.position.y) * blend,
    };

    if (dt > 0) {
      this.vx = (this.position.x - this.prevPosition.x) / dt;
      this.vy = (this.position.y - this.prevPosition.y) / dt;
      const speed = Math.hypot(this.vx, this.vy);
      this.handSpeedT += (clamp(speed / 1200, 0, 1) - this.handSpeedT) * Math.min(1, dt * 20);
    }

    return this.position;
  }

  getPosition(): Point {
    return this.position;
  }

  getVelocity(): Point {
    return { x: this.vx, y: this.vy };
  }

  getHandSpeedFactor(): number {
    return this.handSpeedT;
  }

  hasMovementStarted(): boolean {
    return this.movementStarted;
  }

  markMovementStarted(): void {
    this.movementStarted = true;
  }

  syncViewport(margin: number): void {
    this.config.margin = margin;
    this.home = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
  }

  isHandActive(): boolean {
    return this.handActive;
  }
}
