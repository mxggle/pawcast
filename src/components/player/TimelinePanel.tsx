import { useShallow } from "zustand/react/shallow";
import { usePlayerStore } from "../../stores/playerStore";
import { WaveformVisualizer } from "../waveform/WaveformVisualizer";
import { TimelineToolbar } from "./TimelineToolbar";
import { TrackHeader } from "./TrackHeader";
import { formatTime } from "../../utils/formatTime";
import { cn } from "../../utils/cn";

interface TimelinePanelProps {
  visible: boolean;
  collapsed: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  className?: string;
}

export const TimelinePanel = ({
  visible,
  collapsed,
  onCollapse,
  onExpand,
  className,
}: TimelinePanelProps) => {
  const { currentTime, duration } = usePlayerStore();
  const { currentFile, currentYouTube } = usePlayerStore(
    useShallow((s) => ({ currentFile: s.currentFile, currentYouTube: s.currentYouTube }))
  );
  const mediaId = currentFile
    ? currentFile.storageId || currentFile.id || `file-${currentFile.name}-${currentFile.size}`
    : currentYouTube
      ? `youtube-${currentYouTube.id}`
      : null;

  if (!visible) return null;

  // Collapsed mode: only toolbar + thin progress bar, strict height
  if (collapsed) {
    return (
      <div className={cn("flex flex-col justify-end @container/timeline bg-white dark:bg-gray-950/40 overflow-hidden", className)}>
        <TimelineToolbar
          collapsed={collapsed}
          onCollapse={onCollapse}
          onExpand={onExpand}
        />
        {/* Thin progress bar */}
        <div className="h-1 bg-gray-100 dark:bg-gray-800 relative cursor-pointer group shrink-0">
          <div
            className="absolute top-0 left-0 h-full bg-primary-500 transition-all"
            style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%" }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-red-500 rounded-full border border-white dark:border-gray-900 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%" }}
          />
        </div>
      </div>
    );
  }

  // Full mode: toolbar + time ruler + waveform
  return (
    <div className={cn("flex flex-col h-full min-h-0 @container/timeline bg-white dark:bg-gray-950/40 rounded-t-xl border border-gray-200 dark:border-white/5 overflow-y-auto overflow-x-hidden overscroll-contain", className)}>
      <TimelineToolbar
        collapsed={collapsed}
        onCollapse={onCollapse}
        onExpand={onExpand}
      />

      <TrackHeader mediaId={mediaId} />

      {/* Time ruler – hides on very narrow panels */}
      <div className="timeline-ruler h-5 shrink-0 px-3 bg-white dark:bg-gray-950/40 border-b border-gray-100 dark:border-white/5 relative select-none min-w-0 overflow-hidden">
        <TimeRuler duration={duration} />
      </div>

      {/* Waveform — fixed height so content never stretches when panel is resized */}
      <div className="timeline-waveform-frame shrink-0 h-[120px] bg-gray-100 dark:bg-[#0b0e1c] relative overflow-hidden">
        <WaveformVisualizer className="mx-auto h-full w-full max-w-[1280px]" />
      </div>
    </div>
  );
};

/* Simple time ruler component */
function TimeRuler({ duration }: { duration: number }) {
  if (duration <= 0) return null;

  const markers = 5;
  return (
    <div className="flex items-end h-full relative min-w-0 overflow-hidden">
      {Array.from({ length: markers }).map((_, i) => {
        const time = (duration / (markers - 1)) * i;
        return (
          <div
            key={i}
            className="absolute bottom-0 text-[9px] text-gray-400 font-mono tabular-nums whitespace-nowrap"
            style={{ left: `${(i / (markers - 1)) * 100}%`, transform: "translateX(-50%)" }}
          >
            {formatTime(time)}
          </div>
        );
      })}
    </div>
  );
}
