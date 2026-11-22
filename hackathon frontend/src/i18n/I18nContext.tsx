import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { en, type TranslationKey } from './en';
import { ur } from './ur';

export type Lang = 'en' | 'ur';
export type Dir = 'ltr' | 'rtl';

const STORAGE_KEY = 'dastak.lang';
const DICTS: Record<Lang, Record<TranslationKey, string>> = { en, ur };

interface I18nValue {
  lang: Lang;
  dir: Dir;
  isRtl: boolean;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function readInitialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'ur') return stored;
  } catch {
    /* storage unavailable */
  }
  return 'en';
}

export function applyLangToDocument(lang: Lang) {
  const root = document.documentElement;
  root.lang = lang;
  root.dir = lang === 'ur' ? 'rtl' : 'ltr';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readInitialLang);

  useEffect(() => {
    applyLangToDocument(lang);
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<I18nValue>(() => {
    const dict = DICTS[lang];
    return {
      lang,
      dir: lang === 'ur' ? 'rtl' : 'ltr',
      isRtl: lang === 'ur',
      setLang,
      t: (key, vars) => {
        let out = dict[key] ?? en[key] ?? key;
        if (vars) {
          for (const [k, v] of Object.entries(vars)) {
            out = out.split(`{${k}}`).join(String(v));
          }
        }
        return out;
      },
    };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
