import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeViewport,
  timeToPixel,
  timeToSampleIndex,
} from '../src/player/waveformMath';

describe('computeViewport', () => {
  it('computes full viewport at zoom=1 with 1000 peaks over 10s', () => {
    const result = computeViewport({
      duration: 10,
      zoom: 1,
      scrollOffset: 0,
      peakCount: 1000,
      dpr: 2,
    });
    assert.equal(result.dpr, 2);
    assert.equal(result.visibleDuration, 10);
    assert.equal(result.startOffset, 0);
    assert.equal(result.endOffset, 10);
    assert.equal(result.startIndex, 0);
    assert.equal(result.endIndex, 1000);
  });

  it('zooms in correctly (zoom=2 halves visible duration)', () => {
    const result = computeViewport({
      duration: 10,
      zoom: 2,
      scrollOffset: 0,
      peakCount: 1000,
    });
    assert.equal(result.visibleDuration, 5);
    assert.equal(result.startOffset, 0);
    assert.equal(result.endOffset, 5);
  });

  it('handles scroll offset', () => {
    const result = computeViewport({
      duration: 10,
      zoom: 2,
      scrollOffset: 2.5,
      peakCount: 1000,
    });
    assert.equal(result.startOffset, 2.5);
    assert.equal(result.endOffset, 7.5);
    assert.ok(result.startIndex >= 200);
    assert.ok(result.endIndex <= 800);
  });

  it('clamps peak indices to valid range', () => {
    const result = computeViewport({
      duration: 10,
      zoom: 1,
      scrollOffset: 0,
      peakCount: 1000,
    });
    assert.equal(result.startIndex, 0);
    assert.equal(result.endIndex, 1000);
  });

  it('handles zero duration gracefully', () => {
    const result = computeViewport({
      duration: 0,
      zoom: 1,
      scrollOffset: 0,
      peakCount: 100,
    });
    assert.equal(result.visibleDuration, 1);
    assert.equal(result.startIndex, 0);
    assert.equal(result.endIndex, 100);
  });

  it('handles zero peak count gracefully', () => {
    const result = computeViewport({
      duration: 10,
      zoom: 1,
      scrollOffset: 0,
      peakCount: 0,
    });
    assert.equal(result.startIndex, 0);
    assert.equal(result.endIndex, 0);
  });

  it('zoom at extreme values', () => {
    const z10 = computeViewport({
      duration: 100,
      zoom: 10,
      scrollOffset: 0,
      peakCount: 1000,
    });
    assert.equal(z10.visibleDuration, 10);

    const z05 = computeViewport({
      duration: 100,
      zoom: 0.5,
      scrollOffset: 0,
      peakCount: 1000,
    });
    assert.equal(z05.visibleDuration, 200);
  });
});

describe('timeToPixel', () => {
  it('maps start of viewport to pixel 0', () => {
    assert.equal(timeToPixel(0, 10, 0, 800), 0);
    assert.equal(timeToPixel(5, 10, 5, 800), 0);
  });

  it('maps end of viewport to canvas width', () => {
    const x = timeToPixel(10, 10, 0, 800);
    assert.ok(Math.abs(x - 800) < 0.01);
  });

  it('maps middle of viewport to middle of canvas', () => {
    const x = timeToPixel(5, 10, 0, 800);
    assert.ok(Math.abs(x - 400) < 0.01);
  });

  it('handles time before viewport', () => {
    const x = timeToPixel(3, 10, 5, 800);
    assert.ok(x < 0);
  });

  it('handles time after viewport', () => {
    const x = timeToPixel(20, 10, 5, 800);
    assert.ok(x > 800);
  });

  it('returns 0 for zero visible duration', () => {
    assert.equal(timeToPixel(5, 0, 0, 800), 0);
  });

  it('scales with dpr-like canvas width', () => {
    const x1 = timeToPixel(5, 10, 0, 800);
    const x2 = timeToPixel(5, 10, 0, 1600);
    assert.equal(x2, x1 * 2);
  });
});

describe('timeToSampleIndex', () => {
  it('maps time 0 to index 0', () => {
    assert.equal(timeToSampleIndex(0, 10, 1000), 0);
  });

  it('maps end time to last index', () => {
    assert.equal(timeToSampleIndex(10, 10, 1000), 999);
  });

  it('maps middle time correctly', () => {
    assert.equal(timeToSampleIndex(5, 10, 1000), 500);
  });

  it('clamps to valid range', () => {
    assert.equal(timeToSampleIndex(-1, 10, 1000), 0);
    assert.equal(timeToSampleIndex(11, 10, 1000), 999);
    assert.equal(timeToSampleIndex(100, 10, 1000), 999);
  });

  it('handles zero duration', () => {
    assert.equal(timeToSampleIndex(5, 0, 1000), 0);
  });

  it('handles zero sample count', () => {
    assert.equal(timeToSampleIndex(5, 10, 0), 0);
  });

  it('handles single sample', () => {
    assert.equal(timeToSampleIndex(0, 10, 1), 0);
    assert.equal(timeToSampleIndex(5, 10, 1), 0);
    assert.equal(timeToSampleIndex(10, 10, 1), 0);
  });
});
