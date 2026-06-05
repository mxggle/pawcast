import { Volume1, Volume2, VolumeX } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";
import { Slider } from "../ui/slider";

interface Props {
  /** Current track volume, 0–1. */
  volume: number;
  /** Called with the new volume (0–1). */
  onVolumeChange: (volume: number) => void;
  /** Toggle mute (typically volume 0 ↔ previous). */
  onToggleMute: () => void;
  /** Accessible label / tooltip, e.g. "Original volume". */
  label: string;
}

/**
 * Compact per-track volume knob: a speaker button that opens a popover with a
 * slider. Purely presentational — the parent owns the volume value and how
 * mute is implemented (the Original and Shadowing tracks have independent
 * volume state, so each renders its own instance).
 */
export const TrackVolumeControl = ({ volume, onVolumeChange, onToggleMute, label }: Props) => {
  const muted = volume === 0;
  const Icon = muted ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="timeline-secondary-action size-6 flex items-center justify-center rounded text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5"
          title={label}
          aria-label={label}
        >
          <Icon size={13} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-3" side="top" sideOffset={8}>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleMute}
            className="text-gray-500 dark:text-gray-400 shrink-0 hover:text-gray-700 dark:hover:text-gray-200"
            aria-label={label}
          >
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <Slider
            value={[volume]}
            min={0}
            max={1}
            step={0.01}
            onValueChange={(values) => onVolumeChange(values[0])}
            className="flex-1"
            aria-label={label}
          />
          <span className="text-[10px] text-gray-400 font-mono tabular-nums w-7 text-right">
            {Math.round(volume * 100)}
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
};
