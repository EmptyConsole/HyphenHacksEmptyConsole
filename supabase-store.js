// Shared scan storage in Supabase, so every computer's scans reach the same map.
//
// Table: public.scans (id uuid, created_at timestamptz, json json).
// Each row's json is { meta, scan }: `meta` is the summary the map lists (same shape as
// <id>.meta.json), `scan` is the detector's FeatureCollection. A scan is found by
// json->meta->>id, so a re-run replaces its row instead of adding a second one.
//
// Keys come from .env at the repo root (git-ignored):
//   SUPABASE_URL=https://<project>.supabase.co
//   SUPABASE_SECRET_KEY=sb_secret_...

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ENV_FILE = join(dirname(fileURLToPath(import.meta.url)), ".env");
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const URL_BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY;

/** False when no keys are configured: callers keep working with local files only. */
export const supabaseEnabled = Boolean(URL_BASE && KEY);

async function request(path, init = {}) {
  const response = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
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

/** Insert the scan, or replace the row that already holds this scan id. */
export async function upsertScan(meta, collection) {
  if (!supabaseEnabled) return "skipped";
  const json = { meta, scan: collection };
  const existing = await request(
    `scans?select=id&json->meta->>id=eq.${encodeURIComponent(meta.id)}&limit=1`
  );
  if (existing.length) {
    await request(`scans?id=eq.${existing[0].id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ json }),
    });
    return "updated";
  }
  await request("scans", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ json }),
  });
  return "inserted";
}
