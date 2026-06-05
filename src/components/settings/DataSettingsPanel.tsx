import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Brain,
  Database,
  Download,
  FileText,
  HardDrive,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { cn } from "../../utils/cn";
import { Card, CardContent } from "../ui/card";
import { SettingsSection } from "./SettingsSection";
import { SettingsIconChip } from "./SettingsIconChip";

// Visual-only storage breakdown. Real per-category usage is only wired up in the
// desktop (Electron) data panel; on web these figures are illustrative.
const STORAGE_TOTAL_MB = 8192;
const STORAGE_SEGMENTS = [
  { id: "audio", labelKey: "settingsPage.data.audioCache", icon: HardDrive, bytes: 1840, color: "var(--theme-primary)" },
  { id: "transcripts", labelKey: "settingsPage.data.transcripts", icon: FileText, bytes: 320, color: "#3B82F6" },
  { id: "models", labelKey: "settingsPage.data.localModels", icon: Brain, bytes: 2610, color: "#9B5DE5" },
] as const;

const formatSize = (mb: number) =>
  mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;

const actionButtonClass =
  "shrink-0 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-bold text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800";

interface ActionRowProps {
  icon: ReactNode;
  title: string;
  description: string;
  action: ReactNode;
  noBorder?: boolean;
}

function ActionRow({ icon, title, description, action, noBorder }: ActionRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3.5 px-3.5 py-3.5",
        !noBorder && "border-b border-gray-100 dark:border-gray-800"
      )}
    >
      <SettingsIconChip>{icon}</SettingsIconChip>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">
          {title}
        </p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

export function DataSettingsPanel() {
  const { t } = useTranslation();

  const usedMb = STORAGE_SEGMENTS.reduce((sum, seg) => sum + seg.bytes, 0);

  return (
    <div className="space-y-10">
      {/* Storage usage */}
      <SettingsSection
        title={t("settingsPage.data.storage")}
        icon={<HardDrive className="h-4 w-4 text-primary" />}
      >
        <Card>
          <CardContent className="space-y-4 p-[18px]">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                {formatSize(usedMb)}
              </span>
              <span className="text-xs font-semibold text-gray-400">
                {t("settingsPage.data.usedOf", { total: formatSize(STORAGE_TOTAL_MB) })}
              </span>
            </div>

            <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              {STORAGE_SEGMENTS.map((seg) => (
                <span
                  key={seg.id}
                  className="block h-full"
                  style={{
                    width: `${(seg.bytes / STORAGE_TOTAL_MB) * 100}%`,
                    background: seg.color,
                  }}
                />
              ))}
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-3 pt-1">
              {STORAGE_SEGMENTS.map((seg) => (
                <div key={seg.id} className="flex items-center gap-2.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: seg.color }}
                  />
                  <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                    {t(seg.labelKey)}
                    <span className="ml-1.5 font-mono font-medium text-gray-500 dark:text-gray-400">
                      {formatSize(seg.bytes)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </SettingsSection>

      {/* Backup */}
      <SettingsSection
        title={t("settingsPage.data.backup")}
        icon={<Database className="h-4 w-4 text-primary" />}
      >
        <Card>
          <CardContent className="p-0">
            <ActionRow
              icon={<Download className="h-[18px] w-[18px]" />}
              title={t("settingsPage.data.exportData")}
              description={t("settingsPage.data.exportDataDesc")}
              action={
                <button type="button" className={actionButtonClass}>
                  {t("settingsPage.data.exportAction")}
                </button>
              }
            />
            <ActionRow
              icon={<Upload className="h-[18px] w-[18px]" />}
              title={t("settingsPage.data.importData")}
              description={t("settingsPage.data.importDataDesc")}
              noBorder
              action={
                <button type="button" className={actionButtonClass}>
                  {t("settingsPage.data.importAction")}
                </button>
              }
            />
          </CardContent>
        </Card>
      </SettingsSection>

      {/* Danger zone */}
      <SettingsSection
        title={t("settingsPage.data.dangerZone")}
        icon={<Trash2 className="h-4 w-4 text-error" />}
      >
        <Card className="border-error/20 ring-1 ring-error/5 dark:border-error/10">
          <CardContent className="p-0">
            <ActionRow
              icon={<RotateCcw className="h-[18px] w-[18px]" />}
              title={t("settingsPage.data.clearCache")}
              description={t("settingsPage.data.clearCacheDesc", {
                size: formatSize(STORAGE_SEGMENTS[0].bytes),
              })}
              action={
                <button
                  type="button"
                  className="shrink-0 rounded-xl border border-error/30 bg-transparent px-3.5 py-2 text-xs font-bold text-error transition-colors hover:bg-error/10 dark:text-error-400"
                >
                  {t("settingsPage.data.clearAction")}
                </button>
              }
            />
            <ActionRow
              icon={<Trash2 className="h-[18px] w-[18px]" />}
              title={t("settingsPage.data.deleteAll")}
              description={t("settingsPage.data.deleteAllDesc")}
              noBorder
              action={
                <button
                  type="button"
                  className="shrink-0 rounded-xl bg-error px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-error-600 dark:hover:bg-error-500"
                >
                  {t("settingsPage.data.deleteAction")}
                </button>
              }
            />
          </CardContent>
        </Card>
      </SettingsSection>
    </div>
  );
}
