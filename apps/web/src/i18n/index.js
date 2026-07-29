import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { translations, DEFAULT_LOCALE, AVAILABLE_LOCALES } from './translations';

const STORAGE_KEY = 'innersun.locale';

const translate = (locale, key) =>
    translations[locale]?.[key] ?? translations[DEFAULT_LOCALE][key] ?? key;

// Default context works without a provider (returns English), so components
// and unit tests can render standalone.
const LanguageContext = createContext({
    locale: DEFAULT_LOCALE,
    setLocale: () => {},
    t: (key) => translate(DEFAULT_LOCALE, key),
});

export const LanguageProvider = ({ children }) => {
    const [locale, setLocaleState] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = window.localStorage.getItem(STORAGE_KEY);
            if (saved && translations[saved]) return saved;
        }
        return DEFAULT_LOCALE;
    });

    const setLocale = useCallback((next) => {
        if (!translations[next]) return;
        setLocaleState(next);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(STORAGE_KEY, next);
        }
        if (typeof document !== 'undefined') {
            document.documentElement.lang = next;
        }
    }, []);

    const t = useCallback((key) => translate(locale, key), [locale]);

    const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

    return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useI18n = () => useContext(LanguageContext);

export { AVAILABLE_LOCALES };
