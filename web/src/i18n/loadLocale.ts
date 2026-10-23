import type { LocaleId } from "./locales";
import type { Messages } from "./translate";

function unwrap(mod: unknown): Messages {
  if (mod && typeof mod === "object" && "default" in mod) {
    const nested = (mod as { default?: unknown }).default;
    if (nested && typeof nested === "object") return nested as Messages;
  }
  return mod as Messages;
}

export async function loadLocale(locale: LocaleId): Promise<Messages> {
  switch (locale) {
    case "es":
      return unwrap(await import("./messages/es.json"));
    case "zh-Hans":
      return unwrap(await import("./messages/zh-Hans.json"));
    case "hi":
      return unwrap(await import("./messages/hi.json"));
    case "ar":
      return unwrap(await import("./messages/ar.json"));
    case "fr":
      return unwrap(await import("./messages/fr.json"));
    case "bn":
      return unwrap(await import("./messages/bn.json"));
    case "pt":
      return unwrap(await import("./messages/pt.json"));
    case "ru":
      return unwrap(await import("./messages/ru.json"));
    case "ur":
      return unwrap(await import("./messages/ur.json"));
    case "id":
      return unwrap(await import("./messages/id.json"));
    case "de":
      return unwrap(await import("./messages/de.json"));
    case "ja":
      return unwrap(await import("./messages/ja.json"));
    case "sw":
      return unwrap(await import("./messages/sw.json"));
    case "mr":
      return unwrap(await import("./messages/mr.json"));
    case "te":
      return unwrap(await import("./messages/te.json"));
    case "tr":
      return unwrap(await import("./messages/tr.json"));
    case "ta":
      return unwrap(await import("./messages/ta.json"));
    case "vi":
      return unwrap(await import("./messages/vi.json"));
    case "ko":
      return unwrap(await import("./messages/ko.json"));
    case "it":
      return unwrap(await import("./messages/it.json"));
    case "th":
      return unwrap(await import("./messages/th.json"));
    case "gu":
      return unwrap(await import("./messages/gu.json"));
    case "pl":
      return unwrap(await import("./messages/pl.json"));
    case "uk":
      return unwrap(await import("./messages/uk.json"));
    case "fa":
      return unwrap(await import("./messages/fa.json"));
    case "ml":
      return unwrap(await import("./messages/ml.json"));
    case "kn":
      return unwrap(await import("./messages/kn.json"));
    case "pa":
      return unwrap(await import("./messages/pa.json"));
    case "nl":
      return unwrap(await import("./messages/nl.json"));
    case "ha":
      return unwrap(await import("./messages/ha.json"));
    case "am":
      return unwrap(await import("./messages/am.json"));
    case "yo":
      return unwrap(await import("./messages/yo.json"));
    case "ms":
      return unwrap(await import("./messages/ms.json"));
    case "ne":
      return unwrap(await import("./messages/ne.json"));
    case "el":
      return unwrap(await import("./messages/el.json"));
    case "he":
      return unwrap(await import("./messages/he.json"));
    case "sv":
      return unwrap(await import("./messages/sv.json"));
    case "cs":
      return unwrap(await import("./messages/cs.json"));
    case "hu":
      return unwrap(await import("./messages/hu.json"));
    case "ro":
      return unwrap(await import("./messages/ro.json"));
    case "fil":
      return unwrap(await import("./messages/fil.json"));
    case "my":
      return unwrap(await import("./messages/my.json"));
    case "km":
      return unwrap(await import("./messages/km.json"));
    case "si":
      return unwrap(await import("./messages/si.json"));
    default:
      return unwrap(await import("./messages/en.json"));
  }
}
