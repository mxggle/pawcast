// src/pages/PlayerPage.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePlayerStore } from "../stores/playerStore";
import { useShallow } from "zustand/react/shallow";
import { MediaPreviewPanel } from "../components/player/MediaPreviewPanel";
import { TimelinePanel } from "../components/player/TimelinePanel";
import { PanelHeader } from "../components/player/PanelHeader";
import { isElectron } from "../utils/platform";
import { MediaHistory } from "../components/web/MediaHistory";
import { TranscriptPanel } from "../components/transcript";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { usePlaybackPersistence } from "../hooks/usePlaybackPersistence";
import { AppLayout } from "../components/layout/AppLayout";
import { useLayoutSettings } from "../contexts/layoutSettings";
import { Panel, Group, Separator } from "react-resizable-panels";
import { cn } from "../utils/cn";
import { MediaPlayer } from "../components/player/MediaPlayer";
import { PlayerWorkspace } from "../player/PlayerWorkspace";
import { PerfOverlay } from "../components/dev/PerfOverlay";
import { bumpRender } from "../utils/perfMonitor";

export const PlayerPage = () => {
  bumpRender("PlayerPage");
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { layoutSettings, setLayoutSettings } = useLayoutSettings();
  const layoutInitializedForRef = useRef<string | null>(null);
  const [activeResizeAxis, setActiveResizeAxis] = useState<"horizontal" | "vertical" | null>(null);

  const { currentFile, currentYouTube, isLoadingMedia } = usePlayerStore(
    useShallow((state) => ({
      currentFile: state.currentFile,
      currentYouTube: state.currentYouTube,
      isLoadingMedia: state.isLoadingMedia,
    }))
  );

  useKeyboardShortcuts();
  usePlaybackPersistence();

  // Redirect to home if no media
  useEffect(() => {
    if (!currentFile && !currentYouTube && !isLoadingMedia) {
      navigate("/");
    }
  }, [currentFile, currentYouTube, isLoadingMedia, navigate]);

  // Auto-default player visibility based on media type
  useEffect(() => {
    if (currentFile) {
      const mediaKey = currentFile.storageId || currentFile.id || currentFile.name;
      if (layoutInitializedForRef.current !== mediaKey) {
        layoutInitializedForRef.current = mediaKey;
        const isAudio = currentFile.type.includes("audio");
        setLayoutSettings((prev) => ({ ...prev, showPlayer: !isAudio }));
      }
    }
  }, [currentFile, setLayoutSettings]);

  useEffect(() => {
    if (currentYouTube?.id && !currentFile) {
      setLayoutSettings((prev) => ({ ...prev, showPlayer: true }));
    }
  }, [currentYouTube, currentFile, setLayoutSettings]);

  useEffect(() => {
    if (!activeResizeAxis) return;

    const stopResizing = () => setActiveResizeAxis(null);

    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);
    window.addEventListener("blur", stopResizing);

    return () => {
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
      window.removeEventListener("blur", stopResizing);
    };
  }, [activeResizeAxis]);

  // Auto-hide video panel for audio files
  const isAudioOnly = currentFile?.type.includes("audio") && !currentFile?.type.includes("video");
  const effectiveVideoVisible = layoutSettings.videoPanelVisible && !isAudioOnly;

  const hasMedia = !!(currentFile || currentYouTube?.id);

  // Panel toggle helpers
  const togglePanel = (panel: "transcript" | "video" | "timeline") => {
    const key = `${panel}PanelVisible` as const;
    setLayoutSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const collapsePanel = (panel: "transcript" | "video" | "timeline", collapsed: boolean) => {
    const key = `${panel}PanelCollapsed` as const;
    setLayoutSettings((prev) => ({ ...prev, [key]: collapsed }));
  };

  return (
    <AppLayout layoutSettings={layoutSettings} setLayoutSettings={setLayoutSettings} bottomPaddingClassName="pb-0">
      <PerfOverlay />
      <div className="relative flex flex-1 min-h-0 flex-col h-full overflow-hidden overflow-x-hidden">
        {activeResizeAxis && (
          <div
            className={cn(
              "absolute inset-0 z-[80] bg-transparent",
              activeResizeAxis === "horizontal" ? "cursor-col-resize" : "cursor-row-resize"
            )}
            aria-hidden="true"
          />
        )}

        {/* Loading / no media states */}
        {isLoadingMedia && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4" />
              <p className="text-lg text-gray-600 dark:text-gray-300">{t("common.loading")}</p>
            </div>
          </div>
        )}
        {!currentFile && !currentYouTube && !isLoadingMedia && (
          <div className="flex items-center justify-center py-12">
            <p className="text-lg text-gray-600 dark:text-gray-300">{t("player.noMediaLoaded")}</p>
          </div>
        )}

        {hasMedia && (
          <PlayerWorkspace>
            {/* Audio-only files need a hidden MediaPlayer since video panel is hidden */}
            {isAudioOnly && (
              <div className="sr-only" aria-hidden="true">
                <MediaPlayer hiddenMode={true} />
              </div>
            )}
            <Group orientation="vertical" className="flex-1 min-h-0 overflow-hidden">
              {/* Upper area: Transcript + Video */}
              <Panel
                id="player-main-panel"
                defaultSize="70%"
                minSize="20%"
                maxSize="88%"
                collapsible
                collapsedSize="0%"
                className={cn(!layoutSettings.transcriptPanelVisible && !effectiveVideoVisible && "hidden")}
              >
              <Group id="player-upper-layout" orientation="horizontal" className="h-full">
                {/* Transcript Panel */}
                {layoutSettings.transcriptPanelVisible && (
                  <Panel
                    id="player-transcript-panel"
                    defaultSize="60%"
                    minSize="25%"
                    maxSize="80%"
                    collapsible
                    collapsedSize="5%"
                    className="min-w-0"
                  >
                    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-gray-950/40 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden overflow-x-hidden">
                      <PanelHeader
                        title={t("transcript.title")}
                        collapsed={layoutSettings.transcriptPanelCollapsed}
                        onCollapse={() => collapsePanel("transcript", true)}
                        onExpand={() => collapsePanel("transcript", false)}
                        onHide={() => togglePanel("transcript")}
                      />
                      {!layoutSettings.transcriptPanelCollapsed && (
                        <div className="flex-1 min-h-0 overflow-hidden overflow-x-hidden">
                          <TranscriptPanel />
                        </div>
                      )}
                    </div>
                  </Panel>
                )}

                {/* Horizontal resize handle */}
                {layoutSettings.transcriptPanelVisible && effectiveVideoVisible && (
                  <Separator
                    id="player-transcript-video-resize"
                    className="w-3 bg-gray-200 dark:bg-gray-700 hover:bg-primary-400 dark:hover:bg-primary-600 transition-colors cursor-col-resize flex items-center justify-center mx-[-4px]"
                    onPointerDownCapture={() => setActiveResizeAxis("horizontal")}
                  >
                    <div className="w-0.5 h-6 bg-gray-400 dark:bg-gray-500 rounded-full pointer-events-none" />
                  </Separator>
                )}

                {/* Video Panel */}
                {effectiveVideoVisible && (
                  <Panel
                    id="player-video-panel"
                    defaultSize="40%"
                    minSize="20%"
                    maxSize="75%"
                    collapsible
                    collapsedSize="5%"
                    className="min-w-0"
                  >
                    <MediaPreviewPanel
                      visible={true}
                      collapsed={layoutSettings.videoPanelCollapsed}
                      onCollapse={() => collapsePanel("video", true)}
                      onExpand={() => collapsePanel("video", false)}
                      onHide={() => togglePanel("video")}
                      className="h-full overflow-hidden"
                    />
                  </Panel>
                )}
              </Group>
            </Panel>

            {/* Vertical resize handle */}
            {layoutSettings.timelinePanelVisible && (layoutSettings.transcriptPanelVisible || effectiveVideoVisible) && (
              <Separator
                id="player-main-timeline-resize"
                className="h-3 bg-gray-200 dark:bg-gray-700 hover:bg-primary-400 dark:hover:bg-primary-600 transition-colors cursor-row-resize flex items-center justify-center my-[-2px]"
                onPointerDownCapture={() => setActiveResizeAxis("vertical")}
              >
                <div className="w-6 h-0.5 bg-gray-400 dark:bg-gray-500 rounded-full pointer-events-none" />
              </Separator>
            )}

            {/* Bottom: Timeline Panel */}
            {layoutSettings.timelinePanelVisible && (
              <Panel
                id="player-timeline-panel"
                defaultSize="30%"
                minSize="12%"
                maxSize="38%"
                collapsible
                collapsedSize="6%"
                className="min-h-0 max-h-[380px] overflow-hidden"
              >
                <TimelinePanel
                  visible={true}
                  collapsed={layoutSettings.timelinePanelCollapsed}
                  onCollapse={() => collapsePanel("timeline", true)}
                  onExpand={() => collapsePanel("timeline", false)}
                  onHide={() => togglePanel("timeline")}
                  className="h-full"
                />
              </Panel>
            )}
          </Group>
          </PlayerWorkspace>
        )}

        {/* Media History – web only */}
        {!isElectron() && <MediaHistory />}
      </div>
    </AppLayout>
  );
};
