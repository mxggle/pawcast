import { usePlayerStore } from "../../stores/playerStore";
import { useBookmarkStore } from "../../stores/bookmarkStore";
import {
  seekForward as playerSeekForward,
  seekBackward as playerSeekBackward,
} from "../../stores/playerActions";
import { useShadowingStore } from "../../stores/shadowingStore";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { formatTime } from "../../utils/formatTime";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Repeat,
  Mic,
  Settings2,
  ListMusic,
  PanelTop,
  PanelBottomClose,
  ChevronDown,
  Bookmark,
} from "lucide-react";
import { cn } from "../../utils/cn";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";
import { Slider } from "../ui/slider";
import { useNavigate } from "react-router-dom";
import { TimelineOverflowMenu } from "./TimelineOverflowMenu";

interface TimelineToolbarProps {
  collapsed: boolean;
  onCollapse: () => void;
  onExpand: () => void;
}

export const TimelineToolbar = ({
  collapsed,
  onCollapse,
  onExpand,
}: TimelineToolbarProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    isPlaying,
    currentTime,
    duration,
    volume,
    muted,
    playbackRate,
    isLooping,
    loopStart,
    loopEnd,
    seekStepSeconds,
    togglePlay,
    setVolume,
    setMuted,
    setPlaybackRate,
    setIsLooping,
    setLoopPoints,
  } = usePlayerStore();
  const addBookmark = useBookmarkStore((state) => state.addBookmark);

  const togglePlayPause = () => togglePlay();
  const seekForward = () => playerSeekForward(seekStepSeconds);
  const seekBackward = () => playerSeekBackward(seekStepSeconds);

  const toggleMute = () => {
    if (muted) {
      const prev = usePlayerStore.getState().previousVolume;
      setVolume(prev !== undefined && prev > 0 ? prev : 1);
      setMuted(false);
    } else {
      usePlayerStore.getState().setPreviousVolume(volume);
      setVolume(0);
      setMuted(true);
    }
  };

  const handleVolumeChange = (values: number[]) => setVolume(values[0]);
  const decreasePlaybackRate = () => setPlaybackRate(Math.max(0.25, playbackRate - 0.25));
  const increasePlaybackRate = () => setPlaybackRate(Math.min(2, playbackRate + 0.25));

  const { isShadowingMode, setShadowingMode } = useShadowingStore();
  const toggleShadowing = () => setShadowingMode(!isShadowingMode);

  const handleAddBookmark = () => {
    const success = addBookmark({
      name: t("bookmarks.newBookmark", { defaultValue: "New Bookmark" }),
      start: currentTime,
      end: currentTime + 5, // Default 5s range
    });
    if (success) {
      toast.success(t("bookmarks.added", { defaultValue: "Bookmark added" }));
    }
  };

  return (
    <div className="@container/toolbar w-full">
      <div className="timeline-toolbar flex h-11 shrink-0 min-w-0 items-center gap-1 sm:gap-1.5 overflow-hidden px-2 sm:px-3 py-1 bg-gray-50 dark:bg-gray-900/80 border-b border-gray-200 dark:border-white/5">
      {/* PRIMARY — playback group, always visible */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={seekBackward}
          className="size-8 flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors text-gray-700 dark:text-gray-400 active:scale-90 shrink-0"
          title={t("player.seekBackwardSeconds", { seconds: seekStepSeconds })}
        >
          <SkipBack size={16} />
        </button>
        <button
          onClick={togglePlayPause}
          className="size-9 flex items-center justify-center bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full shadow-lg hover:shadow-xl active:scale-95 transition-all shrink-0"
        >
          {isPlaying ? (
            <Pause size={18} fill="currentColor" />
          ) : (
            <Play size={18} className="ml-0.5" fill="currentColor" />
          )}
        </button>
        <button
          onClick={seekForward}
          className="size-8 flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors text-gray-700 dark:text-gray-400 active:scale-90 shrink-0"
          title={t("player.seekForwardSeconds", { seconds: seekStepSeconds })}
        >
          <SkipForward size={16} />
        </button>
      </div>

      {/* Time — hides under 180px */}
      <div className="hidden @[180px]/toolbar:block text-xs font-mono text-gray-700 dark:text-gray-300 tabular-nums whitespace-nowrap shrink-0">
        {formatTime(currentTime)} / {formatTime(duration)}
      </div>

      <div className="flex-1 min-w-1" />

      {/* PRIMARY action group — Record + A-B (always visible) */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={toggleShadowing}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors min-w-[28px]",
            isShadowingMode
              ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
              : "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
          )}
          title={t("shadowing.record")}
        >
          <Mic size={13} />
          <span className="hidden @[300px]/toolbar:inline">{t("shadowing.record", { defaultValue: "Record" })}</span>
        </button>

        <button
          onClick={() => {
            if (loopStart === null) {
              setLoopPoints(currentTime, null);
            } else if (loopEnd === null) {
              setLoopPoints(loopStart, currentTime);
            } else {
              setLoopPoints(null, null);
            }
          }}
          className={cn(
            "flex items-center gap-0.5 px-2 py-1 rounded-md text-xs font-medium transition-colors active:scale-90 min-w-[28px]",
            loopStart !== null && loopEnd !== null
              ? "text-primary-600 bg-primary-50 dark:bg-primary-900/30"
              : loopStart !== null
                ? "text-amber-600 bg-amber-50 dark:bg-amber-900/30"
                : "text-gray-700 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5"
          )}
          title={t("player.abLoop", { defaultValue: "A-B Loop" })}
        >
          <span className="font-mono">{loopStart !== null && loopEnd !== null ? "A-B" : loopStart !== null ? "A-" : "A-B"}</span>
        </button>
      </div>

      {/* Speed — visible @[360px]+ */}
      <div className="hidden @[360px]/toolbar:flex items-center shrink-0">
        <Popover>
          <PopoverTrigger asChild>
            <button className="timeline-secondary-action flex items-center gap-0.5 px-2 py-1 rounded-md text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors min-w-[40px]">
              <span>{playbackRate.toFixed(2)}x</span>
              <ChevronDown size={12} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-3 space-y-3" side="top" align="end">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">{t("player.playbackSpeed", { defaultValue: "Speed" })}</span>
              <span className="text-sm font-bold font-mono text-primary-600">{playbackRate.toFixed(2)}x</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={decreasePlaybackRate} className="flex-1 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs hover:bg-gray-100 dark:hover:bg-gray-700">-0.25</button>
              <button onClick={() => setPlaybackRate(1)} className="flex-1 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs font-bold hover:bg-gray-100 dark:hover:bg-gray-700">1x</button>
              <button onClick={increasePlaybackRate} className="flex-1 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs hover:bg-gray-100 dark:hover:bg-gray-700">+0.25</button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Bookmark — visible @[420px]+ */}
      <button
        onClick={handleAddBookmark}
        className="hidden @[420px]/toolbar:inline-flex items-center justify-center timeline-secondary-action size-8 rounded-full transition-colors active:scale-90 text-gray-700 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 shrink-0"
        title={t("bookmarks.add", { defaultValue: "Add Bookmark" })}
      >
        <Bookmark size={16} />
      </button>

      {/* Loop, Volume — visible @[480px]+ */}
      <button
        onClick={() => setIsLooping(!isLooping)}
        className={cn(
          "hidden @[480px]/toolbar:inline-flex items-center justify-center timeline-secondary-action size-8 rounded-full transition-colors active:scale-90 shrink-0",
          isLooping
            ? "text-primary-600 bg-primary-50 dark:bg-primary-900/30"
            : "text-gray-700 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5"
        )}
        title={t("player.toggleLooping")}
      >
        <Repeat size={16} />
      </button>
      <div className="hidden @[480px]/toolbar:flex items-center">
        <Popover>
          <PopoverTrigger asChild>
            <button className="timeline-secondary-action size-8 flex items-center justify-center rounded-full transition-colors active:scale-90 text-gray-700 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 shrink-0">
              {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-36 p-3" side="top" sideOffset={12}>
            <div className="flex items-center gap-2">
              <button onClick={toggleMute} className="text-gray-500 dark:text-gray-400">
                {muted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <Slider value={[volume]} min={0} max={1} step={0.01} onValueChange={handleVolumeChange} className="flex-1" />
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Settings, SentencePractice — visible @[640px]+ */}
      <button
        onClick={() => navigate("/sentence-practice")}
        className="hidden @[640px]/toolbar:inline-flex items-center justify-center timeline-secondary-action size-8 rounded-full transition-colors active:scale-90 text-gray-700 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 shrink-0"
        title={t("sentencePractice.title")}
      >
        <ListMusic size={16} />
      </button>
      <div className="hidden @[640px]/toolbar:flex items-center">
        <Popover>
          <PopoverTrigger asChild>
            <button className="timeline-secondary-action size-8 flex items-center justify-center rounded-full transition-colors active:scale-90 text-gray-700 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 shrink-0">
              <Settings2 size={16} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-4 space-y-4" side="top" align="end">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{t("settingsPage.seekStep")}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0.1}
                  max={120}
                  step={0.1}
                  value={seekStepSeconds}
                  onChange={(e) => usePlayerStore.getState().setSeekStepSeconds(parseFloat(e.target.value) || 0)}
                  className="w-16 h-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-2 text-xs font-bold text-right"
                />
                <span className="text-[10px] text-gray-400">s</span>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Overflow menu — appears when any secondary control is hidden */}
      <div className="@[640px]/toolbar:hidden flex items-center shrink-0">
        <TimelineOverflowMenu
          ariaLabel={t("layout.layoutSettings")}
          items={[
            {
              id: "speed",
              label: `${t("player.playbackSpeed", { defaultValue: "Speed" })}: ${playbackRate.toFixed(2)}x`,
              icon: <ChevronDown size={12} />,
              onSelect: () => setPlaybackRate(playbackRate >= 2 ? 0.5 : Math.min(2, playbackRate + 0.25)),
              hideAtClass: "@[360px]/toolbar:hidden",
            },
            {
              id: "bookmark",
              label: t("bookmarks.add", { defaultValue: "Add Bookmark" }),
              icon: <Bookmark size={12} />,
              onSelect: handleAddBookmark,
              hideAtClass: "@[420px]/toolbar:hidden",
            },
            {
              id: "loop",
              label: t("player.toggleLooping"),
              icon: <Repeat size={12} />,
              onSelect: () => setIsLooping(!isLooping),
              hideAtClass: "@[480px]/toolbar:hidden",
            },
            {
              id: "volume",
              label: muted ? t("player.unmute", { defaultValue: "Unmute" }) : t("player.mute", { defaultValue: "Mute" }),
              icon: muted || volume === 0 ? <VolumeX size={12} /> : <Volume2 size={12} />,
              onSelect: toggleMute,
              hideAtClass: "@[480px]/toolbar:hidden",
            },
            {
              id: "sentence",
              label: t("sentencePractice.title"),
              icon: <ListMusic size={12} />,
              onSelect: () => navigate("/sentence-practice"),
              hideAtClass: "@[640px]/toolbar:hidden",
            },
          ]}
        />
      </div>

      {/* Panel controls — always visible */}
      <div className="timeline-panel-controls flex shrink-0 items-center gap-0.5 ml-1 pl-2 border-l border-gray-200 dark:border-white/10">
        {collapsed ? (
          <button
            onClick={onExpand}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors shrink-0"
            title={t("common.expand")}
          >
            <PanelTop size={14} />
          </button>
        ) : (
          <button
            onClick={onCollapse}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors shrink-0"
            title={t("common.collapse")}
          >
            <PanelBottomClose size={14} />
          </button>
        )}
      </div>
    </div>
    </div>
  );
};
