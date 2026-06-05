import type { CSSProperties } from "react";
import {
  Check,
  Globe,
  Layout,
  Palette,
  RotateCcw,
  Clock,
  Waves,
  FileText,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLayoutSettings } from "../../contexts/layoutSettings";
import { usePlayerStore } from "../../stores/playerStore";
import { THEME_PRESETS, useThemeStore } from "../../stores/themeStore";
import { cn } from "../../utils/cn";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { LanguageSelector } from "../ui/LanguageSelector";
import { SettingsSection } from "./SettingsSection";
import { SettingsRow } from "./SettingsRow";
import { SettingsIconChip } from "./SettingsIconChip";

export function GeneralSettingsPanel() {
  const { t } = useTranslation();
  const { layoutSettings, setLayoutSettings } = useLayoutSettings();
  const { colors, setColors, resetColors } = useThemeStore();
  const {
    seekMode,
    seekStepSeconds,
    seekSmallStepSeconds,
    setSeekMode,
    setSeekStepSeconds,
    setSeekSmallStepSeconds,
  } = usePlayerStore();

  const layoutOptions = [
    {
      key: "showWaveform" as const,
      label: t("settings.waveformDisplay"),
      description: "Display audio waveform visualization",
      icon: <Waves className="h-[18px] w-[18px]" />,
    },
    {
      key: "showTranscript" as const,
      label: t("settings.transcriptPanel"),
      description: "Show AI-generated transcript panel",
      icon: <FileText className="h-[18px] w-[18px]" />,
    },
    {
      key: "showControls" as const,
      label: t("settings.playbackControls"),
      description: "Display playback control buttons",
      icon: <SlidersHorizontal className="h-[18px] w-[18px]" />,
    },
  ];

  return (
    <div className="space-y-10">
      {/* Appearance */}
      <SettingsSection
        title={t("settingsPage.appearance")}
        icon={<Globe className="h-4 w-4 text-primary" />}
      >
        <Card>
          <CardContent className="p-6">
            <LanguageSelector />
          </CardContent>
        </Card>
      </SettingsSection>

      {/* Interface Layout */}
      <SettingsSection
        title={t("settingsPage.interfaceLayout")}
        description={t("settingsPage.interfaceLayoutHelp")}
        icon={<Layout className="h-4 w-4 text-orange-500" />}
      >
        <Card>
          <CardContent className="p-0">
            {layoutOptions.map((option, index) => (
              <SettingsRow
                key={option.key}
                label={
                  <div className="flex items-center gap-3">
                    <SettingsIconChip active={layoutSettings[option.key]}>
                      {option.icon}
                    </SettingsIconChip>
                    <span>{option.label}</span>
                  </div>
                }
                description={option.description}
                noBorder={index === layoutOptions.length - 1}
                className="px-6"
              >
                <Switch
                  checked={layoutSettings[option.key]}
                  onCheckedChange={(checked) =>
                    setLayoutSettings((current) => ({
                      ...current,
                      [option.key]: checked,
                    }))
                  }
                />
              </SettingsRow>
            ))}
          </CardContent>
        </Card>
      </SettingsSection>

      {/* Theme */}
      <SettingsSection
        title={t("settingsPage.theme")}
        description={t("settingsPage.themeHelp")}
        icon={<Palette className="h-4 w-4 text-purple-500" />}
        action={
          <button
            type="button"
            onClick={resetColors}
            className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("settingsPage.resetTheme")}
          </button>
        }
      >
        <Card>
          <CardContent className="space-y-8 p-6">
            <div className="grid grid-cols-3 gap-6 sm:grid-cols-6 justify-items-center">
              {Object.entries(THEME_PRESETS).map(([name, themeColors]) => {
                const isActive = colors.primary === themeColors.primary;

                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setColors(themeColors)}
                    className="group flex flex-col items-center gap-2.5 transition-transform duration-200"
                  >
                    <span
                      className={cn(
                        "relative flex h-11 w-11 items-center justify-center rounded-full border-2 border-white shadow-md transition-all duration-300 dark:border-gray-900",
                        isActive
                          ? "scale-105 ring-2 ring-primary shadow-lg shadow-primary/20"
                          : "ring-1 ring-gray-200/80 group-hover:scale-105 group-hover:shadow-md dark:ring-gray-700/80"
                      )}
                      style={{
                        backgroundColor: themeColors.primary,
                        ...(isActive
                          ? ({ "--tw-ring-color": themeColors.primary } as CSSProperties)
                          : {}),
                      }}
                    >
                      {isActive ? (
                        <Check className="h-4 w-4 text-white" strokeWidth={3.4} />
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-bold capitalize transition-colors duration-200",
                        isActive
                          ? "text-primary font-semibold"
                          : "text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-400"
                      )}
                    >
                      {name}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-gray-100 pt-6 dark:border-gray-800">
              <label className="mb-3 block text-sm font-bold text-gray-700 dark:text-gray-300">
                {t("settingsPage.customPrimaryColor")}
              </label>
              <div className="flex items-center gap-4">
                <div className="relative h-11 w-11 shrink-0">
                  <input
                    type="color"
                    value={colors.primary}
                    onChange={(event) => setColors({ primary: event.target.value })}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0 z-10"
                  />
                  <div
                    className="h-full w-full rounded-full border-2 border-white shadow-md ring-1 ring-gray-200 dark:border-gray-900 dark:ring-gray-700 transition-all duration-300 hover:scale-105 hover:shadow-lg"
                    style={{ backgroundColor: colors.primary }}
                  />
                </div>
                <Input
                  type="text"
                  value={colors.primary.toUpperCase()}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (/^#[0-9A-F]{6}$/i.test(nextValue)) {
                      setColors({ primary: nextValue });
                    }
                  }}
                  placeholder="#8B5CF6"
                  className="h-11 max-w-[140px] rounded-xl border-[1.5px] font-mono text-sm font-semibold uppercase text-center focus:border-primary focus:ring-[3px] focus:ring-primary/10"
                  maxLength={7}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </SettingsSection>

      {/* Playback */}
      <SettingsSection
        title={t("settingsPage.playback")}
        icon={<Clock className="h-4 w-4 text-blue-500" />}
      >
        <Card>
          <CardContent className="p-0">
            <SettingsRow
              label={t("settingsPage.seekMode")}
              description={t("settings.seekModeHelp")}
              className="px-6"
            >
              <select
                value={seekMode}
                onChange={(event) =>
                  setSeekMode(event.target.value as "seconds" | "sentence")
                }
                className="h-10 w-40 rounded-md border border-gray-200 bg-white px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-gray-700 dark:bg-gray-950"
              >
                <option value="seconds">{t("settings.seekModeSeconds")}</option>
                <option value="sentence">{t("settings.seekModeSentence")}</option>
              </select>
            </SettingsRow>

            <SettingsRow
              label={t("settingsPage.seekStep")}
              description={t("settings.seekStep")}
              className="px-6"
            >
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0.1}
                  max={120}
                  step={0.1}
                  disabled={seekMode === "sentence"}
                  value={seekStepSeconds}
                  onChange={(event) =>
                    setSeekStepSeconds(parseFloat(event.target.value) || 0)
                  }
                  className="h-10 w-24 text-right text-sm font-medium"
                />
                <span className="text-xs font-semibold text-gray-400">SEC</span>
              </div>
            </SettingsRow>

            <SettingsRow
              label={t("settingsPage.smallStep")}
              description={t("settings.smallStep")}
              noBorder
              className="px-6"
            >
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0.05}
                  max={10}
                  step={0.05}
                  value={seekSmallStepSeconds}
                  onChange={(event) =>
                    setSeekSmallStepSeconds(parseFloat(event.target.value) || 0)
                  }
                  className="h-10 w-24 text-right text-sm font-medium"
                />
                <span className="text-xs font-semibold text-gray-400">SEC</span>
              </div>
            </SettingsRow>
          </CardContent>
        </Card>
      </SettingsSection>
    </div>
  );
}
