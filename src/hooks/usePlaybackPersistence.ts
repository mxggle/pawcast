import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePlayerStore } from "../stores/playerStore";
import { useHistoryStore } from "../stores/historyStore";
import { useShallow } from "zustand/react/shallow";

/**
 * Hook to persist playback time to the history item in the store.
 * It debounces the update to avoid frequent store writes/re-renders.
 */
export const usePlaybackPersistence = () => {
  const { currentFile, currentYouTube } = usePlayerStore(
    useShallow((state) => ({
      currentFile: state.currentFile,
      currentYouTube: state.currentYouTube,
    }))
  );
  const { mediaHistory, updateHistoryPlaybackTime } = useHistoryStore(
    useShallow((state) => ({
      mediaHistory: state.mediaHistory,
      updateHistoryPlaybackTime: state.updateHistoryPlaybackTime,
    }))
  );
  const currentTime = usePlayerStore((state) => state.currentTime);
  const lastSavedTime = useRef<number>(currentTime);
  const latestTimeRef = useRef<number>(currentTime);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentHistoryId = useMemo(() => {
    if (currentFile) {
      if (currentFile.storageId) {
        return mediaHistory.find(
          (item) =>
            item.type === "file" && item.storageId === currentFile.storageId
        )?.id ?? null;
      }

      return (
        mediaHistory.find(
          (item) =>
            item.type === "file" &&
            item.fileData?.name === currentFile.name &&
            item.fileData?.size === currentFile.size
        )?.id ?? null
      );
    }

    if (currentYouTube) {
      return (
        mediaHistory.find(
          (item) =>
            item.type === "youtube" &&
            item.youtubeData?.youtubeId === currentYouTube.id
        )?.id ?? null
      );
    }

    return null;
  }, [currentFile, currentYouTube, mediaHistory]);

  useEffect(() => {
    latestTimeRef.current = currentTime;
  }, [currentTime]);

  const persistPlaybackTime = useCallback(
    (historyId: string | null, time: number, thresholdSeconds: number) => {
      if (!historyId) return;
      if (Math.abs(time - lastSavedTime.current) <= thresholdSeconds) return;

      updateHistoryPlaybackTime(historyId, time);
      lastSavedTime.current = time;
    },
    [updateHistoryPlaybackTime]
  );

  // Save on media change or unmount using the last observed time for the prior media.
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      persistPlaybackTime(currentHistoryId, latestTimeRef.current, 1);
    };
  }, [currentHistoryId, persistPlaybackTime]);

  // Periodic save (debounced) for the active media only.
  useEffect(() => {
    if (!currentHistoryId) return;

    if (Math.abs(currentTime - lastSavedTime.current) <= 2) {
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      persistPlaybackTime(currentHistoryId, latestTimeRef.current, 2);
      saveTimeoutRef.current = null;
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [currentHistoryId, currentTime, persistPlaybackTime]);
};
