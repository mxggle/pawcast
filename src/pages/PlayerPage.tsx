// src/pages/PlayerPage.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePlayerStore } from "../stores/playerStore";
import { useShallow } from "zustand/react/shallow";
import { MediaPreviewPanel } from "../components/player/MediaPreviewPanel";
import { TimelinePanel } from "../components/player/TimelinePanel";
import { PanelHeader, CollapsedHorizontalStrip, CollapsedVerticalStrip } from "../components/player/PanelHeader";
import { PanelTop } from "lucide-react";
import { TranscriptPanel } from "../components/transcript";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { usePlaybackPersistence } from "../hooks/usePlaybackPersistence";
import { AppLayout } from "../components/layout/AppLayout";
import { useLayoutSettings } from "../contexts/layoutSettings";
import { Panel, Group, Separator, PanelImperativeHandle, usePanelCallbackRef } from "react-resizable-panels";
import { cn } from "../utils/cn";
import { MediaPlayer } from "../components/player/MediaPlayer";
import { PlayerWorkspace } from "../player/PlayerWorkspace";
import { bumpRender } from "../utils/perfMonitor";

type PanelKey = "transcript" | "video" | "timeline" | "outer";
const DEFAULT_SIZES: Record<PanelKey, number> = { transcript: 60, video: 40, timeline: 30, outer: 70 };
const MIN_RESTORE_SIZE: Record<PanelKey, number> = { transcript: 25, video: 20, timeline: 15, outer: 30 };

export const PlayerPage = () => {
  bumpRender("PlayerPage");
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { layoutSettings, setLayoutSettings } = useLayoutSettings();
  const layoutInitializedForRef = useRef<string | null>(null);
  const [activeResizeAxis, setActiveResizeAxis] = useState<"horizontal" | "vertical" | null>(null);

  // Panel imperative handles for programmatic collapse/expand
  const [upperAreaHandle, upperAreaCallbackRef] = usePanelCallbackRef();
  const [transcriptPanelHandle, transcriptPanelCallbackRef] = usePanelCallbackRef();
  const [videoPanelHandle, videoPanelCallbackRef] = usePanelCallbackRef();
  const [timelinePanelHandle, timelinePanelCallbackRef] = usePanelCallbackRef();

  // Sizes saved just before each panel collapses — used to restore to pre-collapse position
  const savedSizesRef = useRef({ ...DEFAULT_SIZES });
  const isOuterCollapsedRef = useRef(false);

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

  const isAudioOnly = currentFile?.type.includes("audio") && !currentFile?.type.includes("video");
  const effectiveVideoVisible = layoutSettings.videoPanelVisible && !isAudioOnly;
  const hasMedia = !!(currentFile || currentYouTube?.id);

  // When only one panel occupies the upper area, collapse the outer vertical panel
  // so the freed vertical space goes to the timeline (instead of leaving a blank area).
  const transcriptIsAlone = layoutSettings.transcriptPanelVisible && !effectiveVideoVisible;
  const videoIsAlone = effectiveVideoVisible && !layoutSettings.transcriptPanelVisible;
  const bothUpperCollapsed =
    layoutSettings.transcriptPanelVisible &&
    effectiveVideoVisible &&
    layoutSettings.transcriptPanelCollapsed &&
    layoutSettings.videoPanelCollapsed;
  const upperAreaCollapsed =
    (layoutSettings.transcriptPanelCollapsed && transcriptIsAlone) ||
    (layoutSettings.videoPanelCollapsed && videoIsAlone) ||
    bothUpperCollapsed;


  const collapsePanel = (panel: "transcript" | "video" | "timeline", collapsed: boolean) => {
    setLayoutSettings((prev) => ({ ...prev, [`${panel}PanelCollapsed`]: collapsed }));

    const innerHandles: Record<typeof panel, PanelImperativeHandle | null> = {
      transcript: transcriptPanelHandle,
      video: videoPanelHandle,
      timeline: timelinePanelHandle,
    };

    if (collapsed) {
      // Capture current size before collapsing for accurate restoration
      const currentSize = innerHandles[panel]?.getSize().asPercentage;
      if (currentSize !== undefined && currentSize > 5) {
        savedSizesRef.current = { ...savedSizesRef.current, [panel]: currentSize };
      }

      const shouldCollapseOuter =
        (panel === "transcript" && transcriptIsAlone) ||
        (panel === "video" && videoIsAlone) ||
        bothUpperCollapsed;

      if (shouldCollapseOuter) {
        // Alone in the upper area (or both collapsed): collapse the outer vertical panel so the timeline can grow
        const outerSize = upperAreaHandle?.getSize().asPercentage;
        if (outerSize !== undefined && outerSize > 5) {
          savedSizesRef.current = { ...savedSizesRef.current, outer: outerSize };
        }
        upperAreaHandle?.collapse();
      } else {
        innerHandles[panel]?.collapse();
      }
    } else {
      // Restore to pre-collapse size (not just expand(), which may restore to a too-small size)
      const shouldExpandOuter =
        (panel === "transcript" && transcriptIsAlone) ||
        (panel === "video" && videoIsAlone) ||
        bothUpperCollapsed;

      if (shouldExpandOuter) {
        upperAreaHandle?.resize(`${Math.max(savedSizesRef.current.outer, MIN_RESTORE_SIZE.outer)}%`);
      }

      // Only resize inner panel if it's actually mounted (Group may be unmounted when upper area is collapsed)
      if (!upperAreaCollapsed && innerHandles[panel]) {
        const target = Math.max(savedSizesRef.current[panel], MIN_RESTORE_SIZE[panel]);
        innerHandles[panel]?.resize(`${target}%`);
      }
    }
  };

  // Restore collapsed state when panels remount (e.g. after navigation)
  useEffect(() => {
    if (!upperAreaHandle) return;
    if (upperAreaCollapsed && !isOuterCollapsedRef.current) {
      upperAreaHandle.collapse();
      isOuterCollapsedRef.current = true;
    } else if (!upperAreaCollapsed && isOuterCollapsedRef.current) {
      const target = Math.max(savedSizesRef.current.outer, MIN_RESTORE_SIZE.outer);
      upperAreaHandle.resize(`${target}%`);
      isOuterCollapsedRef.current = false;
    }
  }, [upperAreaHandle, upperAreaCollapsed]);

  useEffect(() => {
    if (upperAreaCollapsed) return;
    if (!transcriptPanelHandle) return;
    if (layoutSettings.transcriptPanelCollapsed && !transcriptIsAlone) {
      transcriptPanelHandle.collapse();
    } else if (!layoutSettings.transcriptPanelCollapsed && !transcriptIsAlone) {
      const target = Math.max(savedSizesRef.current.transcript, MIN_RESTORE_SIZE.transcript);
      transcriptPanelHandle.resize(`${target}%`);
    }
  }, [transcriptPanelHandle, layoutSettings.transcriptPanelCollapsed, transcriptIsAlone, upperAreaCollapsed]);

  useEffect(() => {
    if (upperAreaCollapsed) return;
    if (!videoPanelHandle) return;
    if (layoutSettings.videoPanelCollapsed && !videoIsAlone) {
      videoPanelHandle.collapse();
    } else if (!layoutSettings.videoPanelCollapsed && !videoIsAlone) {
      const target = Math.max(savedSizesRef.current.video, MIN_RESTORE_SIZE.video);
      videoPanelHandle.resize(`${target}%`);
    }
  }, [videoPanelHandle, layoutSettings.videoPanelCollapsed, videoIsAlone, upperAreaCollapsed]);

  useEffect(() => {
    if (!timelinePanelHandle) return;
    if (layoutSettings.timelinePanelCollapsed) {
      timelinePanelHandle.collapse();
    } else {
      const target = Math.max(savedSizesRef.current.timeline, MIN_RESTORE_SIZE.timeline);
      timelinePanelHandle.resize(`${target}%`);
    }
  }, [timelinePanelHandle, layoutSettings.timelinePanelCollapsed]);

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
                collapsedSize={5}
                onResize={(size) => { savedSizesRef.current = { ...savedSizesRef.current, outer: size.asPercentage }; }}
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
                        collapsedSize={5}
                        onResize={(size) => { savedSizesRef.current = { ...savedSizesRef.current, transcript: size.asPercentage }; }}
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
                            <>
                              <PanelHeader
                                title={t("transcript.title")}
                                onCollapse={() => collapsePanel("transcript", true)}
                                collapseIcon="left"
                              />
                              <div className="flex-1 min-h-0 min-w-0 overflow-hidden overflow-x-hidden">
                                <TranscriptPanel />
                              </div>
                            </>
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
                        collapsedSize={5}
                        onResize={(size) => { savedSizesRef.current = { ...savedSizesRef.current, video: size.asPercentage }; }}
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
                  collapsedSize={5}
                  onResize={(size) => { savedSizesRef.current = { ...savedSizesRef.current, timeline: size.asPercentage }; }}
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
