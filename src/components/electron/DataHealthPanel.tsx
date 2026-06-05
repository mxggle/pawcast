import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Heart, Shield, AlertTriangle, XCircle, RefreshCw, CheckCircle, ChevronDown, ChevronRight } from "lucide-react";
import type { HealthCheckResult, RecoveryResult } from "../../types/persistence";
import { Card, CardContent } from "../ui/card";
import { SettingsSection } from "../settings/SettingsSection";
import { SettingsRow } from "../settings/SettingsRow";
import { cn } from "../../utils/cn";
import { collectIndexedDBData, collectLocalStorageData } from "../../utils/migrationBridge";

function StatusBadge({ status }: { status: HealthCheckResult['status'] }) {
  const { t } = useTranslation();

  const config = {
    healthy: {
      label: t("settingsPage.data.healthy"),
      icon: CheckCircle,
      className: "text-success-500 bg-success-50 dark:bg-success-500/10",
    },
    degraded: {
      label: t("settingsPage.data.degraded"),
      icon: AlertTriangle,
      className: "text-yellow-500 bg-yellow-50 dark:bg-yellow-500/10",
    },
    damaged: {
      label: t("settingsPage.data.damaged"),
      icon: XCircle,
      className: "text-red-500 bg-red-50 dark:bg-red-500/10",
    },
  }[status];

  const Icon = config.icon;

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
      config.className,
    )}>
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </span>
  );
}

function ExpandableList({ title, items, icon: Icon }: {
  title: string;
  items: string[];
  icon: React.ComponentType<{ className?: string }>;
}) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className="border-t border-gray-100 dark:border-gray-800">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-6 py-3 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/50"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
        )}
        <Icon className="h-4 w-4 shrink-0" />
        <span>{title}</span>
        <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          {items.length}
        </span>
      </button>
      {expanded && (
        <ul className="space-y-0.5 border-t border-gray-50 px-6 py-2 dark:border-gray-800">
          {items.map((item, i) => (
            <li
              key={i}
              className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate"
              title={item}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DataHealthPanel() {
  const { t } = useTranslation();
  const [health, setHealth] = useState<HealthCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryMsg, setRecoveryMsg] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    if (!window.electronAPI?.dataHealthCheck) return;
    setLoading(true);
    setRecoveryMsg(null);
    setRecoveryError(null);
    try {
      const result = await window.electronAPI.dataHealthCheck();
      setHealth(result);
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void runCheck();
  }, [runCheck]);

  const handleRecover = useCallback(async (strategy: 'journal' | 'snapshot' | 'remigrate') => {
    if (!window.electronAPI?.dataRecover) return;
    setRecovering(true);
    setRecoveryMsg(null);
    setRecoveryError(null);
    try {
      if (strategy === "remigrate") {
        if (!window.electronAPI.dataRunMigration) return;
        const localStorageData = await collectLocalStorageData();
        const indexedDBData = await collectIndexedDBData();
        const result = await window.electronAPI.dataRunMigration(localStorageData, indexedDBData);
        if (result.success) {
          setRecoveryMsg(t("settingsPage.data.recoverySuccess"));
        } else {
          setRecoveryError(t("settingsPage.data.recoveryFailed", { message: result.errors.join("; ") }));
        }
      } else {
        const result: RecoveryResult = await window.electronAPI.dataRecover(strategy);
        if (result.success) {
          setRecoveryMsg(result.message || t("settingsPage.data.recoverySuccess"));
        } else {
          setRecoveryError(t("settingsPage.data.recoveryFailed", { message: result.message }));
        }
      }
      await runCheck();
    } catch (err) {
      setRecoveryError(t("settingsPage.data.recoveryFailed", { message: String(err) }));
    } finally {
      setRecovering(false);
    }
  }, [runCheck, t]);

  if (!window.electronAPI?.dataHealthCheck) {
    return (
      <SettingsSection
        title={t("settingsPage.data.healthCheck")}
        icon={<Heart className="h-4 w-4 text-primary-500" />}
      >
        <Card>
          <CardContent className="flex items-center justify-center p-8">
            <p className="text-sm text-gray-400">{t("settingsPage.data.electronOnly")}</p>
          </CardContent>
        </Card>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title={t("settingsPage.data.healthCheck")}
      icon={<Heart className="h-4 w-4 text-primary-500" />}
      action={
        <button
          type="button"
          onClick={runCheck}
          disabled={loading}
          className={cn(
            "flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium transition-colors",
            "text-gray-500 hover:border-gray-300 hover:text-gray-700",
            "dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200",
            loading && "opacity-50 cursor-not-allowed",
          )}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          {t("settingsPage.data.runHealthCheck")}
        </button>
      }
    >
      <Card>
        {health ? (
          <CardContent className="p-0">
            <SettingsRow
              label={t("settingsPage.data.healthStatus")}
              className="px-6"
            >
              <StatusBadge status={health.status} />
            </SettingsRow>

            <SettingsRow
              label={t("settingsPage.data.manifestStatus")}
              className="px-6"
            >
              {health.manifestOk ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success-500">
                  <Shield className="h-3.5 w-3.5" />
                  {t("settingsPage.data.manifestOk")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-500">
                  <XCircle className="h-3.5 w-3.5" />
                  {t("settingsPage.data.manifestCorrupt")}
                </span>
              )}
            </SettingsRow>

            {health.failedChecksums.length === 0 &&
              health.orphanedReferences.length === 0 &&
              health.corruptedFiles.length === 0 && (
              <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800">
                <p className="text-sm text-green-600 dark:text-green-400">
                  {t("settingsPage.data.noIssues")}
                </p>
              </div>
            )}

            <ExpandableList
              title={t("settingsPage.data.failedChecksums")}
              items={health.failedChecksums}
              icon={AlertTriangle}
            />
            <ExpandableList
              title={t("settingsPage.data.orphanedReferences")}
              items={health.orphanedReferences}
              icon={AlertTriangle}
            />
            <ExpandableList
              title={t("settingsPage.data.corruptedFiles")}
              items={health.corruptedFiles}
              icon={XCircle}
            />

            {(health.failedChecksums.length > 0 ||
              health.orphanedReferences.length > 0 ||
              health.corruptedFiles.length > 0) && (
              <div className="border-t border-gray-100 px-6 py-4 dark:border-gray-800">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {t("settingsPage.data.recovery")}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={recovering}
                    onClick={() => handleRecover("journal")}
                    className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    {t("settingsPage.data.replayJournal")}
                  </button>
                  <button
                    type="button"
                    disabled={recovering}
                    onClick={() => handleRecover("snapshot")}
                    className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    {t("settingsPage.data.restoreSnapshot")}
                  </button>
                  <button
                    type="button"
                    disabled={recovering}
                    onClick={() => handleRecover("remigrate")}
                    className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    {t("settingsPage.data.remigrate")}
                  </button>
                </div>

                {recoveryMsg && (
                  <p className="mt-3 text-xs text-green-600 dark:text-green-400">
                    {recoveryMsg}
                  </p>
                )}
                {recoveryError && (
                  <p className="mt-3 text-xs text-red-500">{recoveryError}</p>
                )}
              </div>
            )}
          </CardContent>
        ) : (
          <CardContent className="flex items-center justify-center p-8">
            {loading ? (
              <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
            ) : (
              <p className="text-sm text-gray-400">
                {t("settingsPage.data.runHealthCheck")}
              </p>
            )}
          </CardContent>
        )}
      </Card>
    </SettingsSection>
  );
}
