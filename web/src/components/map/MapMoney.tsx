"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { presentPlaceName } from "@/i18n/place";
import type { ExplainCopy } from "@/components/map/explain";
import {
  CURRENCY_KEY,
  DAY_MS,
  RATES_KEY,
  formatConverted,
  isCurrency,
  mergeRates,
  rateSnapshot,
  readRateCache,
  readSavedCurrency,
  type CurrencyCode,
  type RateTable,
} from "@/lib/currency";
import { formatCount, formatPopulation } from "@/lib/format";

type MapMoneyValue = {
  currency: CurrencyCode;
  setCurrency: (code: CurrencyCode) => void;
  copy: ExplainCopy;
};

const MapMoneyContext = createContext<MapMoneyValue | null>(null);

export function MapMoneyProvider({ children }: { children: React.ReactNode }) {
  const { locale, t } = useLocale();
  const [currency, setCurrencyState] = useState<CurrencyCode>(readSavedCurrency);
  const [rates, setRates] = useState<RateTable>(rateSnapshot.rates);

  useEffect(() => {
    const saved = readSavedCurrency();
    setCurrencyState((current) => (current === saved ? current : saved));
    const cached = readRateCache();
    if (cached) setRates(mergeRates(cached.rates));
    if (cached && Date.now() - cached.savedAt < DAY_MS) return;

    let cancel = false;
    fetch("https://api.frankfurter.app/latest?from=USD")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("rates"))))
      .then((data: { date?: string; rates?: RateTable }) => {
        if (cancel || !data.rates) return;
        const next = mergeRates(data.rates);
        localStorage.setItem(
          RATES_KEY,
          JSON.stringify({ savedAt: Date.now(), date: data.date ?? rateSnapshot.date, rates: next }),
        );
        setRates(next);
      })
      .catch(() => {
        if (!cancel) setRates(rateSnapshot.rates);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const setCurrency = useCallback((code: CurrencyCode) => {
    setCurrencyState(code);
    localStorage.setItem(CURRENCY_KEY, code);
  }, []);

  const copy = useMemo<ExplainCopy>(() => {
    const compact = (usd: number) => formatConverted(usd, currency, rates, locale, "compact");
    const exact = (usd: number) => formatConverted(usd, currency, rates, locale, "standard");
    return {
      t,
      money: compact,
      exact,
      people: (n) => formatPopulation(n, locale),
      count: (n) => formatCount(n, locale),
      km: (meters) => t("common.km", { n: (meters / 1000).toFixed(1) }),
      pct: (fraction) =>
        new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(fraction),
      place: (name, id, level) => presentPlaceName(name, t, locale, id, level),
    };
  }, [currency, locale, rates, t]);

  const value = useMemo(() => ({ currency, setCurrency, copy }), [currency, setCurrency, copy]);

  return <MapMoneyContext.Provider value={value}>{children}</MapMoneyContext.Provider>;
}

export function useMapMoney() {
  const value = useContext(MapMoneyContext);
  if (!value) throw new Error("useMapMoney must be used inside MapMoneyProvider");
  return value;
}

export function readCurrencyCode(value: string): CurrencyCode {
  return isCurrency(value) ? value : "USD";
}
