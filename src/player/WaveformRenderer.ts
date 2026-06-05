/**
 * WaveformRenderer -- high-performance 3-layer Canvas waveform renderer.
 *
 * Three stacked <canvas> elements split the draw cost:
 *   static   - waveform peaks + shadowing area    -> redraws on zoom/scroll/data-change
 *   overlay  - bookmarks, loop range, selection   -> redraws on interaction
 *   playhead - playhead line + triangle handle    -> redraws 60fps (cheap, just 1 line)
 *
 * Pure TypeScript; no React dependencies.
 * Theme colours come from useThemeStore.getState().colors.
 */
import type { WaveformLevelData } from './types';
import { useThemeStore } from "../stores/themeStore";
import { hexToRgba } from "../utils/theme";

export interface BookmarkRenderData {
  id: string; start: number; end: number; name: string;
}

/** Bookmark lane geometry (CSS pixels). Shared between the renderer and the
 *  React hit-test layer so drawn lanes and clickable rects always match. */
export interface BookmarkLaneLayout { pad: number; height: number; gap: number; }
export function getBookmarkLaneLayout(isMobile: boolean): BookmarkLaneLayout {
  return isMobile
    ? { pad: 8, height: 28, gap: 4 }
    : { pad: 4, height: 20, gap: 3 };
}
export interface ShadowingWaveformData {
  start: number; peaks: Float32Array; duration: number;
  takeIndex?: number;
  /** Original raw audio peak data for better waveform rendering (bipolar). */
  rawPeaks?: Float32Array;
}
export interface RecordingOverlayData {
  startTime: number; peaks: number[]; peakTimes: number[];
}

interface CanvasSet {
  cvs: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  lastW: number;
  lastH: number;
}
function dpr(): number {
  return typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
}

export class WaveformRenderer {
  private _s: CanvasSet;
  private _o: CanvasSet;
  private _p: CanvasSet;

  private _peaks: Float32Array | null = null;
  private _min: Int16Array | null = null;
  private _max: Int16Array | null = null;
  private _rms: Uint16Array | null = null;
  private _duration = 0;
  private _zoom = 1;
  private _scrollOffset = 0;
  private _playheadTime = 0;
  private _loopStart: number | null = null;
  private _loopEnd: number | null = null;
  private _dragSelection: { start: number; end: number } | null = null;
  private _transcriptSelection: { start: number; end: number } | null = null;
  private _bookmarks: BookmarkRenderData[] = [];
  private _selectedId: string | null = null;
  private _shadowingExpanded = false;
  private _shadowingWaveforms: ShadowingWaveformData[] = [];
  private _currentTakeIndex: number | null = null;
  private _recordingOverlay: RecordingOverlayData | null = null;
  private _fadingRecording: { startedAt: number; data: RecordingOverlayData } | null = null;
  private _isMobile = false;

  constructor(canvases: {
    static: HTMLCanvasElement;
    overlay: HTMLCanvasElement;
    playhead: HTMLCanvasElement;
  }) {
    const s = canvases.static.getContext("2d");
    const o = canvases.overlay.getContext("2d");
    const p = canvases.playhead.getContext("2d");
    if (!s || !o || !p) throw new Error("WaveformRenderer: failed to get 2D context");
    this._s = { cvs: canvases.static, ctx: s, lastW: 0, lastH: 0 };
    this._o = { cvs: canvases.overlay, ctx: o, lastW: 0, lastH: 0 };
    this._p = { cvs: canvases.playhead, ctx: p, lastW: 0, lastH: 0 };
  }

  // ==================== Public API ====================

  setWaveform(peaks: Float32Array, duration: number): void {
    this._peaks = peaks; this._duration = duration; this.redrawStatic();
  }
  setWaveformData(data: WaveformLevelData): void {
    this._min = data.min;
    this._max = data.max;
    this._rms = data.rms;
    this._duration = (data.min.length * data.samplesPerPeak) / data.sampleRate;
    this.redrawStatic();
  }
  setViewport(zoom: number, scrollOffset: number): void {
    this._zoom = zoom; this._scrollOffset = scrollOffset; this.redrawStatic(); this.redrawOverlay();
  }
  setPlayhead(time: number): void {
    this._playheadTime = time; this.redrawPlayhead();
  }
  setLoopRange(start: number | null, end: number | null): void {
    this._loopStart = start; this._loopEnd = end; this.redrawOverlay();
  }
  setDragSelection(range: { start: number; end: number } | null): void {
    this._dragSelection = range; this.redrawOverlay();
  }
  setTranscriptSelection(range: { start: number; end: number } | null): void {
    this._transcriptSelection = range; this.redrawOverlay();
  }
  setBookmarks(bookmarks: BookmarkRenderData[], selectedId: string | null): void {
    this._bookmarks = bookmarks; this._selectedId = selectedId; this.redrawOverlay();
  }
  setMobile(isMobile: boolean): void {
    if (this._isMobile === isMobile) return;
    this._isMobile = isMobile; this.redrawOverlay();
  }
  setShadowingExpanded(expanded: boolean): void {
    this._shadowingExpanded = expanded; this.redrawStatic();
  }
  setShadowingWaveforms(waveforms: ShadowingWaveformData[]): void {
    this._shadowingWaveforms = waveforms; this.redrawStatic();
  }
  setCurrentTakeIndex(index: number | null): void {
    this._currentTakeIndex = index; this.redrawStatic();
  }
  setRecordingOverlay(recording: RecordingOverlayData | null): void {
    this._recordingOverlay = recording; this._fadingRecording = null; this.redrawStatic();
  }
  setFadingRecording(data: RecordingOverlayData | null): void {
    this._fadingRecording = data ? { startedAt: performance.now(), data } : null;
    this.redrawStatic();
  }
  redrawStatic(): void { this._drawStaticLayer(); }
  redrawOverlay(): void { this._drawOverlayLayer(); }
  redrawPlayhead(): void { this._drawPlayheadLayer(); }
  redrawAll(): void { this.redrawStatic(); this.redrawOverlay(); this.redrawPlayhead(); }
  destroy(): void {
    this._peaks = null; this._min = null; this._max = null; this._rms = null;
    this._bookmarks = []; this._shadowingWaveforms = [];
    this._recordingOverlay = null; this._fadingRecording = null;
    this._clear(this._s); this._clear(this._o); this._clear(this._p);
  }

  // ==================== Canvas helpers ====================

  private _resize(cs: CanvasSet): boolean {
    const w = cs.cvs.clientWidth, h = cs.cvs.clientHeight;
    if (!w || !h) return false;
    const p = dpr(), tw = w * p, th = h * p;
    if (tw !== cs.lastW || th !== cs.lastH) {
      cs.cvs.width = tw; cs.cvs.height = th; cs.lastW = tw; cs.lastH = th;
    }
    return true;
  }
  private _clear(cs: CanvasSet): void {
    cs.ctx.clearRect(0, 0, cs.cvs.width, cs.cvs.height);
  }
  private _roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
  private _vp() {
    const p = dpr();
    const visibleDuration = this._duration > 0 ? this._duration / this._zoom : 1;
    const startOffset = this._scrollOffset;
    const endOffset = startOffset + visibleDuration;
    const peakLen = this._min ? this._min.length : (this._peaks ? this._peaks.length : 0);
    let si = 0, ei = peakLen;
    if (this._duration > 0 && peakLen > 0) {
      si = Math.max(0, Math.floor((startOffset / this._duration) * peakLen));
      ei = Math.min(peakLen, Math.ceil((endOffset / this._duration) * peakLen));
    }
    return { dpr: p, visibleDuration, startOffset, endOffset, startIndex: si, endIndex: ei };
  }

  // ==================== Static layer ====================

  private _drawStaticLayer(): void {
    const cs = this._s;
    if (!this._resize(cs)) return;
    this._clear(cs);
    const ctx = cs.ctx, cw = cs.cvs.width, ch = cs.cvs.height;
    const { dpr, visibleDuration, startOffset, endOffset, startIndex, endIndex } = this._vp();
    const colors = useThemeStore.getState().colors;

    const mainH = this._shadowingExpanded ? ch / 2 : ch;
    const mainPad = 2 * dpr;
    const mainDrawH = Math.max(0, mainH - mainPad * 2);
    const mainCenterY = mainH / 2;

    if (this._peaks && this._peaks.length > 0) {
      const totalSamples = this._peaks.length;
      const sampleDur = this._duration > 0 ? this._duration / totalSamples : 1;
      const sliceW = (sampleDur / visibleDuration) * cw;
      const ampScale = mainDrawH;
      const cssBarW = Math.max(0.5, Math.min(sliceW / dpr, 2));
      const barW = cssBarW * dpr;

      ctx.fillStyle = colors.primary;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, mainPad, cw, mainDrawH);
      ctx.clip();
      for (let i = startIndex; i < endIndex; i++) {
        const t = i * sampleDur;
        const x = ((t - startOffset) / visibleDuration) * cw;
        const v = this._peaks[i];
        const h = Math.min(mainDrawH, Math.max(1 * dpr, v * ampScale * 0.8));
        ctx.fillRect(x, Math.max(mainPad, mainCenterY - h / 2), barW, h);
      }
      ctx.restore();
    }

    // Draw min/max/rms waveform when available (takes priority over peaks)
    if (this._min && this._max && this._min.length > 0) {
      const totalSamples = this._min.length;
      const sampleDur = this._duration > 0 ? this._duration / totalSamples : 1;
      const sliceW = (sampleDur / visibleDuration) * cw;
      const halfH = mainDrawH / 2;
      const scale = halfH / 32768; // int16 range
      const cssBarW = Math.max(1, Math.min(sliceW / dpr, 3));
      const barW = cssBarW * dpr;

      // Draw filled waveform: max above center, min below center
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, mainPad, cw, mainDrawH);
      ctx.clip();

      for (let i = startIndex; i < endIndex; i++) {
        const t = i * sampleDur;
        const x = ((t - startOffset) / visibleDuration) * cw;

        const maxVal = this._max[i] * scale;
        const minVal = this._min[i] * scale;
        const top = mainCenterY - maxVal;
        const bottom = mainCenterY - minVal; // min is negative → below center
        const h = Math.max(1 * dpr, bottom - top);

        // Fill the main waveform bar
        ctx.fillStyle = colors.primary;
        ctx.fillRect(x, top, barW, h);

        // Draw RMS as an inner highlight band — softer, brighter inside
        if (this._rms) {
          const rmsVal = this._rms[i] * scale * 0.6;
          const rmsTop = mainCenterY - rmsVal;
          const rmsH = Math.max(0.5 * dpr, rmsVal * 2);
          ctx.fillStyle = `${colors.primary}66`; // ~40% alpha overlay
          ctx.fillRect(x, rmsTop, barW, rmsH);
        }
      }
      ctx.restore();
    }

    // Center reference line — subtle 10% primary, full width
    ctx.fillStyle = hexToRgba(colors.primary, 0.1);
    ctx.fillRect(0, mainCenterY - 0.5 * dpr, cw, 1 * dpr);

    // Shadowing area (lower half when expanded)
    if (this._shadowingExpanded) {
      const sTop = mainH, sH = ch - mainH;
      const sCenterY = sTop + sH / 2;
      const sPad = 2 * dpr;
      const sDrawH = Math.max(0, sH - sPad * 2);

      // Soft gradient separator between Original and Shadowing regions
      const sepGradient = ctx.createLinearGradient(0, sTop, cw, sTop);
      sepGradient.addColorStop(0, hexToRgba(colors.primary, 0.3));
      sepGradient.addColorStop(0.5, "rgba(0,0,0,0)");
      sepGradient.addColorStop(1, hexToRgba(colors.primary, 0.3));
      ctx.fillStyle = sepGradient;
      ctx.fillRect(0, sTop, cw, 1 * dpr);

      if (this._shadowingWaveforms.length === 0 && !this._recordingOverlay && !this._fadingRecording) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.lineWidth = 1 * dpr;
        ctx.moveTo(0, sCenterY); ctx.lineTo(cw, sCenterY);
        ctx.stroke();
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, sTop + sPad, cw, sDrawH);
      ctx.clip();

      // Per-take color palette — derived from success green with varying hue shifts
      const takeColors = [
        colors.success,
        '#34d399',
        '#6ee7b7',
        '#059669',
        '#10b981',
        '#047857',
      ];

      for (let segIdx = 0; segIdx < this._shadowingWaveforms.length; segIdx++) {
        const seg = this._shadowingWaveforms[segIdx];
        const segEnd = seg.start + seg.duration;
        if (segEnd < startOffset || seg.start > endOffset) continue;

        // Take dimming: when a take is selected, others fade to 50%
        const isCurrent = this._currentTakeIndex === null || this._currentTakeIndex === segIdx;
        const takeAlpha = isCurrent ? 1.0 : 0.5;
        const alphaHex = Math.round(takeAlpha * 255).toString(16).padStart(2, "0");
        const innerAlphaHex = Math.round(takeAlpha * 0x70).toString(16).padStart(2, "0");

        const takeColor = takeColors[(seg.takeIndex ?? segIdx) % takeColors.length];
        const sDur = seg.duration / seg.peaks.length;
        const sliceW = (sDur / visibleDuration) * cw;
        const cssBarW = Math.max(1, Math.min(sliceW / dpr, 3));
        const barW = cssBarW * dpr;
        const peakScale = 0.8; // scale peaks to look natural

        for (let i = 0; i < seg.peaks.length; i++) {
          const t = seg.start + i * sDur;
          if (t < startOffset || t > endOffset) continue;
          const x = ((t - startOffset) / visibleDuration) * cw;
          // Symmetric bipolar waveform from single peak value
          const val = Math.min(1, seg.peaks[i] * 2.2);
          const barH = Math.max(1.5 * dpr, val * sDrawH * peakScale);
          const top = sCenterY - barH / 2;

          // Fill with segment color (dimmed if non-current take)
          ctx.fillStyle = `${takeColor}${alphaHex}`;
          ctx.fillRect(x, top, barW, barH);

          // Inner highlight band (like RMS in main waveform)
          const innerH = Math.max(0.5 * dpr, barH * 0.45);
          ctx.fillStyle = `${takeColor}${innerAlphaHex}`;
          ctx.fillRect(x, sCenterY - innerH / 2, barW, innerH);
        }

        // Take label (T1, T2, …) above the take's start position
        const labelX = ((seg.start - startOffset) / visibleDuration) * cw;
        if (labelX >= 0 && labelX < cw) {
          ctx.save();
          ctx.globalAlpha = takeAlpha;
          // Color bar above the take
          ctx.fillStyle = takeColor;
          ctx.fillRect(labelX, sTop + sPad, 2 * dpr, 6 * dpr);
          // T# label
          ctx.fillStyle = takeColor;
          ctx.font = `${10 * dpr}px monospace`;
          ctx.textBaseline = "top";
          ctx.textAlign = "left";
          ctx.fillText(`T${segIdx + 1}`, labelX + 4 * dpr, sTop + sPad);
          ctx.restore();
        }
      }

      // Empty shadowing ghost text (expanded but no takes / no recording)
      if (this._shadowingWaveforms.length === 0 && !this._recordingOverlay && !this._fadingRecording) {
        ctx.save();
        ctx.fillStyle = "rgba(148,163,184,0.6)"; // soft gray
        ctx.font = `${11 * dpr}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Press REC to record your first take", cw / 2, sCenterY);
        ctx.restore();
      }

      if (this._fadingRecording) {
        const alpha = Math.max(0, 1 - (performance.now() - this._fadingRecording.startedAt) / 350);
        if (alpha > 0) this._drawRecordingOverlay(ctx, this._fadingRecording.data, colors.error, startOffset, endOffset, visibleDuration, cw, dpr, sTop, sPad, sDrawH, sCenterY, alpha);
      }
      if (this._recordingOverlay) {
        this._drawRecordingOverlay(ctx, this._recordingOverlay, colors.error, startOffset, endOffset, visibleDuration, cw, dpr, sTop, sPad, sDrawH, sCenterY, 1);
      }
      ctx.restore();
    }
  }

  private _drawRecordingOverlay(
    ctx: CanvasRenderingContext2D, rec: RecordingOverlayData, color: string,
    startOffset: number, endOffset: number, visibleDuration: number, cw: number, dpr: number,
    sTop: number, sPad: number, sDrawH: number, sCenterY: number, alpha: number,
  ): void {
    if (!rec.peaks || rec.peaks.length === 0 || sDrawH <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    const peakDur = 0.05;
    for (let i = 0; i < rec.peaks.length; i++) {
      const et = Array.isArray(rec.peakTimes) && typeof rec.peakTimes[i] === "number" ? rec.peakTimes[i] : i * peakDur;
      const t = rec.startTime + et;
      if (t < startOffset || t > endOffset) continue;
      const x = ((t - startOffset) / visibleDuration) * cw;
      const w = ((i < rec.peakTimes.length - 1 ? Math.max(peakDur, rec.peakTimes[i + 1] - et) : peakDur) / visibleDuration) * cw;
      const h = Math.min(sDrawH, Math.max(2 * dpr, rec.peaks[i] * sDrawH * 1.6));
      ctx.fillRect(x, Math.max(sTop + sPad, sCenterY - h / 2), Math.max(1 * dpr, w), h);
    }
    ctx.restore();
  }

  // ==================== Overlay layer ====================

  private _drawOverlayLayer(): void {
    const cs = this._o;
    if (!this._resize(cs)) return;
    this._clear(cs);
    const ctx = cs.ctx, cw = cs.cvs.width, ch = cs.cvs.height;
    const { dpr, visibleDuration, startOffset, endOffset } = this._vp();
    const colors = useThemeStore.getState().colors;

    const cLoopS = this._loopStart !== null ? ((this._loopStart - startOffset) / visibleDuration) * cw : -1;
    const cLoopE = this._loopEnd !== null ? ((this._loopEnd - startOffset) / visibleDuration) * cw : -1;
    const toX = (t: number) => ((t - startOffset) / visibleDuration) * cw;

    // Bookmarks (lane-based)
    const visibleBm = this._bookmarks.filter(b => !(b.end < startOffset || b.start > endOffset));
    const lanes: { lastEnd: number }[] = [];
    const assigned: { id: string; start: number; end: number; lane: number; name: string }[] = [];
    visibleBm.slice().sort((a, b) => a.start - b.start || (a.end - a.start) - (b.end - b.start))
      .forEach(bm => {
        for (let i = 0; i < lanes.length; i++) {
          if (bm.start >= lanes[i].lastEnd) {
            lanes[i].lastEnd = bm.end;
            assigned.push({ id: bm.id, start: bm.start, end: bm.end, lane: i, name: bm.name });
            return;
          }
        }
        lanes.push({ lastEnd: bm.end });
        assigned.push({ id: bm.id, start: bm.start, end: bm.end, lane: lanes.length - 1, name: bm.name });
      });

    const { pad: lanePad, height: laneH, gap: laneGap } = getBookmarkLaneLayout(this._isMobile);
    const idxMap = new Map(this._bookmarks.map((b, i) => [b.id, i + 1]));
    const radius = 3 * dpr;
    for (const { id, start, end, lane, name } of assigned) {
      const x1c = toX(start);
      const x2c = ((Math.min(end, endOffset) - startOffset) / visibleDuration) * cw;
      const w = Math.max(2 * dpr, x2c - x1c);
      const yc = (lanePad + lane * (laneH + laneGap)) * dpr;
      const hc = laneH * dpr;
      const active = id === this._selectedId;

      // Body fill — opaque enough to stand out against the waveform below
      ctx.fillStyle = active ? hexToRgba(colors.primary, 0.98) : hexToRgba(colors.primary, 0.8);
      this._roundRect(ctx, x1c, yc, w, hc, radius);
      ctx.fill();

      // High-contrast border (brighter + thicker when selected)
      const lw = (active ? 2 : 1.25) * dpr;
      ctx.strokeStyle = active ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.85)";
      ctx.lineWidth = lw;
      this._roundRect(ctx, x1c + lw / 2, yc + lw / 2, Math.max(0, w - lw), Math.max(0, hc - lw), radius);
      ctx.stroke();

      // Edge resize handles — only when the lane is wide enough to grab them
      if (w > 24 * dpr) {
        const hw = 3 * dpr, hPad = hc * 0.25;
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.fillRect(x1c + 1.5 * dpr, yc + hPad, hw, hc - hPad * 2);
        ctx.fillRect(x2c - hw - 1.5 * dpr, yc + hPad, hw, hc - hPad * 2);
      }

      // Number + name label, clipped to the lane, when there's room
      if (w > 26 * dpr) {
        const num = idxMap.get(id) ?? "";
        const label = name && name.trim() ? `${num}. ${name.trim()}` : `#${num}`;
        ctx.save();
        this._roundRect(ctx, x1c, yc, w, hc, radius);
        ctx.clip();
        ctx.fillStyle = "#FFFFFF";
        ctx.font = `${(this._isMobile ? 12 : 11) * dpr}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(label, x1c + 6 * dpr, yc + hc / 2 + 0.5 * dpr);
        ctx.restore();
      }
    }

    const active = this._bookmarks.find(b => b.id === this._selectedId);
    if (active && !(active.end < startOffset || active.start > endOffset)) {
      const x1 = toX(active.start);
      const x2 = ((Math.min(active.end, endOffset) - startOffset) / visibleDuration) * cw;
      ctx.fillStyle = hexToRgba(colors.primary, 0.15);
      ctx.fillRect(x1, 0, Math.max(1, x2 - x1), ch);
    }

    if (this._loopStart !== null && this._loopEnd !== null && cLoopS >= 0 && cLoopE <= cw) {
      // Soft fill across the loop region
      ctx.fillStyle = hexToRgba(colors.primary, 0.15);
      ctx.fillRect(cLoopS, 0, cLoopE - cLoopS, ch);
      // Solid 1.5px primary edges at A and B
      ctx.fillStyle = colors.primary;
      ctx.fillRect(cLoopS - 0.75 * dpr, 0, 1.5 * dpr, ch);
      ctx.fillRect(cLoopE - 0.75 * dpr, 0, 1.5 * dpr, ch);
    }

    if (this._dragSelection) {
      const s = Math.min(this._dragSelection.start, this._dragSelection.end);
      const e = Math.max(this._dragSelection.start, this._dragSelection.end);
      if (!(e < startOffset || s > endOffset)) {
        const x1 = ((s - startOffset) / visibleDuration) * cw;
        const x2 = ((e - startOffset) / visibleDuration) * cw;
        const w = x2 - x1;
        if (w > 0) {
          // Filled body (lighter than before for clarity vs Loop)
          ctx.fillStyle = hexToRgba(colors.primary, 0.30);
          ctx.fillRect(x1, 0, w, ch);
          // Dashed border (visually distinct from Loop's solid edges)
          ctx.save();
          ctx.strokeStyle = colors.primary;
          ctx.lineWidth = 1 * dpr;
          ctx.setLineDash([4 * dpr, 3 * dpr]);
          ctx.strokeRect(x1, 0, w, ch);
          ctx.restore();
        }
      }
    }

    if (this._transcriptSelection) {
      const s = Math.min(this._transcriptSelection.start, this._transcriptSelection.end);
      const e = Math.max(this._transcriptSelection.start, this._transcriptSelection.end);
      if (!(e < startOffset || s > endOffset)) {
        const x1 = ((s - startOffset) / visibleDuration) * cw;
        const x2 = ((e - startOffset) / visibleDuration) * cw;
        const w = x2 - x1;
        if (w > 0) {
          ctx.fillStyle = hexToRgba('#F59E0B', 0.35);
          ctx.fillRect(x1, 0, w, ch);
        }
      }
    }

    // Shadowing alignment markers (vertical dashed lines at segment boundaries)
    if (this._shadowingExpanded && this._shadowingWaveforms.length > 0) {
      const shadowOffsetY = ch / 2; // bottom half is the shadowing lane
      ctx.save();
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.lineWidth = 1 * dpr;
      for (const seg of this._shadowingWaveforms) {
        const segEnd = seg.start + seg.duration;
        // Draw segment start marker
        if (seg.start >= startOffset && seg.start <= endOffset) {
          const x = ((seg.start - startOffset) / visibleDuration) * cw;
          ctx.strokeStyle = hexToRgba(colors.success, 0.3);
          ctx.beginPath();
          ctx.moveTo(x, shadowOffsetY);
          ctx.lineTo(x, ch);
          ctx.stroke();
        }
        // Draw segment end marker
        if (segEnd >= startOffset && segEnd <= endOffset) {
          const x = ((segEnd - startOffset) / visibleDuration) * cw;
          ctx.strokeStyle = hexToRgba(colors.success, 0.2);
          ctx.beginPath();
          ctx.moveTo(x, shadowOffsetY);
          ctx.lineTo(x, ch);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    if (this._loopStart !== null && cLoopS >= 0 && cLoopS <= cw) this._drawMarker(ctx, cLoopS, ch, "A");
    if (this._loopEnd !== null && cLoopE >= 0 && cLoopE <= cw) this._drawMarker(ctx, cLoopE, ch, "B");
  }

  // ==================== Playhead layer ====================

  private _drawPlayheadLayer(): void {
    const cs = this._p;
    if (!this._resize(cs)) return;
    this._clear(cs);
    const ctx = cs.ctx, cw = cs.cvs.width, ch = cs.cvs.height;
    const { dpr, visibleDuration, startOffset } = this._vp();
    const px = ((this._playheadTime - startOffset) / visibleDuration) * cw;
    if (px < 0 || px > cw) return;

    ctx.beginPath();
    ctx.strokeStyle = "#EF4444";
    ctx.lineWidth = 2 * dpr;
    ctx.moveTo(px, 0); ctx.lineTo(px, ch);
    ctx.stroke();

    const hw = 6 * dpr, hh = 10 * dpr, ph = 4 * dpr;
    ctx.fillStyle = "#EF4444";
    ctx.beginPath();
    ctx.moveTo(px - hw, 0); ctx.lineTo(px + hw, 0);
    ctx.lineTo(px + hw, hh); ctx.lineTo(px, hh + ph);
    ctx.lineTo(px - hw, hh); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();
  }

  // ==================== Marker drawing ====================

  private _drawMarker(ctx: CanvasRenderingContext2D, x: number, _height: number, label: string): void {
    const p = dpr();
    const colors = useThemeStore.getState().colors;
    // Compact pill at the top corner — primary color (matches Loop edges in §5.3)
    const labelW = 14 * p, labelH = 12 * p;
    const labelX = label === "A" ? x : x - labelW;
    ctx.fillStyle = colors.primary;
    ctx.fillRect(labelX, 0, labelW, labelH);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = `${9 * p}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, labelX + labelW / 2, labelH / 2);
  }
}
