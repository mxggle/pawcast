import { useEffect, useRef, useState } from "react";
import { PanelImperativeHandle, usePanelCallbackRef } from "react-resizable-panels";
import type { LayoutSettings } from "../stores/layoutStore";

type PanelKey = "transcript" | "video" | "timeline" | "outer";
export type CollapsiblePanel = "transcript" | "video" | "timeline";

const DEFAULT_SIZES: Record<PanelKey, number> = { transcript: 60, video: 40, timeline: 30, outer: 70 };
// Minimum size at which the panel's internal UI does not deform.
// Used as the floor when restoring on expand; siblings shrink to honor this only if they still meet their own minSize.
const MIN_SIZE: Record<PanelKey, number> = { transcript: 25, video: 22, timeline: 12, outer: 30 };

interface UsePanelLayoutArgs {
  layoutSettings: LayoutSettings;
  setLayoutSettings: (updater: (prev: LayoutSettings) => LayoutSettings) => void;
  /** Video panel is hidden for audio-only media regardless of settings. */
  effectiveVideoVisible: boolean;
}

/**
 * Owns the free-form player panel choreography: collapse/expand with
 * size restoration, the outer upper-area collapse when it is effectively
 * empty, and the active-resize overlay state.
 */
export const usePanelLayout = ({
  layoutSettings,
  setLayoutSettings,
  effectiveVideoVisible,
}: UsePanelLayoutArgs) => {
  const [activeResizeAxis, setActiveResizeAxis] = useState<"horizontal" | "vertical" | null>(null);

  // Panel imperative handles for programmatic collapse/expand
  const [upperAreaHandle, upperAreaCallbackRef] = usePanelCallbackRef();
  const [transcriptPanelHandle, transcriptPanelCallbackRef] = usePanelCallbackRef();
  const [videoPanelHandle, videoPanelCallbackRef] = usePanelCallbackRef();
  const [timelinePanelHandle, timelinePanelCallbackRef] = usePanelCallbackRef();

  // Sizes saved just before each panel collapses — used to restore on expand.
  // Reads come from handle.getSize() at collapse time (no need to track during drag).
  const savedSizesRef = useRef({ ...DEFAULT_SIZES });
  const isOuterCollapsedRef = useRef(false);

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

  const collapsePanel = (panel: CollapsiblePanel, collapsed: boolean) => {
    if (collapsed) {
      // Capture current sizes BEFORE the state update so the imperative useEffects
      // (which run after re-render) can restore them later.
      const handles: Record<CollapsiblePanel, PanelImperativeHandle | null> = {
        transcript: transcriptPanelHandle,
        video: videoPanelHandle,
        timeline: timelinePanelHandle,
      };
      const cur = handles[panel]?.getSize().asPercentage;
      if (cur !== undefined && cur > MIN_SIZE[panel]) {
        savedSizesRef.current = { ...savedSizesRef.current, [panel]: cur };
      }
      // Always snapshot the outer size when it's expanded — covers every "alone in upper" case
      // (collapsing transcript when video is hidden, collapsing video when transcript is hidden,
      // or collapsing the second of two upper panels).
      const outerCur = upperAreaHandle?.getSize().asPercentage;
      if (outerCur !== undefined && outerCur > MIN_SIZE.outer) {
        savedSizesRef.current = { ...savedSizesRef.current, outer: outerCur };
      }
    }
    setLayoutSettings((prev) => ({ ...prev, [`${panel}PanelCollapsed`]: collapsed }));
  };

  // Outer (upper area) collapse — driven by the combined visibility/collapsed state.
  // Fires when a transcript/video collapse leaves the upper area effectively empty,
  // and on remount after navigation.
  useEffect(() => {
    if (!upperAreaHandle) return;
    if (upperAreaCollapsed && !isOuterCollapsedRef.current) {
      upperAreaHandle.collapse();
      isOuterCollapsedRef.current = true;
    } else if (!upperAreaCollapsed && isOuterCollapsedRef.current) {
      const target = Math.max(savedSizesRef.current.outer, MIN_SIZE.outer);
      upperAreaHandle.resize(`${target}%`);
      isOuterCollapsedRef.current = false;
    }
  }, [upperAreaHandle, upperAreaCollapsed]);

  // Transcript collapse — skipped when transcript is the only thing in the upper area
  // (the outer effect handles that case by collapsing the whole upper panel).
  useEffect(() => {
    if (!transcriptPanelHandle) return;
    if (transcriptIsAlone) return;
    if (layoutSettings.transcriptPanelCollapsed) {
      transcriptPanelHandle.collapse();
    } else {
      const target = Math.max(savedSizesRef.current.transcript, MIN_SIZE.transcript);
      transcriptPanelHandle.resize(`${target}%`);
    }
  }, [transcriptPanelHandle, layoutSettings.transcriptPanelCollapsed, transcriptIsAlone]);

  // Video collapse — same skip rule as transcript.
  useEffect(() => {
    if (!videoPanelHandle) return;
    if (videoIsAlone) return;
    if (layoutSettings.videoPanelCollapsed) {
      videoPanelHandle.collapse();
    } else {
      const target = Math.max(savedSizesRef.current.video, MIN_SIZE.video);
      videoPanelHandle.resize(`${target}%`);
    }
  }, [videoPanelHandle, layoutSettings.videoPanelCollapsed, videoIsAlone]);

  // Timeline collapse — react-resizable-panels auto-grows the upper area when timeline collapses,
  // so no manual resize("100%") is needed. Removing that call was the key fix for the empty-area bug.
  useEffect(() => {
    if (!timelinePanelHandle) return;
    if (layoutSettings.timelinePanelCollapsed) {
      timelinePanelHandle.collapse();
    } else {
      const target = Math.max(savedSizesRef.current.timeline, MIN_SIZE.timeline);
      timelinePanelHandle.resize(`${target}%`);
    }
  }, [timelinePanelHandle, layoutSettings.timelinePanelCollapsed]);

  // When timeline is hidden entirely (visibility off, not just collapsed),
  // explicitly fill the upper area — the lib needs a nudge in this case because
  // the timeline Panel is unmounted rather than at collapsedSize.
  useEffect(() => {
    if (!upperAreaHandle || layoutSettings.timelinePanelVisible) return;
    upperAreaHandle.resize("100%");
  }, [upperAreaHandle, layoutSettings.timelinePanelVisible]);

  return {
    activeResizeAxis,
    setActiveResizeAxis,
    collapsePanel,
    upperAreaCallbackRef,
    transcriptPanelCallbackRef,
    videoPanelCallbackRef,
    timelinePanelCallbackRef,
    transcriptIsAlone,
    videoIsAlone,
    bothUpperCollapsed,
    upperAreaCollapsed,
  };
};
