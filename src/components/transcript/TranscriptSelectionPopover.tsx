import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { AI_PROMPTS } from "../../config/prompts";
import { BookmarkPlus, Loader, RotateCcw, Sparkles, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { MarkdownRenderer } from "../ui/MarkdownRenderer";
import { aiService } from "../../services/aiService";
import { usePlayerStore, type TranscriptSegment } from "../../stores/playerStore";
import { useTranscriptStore } from "../../stores/transcriptStore";
import {
  AIProvider,
  AIServiceConfig,
  DEFAULT_MODELS,
  normalizeModelId,
} from "../../types/aiService";
import type { TranscriptSelectionState } from "../../types/transcriptStudy";
import { buildTranscriptSelectionKey } from "../../utils/transcriptStudy";
import {
  getSelectionExplanationState,
  selectionExplanationCache,
  setSelectionExplanationState,
  type SelectionExplanationResult,
} from "./selectionExplanationState";

interface TranscriptSelectionPopoverProps {
  selection: TranscriptSelectionState;
  segment: TranscriptSegment;
  segmentText: string;
  onClose: () => void;
}

export const TranscriptSelectionPopover = ({
  selection,
  segment,
  segmentText,
  onClose,
}: TranscriptSelectionPopoverProps) => {
  const { t } = useTranslation();
  const [result, setResult] = useState<SelectionExplanationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [position, setPosition] = useState(() => ({
    top: selection.rect.top + selection.rect.height + 10,
    left: selection.rect.left,
  }));
  const [renderPosition, setRenderPosition] = useState(position);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const currentFile = usePlayerStore((state) => state.currentFile);
  const currentYouTube = usePlayerStore((state) => state.currentYouTube);
  const addGlossaryEntry = useTranscriptStore((state) => state.addGlossaryEntry);
  const getCurrentMediaId = usePlayerStore((state) => state.getCurrentMediaId);

  const key = useMemo(() => buildTranscriptSelectionKey(selection), [selection]);
  const selectedProvider = useMemo(
    () =>
      (localStorage.getItem("preferred_ai_provider") as AIProvider) || "openai",
    []
  );
  const targetLanguage = useMemo(
    () => localStorage.getItem("target_language") || "English",
    []
  );
  const selectedModel = useMemo(
    () =>
      normalizeModelId(
        selectedProvider,
        localStorage.getItem(`${selectedProvider}_model`) ||
          DEFAULT_MODELS[selectedProvider]
      ),
    [selectedProvider]
  );

  useEffect(() => {
    const cached = selectionExplanationCache.get(key);
    const state = getSelectionExplanationState(key);

    if (cached) {
      setResult(cached);
      setError(null);
      setIsLoading(false);
      return;
    }

    if (state.status === "error") {
      setError(state.error || t("explanation.unknownError"));
      setResult(null);
      setIsLoading(false);
      return;
    }

    setResult(null);
    setError(null);
    setIsLoading(state.status === "loading");
  }, [key, t]);

  useEffect(() => {
    setPosition({
      top: selection.rect.top + selection.rect.height + 10,
      left: selection.rect.left,
    });
  }, [selection]);

  // Clamp to the viewport using the measured size, so the popover never
  // overflows the window even after the explanation expands it.
  useLayoutEffect(() => {
    const element = popoverRef.current;
    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const next = {
      top: Math.max(12, Math.min(position.top, window.innerHeight - rect.height - 12)),
      left: Math.max(12, Math.min(position.left, window.innerWidth - rect.width - 12)),
    };

    setRenderPosition((previous) =>
      previous.top === next.top && previous.left === next.left ? previous : next
    );
  }, [position, result, isLoading, error]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const generateExplanation = async () => {
    const apiKey = localStorage.getItem(`${selectedProvider}_api_key`) || "";

    if (!aiService.validateApiKey(selectedProvider, apiKey)) {
      toast.error(
        t("explanation.configureApiKey", {
          provider: selectedProvider.toUpperCase(),
        })
      );
      return;
    }

    setIsLoading(true);
    setError(null);
    setSelectionExplanationState(key, { status: "loading" });

    try {
      const config: AIServiceConfig = {
        provider: selectedProvider,
        model: selectedModel,
        apiKey,
        baseURL:
          selectedProvider === "opencode"
            ? localStorage.getItem("opencode_base_url") || undefined
            : undefined,
        temperature: parseFloat(localStorage.getItem("ai_temperature") || "0.7"),
        maxTokens: parseInt(localStorage.getItem("ai_max_tokens") || "1200", 10),
        systemPrompt: AI_PROMPTS.system.languageTutorCompact(targetLanguage),
      };

      const prompt = AI_PROMPTS.features.selectionExplanation(
        segmentText,
        selection.text,
        targetLanguage
      );

      const response = await aiService.generateResponse(config, prompt);
      const explanation = {
        explanation: response.content,
        usage: response.usage,
        model: response.model,
        provider: response.provider,
      };

      selectionExplanationCache.set(key, explanation);
      setSelectionExplanationState(key, {
        status: "completed",
        result: explanation,
      });
      setResult(explanation);
      setError(null);
    } catch (generationError) {
      const message =
        generationError instanceof Error
          ? generationError.message
          : t("explanation.unknownError");
      setSelectionExplanationState(key, { status: "error", error: message });
      setError(message);
      setResult(null);
      toast.error(
        t("explanation.generationFailed", {
          message,
        })
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveToGlossary = () => {
    const mediaId = getCurrentMediaId();

    if (!mediaId) {
      toast.error(t("glossary.loadMediaFirst"));
      return;
    }

    const saved = addGlossaryEntry({
      mediaId,
      mediaName:
        currentFile?.name ||
        currentYouTube?.title ||
        currentYouTube?.id ||
        t("glossary.unknownMedia"),
      mediaType: currentFile?.type,
      youtubeId: currentYouTube?.id,
      segmentId: segment.id,
      text: selection.text,
      contextText: segment.text,
      selectionStart: selection.start,
      selectionEnd: selection.end,
      startTime: segment.startTime,
      endTime: segment.endTime,
    });

    if (saved) {
      toast.success(t("glossary.saved"));
    }
  };

  const handleDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.closest("button")) {
      return;
    }

    dragOffsetRef.current = {
      x: event.clientX - renderPosition.left,
      y: event.clientY - renderPosition.top,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setPosition({
        left: Math.max(12, moveEvent.clientX - dragOffsetRef.current.x),
        top: Math.max(12, moveEvent.clientY - dragOffsetRef.current.y),
      });
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const hasBody = isLoading || Boolean(error) || Boolean(result);

  const content = (
    <motion.div
      ref={popoverRef}
      className="transcript-selection-popover fixed z-[70] flex w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-gray-200/80 bg-white/98 text-gray-900 shadow-xl shadow-black/10 backdrop-blur-sm dark:border-white/10 dark:bg-gray-900/98 dark:text-gray-100"
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      style={{ top: renderPosition.top, left: renderPosition.left }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div
        className="flex cursor-move items-start gap-2 px-3.5 pb-2 pt-3"
        onPointerDown={handleDragStart}
      >
        <div className="min-w-0 flex-1">
          <p
            className="line-clamp-2 text-[13px] font-medium leading-snug text-gray-900 dark:text-gray-100"
            title={selection.text}
          >
            “{selection.text}”
          </p>
          {selection.matchedItem && (
            <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
              {t("transcript.selectionKnownItem", {
                type: t(`transcript.studyType.${selection.matchedItem.type}`),
                level: selection.matchedItem.level,
              })}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="-mr-1 -mt-0.5 shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          aria-label={t("common.close")}
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-3.5 pb-3">
        <button
          type="button"
          onClick={handleSaveToGlossary}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-600/15 active:bg-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:hover:bg-emerald-400/15"
        >
          <BookmarkPlus size={12} />
          {t("glossary.saveSelection")}
        </button>

        {!result && (
          <button
            type="button"
            onClick={generateExplanation}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600/10 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-600/15 active:bg-blue-600/20 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-400/10 dark:text-blue-300 dark:hover:bg-blue-400/15"
          >
            {isLoading ? (
              <Loader size={12} className="animate-spin" />
            ) : (
              <Sparkles size={12} />
            )}
            {t("transcript.explainSelection")}
          </button>
        )}
      </div>

      {hasBody && (
        <div className="border-t border-gray-100 dark:border-white/5">
          <div className="thin-scrollbar max-h-[min(48vh,22rem)] overflow-y-auto overscroll-contain px-3.5 py-3">
            {isLoading && (
              <div className="space-y-2" aria-hidden>
                <div className="h-3 w-1/3 animate-pulse rounded bg-gray-200/80 dark:bg-gray-700/60" />
                <div className="h-3 w-full animate-pulse rounded bg-gray-200/80 dark:bg-gray-700/60" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-gray-200/80 dark:bg-gray-700/60" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-gray-200/80 dark:bg-gray-700/60" />
              </div>
            )}

            {!isLoading && error && (
              <div className="flex flex-col items-start gap-2">
                <p className="text-xs leading-relaxed text-red-500 dark:text-red-400">
                  {error}
                </p>
                <button
                  type="button"
                  onClick={generateExplanation}
                  className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <RotateCcw size={11} />
                  {t("explanation.regenerate")}
                </button>
              </div>
            )}

            {!isLoading && !error && result && (
              <MarkdownRenderer content={result.explanation} />
            )}
          </div>

          {!isLoading && !error && result && (
            <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-3.5 py-1.5 dark:border-white/5">
              <span className="truncate text-[10px] text-gray-400 dark:text-gray-500">
                {t("explanation.providerInfo", {
                  provider: result.provider,
                  model: result.model,
                  tokens: result.usage?.totalTokens ?? 0,
                })}
              </span>
              <button
                type="button"
                onClick={generateExplanation}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
              >
                <RotateCcw size={10} />
                {t("explanation.regenerate")}
              </button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );

  return createPortal(content, document.body);
};
