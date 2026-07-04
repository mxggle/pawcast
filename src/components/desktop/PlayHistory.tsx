import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { usePlayerStore } from "../../stores/playerStore";
import { useHistoryStore, type MediaHistoryItem } from "../../stores/historyStore";
import { Music, Youtube, X, SquareArrowOutUpRight } from "lucide-react";
import {
  getShowInFileManagerLabel,
  revealInFileManager,
} from "./fileManager";
import { SidebarRow } from "../ui/SidebarRow";
import { SidebarRowAction } from "../ui/SidebarRowAction";

/* ── Time-ago helper ────────────────────────────────────────────── */
const timeAgo = (
  timestamp: number,
  t: (key: string, opts?: Record<string, unknown>) => string
): string => {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t("sidebar.timeAgo.justNow", { defaultValue: "just now" });
  if (minutes < 60)
    return t("sidebar.timeAgo.minutesAgo", { count: minutes, defaultValue: `${minutes}m ago` });
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return t("sidebar.timeAgo.hoursAgo", { count: hours, defaultValue: `${hours}h ago` });
  const days = Math.floor(hours / 24);
  return t("sidebar.timeAgo.daysAgo", { count: days, defaultValue: `${days}d ago` });
};

/* ── Subtext (path / URL) ───────────────────────────────────────── */
const getSubtext = (item: MediaHistoryItem): string => {
  if (item.type === "youtube") {
    return item.youtubeData?.youtubeId
      ? `youtube.com/watch?v=${item.youtubeData.youtubeId}`
      : "YouTube";
  }
  const nativePath = item.nativePath ?? item.fileData?.nativePath;
  if (nativePath) return nativePath;
  return item.name;
};

/* ── Is this item currently playing? ────────────────────────────── */
const isActive = (
  item: MediaHistoryItem,
  currentFilePath?: string | null,
  currentYouTubeId?: string | null
): boolean => {
  if (item.type === "youtube") {
    return item.youtubeData?.youtubeId === currentYouTubeId;
  }
  const nativePath = item.nativePath ?? item.fileData?.nativePath;
  return !!nativePath && nativePath === currentFilePath;
};

/* ── Exported component ─────────────────────────────────────────── */
export const PlayHistory = () => {
  const { t } = useTranslation();
  const { mediaHistory, loadFromHistory, removeFromHistory } = useHistoryStore();
  const { currentFile, currentYouTube } = usePlayerStore();
  const showInFileManagerLabel = getShowInFileManagerLabel(t);

  const sorted = [...mediaHistory].sort((a, b) => b.accessedAt - a.accessedAt);

  const currentFilePath = currentFile?.nativePath ?? null;
  const currentYouTubeId = currentYouTube?.id ?? null;

  const handleRemove = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      removeFromHistory(id);
    },
    [removeFromHistory]
  );

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
        <Music className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {t("sidebar.noHistory", "No recent files.")}
        </p>
      </div>
    );
  }

  return (
    <ul className="py-1">
      {sorted.map((item) => {
        const active = isActive(item, currentFilePath, currentYouTubeId);
        const nativePath = item.nativePath ?? item.fileData?.nativePath;
        
        return (
          <li key={item.id} className="mb-0.5 last:mb-0">
            <SidebarRow
              onClick={() => loadFromHistory(item.id)}
              isActive={active}
              icon={
                item.type === "youtube" ? (
                  <Youtube className="w-3.5 h-3.5 text-error-400 dark:text-error-500" />
                ) : (
                  <Music className="w-3.5 h-3.5 text-primary-400 dark:text-primary-500" />
                )
              }
              primaryText={item.name}
              secondaryText={getSubtext(item)}
              className="h-auto py-1.5"
              actionAreaClassName="bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm rounded-md"
              actions={
                <>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums group-hover:hidden group-focus-within:hidden mr-1">
                    {timeAgo(item.accessedAt, t)}
                  </span>
                  {nativePath && (
                    <SidebarRowAction
                      icon={<SquareArrowOutUpRight />}
                      onClick={() => void revealInFileManager(nativePath)}
                      title={showInFileManagerLabel}
                      className="hidden group-hover:flex group-focus-within:flex"
                    />
                  )}
                  <SidebarRowAction
                    variant="error"
                    icon={<X />}
                    onClick={(e) => handleRemove(e as React.MouseEvent, item.id)}
                    title={t("sidebar.removeItem", "Remove")}
                    className="hidden group-hover:flex group-focus-within:flex"
                  />
                </>
              }
            />
          </li>
        );
      })}
    </ul>
  );
};
