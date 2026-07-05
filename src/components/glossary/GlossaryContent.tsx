import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, PlayCircle, Trash } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "react-hot-toast";
import { useTranscriptStore } from "../../stores/transcriptStore";
import { formatTime } from "../../utils/formatTime";
import { desktopApi } from "../../platform/runtime";

export const GlossaryContent = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const glossaryEntries = useTranscriptStore((state) => state.glossaryEntries);
  const deleteGlossaryEntry = useTranscriptStore((state) => state.deleteGlossaryEntry);
  const playGlossaryEntryContext = useTranscriptStore((state) => state.playGlossaryEntryContext);

  const isGlossaryWindow = location.pathname === "/glossary-window";

  const entries = useMemo(
    () => [...glossaryEntries].sort((left, right) => right.createdAt - left.createdAt),
    [glossaryEntries]
  );

  // Group by source media, sections ordered by their newest entry.
  const groupedEntries = useMemo(() => {
    const groups = new Map<string, typeof entries>();
    for (const entry of entries) {
      const key = entry.mediaName || t("glossary.unknownMedia");
      const list = groups.get(key);
      if (list) list.push(entry);
      else groups.set(key, [entry]);
    }
    return [...groups.entries()].map(([mediaName, items]) => ({ mediaName, items }));
  }, [entries, t]);

  const handlePlayContext = (id: string) => {
    if (isGlossaryWindow && desktopApi?.navigateInMainWindow) {
      desktopApi.navigateInMainWindow("/player", id);
      toast.success(t("glossary.playingContext"));
      return;
    }

    const played = playGlossaryEntryContext(id);

    if (played) {
      navigate("/player");
      toast.success(t("glossary.playingContext"));
      return;
    }

    toast.error(t("glossary.sourceMediaRequired"));
  };

  if (entries.length === 0) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 text-center dark:border-gray-700 dark:bg-gray-900/40">
        <div className="max-w-md">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
            <BookOpen size={20} />
          </div>
          <h2 className="text-base font-medium text-gray-900 dark:text-white">
            {t("glossary.emptyTitle")}
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {t("glossary.emptyDescription")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groupedEntries.map(({ mediaName, items }) => (
        <section key={mediaName}>
          <h2 className="mb-2 flex items-baseline gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            <span className="truncate">{mediaName}</span>
            <span className="shrink-0 font-normal normal-case tracking-normal">
              {t("glossary.entryCount", { count: items.length })}
            </span>
          </h2>
          <div className="space-y-3">
            {items.map((entry) => (
        <article
          key={entry.id}
          className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/70"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="break-words text-lg font-semibold text-gray-900 dark:text-white">
                {entry.text}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                <span>
                  {formatTime(entry.startTime)} - {formatTime(entry.endTime)}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => handlePlayContext(entry.id)}
                className="rounded-full p-2 text-gray-500 transition-colors hover:bg-primary-50 hover:text-primary-600 dark:text-gray-400 dark:hover:bg-primary-900/30 dark:hover:text-primary-300"
                title={t("glossary.playContext")}
                aria-label={t("glossary.playContext")}
              >
                <PlayCircle size={18} />
              </button>
              <button
                type="button"
                onClick={() => deleteGlossaryEntry(entry.id)}
                className="rounded-full p-2 text-gray-500 transition-colors hover:bg-error-50 hover:text-error-600 dark:text-gray-400 dark:hover:bg-error-900/30 dark:hover:text-error-300"
                title={t("glossary.deleteEntry")}
                aria-label={t("glossary.deleteEntry")}
              >
                <Trash size={17} />
              </button>
            </div>
          </div>

          <p className="mt-3 whitespace-pre-wrap break-words rounded-md bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-700 dark:bg-gray-950/60 dark:text-gray-300">
            {entry.contextText}
          </p>
        </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
