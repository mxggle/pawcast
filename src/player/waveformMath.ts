export interface ViewportResult {
  dpr: number;
  visibleDuration: number;
  startOffset: number;
  endOffset: number;
  startIndex: number;
  endIndex: number;
}

export function computeViewport(params: {
  duration: number;
  zoom: number;
  scrollOffset: number;
  peakCount: number;
  dpr?: number;
}): ViewportResult {
  const dpr = params.dpr ?? 1;
  const visibleDuration =
    params.duration > 0 ? params.duration / params.zoom : 1;
  const startOffset = params.scrollOffset;
  const endOffset = startOffset + visibleDuration;

  let startIndex = 0;
  let endIndex = params.peakCount;

  if (params.duration > 0 && params.peakCount > 0) {
    startIndex = Math.max(
      0,
      Math.floor((startOffset / params.duration) * params.peakCount),
    );
    endIndex = Math.min(
      params.peakCount,
      Math.ceil((endOffset / params.duration) * params.peakCount),
    );
  }

  return { dpr, visibleDuration, startOffset, endOffset, startIndex, endIndex };
}

export function timeToPixel(
  time: number,
  visibleDuration: number,
  startOffset: number,
  canvasWidth: number,
): number {
  if (visibleDuration <= 0) return 0;
  return ((time - startOffset) / visibleDuration) * canvasWidth;
}

export function timeToSampleIndex(
  time: number,
  duration: number,
  sampleCount: number,
): number {
  if (duration <= 0 || sampleCount <= 0) return 0;
  return Math.max(
    0,
    Math.min(sampleCount - 1, Math.floor((time / duration) * sampleCount)),
  );
}
