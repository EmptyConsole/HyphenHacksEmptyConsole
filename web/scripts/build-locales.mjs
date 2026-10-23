/**
 * Fills locale catalogs from en.json. Placeholders like {name} are kept.
 * Run from web/: node scripts/build-locales.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../src/i18n/messages");
const english = JSON.parse(readFileSync(join(root, "en.json"), "utf8"));

const TARGETS = {
  es: "es",
  "zh-Hans": "zh-CN",
  hi: "hi",
  ar: "ar",
  fr: "fr",
  bn: "bn",
  pt: "pt",
  ru: "ru",
  ur: "ur",
  id: "id",
  de: "de",
  ja: "ja",
  sw: "sw",
  mr: "mr",
  te: "te",
  tr: "tr",
  ta: "ta",
  vi: "vi",
  ko: "ko",
  it: "it",
  th: "th",
  gu: "gu",
  pl: "pl",
  uk: "uk",
  fa: "fa",
  ml: "ml",
  kn: "kn",
  pa: "pa",
  nl: "nl",
  ha: "ha",
  am: "am",
  yo: "yo",
  ms: "ms",
  ne: "ne",
  el: "el",
  he: "iw",
  sv: "sv",
  cs: "cs",
  hu: "hu",
  ro: "ro",
  fil: "tl",
  my: "my",
  km: "km",
  si: "si",
};

const PLURAL = new Set(["zero", "one", "two", "few", "many", "other"]);

function isPlural(value) {
  return value && typeof value === "object" && typeof value.other === "string" && Object.keys(value).every((key) => PLURAL.has(key));
}

function collect(node, path, out) {
  if (typeof node === "string") {
    out.push({ path, text: node });
    return;
  }
  if (isPlural(node)) {
    for (const [key, text] of Object.entries(node)) out.push({ path: `${path}\u0000${key}`, text });
    return;
  }
  for (const [key, value] of Object.entries(node)) collect(value, path ? `${path}.${key}` : key, out);
}

function protect(text) {
  const tokens = [];
  const safe = text.replace(/\{(\w+)\}/g, (_, name) => {
    const token = `⟦${tokens.length}⟧`;
    tokens.push(`{${name}}`);
    return token;
  });
  return { safe, tokens };
}

function restore(text, tokens) {
  return text.replace(/⟦\s*(\d+)\s*⟧/g, (_, index) => tokens[Number(index)] ?? "");
}

async function translateBatch(texts, tl) {
  const packed = texts.map((text) => protect(text).safe);
  const tokens = texts.map((text) => protect(text).tokens);
  const query = packed.join("\n<#>#\n");
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`${tl} ${response.status}`);
  const data = await response.json();
  const joined = data[0].map((part) => part[0]).join("");
  const pieces = joined.split(/\s*<\s*#\s*>\s*#\s*/);
  if (pieces.length !== texts.length) {
    throw new Error(`${tl} split ${pieces.length} != ${texts.length}`);
  }
  return pieces.map((piece, index) => restore(piece.trim(), tokens[index]));
}

async function translateAll(items, tl) {
  const output = new Array(items.length);
  let index = 0;
  const size = 24;
  while (index < items.length) {
    const slice = items.slice(index, index + size).map((item) => item.text);
    let translated;
    try {
      translated = await translateBatch(slice, tl);
    } catch {
      translated = [];
      for (const text of slice) {
        try {
          const [one] = await translateBatch([text], tl);
          translated.push(one);
        } catch {
          translated.push(text);
        }
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
    }
    translated.forEach((text, offset) => {
      output[index + offset] = text;
    });
    index += size;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return output;
}

function assign(tree, path, text) {
  const [head, plural] = path.split("\u0000");
  const parts = head.split(".");
  let node = tree;
  for (let i = 0; i < parts.length - 1; i++) node = node[parts[i]];
  const leaf = parts[parts.length - 1];
  if (plural) node[leaf][plural] = text;
  else node[leaf] = text;
}

const items = [];
collect(english, "", items);
const only = process.argv.slice(2);

for (const [locale, code] of Object.entries(TARGETS)) {
  if (only.length && !only.includes(locale)) continue;
  process.stdout.write(`${locale}… `);
  const translated = await translateAll(items, code);
  const next = structuredClone(english);
  items.forEach((item, index) => assign(next, item.path, translated[index] || item.text));
  writeFileSync(join(root, `${locale}.json`), `${JSON.stringify(next, null, 2)}\n`);
  const sample = translated.find((text, index) => text && text !== items[index].text);
  console.log(sample ? "ok" : "unchanged");
}
