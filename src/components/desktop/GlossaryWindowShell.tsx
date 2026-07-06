import type { ReactNode } from "react";
import { BookOpen } from "lucide-react";

interface GlossaryWindowShellProps {
  title: string;
  children: ReactNode;
}

export function GlossaryWindowShell({ title, children }: GlossaryWindowShellProps) {
  const isMac =
    typeof navigator !== "undefined" && navigator.userAgent.includes("Mac OS X");
  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-white">
      <div className="flex h-screen flex-col overflow-hidden">
        {/* Unified title bar: fixed height so the macOS traffic lights sit
            vertically centered next to the title (drag region spans the bar). */}
        <header
          data-tauri-drag-region="deep"
          className={`flex h-[52px] shrink-0 select-none items-center gap-2.5 border-b border-gray-100 pr-4 dark:border-white/[0.06] ${
            isMac ? "pl-[84px]" : "pl-5"
          }`}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary-500/10 text-primary-600 dark:text-primary-400">
            <BookOpen className="h-3.5 w-3.5" />
          </span>
          <h1 className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">
            {title}
          </h1>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-4xl px-6 py-6 md:px-8 md:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
