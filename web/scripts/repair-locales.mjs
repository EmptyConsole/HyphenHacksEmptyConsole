/**
 * Retranslates catalog strings that lost {placeholders} or the name Hestia.
 * Run from web/: node scripts/repair-locales.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../src/i18n/messages");
const english = JSON.parse(readFileSync(join(dir, "en.json"), "utf8"));
const CODES = {
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

function walk(node, path, out) {
  if (typeof node === "string") {
    out.push([path, node]);
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) walk(value, path ? `${path}.${key}` : key, out);
  }
}

function placeholders(text) {
  return [...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(",");
}

function needsRepair(source, translated) {
  if (placeholders(source) !== placeholders(translated)) return true;
  if (source.includes("Hestia") && !String(translated).includes("Hestia")) return true;
  if (String(translated).includes("⟦") || String(translated).includes("<#>")) return true;
  return false;
}

function protect(text) {
  const slots = [];
  const safe = text
    .replaceAll("Hestia", () => {
      const index = slots.length;
      slots.push("Hestia");
      return `__H${index}__`;
    })
    .replace(/\{(\w+)\}/g, (_, name) => {
      const index = slots.length;
      slots.push(`{${name}}`);
      return `__P${index}__`;
    });
  return { safe, slots };
}

function restore(text, slots) {
  return text.replace(/_+\s*([HP])\s*(\d+)\s*_+/g, (token, _kind, index) => slots[Number(index)] ?? token);
}

async function translateBatch(texts, target) {
  const packed = texts.map((text) => protect(text));
  const query = packed.map((item) => item.safe).join("\n<#>#\n");
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`${target} ${response.status}`);
  const data = await response.json();
  const joined = data[0].map((part) => part[0]).join("");
  const pieces = joined.split(/\s*<\s*#\s*>\s*#\s*/);
  if (pieces.length !== texts.length) throw new Error(`split ${pieces.length} != ${texts.length}`);
  return pieces.map((piece, index) => restore(piece.trim(), packed[index].slots));
}

function assign(tree, path, text) {
  const parts = path.split(".");
  let node = tree;
  for (let i = 0; i < parts.length - 1; i++) node = node[parts[i]];
  node[parts[parts.length - 1]] = text;
}

const enItems = [];
walk(english, "", enItems);
let repaired = 0;
let keptEnglish = 0;

for (const file of readdirSync(dir).filter((name) => name.endsWith(".json") && name !== "en.json")) {
  const locale = file.replace(/\.json$/, "");
  const tree = JSON.parse(readFileSync(join(dir, file), "utf8"));
  const current = [];
  walk(tree, "", current);
  const got = new Map(current);
  const jobs = enItems.filter(([path, text]) => needsRepair(text, got.get(path) ?? ""));
  if (!jobs.length) continue;
  process.stdout.write(`${locale} ${jobs.length}… `);
  const output = new Array(jobs.length);
  for (let index = 0; index < jobs.length; index += 12) {
    const slice = jobs.slice(index, index + 12).map((job) => job[1]);
    let translated;
    try {
      translated = await translateBatch(slice, CODES[locale]);
    } catch {
      translated = [];
      for (const text of slice) {
        try {
          translated.push((await translateBatch([text], CODES[locale]))[0]);
        } catch {
          translated.push(text);
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    translated.forEach((text, offset) => {
      output[index + offset] = text;
    });
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  jobs.forEach(([path, text], index) => {
    const next = output[index];
    if (next && !needsRepair(text, next)) {
      assign(tree, path, next);
      repaired += 1;
    } else {
      assign(tree, path, text);
      keptEnglish += 1;
    }
  });
  writeFileSync(join(dir, file), `${JSON.stringify(tree, null, 2)}\n`);
  console.log("done");
}

console.log({ repaired, keptEnglish });
