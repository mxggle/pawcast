import { useSyncExternalStore } from "react";
import {
  getCurrentTime,
  subscribeCurrentTime,
} from "../stores/currentTimeStore";
import type { TranscriptWord } from "../types/transcriptWord";
import { findActiveWord } from "../player/findActiveWord";

const THROTTLE_MS = 100;

export function useWordState(words: TranscriptWord[]): string | null {
  return useSyncExternalStore(
    (onStoreChange) => {
      let lastEmit = 0;
      const throttledListener = () => {
        const now = performance.now();
        if (now - lastEmit >= THROTTLE_MS) {
          lastEmit = now;
          onStoreChange();
        }
      };
      const unsubscribe = subscribeCurrentTime(throttledListener);
      return unsubscribe;
    },
    () => findActiveWord(words, getCurrentTime()),
    () => findActiveWord(words, getCurrentTime())
  );
}
