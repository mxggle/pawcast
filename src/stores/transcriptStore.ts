import { create } from "zustand";
import { toast } from "react-hot-toast";
import i18n from "../i18n";
import {
  getStoredTranscriptRecord,
  setStoredTranscript,
  deleteStoredTranscript,
} from "../utils/mediaStorage";
import { useMediaStore } from "./mediaStore";
import { useBookmarkStore } from "./bookmarkStore";
import type { TranscriptSegment, MediaTranscripts, MediaTranscriptStudies } from "../types/transcript";
import type { CreateGlossaryEntryInput, GlossaryEntry, MediaTranscriptStudy } from "../types/transcriptStudy";
import {
  buildSegmentTranscriptStudy,
  buildTranscriptStudy,
  inferTranscriptLevelSystem,
} from "../utils/transcriptStudy";
import { createGlossaryEntry, isDuplicateGlossaryEntry } from "../utils/glossary";

export interface TranscriptState {
  mediaTranscripts: MediaTranscripts;
  mediaTranscriptStudy: MediaTranscriptStudies;
  glossaryEntries: GlossaryEntry[];
  isTranscriptLoading: boolean;
  showTranscript: boolean;
  isTranscribing: boolean;
  transcriptLanguage: string;
}

export interface TranscriptActions {
  startTranscribing: () => void;
  stopTranscribing: () => void;
  toggleTranscribing: () => void;
  addTranscriptSegment: (segment: Omit<TranscriptSegment, "id">) => void;
  addTranscriptSegments: (segments: Array<Omit<TranscriptSegment, "id">>) => void;
  updateTranscriptSegment: (id: string, changes: Partial<TranscriptSegment>) => void;
  clearTranscript: () => void;
  setShowTranscript: (show: boolean) => void;
  toggleShowTranscript: () => void;
  setTranscriptLanguage: (language: string) => void;
  exportTranscript: (format: "txt" | "srt" | "vtt") => string;
  importTranscript: (file: File) => Promise<void>;
  createBookmarkFromTranscript: (segmentId: string) => void;
  loadTranscriptForMedia: (mediaId: string) => Promise<void>;
  addGlossaryEntry: (entry: CreateGlossaryEntryInput) => boolean;
  deleteGlossaryEntry: (id: string) => void;
  playGlossaryEntryContext: (id: string) => boolean;
  getCurrentMediaTranscripts: () => TranscriptSegment[];
}

function getMediaId(): string | null {
  return useMediaStore.getState().getCurrentMediaId();
}

export const useTranscriptStore = create<TranscriptState & TranscriptActions>()((set, get) => ({
  mediaTranscripts: {},
  mediaTranscriptStudy: {},
  glossaryEntries: [],
  isTranscriptLoading: false,
  showTranscript: false,
  isTranscribing: false,
  transcriptLanguage: "en-US",

  async loadTranscriptForMedia(mediaId: string) {
    set({ isTranscriptLoading: true });
    const transcriptRecord = await getStoredTranscriptRecord(mediaId);
    const segments = transcriptRecord?.segments || [];
    const levelSystem = inferTranscriptLevelSystem(get().transcriptLanguage);
    const studyBySegment =
      transcriptRecord?.studyBySegment && Object.keys(transcriptRecord.studyBySegment).length > 0
        ? transcriptRecord.studyBySegment
        : buildTranscriptStudy(segments, levelSystem);

    if (transcriptRecord && Object.keys(transcriptRecord.studyBySegment).length === 0 && segments.length > 0) {
      void setStoredTranscript(mediaId, segments, studyBySegment);
    }

    set((state) => {
      const currentMediaId = getMediaId();
      return {
        mediaTranscripts: { ...state.mediaTranscripts, [mediaId]: segments },
        mediaTranscriptStudy: { ...state.mediaTranscriptStudy, [mediaId]: studyBySegment },
        isTranscriptLoading: currentMediaId === mediaId ? false : state.isTranscriptLoading,
      };
    });
  },

  startTranscribing: () => set({ isTranscribing: true }),
  stopTranscribing: () => set({ isTranscribing: false }),
  toggleTranscribing: () => set((s) => ({ isTranscribing: !s.isTranscribing })),

  addTranscriptSegment(segment) {
    get().addTranscriptSegments([segment]);
  },

  addTranscriptSegments(segments) {
    const mediaId = getMediaId();
    if (!mediaId || segments.length === 0) return;

    let updatedSegments: TranscriptSegment[] | null = null;
    let updatedStudyBySegment: MediaTranscriptStudy | null = null;

    set((state) => {
      const currentSegments = state.mediaTranscripts[mediaId] || [];
      const nextSegments = [...currentSegments];
      const acceptedSegments: TranscriptSegment[] = [];

      segments.forEach((segment) => {
        const newSegment = { ...segment, id: crypto.randomUUID() };
        const isDuplicate = nextSegments.some(
          (s) => Math.abs(s.startTime - newSegment.startTime) < 0.1 && s.text === newSegment.text
        );
        if (!isDuplicate) {
          nextSegments.push(newSegment);
          acceptedSegments.push(newSegment);
        }
      });

      if (acceptedSegments.length === 0) return state;

      updatedSegments = nextSegments.sort((a, b) => a.startTime - b.startTime);
      updatedStudyBySegment = { ...(state.mediaTranscriptStudy[mediaId] || {}) };
      const levelSystem = inferTranscriptLevelSystem(state.transcriptLanguage);

      acceptedSegments.forEach((segment) => {
        updatedStudyBySegment![segment.id] = buildSegmentTranscriptStudy(segment.text, levelSystem);
      });

      return {
        mediaTranscripts: { ...state.mediaTranscripts, [mediaId!]: updatedSegments },
        mediaTranscriptStudy: { ...state.mediaTranscriptStudy, [mediaId!]: updatedStudyBySegment },
      };
    });

    if (updatedSegments && updatedStudyBySegment) {
      void setStoredTranscript(mediaId, updatedSegments, updatedStudyBySegment);
    }
  },

  updateTranscriptSegment(id, changes) {
    const mediaId = getMediaId();
    if (!mediaId) return;

    let updatedSegments: TranscriptSegment[] = [];
    let updatedStudyBySegment: MediaTranscriptStudy = {};

    set((state) => {
      updatedSegments = (state.mediaTranscripts[mediaId] || []).map((s) =>
        s.id === id ? { ...s, ...changes } : s
      );
      updatedStudyBySegment = { ...(state.mediaTranscriptStudy[mediaId] || {}) };
      const updatedSegment = updatedSegments.find((s) => s.id === id);
      if (updatedSegment) {
        updatedStudyBySegment[id] = buildSegmentTranscriptStudy(
          updatedSegment.text,
          inferTranscriptLevelSystem(state.transcriptLanguage)
        );
      }
      return {
        mediaTranscripts: { ...state.mediaTranscripts, [mediaId!]: updatedSegments },
        mediaTranscriptStudy: { ...state.mediaTranscriptStudy, [mediaId!]: updatedStudyBySegment },
      };
    });

    void setStoredTranscript(mediaId, updatedSegments, updatedStudyBySegment);
  },

  clearTranscript() {
    const mediaId = getMediaId();
    if (!mediaId) return;
    set((state) => ({
      mediaTranscripts: { ...state.mediaTranscripts, [mediaId!]: [] },
      mediaTranscriptStudy: { ...state.mediaTranscriptStudy, [mediaId!]: {} },
    }));
    void deleteStoredTranscript(mediaId);
  },

  setShowTranscript: (show) => set({ showTranscript: show }),
  toggleShowTranscript: () => set((s) => ({ showTranscript: !s.showTranscript })),
  setTranscriptLanguage: (language) => set({ transcriptLanguage: language }),

  exportTranscript(format) {
    const mediaId = getMediaId();
    const segments = mediaId ? get().mediaTranscripts[mediaId] || [] : [];
    if (segments.length === 0) {
      toast.error(i18n.t("transcript.noDataToExport"));
      return "";
    }
    function ft(s: number) { const m = Math.floor(s / 60); return `${m}:${(s % 60).toFixed(0).padStart(2, "0")}`; }
    function fs(s: number) {
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), ms = Math.floor((s % 1) * 1000);
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
    }
    function fv(s: number) {
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), ms = Math.floor((s % 1) * 1000);
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
    }
    if (format === "txt") return segments.map((seg) => `[${ft(seg.startTime)} - ${ft(seg.endTime)}] ${seg.text}`).join("\n");
    if (format === "srt") return segments.map((seg, i) => `${i + 1}\n${fs(seg.startTime)} --> ${fs(seg.endTime)}\n${seg.text}\n`).join("\n");
    if (format === "vtt") return "WEBVTT\n" + segments.map((seg, i) => `${i + 1}\n${fv(seg.startTime)} --> ${fv(seg.endTime)}\n${seg.text}\n`).join("\n");
    return "";
  },

  async importTranscript(file) {
    try {
      const mediaId = getMediaId();
      if (!mediaId) { toast.error(i18n.t("player.noMediaLoadedSimple")); return; }
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });
      get().clearTranscript();
      const fileName = file.name.toLowerCase();
      let segs: Omit<TranscriptSegment, "id">[] = [];
      if (fileName.endsWith(".srt")) segs = parseSrt(content);
      else if (fileName.endsWith(".vtt")) segs = parseVtt(content);
      else if (fileName.endsWith(".txt")) segs = parseTxt(content);
      else if (content.includes("WEBVTT")) segs = parseVtt(content);
      else if (content.includes("-->") && /^\d+$/m.test(content.split("\n")[0]?.trim())) segs = parseSrt(content);
      else segs = parseTxt(content);
      segs.forEach((s) => get().addTranscriptSegment(s));
    } catch (error) { console.error("Error importing transcript:", error); toast.error(i18n.t("transcript.importError")); }

    function norm(c: string) { return c.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim(); }
    function toSec(h: string, m: string, s: string, ms: string) { return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000; }
    function parseSrt(content: string): Omit<TranscriptSegment, "id">[] {
      return norm(content).split(/\n{2,}/).filter(b => b.trim()).map(block => {
        const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
        const ti = lines.findIndex(l => l.includes("-->"));
        if (ti === -1) return null;
        const m = lines[ti].match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
        if (!m) return null;
        const text = lines.slice(ti + 1).join(" ").trim();
        if (!text) return null;
        return { text, startTime: toSec(m[1], m[2], m[3], m[4]), endTime: toSec(m[5], m[6], m[7], m[8]), confidence: 1.0, isFinal: true };
      }).filter(Boolean) as Omit<TranscriptSegment, "id">[];
    }
    function parseVtt(content: string): Omit<TranscriptSegment, "id">[] {
      const segs: Omit<TranscriptSegment, "id">[] = [];
      const lines = norm(content).split("\n");
      let i = 0;
      while (i < lines.length && !lines[i].includes("-->")) i++;
      while (i < lines.length) {
        const m = lines[i].match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3}) --> (\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
        if (m) { i++; const t: string[] = []; while (i < lines.length && lines[i].trim() !== "") t.push(lines[i++].trim()); if (t.length) segs.push({ text: t.join(" "), startTime: toSec(m[1], m[2], m[3], m[4]), endTime: toSec(m[5], m[6], m[7], m[8]), confidence: 1.0, isFinal: true }); }
        i++;
      }
      return segs;
    }
    function parseTxt(content: string): Omit<TranscriptSegment, "id">[] {
      return norm(content).split("\n").filter(l => l.trim()).map((line, idx) => {
        const m = line.match(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\s*-\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*(.+)/);
        if (m) {
          const sh = m[3] ? parseInt(m[1]) : 0, sm = m[3] ? parseInt(m[2]) : parseInt(m[1]), ss = m[3] ? parseInt(m[3]) : parseInt(m[2]);
          const eh = m[6] ? parseInt(m[4]) : 0, em = m[6] ? parseInt(m[5]) : parseInt(m[4]), es = m[6] ? parseInt(m[6]) : parseInt(m[5]);
          return { text: m[7].trim(), startTime: sh * 3600 + sm * 60 + ss, endTime: eh * 3600 + em * 60 + es, confidence: 1.0, isFinal: true };
        }
        return { text: line.trim(), startTime: idx * 5, endTime: (idx + 1) * 5, confidence: 1.0, isFinal: true };
      });
    }
  },

  createBookmarkFromTranscript(segmentId) {
    const mediaId = getMediaId();
    if (!mediaId) return;
    const segment = (get().mediaTranscripts[mediaId] || []).find((s) => s.id === segmentId);
    if (!segment) { toast.error(i18n.t("transcript.segmentNotFound")); return; }
    const cleanText = segment.text.trim().replace(/\s+/g, " ").replace(/\n+/g, " ");
    let title = cleanText;
    if (cleanText.length > 40) {
      const truncateAt = cleanText.lastIndexOf(" ", 40);
      title = truncateAt > 20 ? cleanText.substring(0, truncateAt) + "..." : cleanText.substring(0, 37) + "...";
    }
    const ms = useMediaStore.getState();
    useBookmarkStore.getState().addBookmark({
      name: title, start: segment.startTime, end: segment.endTime,
      mediaName: ms.currentFile?.name, mediaType: ms.currentFile?.type,
      youtubeId: ms.currentYouTube?.id, playbackRate: ms.playbackRate,
      annotation: segment.text, wordIds: segment.words?.map((w) => w.id), segmentIds: [segment.id],
    });
  },

  addGlossaryEntry: (input) => {
    if (isDuplicateGlossaryEntry(get().glossaryEntries, input)) { toast.error(i18n.t("glossary.alreadySaved")); return false; }
    set((state) => ({ glossaryEntries: [createGlossaryEntry(input), ...state.glossaryEntries] }));
    return true;
  },
  deleteGlossaryEntry: (id) => set((state) => ({ glossaryEntries: state.glossaryEntries.filter((e) => e.id !== id) })),
  playGlossaryEntryContext: (id) => {
    const entry = get().glossaryEntries.find((c) => c.id === id);
    const currentMediaId = getMediaId();
    if (!entry || !currentMediaId || entry.mediaId !== currentMediaId) return false;
    const startTime = Math.max(0, entry.startTime - 0.15);
    useMediaStore.setState({ currentTime: startTime, loopStart: startTime, loopEnd: entry.endTime, isLooping: true, isPlaying: true, loopCount: 0 });
    useBookmarkStore.setState({ selectedBookmarkId: null });
    return true;
  },
  getCurrentMediaTranscripts: () => {
    const mediaId = getMediaId();
    return mediaId ? get().mediaTranscripts[mediaId] || [] : [];
  },
}));
