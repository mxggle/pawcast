# Player Page Revamp — Design

**Date:** 2026-05-09
**Status:** Draft for review
**Author:** Brainstorming session (mxggle + Claude)

---

## 1. Context & Problem

The Player page has accumulated three classes of UX/UI issues that the user reported:

1. **Responsive layout instability** — when one panel (Transcript / Video / Timeline) is resized, sibling panels' internal components deform because they respond to viewport width (`sm:` / `md:` / `lg:`) rather than their own container width.
2. **Internal control deformation** — buttons inside panels (e.g., the Transcript empty-state CTA pair, the Timeline toolbar's nine controls) compress or wrap awkwardly when their container shrinks, even though the viewport is wide.
3. **Waveform area visual quality** — the waveform looks plain (basic peak bars), the Shadowing region's expand/collapse is functional but visually undifferentiated, and the floating control clusters (right-side mic glass-panel, left-side takes list popup, top-right hover-zoom) are scattered and hard to discover.

This is a **language-learning Electron + Web app**, not an audio editor. The user wants the polish and information clarity of a professional DAW (Audition / Logic Pro) but expressed through the existing app's friendly visual language (rounded cards, soft borders, primary-red accent, light/dark theming).

## 2. Goals

1. Stabilize panel responsive behavior so internal controls scale gracefully as panels resize.
2. Eliminate button deformation in narrow panel widths through a smart-fold toolbar.
3. Redesign the waveform area with a clearer visual hierarchy — introduce a Track Header strip that consolidates currently-floating controls, polish the waveform rendering itself, and improve the Shadowing region's identity without changing the underlying expand/collapse interaction model.
4. Preserve all existing functionality, data flows, and Zustand store contracts. This is a **visual + responsive revamp**, not a behavioral redesign.

## 3. Non-Goals

- No change to the `WaveformRenderer` public API or interaction handlers (drag / click / pinch / wheel).
- No multi-track lane architecture (rejected during brainstorming — the user prefers the current expand/collapse model with visual polish).
- No new persistence, no schema changes, no Electron IPC additions.
- No reorganization of pages, routes, or navigation.
- No mobile-first redesign — the app's existing `useMediaQuery` mobile branch is preserved as-is; this revamp targets the desktop / Electron experience that the screenshots showed.

## 4. Decisions Confirmed With User

| Decision | Choice |
|---|---|
| Visual aesthetic | Professional DAW × app's friendly style ("softened DAW") |
| Shadowing track model | Keep current expand/collapse; visual polish only |
| Toolbar overflow strategy | Single row + smart-fold to overflow menu |
| Implementation depth | Plan B — Refined DAW Feel (medium scope, balanced risk) |

## 5. Architecture

### 5.1 Layout & Responsive Foundation

**Root cause of the responsive issue:** every panel's internal styling uses Tailwind's viewport breakpoints (`sm:` / `md:` / `lg:`), which respond to `window.innerWidth`. When `react-resizable-panels` shrinks one panel and grows another, the shrunk panel's internals don't know — they still see a wide viewport.

**Fix:** switch internal responsive logic from viewport-based to **container-based** using CSS container queries via `@tailwindcss/container-queries`.

- Each panel root receives `@container/<name>` (e.g., `@container/transcript`, `@container/video`, `@container/timeline`, `@container/toolbar`).
- Internal elements use `@sm/<name>:`, `@md/<name>:`, `@lg/<name>:` instead of viewport breakpoints.

**Per-panel response thresholds:**

| Panel | Very Narrow | Compact | Standard | Wide |
|---|---|---|---|---|
| Transcript | `< 240px` text + scroll only | `240–400px` icons-only actions | `400–640px` full button labels | `≥ 640px` full + extra meta |
| Video | `< 240px` "too narrow" placeholder | `240–400px` video fits, no padding | `400–640px` video + light padding | `≥ 640px` video + generous margins |
| Timeline (toolbar) | `< 240px` minimal controls | `240–360px` collapse Speed + others to ⋯ | `360–480px` collapse Settings/SentencePractice | `≥ 480px` show Loop, Volume; `≥ 640px` show all |

**Min-width / min-height guards** (defense in depth):
- TranscriptPanel `minSize`: clamp `220px ≤ 25% ≤ 60%`.
- VideoPanel: absolute `200px` floor.
- TimelinePanel height `minSize`: `88px` absolute (so toolbar is always fully visible even when collapsed).

**Untouched:** `react-resizable-panels` Group/Panel structure, drag handle behavior, panel show/hide/collapse Zustand state, `LayoutSettings` interface.

### 5.2 New Component: `TrackHeader`

A 28px-tall horizontal strip that sits **between** `TimelineToolbar` and `TimeRuler` inside `TimelinePanel`. It consolidates the controls currently floating on top of the waveform canvas.

**Vertical layout inside `TimelinePanel`:**

```
┌── Timeline Panel ─────────────────────────────────────────┐
│  TimelineToolbar — 36px (smart-fold, see §5.4)            │
│  TrackHeader      — 28px (new — see §5.2)                 │
│  TimeRuler        — 16px (existing, polished)             │
│  Waveform Canvas  — flex (existing 3-layer canvas)        │
└────────────────────────────────────────────────────────────┘
```

Total chrome ≈ 80px. Waveform canvas occupies the remaining height. With `TimelinePanel.maxHeight = 360px`, this leaves ≈ 280px for the canvas — same as today.

**Three states:**

1. **Default (Shadowing collapsed):** single row showing `● Original · 2:14 total` on the left and `[Shadow ▾] [⊕] [⊝]` on the right.
2. **Expanded (Shadowing visible):** two stacked rows. Top: `● Original` with zoom controls. Bottom: `◆ Shadowing · Take 2 of 3 ▾  [● REC] [🗑 Clear all]`.
3. **Recording:** the Shadowing row swaps to `◆ Shadowing · Recording…  ⏺ 0:08  [■ Stop] [🗑]` with a pulsing red dot.

**Visual language (softened DAW):**
- Background: light `bg-gray-100/70`, dark `bg-gray-900/60`, with `backdrop-blur-sm`.
- Bottom border: `border-b border-gray-200 dark:border-white/5` (matches existing toolbar separator).
- Labels: `text-[11px] font-semibold tracking-wide`. Metadata: `text-[10px] text-gray-500 font-mono tabular-nums`.
- Channel dot indicator: 8px solid (Original = primary red, Shadowing = success green) with a 4px halo of the same color at 30% opacity.
- Buttons: reuse the existing `timeline-secondary-action` class for visual consistency with the toolbar.

**Component interface (sketch):**

```tsx
<TrackHeader
  expanded={isShadowingExpanded}
  onToggleExpanded={() => setIsShadowingExpanded(v => !v)}
  duration={duration}
  zoom={waveformZoom}
  onZoomIn={...}
  onZoomOut={...}
  shadowing={{
    isMode: isShadowingMode,
    isRecording,
    takes: shadowingSegments,
    currentTakeId,
    onToggleMode,
    onSelectTake,
    onDeleteTake,
    onDeleteAll,
  }}
/>
```

All Zustand store reads/writes live inside `TrackHeader`; `WaveformVisualizer` becomes more focused on canvas + interaction.

**Floating controls being removed from the canvas:**
- ❌ Right-side glass-panel cluster (mic toggle / expand-collapse / sentence-mode / clear-track).
- ❌ Left-side takes list popup.
- ❌ Top-right hover-only zoom buttons.

These migrate into `TrackHeader` so they are always visible.

### 5.3 Waveform Visual Treatment (`WaveformRenderer`)

Only the private rendering methods change (`_drawStaticLayer`, `_drawOverlayLayer`, `_drawPlayheadLayer`). Public API, hit-test, drag/click logic untouched.

**Main waveform (Original):**
- Render min/max bipolar bars (the existing `this._min` / `this._max` / `this._rms` branch in `_drawStaticLayer` already supports this — currently the visual treatment is plain).
- Outer fill (peaks): primary at 80% opacity.
- Inner RMS band: primary at 40% opacity, lightness +15%.
- Bar width: dynamic `1.0–2.5 CSS px` based on samples-per-pixel; bar gap fixed `0.5px`.
- At very high zoom (zoom > 20), cap bar width at 1px and pack tightly to avoid blocky appearance.

**Background:**
- Light: `bg-gradient-to-b from-gray-50 to-gray-100/60`.
- Dark: solid `#0b0e1c` (one notch lighter than current `#0a0a1a` so the canvas reads as a distinct surface from the panel).

**Center line:** 1px horizontal, primary at 10% opacity, full width. Provides a baseline reference.

**Playhead:** 1.5px solid primary line + a `8×6` inverted triangle handle at the top edge as a scrub hit-target.

**Loop range:** primary fill at 15% opacity + 1.5px solid edges at A and B; small `8px` rounded labels `A` and `B` (11px monospace, white) at the top corners of the range.

**Drag selection:** primary fill at 30% + 1px dashed border (visually distinct from Loop's solid border).

**Hover time bubble:** moves from above the ruler to **below the playhead** so it does not occlude the new TrackHeader; small triangle pointer above.

### 5.4 Shadowing Region Visual

Lives in the lower half of the canvas when `isShadowingExpanded === true`. Same coordinate model as today.

- **Separator** between Original (top) and Shadowing (bottom) regions: replace the hard 1px line with a 1px gradient (primary 30% → transparent → primary 30%) for a softer transition.
- **Multiple takes overlay:** each take rendered as semi-transparent bipolar waveform using the existing 6-color green palette.
  - Currently selected take: 100% opacity.
  - Other takes: 50% opacity.
  - Empty state (expanded but no takes): centered ghost text "Press ● REC to record your first take" with a small mic icon, drawn into the canvas in the lower half.
- **Take labels in canvas:** above each take's start position, render a 6px-tall colored bar (take's palette color) plus an 8px monospace label `T1` / `T2` / `T3`. On hover, the bar grows to 12px and a tooltip surfaces the take's full timestamp range.
- **Recording overlay:** preserved but with refined colors — `colors.error` red bars + an alpha pulse animation overlay (the existing `_fadingRecording` mechanism handles fade-out; we keep that and only adjust visual parameters).

### 5.5 Smart-Fold Toolbar (`TimelineToolbar`)

Single 36px row, three logical slots: `PRIMARY`, `SECONDARY`, `PANEL`.

**`PRIMARY` (always visible, in this fixed order):**
1. Prev / Play-Pause / Next button group.
2. Time display `mm:ss / mm:ss` (hides only at `< 180px`).
3. A-B button.
4. Record button (text-with-icon at `≥ 300px`, icon-only below).

**`SECONDARY` (collapse to `⋯` overflow menu by container-query priority):**

| Threshold | Action |
|---|---|
| `≥ 640px` | All secondary controls visible. |
| `< 640px` and `≥ 480px` | Hide Settings, Sentence Practice → move to ⋯. |
| `< 480px` and `≥ 360px` | Hide Loop, Volume → move to ⋯. |
| `< 360px` and `≥ 240px` | Hide Speed → move to ⋯. |
| `< 240px` | Time also hidden. |

**`PANEL` (always visible):** the existing collapse / hide buttons remain at the right edge after a `border-l` divider.

**Implementation details:**
- Use `@container/toolbar` on the toolbar root.
- Each `SECONDARY` button receives a class such as `@[640px]/toolbar:flex hidden` or similar — visible above the threshold, hidden below.
- The overflow menu (Radix `DropdownMenu`) **always** contains every `SECONDARY` action, but each item is hidden when the corresponding inline button is visible. This avoids duplication while keeping the overflow menu authoritative as a fallback.
- Buttons receive `min-w-[28px]` to prevent compression deformation.
- The Record button is intentionally promoted: it never enters the overflow menu because it is the app's core action.

### 5.6 Empty States

Three places currently break or look weak. All three converge on one vocabulary: centered card → icon → title → CTA → helper text — with container-query-driven sizing.

a) **Transcript empty state** (`TranscriptPanel.tsx`'s "Click the transcribe button…" card):
- Card `max-w-[400px]`.
- Icon: 64px at `@[400px]+`, 48px at `@[260px]+`, 32px below.
- Buttons: side-by-side at `≥ 300px`, `flex-col` stacked below.
- Helper text scales: `text-base` / `text-sm` / `text-xs` by container width.

b) **Waveform empty state** (YouTube placeholder, loading, errors): keep the existing top-right notification chip but restyle to match `TrackHeader` typography and spacing.

c) **Shadowing empty state** (expanded but no takes): handled by the canvas-drawn ghost text described in §5.4.

### 5.7 Cross-Cutting Polish

- All buttons: `transition-colors duration-200 ease-out` on hover/active.
- Focus ring (keyboard accessibility): `focus-visible:ring-2 ring-primary-500/50 ring-offset-2`.
- Resize handles between panels: 6px hit area, 2px visible track normally, 4px on hover (improves discoverability without taking permanent space).
- Section header label style ("PRIMARY", "TRANSCRIPT", "VIDEO") unified with the existing `PanelHeader` style: `text-[11px] font-semibold uppercase tracking-wider text-gray-500`.

## 6. Implementation Map

**New files:**
- `src/components/player/TrackHeader.tsx`
- `src/components/player/TimelineOverflowMenu.tsx`

**Modified files (visual + container queries only — no data-flow changes):**
- `tailwind.config.js` — add `@tailwindcss/container-queries` plugin.
- `src/components/player/TimelinePanel.tsx` — embed `TrackHeader` between `TimelineToolbar` and `TimeRuler`.
- `src/components/player/TimelineToolbar.tsx` — refactor into `PRIMARY` / `SECONDARY` / `PANEL` slot system + container-query visibility classes; pair with `TimelineOverflowMenu`.
- `src/components/waveform/WaveformVisualizer.tsx` — **delete** all floating canvas overlays (mic glass-panel, takes list popup, hover-zoom buttons). Keep canvas refs, interaction handlers, and store subscriptions. Pass `isShadowingExpanded` etc. up to `TrackHeader` via the parent (or share via the existing Zustand stores — already shared).
- `src/player/WaveformRenderer.ts` — adjust only `_drawStaticLayer`, `_drawOverlayLayer`, `_drawPlayheadLayer` for the new visual treatment (RMS three-color fill, take labels, playhead triangle, loop A/B labels, center line, take dimming, hover bubble repositioning). All public methods, hit-tests, and viewport math untouched.
- `src/components/transcript/TranscriptPanel.tsx` — touch only the empty-state card region (~50 lines around the "Click the transcribe button" block); switch its responsive classes to container queries; do not modify any other code in this 2001-line file.
- `src/components/player/MediaPreviewPanel.tsx` — wrap root with `@container/video` and convert internal viewport breakpoints.

**i18n new keys** (`src/i18n/locales/{en,ja,zh}.json`):
- `track.original` — "Original" / "原音" / "オリジナル"
- `track.shadowing` — "Shadowing" / "跟读" / "シャドーイング"
- `shadowing.takeOf` — "Take {{n}} of {{total}}"
- `shadowing.recordFirstTake` — "Press REC to record your first take"
- `track.totalDuration` — "Total {{time}}"

**Untouched:**
- All Zustand stores (`playerStore`, `shadowingStore`, `settingsStore`, `layoutStore`, `themeStore`).
- `WaveformRenderer` public API and event handling.
- `react-resizable-panels` Group/Panel structure.
- FFmpeg waveform pipeline, `WaveformLoader`, `PlaybackClock`.
- `useShadowingPlayer`, `useShadowingRecorder`, `useKeyboardShortcuts`, `usePlaybackPersistence`.
- Routing and pages.
- Electron main process / preload.

## 7. Risks & Mitigation

| Risk | Mitigation |
|---|---|
| `WaveformRenderer` is 514 lines mixing rendering and visual logic — visual edits could regress interaction. | Restrict edits to the three private `_draw*Layer` methods. Do not touch `_vp()`, `_resize()`, public setters, or any code path used by `WaveformVisualizer`'s mouse/touch handlers. |
| Removing canvas-floating controls without complete coverage in `TrackHeader` would silently lose features. | Maintain a feature-coverage checklist during implementation: mic toggle, sentence-mode toggle, takes list, take selection, take deletion, clear-all, expand/collapse, zoom-in, zoom-out. Each must have a clear control in `TrackHeader` before the floating elements are deleted. |
| Container queries silently no-op if the Tailwind plugin is not properly registered. | After `tailwind.config.js` change, confirm with a smoke test: add `@[100px]/toolbar:hidden` to a benign element and verify it disappears at narrow widths. Build must succeed. |
| `TranscriptPanel.tsx` is 2001 lines and we must touch only its empty-state block. | Use `Edit` tool (not `Write`) for surgical replacement; leave the rest of the file unread to avoid accidental edits. |
| Visual regressions in dark mode or under unusual media (audio-only, video, YouTube). | Manual test matrix: 4 panel-width buckets × 2 themes × 3 media types = 24 combinations; sample at least 6 (audio narrow/wide × dark, video wide × light, YouTube wide × dark, audio wide × light). |
| Take labels rendered into the canvas may collide with existing bookmark lanes when both are dense. | Render take labels in the **lower-half coordinate space** (Shadowing region only). Bookmarks stay in upper-half lane area. The canvas already separates these regions by `isShadowingExpanded`. |

## 8. Verification Plan

### 8.1 Static Checks

- `npm run lint` — must pass without new warnings.
- `npm run build` — must complete successfully.
- TypeScript: no new `any`s in modified files; new `TrackHeader` component fully typed.

### 8.2 Functional Regression (Manual)

For each of the following user flows, verify behavior is unchanged before vs. after:

1. **Playback core:** load audio file → press play → verify waveform animates with playhead, FPS counter remains ≈ 60 in `PerfOverlay`.
2. **A-B loop:** drag-select a region on the waveform → verify the region is highlighted with primary 15% fill and `A`/`B` labels at edges → toggle Loop button → confirm playback loops within the region.
3. **Bookmarks:** load a media that has saved bookmarks → click a bookmark lane → confirm playhead jumps and selection state visualizes correctly → drag a bookmark edge → confirm the bookmark resizes.
4. **Shadowing — empty:** click `Shadow ▾` in TrackHeader → expand area appears with ghost CTA in canvas → click `● REC` → recording starts, red overlay grows on canvas, TrackHeader shows pulsing dot + elapsed time.
5. **Shadowing — multiple takes:** record three takes → confirm `T1` `T2` `T3` labels appear in canvas, current take is 100% opacity, others are 50% → use the takes dropdown in TrackHeader to switch current take → confirm visual emphasis shifts.
6. **Take deletion:** open takes dropdown → delete one take → confirm canvas updates → click `🗑 Clear all` → confirm confirmation flow and full clear.
7. **Zoom & scroll:** ctrl+wheel to zoom → confirm waveform zooms about cursor position → wheel without ctrl → confirm horizontal scroll → pinch on touch screen → confirm pinch-to-zoom.
8. **Keyboard shortcuts:** Space, A, B, L, ←/→, Shift+←/→, ↑/↓, 0–9 — all unchanged.
9. **Toolbar smart-fold:** drag Timeline panel handle to widen and narrow → at each breakpoint (640 / 480 / 360 / 240 / 180), confirm the correct controls are inline vs. in the `⋯` menu, and the menu always lists hidden controls.
10. **Cross-panel responsive:** widen Video → Transcript narrows → confirm Transcript's empty-state card adapts (icon shrinks, buttons stack) → narrow Video → confirm Video's "too narrow" placeholder appears.

### 8.3 Visual Spot-Checks

Capture screenshots before / after at the following anchor points (light + dark theme each):
- Audio file, Timeline ≈ 800px wide, Shadowing collapsed.
- Audio file, Timeline ≈ 800px wide, Shadowing expanded with 3 takes, take 2 selected.
- Audio file, Timeline ≈ 800px wide, recording in progress.
- Video file, Transcript ≈ 280px wide (narrow), Video panel wide.
- Transcript empty state at 220px / 320px / 480px panel widths.
- YouTube placeholder.

### 8.4 Performance

`PerfOverlay` shows `WaveformVisualizer` re-render count. Confirm post-revamp it does **not** increase materially during idle playback (current shows ~74 over a 2:14 audio session).

## 9. Out of Scope (Explicit)

The following may also be valuable but are deliberately deferred:

- Bookmarks moved to a dedicated lane above the waveform (Plan C).
- Per-take rename or descriptive labels (current `T1`/`T2`/... is canvas-rendered only).
- Split toolbar into two rows.
- Mobile-specific revamp (the `useMediaQuery` mobile branch keeps its current behavior).
- New persistence for "currently selected take" (it can be a derived UI state for now; only persist if user requests).

## 10. Open Questions Resolved During Brainstorming

- _Visual direction?_ → Professional DAW × app's friendly style.
- _Shadowing track model?_ → Keep current expand/collapse + visual polish.
- _Toolbar overflow strategy?_ → Single row + smart-fold to overflow menu.
- _Bookmark model?_ → Not changed in this revamp (deferred to Out of Scope).
- _Take labels in canvas?_ → Yes, with `T1` `T2` `T3` mini-labels (best-practice DAW idiom).
- _Original / Shadowing channel colors?_ → primary red (existing) / success green (existing).
