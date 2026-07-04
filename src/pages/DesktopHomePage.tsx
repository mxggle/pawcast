import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Youtube, FolderOpen, Film, Music, ChevronRight } from "lucide-react";
import { YouTubeInput } from "../components/player/YouTubeInput";
import { DesktopFileOpener } from "../components/desktop/DesktopFileOpener";
import { useHistoryStore } from "../stores/historyStore";
import { formatTime } from "../utils/formatTime";
import { formatRelativeTime } from "../utils/relativeTime";
import { desktopApi } from "../platform/runtime";

interface DesktopHomePageProps {
  handleVideoIdSubmit: (videoId: string) => void;
}

export const DesktopHomePage = ({ handleVideoIdSubmit }: DesktopHomePageProps) => {
  const { t, i18n } = useTranslation();
  const { mediaHistory, loadFromHistory, addSourceFolder } = useHistoryStore();

  const handleOpenFolder = async () => {
    const api = desktopApi;
    if (!api) return;
    const selected = await api.openFolder();
    if (selected) {
      await api.approvePath(selected);
      addSourceFolder(selected);
    }
  };

  const recentItems = mediaHistory.slice(0, 5);

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
            src="/logo.png"
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

        {/* Recent */}
        {recentItems.length > 0 && (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.16 }}
            className="mt-10"
          >
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              {t("sidebar.recent")}
            </h2>
            <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-white/[0.06]">
              {recentItems.map((item) => {
                const isYouTube = item.type === "youtube";
                const isVideo = item.fileData?.type?.includes("video");
                const Icon = isYouTube ? Youtube : isVideo ? Film : Music;
                const meta = [
                  item.playbackTime ? formatTime(item.playbackTime) : null,
                  formatRelativeTime(item.accessedAt, i18n.language),
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <button
                    key={item.id}
                    onClick={() => loadFromHistory(item.id)}
                    className="group flex w-full items-center gap-3 border-b border-gray-100 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-gray-50 dark:border-white/[0.06] dark:hover:bg-white/[0.04]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 transition-colors group-hover:bg-primary-500 group-hover:text-white dark:bg-white/[0.06] dark:text-gray-400">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-gray-700 transition-colors group-hover:text-primary-600 dark:text-gray-200 dark:group-hover:text-primary-400">
                        {item.name}
                      </span>
                      {meta && (
                        <span className="block text-xs text-gray-400 dark:text-gray-500">
                          {meta}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-transparent transition-colors group-hover:text-gray-300 dark:group-hover:text-gray-600" />
                  </button>
                );
              })}
            </div>
          </motion.section>
        )}
      </div>
    </div>
  );
};
