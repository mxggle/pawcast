# Player Performance Optimization — Phase 5 Cleanup Plan

**Branch:** `feature/perf-super-optimization`

## Overview

Three cleanup tracks from the handoff document, executed in parallel by specialized subagents.

---

## Track A: Electron-Only Switch (electron-specialist agent)

**Goal:** Remove all web platform code; this is an Electron-only app now.

### A1 — Delete web-only files (5 files + directory)
- `src/components/web/MediaHistory.tsx`
- `src/components/web/WebAppLayout.tsx`
- `src/components/web/StorageUsageInfo.tsx`
- `src/components/web/FileUploader.tsx`
- `src/pages/WebHomePage.tsx`
- Delete `vercel.json`
- Delete now-empty `src/components/web/` directory

### A2 — Fix `isElectron()` violations (5 files)
- **`src/router/AppRouter.tsx`**: Remove `BrowserRouter` import, always use `HashRouter`
- **`src/pages/HomePage.tsx`**: Remove `WebHomePage` import + conditional, always render `ElectronHomePage`
- **`src/pages/PlayerPage.tsx`**: Remove `MediaHistory` import + conditional rendering block
- **`src/services/aiService.ts`**: Remove web proxy routing for opencode/deepseek; simplify `isElectron()` check to just `window.electronAPI?.fetch`
- **`src/utils/browserCheck.ts`**: Simplify `isMobile` to `false`, `browserName` to `'Electron'`

### A3 — Remove web fallbacks (3 files)
- **`src/stores/electronStorage.ts`**: Remove `localStorage` fallback branches in `getItem`/`setItem`/`removeItem`
- **`src/utils/platform.ts`**: Default platform to `'electron'`, always use `local-media://` protocol
- **`src/components/layout/AppLayout.tsx`**: Remove `WebAppLayout` import + conditional, always render `ElectronAppLayout`

### A4 — Remove web config/analytics (4 files)
- **`src/main.tsx`**: Remove `@vercel/analytics` import + `<Analytics />` + `navigator.storage.persist()`
- **`package.json`**: Remove `"@vercel/analytics"` dependency
- **`vite.config.ts`**: Remove proxy config (`/api/opencode`, `/api/deepseek`)
- **`index.html`**: Update meta description to "desktop audio/video loop player"

### Verification
```sh
npm run build    # Must pass with zero errors
npx tsc --noEmit # Must pass with zero errors
npm run lint     # Must pass
```

---

## Track B: playerStore Split (refactor-specialist agent)

**Goal:** Split the 2142-line `src/stores/playerStore.ts` into focused stores.

### B1 — Extract `settingsStore` (~100 lines, lowest risk first)
- **New file:** `src/stores/settingsStore.ts`
- **State:** `theme`, `waveformZoom`, `showWaveform`, `videoSize`
- **Actions:** `setTheme`, `setWaveformZoom`, `setShowWaveform`, `setVideoSize`
- **Update imports** in `App.tsx`, `SettingsDrawer`, `GeneralSettingsPanel`, `WaveformVisualizer`

### B2 — Extract `bookmarkStore` (~200 lines)
- **New file:** `src/stores/bookmarkStore.ts`
- **State:** `mediaBookmarks`, `selectedBookmarkId`, `autoAdvanceBookmarks`
- **Actions:** `addBookmark`, `updateBookmark`, `deleteBookmark`, `loadBookmark`, `setSelectedBookmarkId`, `importBookmarks`, `getCurrentMediaBookmarks`
- **Dependency:** imports `getCurrentMediaId` from `playerStore`
- **Update imports** in `BookmarkManager`, `BookmarkDrawer`, `WaveformVisualizer`, `TranscriptPanel`, `ABLoopControls`

### B3 — Extract `transcriptStore` (~500 lines)
- **New file:** `src/stores/transcriptStore.ts`
- **State:** `mediaTranscripts`, `mediaTranscriptStudy`, `glossaryEntries`, `isTranscriptLoading`, `showTranscript`, `isTranscribing`, `transcriptLanguage`
- **Actions:** All transcript + glossary actions + `getCurrentMediaTranscripts` + `createBookmarkFromTranscript`
- **Dependencies:** imports `getCurrentMediaId` + `currentFile`/`currentYouTube` from `playerStore`; imports `addBookmark` from `bookmarkStore`
- **Persist:** migrate `onRehydrateStorage` transcript re-sync logic
- **Update imports** in `TranscriptPanel`, `TranscriptSegment`, `TranscriptControls`, `TranscriptUploader`, `TranscriptSelectionPopover`, `GlossaryPage`, `SentencePracticeView`

### B4 — Extract `historyStore` (~470 lines, most coupling, do last)
- **New file:** `src/stores/historyStore.ts`
- **State:** `recentYouTubeVideos`, `mediaHistory`, `historyLimit`, `mediaFolders`, `historySortBy`, `historySortOrder`, `historyFolderFilter`, `sourceFolders`
- **Actions:** All history/folder/source-folder actions
- **Dependencies:** imports media actions from `playerStore`; imports transcript cleanup from `transcriptStore`; imports bookmark cleanup from `bookmarkStore`; imports from `shadowingStore`
- **Persist:** migrate version migration logic (v1→v2→v3)
- **Update imports** in `ElectronHomePage`, `FolderBrowser`, `PlayHistory`, `InitialHistoryDisplay`, `StorageUsageInfo`, `ElectronAppLayout`

### B5 — Clean up `playerStore.ts`
- Remove extracted state + actions + persist config
- Keep only: media core (`currentFile`, `currentYouTube`, `isPlaying`, `currentTime`, `duration`, `volume`, `playbackRate`, `muted`, `isLoadingMedia`), loop (`loopStart`, `loopEnd`, `isLooping`, `loopCount`, `maxLoops`, `bpm`, `quantizeLoop`, `loopDelay`), seek (`seekStepSeconds`, `seekSmallStepSeconds`, `seekMode`)
- Keep `getCurrentMediaId()` — this is the bridge used by other stores
- Keep remaining persist config

### Import update sweep
After B1–B5, grep for old `usePlayerStore` imports and verify all consumers use the correct new store. Run build + typecheck.

### Verification
```sh
npm run build    # Must pass with zero errors
npx tsc --noEmit # Must pass with zero errors
```

---

## Track C: Unit Tests + Lint Fix (test-engineer agent)

### C1 — Fix PlayerWorkspace.tsx lint warning
- Move `usePlayerWorkspace` + `usePlayerSelection` hooks to `src/player/hooks.ts`
- Re-export both from `src/player/hooks.ts`
- Update `PlayerWorkspace.tsx` to import hooks from `hooks.ts` and keep only component export

### C2 — Write tests for `PlaybackClock`
- **File:** `tests/playbackClock.test.ts` (using `node:test` + `node:assert/strict`)
- Mock `requestAnimationFrame` (advance time manually)
- Tests: attach/detach lifecycle, start/stop, subscriber fan-out at 60/10/4fps, throttle verification, idle when not playing, singleton behavior

### C3 — Write tests for `useWordState` / `findActiveWord`
- **File:** `tests/findActiveWord.test.ts`
- Pure function — no mocking needed
- Tests: binary search correctness (first word, last word, middle, between words, empty array, before first word, after last word, single word)

### C4 — Write tests for `WaveformRenderer` coordinate math
- **File:** `tests/waveformRenderer.test.ts`
- Extract `_vp()` viewport calculation as testable pure function
- Tests: viewport scaling, playhead position to x-coordinate, time to sample index

### C5 — Write tests for `MediaController`
- **File:** `tests/mediaController.test.ts`
- Pass a stub `HTMLMediaElement`
- Tests: play/pause delegation, seek, volume, playbackRate, currentTime getter

### Verification
```sh
node --import tsx --test tests/playbackClock.test.ts
node --import tsx --test tests/findActiveWord.test.ts
node --import tsx --test tests/waveformRenderer.test.ts
node --import tsx --test tests/mediaController.test.ts
```

---

## Execution Order

Tracks A, B, and C are independent and can run in parallel. Within Track B, order is B1→B2→B3→B4→B5 (each builds on the previous).

## Final Verification

After all tracks complete:
```sh
npm run build    # Must pass
npx tsc --noEmit # Must pass
npm run lint     # Must pass
node --import tsx --test tests/*.test.ts
```
