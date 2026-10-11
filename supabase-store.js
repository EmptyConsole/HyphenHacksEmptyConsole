// Shared scan storage in Supabase, so every computer's scans reach the same map.
//
// Table: public.scans (id uuid, created_at timestamptz, json json).
// Each row's json is { meta, scan }: `meta` is the summary the map lists (same shape as
// <id>.meta.json), `scan` is the detector's FeatureCollection.
//
// Reading a scan id out of `json` means Postgres parses every row's whole document, which
// is slow once scans add up. So web/data/scans/supabase-index.json maps each row's uuid to
// its scan id, and rows are found by uuid instead. The map uses the same file.
//
// Keys come from .env at the repo root (git-ignored):
//   SUPABASE_URL=https://<project>.supabase.co
//   SUPABASE_SECRET_KEY=sb_secret_...

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = join(ROOT, ".env");
const INDEX_FILE = join(ROOT, "web", "data", "scans", "supabase-index.json");
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const URL_BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY;

/** False when no keys are configured: callers keep working with local files only. */
export const supabaseEnabled = Boolean(URL_BASE && KEY);

async function request(path, init = {}) {
  const response = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    signal: AbortSignal.timeout(60_000),
    headers: {
      apikey: KEY,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

/** { [row uuid]: scan id } */
function readIndex() {
  try {
    return JSON.parse(readFileSync(INDEX_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeIndex(index) {
  writeFileSync(`${INDEX_FILE}.tmp`, JSON.stringify(index, null, 1));
  renameSync(`${INDEX_FILE}.tmp`, INDEX_FILE);
}

/** The row uuid holding this scan, from the index; slow lookup inside json only as a last resort. */
async function findRow(scanId, index) {
  const known = Object.keys(index).find((rowId) => index[rowId] === scanId);
  if (known) return known;
  const rows = await request(`scans?select=id&json->meta->>id=eq.${encodeURIComponent(scanId)}&limit=1`);
  return rows[0]?.id ?? null;
}

/**
 * Save a scan to Supabase. `isNew` skips looking for an existing row: a freshly made scan
 * id can't be in the table yet. A re-run replaces its row instead of adding a second one.
 */
export async function upsertScan(meta, collection, { isNew = false } = {}) {
  if (!supabaseEnabled) return "skipped";
  const json = { meta, scan: collection };
  const index = readIndex();
  const rowId = isNew ? null : await findRow(meta.id, index);
  if (rowId) {
    await request(`scans?id=eq.${rowId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ json }),
    });
    index[rowId] = meta.id;
    writeIndex(index);
    return "updated";
  }
  const [row] = await request("scans?select=id", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ json }),
  });
  index[row.id] = meta.id;
  writeIndex(index);
  return "inserted";
}
