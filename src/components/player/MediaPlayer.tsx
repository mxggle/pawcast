import { useRef, useEffect, useCallback } from "react";
import { usePlayerStore } from "../../stores/playerStore";
import { setCurrentTime as setCurrentTimeExternal } from "../../stores/currentTimeStore";
import { MediaController } from "../../player/MediaController";
import { playbackClock } from "../../player/PlaybackClock";
import { toast } from "react-hot-toast";
import { useShallow } from "zustand/react/shallow";
import { bumpRender } from "../../utils/perfMonitor";
import { usePlayerSelection } from "../../player/hooks";

interface MediaPlayerProps {
  hiddenMode?: boolean;
}

export const MediaPlayer = ({ hiddenMode = false }: MediaPlayerProps) => {
  bumpRender("MediaPlayer");
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controllerRef = useRef<MediaController | null>(null);
  const isDelayingRef = useRef(false);
  const pendingPlayRef = useRef(false);
  const lastZustandWriteRef = useRef(0);
  const resolvingInfiniteDurationRef = useRef(false);
  const loopResumeTimeoutRef = useRef<number | null>(null);

  const {
    currentFile,
    isPlaying,
    currentTime,
    volume: masterVolume,
    mediaVolume,
    muted: masterMuted,
    playbackRate,
    loopStart,
    loopEnd,
    isLooping,
    setCurrentTime,
    setDuration,
    setIsPlaying,
    setIsTransitioning,
  } = usePlayerStore(
    useShallow((state) => ({
      currentFile: state.currentFile,
      isPlaying: state.isPlaying,
      currentTime: state.currentTime,
      volume: state.volume,
      mediaVolume: state.mediaVolume,
      muted: state.muted,
      playbackRate: state.playbackRate,
      loopStart: state.loopStart,
      loopEnd: state.loopEnd,
      isLooping: state.isLooping,
      setCurrentTime: state.setCurrentTime,
      setDuration: state.setDuration,
      setIsPlaying: state.setIsPlaying,
      setIsTransitioning: state.setIsTransitioning,
    }))
  );

  const { setSelection } = usePlayerSelection();

  // Clear shared transcript↔timeline selection when playback starts
  const prevPlayingRef = useRef(false);
  useEffect(() => {
    if (isPlaying && !prevPlayingRef.current) {
      setSelection(null);
    }
    prevPlayingRef.current = isPlaying;
  }, [isPlaying, setSelection]);

  const getMediaElement = useCallback((): HTMLMediaElement | null => {
    if (!currentFile) return null;
    return currentFile.type.includes("video") ? videoRef.current : audioRef.current;
  }, [currentFile]);

  const safePlay = useCallback(
    async (mediaElement: HTMLMediaElement) => {
      if (mediaElement.readyState >= 2) {
        try {
          setIsTransitioning(true);
          await mediaElement.play();
        } catch (err) {
          console.error("Error playing media:", err);
          toast.error("Error playing media. The file may be corrupted or not supported.");
          setIsPlaying(false);
        } finally {
          setIsTransitioning(false);
        }
      } else {
        pendingPlayRef.current = true;
      }
    },
    [setIsPlaying, setIsTransitioning]
  );

  // Sync currentTime to external store + Zustand (throttled)
  const syncCurrentTime = useCallback(
    (time: number, forceStoreWrite = false) => {
      setCurrentTimeExternal(time);

      const storeDrift = Math.abs(usePlayerStore.getState().currentTime - time);
      if (forceStoreWrite && storeDrift >= 0.001) {
        lastZustandWriteRef.current = performance.now();
        setCurrentTime(time);
        return;
      }

      if (storeDrift < 0.001) return;

      const now = performance.now();
      if (now - lastZustandWriteRef.current < 250) return;
      lastZustandWriteRef.current = now;
      setCurrentTime(time);
    },
    [setCurrentTime]
  );

  // Reset state when media source changes
  useEffect(() => {
    pendingPlayRef.current = false;
    resolvingInfiniteDurationRef.current = false;
    if (loopResumeTimeoutRef.current !== null) {
      window.clearTimeout(loopResumeTimeoutRef.current);
      loopResumeTimeoutRef.current = null;
    }
    isDelayingRef.current = false;
    setSelection(null);
  }, [currentFile?.url, setSelection]);

  // Clear delay state when playback stops or looping stops
  useEffect(() => {
    if (!isPlaying || !isLooping) {
      if (loopResumeTimeoutRef.current !== null) {
        window.clearTimeout(loopResumeTimeoutRef.current);
        loopResumeTimeoutRef.current = null;
      }
      isDelayingRef.current = false;
    }
  }, [isPlaying, isLooping]);

  // Handle canplay for pending play
  useEffect(() => {
    const mediaElement = getMediaElement();
    if (!mediaElement) return;

    const handleCanPlay = () => {
      if (pendingPlayRef.current) {
        pendingPlayRef.current = false;
        setIsTransitioning(true);
        mediaElement.play().catch((err) => {
          console.error("Error playing media after canplay:", err);
          setIsPlaying(false);
        }).finally(() => {
          setIsTransitioning(false);
        });
      }
    };

    mediaElement.addEventListener("canplay", handleCanPlay);
    if (mediaElement.readyState >= 2) handleCanPlay();
    return () => mediaElement.removeEventListener("canplay", handleCanPlay);
  }, [currentFile, setIsPlaying, setIsTransitioning, getMediaElement]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      playbackClock.stop();
      const { isPlaying: stillPlaying, currentFile: fileAtUnmount } = usePlayerStore.getState();
      if (stillPlaying && !fileAtUnmount) {
        usePlayerStore.getState().setIsPlaying(false);
      }
    };
  }, []);

  // Play/pause via MediaController
  useEffect(() => {
    const mediaElement = getMediaElement();
    if (!mediaElement) return;

    // Swap controller when media element changes
    if (!controllerRef.current || controllerRef.current.getElement() !== mediaElement) {
      controllerRef.current = new MediaController(mediaElement);
    }

    if (isPlaying) {
      if (isDelayingRef.current) return;
      if (mediaElement.paused) {
        safePlay(mediaElement);
      }
    } else {
      pendingPlayRef.current = false;
      if (!mediaElement.paused) {
        setIsTransitioning(true);
        mediaElement.pause();
        setIsTransitioning(false);
      }
    }
  }, [isPlaying, currentFile, setIsPlaying, safePlay, setIsTransitioning, getMediaElement]);

  // Sync play/pause events from media element → store
  useEffect(() => {
    const mediaElement = getMediaElement();
    if (!mediaElement) return;

    const handlePlay = () => {
      if (usePlayerStore.getState().isTransitioning) return;
      if (!usePlayerStore.getState().isPlaying) setIsPlaying(true);
    };
    const handlePause = () => {
      if (usePlayerStore.getState().isTransitioning) return;
      if (isDelayingRef.current || mediaElement.ended) return;
      if (usePlayerStore.getState().isPlaying) setIsPlaying(false);
    };

    mediaElement.addEventListener("play", handlePlay);
    mediaElement.addEventListener("pause", handlePause);
    return () => {
      mediaElement.removeEventListener("play", handlePlay);
      mediaElement.removeEventListener("pause", handlePause);
    };
  }, [currentFile, setIsPlaying, getMediaElement]);

  // Volume
  useEffect(() => {
    const mediaElement = getMediaElement();
    if (!mediaElement) return;
    mediaElement.volume = masterMuted ? 0 : masterVolume * mediaVolume;
  }, [masterVolume, mediaVolume, masterMuted, currentFile, getMediaElement]);

  // Playback rate
  useEffect(() => {
    const mediaElement = getMediaElement();
    if (!mediaElement) return;
    mediaElement.playbackRate = playbackRate;
  }, [playbackRate, currentFile, getMediaElement]);

  // Handle user seeking (body class observer)
  useEffect(() => {
    const mediaElement = getMediaElement();
    if (!mediaElement) return;

    const handleUserSeeking = () => {
      if (!document.body.classList.contains("user-seeking")) return;
      isDelayingRef.current = false;
      // Read the live store value (not the captured closure) so a deliberate
      // seek lands on the just-clicked time, not the previously-rendered one.
      const storeTime = usePlayerStore.getState().currentTime;
      // Apply precisely: this only runs for user-initiated seeks, so even a
      // short (<0.5s) seek must take effect rather than being swallowed.
      if (Math.abs(mediaElement.currentTime - storeTime) > 0.02) {
        mediaElement.currentTime = storeTime;
      }
      syncCurrentTime(storeTime);
      if (isPlaying && mediaElement.paused) {
        mediaElement.play().catch((err) => console.error("Error playing after seek:", err));
      }
    };

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === "class") handleUserSeeking();
      }
    });
    observer.observe(document.body, { attributes: true });
    handleUserSeeking();
    return () => observer.disconnect();
  }, [currentFile, currentTime, isPlaying, syncCurrentTime, getMediaElement]);

  // A-B loop logic + time tracking
  useEffect(() => {
    const mediaElement = getMediaElement();
    if (!mediaElement) return;

    const handleTimeUpdate = () => {
      const currentTimeValue = mediaElement.currentTime;
      syncCurrentTime(currentTimeValue);

      if (!isLooping || loopStart === null || loopEnd === null) return;

      if (currentTimeValue >= loopEnd + 0.005) {
        if (isDelayingRef.current) return;

        const state = usePlayerStore.getState();
        const {
          autoAdvanceBookmarks, selectedBookmarkId, getCurrentMediaBookmarks, loadBookmark,
          maxLoops, loopCount, setLoopCount, setIsLooping: storeSetIsLooping, loopDelay
        } = state;

        const nextCount = (loopCount || 0) + 1;
        setLoopCount(nextCount);

        if (maxLoops > 0 && nextCount >= maxLoops) {
          if (autoAdvanceBookmarks && selectedBookmarkId) {
            const list = (getCurrentMediaBookmarks?.() || []).slice().sort((a, b) => a.start - b.start);
            const idx = list.findIndex((b) => b.id === selectedBookmarkId);
            if (list.length > 0) {
              const next = list[(idx + 1 + list.length) % list.length];
              if (next) {
                loadBookmark?.(next.id);
                mediaElement.currentTime = next.start;
                return;
              }
            }
          }
          storeSetIsLooping(false);
          return;
        }

        if (loopDelay > 0) {
          isDelayingRef.current = true;
          mediaElement.pause();
          if (loopResumeTimeoutRef.current !== null) {
            window.clearTimeout(loopResumeTimeoutRef.current);
          }
          loopResumeTimeoutRef.current = window.setTimeout(() => {
            loopResumeTimeoutRef.current = null;
            const cs = usePlayerStore.getState();
            if (cs.isPlaying && cs.isLooping && cs.loopStart !== null && currentFile?.url === cs.currentFile?.url) {
              mediaElement.currentTime = cs.loopStart!;
              mediaElement.play().catch(e => console.error("Play after gap failed", e));
            }
            isDelayingRef.current = false;
          }, loopDelay * 1000);
          return;
        }

        mediaElement.currentTime = loopStart;
      } else if (currentTimeValue < loopStart - 0.02 && currentTimeValue > 0) {
        if (!isDelayingRef.current && !document.body.classList.contains("user-seeking")) {
          mediaElement.currentTime = loopStart;
        }
      }
    };

    mediaElement.addEventListener("timeupdate", handleTimeUpdate);
    return () => mediaElement.removeEventListener("timeupdate", handleTimeUpdate);
  }, [currentFile, isLooping, loopStart, loopEnd, syncCurrentTime, getMediaElement]);

  // PlaybackClock: start/stop based on isPlaying
  useEffect(() => {
    const mediaElement = getMediaElement();
    if (!mediaElement) return;

    if (isPlaying) {
      playbackClock.attach({ getCurrentTime: () => mediaElement.currentTime });
      playbackClock.start();
    } else {
      playbackClock.stop();
      syncCurrentTime(mediaElement.currentTime);
    }

    return () => {
      playbackClock.stop();
    };
  }, [currentFile, isPlaying, syncCurrentTime, getMediaElement]);

  // Handle seeking event
  useEffect(() => {
    const mediaElement = getMediaElement();
    if (!mediaElement) return;

    const handleSeeking = () => {
      if (isLooping && loopStart !== null && loopEnd !== null) {
        const ct = mediaElement.currentTime;
        if (ct < loopStart) mediaElement.currentTime = loopStart;
        else if (ct > loopEnd) mediaElement.currentTime = loopStart;
      }
      syncCurrentTime(mediaElement.currentTime);
    };

    mediaElement.addEventListener("seeking", handleSeeking);
    return () => mediaElement.removeEventListener("seeking", handleSeeking);
  }, [currentFile, isLooping, loopStart, loopEnd, syncCurrentTime, getMediaElement]);

  // Handle store-driven seeking (rewind/fast-forward buttons)
  useEffect(() => {
    const mediaElement = getMediaElement();
    if (!mediaElement) return;
    if (mediaElement.seeking) return;
    // During a deliberate seek (body has "user-seeking") apply precisely so
    // short clicks land; otherwise keep a wide dead-zone to avoid fighting the
    // ~4Hz throttled currentTime drift during normal playback.
    const userSeeking = document.body.classList.contains("user-seeking");
    const threshold = userSeeking ? 0.02 : 0.5;
    if (Math.abs(mediaElement.currentTime - currentTime) > threshold) {
      mediaElement.currentTime = currentTime;
    }
  }, [currentFile, currentTime, getMediaElement]);

  // Duration handling
  const commitDuration = useCallback(
    (mediaElement: HTMLMediaElement) => {
      const d = mediaElement.duration;
      if (Number.isFinite(d) && d >= 0) {
        resolvingInfiniteDurationRef.current = false;
        setDuration(d);
        return true;
      }
      setDuration(0);
      return false;
    },
    [setDuration]
  );

  const resolveInfiniteDuration = useCallback(
    (mediaElement: HTMLMediaElement) => {
      if (resolvingInfiniteDurationRef.current || Number.isFinite(mediaElement.duration) || mediaElement.readyState === 0) return;
      resolvingInfiniteDurationRef.current = true;
      const originalTime = mediaElement.currentTime;
      const finalize = () => {
        mediaElement.currentTime = originalTime;
        commitDuration(mediaElement);
      };
      mediaElement.addEventListener("timeupdate", finalize, { once: true });
      try { mediaElement.currentTime = Number.MAX_SAFE_INTEGER; }
      catch (err) { resolvingInfiniteDurationRef.current = false; }
    },
    [commitDuration]
  );

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLMediaElement>) => {
    if (!commitDuration(e.currentTarget)) resolveInfiniteDuration(e.currentTarget);
  };
  const handleDurationChange = (e: React.SyntheticEvent<HTMLMediaElement>) => commitDuration(e.currentTarget);

  const handleEnded = () => {
    const state = usePlayerStore.getState();
    if (state.isLooping) {
      const mediaElement = getMediaElement();
      if (mediaElement) {
        const restartTime = state.loopStart ?? 0;
        mediaElement.currentTime = restartTime;
        setCurrentTime(restartTime);
        mediaElement.play().catch((err: Error) => console.error("Error restarting looped playback:", err));
        return;
      }
    }
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleError = (e: React.SyntheticEvent<HTMLMediaElement>) => {
    console.error("Media loading error:", e.currentTarget.error);
    toast.error("Failed to load media. The file may be corrupted or not supported.");
  };

  if (!currentFile) return null;

  if (hiddenMode) {
    return (
      <div className="sr-only" aria-hidden="true">
        {currentFile.type.includes("video") ? (
          <video ref={videoRef} src={currentFile.url} onLoadedMetadata={handleLoadedMetadata} onDurationChange={handleDurationChange} onEnded={handleEnded} onError={handleError} preload="metadata" />
        ) : (
          <audio ref={audioRef} src={currentFile.url} onLoadedMetadata={handleLoadedMetadata} onDurationChange={handleDurationChange} onEnded={handleEnded} onError={handleError} />
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      {currentFile.type.includes("video") ? (
        <video ref={videoRef} src={currentFile.url} className="w-full h-full object-contain" onLoadedMetadata={handleLoadedMetadata} onDurationChange={handleDurationChange} onEnded={handleEnded} onError={handleError} preload="metadata" />
      ) : (
        <audio ref={audioRef} src={currentFile.url} onLoadedMetadata={handleLoadedMetadata} onDurationChange={handleDurationChange} onEnded={handleEnded} onError={handleError} />
      )}
    </div>
  );
};
