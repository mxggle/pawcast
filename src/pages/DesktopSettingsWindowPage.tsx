import { useTranslation } from "react-i18next";
import { Shield } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { SettingsWindowShell } from "../components/desktop/SettingsWindowShell";
import { SettingsWorkspace } from "../components/settings/SettingsWorkspace";
import { SettingsSidebar } from "../components/settings/SettingsSidebar";
import { DesktopDataPanel } from "../components/desktop/DesktopDataPanel";
import { useAiSettingsState } from "../hooks/useAiSettingsState";

export function DesktopSettingsWindowPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const aiSettingsState = useAiSettingsState();
  const routeState = SettingsWorkspace.parseSearch(location.search);
  const activeTab = routeState.tab;
  const navItems = SettingsWorkspace.getNavItems(t);

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
        <DesktopDataPanel />
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
