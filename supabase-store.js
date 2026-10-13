// Shared scan storage in Supabase, so every computer's scans reach the same map.
//
// Table public.scans: id uuid, created_at, json json ({ meta, scan }), plus two small
// columns a trigger fills from json (see supabase-speedup.sql): scan_id text (unique) and
// meta jsonb. Lookups use scan_id, so the big json is only read when a whole scan is needed.
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

/**
 * Insert the scan, or replace the row that already holds its scan id. The trigger sets
 * scan_id from json before the uniqueness check, so this is a single request.
 */
export async function upsertScan(meta, collection) {
  if (!supabaseEnabled) return "skipped";
  const response = await fetch(`${URL_BASE}/rest/v1/scans?on_conflict=scan_id`, {
    method: "POST",
    signal: AbortSignal.timeout(60_000),
    headers: {
      apikey: KEY,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ json: { meta, scan: collection } }),
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return "saved";
}

/**
 * Save a joined clinic tour (table public.clinic_tours, see supabase-tours.sql). Until that
 * table exists this fails, and the tour still lives in web/data/tours/.
 */
export async function upsertClinicTour(record) {
  if (!supabaseEnabled) return "skipped";
  const response = await fetch(`${URL_BASE}/rest/v1/clinic_tours?on_conflict=clinic_id`, {
    method: "POST",
    signal: AbortSignal.timeout(60_000),
    headers: {
      apikey: KEY,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ clinic_id: record.clinicId, summary: record.summary, tour: record.tour }),
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return "saved";
}

async function select(query) {
  const response = await fetch(`${URL_BASE}/rest/v1/${query}`, {
    signal: AbortSignal.timeout(60_000),
    headers: { apikey: KEY },
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

/** Every scan's small summary (the meta column), without the big json. */
export async function listRemoteMetas() {
  if (!supabaseEnabled) return [];
  return (await select("scans?select=meta")).map((row) => row.meta).filter((meta) => meta?.id);
}

/** One scan's full detector output, or null. */
export async function fetchRemoteScan(scanId) {
  const rows = await select(`scans?select=scan:json->scan&scan_id=eq.${encodeURIComponent(scanId)}`);
  return rows[0]?.scan ?? null;
}
