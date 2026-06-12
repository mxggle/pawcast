import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Mic, Square, Play, Trash2, Loader } from "lucide-react";
import { toast } from "react-hot-toast";
import { UniversalAudioRecorder } from "../../utils/audioRecorder";
import { storeMediaFile, retrieveMediaFile } from "../../utils/mediaStorage";
import { useSentencePracticeStore } from "../../stores/sentencePracticeStore";
import { formatTime } from "../../utils/formatTime";
import { recordingRepository } from "../../repositories/recordingRepository";

interface SentenceRecorderProps {
  mediaId: string;
  sentenceIndex: number;
}

type WindowWithWebkitAudioContext = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

export const SentenceRecorder = ({ mediaId, sentenceIndex }: SentenceRecorderProps) => {
  const { t } = useTranslation();
  const { addRecording, deleteRecording, getRecordingsForSentence } = useSentencePracticeStore();
  const recordings = getRecordingsForSentence(mediaId, sentenceIndex);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [peak, setPeak] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isRequestingMic, setIsRequestingMic] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const recorderRef = useRef<UniversalAudioRecorder | null>(null);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const peaksRef = useRef<number[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Request microphone on first user interaction
  const ensureMicrophone = useCallback(async () => {
    if (stream) return stream;

    setIsRequestingMic(true);
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStream(newStream);
      return newStream;
    } catch (err) {
      const error = err as Error;
      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        toast.error(t("shadowing.errors.permissionDenied"), { duration: 5000 });
      } else if (error.name === "NotFoundError") {
        toast.error(t("shadowing.errors.noMicrophone"));
      } else {
        toast.error(t("shadowing.errors.failedToAccess", { message: error.message }), { duration: 5000 });
      }
      return null;
    } finally {
      setIsRequestingMic(false);
    }
  }, [stream, t]);

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
    };
  }, [stream]);

  const startRecording = async () => {
    const micStream = await ensureMicrophone();
    if (!micStream) return;

    peaksRef.current = [];
    startTimeRef.current = performance.now();
    setRecordingDuration(0);
    setPeak(0);

    durationIntervalRef.current = setInterval(() => {
      setRecordingDuration((performance.now() - startTimeRef.current) / 1000);
    }, 100);

    const recorder = new UniversalAudioRecorder(micStream, {
      onPeakUpdate: (p) => {
        setPeak(p);
        peaksRef.current.push(p);
      },
      onStop: async (blob) => {
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }
        setIsRecording(false);
        setPeak(0);

        if (blob.size === 0) {
          toast.error(t("sentencePractice.recordingEmpty"));
          return;
        }

        try {
          // Fallback duration from the recording wall-clock, used if decoding fails.
          const fallbackDuration = Math.max(0, (performance.now() - startTimeRef.current) / 1000);
          let actualDuration = fallbackDuration;
          try {
            const arrayBuffer = await blob.arrayBuffer();
            const AudioContextClass =
              window.AudioContext || (window as WindowWithWebkitAudioContext).webkitAudioContext;
            const audioContext = new AudioContextClass();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            actualDuration = audioBuffer.duration;
            audioContext.close();
          } catch (decodeError) {
            console.warn(
              "[SentenceRecorder] Failed to decode audio for duration, using fallback:",
              fallbackDuration,
              decodeError
            );
          }

          const extension = blob.type.includes("wav") ? "wav" : "webm";
          const fileName = `sentence-practice-${Date.now()}.${extension}`;
          const file = new File([blob], fileName, { type: blob.type });

          const storageId = await storeMediaFile(file);
          recordingRepository.saveRecordingData(
            `recordings/sentence-practice/files/${storageId}`,
            file,
          ).catch((error) => {
            console.warn("[SentenceRecorder] Failed to mirror recording file:", error);
          });

          addRecording(mediaId, {
            id: Math.random().toString(36).substring(7),
            sentenceIndex,
            storageId,
            duration: actualDuration,
            createdAt: Date.now(),
            peaks: peaksRef.current.length > 0 ? [...peaksRef.current] : undefined,
          });

          toast.success(t("sentencePractice.recordingSaved"));
        } catch (error) {
          console.error("[SentenceRecorder] Failed to save recording:", error);
          toast.error(t("sentencePractice.recordingSaveFailed"));
        }
      },
      onError: (error) => {
        console.error("[SentenceRecorder] Recording error:", error);
        toast.error(t("sentencePractice.recordingError", { message: error.message }));
        setIsRecording(false);
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }
      },
    });

    recorderRef.current = recorder;
    await recorder.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (recorderRef.current) {
      recorderRef.current.stop();
    }
  };

  const playRecording = async (recordingId: string, storageId: string) => {
    if (playingId === recordingId) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      setPlayingId(null);
      return;
    }

    try {
      const file = await retrieveMediaFile(storageId);
      if (!file) {
        toast.error(t("sentencePractice.recordingNotFound"));
        return;
      }

      const url = URL.createObjectURL(file);
      const audio = new Audio(url);
      audioPlayerRef.current = audio;

      audio.onended = () => {
        setPlayingId(null);
        URL.revokeObjectURL(url);
      };

      audio.onerror = () => {
        setPlayingId(null);
        URL.revokeObjectURL(url);
        toast.error(t("sentencePractice.recordingPlayError"));
      };

      await audio.play();
      setPlayingId(recordingId);
    } catch (error) {
      console.error("[SentenceRecorder] Failed to play recording:", error);
      toast.error(t("sentencePractice.recordingPlayError"));
    }
  };

  const handleDelete = async (recordingId: string) => {
    await deleteRecording(mediaId, recordingId);
    if (playingId === recordingId) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      setPlayingId(null);
    }
    toast.success(t("sentencePractice.recordingDeleted"));
  };

  return (
    <div className="space-y-3">
      {/* Record button */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isRequestingMic}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95 ${
            isRecording
              ? "bg-error-600 hover:bg-error-700 text-white shadow-lg animate-pulse"
              : "bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-200"
          }`}
        >
          {isRequestingMic ? (
            <Loader size={16} className="animate-spin" />
          ) : isRecording ? (
            <Square size={16} fill="currentColor" />
          ) : (
            <Mic size={16} />
          )}
          {isRecording
            ? t("sentencePractice.stopRecording")
            : t("sentencePractice.record")}
        </button>

        {isRecording && (
          <div className="flex items-center gap-2">
            <div
              className="w-1.5 h-6 rounded-full bg-error-500 transition-all"
              style={{ transform: `scaleY(${Math.max(0.1, peak)})` }}
            />
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400 w-12 text-right">
              {formatTime(recordingDuration)}
            </span>
          </div>
        )}
      </div>

      {/* Recording list */}
      {recordings.length > 0 && (
        <div className="max-w-md mx-auto space-y-2">
          <div className="text-xs text-gray-400 dark:text-gray-500 text-center">
            {t("sentencePractice.recordingCount", { count: recordings.length })}
          </div>
          {recordings.map((rec) => (
            <div
              key={rec.id}
              className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-white/5"
            >
              <button
                onClick={() => playRecording(rec.id, rec.storageId)}
                className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                {playingId === rec.id ? (
                  <Square size={14} fill="currentColor" className="text-error-500" />
                ) : (
                  <Play size={14} fill="currentColor" />
                )}
                <span className="font-mono text-xs text-gray-400 dark:text-gray-500">
                  {formatTime(rec.duration)}
                </span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  {new Date(rec.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </button>
              <button
                onClick={() => handleDelete(rec.id)}
                className="p-1.5 rounded-md hover:bg-error-100 text-gray-400 hover:text-error-600 dark:hover:bg-error-900/20 dark:hover:text-error-400 transition-colors"
                title={t("common.remove")}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
