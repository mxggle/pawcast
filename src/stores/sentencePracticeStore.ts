import { create } from "zustand";
import { persist } from "zustand/middleware";
import { deleteMediaFile } from "../utils/mediaStorage";
import { recordingRepository } from "../repositories/recordingRepository";

export interface SentenceRecording {
    id: string;
    sentenceIndex: number;
    storageId: string;
    duration: number;
    createdAt: number;
    peaks?: number[];
}

interface SentencePracticeState {
    currentSentenceIndex: number;
    autoAdvance: boolean;
    loopCurrent: boolean;
    recordings: Record<string, SentenceRecording[]>;
    isActive: boolean;
}

interface SentencePracticeActions {
    setCurrentSentenceIndex: (index: number) => void;
    setAutoAdvance: (enabled: boolean) => void;
    setLoopCurrent: (enabled: boolean) => void;
    setIsActive: (active: boolean) => void;
    addRecording: (mediaId: string, recording: SentenceRecording) => void;
    deleteRecording: (mediaId: string, recordingId: string) => Promise<void>;
    getRecordingsForSentence: (mediaId: string, sentenceIndex: number) => SentenceRecording[];
    getAllRecordingsForMedia: (mediaId: string) => SentenceRecording[];
}

export const useSentencePracticeStore = create<SentencePracticeState & SentencePracticeActions>()(
    persist(
        (set, get) => ({
            currentSentenceIndex: 0,
            autoAdvance: false,
            loopCurrent: true,
            recordings: {},
            isActive: false,

            setCurrentSentenceIndex: (index) => set({ currentSentenceIndex: index }),
            setAutoAdvance: (enabled) => set({ autoAdvance: enabled }),
            setLoopCurrent: (enabled) => set({ loopCurrent: enabled }),
            setIsActive: (active) => set({ isActive: active }),

            addRecording: (mediaId, recording) =>
                set((state) => {
                    const existing = state.recordings[mediaId] || [];
                    return {
                        recordings: {
                            ...state.recordings,
                            [mediaId]: [...existing, recording],
                        },
                    };
                }),

            deleteRecording: async (mediaId, recordingId) => {
                const recordings = get().recordings[mediaId] || [];
                const toDelete = recordings.find((r) => r.id === recordingId);
                if (!toDelete) return;

                set((state) => {
                    const existing = state.recordings[mediaId] || [];
                    return {
                        recordings: {
                            ...state.recordings,
                            [mediaId]: existing.filter((r) => r.id !== recordingId),
                        },
                    };
                });

                try {
                    await deleteMediaFile(toDelete.storageId);
                } catch (error) {
                    console.error("[SentencePracticeStore] Failed to delete recording file:", error);
                }
            },

            getRecordingsForSentence: (mediaId, sentenceIndex) => {
                const all = get().recordings[mediaId] || [];
                return all.filter((r) => r.sentenceIndex === sentenceIndex);
            },

            getAllRecordingsForMedia: (mediaId) => {
                return get().recordings[mediaId] || [];
            },
        }),
        {
            name: "sentence-practice-store",
            version: 1,
            partialize: (state) => ({
                autoAdvance: state.autoAdvance,
                loopCurrent: state.loopCurrent,
                recordings: state.recordings,
            }),
        }
    )
);

// ─── Dual-write sync ───
let _sentenceSaveTimer: ReturnType<typeof setTimeout>
useSentencePracticeStore.subscribe((state) => {
  clearTimeout(_sentenceSaveTimer)
  _sentenceSaveTimer = setTimeout(() => {
    if (!window.electronAPI?.dataPut) return
    const allRecordings: Array<{ id: string; mediaId: string; sentenceIndex: number; filePath: string; duration: number; createdAt: number; peaks: number[] }> = []
    if (state.recordings) {
      for (const key of Object.keys(state.recordings)) {
        const recs = state.recordings[key]
        if (Array.isArray(recs)) {
          for (const rec of recs) {
            allRecordings.push({
              id: rec.id,
              mediaId: key,
              sentenceIndex: rec.sentenceIndex,
              filePath: `recordings/sentence-practice/files/${rec.storageId}`,
              duration: rec.duration,
              createdAt: rec.createdAt || Date.now(),
              peaks: rec.peaks || [],
            })
          }
        }
      }
    }
    if (allRecordings.length > 0) {
      recordingRepository.saveSentenceIndex(allRecordings).catch(() => {})
    }
  }, 300)
})
