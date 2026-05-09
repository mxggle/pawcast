import type { LucideIcon } from "lucide-react";
import { cn } from "../../utils/cn";

export type SettingsTab = "general" | "ai" | "data";

export interface SettingsSidebarItem {
  id: SettingsTab;
  label: string;
  Icon: LucideIcon;
}

interface SettingsSidebarProps {
  activeTab: SettingsTab;
  items: SettingsSidebarItem[];
  onTabChange: (tab: SettingsTab) => void;
  variant?: "page" | "standalone";
  className?: string;
}

export function SettingsSidebar({
  activeTab,
  items,
  onTabChange,
  variant = "page",
  className,
}: SettingsSidebarProps) {
  return (
    <nav
      className={cn(
        "flex flex-col gap-1",
        variant === "page" && "w-[200px] shrink-0",
        className
      )}
      aria-label="Settings navigation"
    >
      {items.map(({ id, label, Icon }) => {
        const isActive = activeTab === id;

        return (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            aria-pressed={isActive}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors duration-200",
              isActive
                ? "bg-primary-500 text-white"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
