import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ScanMeta, ScanRequest, ScanSummary } from "@/data/types";
import { detectVillages } from "@/lib/detector/detectVillages.mjs";

/**
 * Server-only. Scans live in web/data/scans as `<id>.json` (detector output) plus
 * `<id>.meta.json` (summary); scan-batch.js writes the same files. Supabase (table
 * public.scans, one row per scan, json = { meta, scan }) shares scans between computers:
 * the map lists the local files, then adds any scan from Supabase that isn't on disk.
 *
 * Reading a scan id out of `json` makes Postgres parse every row's whole document, which is
 * slow and swamps a small database. So supabase-index.json maps row uuid → scan id, and only
 * rows missing from it are ever opened. Supabase is checked at most once a minute, and the
 * map never waits on it for more than a few seconds.
 *
 * Keys come from web/.env.local (git-ignored): SUPABASE_URL and SUPABASE_SECRET_KEY.
 */

const SCANS_DIR = path.join(process.cwd(), "data", "scans");
const INDEX_FILE = path.join(SCANS_DIR, "supabase-index.json");
// A little under the route's 300 s maxDuration, so the user gets a clear message, not a cut-off.
const RUN_TIMEOUT_MS = 280 * 1000;
const ID_PATTERN = /^[0-9a-z-]+$/;
/** How often the scan list asks Supabase for new rows. */
const REMOTE_REFRESH_MS = 60 * 1000;
/** How long a scan-list request waits for that check before answering with what it has. */
const REMOTE_WAIT_MS = 4 * 1000;
/** Rows whose summary is read per request when catching up on new rows. */
const META_BATCH = 10;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const supabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

async function supabase<T>(query: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { apikey: SUPABASE_KEY!, "Content-Type": "application/json", ...init.headers },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}

// ---- Row index: Supabase row uuid → scan id (shared with supabase-store.js) ----

let rowIndex: Record<string, string> | null = null;

async function loadIndex() {
  if (rowIndex) return rowIndex;
  try {
    rowIndex = JSON.parse(await readFile(INDEX_FILE, "utf8")) as Record<string, string>;
  } catch {
    rowIndex = {};
  }
  return rowIndex;
}

/** Best effort: on Vercel the folder is read-only, and the index just lives in memory. */
async function saveIndex() {
  try {
    await writeAtomic(INDEX_FILE, JSON.stringify(rowIndex, null, 1));
  } catch {
    // Read-only disk.
  }
}

// ---- Scans that exist in Supabase but not on disk ----

/** Remote scans by scan id, with the row they live in. */
const remote = new Map<string, { rowId: string; meta: ScanMeta }>();
let lastRefresh = 0;
let refreshing: Promise<void> | null = null;

/** Find rows not seen before and keep the summaries of the ones that aren't local files. */
async function refreshRemote(localIds: Set<string>) {
  const index = await loadIndex();
  const rows = await supabase<{ id: string }[]>("scans?select=id", {}, 15_000);
  // A row needs its summary read when it's new, or when it's a remote scan we haven't cached.
  const needed = rows
    .map((row) => row.id)
    .filter((rowId) => !(rowId in index) || (!localIds.has(index[rowId]) && !remote.has(index[rowId])));
  for (let i = 0; i < needed.length; i += META_BATCH) {
    const batch = needed.slice(i, i + META_BATCH);
    const metas = await supabase<{ id: string; meta: ScanMeta | null }[]>(
      `scans?select=id,meta:json->meta&id=in.(${batch.join(",")})`,
    );
    for (const { id: rowId, meta } of metas) {
      if (!meta?.id) continue;
      index[rowId] = meta.id;
      if (!localIds.has(meta.id)) remote.set(meta.id, { rowId, meta });
    }
  }
  if (needed.length) await saveIndex();
  lastRefresh = Date.now();
}

/** Remote summaries, refreshed at most once a minute, waiting a few seconds at most. */
async function remoteScans(localIds: Set<string>): Promise<ScanMeta[]> {
  if (!supabaseEnabled) return [];
  if (!refreshing && Date.now() - lastRefresh > REMOTE_REFRESH_MS) {
    refreshing = refreshRemote(localIds)
      .catch((error) => {
        console.error(`Supabase check failed, showing local scans (${(error as Error).message})`);
        lastRefresh = Date.now(); // Don't retry on every request while it's down.
      })
      .finally(() => {
        refreshing = null;
      });
  }
  if (refreshing) await Promise.race([refreshing, new Promise((r) => setTimeout(r, REMOTE_WAIT_MS))]);
  return [...remote.values()].filter((r) => !localIds.has(r.meta.id)).map((r) => r.meta);
}

/** Save to Supabase. A new scan is inserted directly; a re-run replaces its row by uuid. */
async function upsertScan(meta: ScanMeta, collection: unknown, isNew: boolean) {
  const index = await loadIndex();
  const body = JSON.stringify({ json: { meta, scan: collection } });
  const known = isNew ? undefined : Object.keys(index).find((rowId) => index[rowId] === meta.id);
  if (known) {
    await supabase(`scans?id=eq.${known}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body });
    return;
  }
  const [row] = await supabase<{ id: string }[]>("scans?select=id", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body,
  });
  index[row.id] = meta.id;
  remote.set(meta.id, { rowId: row.id, meta });
  await saveIndex();
}

type DetectedFeature = {
  properties: {
    population?: number;
    predictedCostUsd?: number;
    healthcareUsd?: number;
    source?: string;
    buildings?: number;
    clinic?: unknown;
  };
};

/** Same rule as hestiaProvider: a blob with no roof cluster is not drawn as a settlement. */
function settlementCounts(features: DetectedFeature[]) {
  const kept = features.filter((f) => f.properties.buildings !== 0);
  return { settlements: kept.length, withClinic: kept.filter((f) => f.properties.clinic).length };
}

/** Counts for meta files written before `settlements` existed, keyed by id and write time. */
const countsCache = new Map<string, ReturnType<typeof settlementCounts>>();

async function withCounts(meta: ScanMeta): Promise<ScanMeta> {
  if (meta.settlements !== undefined && meta.withClinic !== undefined) return meta;
  const key = `${meta.id}@${meta.updatedAt ?? meta.createdAt}`;
  let counts = countsCache.get(key);
  if (!counts) {
    const text = await readScan(meta.id);
    if (!text) return meta;
    counts = settlementCounts((JSON.parse(text) as { features: DetectedFeature[] }).features);
    countsCache.set(key, counts);
  }
  return { ...meta, ...counts };
}

/** Local scan files, plus any scan in Supabase that isn't on disk. */
export async function listScans(): Promise<ScanMeta[]> {
  const local = await listLocalScans();
  const extra = await remoteScans(new Set(local.map((m) => m.id)));
  return [...local, ...extra].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function listLocalScans(): Promise<ScanMeta[]> {
  let files: string[];
  try {
    files = await readdir(SCANS_DIR);
  } catch {
    return [];
  }
  const metas = await Promise.all(
    files
      .filter((f) => f.endsWith(".meta.json"))
      .map(async (f) => withCounts(JSON.parse(await readFile(path.join(SCANS_DIR, f), "utf8")) as ScanMeta)),
  );
  return metas;
}

export function summarizeScans(scans: ScanMeta[]): ScanSummary {
  return {
    scans: scans.length,
    countries: new Set(scans.map((s) => s.countryId)).size,
    settlements: scans.reduce((sum, s) => sum + s.villages, 0),
    osmMatched: scans.reduce((sum, s) => sum + s.osmMatched, 0),
    population: scans.reduce((sum, s) => sum + s.population, 0),
    costUsd: scans.reduce((sum, s) => sum + s.costUsd, 0),
  };
}

/** The raw detector FeatureCollection as text, or null for an unknown id. Local file first. */
export async function readScan(id: string): Promise<string | null> {
  if (!ID_PATTERN.test(id)) return null;
  try {
    return await readFile(path.join(SCANS_DIR, `${id}.json`), "utf8");
  } catch {
    // Not on disk: fall through to Supabase.
  }
  const row = remote.get(id);
  if (!supabaseEnabled || !row) return null;
  try {
    const rows = await supabase<{ scan: unknown }[]>(`scans?select=scan:json->scan&id=eq.${row.rowId}`);
    return rows[0]?.scan ? JSON.stringify(rows[0].scan) : null;
  } catch (error) {
    console.error(`readScan ${id}: Supabase unavailable (${(error as Error).message})`);
    return null;
  }
}

/**
 * Runs the detector in this process. It used to start detect-villages.js as a separate
 * program, but a Vercel deployment only contains the web app, so the detector lives in
 * src/lib/detector and is imported here.
 */
async function runDetector({ south, west, north, east }: ScanRequest) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("the scan took too long")), RUN_TIMEOUT_MS);
  });
  try {
    return await Promise.race([detectVillages({ south, west, north, east }), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function writeAtomic(file: string, text: string) {
  await writeFile(`${file}.tmp`, text);
  await rename(`${file}.tmp`, file);
}

/** Runs the detector on the box and saves the result the same way scan-batch.js does. */
export async function runAndSaveScan(request: ScanRequest): Promise<ScanMeta> {
  const collection = (await runDetector(request)) as {
    tour?: { costUsd: number; stops: number } | null;
    features: DetectedFeature[];
  };
  let population = 0;
  let costUsd = 0;
  let osmMatched = 0;
  for (const { properties: p } of collection.features) {
    population += p.population ?? 0;
    costUsd += p.predictedCostUsd ?? p.healthcareUsd ?? 0;
    if (p.source === "osm") osmMatched += 1;
  }
  // The random tail keeps ids unique when several computers save in the same millisecond.
  const id = `${request.countryId}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const { south, west, north, east } = request;
  const meta: ScanMeta = {
    id,
    countryId: request.countryId,
    countryName: request.countryName,
    label: null,
    bbox: { south, west, north, east },
    createdAt: new Date().toISOString(),
    origin: "live",
    // Matches CLINIC_PAD_DEG in detect-villages.js.
    clinicRangeKm: 40,
    villages: collection.features.length,
    population,
    costUsd,
    osmMatched,
    ...settlementCounts(collection.features),
    // Matches TOUR_VERSION in scan-batch.js.
    tourVersion: collection.tour !== undefined ? 4 : undefined,
    tourCostUsd: collection.tour?.costUsd ?? null,
    tourStops: collection.tour?.stops ?? 0,
  };
  // Local copy. Best effort: on Vercel the app folder is read-only and Supabase is the store.
  let savedLocally = false;
  try {
    await mkdir(SCANS_DIR, { recursive: true });
    // Data first, then meta: a listed meta always points at a complete scan.
    await writeAtomic(path.join(SCANS_DIR, `${id}.json`), JSON.stringify(collection));
    await writeAtomic(path.join(SCANS_DIR, `${id}.meta.json`), JSON.stringify(meta));
    savedLocally = true;
  } catch (error) {
    console.error(`runAndSaveScan ${id}: no local copy (${(error as Error).message})`);
  }
  // Share it so every other map sees this scan. With a local copy, a failed upload can be
  // retried later with `node scan-batch.js --sync`; without one, the scan would be lost.
  if (supabaseEnabled) {
    try {
      await upsertScan(meta, collection, true);
    } catch (error) {
      if (!savedLocally) throw new Error(`the scan finished but couldn't be saved (${(error as Error).message})`);
      console.error(`runAndSaveScan ${id}: Supabase upload failed (${(error as Error).message})`);
    }
  } else if (!savedLocally) {
    throw new Error("the scan finished but there is nowhere to save it (no Supabase keys, read-only disk)");
  }
  return meta;
}
