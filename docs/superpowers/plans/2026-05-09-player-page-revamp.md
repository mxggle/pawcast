# Player Page Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revamp the Player page's responsive behavior, control layout, and waveform/shadowing visuals — preserving every existing function and store contract — so panels no longer break each other when resized, internal buttons stop deforming in narrow widths, and the waveform area gains a "softened DAW" feel through a new TrackHeader strip and refined canvas rendering.

**Architecture:** Switch internal panel responsiveness from viewport breakpoints to CSS container queries (`@tailwindcss/container-queries`). Introduce `TrackHeader` component to consolidate floating canvas controls. Refactor `TimelineToolbar` with priority-tier slots backed by a `TimelineOverflowMenu`. Polish `WaveformRenderer` private draw methods only. Surgical empty-state edits in `TranscriptPanel` and `MediaPreviewPanel`.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS 3.4 + `@tailwindcss/container-queries`, Radix UI (DropdownMenu, Popover), Zustand, lucide-react, react-i18next. Tests via `node --test` + `tsx`. Lint via ESLint. Manual test in Electron (`npm run dev:electron`) and web (`npm run dev`).

**Spec:** `docs/superpowers/specs/2026-05-09-player-page-revamp-design.md`

**Branch context:** Already on `feature/perf-super-optimization`. This plan adds commits on top.

---

## Coverage Checklist (do not delete floating canvas controls until every row is checked)

The current `WaveformVisualizer.tsx` renders these floating UI elements that must all migrate to `TrackHeader` before they can be removed from the canvas:

- [ ] Mic / Shadowing toggle (right-side glass cluster)
- [ ] Sentence-mode toggle (`recordingSegmentId` four-corner SVG button)
- [ ] Expand/collapse Shadowing chevron (`isShadowingExpanded`)
- [ ] Clear-all takes (`Trash2` icon) with confirmation flow
- [ ] Takes list (left-side `Shadow Takes` panel) with seek-to-take on click
- [ ] Zoom in / Zoom out (top-right hover-only)
- [ ] YouTube placeholder notice (top-right) — stays in canvas, just visually realigned
- [ ] Waveform analyzing/error notice (top-right) — stays in canvas, just visually realigned
- [ ] Hover time bubble — stays in canvas (repositions to under playhead)

---

## Task 1: Install and configure container-query plugin

**Files:**
- Modify: `package.json`
- Modify: `tailwind.config.js`
- Create: `src/components/dev/_smoke-cq.test.tsx` (deleted at end of task)

**Why first:** every panel and the toolbar use container queries. Without this in place, Tasks 5–11 silently no-op.

- [ ] **Step 1: Install plugin**

```bash
npm install -D @tailwindcss/container-queries
```

Expected: `@tailwindcss/container-queries` appears in `devDependencies` and `package-lock.json` updates.

(The repo has `package-lock.json` and no `yarn.lock`. The `packageManager: "yarn@..."` field in `package.json` is stale; ignore it.)

- [ ] **Step 2: Register plugin in tailwind.config.js**

Edit `tailwind.config.js` — change the `plugins: []` line to:

```js
plugins: [require("@tailwindcss/container-queries")],
```

(The config file uses `export default` ESM syntax. `require` works inside Tailwind config because Tailwind eval's it under CommonJS at build time. If `require` errors, switch to: `import containerQueries from "@tailwindcss/container-queries";` at the top and `plugins: [containerQueries]`.)

- [ ] **Step 3: Smoke test the plugin**

In an existing accessible page (e.g., temporarily inside `src/pages/PlayerPage.tsx` near the top of the JSX return), add:

```jsx
<div className="@container/test fixed top-2 left-1/2 z-[200] bg-yellow-300 px-3 py-1 text-xs">
  <span className="@[200px]/test:hidden">narrow</span>
  <span className="hidden @[200px]/test:inline">wide</span>
</div>
```

Run `npm run dev` and verify the chip flips between "narrow" and "wide" as you resize the window. After confirmation, remove the chip.

- [ ] **Step 4: Build passes**

```bash
npm run build
```

Expected: build succeeds with no Tailwind warnings about unknown variants.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tailwind.config.js
git commit -m "chore(deps): add @tailwindcss/container-queries plugin"
```

---

## Task 2: Add i18n strings

**Files:**
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/ja.json`
- Modify: `src/i18n/locales/zh.json`

**Why before components:** TrackHeader and Toolbar reference these keys; missing keys would render literal key strings.

- [ ] **Step 1: Add the five new keys to each locale**

Add the following keys, choosing the appropriate nested location (under `track` if it exists, otherwise create a new `track` namespace; under existing `shadowing` namespace):

```jsonc
// src/i18n/locales/en.json
"track": {
  "original": "Original",
  "shadowing": "Shadowing",
  "totalDuration": "Total {{time}}"
},
"shadowing": {
  // ...existing keys
  "takeOf": "Take {{n}} of {{total}}",
  "recordFirstTake": "Press REC to record your first take"
}

// src/i18n/locales/ja.json
"track": {
  "original": "オリジナル",
  "shadowing": "シャドーイング",
  "totalDuration": "全 {{time}}"
},
"shadowing": {
  // ...
  "takeOf": "テイク {{n}} / {{total}}",
  "recordFirstTake": "RECを押して最初のテイクを録音"
}

// src/i18n/locales/zh.json
"track": {
  "original": "原音",
  "shadowing": "跟读",
  "totalDuration": "总 {{time}}"
},
"shadowing": {
  // ...
  "takeOf": "Take {{n}} / {{total}}",
  "recordFirstTake": "按 REC 录制第一段跟读"
}
```

- [ ] **Step 2: Verify JSON parses**

```bash
node -e "['en','ja','zh'].forEach(l => JSON.parse(require('fs').readFileSync('src/i18n/locales/'+l+'.json','utf8')))"
```

Expected: silent (no parse errors).

- [ ] **Step 3: Commit**

```bash
git add src/i18n/locales/en.json src/i18n/locales/ja.json src/i18n/locales/zh.json
git commit -m "feat(i18n): add track and shadowing-takes strings for player revamp"
```

---

## Task 3: Build `TimelineOverflowMenu` component

**Files:**
- Create: `src/components/player/TimelineOverflowMenu.tsx`

**Why now:** the toolbar refactor (Task 7) needs this. Build it isolated first so the toolbar refactor stays focused on layout.

- [ ] **Step 1: Create the component file**

```tsx
// src/components/player/TimelineOverflowMenu.tsx
import { ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { cn } from "../../utils/cn";

export interface OverflowItem {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  /** Optional class controlling visibility of the menu item itself.
   * Pair with the inline button's @container query so each control is
   * shown either inline OR in the menu, never both. */
  hideAtClass?: string;
  destructive?: boolean;
  shortcut?: string;
}

interface Props {
  items: OverflowItem[];
  className?: string;
  triggerClassName?: string;
  ariaLabel?: string;
}

export const TimelineOverflowMenu = ({
  items,
  className,
  triggerClassName,
  ariaLabel = "More controls",
}: Props) => {
  if (items.length === 0) return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={cn(
            "timeline-secondary-action p-1.5 rounded-full transition-colors active:scale-90 text-gray-700 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5",
            triggerClassName
          )}
          aria-label={ariaLabel}
        >
          <MoreHorizontal size={16} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="end"
          sideOffset={8}
          className={cn(
            "min-w-[180px] rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-900 shadow-xl py-1 z-50",
            className
          )}
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.id}
              onSelect={item.onSelect}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer outline-none",
                "text-gray-700 dark:text-gray-200",
                "data-[highlighted]:bg-gray-100 dark:data-[highlighted]:bg-white/5",
                item.destructive && "text-error-600 dark:text-error-400",
                item.hideAtClass
              )}
            >
              {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
              <span className="flex-1 truncate">{item.label}</span>
              {item.shortcut && (
                <span className="text-[10px] text-gray-400 font-mono">{item.shortcut}</span>
              )}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
```

- [ ] **Step 2: Verify Radix DropdownMenu is available**

```bash
node -e "console.log(require('@radix-ui/react-dropdown-menu/package.json').version)"
```

Expected: prints a version. If error, run `npm install @radix-ui/react-dropdown-menu` and commit `package.json` + `package-lock.json` separately.

- [ ] **Step 3: Lint passes for the new file**

```bash
npx eslint src/components/player/TimelineOverflowMenu.tsx --max-warnings 0
```

Expected: no errors.

- [ ] **Step 4: Build passes**

```bash
npm run build
```

Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/components/player/TimelineOverflowMenu.tsx package.json package-lock.json
git commit -m "feat(player): add TimelineOverflowMenu dropdown component"
```

---

## Task 4: Build `TrackHeader` component (default + expanded states)

**Files:**
- Create: `src/components/player/TrackHeader.tsx`

**Why now:** Task 5 wires it into `TimelinePanel`; Task 8 only deletes floating canvas controls AFTER this component proves complete coverage in real use.

This task creates the component. State coverage is verified visually in Task 5 and behaviorally in Task 8/12.

- [ ] **Step 0: Sanity-check store API names**

The component below assumes these exist on `useShadowingStore`: `isShadowingMode`, `setShadowingMode`, `isRecording`, `recordingSegmentId`, `setRecordingSegmentId`, `deleteAllSegments(mediaId)`, `sessions[mediaId].segments`. And on `usePlayerStore`: `duration`, `setCurrentTime`, `setIsPlaying`, `currentFile`, `currentYouTube`. And on `useSettingsStore`: `waveformZoom`, `setWaveformZoom`. And `formatTime` exported from `src/utils/formatTime.ts`.

```bash
grep -nE "setShadowingMode|setRecordingSegmentId|deleteAllSegments" src/stores/shadowingStore.ts | head -5
grep -nE "setCurrentTime|setIsPlaying|setWaveformZoom|setSeekStepSeconds" src/stores/playerStore.ts src/stores/settingsStore.ts | head -10
grep -nE "export.*formatTime" src/utils/formatTime.ts
```

Expected: each grep prints at least one matching line. If any is missing, stop and reconcile names with the actual store before writing the component.

- [ ] **Step 1: Create the file with full feature coverage**

```tsx
// src/components/player/TrackHeader.tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { ChevronDown, ChevronUp, Mic, Radio, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { toast } from "react-hot-toast";
import { useSettingsStore } from "../../stores/settingsStore";
import { useShadowingStore } from "../../stores/shadowingStore";
import { usePlayerStore } from "../../stores/playerStore";
import { formatTime } from "../../utils/formatTime";
import { cn } from "../../utils/cn";

interface Props {
  /** Resolved media id used to scope shadowing segments. Null means no media. */
  mediaId: string | null;
}

export const TrackHeader = ({ mediaId }: Props) => {
  const { t } = useTranslation();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const { duration, setCurrentTime, setIsPlaying } = usePlayerStore(
    useShallow((s) => ({
      duration: s.duration,
      setCurrentTime: s.setCurrentTime,
      setIsPlaying: s.setIsPlaying,
    }))
  );

  const { waveformZoom, setWaveformZoom } = useSettingsStore();

  const {
    isShadowingMode,
    setShadowingMode,
    isRecording,
    recordingSegmentId,
    setRecordingSegmentId,
    deleteAllSegments,
  } = useShadowingStore(
    useShallow((s) => ({
      isShadowingMode: s.isShadowingMode,
      setShadowingMode: s.setShadowingMode,
      isRecording: s.isRecording,
      recordingSegmentId: s.recordingSegmentId,
      setRecordingSegmentId: s.setRecordingSegmentId,
      deleteAllSegments: s.deleteAllSegments,
    }))
  );

  const segments = useShadowingStore((s) =>
    mediaId ? s.sessions[mediaId]?.segments ?? [] : []
  );

  const expanded = isShadowingMode || segments.length > 0 || isRecording;

  const zoomIn = () => setWaveformZoom(Math.min(waveformZoom * 1.25, 50));
  const zoomOut = () => setWaveformZoom(Math.max(waveformZoom / 1.25, 1));

  const onSelectTake = (startTime: number) => {
    setCurrentTime(startTime);
    setIsPlaying(true);
  };

  const onClearAll = () => {
    if (!mediaId) return;
    deleteAllSegments(mediaId);
    toast.success(t("shadowing.success.trackDeleted"));
    setIsConfirmingDelete(false);
  };

  return (
    <div
      className={cn(
        "flex flex-col select-none border-b border-gray-200 dark:border-white/5",
        "bg-gray-100/70 dark:bg-gray-900/60 backdrop-blur-sm"
      )}
    >
      {/* Original row */}
      <div className="flex items-center gap-2 px-3 h-7 min-h-[28px]">
        <span
          className="inline-block w-2 h-2 rounded-full bg-primary-500 ring-2 ring-primary-500/30"
          aria-hidden
        />
        <span className="text-[11px] font-semibold tracking-wide text-gray-700 dark:text-gray-200">
          {t("track.original")}
        </span>
        {duration > 0 && (
          <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono tabular-nums">
            {t("track.totalDuration", { time: formatTime(duration) })}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {!expanded && mediaId && (
            <button
              onClick={() => setShadowingMode(true)}
              className="timeline-secondary-action px-2 py-0.5 rounded text-[11px] font-medium text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5"
              title={t("shadowing.enable")}
            >
              <Mic size={11} className="inline mr-1" />
              {t("track.shadowing")}
            </button>
          )}
          <button
            onClick={zoomOut}
            className="timeline-secondary-action p-1 rounded text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5"
            title={t("waveform.zoomOut")}
          >
            <ZoomOut size={12} />
          </button>
          <button
            onClick={zoomIn}
            className="timeline-secondary-action p-1 rounded text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5"
            title={t("waveform.zoomIn")}
          >
            <ZoomIn size={12} />
          </button>
        </div>
      </div>

      {/* Shadowing row (only when expanded) */}
      {expanded && mediaId && (
        <div className="flex items-center gap-2 px-3 h-7 min-h-[28px] border-t border-gray-200/60 dark:border-white/5">
          <span
            className={cn(
              "inline-block w-2 h-2 rounded-full",
              isRecording
                ? "bg-error-500 animate-pulse ring-2 ring-error-500/40"
                : "bg-success-500 ring-2 ring-success-500/30"
            )}
            aria-hidden
          />
          <span className="text-[11px] font-semibold tracking-wide text-gray-700 dark:text-gray-200">
            {t("track.shadowing")}
          </span>

          {/* Takes selector */}
          {segments.length > 0 && !isRecording && (
            <Popover.Root>
              <Popover.Trigger asChild>
                <button
                  className="timeline-secondary-action px-1.5 py-0.5 rounded text-[10px] font-mono text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-0.5"
                  title={t("shadowing.takes", { defaultValue: "Takes" })}
                >
                  {t("shadowing.takeOf", { n: segments.length, total: segments.length })}
                  <ChevronDown size={10} />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  side="top"
                  align="start"
                  sideOffset={8}
                  className="min-w-[200px] rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-900 shadow-xl py-1 z-50"
                >
                  {segments.map((seg, idx) => (
                    <button
                      key={seg.id}
                      onClick={() => onSelectTake(seg.startTime)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-gray-100 dark:hover:bg-white/5"
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: ["#22c55e", "#34d399", "#6ee7b7", "#059669", "#10b981", "#047857"][idx % 6],
                        }}
                      />
                      <span className="flex-1 text-left text-gray-700 dark:text-gray-200">
                        {t("shadowing.take", { defaultValue: "Take" })} {idx + 1}
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono tabular-nums">
                        {formatTime(seg.startTime)}–{formatTime(seg.startTime + seg.duration)}
                      </span>
                    </button>
                  ))}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          )}

          {isRecording && (
            <span className="text-[10px] text-error-600 dark:text-error-400 font-mono tabular-nums">
              {t("shadowing.recordingNow", { defaultValue: "Recording…" })}
            </span>
          )}

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setShadowingMode(!isShadowingMode)}
              aria-pressed={isShadowingMode}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1",
                isRecording
                  ? "bg-error-500 text-white hover:bg-error-600"
                  : isShadowingMode
                    ? "bg-error-50 text-error-600 dark:bg-error-900/30 dark:text-error-300 hover:bg-error-100 dark:hover:bg-error-900/40"
                    : "text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5"
              )}
              title={isShadowingMode ? t("shadowing.disable") : t("shadowing.enable")}
            >
              {isRecording ? <Radio size={11} className="animate-pulse" /> : <Mic size={11} />}
              <span>{isRecording ? "Stop" : "REC"}</span>
            </button>
            <button
              onClick={() => setRecordingSegmentId(recordingSegmentId ? undefined : "sentence-mode")}
              className={cn(
                "p-1 rounded text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5",
                recordingSegmentId && "text-info-600 dark:text-info-400 bg-info-500/10"
              )}
              title={
                recordingSegmentId
                  ? t("shadowing.disableSentenceMode", { defaultValue: "Disable Sentence Mode" })
                  : t("shadowing.enableSentenceMode", { defaultValue: "Record per Sentence" })
              }
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 7 4 4 7 4" />
                <polyline points="20 17 20 20 17 20" />
                <polyline points="7 20 4 20 4 17" />
                <polyline points="17 4 20 4 20 7" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </button>
            {segments.length > 0 && (
              !isConfirmingDelete ? (
                <button
                  onClick={() => setIsConfirmingDelete(true)}
                  className="p-1 rounded text-gray-500 dark:text-gray-400 hover:text-error-500 hover:bg-black/5 dark:hover:bg-white/5"
                  title={t("shadowing.deleteTrack", { defaultValue: "Delete Shadow Track" })}
                >
                  <Trash2 size={12} />
                </button>
              ) : (
                <button
                  onClick={onClearAll}
                  className="px-1.5 py-0.5 rounded bg-error-500 text-white text-[10px] font-bold hover:bg-error-600"
                  title={t("common.remove")}
                >
                  ✓
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Lint and build pass**

```bash
npx eslint src/components/player/TrackHeader.tsx --max-warnings 0
npm run build
```

Expected: no errors. If lint complains about `useState` import or unused variables, clean up.

- [ ] **Step 3: Commit**

```bash
git add src/components/player/TrackHeader.tsx
git commit -m "feat(player): add TrackHeader component for waveform area"
```

---

## Task 5: Wire `TrackHeader` into `TimelinePanel`

**Files:**
- Modify: `src/components/player/TimelinePanel.tsx`
- Modify: `src/components/waveform/WaveformVisualizer.tsx` (only to expose `mediaId` derivation if needed; but mediaId is already store-derivable)

**Note:** at the end of this task, both `TrackHeader` AND the canvas-floating controls coexist. This is intentional — we keep functional safety net until Task 8 verifies coverage.

- [ ] **Step 1: Replace `TimelinePanel` body to insert TrackHeader**

Open `src/components/player/TimelinePanel.tsx`. Modify the full-mode return to add `TrackHeader` between `TimelineToolbar` and `TimeRuler`:

```tsx
// at top of file, add:
import { TrackHeader } from "./TrackHeader";
import { usePlayerStore } from "../../stores/playerStore";
import { useShallow } from "zustand/react/shallow";

// inside the component, near top, derive mediaId:
const { currentFile, currentYouTube } = usePlayerStore(
  useShallow((s) => ({ currentFile: s.currentFile, currentYouTube: s.currentYouTube }))
);
const mediaId = currentFile
  ? currentFile.storageId || currentFile.id || `file-${currentFile.name}-${currentFile.size}`
  : currentYouTube
    ? `youtube-${currentYouTube.id}`
    : null;
```

Then in the **full mode** return JSX, add `<TrackHeader mediaId={mediaId} />` immediately after `<TimelineToolbar ... />`:

```tsx
return (
  <div className={cn("timeline-panel-shell flex flex-col min-h-0 max-h-[360px] @container/timeline bg-white dark:bg-gray-950/40 rounded-t-xl border border-gray-200 dark:border-white/5 overflow-y-auto overflow-x-hidden overscroll-contain", className)}>
    <TimelineToolbar
      collapsed={collapsed}
      onCollapse={onCollapse}
      onExpand={onExpand}
      onHide={onHide}
    />

    <TrackHeader mediaId={mediaId} />

    {/* Time ruler */}
    <div className="timeline-ruler h-5 shrink-0 px-3 bg-white dark:bg-gray-950/40 border-b border-gray-100 dark:border-white/5 relative select-none min-w-0 overflow-hidden">
      <TimeRuler duration={duration} />
    </div>

    {/* Waveform */}
    <div className="timeline-waveform-frame flex-1 min-h-[96px] max-h-[260px] bg-gray-100 dark:bg-[#0b0e1c] relative overflow-hidden">
      <WaveformVisualizer className="mx-auto h-full max-h-[260px] w-full max-w-[1280px]" />
    </div>
  </div>
);
```

(Note `@container/timeline` added to root, plus `dark:bg-[#0b0e1c]` updated for the §5.3 background change.)

Also update the **collapsed mode** root to include `@container/timeline` for consistency:

```tsx
<div className={cn("timeline-panel-shell flex flex-col @container/timeline bg-white dark:bg-gray-950/40 rounded-t-xl border border-gray-200 dark:border-white/5 overflow-hidden", className)}>
```

- [ ] **Step 2: Smoke check the page**

Run `npm run dev` (or `npm run dev:electron`). Open the player with a media file. Verify:
- Header strip appears just below toolbar.
- "Original" label and total duration visible.
- Clicking the `Shadow` shortcut on header expands the shadowing area (because it sets `isShadowingMode = true`).
- Existing canvas-floating mic/expand panel ALSO still works (this is intentional).
- Zoom in/out from header changes waveform zoom.

- [ ] **Step 3: Lint + build pass**

```bash
npx eslint src/components/player/TimelinePanel.tsx --max-warnings 0
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/player/TimelinePanel.tsx
git commit -m "feat(player): integrate TrackHeader into TimelinePanel"
```

---

## Task 6: Add container queries to `TimelinePanel` and `MediaPreviewPanel`

**Files:**
- Modify: `src/components/player/MediaPreviewPanel.tsx`

(`TimelinePanel` already received `@container/timeline` in Task 5.)

**Why now:** Task 7 toolbar refactor depends on `@container/timeline` being live; this also tackles Video panel as the simplest cq target.

- [ ] **Step 1: Wrap MediaPreviewPanel root with @container/video**

In `src/components/player/MediaPreviewPanel.tsx`, change the outer div:

```tsx
<div className={cn("flex flex-col min-h-0 @container/video bg-white dark:bg-gray-950/40 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden", className)}>
```

And replace the inner empty-state branch to be cq-aware:

```tsx
{!currentFile && !youtubeId && (
  <span className="text-xs @[260px]/video:text-sm text-gray-500 dark:text-gray-400 px-3">
    {t("player.noMediaLoaded")}
  </span>
)}
```

- [ ] **Step 2: Lint + build**

```bash
npx eslint src/components/player/MediaPreviewPanel.tsx --max-warnings 0
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/player/MediaPreviewPanel.tsx
git commit -m "feat(player): add container query to MediaPreviewPanel"
```

---

## Task 7: Refactor `TimelineToolbar` with priority-tier slots and overflow menu

**Files:**
- Modify: `src/components/player/TimelineToolbar.tsx`

This is the largest single file change. Read the entire current file before editing.

- [ ] **Step 1: Read the current file completely**

```bash
wc -l src/components/player/TimelineToolbar.tsx
```

Confirm ~263 lines. Open and read fully so refactor preserves every handler.

- [ ] **Step 2: Reorganize the JSX into priority slots**

Replace the toolbar's `return (...)` JSX with:

```tsx
return (
  <div className="timeline-toolbar @container/toolbar flex min-w-0 items-center gap-1.5 sm:gap-2 overflow-hidden px-2 sm:px-3 py-1.5 bg-gray-50 dark:bg-gray-900/80 border-b border-gray-200 dark:border-white/5">
    {/* PRIMARY — always visible */}
    <div className="flex items-center gap-0.5 shrink-0">
      <button onClick={seekBackward} className="p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors text-gray-700 dark:text-gray-400 active:scale-90 min-w-[28px]" title={t("player.seekBackwardSeconds", { seconds: seekStepSeconds })}>
        <SkipBack size={16} />
      </button>
      <button onClick={togglePlayPause} className="p-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full shadow-lg hover:shadow-xl active:scale-95 transition-all min-w-[36px]">
        {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} className="ml-0.5" fill="currentColor" />}
      </button>
      <button onClick={seekForward} className="p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors text-gray-700 dark:text-gray-400 active:scale-90 min-w-[28px]" title={t("player.seekForwardSeconds", { seconds: seekStepSeconds })}>
        <SkipForward size={16} />
      </button>
    </div>

    {/* Time — hides under 180px */}
    <div className="hidden @[180px]/toolbar:block text-xs font-mono text-gray-700 dark:text-gray-300 tabular-nums whitespace-nowrap shrink-0">
      {formatTime(currentTime)} / {formatTime(duration)}
    </div>

    <div className="flex-1 min-w-1" />

    {/* PRIMARY action group — Record + A-B */}
    <div className="flex items-center gap-0.5 shrink-0">
      <button onClick={toggleShadowing} className={cn("flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors min-w-[28px]", isShadowingMode ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30")} title={t("shadowing.record")}>
        <Mic size={13} />
        <span className="hidden @[300px]/toolbar:inline">{t("shadowing.record", { defaultValue: "Record" })}</span>
      </button>
      <button onClick={() => { /* A-B logic unchanged */
          if (loopStart === null) setLoopPoints(currentTime, null);
          else if (loopEnd === null) setLoopPoints(loopStart, currentTime);
          else setLoopPoints(null, null);
        }} className={cn("flex items-center gap-0.5 px-2 py-1 rounded-md text-xs font-medium transition-colors active:scale-90 min-w-[28px]", loopStart !== null && loopEnd !== null ? "text-primary-600 bg-primary-50 dark:bg-primary-900/30" : loopStart !== null ? "text-amber-600 bg-amber-50 dark:bg-amber-900/30" : "text-gray-700 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5")} title={t("player.abLoop", { defaultValue: "A-B Loop" })}>
        <span className="font-mono">{loopStart !== null && loopEnd !== null ? "A-B" : loopStart !== null ? "A-" : "A-B"}</span>
      </button>
    </div>

    {/* SECONDARY — collapse based on width */}
    {/* Speed: visible @[360px]+ */}
    <div className="hidden @[360px]/toolbar:flex items-center shrink-0">
      <Popover>
        <PopoverTrigger asChild>
          <button className="timeline-secondary-action flex items-center gap-0.5 px-2 py-1 rounded-md text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors min-w-[40px]">
            <span>{playbackRate.toFixed(2)}x</span>
            <ChevronDown size={12} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-3 space-y-3" side="top" align="end">
          {/* unchanged speed popover content */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">{t("player.playbackSpeed", { defaultValue: "Speed" })}</span>
            <span className="text-sm font-bold font-mono text-primary-600">{playbackRate.toFixed(2)}x</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={decreasePlaybackRate} className="flex-1 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs hover:bg-gray-100 dark:hover:bg-gray-700">-0.25</button>
            <button onClick={() => setPlaybackRate(1)} className="flex-1 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs font-bold hover:bg-gray-100 dark:hover:bg-gray-700">1x</button>
            <button onClick={increasePlaybackRate} className="flex-1 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs hover:bg-gray-100 dark:hover:bg-gray-700">+0.25</button>
          </div>
        </PopoverContent>
      </Popover>
    </div>

    {/* Loop, Volume: visible @[480px]+ */}
    <button onClick={() => setIsLooping(!isLooping)} className={cn("hidden @[480px]/toolbar:inline-flex items-center timeline-secondary-action p-1.5 rounded-full transition-colors active:scale-90 min-w-[28px]", isLooping ? "text-primary-600 bg-primary-50 dark:bg-primary-900/30" : "text-gray-700 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5")} title={t("player.toggleLooping")}>
      <Repeat size={16} />
    </button>
    <div className="hidden @[480px]/toolbar:flex items-center">
      <Popover>
        <PopoverTrigger asChild>
          <button className="timeline-secondary-action p-1.5 rounded-full transition-colors active:scale-90 text-gray-700 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 min-w-[28px]">
            {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-36 p-3" side="top" sideOffset={12}>
          <div className="flex items-center gap-2">
            <button onClick={toggleMute} className="text-gray-500 dark:text-gray-400">
              {muted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <Slider value={[volume]} min={0} max={1} step={0.01} onValueChange={handleVolumeChange} className="flex-1" />
          </div>
        </PopoverContent>
      </Popover>
    </div>

    {/* Settings, SentencePractice: visible @[640px]+ */}
    <button onClick={() => navigate("/sentence-practice")} className="hidden @[640px]/toolbar:inline-flex timeline-secondary-action p-1.5 rounded-full transition-colors active:scale-90 text-gray-700 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 min-w-[28px]" title={t("sentencePractice.title")}>
      <ListMusic size={16} />
    </button>
    <div className="hidden @[640px]/toolbar:flex items-center">
      <Popover>
        <PopoverTrigger asChild>
          <button className="timeline-secondary-action p-1.5 rounded-full transition-colors active:scale-90 text-gray-700 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 min-w-[28px]">
            <Settings2 size={16} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-4 space-y-4" side="top" align="end">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{t("settingsPage.seekStep")}</label>
            <div className="flex items-center gap-2">
              <input type="number" min={0.1} max={120} step={0.1} value={seekStepSeconds} onChange={(e) => usePlayerStore.getState().setSeekStepSeconds(parseFloat(e.target.value) || 0)} className="w-16 h-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-2 text-xs font-bold text-right" />
              <span className="text-[10px] text-gray-400">s</span>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>

    {/* Overflow menu — visible whenever ANY secondary control is hidden */}
    <div className="@[640px]/toolbar:hidden flex items-center shrink-0">
      <TimelineOverflowMenu
        ariaLabel={t("layout.layoutSettings")}
        items={[
          // Speed (hidden < 360px)
          {
            id: "speed",
            label: `${t("player.playbackSpeed", { defaultValue: "Speed" })}: ${playbackRate.toFixed(2)}x`,
            icon: <ChevronDown size={12} />,
            onSelect: () => setPlaybackRate(playbackRate >= 2 ? 0.5 : Math.min(2, playbackRate + 0.25)),
            hideAtClass: "@[360px]/toolbar:hidden",
          },
          // Loop (hidden < 480px)
          {
            id: "loop",
            label: t("player.toggleLooping"),
            icon: <Repeat size={12} />,
            onSelect: () => setIsLooping(!isLooping),
            hideAtClass: "@[480px]/toolbar:hidden",
          },
          // Volume (hidden < 480px) — link to popover indirectly: just toggle mute
          {
            id: "volume",
            label: muted ? t("player.unmute", { defaultValue: "Unmute" }) : t("player.mute", { defaultValue: "Mute" }),
            icon: muted || volume === 0 ? <VolumeX size={12} /> : <Volume2 size={12} />,
            onSelect: toggleMute,
            hideAtClass: "@[480px]/toolbar:hidden",
          },
          // SentencePractice (hidden < 640px)
          {
            id: "sentence",
            label: t("sentencePractice.title"),
            icon: <ListMusic size={12} />,
            onSelect: () => navigate("/sentence-practice"),
            hideAtClass: "@[640px]/toolbar:hidden",
          },
        ]}
      />
    </div>

    {/* Panel controls — always visible */}
    <div className="timeline-panel-controls flex shrink-0 items-center gap-0.5 ml-1 pl-2 border-l border-gray-200 dark:border-white/10">
      {collapsed ? (
        <button onClick={onExpand} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 transition-colors" title="Expand">
          <Square size={12} />
        </button>
      ) : (
        <button onClick={onCollapse} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 transition-colors" title="Collapse">
          <Minus size={12} />
        </button>
      )}
      <button onClick={onHide} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 transition-colors" title="Hide">
        <X size={12} />
      </button>
    </div>
  </div>
);
```

Note the `hideAtClass` on overflow items uses an inverse pattern: if the inline button is `hidden @[360px]/toolbar:flex`, the menu item should be `@[360px]/toolbar:hidden` so it disappears when the button is visible.

Adjust `TimelineOverflowMenu` Item rendering to apply `hideAtClass` directly to the `DropdownMenu.Item` (already done in Task 3 via the `hideAtClass` prop). Verify by reading Task 3's component code: `className={cn(..., item.hideAtClass)}` — yes.

Also import `TimelineOverflowMenu` at the top of `TimelineToolbar.tsx`.

- [ ] **Step 3: Lint + build**

```bash
npx eslint src/components/player/TimelineToolbar.tsx --max-warnings 0
npm run build
```

If unused imports flagged (`ChevronDown` may have moved usage), remove them.

- [ ] **Step 4: Manual width sweep**

Run `npm run dev:electron`. With a media file loaded, drag the Timeline panel handle to widen and narrow. Confirm at each width band:
- ≥ 640px: all controls inline.
- 480–640: settings + sentence practice gone from inline, present in `⋯`.
- 360–480: + loop, volume gone from inline.
- 240–360: + speed gone from inline.
- < 240: only prev/play/next + A-B + REC + ⋯ + panel controls visible.
- < 180: time also hidden.

- [ ] **Step 5: Commit**

```bash
git add src/components/player/TimelineToolbar.tsx
git commit -m "feat(player): smart-fold timeline toolbar with overflow menu"
```

---

## Task 8: Remove floating UI from `WaveformVisualizer`

**Files:**
- Modify: `src/components/waveform/WaveformVisualizer.tsx`

**Pre-flight:** before deleting any control, walk the Coverage Checklist at the top of this plan and tick every row off by exercising it through `TrackHeader` or the toolbar (i.e., currently both old and new exist; verify the new fully covers).

- [ ] **Step 1: Re-read `WaveformVisualizer.tsx` to map removals**

```bash
wc -l src/components/waveform/WaveformVisualizer.tsx
```

(~1295 lines). Identify three blocks to remove:

1. The "Shadowing control float" cluster (around lines 1153–1250 in the current file): a glass `bg-black/60 backdrop-blur-md` panel rendering expand/collapse, mic toggle, sentence toggle, delete with confirmation.
2. The "Shadowing takes list" floating panel (around lines 1252–1290): `Shadow Takes` panel with takes list.
3. The hover-only zoom buttons near the top-right (around lines 1148–1151): `ZoomIn`/`ZoomOut` buttons.

**Keep:**
- The three canvas refs and their inline `<canvas>` elements.
- All mouse/touch/wheel handlers.
- `overlapMenu` rendering (this is the bookmark overlap selector — orthogonal to the three deleted blocks).
- The drag-selection visual `<div>`.
- The YouTube notice + waveform analyzing/error notice (re-style only).
- The `hoverTime` time bubble.

- [ ] **Step 2: Delete the three blocks**

Use `Edit` with the exact opening/closing markers of each block. Remove unused imports afterward (`ChevronUp`, `ChevronDown`, `Mic`, `Radio`, `Trash2`, `ZoomIn`, `ZoomOut`, possibly `toast` if not used elsewhere).

- [ ] **Step 3: Remove now-unused state**

Remove `isConfirmingDelete` state and its setter if confirmation moved entirely to `TrackHeader`. (If still used elsewhere in this file, keep it.) Remove `isShadowingExpanded` local state if it became fully derived from `isShadowingMode || segments.length > 0 || isRecording` — but verify by searching: this state is also passed to `WaveformRenderer.setShadowingExpanded(...)`, so it must remain available. Keep the `useEffect` that auto-expands.

Concretely: keep `isShadowingExpanded` because the renderer uses it. Just remove the UI controls that toggled it — the auto-expand effect is enough.

- [ ] **Step 4: Lint + build**

```bash
npx eslint src/components/waveform/WaveformVisualizer.tsx --max-warnings 0
npm run build
```

If lint flags unused imports, remove them.

- [ ] **Step 5: Functional smoke pass**

Run `npm run dev:electron`. Walk the Coverage Checklist:

| Check | How |
|---|---|
| Mic / Shadowing toggle | Click `REC` in TrackHeader → starts recording flow |
| Sentence-mode toggle | Click sentence-mode icon in TrackHeader → toggles |
| Expand/collapse | Auto-expand when any take or recording active; no explicit collapse button (this matches §5.2 spec — collapse happens by removing all takes & exiting shadowing mode). |
| Clear-all | Click trash icon in TrackHeader → confirmation → clears |
| Takes list | Click `Take N of N ▾` in TrackHeader → popover with takes → click seeks |
| Zoom in/out | Click `+` / `−` in TrackHeader → zooms |

If any check fails, fix in `TrackHeader.tsx` and re-run before continuing.

- [ ] **Step 6: Commit**

```bash
git add src/components/waveform/WaveformVisualizer.tsx
git commit -m "refactor(player): remove floating canvas controls — TrackHeader takes over"
```

---

## Task 9: Polish `WaveformRenderer` private draw methods

**Files:**
- Modify: `src/player/WaveformRenderer.ts`
- Existing test reference: `tests/waveformRenderer.test.ts`

**Scope guard:** edit ONLY `_drawStaticLayer`, `_drawOverlayLayer`, `_drawPlayheadLayer` (and any private helpers they invoke). Do NOT change `_vp()`, `_resize()`, public setters, or any signature.

- [ ] **Step 1: Read the three methods**

```bash
sed -n '161,470p' src/player/WaveformRenderer.ts
```

Familiarize yourself with the current peak/min-max/RMS draw logic, the loop range overlay, the playhead, and the take labels' coordinate system.

- [ ] **Step 2: Verify existing renderer tests pass before edits (baseline)**

```bash
npx tsx --test tests/waveformRenderer.test.ts tests/waveformEngine.test.ts
```

Expected: all pass. If they fail, stop and investigate before touching the renderer.

- [ ] **Step 3: Update `_drawStaticLayer` for the §5.3/§5.4 visual improvements**

Apply these changes inside `_drawStaticLayer` only:

(a) **Center line**: after the main waveform peaks/min-max draw, before any shadowing area code, add:
```ts
ctx.fillStyle = `${colors.primary}1A`; // ~10% alpha
ctx.fillRect(0, mainCenterY - 0.5 * dpr, cw, 1 * dpr);
```

(b) **RMS three-color treatment** in the min/max+rms branch: change the inner RMS fill from solid `${colors.primary}80` to a brighter, ~40% alpha overlay:
```ts
if (this._rms) {
  const rmsVal = this._rms[i] * scale * 0.6;
  const rmsTop = mainCenterY - rmsVal;
  const rmsH = Math.max(0.5 * dpr, rmsVal * 2);
  ctx.fillStyle = `${colors.primary}66`; // ~40% alpha
  ctx.fillRect(x, rmsTop, barW, rmsH);
}
```

(c) **Shadowing/Original separator** — replace the hard 1px line drawn at top of shadowing area:
```ts
// before:
// ctx.strokeStyle = hexToRgba(colors.primary, 0.3); ctx.lineWidth = 1*dpr;
// ctx.moveTo(0,sTop); ctx.lineTo(cw,sTop); ctx.stroke();

// after — gradient line:
const gradient = ctx.createLinearGradient(0, sTop, cw, sTop);
gradient.addColorStop(0, hexToRgba(colors.primary, 0.3));
gradient.addColorStop(0.5, "rgba(0,0,0,0)");
gradient.addColorStop(1, hexToRgba(colors.primary, 0.3));
ctx.fillStyle = gradient;
ctx.fillRect(0, sTop, cw, 1 * dpr);
```

(d) **Take dimming**: introduce currentTake selection. Add a private property:
```ts
private _currentTakeIndex: number | null = null;
```
And public setter:
```ts
setCurrentTakeIndex(index: number | null): void {
  this._currentTakeIndex = index; this.redrawStatic();
}
```
Inside the take render loop, multiply alpha:
```ts
const isCurrent = this._currentTakeIndex === null || this._currentTakeIndex === segIdx;
const takeAlpha = isCurrent ? 1.0 : 0.5;
// when filling:
ctx.fillStyle = `${takeColor}${Math.round(takeAlpha * 255).toString(16).padStart(2, "0")}`;
```

(e) **Take labels** above each take's start: after the bar render loop for a take, draw:
```ts
const labelY = sTop + sPad + 4 * dpr;
const labelX = ((seg.start - startOffset) / visibleDuration) * cw;
if (labelX >= 0 && labelX < cw) {
  // colored bar
  ctx.fillStyle = takeColor;
  ctx.fillRect(labelX, sTop + sPad, 2 * dpr, 6 * dpr);
  // T# label
  ctx.fillStyle = takeColor;
  ctx.font = `${10 * dpr}px monospace`;
  ctx.textBaseline = "top";
  ctx.fillText(`T${segIdx + 1}`, labelX + 4 * dpr, labelY);
}
```

(f) **Empty Shadowing state** (expanded, no takes, not recording):
```ts
if (this._shadowingExpanded && this._shadowingWaveforms.length === 0 && !this._recordingOverlay && !this._fadingRecording) {
  ctx.save();
  ctx.fillStyle = "rgba(148,163,184,0.6)"; // gray-400ish
  ctx.font = `${11 * dpr}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Press REC to record your first take", cw / 2, sCenterY);
  ctx.restore();
}
```

- [ ] **Step 4: Update `_drawOverlayLayer` for loop A/B labels and dashed drag selection**

Inside the loop range render (where currently `ctx.fillRect(cLoopS, 0, cLoopE - cLoopS, ch)` is the only loop visualization), add at the start and end edges:
```ts
if (this._loopStart !== null && this._loopEnd !== null && cLoopS >= 0 && cLoopE <= cw) {
  // Existing fill stays.
  // Add solid edges:
  ctx.fillStyle = colors.primary;
  ctx.fillRect(cLoopS - 0.75 * dpr, 0, 1.5 * dpr, ch);
  ctx.fillRect(cLoopE - 0.75 * dpr, 0, 1.5 * dpr, ch);
  // A and B labels:
  const labelW = 14 * dpr, labelH = 12 * dpr;
  ctx.fillStyle = colors.primary;
  ctx.fillRect(cLoopS, 0, labelW, labelH);
  ctx.fillRect(cLoopE - labelW, 0, labelW, labelH);
  ctx.fillStyle = "white";
  ctx.font = `${9 * dpr}px monospace`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText("A", cLoopS + 4 * dpr, 1 * dpr);
  ctx.fillText("B", cLoopE - labelW + 4 * dpr, 1 * dpr);
}
```

For drag selection, change the solid fill to a fill + dashed border:
```ts
if (this._dragSelection) {
  const s = Math.min(this._dragSelection.start, this._dragSelection.end);
  const e = Math.max(this._dragSelection.start, this._dragSelection.end);
  if (!(e < startOffset || s > endOffset)) {
    const x1 = ((s - startOffset) / visibleDuration) * cw;
    const x2 = ((e - startOffset) / visibleDuration) * cw;
    const w = x2 - x1;
    if (w > 0) {
      ctx.fillStyle = hexToRgba(colors.primary, 0.30);
      ctx.fillRect(x1, 0, w, ch);
      ctx.save();
      ctx.strokeStyle = colors.primary;
      ctx.lineWidth = 1 * dpr;
      ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.strokeRect(x1, 0, w, ch);
      ctx.restore();
    }
  }
}
```

- [ ] **Step 5: Update `_drawPlayheadLayer` for the triangle handle**

After drawing the existing 1.5px playhead line, add:
```ts
// Triangle handle at top
ctx.fillStyle = colors.primary;
ctx.beginPath();
ctx.moveTo(playheadX - 4 * dpr, 0);
ctx.lineTo(playheadX + 4 * dpr, 0);
ctx.lineTo(playheadX, 6 * dpr);
ctx.closePath();
ctx.fill();
```

(Replace `playheadX` with whatever local var name the existing code uses for the playhead's x position.)

- [ ] **Step 6: Wire `setCurrentTakeIndex` into `WaveformVisualizer`**

In `src/components/waveform/WaveformVisualizer.tsx`, right after the existing `// ─── Sync: shadowing waveforms ───` effect, add a new effect:
```tsx
const currentTakeIndex = useShadowingStore((s) => {
  if (!mediaId) return null;
  const session = s.sessions[mediaId];
  if (!session?.currentTakeId) return null;
  const idx = (session.segments ?? []).findIndex((seg) => seg.id === session.currentTakeId);
  return idx >= 0 ? idx : null;
});

useEffect(() => {
  rendererRef.current?.setCurrentTakeIndex(currentTakeIndex);
}, [currentTakeIndex]);
```

If `shadowingStore` does not yet have a `currentTakeId` field, the code falls back to `null` (all takes 100% opacity) — this preserves current behavior. Adding persistent `currentTakeId` is **out of scope** for this revamp; it's a future enhancement.

- [ ] **Step 7: Run tests + lint + build**

```bash
npx tsx --test tests/waveformRenderer.test.ts tests/waveformEngine.test.ts
npx eslint src/player/WaveformRenderer.ts src/components/waveform/WaveformVisualizer.tsx --max-warnings 0
npm run build
```

Expected: all tests pass, no lint errors, build succeeds.

- [ ] **Step 8: Visual verification**

Run `npm run dev:electron`. Load an audio file. Verify:
- Center line visible (subtle).
- RMS visible as inner brighter band on bars.
- Set A-B loop → A and B labels appear at edges, with primary edges; mid-region tinted.
- Drag selection → dashed border + filled.
- Record three takes → T1 T2 T3 labels appear; gradient separator between Original and Shadowing; playhead has triangle handle.

- [ ] **Step 9: Commit**

```bash
git add src/player/WaveformRenderer.ts src/components/waveform/WaveformVisualizer.tsx
git commit -m "feat(waveform): polish renderer visuals — RMS band, A/B labels, take labels, triangle playhead"
```

---

## Task 10: TranscriptPanel empty-state — container queries

**Files:**
- Modify: `src/components/transcript/TranscriptPanel.tsx`

**Scope guard:** edit only the empty-state card region (~lines 1830–1875). Do not read or edit the rest of the 2001-line file beyond the empty-state block + the panel's root div for `@container/transcript`.

- [ ] **Step 1: Locate the panel root**

```bash
grep -n "transcript-panel-root\|className.*flex.*flex-col.*h-full" src/components/transcript/TranscriptPanel.tsx | head -5
```

Find the outermost `<div>` of the rendered panel (the one that fills the panel slot). Add `@container/transcript` to its className. (If you cannot find a single root, add it to the wrapper `div` at the top of the JSX return.)

- [ ] **Step 2: Update the empty-state card region**

Replace lines around the "Full Transcript Empty State" block. Find the block starting:

```tsx
// Full Transcript Empty State
transcriptSegments.length === 0 ? (
  <div className="mx-auto flex min-h-[260px] max-w-lg items-center justify-center py-6">
    <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-6 py-7 text-center dark:border-gray-700 dark:bg-gray-800/50">
```

Replace with:

```tsx
// Full Transcript Empty State
transcriptSegments.length === 0 ? (
  <div className="mx-auto flex min-h-[200px] max-w-lg items-center justify-center py-6">
    <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 @[260px]/transcript:px-4 @[400px]/transcript:px-6 py-5 @[400px]/transcript:py-7 text-center dark:border-gray-700 dark:bg-gray-800/50">
      <div className="mx-auto mb-3 flex h-8 w-8 @[260px]/transcript:h-10 @[260px]/transcript:w-10 @[400px]/transcript:h-12 @[400px]/transcript:w-12 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
        <FileAudio size={14} className="@[260px]/transcript:hidden" />
        <FileAudio size={18} className="hidden @[260px]/transcript:inline @[400px]/transcript:hidden" />
        <FileAudio size={22} className="hidden @[400px]/transcript:inline" />
      </div>
      <h3 className="text-xs @[260px]/transcript:text-sm font-medium text-gray-800 dark:text-gray-200">
        {t(!currentFile && !currentYouTube ? "transcript.loadMediaFirst" : "transcript.clickToTranscribe", { provider: transcriptionService.getProviderInfo(currentProvider).name })}
      </h3>
      <p className="mx-auto mt-2 max-w-md text-[11px] @[260px]/transcript:text-xs @[400px]/transcript:text-sm text-gray-500 dark:text-gray-400">
        {currentFile || currentYouTube
          ? t("transcript.uploadExisting")
          : t("transcript.loadMediaFirst")}
      </p>
      {(currentFile || currentYouTube) && (
        <div className="mt-4 @[260px]/transcript:mt-5 space-y-3">
          <div className="flex flex-col @[300px]/transcript:flex-row items-stretch @[300px]/transcript:items-center justify-center gap-2">
            <button
              onClick={handleTranscribeDefault}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary-600 px-3 @[260px]/transcript:px-4 py-2 text-xs @[260px]/transcript:text-sm font-medium text-white transition-colors hover:bg-primary-700"
            >
              <FileAudio size={14} />
              <span>
                {loopStart !== null && loopEnd !== null
                  ? t("transcript.transcribeLoopRangeButton")
                  : t("transcript.transcribeWithWhisper")}
              </span>
            </button>
            <TranscriptUploader variant="prominent" />
          </div>
          <div className="text-[10px] @[260px]/transcript:text-xs text-gray-400 dark:text-gray-500">
            .srt / .vtt / .txt
          </div>
          {loopStart !== null && loopEnd !== null && (
            <div className="text-[10px] @[260px]/transcript:text-xs text-primary-600 dark:text-primary-400">
              {t("transcript.transcribeLoopRangeButton")}
            </div>
          )}
        </div>
      )}
    </div>
  </div>
) : null
```

(Three `<FileAudio>` variants — small/medium/large — each shown/hidden by container query. Tailwind JIT picks up these patterns as long as the strings appear literally in source. If for any reason a single variant flickers in two breakpoints at once, wrap each `FileAudio` in its own `<span className="...">` and put the visibility classes on the span instead.)

- [ ] **Step 3: Lint + build**

```bash
npx eslint src/components/transcript/TranscriptPanel.tsx --max-warnings 0
npm run build
```

- [ ] **Step 4: Visual verification at multiple widths**

Run `npm run dev:electron`. Load an audio file without transcript. Drag the Transcript panel handle to widths ~220px, 320px, 480px. Confirm at each:
- Card padding scales.
- Icon scales (or stays smallest).
- Button group stacks vertically below 300px, side-by-side above.
- Text scales.

- [ ] **Step 5: Commit**

```bash
git add src/components/transcript/TranscriptPanel.tsx
git commit -m "feat(transcript): empty-state uses container queries for graceful narrow widths"
```

---

## Task 11: Final verification matrix

**Files:** none modified.

- [ ] **Step 1: Pure-logic test suite**

```bash
npx tsx --test tests/waveformEngine.test.ts tests/waveformRenderer.test.ts tests/playbackClock.test.ts tests/sentenceSeek.test.ts tests/findActiveWord.test.ts tests/layoutStore.test.ts tests/mediaController.test.ts
```

Expected: all pass.

- [ ] **Step 2: Lint + production build**

```bash
npm run lint
npm run build
```

Expected: zero warnings, zero errors, build succeeds.

- [ ] **Step 3: Manual functional regression — minimum 6-combination matrix**

Run `npm run dev:electron` and verify each of these combinations works end-to-end:

1. **Audio file, wide Timeline (≥640px), dark theme** — playback, A-B drag/loop, bookmark click, record one take, take label appears, switch take via TrackHeader, delete one take, clear all.
2. **Audio file, narrow Timeline (~280px), dark theme** — toolbar shows only Prev/Play/Next + A-B + REC + ⋯; ⋯ contains Speed/Loop/Volume/Settings/SentencePractice; recording + take selection work via TrackHeader.
3. **Video file, wide Video panel, light theme** — video plays, transcript panel shows empty state with full-size buttons side-by-side.
4. **Video file, very narrow Transcript (~220px), light theme** — empty-state card buttons stack vertically, icons compact, text readable.
5. **YouTube, wide Timeline, dark theme** — YouTube notice chip visible, waveform area shows placeholder, no errors in console.
6. **Audio file, recording in progress, dark theme** — TrackHeader pulse dot visible, REC button shows "Stop", waveform shows red recording overlay, after stop a new take label appears.

If any combination fails, file a fix as a follow-up commit before merging.

- [ ] **Step 4: Performance spot-check**

With dev tools enabled, watch `PerfOverlay`. During 30 seconds of idle playback at zoom=1:
- `WaveformVisualizer` re-render count should be similar to pre-revamp (baseline ≈ 74 over 2:14, so ≈ 16 over 30s at idle is acceptable; significant deviation > 50% is a regression).
- FPS should remain ≈ 60.

If a regression appears, profile and fix — usually a missing `useShallow` or an effect with too-broad deps.

- [ ] **Step 5: Final commit + summary**

If anything was tweaked during verification, commit with:

```bash
git add -A
git commit -m "fix(player): post-verification adjustments"
```

Then push and (optionally, when user says) open a PR.

---

## Out of Scope (do not do in this plan)

- Persistent `currentTakeId` in `shadowingStore` (renderer is wired to read it if it exists; persistence is a separate task).
- Multi-track architecture (separate bookmarks lane, separate Shadowing canvas).
- Mobile-specific revamp.
- Reorganizing `useShadowingStore` API.
- Rewriting `TranscriptPanel`'s 2000-line body.
- Adding React Testing Library / Vitest.
- Any change to Electron main process, preload, IPC.

---

## Rollback

Each task is its own commit on top of `feature/perf-super-optimization`. If a single task causes regressions in production:

```bash
git revert <commit-sha>
```

If multiple tasks fail, revert in reverse order (Task 11 first, then 10, etc.) until stable.

---

## Skills Reference

- @superpowers:subagent-driven-development — recommended way to execute this plan task-by-task.
- @superpowers:executing-plans — alternative inline execution.
- @superpowers:verification-before-completion — run before claiming any task done.
- @superpowers:requesting-code-review — run before merge.
