// src/pages/PlayerPage.tsx
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePlayerStore } from "../stores/playerStore";
import { useShallow } from "zustand/react/shallow";
import { MediaPreviewPanel } from "../components/player/MediaPreviewPanel";
import { TimelinePanel } from "../components/player/TimelinePanel";
import { CollapsedHorizontalStrip, CollapsedVerticalStrip } from "../components/player/PanelHeader";
import { PanelTop } from "lucide-react";
import { TranscriptPanel } from "../components/transcript";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { usePlaybackPersistence } from "../hooks/usePlaybackPersistence";
import { usePanelLayout } from "../hooks/usePanelLayout";
import { AppLayout } from "../components/layout/AppLayout";
import { useLayoutSettings } from "../contexts/layoutSettings";
import { Panel, Group, Separator } from "react-resizable-panels";
import { cn } from "../utils/cn";
import { MediaPlayer } from "../components/player/MediaPlayer";
import { PlayerWorkspace } from "../player/PlayerWorkspace";
import { bumpRender } from "../utils/perfMonitor";

export const PlayerPage = () => {
  bumpRender("PlayerPage");
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { layoutSettings, setLayoutSettings } = useLayoutSettings();
  const layoutInitializedForRef = useRef<string | null>(null);

  const { currentFile, currentYouTube, isLoadingMedia } = usePlayerStore(
    useShallow((state) => ({
      currentFile: state.currentFile,
      currentYouTube: state.currentYouTube,
      isLoadingMedia: state.isLoadingMedia,
    }))
  );

  useKeyboardShortcuts();
  usePlaybackPersistence();

  useEffect(() => {
    if (!currentFile && !currentYouTube && !isLoadingMedia) {
      navigate("/");
    }
  }, [currentFile, currentYouTube, isLoadingMedia, navigate]);

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

  const isAudioOnly = currentFile?.type.includes("audio") && !currentFile?.type.includes("video");
  const effectiveVideoVisible = layoutSettings.videoPanelVisible && !isAudioOnly;
  const hasMedia = !!(currentFile || currentYouTube?.id);

  const {
    activeResizeAxis,
    setActiveResizeAxis,
    collapsePanel,
    upperAreaCallbackRef,
    transcriptPanelCallbackRef,
    videoPanelCallbackRef,
    timelinePanelCallbackRef,
    transcriptIsAlone,
    bothUpperCollapsed,
    upperAreaCollapsed,
  } = usePanelLayout({ layoutSettings, setLayoutSettings, effectiveVideoVisible });

  return (
    <AppLayout layoutSettings={layoutSettings} setLayoutSettings={setLayoutSettings} bottomPaddingClassName="pb-0">
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

        {!hasMedia && isLoadingMedia && (
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
            {isLoadingMedia && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/60 dark:bg-gray-900/60">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4" />
                  <p className="text-lg text-gray-600 dark:text-gray-300">{t("common.loading")}</p>
                </div>
              </div>
            )}
            {isAudioOnly && (
              <div className="sr-only" aria-hidden="true">
                <MediaPlayer hiddenMode={true} />
              </div>
            )}
            <Group orientation="vertical" className="flex-1 min-h-0 min-w-0 overflow-hidden">

              {/* Upper area: Transcript + Video */}
              <Panel
                id="player-main-panel"
                defaultSize="70%"
                minSize={15}
                collapsible
                collapsedSize="36px"
                className={cn("min-h-0 min-w-0", !layoutSettings.transcriptPanelVisible && !effectiveVideoVisible && "hidden")}
                panelRef={upperAreaCallbackRef}
              >
                {upperAreaCollapsed ? (
                  bothUpperCollapsed ? (
                    <div className="flex items-center h-9 px-2 gap-2 bg-white dark:bg-gray-950/40 select-none shrink-0">
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <button
                          onClick={() => collapsePanel("transcript", false)}
                          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors shrink-0"
                          title={t("common.expand")}
                        >
                          <PanelTop size={14} />
                        </button>
                        <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider flex-1 truncate px-1">
                          {t("transcript.title")}
                        </span>
                      </div>
                      <div className="w-px h-6 bg-gray-200 dark:bg-gray-800 shrink-0" />
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <button
                          onClick={() => collapsePanel("video", false)}
                          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors shrink-0"
                          title={t("common.expand")}
                        >
                          <PanelTop size={14} />
                        </button>
                        <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider flex-1 truncate px-1">
                          {t("player.video", { defaultValue: "Video" })}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <CollapsedHorizontalStrip
                      title={
                        layoutSettings.transcriptPanelCollapsed && transcriptIsAlone
                          ? t("transcript.title")
                          : t("player.video", { defaultValue: "Video" })
                      }
                      onExpand={() =>
                        collapsePanel(
                          layoutSettings.transcriptPanelCollapsed && transcriptIsAlone ? "transcript" : "video",
                          false
                        )
                      }
                      className="bg-white dark:bg-gray-950/40"
                      expandIcon="top"
                    />
                  )
                ) : (
                  <Group id="player-upper-layout" orientation="horizontal" className="h-full min-h-0 min-w-0">
                    {/* Transcript Panel */}
                    {layoutSettings.transcriptPanelVisible && (
                      <Panel
                        id="player-transcript-panel"
                        defaultSize="60%"
                        minSize={15}
                        collapsible
                        collapsedSize="48px"
                        className="min-w-0 min-h-0"
                        panelRef={transcriptPanelCallbackRef}
                      >
                        <div className="flex flex-col h-full min-h-0 min-w-0 bg-white dark:bg-gray-950/40 overflow-hidden">
                          {layoutSettings.transcriptPanelCollapsed ? (
                            <CollapsedVerticalStrip
                              title={t("transcript.title")}
                              onExpand={() => collapsePanel("transcript", false)}
                              expandIcon="left"
                            />
                          ) : (
                            <div className="flex-1 min-h-0 min-w-0 overflow-hidden overflow-x-hidden">
                              <TranscriptPanel onCollapse={() => collapsePanel("transcript", true)} />
                            </div>
                          )}
                        </div>
                      </Panel>
                    )}

                    {/* Horizontal resize handle (hidden when both panels are collapsed strips) */}
                    {layoutSettings.transcriptPanelVisible && effectiveVideoVisible &&
                      !layoutSettings.transcriptPanelCollapsed && !layoutSettings.videoPanelCollapsed && (
                        <Separator
                          id="player-transcript-video-resize"
                          className="w-px bg-gray-200 dark:bg-gray-800 hover:bg-primary-400 dark:hover:bg-primary-600 transition-colors cursor-col-resize flex items-center justify-center"
                          onPointerDownCapture={() => setActiveResizeAxis("horizontal")}
                        >
                          <div className="w-px h-6 bg-gray-400 dark:bg-gray-600 rounded-full pointer-events-none" />
                        </Separator>
                    )}

                    {/* Video Panel */}
                    {effectiveVideoVisible && (
                      <Panel
                        id="player-video-panel"
                        defaultSize="40%"
                        minSize={15}
                        collapsible
                        collapsedSize="48px"
                        className="min-w-0 min-h-0"
                        panelRef={videoPanelCallbackRef}
                      >
                        <MediaPreviewPanel
                          visible={true}
                          collapsed={layoutSettings.videoPanelCollapsed}
                          onCollapse={() => collapsePanel("video", true)}
                          onExpand={() => collapsePanel("video", false)}
                          className="h-full overflow-hidden"
                        />
                      </Panel>
                    )}
                  </Group>
                )}
              </Panel>

              {/* Vertical resize handle */}
              {layoutSettings.timelinePanelVisible && !layoutSettings.timelinePanelCollapsed &&
                (layoutSettings.transcriptPanelVisible || effectiveVideoVisible) && !upperAreaCollapsed && (
                <Separator
                  id="player-main-timeline-resize"
                  className="h-px bg-gray-200 dark:bg-gray-800 hover:bg-primary-400 dark:hover:bg-primary-600 transition-colors cursor-row-resize flex items-center justify-center"
                  onPointerDownCapture={() => setActiveResizeAxis("vertical")}
                >
                  <div className="w-6 h-px bg-gray-400 dark:bg-gray-600 rounded-full pointer-events-none" />
                </Separator>
              )}

              {/* Bottom: Timeline Panel */}
              {layoutSettings.timelinePanelVisible && (
                <Panel
                  id="player-timeline-panel"
                  defaultSize="30%"
                  minSize={10}
                  collapsible
                  collapsedSize="48px"
                  className="min-h-0 min-w-0 overflow-hidden"
                  panelRef={timelinePanelCallbackRef}
                >
                  <TimelinePanel
                    visible={true}
                    collapsed={layoutSettings.timelinePanelCollapsed}
                    onCollapse={() => collapsePanel("timeline", true)}
                    onExpand={() => collapsePanel("timeline", false)}
                    className="h-full min-h-0"
                  />
                </Panel>
              )}

            </Group>
          </PlayerWorkspace>
        )}
      </div>
    </AppLayout>
  );
};
