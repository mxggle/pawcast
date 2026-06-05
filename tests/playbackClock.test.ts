import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock rAF/performance BEFORE importing PlaybackClock
let mockNow = 0;
let rafQueue: Array<() => void> = [];
let nextRafId = 1;
const cancelledIds = new Set<number>();

const originalRAF = globalThis.requestAnimationFrame;
const originalCAF = globalThis.cancelAnimationFrame;
const originalPerfNow = performance.now.bind(performance);

function setupMocks() {
  mockNow = 0;
  rafQueue = [];
  nextRafId = 1;
  cancelledIds.clear();

  globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    const id = nextRafId++;
    rafQueue.push(() => {
      if (!cancelledIds.has(id)) {
        cb(mockNow);
      }
    });
    return id;
  };

  globalThis.cancelAnimationFrame = (id: number): void => {
    cancelledIds.add(id);
  };

  performance.now = () => mockNow;
}

function teardownMocks() {
  globalThis.requestAnimationFrame = originalRAF;
  globalThis.cancelAnimationFrame = originalCAF;
  performance.now = originalPerfNow;
}

function tick(ms: number) {
  mockNow += ms;
  const pending = rafQueue.slice();
  rafQueue = [];
  for (const cb of pending) {
    cb();
  }
}

let PlaybackClockCtor: any;
let playbackClockSingleton: any;

describe('PlaybackClock', { concurrency: false }, () => {
  beforeEach(async () => {
    setupMocks();
    const mod = await import('../src/player/PlaybackClock');
    PlaybackClockCtor = mod.PlaybackClock;
    playbackClockSingleton = mod.playbackClock;
  });

  afterEach(() => {
    teardownMocks();
    playbackClockSingleton?.detach();
  });

  it('attach sets controller, detach clears it and stops', () => {
    const clock = new PlaybackClockCtor();
    const controller = { getCurrentTime: () => 42 };
    clock.attach(controller);
    assert.equal(clock.isRunning, false);
    clock.start();
    assert.equal(clock.isRunning, true);
    clock.detach();
    assert.equal(clock.isRunning, false);
  });

  it('start/stop toggles running state', () => {
    const clock = new PlaybackClockCtor();
    const controller = { getCurrentTime: () => 5 };
    clock.attach(controller);
    clock.start();
    assert.equal(clock.isRunning, true);
    clock.start();
    assert.equal(clock.isRunning, true);
    clock.stop();
    assert.equal(clock.isRunning, false);
    clock.stop();
    assert.equal(clock.isRunning, false);
  });

  it('delivers to 60fps subscriber every frame', () => {
    const clock = new PlaybackClockCtor();
    const controller = { getCurrentTime: () => mockNow / 1000 };
    clock.attach(controller);
    const calls: number[] = [];
    clock.subscribe((t: number) => calls.push(t), { maxFps: 60 });
    clock.start();
    for (let i = 0; i < 10; i++) tick(17);
    clock.stop();
    assert.ok(calls.length >= 6, `Expected >=6 calls at 60fps, got ${calls.length}`);
  });

  it('delivers to 10fps subscriber at ~100ms intervals', () => {
    const clock = new PlaybackClockCtor();
    const controller = { getCurrentTime: () => mockNow / 1000 };
    clock.attach(controller);
    const calls: number[] = [];
    clock.subscribe((t: number) => calls.push(t), { maxFps: 10 });
    clock.start();
    for (let i = 0; i < 5; i++) tick(17);
    assert.ok(calls.length <= 1, `Expected <=1 call in 85ms at 10fps, got ${calls.length}`);
    for (let i = 0; i < 3; i++) tick(17);
    assert.ok(calls.length >= 1, `Expected >=1 call after ~136ms at 10fps, got ${calls.length}`);
    clock.stop();
  });

  it('delivers to 4fps subscriber at ~250ms intervals', () => {
    const clock = new PlaybackClockCtor();
    const controller = { getCurrentTime: () => mockNow / 1000 };
    clock.attach(controller);
    const calls: number[] = [];
    clock.subscribe((t: number) => calls.push(t), { maxFps: 4 });
    clock.start();
    for (let i = 0; i < 14; i++) tick(17);
    assert.ok(calls.length <= 1, `Expected <=1 call in 238ms at 4fps, got ${calls.length}`);
    for (let i = 0; i < 3; i++) tick(17);
    assert.ok(calls.length >= 1, `Expected >=1 call after 289ms at 4fps, got ${calls.length}`);
    clock.stop();
  });

  it('throttles all subscribers independently', () => {
    const clock = new PlaybackClockCtor();
    const controller = { getCurrentTime: () => mockNow / 1000 };
    clock.attach(controller);
    const fast: number[] = [];
    const slow: number[] = [];
    clock.subscribe((t: number) => fast.push(t), { maxFps: 60 });
    clock.subscribe((t: number) => slow.push(t), { maxFps: 4 });
    clock.start();
    for (let i = 0; i < 31; i++) tick(17);
    clock.stop();
    assert.ok(fast.length > 20, `Fast subscriber should have many calls, got ${fast.length}`);
    assert.ok(slow.length <= 3, `Slow subscriber should have few calls, got ${slow.length}`);
    assert.ok(slow.length >= 1, `Slow subscriber should have at least 1 call, got ${slow.length}`);
  });

  it('does not emit ticks when stopped', () => {
    const clock = new PlaybackClockCtor();
    const controller = { getCurrentTime: () => mockNow / 1000 };
    clock.attach(controller);
    const calls: number[] = [];
    clock.subscribe((t: number) => calls.push(t), { maxFps: 60 });
    for (let i = 0; i < 10; i++) tick(17);
    assert.equal(calls.length, 0);
    clock.start();
    for (let i = 0; i < 5; i++) tick(17);
    assert.ok(calls.length > 0);
    const countAfterStart = calls.length;
    clock.stop();
    for (let i = 0; i < 5; i++) tick(17);
    assert.equal(calls.length, countAfterStart);
  });

  it('does not crash when started without controller', () => {
    const clock = new PlaybackClockCtor();
    const calls: number[] = [];
    clock.subscribe((t: number) => calls.push(t), { maxFps: 60 });
    clock.start();
    for (let i = 0; i < 5; i++) tick(17);
    clock.stop();
    for (const t of calls) {
      assert.equal(t, 0);
    }
  });

  it('singleton playbackClock is a PlaybackClock instance', () => {
    assert.ok(playbackClockSingleton instanceof PlaybackClockCtor);
    assert.equal(typeof playbackClockSingleton.attach, 'function');
    assert.equal(typeof playbackClockSingleton.subscribe, 'function');
    assert.equal(typeof playbackClockSingleton.start, 'function');
    assert.equal(typeof playbackClockSingleton.stop, 'function');
  });

  it('unsubscribe removes the listener', () => {
    const clock = new PlaybackClockCtor();
    const controller = { getCurrentTime: () => 1 };
    clock.attach(controller);
    const calls: number[] = [];
    const unsub = clock.subscribe((t: number) => calls.push(t), { maxFps: 60 });
    clock.start();
    for (let i = 0; i < 5; i++) tick(17);
    unsub();
    const countAfterUnsub = calls.length;
    for (let i = 0; i < 5; i++) tick(17);
    clock.stop();
    assert.equal(calls.length, countAfterUnsub);
  });

  it('defaults to 60fps when no options provided', () => {
    const clock = new PlaybackClockCtor();
    const controller = { getCurrentTime: () => mockNow / 1000 };
    clock.attach(controller);
    const calls: number[] = [];
    clock.subscribe((t: number) => calls.push(t));
    clock.start();
    for (let i = 0; i < 10; i++) tick(17);
    clock.stop();
    assert.ok(calls.length >= 6, `Default maxFps should allow frequent calls, got ${calls.length}`);
  });
});
