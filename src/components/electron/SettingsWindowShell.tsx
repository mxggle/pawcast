import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { X } from "lucide-react";

interface SettingsWindowShellProps {
  title: string;
  subtitle: string;
  navigation: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}

export function SettingsWindowShell({
  title,
  subtitle,
  navigation,
  footer,
  children,
}: SettingsWindowShellProps) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-[#020617] dark:text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col overflow-hidden border-x border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        <header className="[-webkit-app-region:drag] flex items-center justify-between border-b border-gray-100 px-6 py-5 dark:border-gray-800">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              {title}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {subtitle}
            </p>
          </div>
          <button
            onClick={() => window.electronAPI?.closeSettingsWindow()}
            className="[-webkit-app-region:no-drag] rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[200px_minmax(0,1fr)]">
          <aside className="border-r border-gray-100 bg-gray-50/50 px-3 py-4 dark:border-gray-800 dark:bg-gray-900/30 overflow-y-auto">
            {navigation}
          </aside>

          <main className="min-h-0 overflow-y-auto px-6 py-6 md:px-8 md:py-8">
            {children}
          </main>
        </div>

        <footer className="border-t border-gray-100 bg-gray-50/50 px-6 py-3 dark:border-gray-800 dark:bg-gray-900/30">
          {footer}
        </footer>
      </div>
    </div>
  );
}
