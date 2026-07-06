import type { ReactNode } from "react";

interface SettingsWindowShellProps {
  title: string;
  navigation: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}

export function SettingsWindowShell({
  title,
  navigation,
  footer,
  children,
}: SettingsWindowShellProps) {
  const isMac =
    typeof navigator !== "undefined" && navigator.userAgent.includes("Mac OS X");
  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-white">
      <div className="flex h-screen flex-col overflow-hidden">
        {/* Unified title bar: fixed height so the macOS traffic lights sit
            vertically centered next to the title (drag region spans the bar). */}
        <header
          data-tauri-drag-region="deep"
          className={`flex h-[52px] shrink-0 select-none items-center border-b border-gray-100 pr-4 dark:border-white/[0.06] ${
            isMac ? "pl-[84px]" : "pl-5"
          }`}
        >
          <h1 className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">
            {title}
          </h1>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[200px_minmax(0,1fr)]">
          <aside className="overflow-y-auto border-r border-gray-100 bg-gray-50/50 px-3 py-4 dark:border-white/[0.06] dark:bg-gray-900/30">
            {navigation}
          </aside>

          <main className="min-h-0 overflow-y-auto px-6 py-6 md:px-8 md:py-8">
            {children}
          </main>
        </div>

        <footer className="border-t border-gray-100 bg-gray-50/50 px-6 py-3 dark:border-white/[0.06] dark:bg-gray-900/30">
          {footer}
        </footer>
      </div>
    </div>
  );
}
