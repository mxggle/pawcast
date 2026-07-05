import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-hot-toast";
import { usePlayerStore } from "../stores/playerStore";
import { useTranscriptStore } from "../stores/transcriptStore";
import { transcriptionService } from "../services/transcriptionService";
import type { TranscriptionProvider } from "../types/aiService";
import { encodeWAV } from "../utils/wavEncoder";
import { breakIntoSentences as utilBreakIntoSentences } from "../utils/sentenceBreaker";
import {
  assignWordsToSegments,
  normalizeRange,
  type TimeRange,
} from "../utils/transcriptSegments";

const LARGE_TRANSCRIPTION_FILE_SIZE = 25 * 1024 * 1024;
const PROGRESSIVE_TRANSCRIPTION_THRESHOLD_SECONDS = 8 * 60;

export interface TranscriptionRunnerOptions {
  /** Range to use when the caller doesn't pass one (e.g. the active A-B loop). */
  getFallbackRange?: () => TimeRange | undefined;
}

/**
 * Owns the transcription workflow: provider/API-key settings, audio
 * extraction, chunked vs. single-shot transcription, progress, and
 * cancellation. UI state only — transcript data lands in transcriptStore.
 */
export const useTranscriptionRunner = ({ getFallbackRange }: TranscriptionRunnerOptions = {}) => {
  const { t } = useTranslation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [transcriptionStatus, setTranscriptionStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [apiKey, setApiKey] = useState<string>("");
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [currentProvider, setCurrentProvider] = useState<TranscriptionProvider>("openai");
  const abortControllerRef = useRef<AbortController | null>(null);
  const getFallbackRangeRef = useRef(getFallbackRange);
  getFallbackRangeRef.current = getFallbackRange;

  // Load API key and transcription provider settings, and stay in sync with
  // the AI settings window (custom events + BroadcastChannel).
  useEffect(() => {
    const loadSettings = () => {
      const provider = transcriptionService.getPreferredProvider();
      setCurrentProvider(provider);
      const key = transcriptionService.getApiKeyForProvider(provider);
      setApiKey(key);
    };

    loadSettings();

    const handleSettingsUpdate = () => {
      loadSettings();
    };

    window.addEventListener("ai-settings-updated", handleSettingsUpdate);
    window.addEventListener("aiSettingsUpdated", handleSettingsUpdate);

    let broadcastChannel: BroadcastChannel | null = null;
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      broadcastChannel = new BroadcastChannel("abloop-settings");
      broadcastChannel.onmessage = (event) => {
        if (event.data?.type === "ai-settings-updated") {
          loadSettings();
        }
      };
    }

    return () => {
      window.removeEventListener("ai-settings-updated", handleSettingsUpdate);
      window.removeEventListener("aiSettingsUpdated", handleSettingsUpdate);
      broadcastChannel?.close();
    };
  }, []);

  // Abort an in-flight transcription when the consumer unmounts.
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  const extractAudioFromMedia = async (range?: TimeRange): Promise<Blob> => {
    const { currentFile } = usePlayerStore.getState();
    return new Promise((resolve, reject) => {
      if (!currentFile) {
        reject(new Error(t("transcript.noFileLoaded")));
        return;
      }

      // For audio files, we can use them directly or slice them if range provided
      if (currentFile.type.includes("audio")) {
        fetch(currentFile.url)
          .then(async (response) => {
            if (!range) {
              resolve(await response.blob());
              return;
            }

            return response.arrayBuffer();
          })
          .then(async (arrayBuffer) => {
            if (!range || !arrayBuffer) {
              return;
            }

            try {
              const audioContext = new AudioContext();
              const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

              let startFrame = Math.floor(range.start * audioBuffer.sampleRate);
              let endFrame = Math.floor(range.end * audioBuffer.sampleRate);
              startFrame = Math.max(0, startFrame);
              endFrame = Math.min(audioBuffer.length, endFrame);

              const frameCount = endFrame - startFrame;
              if (frameCount <= 0) {
                reject(new Error("Invalid time range"));
                return;
              }

              // Mix down to mono for speech recognition
              const channel0 = audioBuffer.getChannelData(0);
              const slicedData = new Float32Array(frameCount);

              if (audioBuffer.numberOfChannels > 1) {
                const channel1 = audioBuffer.getChannelData(1);
                for (let i = 0; i < frameCount; i++) {
                  const idx = startFrame + i;
                  slicedData[i] = (channel0[idx] + channel1[idx]) / 2;
                }
              } else {
                for (let i = 0; i < frameCount; i++) {
                  slicedData[i] = channel0[startFrame + i];
                }
              }

              const wavBlob = encodeWAV(slicedData, audioBuffer.sampleRate);
              audioContext.close();
              resolve(wavBlob);
            } catch (err) {
              console.error("Error processing audio:", err);
              reject(err);
            }
          })
          .catch((error) => reject(error));
        return;
      }

      // For video files, capture the audio track in real time
      if (currentFile.type.includes("video")) {
        const video = document.createElement("video");
        video.src = currentFile.url;

        const audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();
        const source = audioContext.createMediaElementSource(video);
        source.connect(destination);

        const mediaRecorder = new MediaRecorder(destination.stream);
        const chunks: BlobPart[] = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data);
          }
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: "audio/wav" });
          resolve(blob);
        };

        video.onloadedmetadata = () => {
          const startTime = range ? range.start : 0;
          const duration = range ? (range.end - range.start) : video.duration;

          video.currentTime = startTime;

          const onSeeked = () => {
            video.removeEventListener("seeked", onSeeked);
            video.play();
            mediaRecorder.start();

            setTimeout(() => {
              video.pause();
              mediaRecorder.stop();
              audioContext.close();
              video.remove();
            }, duration * 1000);
          };

          video.addEventListener("seeked", onSeeked);
        };

        video.onerror = () => {
          reject(new Error(t("transcript.errorLoadingVideo")));
        };

        return;
      }

      reject(new Error(t("transcript.unsupportedFileType")));
    });
  };

  // Demo path for YouTube videos, whose audio we cannot access directly.
  const simulateTranscription = async () => {
    const { clearTranscript, addTranscriptSegment } = useTranscriptStore.getState();
    const sampleSegments = [
      { text: "Welcome to this audio demonstration.", startTime: 0.0, endTime: 3.5, confidence: 0.92 },
      { text: "Today we'll explore the key features of our application.", startTime: 3.5, endTime: 7.2, confidence: 0.89 },
      { text: "The first feature is the ability to create precise loops.", startTime: 7.2, endTime: 10.8, confidence: 0.95 },
      { text: "You can set the start and end points exactly where you want them.", startTime: 10.8, endTime: 14.5, confidence: 0.91 },
      { text: "This is perfect for musicians practicing difficult passages.", startTime: 14.5, endTime: 18.2, confidence: 0.88 },
      { text: "Or for language learners who want to repeat specific phrases.", startTime: 18.2, endTime: 22.0, confidence: 0.93 },
      { text: "The second feature is our waveform visualization.", startTime: 22.0, endTime: 25.8, confidence: 0.9 },
      { text: "It helps you see the audio structure and identify specific parts.", startTime: 25.8, endTime: 30.0, confidence: 0.87 },
      { text: "And now we've added automatic transcription.", startTime: 30.0, endTime: 33.2, confidence: 0.94 },
      { text: "So you can read along as you listen.", startTime: 33.2, endTime: 36.0, confidence: 0.92 },
    ];

    clearTranscript();

    for (let i = 0; i < sampleSegments.length; i++) {
      const segment = sampleSegments[i];
      setProcessingProgress(Math.round(((i + 1) / sampleSegments.length) * 100));
      addTranscriptSegment({
        text: segment.text,
        startTime: Math.max(0, segment.startTime),
        endTime: Math.max(segment.startTime, segment.endTime),
        confidence: segment.confidence,
        isFinal: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  };

  const transcribeMedia = async (
    requestedRange?: Partial<TimeRange>,
    options?: { forceFullRange?: boolean }
  ) => {
    const { currentFile, currentYouTube, duration } = usePlayerStore.getState();
    const {
      transcriptLanguage,
      clearTranscript,
      startTranscribing,
      stopTranscribing,
      addTranscriptSegments,
    } = useTranscriptStore.getState();

    if (!currentFile && !currentYouTube) {
      toast.error(t("transcript.noMediaToTranscribe"));
      return;
    }

    if (!apiKey && currentProvider !== "local-whisper") {
      setShowApiKeyInput(true);
      return;
    }

    const range = options?.forceFullRange
      ? normalizeRange(requestedRange)
      : normalizeRange(requestedRange) || getFallbackRangeRef.current?.();

    if (currentFile && !range && currentFile.size > LARGE_TRANSCRIPTION_FILE_SIZE) {
      toast(t("transcript.largeFileRangeRecommended"));
    }

    try {
      setIsProcessing(true);
      setErrorMessage("");
      setTranscriptionStatus(null);

      // Only clear if doing full transcript
      if (!range || options?.forceFullRange) {
        clearTranscript();
      }

      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      startTranscribing();
      setProcessingProgress(10);

      // For YouTube videos, we can't directly access the audio
      if (currentYouTube) {
        toast.error(t("transcript.youtubeTranscriptionWarning"));
        await simulateTranscription();
        return;
      }

      const audioBlob = await extractAudioFromMedia(range);
      setProcessingProgress(30);

      const providerInfo = transcriptionService.getProviderInfo(currentProvider);
      toast(t("transcript.processingWithProvider", { provider: providerInfo.name }));

      setProcessingProgress(50);

      const transcriptionConfig = {
        provider: currentProvider,
        apiKey: apiKey,
        language: transcriptLanguage,
      };
      const shouldUseChunkedTranscription =
        !range && duration >= PROGRESSIVE_TRANSCRIPTION_THRESHOLD_SECONDS;

      const result = shouldUseChunkedTranscription
        ? await transcriptionService.transcribeInChunks(
          transcriptionConfig,
          audioBlob,
          {
            signal: abortController.signal,
            onChunkComplete: (segments, chunkIndex, totalChunks) => {
              setTranscriptionStatus(
                t("transcript.processingChunk", {
                  current: chunkIndex,
                  total: totalChunks,
                })
              );
              setProcessingProgress(
                Math.min(95, 50 + Math.round((chunkIndex / totalChunks) * 45))
              );
              addTranscriptSegments(
                segments.map((segment) => ({
                  text: segment.text.trim(),
                  startTime: Math.max(0, segment.start),
                  endTime: Math.max(segment.start, segment.end),
                  confidence: segment.confidence,
                  isFinal: true,
                }))
              );
            },
          }
        )
        : await transcriptionService.transcribe(
          transcriptionConfig,
          audioBlob,
          { signal: abortController.signal }
        );

      setProcessingProgress(80);

      const startTimeOffset = range ? range.start : 0;

      if (shouldUseChunkedTranscription) {
        setProcessingProgress(100);
        return;
      }

      if (result.segments && result.segments.length > 0) {
        // Map word-level data from API response to segments
        const wordMap = assignWordsToSegments(result.words, result.segments);
        let wordCounter = 0;

        addTranscriptSegments(
          result.segments.map((segment) => {
            const segmentWords = wordMap.get(segment.id);
            const words = segmentWords?.map((w) => ({
              id: `word-${wordCounter++}`,
              text: w.word,
              start: Math.max(0, w.start + startTimeOffset),
              end: Math.max(0, w.end + startTimeOffset),
            }));
            const wordIds = words?.map((w) => w.id);

            return {
              text: segment.text.trim(),
              startTime: Math.max(0, segment.start + startTimeOffset),
              endTime: Math.max(segment.start + startTimeOffset, segment.end + startTimeOffset),
              confidence: segment.confidence,
              isFinal: true,
              words,
              wordIds,
            };
          })
        );
      } else {
        // If no segments are returned, use the full transcript with basic sentence breaking
        const sentences = await utilBreakIntoSentences(result.fullText);

        addTranscriptSegments(sentences.map((sentence, index) => {
          const startTime = (index * 30) / sentences.length;
          const endTime = ((index + 1) * 30) / sentences.length;

          return {
            text: sentence.trim(),
            startTime: Math.max(0, startTime + startTimeOffset),
            endTime: Math.max(startTime + startTimeOffset, endTime + startTimeOffset),
            confidence: 0.85,
            isFinal: true,
          };
        }));
      }

      setProcessingProgress(100);
    } catch (error) {
      console.error("Error transcribing media:", error);

      if (error instanceof Error && error.name === "AbortError") {
        toast(t("transcript.transcriptionCancelled"));
        return;
      }

      let message = t("transcript.transcriptionFailed");

      if (error instanceof Error) {
        if (error.message.includes("401") || error.message.includes("Unauthorized")) {
          message += t("transcript.invalidApiKey");
        } else if (error.message.includes("429") || error.message.includes("rate limit")) {
          message += t("transcript.rateLimitExceeded");
        } else if (error.message.includes("413") || error.message.includes("too large")) {
          message += t("transcript.audioFileTooLarge");
        } else if (error.message.includes("network") || error.message.includes("fetch")) {
          message += t("transcript.networkError");
        } else {
          message += t("transcript.genericError", { message: error.message });
        }
      } else {
        message += t("transcript.unknownError");
      }

      setErrorMessage(message);
      toast.error(message);
    } finally {
      if (abortControllerRef.current?.signal.aborted || abortControllerRef.current) {
        abortControllerRef.current = null;
      }
      setTranscriptionStatus(null);
      setIsProcessing(false);
      stopTranscribing();
    }
  };

  const cancelTranscription = () => {
    abortControllerRef.current?.abort();
  };

  return {
    isProcessing,
    processingProgress,
    transcriptionStatus,
    errorMessage,
    showApiKeyInput,
    setShowApiKeyInput,
    currentProvider,
    transcribeMedia,
    cancelTranscription,
  };
};
