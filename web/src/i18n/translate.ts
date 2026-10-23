import type { LocaleId } from "./locales";

export type Vars = Record<string, string | number>;

export type PluralForms = {
  other: string;
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
};

export type Messages = {
  [key: string]: string | PluralForms | Messages;
};

const PLURAL_CATEGORIES = ["zero", "one", "two", "few", "many", "other"] as const;

export function isPlural(value: unknown): value is PluralForms {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.other !== "string") return false;
  return Object.entries(record).every(
    ([key, item]) =>
      (PLURAL_CATEGORIES as readonly string[]).includes(key) && (item === undefined || typeof item === "string"),
  );
}

function lookup(tree: Messages | undefined, key: string): string | PluralForms | undefined {
  if (!tree) return undefined;
  const parts = key.split(".");
  let node: string | PluralForms | Messages | undefined = tree;
  for (const part of parts) {
    if (!node || typeof node === "string" || isPlural(node)) return undefined;
    node = node[part];
  }
  if (typeof node === "string" || isPlural(node)) return node;
  return undefined;
}

function fill(template: string, vars: Vars | undefined) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (token, name: string) =>
    vars[name] === undefined ? token : String(vars[name]),
  );
}

export function translate(
  primary: Messages,
  fallback: Messages,
  key: string,
  vars: Vars | undefined,
  locale: LocaleId | string,
) {
  const value = lookup(primary, key) ?? lookup(fallback, key);
  if (value === undefined) return key;
  if (typeof value === "string") return fill(value, vars);
  const count = Number(vars?.count ?? 0);
  const category = new Intl.PluralRules(locale).select(count);
  return fill(value[category] ?? value.other, vars);
}
