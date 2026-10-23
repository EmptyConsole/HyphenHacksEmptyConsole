const compact = new Map<string, Intl.NumberFormat>();
const integer = new Map<string, Intl.NumberFormat>();
const currency = new Map<string, Intl.NumberFormat>();
const dollars = new Map<string, Intl.NumberFormat>();

function cached(
  store: Map<string, Intl.NumberFormat>,
  key: string,
  locale: string,
  options: Intl.NumberFormatOptions,
) {
  let format = store.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    store.set(key, format);
  }
  return format;
}

export const formatPopulation = (n: number, locale = "en") =>
  cached(compact, locale, locale, { notation: "compact", maximumFractionDigits: 1 }).format(n);

export const formatCount = (n: number, locale = "en") => cached(integer, locale, locale, {}).format(n);

export const formatCost = (n: number, locale = "en") =>
  cached(currency, locale, locale, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);

export const formatDollars = (n: number, locale = "en") =>
  cached(dollars, locale, locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

const usdExact = new Map<string, Intl.NumberFormat>();

export const formatUsd = (n: number, locale = "en", maximumFractionDigits = 2) =>
  cached(usdExact, `${locale}:${maximumFractionDigits}`, locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: maximumFractionDigits,
    maximumFractionDigits,
  }).format(n);
