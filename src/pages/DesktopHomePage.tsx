import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Youtube, FolderOpen, Film, Music, ChevronRight, Bookmark, BookOpen, Mic, CheckCircle2 } from "lucide-react";
import { YouTubeInput } from "../components/player/YouTubeInput";
import { DesktopFileOpener } from "../components/desktop/DesktopFileOpener";
import { useHistoryStore, deriveHistoryMediaId } from "../stores/historyStore";
import { useBookmarkStore } from "../stores/bookmarkStore";
import { useTranscriptStore } from "../stores/transcriptStore";
import { useShadowingStore } from "../stores/shadowingStore";
import { useProgressStore } from "../stores/progressStore";
import { formatTime } from "../utils/formatTime";
import { formatRelativeTime } from "../utils/relativeTime";
import { desktopApi } from "../platform/runtime";
import type { MediaHistoryItem } from "../stores/historyStore";

interface DesktopHomePageProps {
  handleVideoIdSubmit: (videoId: string) => void;
}

interface ResumeCardStats {
  bookmarks: number;
  glossary: number;
  takes: number;
  practiced: number;
}

const logoUrl = `${import.meta.env.BASE_URL}logo.png`;

const ResumeCard = ({
  item,
  stats,
  onOpen,
}: {
  item: MediaHistoryItem;
  stats: ResumeCardStats;
  onOpen: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const isYouTube = item.type === "youtube";
  const isVideo = item.fileData?.type?.includes("video");
  const Icon = isYouTube ? Youtube : isVideo ? Film : Music;

  const resumeFraction =
    item.playbackTime && item.duration && item.duration > 0
      ? Math.min(1, item.playbackTime / item.duration)
      : null;

  const chips = [
    stats.bookmarks > 0 && { Icon: Bookmark, value: stats.bookmarks, label: t("home.stats.bookmarks") },
    stats.glossary > 0 && { Icon: BookOpen, value: stats.glossary, label: t("home.stats.glossary") },
    stats.takes > 0 && { Icon: Mic, value: stats.takes, label: t("home.stats.takes") },
    stats.practiced > 0 && { Icon: CheckCircle2, value: stats.practiced, label: t("home.stats.practiced") },
  ].filter(Boolean) as Array<{ Icon: typeof Bookmark; value: number; label: string }>;

  return (
    <button
      onClick={onOpen}
      className="group flex w-full flex-col gap-2 rounded-xl border border-gray-100 bg-white/60 p-3 text-left transition-colors hover:border-primary-200 hover:bg-primary-50/40 dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:border-primary-800/60 dark:hover:bg-primary-900/10"
    >
      <div className="flex w-full items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 transition-colors group-hover:bg-primary-500 group-hover:text-white dark:bg-white/[0.06] dark:text-gray-400">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-gray-700 transition-colors group-hover:text-primary-600 dark:text-gray-200 dark:group-hover:text-primary-400">
            {item.name}
          </span>
          <span className="block text-xs text-gray-400 dark:text-gray-500">
            {[
              item.playbackTime
                ? t("home.resumeAt", { time: formatTime(item.playbackTime) })
                : null,
              formatRelativeTime(item.accessedAt, i18n.language),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-transparent transition-colors group-hover:text-gray-300 dark:group-hover:text-gray-600" />
      </div>

      {resumeFraction !== null && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-primary-400 dark:bg-primary-500"
            style={{ width: `${Math.round(resumeFraction * 100)}%` }}
          />
        </div>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map(({ Icon: ChipIcon, value, label }) => (
            <span
              key={label}
              title={label}
              className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-1.5 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-white/[0.05] dark:text-gray-400"
            >
              <ChipIcon className="h-3 w-3" />
              {value}
            </span>
          ))}
        </div>
      )}
    </button>
  );
};

export const DesktopHomePage = ({ handleVideoIdSubmit }: DesktopHomePageProps) => {
  const { t } = useTranslation();
  const { mediaHistory, loadFromHistory, addSourceFolder } = useHistoryStore();
  const mediaBookmarks = useBookmarkStore((state) => state.mediaBookmarks);
  const glossaryEntries = useTranscriptStore((state) => state.glossaryEntries);
  const shadowingSessions = useShadowingStore((state) => state.sessions);
  const progress = useProgressStore((state) => state.progress);

  const handleOpenFolder = async () => {
    const api = desktopApi;
    if (!api) return;
    const selected = await api.openFolder();
    if (selected) {
      await api.approvePath(selected);
      addSourceFolder(selected);
    }
  };

  const recentItems = mediaHistory.slice(0, 6);

  const statsFor = (item: MediaHistoryItem): ResumeCardStats => {
    const mediaId = deriveHistoryMediaId(item);
    if (!mediaId) return { bookmarks: 0, glossary: 0, takes: 0, practiced: 0 };
    return {
      bookmarks: mediaBookmarks[mediaId]?.length ?? 0,
      glossary: glossaryEntries.filter((e) => e.mediaId === mediaId).length,
      takes: shadowingSessions[mediaId]?.segments.length ?? 0,
      practiced: progress[mediaId]?.practicedSentenceIndices.length ?? 0,
    };
  };

  return (
    <div className="relative flex flex-1 min-h-full flex-col">
      {/* Subtle warm backdrop behind the hero */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-primary-50/50 to-transparent dark:from-primary-950/20" />

      <div className="relative z-10 mx-auto flex w-full max-w-xl flex-col px-6 py-12 sm:py-16">
        {/* Hero */}
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex flex-col items-center text-center"
        >
          <img
            src={logoUrl}
            alt="Pawcast"
            className="mb-5 h-16 w-16 object-contain"
          />
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
            {t("home.startPracticing", "Start Practicing")}
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            {t("home.studioDesc")}
          </p>
        </motion.header>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08, ease: "easeOut" }}
          className="mt-8 space-y-3"
        >
          {/* Primary: open or drop a local file */}
          <DesktopFileOpener />

          {/* Secondary: paste a YouTube link */}
          <YouTubeInput onVideoIdSubmit={handleVideoIdSubmit} />

          {/* Secondary: add a folder for batch practice */}
          {desktopApi && <button
            onClick={handleOpenFolder}
            className="group flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white/60 px-4 py-3 text-left transition-colors hover:border-gray-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.05]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-50 text-accent-500 dark:bg-accent-900/20 dark:text-accent-400">
              <FolderOpen className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">
                {t("sidebar.addFolder")}
              </span>
              <span className="block text-xs text-gray-400 dark:text-gray-500">
                {t("home.addFolderDesc")}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-gray-300 transition-colors group-hover:text-gray-400 dark:text-gray-600" />
          </button>}
        </motion.div>

        {/* Continue studying */}
        {recentItems.length > 0 && (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.16 }}
            className="mt-10"
          >
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              {t("home.continueStudying")}
            </h2>
            <div className="flex flex-col gap-2">
              {recentItems.map((item) => (
                <ResumeCard
                  key={item.id}
                  item={item}
                  stats={statsFor(item)}
                  onOpen={() => loadFromHistory(item.id)}
                />
              ))}
            </div>
          </motion.section>
        )}
      </div>
    </div>
  );
};
