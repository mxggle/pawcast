# Application Revamp Plan

**Date:** 2026-07-05
**Baseline branch:** `feat/tarui` (post-Tauri-migration, clean tree)
**Status:** Phases 1–4 implemented on `revamp/phase-1-cleanup` (2026-07-05)

## Implementation status

- **Phase 1 — done.** Dead code removed (controls/, layout leftovers, and the
  unrendered BookmarkDrawer/BookmarkManager found later), desktop-only docs,
  Pawcast identity. `WebAppLayout` kept as the browser dev-fallback shell.
- **Phase 2 — done.** playerStore is the real playback store; historyStore,
  bookmarkStore, transcriptStore own their domains with per-domain persist
  keys (`pawcast-*`) and one-time seeding from the legacy
  `abloop-player-storage` snapshot (never modified — downgrade-safe).
  Composed actions live in `stores/playerActions.ts`; all canonical
  PawcastData writes consolidated in `stores/canonicalSync.ts`.
- **Phase 3 — done** except the WaveformVisualizer split, deferred because
  the takes UI renders on the canvas overlay (no JSX seam); the Phase 4
  TakesDrawer provides the management surface instead.
- **Phase 4 — core delivered.** progressStore, library-first home with resume
  cards, practice-this-sentence deep link, TakesDrawer (play/AB-compare/
  delete), practiced checkmarks in the transcript, glossary grouped by media.
  Settings were already unified via SettingsWorkspace. Not done: flip-card
  glossary review, first-run onboarding walkthrough, broad visual polish pass.
- **Phase 5 — partially done.** Tests added for segmentation helpers and the
  legacy-seed migration. Outstanding (flagged as follow-up tasks): bundle
  splitting per docs/performance-followups.md, and an error boundary around
  the player (pre-existing gap: a YouTubePlayer crash blanks the app).

Manual desktop regression still recommended before release: record a
shadowing take and review it in the takes drawer; practice a sentence and
confirm the transcript checkmark; upgrade from a beta-3 data directory.

## Locked decisions

1. **Desktop-only.** Tauri is the sole deployment target. Web-specific UI is removed;
   the `DesktopAPI` boundary and `AppLayout` facade are kept so the architecture
   stays layered (and a web build could return later without a rewrite).
2. **Keep the free-form panel workspace.** The player keeps its resizable/collapsible
   panels exactly as users know them. The revamp refactors the code behind them and
   polishes visuals — no mode-based layout redesign.
3. **Full learning loop.** Beyond cleanup, the revamp ships the connective features:
   library-first home, transcript → glossary → practice flow, shadowing take review,
   and per-media progress.

Remaining open decision: **the app's single name** (repo says `lingoloop`, package and
`tauri.conf.json` say `pawcast`). Phase 1 applies whichever name is chosen.

---

## Phase 1 — Deadwood, platform cleanup, identity

*Goal: shrink the codebase and make the docs stop lying, before touching behavior.*
*Risk: minimal. One PR.*

### 1.1 Delete dead code (verified unreferenced)
- `src/components/controls/` — all six components (`PlayerControls`, `PlaybackControls`,
  `MobileControls`, `CombinedControls`, `ABLoopControls`, `LoopControls`), ~2,150 lines.
  The live playback UI is `TimelineToolbar`/`TimelinePanel`.
- `src/components/layout/TriplePaneLayout.tsx`
- `src/components/layout/SettingsDrawer.tsx`
- `src/components/test/I18nTest.tsx` (and `src/components/test/` directory)
- `src/components/dev/PerfOverlay.tsx` (`utils/perfMonitor.ts` stays — `bumpRender` is used)
- Re-verify each with `rg` immediately before deletion.

### 1.2 Desktop-only simplification
- Reduce `src/components/web/WebAppLayout.tsx` to a minimal unstyled dev shell used only
  when running `vite dev` in a plain browser (developer convenience), or delete it and make
  `AppLayout` render `DesktopAppLayout` unconditionally — decide during implementation based
  on whether browser-based dev is still part of the workflow.
- Keep `src/platform/runtime.ts` and the `desktopApi` null-guard pattern (they are the
  layering boundary, not web support).
- Simplify `src/utils/browserCheck.ts` and `src/utils/platform.ts` web branches.
- Remove `dev:web`/`build:web` scripts from `package.json` if browser dev is dropped.

### 1.3 Docs and identity
- Move `docs/claude-handoff.md`, `docs/player-cleanup-plan.md`, `docs/cmd-handoff.md`
  to `docs/archive/`.
- Rewrite Electron references in `docs/platform-architecture.md` and `README.md` to Tauri;
  update the README architecture diagram (remove the Web UI layer).
- Update `CLAUDE.md`: platform story is desktop-only Tauri.
- Rename `tests/electron-library-sidebar.test.mjs` → `tests/librarySidebarDesktop.test.mjs`
  (and any other `electron-*` test names).
- Apply the chosen app name across `package.json`, `tauri.conf.json`, `index.html`,
  README, and the i18n locale files (en/ja/zh).

### Validation
`npm run build && npm run lint && npm test && npm run check:tauri` — all must pass.

---

## Phase 2 — Finish the state refactor

*Goal: one source of truth per domain. Prerequisite for all Phase 4 features.*
*Risk: medium — persistence and rehydration paths. One to two PRs.*

### 2.1 Extract `historyStore`
- New `src/stores/historyStore.ts`: `recentYouTubeVideos`, `mediaHistory`, `historyLimit`,
  `mediaFolders`, `historySortBy`, `historySortOrder`, `historyFolderFilter`, `sourceFolders`
  plus their actions — per the original (stalled) split plan.
- Update consumers: `DesktopHomePage`, `DesktopAppLayout`/library sidebar, `PlayHistory`,
  `FolderBrowser`.

### 2.2 Remove legacy mirrors from `playerStore`
- `playerStore` still declares `mediaTranscripts`, `mediaTranscriptStudy`, `glossaryEntries`,
  `mediaBookmarks`, etc. and syncs them into `transcriptStore`/`bookmarkStore` via
  `setState` shims. Replace with a **one-time persistence migration**: on first run,
  rehydrate legacy persisted data into the new stores, then never read the old keys again.
- Audit `src/stores/persistedStoreSync.ts` and `src/utils/migrationBridge.ts`; delete the
  bridging that exists only to keep the mirrors alive.
- End state: `playerStore` owns media identity + playback + loop state only (~300 lines).

### Validation
- All existing store tests pass; add a migration test: seed legacy-format persisted state,
  boot, assert data lands in the new stores.
- Manual smoke on desktop: existing user data (history, transcripts, bookmarks, takes)
  survives an upgrade. **This is the critical regression risk of the whole revamp.**

---

## Phase 3 — Decompose the god components

*Goal: make Phase 4 changes cheap and reviewable. Behavior-preserving.*
*Risk: medium. Two to three PRs, one component each.*

### 3.1 `TranscriptPanel.tsx` (2,014 lines → ~400)
Extract, without behavior change:
- `src/hooks/useTranscriptionRunner.ts` — chunked transcription orchestration, progress,
  loop-range transcription.
- `src/utils/segmentation.ts` — the pure sentence-breaking / `assignWordsToSegments`
  heuristics. **Add unit tests here** (currently untested pure logic).
- `src/hooks/useBookmarkIO.ts` — bookmark import/export handlers.
- Keep rendering, selection, and scroll-sync in the component.

### 3.2 `WaveformVisualizer.tsx` (1,188 lines)
- Split the shadowing-takes UI and loop-editing interaction handlers out of the canvas
  host component. The canvas/`WaveformRenderer` wiring stays put.

### 3.3 `PlayerPage.tsx` panel choreography
- Move the collapse/restore/saved-sizes orchestration (~200 lines of effects and refs)
  into `src/hooks/usePanelLayout.ts`. **The UX does not change** — same panels, same
  collapse strips, same persistence. `tests/playerLayoutResponsive.test.mjs` and
  `tests/layoutStore.test.ts` guard behavior.

### Validation
Build/lint/test green after each PR; manual pass over collapse/expand/resize of every
panel combination on desktop.

---

## Phase 4 — UX revamp and the learning loop

*Goal: the product-side payoff. Ordered by user impact; each item is its own PR.*
*All new strings go into `en.json`, `ja.json`, `zh.json`.*

### 4.1 Library-first home
- Replace the launcher-style home with a library: source-folder tree + rich resume cards
  for recent media (thumbnail/type icon, progress %, last position, transcript/bookmark/
  take counts, "continue" action). Data already exists in `historyStore` + per-media stores.
- Keep the current open-file / YouTube / add-folder actions as a compact header row.

### 4.2 Per-media progress store
- New `src/stores/progressStore.ts` (persisted via the Tauri storage layer): per media —
  listened ranges, sentences practiced, takes recorded, glossary items created, last studied.
- Written from existing events (playback ticks, practice completion, take save, glossary add).
- Surfaced on library cards (4.1) and a small summary in the player header.

### 4.3 Connect the learning loop
- Transcript selection popover gains **"Practice this sentence"** → deep-links into
  Sentence Practice with that segment preloaded (`sentencePracticeStore` seeded from the
  selection; route param carries media + segment id).
- Glossary entries link back to their source segment ("jump to context" → opens player at
  that timestamp).
- Explanation drawer gains one-click "save to glossary" for the selected term (if not
  already present).

### 4.4 Shadowing take review
- New takes drawer in the player (pattern-match `BookmarkDrawer`): list takes grouped by
  sentence, per-take play, A/B compare (original ↔ take with one toggle), delete, keep-best.
- The phonograph interaction model (seek disarms shadowing) is untouched.
- Waveform overlay rendering of takes stays; the drawer is the management surface.

### 4.5 Sentence Practice upgrade
- Practice queue: practice all sentences of a transcript in sequence, with skip/redo.
- Completion writes to `progressStore`; practiced sentences get a subtle check in the
  transcript panel.

### 4.6 Glossary upgrade
- Group by media / date; search; simple review mode (flip-card cycle through entries).
  No full SRS scheduling in this revamp — keep it lightweight.

### 4.7 Settings unification + empty states
- One `SettingsWorkspace` rendered by both `/settings` and the desktop settings window;
  remove the `/ai-settings` redirect and any drawer remnants.
- Real empty states: transcript panel without a transcript sells the Transcribe action;
  empty glossary/practice pages explain how entries get created; first-run home shows a
  short "open media → loop → transcribe → shadow" pointer.

### 4.8 Visual polish pass (free-form panels kept)
- Consistent panel headers/toolbars (spacing, icon sizes, collapse affordances), dark-mode
  audit, motion consistency (framer-motion durations/easings), typography scale.
- No structural layout changes.

### Validation
Per-PR: build/lint/test + targeted manual flows. i18n completeness check across the three
locales for every new key.

---

## Phase 5 — Performance, tests, release

- Bundle follow-ups from `docs/performance-followups.md`: fix the `mediaStorage` /
  `shadowingStore` static+dynamic import conflicts; inspect the vendor chunk; audit the
  ~700 kB Radix/theme CSS chunk and narrow imports.
- Test debt: unit tests for `segmentation.ts`, `useTranscriptionRunner` (mocked service),
  `historyStore`, `progressStore`, and the Phase 2 migration.
- Release checklist: version bump, `CHANGELOG.md`, `npm run build:tauri` on a clean
  machine, sidecar verification (`npm run verify:sidecars`), upgrade test from the last
  beta's data directory.

---

## Sequencing and rules

- **Order is load-bearing:** Phase 2 before Phase 4 (new features must not write to the
  legacy mirrors); Phase 3.1 before 4.3 (the selection popover work lands in a small
  component, not the 2,000-line one).
- One PR per numbered item; each lands with the full validation suite green.
- Anything touching audio, recording, transcript, or persistence gets a manual regression
  pass — these are the app's sensitive areas (per `CLAUDE.md`).
- Rollback unit is the PR; no PR mixes cleanup with behavior change.
