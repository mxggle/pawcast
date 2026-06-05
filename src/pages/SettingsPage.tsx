import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { AppLayout } from "../components/layout/AppLayout";
import { SettingsWorkspace } from "../components/settings/SettingsWorkspace";
import { SettingsSidebar } from "../components/settings/SettingsSidebar";
import { type SettingsTab } from "../components/settings/SettingsSidebar";
import { useAiSettingsState } from "../hooks/useAiSettingsState";

const getTabFromSearch = (search: string): SettingsTab => {
  const params = new URLSearchParams(search);
  return params.get("tab") === "ai" ? "ai" : "general";
};

export function SettingsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const aiSettingsState = useAiSettingsState();
  const [activeTab, setActiveTab] = useState<SettingsTab>(() =>
    getTabFromSearch(location.search)
  );

  useEffect(() => {
    setActiveTab(getTabFromSearch(location.search));
  }, [location.search]);

  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab);
    navigate({
      pathname: location.pathname,
      search: tab === "general" ? "" : `?tab=${tab}`,
    });
  };

  const handleClose = () => {
    navigate("/");
  };

  const navItems = SettingsWorkspace.getNavItems(t);

  const subtitle =
    activeTab === "data"
      ? t("settingsPage.data.description")
      : activeTab === "general"
        ? t("settingsPage.generalDescription")
        : t("settingsPage.aiDescription");

  return (
    <AppLayout bottomPaddingClassName="pb-0">
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 border-b border-gray-200 dark:border-gray-800 px-6 py-5 sm:px-8 sm:py-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
                {t("settingsPage.title")}
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {subtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
              aria-label={t("common.close")}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body: sidebar + scrollable content */}
        <div className="flex min-h-0 flex-1">
          <aside className="w-[220px] shrink-0 border-r border-gray-200 dark:border-gray-800 px-4 py-6 sm:w-[240px] sm:px-6">
            <SettingsSidebar
              activeTab={activeTab}
              items={navItems}
              onTabChange={handleTabChange}
              variant="page"
            />
          </aside>

          <div className="min-w-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8 sm:py-8">
            <div className="mx-auto max-w-3xl">
              <SettingsWorkspace
                activeTab={activeTab}
                onTabChange={handleTabChange}
                aiSettingsState={aiSettingsState}
                variant="page"
              />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
