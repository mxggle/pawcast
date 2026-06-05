import { useTranslation } from "react-i18next";
import { usePlayerStore } from "../../stores/playerStore";
import { MediaPlayer } from "./MediaPlayer";
import { YouTubePlayer } from "./YouTubePlayer";
import { PanelHeader, CollapsedVerticalStrip } from "./PanelHeader";
import { cn } from "../../utils/cn";

interface MediaPreviewPanelProps {
  visible: boolean;
  collapsed: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  className?: string;
}

export const MediaPreviewPanel = ({
  visible,
  collapsed,
  onCollapse,
  onExpand,
  className,
}: MediaPreviewPanelProps) => {
  const { t } = useTranslation();
  const { currentFile, currentYouTube } = usePlayerStore();

  if (!visible) return null;

  const youtubeId = currentYouTube?.id;
  const title = t("player.video", { defaultValue: "Video" });

  return (
    <div className={cn("flex flex-col min-h-0 min-w-0 @container/video bg-white dark:bg-gray-950/40 overflow-hidden", className)}>
      {collapsed ? (
        <CollapsedVerticalStrip
          title={title}
          onExpand={onExpand}
          expandIcon="right"
        />
      ) : (
        <>
          <PanelHeader
            title={title}
            onCollapse={onCollapse}
            collapseIcon="right"
          />
          <div className="flex-1 min-h-0 min-w-0 bg-black flex items-center justify-center overflow-hidden">
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
        </>
      )}
    </div>
  );
};
