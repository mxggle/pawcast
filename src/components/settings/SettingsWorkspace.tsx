import type { TFunction } from "i18next";
import { Brain, Database, SlidersHorizontal } from "lucide-react";
import { GeneralSettingsPanel } from "./GeneralSettingsPanel";
import {
  AISettingsPanel,
  type AiSettingsSection,
} from "./AISettingsPanel";
import { DataSettingsPanel } from "./DataSettingsPanel";
import {
  type SettingsSidebarItem,
  type SettingsTab,
} from "./SettingsSidebar";
import type { UseAiSettingsStateResult } from "../../hooks/useAiSettingsState";

export type SettingsWorkspaceVariant = "page" | "standalone";

export interface SettingsWorkspaceRouteState {
  tab: SettingsTab;
  section?: AiSettingsSection;
}

const parseSettingsWorkspaceSearch = (
  search: string
): SettingsWorkspaceRouteState => {
  const params = new URLSearchParams(search);
  const rawTab = params.get("tab")?.trim();
  const rawSection = params.get("section")?.trim();
  const section = AISettingsPanel.isSection(rawSection) ? rawSection : undefined;
  const tab = rawTab === "data" ? "data"
    : rawTab === "ai" || (rawTab !== "general" && section) ? "ai"
    : "general";

  return {
    tab,
    section,
  };
};

const buildSettingsWorkspaceSearch = (
  state: SettingsWorkspaceRouteState
): string => {
  const params = new URLSearchParams();

  params.set("tab", state.tab);

  if (state.section) {
    params.set("section", state.section);
  }

  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : "";
};

const getSettingsWorkspaceNavItems = (
  t: TFunction<"translation", undefined>
): SettingsSidebarItem[] => {
  return [
    {
      id: "general" as const,
      label: t("settingsPage.tabs.general"),
      Icon: SlidersHorizontal,
    },
    {
      id: "ai" as const,
      label: t("settingsPage.tabs.ai"),
      Icon: Brain,
    },
    {
      id: "data" as const,
      label: t("settingsPage.tabs.data"),
      Icon: Database,
    },
  ];
};

interface SettingsWorkspaceProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  aiSettingsState: UseAiSettingsStateResult;
  activeSection?: AiSettingsSection;
  onSectionChange?: (section: AiSettingsSection) => void;
  variant?: SettingsWorkspaceVariant;
}

type SettingsWorkspaceComponent = ((
  props: SettingsWorkspaceProps
) => JSX.Element) & {
  parseSearch: (search: string) => SettingsWorkspaceRouteState;
  buildSearch: (state: SettingsWorkspaceRouteState) => string;
  getNavItems: (t: TFunction<"translation", undefined>) => SettingsSidebarItem[];
};

const SettingsWorkspaceComponent = ({
  activeTab,
  aiSettingsState,
  activeSection,
  onSectionChange,
}: SettingsWorkspaceProps) => {
  return (
    <div className="min-w-0">
      {activeTab === "data" ? (
        <DataSettingsPanel />
      ) : activeTab === "general" ? (
        <GeneralSettingsPanel />
      ) : (
        <AISettingsPanel
          state={aiSettingsState}
          initialSection={activeSection}
          onSectionChange={onSectionChange}
        />
      )}
    </div>
  );
};

export const SettingsWorkspace = Object.assign(SettingsWorkspaceComponent, {
  parseSearch: parseSettingsWorkspaceSearch,
  buildSearch: buildSettingsWorkspaceSearch,
  getNavItems: getSettingsWorkspaceNavItems,
}) as SettingsWorkspaceComponent;
