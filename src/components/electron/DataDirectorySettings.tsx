import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Folder, FolderOpen, Download, Upload, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { SettingsSection } from "../settings/SettingsSection";
import { SettingsRow } from "../settings/SettingsRow";

export function DataDirectorySettings() {
  const { t } = useTranslation();
  const [directory, setDirectory] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingDir, setPendingDir] = useState<string | null>(null);

  const loadDirectory = useCallback(async () => {
    if (!window.electronAPI?.dataGetDirectory) return;
    try {
      const dir = await window.electronAPI.dataGetDirectory();
      setDirectory(dir);
    } catch {
      setDirectory(null);
    }
  }, []);

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  const handleChangeDirectory = useCallback(async () => {
    if (!window.electronAPI?.openFolder) return;
    setError(null);
    try {
      const folder = await window.electronAPI.openFolder();
      if (!folder) return;
      setPendingDir(folder);
      setShowConfirm(true);
    } catch {
      // user cancelled
    }
  }, []);

  const confirmChange = useCallback(async () => {
    if (!pendingDir || !window.electronAPI?.dataChangeDirectory) return;
    setLoading(true);
    setShowConfirm(false);
    setError(null);
    setMessage(null);
    try {
      await window.electronAPI.dataChangeDirectory(pendingDir);
      setDirectory(pendingDir);
      setMessage(t("settingsPage.data.importSuccess"));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
      setPendingDir(null);
    }
  }, [pendingDir, t]);

  const handleExportSnapshot = useCallback(async () => {
    if (!window.electronAPI?.dataExportSnapshot) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await window.electronAPI.dataExportSnapshot();
      setMessage(t("settingsPage.data.exportSuccess"));
      console.log("Snapshot exported to:", result.path);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const handleImportSnapshot = useCallback(async () => {
    if (!window.electronAPI?.openFile) return;
    setError(null);
    setMessage(null);
    try {
      const file = await window.electronAPI.openFile();
      if (!file) return;
      setLoading(true);
      await window.electronAPI.dataImportSnapshot(file);
      setMessage(t("settingsPage.data.importSuccess"));
      await loadDirectory();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [t, loadDirectory]);

  if (!window.electronAPI?.dataGetDirectory) {
    return (
      <SettingsSection
        title={t("settingsPage.data.directory")}
        icon={<Folder className="h-4 w-4 text-primary-500" />}
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
    <>
      <SettingsSection
        title={t("settingsPage.data.directory")}
        description={t("settingsPage.data.changeDirectoryDescription")}
        icon={<Folder className="h-4 w-4 text-primary-500" />}
      >
        <Card>
          <CardContent className="p-0">
            <SettingsRow
              label={
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-gray-400" />
                  <span>{t("settingsPage.data.currentDirectory")}</span>
                </div>
              }
              className="px-6"
            >
              <span className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate max-w-[300px]" title={directory ?? ""}>
                {directory ?? "—"}
              </span>
            </SettingsRow>

            <div className="flex flex-wrap gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={handleChangeDirectory}
                disabled={loading}
                className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {t("settingsPage.data.changeDirectory")}
              </button>
            </div>

            {message && (
              <div className="border-t border-gray-100 px-6 py-3 dark:border-gray-800">
                <p className="text-xs text-green-600 dark:text-green-400">{message}</p>
              </div>
            )}
            {error && (
              <div className="border-t border-gray-100 px-6 py-3 dark:border-gray-800">
                <p className="text-xs text-red-500">{error}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </SettingsSection>

      <SettingsSection
        title={t("settingsPage.data.snapshots")}
        icon={<Download className="h-4 w-4 text-primary-500" />}
      >
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-wrap gap-2 px-6 py-4">
              <button
                type="button"
                onClick={handleExportSnapshot}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <Download className="h-3.5 w-3.5" />
                {t("settingsPage.data.exportSnapshot")}
              </button>
              <button
                type="button"
                onClick={handleImportSnapshot}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <Upload className="h-3.5 w-3.5" />
                {t("settingsPage.data.importSnapshot")}
              </button>
            </div>
          </CardContent>
        </Card>
      </SettingsSection>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-gray-900">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-500" />
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {t("settingsPage.data.changeDirectory")}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t("settingsPage.data.changeDirectoryConfirm")}
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => { setShowConfirm(false); setPendingDir(null); }}
                    className="rounded-md border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={confirmChange}
                    disabled={loading}
                    className="rounded-md bg-primary-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-600 disabled:opacity-50"
                  >
                    {t("common.save")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
