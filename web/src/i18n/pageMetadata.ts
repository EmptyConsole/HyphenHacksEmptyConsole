import type { Metadata } from "next";
import { cookies } from "next/headers";
import en from "./messages/en.json";
import { loadLocale } from "./loadLocale";
import { LOCALE_COOKIE, resolveLocale } from "./locales";
import { translate, type Messages } from "./translate";

const fallback = en as Messages;

/** Tab title from the locale cookie, so a reload stays in the chosen language. */
export async function pageMetadata(titleKey: string, descriptionKey = "meta.description"): Promise<Metadata> {
  const jar = await cookies();
  const locale = resolveLocale(jar.get(LOCALE_COOKIE)?.value);
  const messages = await loadLocale(locale);
  return {
    title: translate(messages, fallback, titleKey, undefined, locale),
    description: translate(messages, fallback, descriptionKey, undefined, locale),
  };
}
