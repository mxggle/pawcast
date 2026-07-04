import { usePlayerStore } from "./playerStore";
import { useBookmarkStore } from "./bookmarkStore";
import { useTranscriptStore } from "./transcriptStore";
import { useHistoryStore } from "./historyStore";
import { useSettingsStore } from "./settingsStore";
import { useLayoutStore } from "./layoutStore";
import { bookmarkRepository } from "../repositories/bookmarkRepository";
import { glossaryRepository } from "../repositories/glossaryRepository";
import { libraryRepository } from "../repositories/libraryRepository";
import { settingsRepository } from "../repositories/settingsRepository";
import { transcriptRepository } from "../repositories/transcriptRepository";
import { transcriptStudyRepository } from "../repositories/transcriptStudyRepository";
import type {
  PersistedBookmark,
  PersistedGlossaryEntry,
  PersistedSegmentStudy,
  PersistedTranscriptSegment,
} from "../types/persistence";

/**
 * Mirrors store state into the canonical PawcastData JSON files (debounced).
 *
 * These files are the visible, backup-friendly copy of user data described in
 * docs/user-data-persistence-plan.md. The runtime source of truth is still the
 * zustand persist keys; nothing reads these files back at boot yet.
 */

const DEBOUNCE_MS = 300;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

const debounced = (key: string, fn: () => void) => {
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(fn, DEBOUNCE_MS));
};

const writeBookmarks = () => {
  const { mediaBookmarks } = useBookmarkStore.getState();
  const bookmarks: PersistedBookmark[] = [];
  for (const mediaId of Object.keys(mediaBookmarks)) {
    const arr = mediaBookmarks[mediaId];
    if (!Array.isArray(arr)) continue;
    for (const b of arr) {
      bookmarks.push({
        id: b.id,
        mediaId,
        name: b.name,
        start: b.start,
        end: b.end,
        createdAt: b.createdAt,
        mediaName: b.mediaName,
        mediaType: b.mediaType,
        youtubeId: b.youtubeId,
        playbackRate: b.playbackRate,
        annotation: b.annotation,
        segmentIds: b.segmentIds,
        wordIds: b.wordIds,
      });
    }
  }
  bookmarkRepository.saveBookmarks(bookmarks).catch(() => {});
};

const writeGlossary = () => {
  const { glossaryEntries } = useTranscriptStore.getState();
  const glossary: PersistedGlossaryEntry[] = (glossaryEntries || []).map((e) => ({
    id: e.id,
    mediaId: e.mediaId,
    mediaName: e.mediaName,
    mediaType: e.mediaType || "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    youtubeId: (e as any).youtubeId,
    segmentId: e.segmentId,
    text: e.text,
    contextText: e.contextText,
    selectionStart: e.selectionStart,
    selectionEnd: e.selectionEnd,
    startTime: e.startTime,
    endTime: e.endTime,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  }));
  glossaryRepository.saveGlossary(glossary).catch(() => {});
};

const writeTranscripts = () => {
  const { mediaTranscripts, mediaTranscriptStudy } = useTranscriptStore.getState();
  for (const mediaId of Object.keys(mediaTranscripts || {})) {
    const segments = mediaTranscripts[mediaId];
    if (Array.isArray(segments) && segments.length > 0) {
      transcriptRepository.saveTranscript(mediaId, segments as PersistedTranscriptSegment[]).catch(() => {});
    }
  }
  for (const mediaId of Object.keys(mediaTranscriptStudy || {})) {
    const study = mediaTranscriptStudy[mediaId];
    if (!study || typeof study !== "object") continue;
    const segmentStudies: PersistedSegmentStudy[] = [];
    for (const segId of Object.keys(study)) {
      const s = study[segId];
      if (s) {
        segmentStudies.push({
          segmentId: segId,
          levelSystem: s.levelSystem || "cefr",
          updatedAt: s.updatedAt || Date.now(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          items: (s.items || []) as any,
        });
      }
    }
    if (segmentStudies.length > 0) {
      transcriptStudyRepository.saveStudy(mediaId, segmentStudies).catch(() => {});
    }
  }
};

const writeLibrary = () => {
  const { mediaHistory, sourceFolders } = useHistoryStore.getState();
  if (Array.isArray(mediaHistory)) {
    const items = mediaHistory.map((h) => ({
      id: h.id,
      type: h.type,
      name: h.name,
      accessedAt: h.accessedAt,
      playbackTime: h.playbackTime || 0,
      folderId: h.folderId || null,
      nativePath: h.nativePath,
      storageId: h.storageId,
      fileData: h.fileData,
      youtubeData: h.youtubeData,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    libraryRepository.saveHistory(items as any).catch(() => {});
  }
  if (Array.isArray(sourceFolders)) {
    libraryRepository.saveSourceFolders(sourceFolders).catch(() => {});
  }
};

const writeAppSettings = () => {
  const ps = usePlayerStore.getState();
  const ts = useTranscriptStore.getState();
  const ss = useSettingsStore.getState();
  settingsRepository.saveAppSettings({
    version: 1,
    volume: ps.volume,
    muted: ps.muted,
    playbackRate: ps.playbackRate,
    showTranscript: ts.showTranscript,
    transcriptLanguage: ts.transcriptLanguage,
    seekStepSeconds: ps.seekStepSeconds,
    seekSmallStepSeconds: ps.seekSmallStepSeconds || 1,
    seekMode: ps.seekMode,
    waveformZoom: ss.waveformZoom ?? 1,
    showWaveform: ss.showWaveform ?? true,
    videoSize: ss.videoSize ?? "md",
  }).catch(() => {});
};

const writeLayoutSettings = () => {
  const { layoutSettings } = useLayoutStore.getState();
  const hs = useHistoryStore.getState();
  settingsRepository.saveLayoutSettings({
    version: 1,
    ...layoutSettings,
    isSidebarOpen: hs.isSidebarOpen,
    sidebarWidth: hs.sidebarWidth,
    activeSidebarTab: hs.activeSidebarTab,
  }).catch(() => {});
};

let started = false;
const subscriptions: Array<() => void> = [];

export const startCanonicalSync = (): (() => void) => {
  if (started) return stopCanonicalSync;
  started = true;

  subscriptions.push(
    useBookmarkStore.subscribe(() => debounced("bookmarks", writeBookmarks)),
    useTranscriptStore.subscribe(() => {
      debounced("glossary", writeGlossary);
      debounced("transcripts", writeTranscripts);
      debounced("appSettings", writeAppSettings);
    }),
    useHistoryStore.subscribe(() => {
      debounced("library", writeLibrary);
      debounced("layoutSettings", writeLayoutSettings);
    }),
    usePlayerStore.subscribe(() => debounced("appSettings", writeAppSettings)),
    useSettingsStore.subscribe(() => debounced("appSettings", writeAppSettings)),
    useLayoutStore.subscribe(() => debounced("layoutSettings", writeLayoutSettings)),
  );

  return stopCanonicalSync;
};

export const stopCanonicalSync = () => {
  subscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
  started = false;
};
