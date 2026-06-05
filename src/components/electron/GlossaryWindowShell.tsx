import type { ReactNode } from "react";
import { X } from "lucide-react";

interface GlossaryWindowShellProps {
  title: string;
  children: ReactNode;
}

export function GlossaryWindowShell({ title, children }: GlossaryWindowShellProps) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-[#020617] dark:text-white">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col overflow-hidden border-x border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        <header className="[-webkit-app-region:drag] flex items-center justify-between border-b border-gray-100 px-6 py-5 dark:border-gray-800">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            {title}
          </h1>
          <button
            onClick={() => window.electronAPI?.closeGlossaryWindow()}
            className="[-webkit-app-region:no-drag] rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
