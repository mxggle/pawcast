import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Languages, Loader, Settings } from "lucide-react";
import { cn } from "../../utils/cn";
import { requestOpenSettings } from "../../utils/settingsIntents";
import {
  getTranslationState,
  requestTranslation,
  retryTranslation,
  subscribeToTranslation,
} from "./translationState";

export type TranslationBlurMode = "none" | "hover" | "click";

interface TranscriptTranslationLineProps {
  sourceText: string;
  targetLanguage: string;
  blurMode: TranslationBlurMode;
}

export const TranscriptTranslationLine = ({
  sourceText,
  targetLanguage,
  blurMode,
}: TranscriptTranslationLineProps) => {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);

  const subscribe = useCallback(
    (listener: () => void) => subscribeToTranslation(targetLanguage, sourceText, listener),
    [targetLanguage, sourceText]
  );
  const getSnapshot = useCallback(
    () => getTranslationState(targetLanguage, sourceText),
    [targetLanguage, sourceText]
  );
  const entry = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Kick off translation whenever this line becomes visible (virtualized rows
  // mount lazily) or the target language changes.
  useEffect(() => {
    requestTranslation(targetLanguage, sourceText);
  }, [targetLanguage, sourceText]);

  // Reset the click-to-reveal state when the source/language changes.
  useEffect(() => {
    setRevealed(false);
  }, [targetLanguage, sourceText]);

  if (entry.status === "loading" || entry.status === "idle") {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
        <Loader size={11} className="animate-spin shrink-0" />
        <span>{t("transcript.translation.loading")}</span>
      </div>
    );
  }

  if (entry.status === "error") {
    if (entry.error === "MISSING_API_KEY") {
      return (
        <button
          type="button"
          onClick={() => requestOpenSettings({ tab: "ai" })}
          className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-amber-600 hover:underline dark:text-amber-400"
        >
          <Settings size={11} className="shrink-0" />
          {t("transcript.translation.configureApiKey")}
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => retryTranslation(targetLanguage, sourceText)}
        className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-error-500 hover:underline dark:text-error-400"
      >
        <Languages size={11} className="shrink-0" />
        {t("transcript.translation.retry")}
      </button>
    );
  }

  if (!entry.text) {
    return null;
  }

  const isBlurred =
    (blurMode === "hover" || blurMode === "click") && !revealed;
  const revealOnClick = blurMode === "click";

  return (
    <p
      onClick={revealOnClick ? () => setRevealed((prev) => !prev) : undefined}
      title={blurMode === "click" ? t("transcript.translation.clickToReveal") : undefined}
      className={cn(
        "mt-1.5 text-sm leading-relaxed text-gray-500 dark:text-gray-400",
        "transition-[filter,opacity] duration-200",
        isBlurred && "select-none blur-[5px] opacity-70",
        blurMode === "hover" && "hover:select-auto hover:blur-none hover:opacity-100",
        revealOnClick && "cursor-pointer"
      )}
    >
      {entry.text}
    </p>
  );
};
