import React from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { cn } from "../../utils/cn";

const languages = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "zh", name: "Chinese", nativeName: "中文" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
];

export const LanguageSelector: React.FC = () => {
  const { i18n } = useTranslation();

  const handleLanguageChange = (languageCode: string) => {
    i18n.changeLanguage(languageCode);
  };

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
      {languages.map((language) => {
        const isActive = i18n.language === language.code;

        return (
          <button
            key={language.code}
            onClick={() => handleLanguageChange(language.code)}
            className={cn(
              "relative flex flex-col items-start rounded-xl border-[1.5px] p-4 text-left transition-all duration-200",
              isActive
                ? "border-primary bg-primary/10"
                : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900/40 dark:hover:border-gray-600"
            )}
          >
            <span
              className={cn(
                "absolute right-2.5 top-2.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-primary text-white transition-all duration-200",
                isActive ? "scale-100 opacity-100" : "scale-50 opacity-0"
              )}
            >
              <Check className="h-2.5 w-2.5" strokeWidth={3.2} />
            </span>
            <span
              className={cn(
                "text-base font-bold tracking-tight",
                isActive
                  ? "text-primary dark:text-primary-300"
                  : "text-gray-900 dark:text-white"
              )}
            >
              {language.nativeName}
            </span>
            <span
              className={cn(
                "mt-1 text-[10.5px] font-bold uppercase tracking-[0.12em]",
                isActive ? "text-primary/70" : "text-gray-400"
              )}
            >
              {language.name}
            </span>
          </button>
        );
      })}
    </div>
  );
};
