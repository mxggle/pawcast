import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Clock, ExternalLink, Play, Search, SearchX, Trash2, X } from "lucide-react";
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
  const [query, setQuery] = useState("");

  const isGlossaryWindow = location.pathname === "/glossary-window";

  const entries = useMemo(
    () => [...glossaryEntries].sort((left, right) => right.createdAt - left.createdAt),
    [glossaryEntries]
  );

  const filteredEntries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter(
      (entry) =>
        entry.text.toLowerCase().includes(needle) ||
        entry.contextText.toLowerCase().includes(needle) ||
        (entry.mediaName ?? "").toLowerCase().includes(needle)
    );
  }, [entries, query]);

  // Group by source media, sections ordered by their newest entry.
  const groupedEntries = useMemo(() => {
    const groups = new Map<string, typeof filteredEntries>();
    for (const entry of filteredEntries) {
      const key = entry.mediaName || t("glossary.unknownMedia");
      const list = groups.get(key);
      if (list) list.push(entry);
      else groups.set(key, [entry]);
    }
    return [...groups.entries()].map(([mediaName, items]) => ({ mediaName, items }));
  }, [filteredEntries, t]);

  const handlePlayContext = (id: string) => {
    if (isGlossaryWindow && desktopApi?.playGlossaryEntryInMainWindow) {
      void desktopApi.playGlossaryEntryInMainWindow(id);
      toast.success(t("glossary.playingContext"));
      return;
    }

    const played = playGlossaryEntryContext(id);

    if (played) {
      toast.success(t("glossary.playingContext"));
      return;
    }

    toast.error(t("glossary.sourceMediaRequired"));
  };

  const handleOpenOriginalMedia = (id: string) => {
    if (isGlossaryWindow && desktopApi?.navigateInMainWindow) {
      void desktopApi.navigateInMainWindow("/player", id);
      return;
    }

    const played = playGlossaryEntryContext(id);
    if (played) {
      navigate("/player");
      return;
    }

    toast.error(t("glossary.sourceMediaRequired"));
  };

  if (entries.length === 0) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 px-6 text-center dark:border-white/10 dark:bg-white/[0.02]">
        <div className="max-w-md">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-500/10 text-primary-600 dark:text-primary-400">
            <BookOpen size={22} />
          </div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {t("glossary.emptyTitle")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            {t("glossary.emptyDescription")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("glossary.searchPlaceholder", "Search saved words and phrases")}
          aria-label={t("glossary.searchPlaceholder", "Search saved words and phrases")}
          className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-9 text-sm text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-primary-400/60 focus:ring-2 focus:ring-primary-500/15 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100 dark:focus:border-primary-400/40"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            title={t("glossary.clearSearch", "Clear search")}
            aria-label={t("glossary.clearSearch", "Clear search")}
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-black/5 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:hover:bg-white/10 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {filteredEntries.length === 0 ? (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-200 px-6 text-center dark:border-white/10">
          <SearchX className="h-6 w-6 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("glossary.noResults", "No entries match your search.")}
          </p>
        </div>
      ) : (
        groupedEntries.map(({ mediaName, items }) => (
          <section key={mediaName}>
            <h2 className="mb-2 flex items-baseline gap-2 px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500">
              <span className="truncate">{mediaName}</span>
              <span className="shrink-0 font-medium normal-case tracking-normal text-gray-300 dark:text-gray-600">
                {t("glossary.entryCount", { count: items.length })}
              </span>
            </h2>
            <div className="space-y-3">
              {items.map((entry) => (
                <article
                  key={entry.id}
                  className="group rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300 dark:border-white/[0.08] dark:bg-white/[0.02] dark:hover:border-white/[0.14]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-base font-semibold leading-snug text-gray-900 dark:text-white">
                        {entry.text}
                      </h3>
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-gray-50 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-gray-500 dark:bg-white/[0.05] dark:text-gray-400">
                        <Clock className="h-3 w-3" />
                        {formatTime(entry.startTime)} – {formatTime(entry.endTime)}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handlePlayContext(entry.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-500/10 text-primary-600 transition-colors hover:bg-primary-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:text-primary-400 dark:hover:text-white"
                        title={t("glossary.playContext")}
                        aria-label={t("glossary.playContext")}
                      >
                        <Play className="h-3.5 w-3.5 translate-x-px fill-current" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenOriginalMedia(entry.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:text-gray-500 dark:hover:bg-white/10 dark:hover:text-gray-200"
                        title={t("glossary.openOriginalMedia")}
                        aria-label={t("glossary.openOriginalMedia")}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteGlossaryEntry(entry.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-gray-300 transition-colors hover:bg-error-500/10 hover:text-error-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-error-500/40 dark:text-gray-600 dark:hover:text-error-400"
                        title={t("glossary.deleteEntry")}
                        aria-label={t("glossary.deleteEntry")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <p className="mt-3 whitespace-pre-wrap break-words border-l-2 border-primary-200 pl-3 text-sm leading-relaxed text-gray-600 dark:border-primary-500/30 dark:text-gray-300">
                    {entry.contextText}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
};
