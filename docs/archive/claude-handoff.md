# Claude Handoff — Player Performance Optimization

**Date:** 2026-05-07
**Branch:** `feature/perf-super-optimization`
**Status:** Phase 1–5 complete, cleanup pending

## 1. Goal

Refactor Pawcast's player into a Descript-style media workspace per `desktop-media-engine-plan.md`. Core priorities: silky-smooth playback, Canvas-based rendering, transcript-first architecture, Electron-only.

## 2. Subagent Work Summary

- **performance-engineer agent** — Created `WaveformRenderer.ts` (514 lines): pure TS 3-layer Canvas renderer. No React deps. Static layer (waveform peaks, shadowing), overlay layer (bookmarks, loop range, markers, transcript selection), playhead layer (60fps line).
- **react-specialist agent** — Refactored `WaveformVisualizer.tsx`: replaced ~250 lines of single-canvas drawing useEffect with 8 focused sync effects calling WaveformRenderer methods. Playhead now updates via PlaybackClock subscription, not React state.
- **react-specialist agent (Phase 3)** — Implemented word-level transcript: `TranscriptWord` type, `TranscriptWordRenderer` (clickable word spans, playback highlight, selection→timeRange), `useWordState` hook (~10fps throttled, binary search), Whisper word timestamp preservation.
- **frontend-developer agent (Phase 5)** — Enhanced shadowing: per-sentence recording with auto-stop, bipolar waveform per take (6-color cycling), alignment markers, take list overlay.
- **fullstack-developer agent (Phase 4)** — Bidirectional sync: `TimeRangeSelection` wired into `PlayerWorkspace` (separate context), waveform drag→word highlight (~30fps), transcript selection→waveform amber overlay, bookmark wordIds/segmentIds.
- **Main agent** — Created MediaController, PlaybackClock, PlayerWorkspace, types. Refactored MediaPlayer to use PlaybackClock for time sync.

## 3. Files

### New (`src/player/`)
| File | Lines | Purpose |
|------|-------|---------|
| `types.ts` | 64 | Shared interfaces (WaveformLevelData, TimeRangeSelection, clock types) |
| `MediaController.ts` | 73 | Imperative wrapper around HTMLMediaElement |
| `PlaybackClock.ts` | 94 | Singleton rAF clock with multi-rate subscribers (60/10/4fps) |
| `WaveformRenderer.ts` | 514 | 3-layer Canvas renderer, pure TS, no React |
| `PlayerWorkspace.tsx` | 61 | React context provider for player area (clock + selection) |

### New (Phase 3 — Transcript v2)
| File | Lines | Purpose |
|------|-------|---------|
| `src/types/transcriptWord.ts` | 13 | `TranscriptWord` interface (id, text, start, end, confidence) |
| `src/hooks/useWordState.ts` | 46 | Active word detection (~10fps throttled, binary search) |
| `src/components/transcript/TranscriptWordRenderer.tsx` | 226 | Word-level renderer: clickable spans, playback highlight, selection→timeRange |

### Modified
| File | Changes |
|------|---------|
| `MediaPlayer.tsx` | Uses MediaController + PlaybackClock; rAF time sync; clears selection on playback |
| `WaveformVisualizer.tsx` | 3-canvas layout + WaveformRenderer; shadowing controls + takes list; selection sync |
| `PlayerPage.tsx` | Wraps player area with `<PlayerWorkspace>` |
| `playerStore.ts` | `TranscriptSegment.words`/`wordIds`; `LoopBookmark.wordIds`/`segmentIds` |
| `shadowingStore.ts` | `sentenceRecordings`, `recordingSegmentId`, per-sentence actions |
| `transcriptionService.ts` | Preserves Whisper word-level timestamps |
| `TranscriptPanel.tsx` | `assignWordsToSegments`; selection propagation to context; Escape handler |
| `TranscriptSegmentItem.tsx` | Conditional word renderer when segment has word data |
| `useShadowingRecorder.ts` | Per-sentence auto-stop at segment end |

## 4. Key Architecture Decisions

- **currentTime flows outside React**: `currentTimeStore` (pub/sub) — PlaybackClock writes to it every tick. Transcript auto-scroll and word highlight read from it directly. Zustand `currentTime` field persists but is throttle-updated (250ms) to avoid re-render storms.
- **3-layer Canvas separation**: static redraws on data/viewport change, overlay on interaction, playhead at 60fps. Each layer is a dedicated `<canvas>` — the browser composites them cheaply.
- **PlaybackClock is a singleton**: attached/detached per media element. Subscribers pick their rate (60fps canvas, 10fps transcript, 4fps Zustand). Clock stops when not playing — no rAF when idle.
- **MediaController is throwaway**: a new instance is created when the media element changes. Stores no React state.
- **PlayerWorkspace has two separate contexts**: `PlayerWorkspaceContext` for clock (stable), `PlayerSelectionContext` for selection (transient). Clock subscribers don't re-render on selection changes.
- **Word highlight is throttled**: `useWordState` subscribes to `currentTimeStore` at ~10fps with binary search (O(log n)). Each segment has its own isolated hook instance.

## 5. Phase 2 — Waveform v2 (FFmpeg)

### New files
| File | Lines | Purpose |
|------|-------|---------|
| `electron/waveformEngine.ts` | 268 | FFmpeg PCM decode + min/max/rms compute + multi-level binary cache |
| `src/player/WaveformLoader.ts` | 146 | Renderer-side service: IPC orchestration, zoom-level selection, in-memory cache |

### Modified
| File | Changes |
|------|---------|
| `electron/main.ts` | Added `waveform:analyze`, `waveform:getMeta`, `waveform:getLevel`, `waveform:delete` IPC handlers |
| `electron/preload.ts` | Exposed `waveformAnalyze`, `waveformGetMeta`, `waveformGetLevel`, `waveformDelete`, `onWaveformProgress` |
| `src/types/electron.d.ts` | Added type declarations for all 5 new ElectronAPI methods |
| `src/player/WaveformRenderer.ts` | Added `setWaveformData(data)`, min/max/rms drawing with RMS inner band, Int16Array/Uint16Array support |
| `src/components/waveform/WaveformVisualizer.tsx` | Added FFmpeg path (early return when `waveformLoader.isAvailable`), viewport-driven level reload |

### Architecture
- **Main process** runs FFmpeg → PCM s16le → min/max/rms per chunk → 9 resolution levels (256–65536 samples/peak) → binary cache in `appData/waveform-cache/{mediaId}/`
- **Renderer** calls `waveformLoader.loadForViewport()` → picks best level by `samplesPerPixel` → loads binary via IPC → `renderer.setWaveformData(data)`
- **WaveformRenderer** draws true bipolar waveform (max above center, min below) + RMS inner band at 60% opacity
- **Web fallback** preserved: existing AudioContext peaks path still works when `waveformLoader.isAvailable` is false

## 6. Phase 3 — Transcript v2 (Word-level)

- `TranscriptWord` type: `{ id, text, start, end, confidence?, speakerId?, segmentId? }`
- `TranscriptSegment` extended with `words?: TranscriptWord[]` and `wordIds?: string[]`
- Whisper API `words[]` field preserved in `parseWhisperResponse` (was previously discarded)
- `TranscriptWordRenderer`: each word as `<span>` with `data-word-id`/`data-start`/`data-end`, click→seek, active word amber highlight, text selection→timeRange
- `useWordState`: binary search over sorted words, ~10fps throttled via `useSyncExternalStore`
- Segment-level `TranscriptTextRenderer` fallback when no word data

## 7. Phase 4 — Bidirectional Sync

- `PlayerSelectionContext` added to `PlayerWorkspace.tsx` (separate from clock context)
- Waveform drag → transcript word highlight (blue, ~30fps throttled)
- Transcript word selection → waveform amber overlay (`#F59E0B`)
- `LoopBookmark` extended with `wordIds?` and `segmentIds?`
- `createBookmarkFromTranscript` populates word/segment IDs
- Selection cleared on playback start, Escape, or click on empty space

## 8. Phase 5 — Shadowing Alignment

- Per-sentence recording: `recordingSegmentId` state, auto-stop at segment end via `useEffect` monitoring `currentTime`
- Enhanced shadowing waveform: bipolar bars (above/below center), 6-color per-take cycling, inner RMS band
- Alignment markers: dashed vertical lines at shadowing segment boundaries on the reference waveform
- Take list overlay: colored dots, take index, time range, click-to-seek
- `sentenceRecordings` keyed by transcript segmentId

## 9. Remaining TODOs

### Cleanup
- **Electron-only switch**: Remove web platform code (`src/components/web/`, web fallbacks in stores, web routing).
- **playerStore split**: Still 2141 lines — consider splitting into `mediaStore`, `bookmarkStore`, `transcriptStore`.
- **Unit tests**: MediaController, PlaybackClock, WaveformRenderer, useWordState are pure logic with clear interfaces — good candidates.

### Known risks
- **No tests were written** for the new player module.
- **WaveformVisualizer interaction handlers** (mouse/touch/wheel) were preserved as-is. Verify click-to-seek and drag-to-select still work in Electron.
- **Electron-only hasn't been enforced yet**. The new code is platform-agnostic (no Electron-specific imports), but the plan calls for removing web support.
- **Lint warning** on `PlayerWorkspace.tsx`: react-refresh complains about exporting both a component and a hook from the same file.

## 10. Commands Run

```sh
npm run build     # 8.36s, zero errors
npx tsc --noEmit  # zero errors
```
