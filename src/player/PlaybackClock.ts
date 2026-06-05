import type { PlaybackClockListener, PlaybackClockOptions } from './types';
import { setCurrentTime } from '../stores/currentTimeStore';

interface Subscriber {
  listener: PlaybackClockListener;
  minIntervalMs: number;
  lastEmit: number;
}

/**
 * requestAnimationFrame-based clock that reads from the media element
 * and fans out to subscribers at configurable rates.
 *
 * Usage:
 *  - 60fps subscriber → waveform playhead (canvas)
 *  - 10fps subscriber → transcript active-word highlight
 *  - 4fps subscriber  → Zustand currentTime sync
 */
export class PlaybackClock {
  private rafId: number | null = null;
  private subscribers: Subscriber[] = [];
  private controller: { getCurrentTime(): number } | null = null;
  private running = false;

  /** Attach to a media controller. Call start() to begin ticking. */
  attach(controller: { getCurrentTime(): number }): void {
    this.controller = controller;
  }

  /** Detach and stop. */
  detach(): void {
    this.stop();
    this.controller = null;
  }

  /**
   * Subscribe to clock ticks.
   * @param listener - called with currentTime on each tick (throttled by maxFps).
   * @param options.maxFps - max updates per second (default 60).
   * @returns unsubscribe function.
   */
  subscribe(listener: PlaybackClockListener, options: PlaybackClockOptions = {}): () => void {
    const maxFps = Math.min(options.maxFps ?? 60, 60);
    const minIntervalMs = 1000 / maxFps;

    const sub: Subscriber = { listener, minIntervalMs, lastEmit: 0 };
    this.subscribers.push(sub);

    return () => {
      const idx = this.subscribers.indexOf(sub);
      if (idx >= 0) this.subscribers.splice(idx, 1);
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  private tick = (): void => {
    if (!this.running) return;

    const now = performance.now();
    const time = this.controller?.getCurrentTime() ?? 0;

    // Update the shared external store so non-subscribers can read latest time
    setCurrentTime(time);

    for (const sub of this.subscribers) {
      if (now - sub.lastEmit >= sub.minIntervalMs) {
        sub.lastEmit = now;
        sub.listener(time);
      }
    }

    this.rafId = requestAnimationFrame(this.tick);
  };
}

/** Singleton clock shared across the player workspace. */
export const playbackClock = new PlaybackClock();
