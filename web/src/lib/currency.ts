import snapshot from "@/data/exchangeRates.json";

export const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CNY",
  "INR",
  "AUD",
  "CAD",
  "CHF",
  "KRW",
  "BRL",
  "MXN",
  "ZAR",
  "HKD",
  "SGD",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "RON",
  "TRY",
  "ILS",
  "THB",
  "IDR",
  "PHP",
  "MYR",
  "NZD",
  "ISK",
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number];

export const CURRENCY_KEY = "hestia-currency";
export const RATES_KEY = "hestia-rates";
const DAY_MS = 24 * 60 * 60 * 1000;

export type RateTable = Record<string, number>;

export const rateSnapshot: { date: string; rates: RateTable } = {
  date: snapshot.date,
  rates: { ...snapshot.rates, USD: 1 },
};

export function isCurrency(value: string | null | undefined): value is CurrencyCode {
  return !!value && (CURRENCIES as readonly string[]).includes(value);
}

export function readSavedCurrency(): CurrencyCode {
  if (typeof window === "undefined") return "USD";
  const saved = localStorage.getItem(CURRENCY_KEY);
  return isCurrency(saved) ? saved : "USD";
}

type RateCache = { savedAt: number; date: string; rates: RateTable };

export function readRateCache(): RateCache | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(RATES_KEY) ?? "") as RateCache;
    if (!parsed?.rates || typeof parsed.savedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function mergeRates(live: RateTable | undefined): RateTable {
  return { ...rateSnapshot.rates, ...live, USD: 1 };
}

export function convertUsd(usd: number, currency: string, rates: RateTable) {
  if (currency === "USD") return usd;
  const rate = rates[currency];
  if (!rate || !Number.isFinite(rate)) return usd;
  return usd * rate;
}

export function formatConverted(
  usd: number,
  currency: string,
  rates: RateTable,
  locale: string,
  kind: "compact" | "standard",
) {
  const value = convertUsd(usd, currency, rates);
  const options: Intl.NumberFormatOptions = { style: "currency", currency };
  if (kind === "compact") {
    options.notation = "compact";
    options.maximumFractionDigits = 1;
  }
  return new Intl.NumberFormat(locale, options).format(value);
}

export { DAY_MS };
