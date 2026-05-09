import { useTranslation } from "react-i18next";
import { usePlayerStore } from "../../stores/playerStore";
import { MediaPlayer } from "./MediaPlayer";
import { YouTubePlayer } from "./YouTubePlayer";
import { PanelHeader } from "./PanelHeader";
import { cn } from "../../utils/cn";

interface MediaPreviewPanelProps {
  visible: boolean;
  collapsed: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  onHide: () => void;
  className?: string;
}

export const MediaPreviewPanel = ({
  visible,
  collapsed,
  onCollapse,
  onExpand,
  onHide,
  className,
}: MediaPreviewPanelProps) => {
  const { t } = useTranslation();
  const { currentFile, currentYouTube } = usePlayerStore();

  if (!visible) return null;

  const youtubeId = currentYouTube?.id;

  return (
    <div className={cn("flex flex-col min-h-0 @container/video bg-white dark:bg-gray-950/40 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden", className)}>
      <PanelHeader
        title={t("player.video", { defaultValue: "Video" })}
        collapsed={collapsed}
        onCollapse={onCollapse}
        onExpand={onExpand}
        onHide={onHide}
      />
      {!collapsed && (
        <div className="flex-1 min-h-0 bg-black flex items-center justify-center overflow-hidden">
          <div className="w-full h-full max-h-[60vh] flex items-center justify-center">
            {youtubeId && !currentFile && (
              <YouTubePlayer videoId={youtubeId} />
            )}
            {currentFile && <MediaPlayer />}
            {!currentFile && !youtubeId && (
              <span className="text-xs @[260px]/video:text-sm text-gray-500 dark:text-gray-400 px-3">
                {t("player.noMediaLoaded")}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
