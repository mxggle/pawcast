import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { ChevronDown, Mic, Radio, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";
import { toast } from "react-hot-toast";
import { useSettingsStore } from "../../stores/settingsStore";
import { useShadowingStore } from "../../stores/shadowingStore";
import { usePlayerStore } from "../../stores/playerStore";
import { formatTime } from "../../utils/formatTime";
import { cn } from "../../utils/cn";

interface Props {
  /** Resolved media id used to scope shadowing segments. Null means no media. */
  mediaId: string | null;
}

export const TrackHeader = ({ mediaId }: Props) => {
  const { t } = useTranslation();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const { duration, setCurrentTime, setIsPlaying } = usePlayerStore(
    useShallow((s) => ({
      duration: s.duration,
      setCurrentTime: s.setCurrentTime,
      setIsPlaying: s.setIsPlaying,
    }))
  );

  const { waveformZoom, setWaveformZoom } = useSettingsStore();

  const {
    isShadowingMode,
    setShadowingMode,
    isRecording,
    recordingSegmentId,
    setRecordingSegmentId,
    deleteAllSegments,
  } = useShadowingStore(
    useShallow((s) => ({
      isShadowingMode: s.isShadowingMode,
      setShadowingMode: s.setShadowingMode,
      isRecording: s.isRecording,
      recordingSegmentId: s.recordingSegmentId,
      setRecordingSegmentId: s.setRecordingSegmentId,
      deleteAllSegments: s.deleteAllSegments,
    }))
  );

  const segments = useShadowingStore((s) =>
    mediaId ? s.sessions[mediaId]?.segments ?? [] : []
  );

  const expanded = isShadowingMode || segments.length > 0 || isRecording;

  const zoomIn = () => setWaveformZoom(Math.min(waveformZoom * 1.25, 50));
  const zoomOut = () => setWaveformZoom(Math.max(waveformZoom / 1.25, 1));

  const onSelectTake = (startTime: number) => {
    setCurrentTime(startTime);
    setIsPlaying(true);
  };

  const onClearAll = () => {
    if (!mediaId) return;
    deleteAllSegments(mediaId);
    toast.success(t("shadowing.success.trackDeleted"));
    setIsConfirmingDelete(false);
  };

  return (
    <div
      className={cn(
        "flex flex-col select-none border-b border-gray-200 dark:border-white/5",
        "bg-gray-100/70 dark:bg-gray-900/60 backdrop-blur-sm"
      )}
    >
      {/* Original row */}
      <div className="flex items-center gap-2 px-3 h-7 min-h-[28px]">
        <span
          className="inline-block w-2 h-2 rounded-full bg-primary-500 ring-2 ring-primary-500/30"
          aria-hidden
        />
        <span className="text-[11px] font-semibold tracking-wide text-gray-700 dark:text-gray-200">
          {t("track.original")}
        </span>
        {duration > 0 && (
          <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono tabular-nums">
            {t("track.totalDuration", { time: formatTime(duration) })}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {!expanded && mediaId && (
            <button
              onClick={() => setShadowingMode(true)}
              className="timeline-secondary-action px-2 py-0.5 rounded text-[11px] font-medium text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5"
              title={t("shadowing.enable")}
            >
              <Mic size={11} className="inline mr-1" />
              {t("track.shadowing")}
            </button>
          )}
          <button
            onClick={zoomOut}
            className="timeline-secondary-action p-1 rounded text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5"
            title={t("waveform.zoomOut")}
          >
            <ZoomOut size={12} />
          </button>
          <button
            onClick={zoomIn}
            className="timeline-secondary-action p-1 rounded text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5"
            title={t("waveform.zoomIn")}
          >
            <ZoomIn size={12} />
          </button>
        </div>
      </div>

      {/* Shadowing row (only when expanded) */}
      {expanded && mediaId && (
        <div className="flex items-center gap-2 px-3 h-7 min-h-[28px] border-t border-gray-200/60 dark:border-white/5">
          <span
            className={cn(
              "inline-block w-2 h-2 rounded-full",
              isRecording
                ? "bg-error-500 animate-pulse ring-2 ring-error-500/40"
                : "bg-success-500 ring-2 ring-success-500/30"
            )}
            aria-hidden
          />
          <span className="text-[11px] font-semibold tracking-wide text-gray-700 dark:text-gray-200">
            {t("track.shadowing")}
          </span>

          {segments.length > 0 && !isRecording && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="timeline-secondary-action px-1.5 py-0.5 rounded text-[10px] font-mono text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-0.5"
                  title={t("shadowing.takes", { defaultValue: "Takes" })}
                >
                  {t("shadowing.takeOf", { n: segments.length, total: segments.length })}
                  <ChevronDown size={10} />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="start" sideOffset={8} className="!w-auto !p-1 min-w-[200px]">
                {segments.map((seg, idx) => (
                  <button
                    key={seg.id}
                    onClick={() => onSelectTake(seg.startTime)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-gray-100 dark:hover:bg-white/5 rounded"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: ["#22c55e", "#34d399", "#6ee7b7", "#059669", "#10b981", "#047857"][idx % 6],
                      }}
                    />
                    <span className="flex-1 text-left text-gray-700 dark:text-gray-200">
                      {t("shadowing.take", { defaultValue: "Take" })} {idx + 1}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono tabular-nums">
                      {formatTime(seg.startTime)}–{formatTime(seg.startTime + seg.duration)}
                    </span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )}

          {isRecording && (
            <span className="text-[10px] text-error-600 dark:text-error-400 font-mono tabular-nums">
              {t("shadowing.recordingNow", { defaultValue: "Recording…" })}
            </span>
          )}

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setShadowingMode(!isShadowingMode)}
              aria-pressed={isShadowingMode}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1",
                isRecording
                  ? "bg-error-500 text-white hover:bg-error-600"
                  : isShadowingMode
                    ? "bg-error-50 text-error-600 dark:bg-error-900/30 dark:text-error-300 hover:bg-error-100 dark:hover:bg-error-900/40"
                    : "text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5"
              )}
              title={isShadowingMode ? t("shadowing.disable") : t("shadowing.enable")}
            >
              {isRecording ? <Radio size={11} className="animate-pulse" /> : <Mic size={11} />}
              <span>{isRecording ? "Stop" : "REC"}</span>
            </button>
            <button
              onClick={() => setRecordingSegmentId(recordingSegmentId ? undefined : "sentence-mode")}
              className={cn(
                "p-1 rounded text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5",
                recordingSegmentId && "text-info-600 dark:text-info-400 bg-info-500/10"
              )}
              title={
                recordingSegmentId
                  ? t("shadowing.disableSentenceMode", { defaultValue: "Disable Sentence Mode" })
                  : t("shadowing.enableSentenceMode", { defaultValue: "Record per Sentence" })
              }
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 7 4 4 7 4" />
                <polyline points="20 17 20 20 17 20" />
                <polyline points="7 20 4 20 4 17" />
                <polyline points="17 4 20 4 20 7" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </button>
            {segments.length > 0 && (
              !isConfirmingDelete ? (
                <button
                  onClick={() => setIsConfirmingDelete(true)}
                  className="p-1 rounded text-gray-500 dark:text-gray-400 hover:text-error-500 hover:bg-black/5 dark:hover:bg-white/5"
                  title={t("shadowing.deleteTrack", { defaultValue: "Delete Shadow Track" })}
                >
                  <Trash2 size={12} />
                </button>
              ) : (
                <button
                  onClick={onClearAll}
                  className="px-1.5 py-0.5 rounded bg-error-500 text-white text-[10px] font-bold hover:bg-error-600"
                  title={t("common.remove")}
                >
                  ✓
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};
