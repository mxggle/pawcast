import { useTranslation } from "react-i18next";
import { Database, Monitor } from "lucide-react";

export function DataSettingsPanel() {
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

      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Monitor className="h-12 w-12 text-gray-300 dark:text-gray-600" />
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          {t("settingsPage.data.electronOnly")}
        </p>
      </div>
    </div>
  );
}
