import { useTranslation } from "react-i18next";
import { Shield } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { SettingsWindowShell } from "../components/electron/SettingsWindowShell";
import { SettingsWorkspace } from "../components/settings/SettingsWorkspace";
import { SettingsSidebar } from "../components/settings/SettingsSidebar";
import { ElectronDataPanel } from "../components/electron/ElectronDataPanel";
import { useAiSettingsState } from "../hooks/useAiSettingsState";

export function ElectronSettingsWindowPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const aiSettingsState = useAiSettingsState();
  const routeState = SettingsWorkspace.parseSearch(location.search);
  const activeTab = routeState.tab;
  const navItems = SettingsWorkspace.getNavItems(t);

  const subtitle =
    activeTab === "data"
      ? t("settingsPage.data.description")
      : activeTab === "general"
        ? t("settingsPage.generalDescription")
        : t("settingsPage.aiDescription");

  const handleTabChange = (tab: typeof activeTab) => {
    navigate(
      {
        pathname: location.pathname,
        search: SettingsWorkspace.buildSearch({
          ...routeState,
          tab,
        }),
      },
      { replace: true }
    );
  };

  const handleSectionChange = (section: NonNullable<typeof routeState.section>) => {
    navigate(
      {
        pathname: location.pathname,
        search: SettingsWorkspace.buildSearch({
          ...routeState,
          tab: "ai",
          section,
        }),
      },
      { replace: true }
    );
  };

  return (
    <SettingsWindowShell
      title={t("settingsPage.title")}
      subtitle={subtitle}
      navigation={
        <SettingsSidebar
          activeTab={activeTab}
          items={navItems}
          onTabChange={handleTabChange}
          variant="standalone"
        />
      }
      footer={
        <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
          <Shield className="h-3.5 w-3.5 text-success-500" />
          <span>{t("settingsPage.footer.autoSaved")}</span>
        </div>
      }
    >
      {activeTab === "data" ? (
        <ElectronDataPanel />
      ) : (
        <SettingsWorkspace
          activeTab={activeTab}
          onTabChange={handleTabChange}
          aiSettingsState={aiSettingsState}
          activeSection={routeState.section}
          onSectionChange={handleSectionChange}
          variant="standalone"
        />
      )}
    </SettingsWindowShell>
  );
}
