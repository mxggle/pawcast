import { useTranslation } from "react-i18next";
import { ArrowLeft, BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "../components/layout/AppLayout";
import { useTranscriptStore } from "../stores/transcriptStore";
import { GlossaryContent } from "../components/glossary/GlossaryContent";

export const GlossaryPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const glossaryEntries = useTranscriptStore((state) => state.glossaryEntries);

  return (
    <AppLayout bottomPaddingClassName="pb-8">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-2 py-6 sm:px-4">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
            >
              <ArrowLeft size={16} />
              {t("common.back")}
            </button>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-400">
                <BookOpen className="h-[18px] w-[18px]" />
              </span>
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
                {t("glossary.title")}
              </h1>
            </div>
            <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
              {t("glossary.description")}
            </p>
          </div>

          <div className="rounded-full bg-primary-500/10 px-3 py-1 text-sm font-medium text-primary-600 dark:text-primary-400">
            {t("glossary.entryCount", { count: glossaryEntries.length })}
          </div>
        </div>

        <GlossaryContent />
      </main>
    </AppLayout>
  );
};
