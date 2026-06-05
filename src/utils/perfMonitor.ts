/**
 * Dev-only performance monitor.
 * Tracks: component render counts, FPS, and PlaybackClock subscriber latency.
 * Imported only in dev — tree-shaken in production builds.
 */

type Listener = () => void;
const listeners = new Set<Listener>();

function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach(fn => fn());
}

// ── Frame budget ──
let frameCount = 0;
let lastFpsTime = performance.now();
let _fps = 0;
let _avgFrameMs = 0;
let frameMsAccum = 0;

(function tick() {
  const now = performance.now();
  frameCount++;

  const elapsed = now - lastFpsTime;
  if (elapsed >= 500) {
    _fps = Math.round((frameCount / elapsed) * 1000);
    _avgFrameMs = Math.round(frameMsAccum / frameCount);
    frameCount = 0;
    frameMsAccum = 0;
    lastFpsTime = now;
    notify();
  }
  requestAnimationFrame(tick);
})();

// ── Render counts ──
const renderCounts = new Map<string, number>();
let renderTotal = 0;

export function bumpRender(name: string): number {
  const next = (renderCounts.get(name) ?? 0) + 1;
  renderCounts.set(name, next);
  renderTotal++;
  return next;
}

// ── Clock callback latency ──
let lastCallbackLatencyMs = 0;
export function recordCallbackLatency(latencyMs: number) {
  lastCallbackLatencyMs = latencyMs;
}

// ── Snapshot for UI ──
export interface PerfSnapshot {
  fps: number;
  avgFrameMs: number;
  renderCounts: Array<[string, number]>;
  renderTotal: number;
  callbackLatencyMs: number;
}

export function getSnapshot(): PerfSnapshot {
  return {
    fps: _fps,
    avgFrameMs: _avgFrameMs,
    renderCounts: [...renderCounts.entries()].sort((a, b) => b[1] - a[1]),
    renderTotal,
    callbackLatencyMs: lastCallbackLatencyMs,
  };
}

export function onPerfSnapshot(fn: Listener) {
  return subscribe(fn);
}
