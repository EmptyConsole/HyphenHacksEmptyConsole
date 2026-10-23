import type { LocaleId } from "./locales";
import { translate, type Messages, type Vars } from "./translate";

type T = (key: string, vars?: Vars) => string;

export function localizedCountryName(id: string, fallback: string, locale: string) {
  if (!/^\d+$/.test(id)) return fallback;
  try {
    const name = new Intl.DisplayNames([locale], { type: "region" }).of(id.padStart(3, "0"));
    if (!name || name === id || name === id.padStart(3, "0")) return fallback;
    return name;
  } catch {
    return fallback;
  }
}

/** Translates generated labels. Data names (clinics, villages, papers) stay as stored. */
export function presentPlaceName(name: string, t: T, locale: string, id?: string, level?: string) {
  if (level === "country" && id) return localizedCountryName(id, name, locale);
  if (name === "Unnamed clinic") return t("map.names.unnamedClinic");
  const scanArea = /^Scan area (\d+)$/.exec(name);
  if (scanArea) return t("map.names.scanArea", { n: scanArea[1] });
  const unnamed = /^Unnamed settlement (\d+)$/.exec(name);
  if (unnamed) return t("map.names.unnamedSettlement", { n: unnamed[1] });
  const scanIn = /^Scan in (.+)$/.exec(name);
  if (scanIn) return t("map.names.scanIn", { place: scanIn[1] });
  return name;
}

export function currencyOptionLabel(code: string, locale: string) {
  try {
    const name = new Intl.DisplayNames([locale], { type: "currency" }).of(code);
    return name ? `${code} · ${name}` : code;
  } catch {
    return code;
  }
}

export function pageTitleKey(pathname: string) {
  if (pathname.startsWith("/problem")) return "meta.problemTitle";
  if (pathname.startsWith("/solution")) return "meta.solutionTitle";
  if (pathname.startsWith("/algorithm")) return "meta.algorithmTitle";
  if (pathname.startsWith("/donate")) return "meta.donateTitle";
  return "meta.title";
}

export function makeTranslator(messages: Messages, fallback: Messages, locale: LocaleId) {
  return (key: string, vars?: Vars) => translate(messages, fallback, key, vars, locale);
}
