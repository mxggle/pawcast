import { useTranslation } from "react-i18next";
import { Database } from "lucide-react";
import { DataHealthPanel } from "./DataHealthPanel";
import { DataDirectorySettings } from "./DataDirectorySettings";

export function ElectronDataPanel() {
  const { t } = useTranslation();

  return (
    <div className="space-y-10">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-primary-500" />
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t("settingsPage.data.title")}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("settingsPage.data.description")}
          </p>
        </div>
      </div>

      <DataDirectorySettings />
      <DataHealthPanel />
    </div>
  );
}
