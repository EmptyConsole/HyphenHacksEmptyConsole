"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import enMessages from "./messages/en.json";
import { loadLocale } from "./loadLocale";
import { LOCALE_COOKIE, isLocale, textDirection, type LocaleId } from "./locales";
import { makeTranslator, pageTitleKey } from "./place";
import type { Messages, Vars } from "./translate";

type LocaleContextValue = {
  locale: LocaleId;
  setLocale: (locale: LocaleId) => void;
  t: (key: string, vars?: Vars) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

const fallback = enMessages as Messages;

function persistLocale(locale: LocaleId) {
  document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=31536000;samesite=lax`;
  localStorage.setItem(LOCALE_COOKIE, locale);
}

export default function LocaleProvider({
  initialLocale,
  initialMessages,
  children,
}: {
  initialLocale: LocaleId;
  initialMessages: Messages;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [locale, setLocaleState] = useState(initialLocale);
  const [messages, setMessages] = useState(initialMessages);

  const applyLocale = useCallback((next: LocaleId) => {
    persistLocale(next);
    const ready = next === "en" ? Promise.resolve(fallback) : loadLocale(next);
    void ready.then((nextMessages) => {
      setMessages(nextMessages);
      setLocaleState(next);
    });
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(LOCALE_COOKIE);
    if (isLocale(stored) && stored !== initialLocale) applyLocale(stored);
    else if (!isLocale(stored)) localStorage.setItem(LOCALE_COOKIE, initialLocale);
  }, [applyLocale, initialLocale]);

  const t = useCallback(
    (key: string, vars?: Vars) => makeTranslator(messages, fallback, locale)(key, vars),
    [messages, locale],
  );

  useEffect(() => {
    const title = t(pageTitleKey(pathname));
    document.documentElement.lang = locale;
    document.documentElement.dir = textDirection(locale);
    document.title = title;
    const node = document.querySelector("title");
    if (!node) return;
    const observer = new MutationObserver(() => {
      if (document.title !== title) document.title = title;
    });
    observer.observe(node, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [locale, pathname, t]);

  const value = useMemo(() => ({ locale, setLocale: applyLocale, t }), [locale, applyLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside LocaleProvider");
  return value;
}
