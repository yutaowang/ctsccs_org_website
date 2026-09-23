import { createContext, useContext, useMemo, useState, type PropsWithChildren } from "react";

export type Language = "en" | "zh";
type LanguageValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (english: string, chinese: string) => string;
};

const LanguageContext = createContext<LanguageValue | null>(null);
const STORAGE_KEY = "sccs_mobile_language";

function initialLanguage(): Language {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === "zh" ? "zh" : "en";
  } catch {
    return "en";
  }
}

export function LanguageProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);
  const value = useMemo<LanguageValue>(() => ({
    language,
    setLanguage: (next) => {
      setLanguageState(next);
      try { globalThis.localStorage?.setItem(STORAGE_KEY, next); } catch { /* Keep the in-memory choice. */ }
    },
    t: (english, chinese) => language === "zh" ? chinese : english,
  }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("LanguageProvider is missing");
  return value;
}
