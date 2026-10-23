export const LOCALES = [
  { id: "en", name: "English" },
  { id: "es", name: "Español" },
  { id: "zh-Hans", name: "中文（简体）" },
  { id: "hi", name: "हिन्दी" },
  { id: "ar", name: "العربية" },
  { id: "fr", name: "Français" },
  { id: "bn", name: "বাংলা" },
  { id: "pt", name: "Português" },
  { id: "ru", name: "Русский" },
  { id: "ur", name: "اردو" },
  { id: "id", name: "Bahasa Indonesia" },
  { id: "de", name: "Deutsch" },
  { id: "ja", name: "日本語" },
  { id: "sw", name: "Kiswahili" },
  { id: "mr", name: "मराठी" },
  { id: "te", name: "తెలుగు" },
  { id: "tr", name: "Türkçe" },
  { id: "ta", name: "தமிழ்" },
  { id: "vi", name: "Tiếng Việt" },
  { id: "ko", name: "한국어" },
  { id: "it", name: "Italiano" },
  { id: "th", name: "ไทย" },
  { id: "gu", name: "ગુજરાતી" },
  { id: "pl", name: "Polski" },
  { id: "uk", name: "Українська" },
  { id: "fa", name: "فارسی" },
  { id: "ml", name: "മലയാളം" },
  { id: "kn", name: "ಕನ್ನಡ" },
  { id: "pa", name: "ਪੰਜਾਬੀ" },
  { id: "nl", name: "Nederlands" },
  { id: "ha", name: "Hausa" },
  { id: "am", name: "አማርኛ" },
  { id: "yo", name: "Yorùbá" },
  { id: "ms", name: "Bahasa Melayu" },
  { id: "ne", name: "नेपाली" },
  { id: "el", name: "Ελληνικά" },
  { id: "he", name: "עברית" },
  { id: "sv", name: "Svenska" },
  { id: "cs", name: "Čeština" },
  { id: "hu", name: "Magyar" },
  { id: "ro", name: "Română" },
  { id: "fil", name: "Filipino" },
  { id: "my", name: "မြန်မာ" },
  { id: "km", name: "ខ្មែរ" },
  { id: "si", name: "සිංහල" },
] as const;

export type LocaleId = (typeof LOCALES)[number]["id"];

const IDS = new Set<string>(LOCALES.map((locale) => locale.id));

export const RTL_LOCALES = new Set<LocaleId>(["ar", "ur", "fa", "he"]);

export const LOCALE_COOKIE = "hestia-locale";

export function isLocale(value: string | undefined | null): value is LocaleId {
  return !!value && IDS.has(value);
}

export function resolveLocale(value: string | undefined | null): LocaleId {
  return isLocale(value) ? value : "en";
}

export function textDirection(locale: LocaleId): "rtl" | "ltr" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}
