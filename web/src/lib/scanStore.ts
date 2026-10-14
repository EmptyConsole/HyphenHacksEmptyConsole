import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { after } from "next/server";
import type { ClinicTourRecord, ScanMeta, ScanRequest, ScanSummary } from "@/data/types";
import { buildClinicTour, tourClinicOf } from "@/lib/detector/clinicTours.mjs";
import { detectVillages } from "@/lib/detector/detectVillages.mjs";

/**
 * Server-only. Scans live in web/data/scans as `<id>.json` (detector output) plus
 * `<id>.meta.json` (summary); scan-batch.js writes the same files. Supabase (table
 * public.scans) shares scans between computers: the map lists the local files, then adds
 * any scan from Supabase that isn't on disk.
 *
 * Besides `json` ({ meta, scan }), each row has two small columns a trigger keeps filled
 * (see supabase-speedup.sql): scan_id (unique, indexed) and meta. Listing and lookups use
 * those, so the big json is only read when a scan that isn't on disk is opened. Supabase is
 * checked in the background at most once a minute; the list only waits for it on a server's
 * first request.
 *
 * Keys come from web/.env.local (git-ignored): SUPABASE_URL and SUPABASE_SECRET_KEY.
 */

const SCANS_DIR = path.join(process.cwd(), "data", "scans");
// A little under the route's 300 s maxDuration, so the user gets a clear message, not a cut-off.
const RUN_TIMEOUT_MS = 280 * 1000;
const ID_PATTERN = /^[0-9a-z-]+$/;
/** How often the scan list asks Supabase for new scans. */
const REMOTE_REFRESH_MS = 60 * 1000;
/** Summaries fetched per request when catching up on new scans. */
const META_BATCH = 50;
/** Rows per Supabase request when listing every scan (Supabase's own cap is 1000). */
const PAGE_ROWS = 1000;
/** Local meta files read at once when listing. */
const READ_BATCH = 100;

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

// ---- Scans that exist in Supabase but not on disk ----

/** Summaries of remote scans, by scan id. */
/** When a scan was last saved: its re-run time, or else when it was made. ISO strings compare in order. */
const savedAt = (meta: Pick<ScanMeta, "createdAt" | "updatedAt">) => meta.updatedAt ?? meta.createdAt;

/**
 * Summaries from Supabase for scans that aren't on disk, or whose Supabase copy is newer
 * than the one on disk (re-run on another computer, or after this copy was deployed).
 */
const remote = new Map<string, ScanMeta>();
/** Last-saved time of each local scan file, so readScan knows which copy is newer. */
const localSavedAt = new Map<string, string>();
let lastRefresh = 0;
let refreshing: Promise<void> | null = null;

/**
 * Every row of a select, page by page. Supabase returns at most 1000 rows per request, so a
 * single request silently drops the rest. Stops at the first empty page, so it still works
 * if the project's row cap is lower than PAGE_ROWS.
 */
async function selectAll<T>(query: string, timeoutMs?: number): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const page = await supabase<T[]>(`${query}&order=id&offset=${rows.length}&limit=${PAGE_ROWS}`, {}, timeoutMs);
    if (!page.length) return rows;
    rows.push(...page);
  }
}

/** Ask Supabase when each scan was last saved (tiny), then fetch summaries that are new or newer. */
async function refreshRemote(local: Map<string, ScanMeta>) {
  const rows = await selectAll<{ scan_id: string | null; updatedAt: string | null; createdAt: string | null }>(
    "scans?select=scan_id,updatedAt:meta->>updatedAt,createdAt:meta->>createdAt",
    15_000,
  );
  const needed: string[] = [];
  for (const row of rows) {
    const id = row.scan_id;
    const stamp = row.updatedAt ?? row.createdAt;
    if (!id || !stamp || !ID_PATTERN.test(id)) continue;
    const onDisk = local.get(id);
    if (onDisk && stamp <= savedAt(onDisk)) continue; // The local copy is as new.
    const cached = remote.get(id);
    if (cached && savedAt(cached) === stamp) continue; // Already have this version.
    needed.push(id);
  }
  if (needed.length > META_BATCH * 4) {
    // Many new summaries (a cold server with no files on disk): a few big pages beat
    // dozens of small requests.
    const wanted = new Set(needed);
    const metas = await selectAll<{ meta: ScanMeta | null }>("scans?select=meta");
    for (const { meta } of metas) if (meta?.id && wanted.has(meta.id)) remote.set(meta.id, meta);
  } else {
    for (let i = 0; i < needed.length; i += META_BATCH) {
      const batch = needed.slice(i, i + META_BATCH);
      const metas = await supabase<{ meta: ScanMeta | null }[]>(`scans?select=meta&scan_id=in.(${batch.join(",")})`);
      for (const { meta } of metas) if (meta?.id) remote.set(meta.id, meta);
    }
  }
  lastRefresh = Date.now();
}

/** Remote summaries newer than (or missing from) disk. Checks at most once a minute; never waits. */
function remoteScans(local: Map<string, ScanMeta>): ScanMeta[] {
  if (!supabaseEnabled) return [];
  if (!refreshing && Date.now() - lastRefresh > REMOTE_REFRESH_MS) {
    refreshing = refreshRemote(local)
      .catch((error) => {
        console.error(`Supabase check failed, showing local scans (${(error as Error).message})`);
        lastRefresh = Date.now(); // Don't retry on every request while it's down.
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return [...remote.values()].filter((meta) => {
    const onDisk = local.get(meta.id);
    return !onDisk || savedAt(meta) > savedAt(onDisk);
  });
}

/** Insert the scan, or replace the row holding its scan id. Same as supabase-store.js. */
async function upsertScan(meta: ScanMeta, collection: unknown) {
  await supabase("scans?on_conflict=scan_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ json: { meta, scan: collection } }),
  });
  remote.set(meta.id, meta);
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
/** Local scan files, with any newer or extra scans from Supabase in their place. */
export async function listScans(): Promise<ScanMeta[]> {
  const local = new Map((await listLocalScans()).map((m) => [m.id, m]));
  for (const meta of local.values()) localSavedAt.set(meta.id, savedAt(meta));
  const merged = new Map(local);
  // A server that just started has no Supabase list yet. Wait for the first one, so scans
  // that only live in Supabase aren't missing from the map until the next request.
  if (lastRefresh === 0) {
    remoteScans(local);
    await refreshing;
  }
  for (const meta of remoteScans(local)) merged.set(meta.id, meta);
  return [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function listLocalScans(): Promise<ScanMeta[]> {
  let files: string[];
  try {
    files = await readdir(SCANS_DIR);
  } catch {
    return [];
  }
  // A few at a time: Vercel functions allow 1024 open files, and opening every meta file at
  // once fails with EMFILE (an empty 500, so the map shows nothing) past ~1000 scans.
  const metaFiles = files.filter((f) => f.endsWith(".meta.json"));
  const metas: ScanMeta[] = [];
  for (let i = 0; i < metaFiles.length; i += READ_BATCH) {
    const batch = metaFiles.slice(i, i + READ_BATCH);
    metas.push(
      ...(await Promise.all(
        batch.map(async (f) => withCounts(JSON.parse(await readFile(path.join(SCANS_DIR, f), "utf8")) as ScanMeta)),
      )),
    );
  }
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
  // Supabase first when its copy is newer than the file (re-run after this copy was saved).
  const newer = remote.get(id);
  const local = localSavedAt.get(id);
  if (newer && (!local || savedAt(newer) > local)) {
    const fromSupabase = await readRemoteScan(id);
    if (fromSupabase) return fromSupabase;
  }
  try {
    return await readFile(path.join(SCANS_DIR, `${id}.json`), "utf8");
  } catch {
    // Not on disk: fall through to Supabase.
  }
  return readRemoteScan(id);
}

async function readRemoteScan(id: string): Promise<string | null> {
  if (!supabaseEnabled) return null;
  try {
    const rows = await supabase<{ scan: unknown }[]>(`scans?select=scan:json->scan&scan_id=eq.${id}`);
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
  const clinic = tourClinicOf(collection);
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
    tourVersion: collection.tour !== undefined ? 5 : undefined,
    tourCostUsd: collection.tour?.costUsd ?? null,
    tourStops: collection.tour?.stops ?? 0,
    tourClinicId: clinic ? String(clinic.osmId) : null,
    tourClinicName: clinic?.name ?? null,
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
      await upsertScan(meta, collection);
    } catch (error) {
      if (!savedLocally) throw new Error(`the scan finished but couldn't be saved (${(error as Error).message})`);
      console.error(`runAndSaveScan ${id}: Supabase upload failed (${(error as Error).message})`);
    }
  } else if (!savedLocally) {
    throw new Error("the scan finished but there is nowhere to save it (no Supabase keys, read-only disk)");
  }
  // Re-plan this clinic's joined tour once the response is sent, so the user isn't kept waiting.
  after(() => refreshClinicTour(collection));
  return meta;
}

// ---- Joined clinic tours ----

/** Every scan (local and remote) whose tour starts at this clinic, with its full data. */
async function scansForClinic(clinicId: string) {
  // Local and Supabase scans, each in its newest version.
  const metas = await listScans();
  const found: { meta: ScanMeta; collection: unknown }[] = [];
  for (const meta of metas) {
    let collection: unknown = null;
    if (meta.tourClinicId === undefined) {
      // Older scans don't record their clinic: read it from the scan itself.
      const text = await readScan(meta.id);
      collection = text ? JSON.parse(text) : null;
      const clinic = tourClinicOf(collection);
      if (!clinic || String(clinic.osmId) !== clinicId) continue;
    } else if (meta.tourClinicId !== clinicId) {
      continue;
    }
    if (!collection) {
      const text = await readScan(meta.id);
      if (!text) continue;
      collection = JSON.parse(text);
    }
    found.push({ meta, collection });
  }
  return found;
}

/** Re-plan and save the joined tour of the clinic this scan's tour starts from. */
async function refreshClinicTour(collection: unknown) {
  const clinic = tourClinicOf(collection);
  if (!clinic) return;
  const clinicId = String(clinic.osmId);
  try {
    const record = (await buildClinicTour(clinic, await scansForClinic(clinicId))) as ClinicTourRecord | null;
    if (!record) return;
    tourCache.set(clinicId, { at: Date.now(), record });
    if (supabaseEnabled) {
      await supabase("clinic_tours?on_conflict=clinic_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ clinic_id: clinicId, summary: record.summary, tour: record.tour }),
      });
    }
  } catch (error) {
    console.error(`clinic tour ${clinicId}: ${(error as Error).message}`);
  }
}

/** Recent tour lookups (including "none"), so clicking around doesn't ask Supabase each time. */
const TOUR_CACHE_MS = 60 * 1000;
const tourCache = new Map<string, { at: number; record: ClinicTourRecord | null }>();
/** When the clinic_tours table was last found missing; skip Supabase for a minute after. */
let tourTableMissingAt = 0;

/** A joined clinic tour, from Supabase (never from files). Null when there is none. */
export async function readClinicTour(clinicId: string): Promise<ClinicTourRecord | null> {
  if (!/^\d+$/.test(clinicId)) return null;
  const cached = tourCache.get(clinicId);
  if (cached && Date.now() - cached.at < TOUR_CACHE_MS) return cached.record;
  const record = await lookUpClinicTour(clinicId);
  tourCache.set(clinicId, { at: Date.now(), record });
  return record;
}

async function lookUpClinicTour(clinicId: string): Promise<ClinicTourRecord | null> {
  if (!supabaseEnabled || Date.now() - tourTableMissingAt < TOUR_CACHE_MS) return null;
  try {
    const rows = await supabase<{ summary: ClinicTourRecord["summary"]; tour: ClinicTourRecord["tour"] }[]>(
      `clinic_tours?select=summary,tour&clinic_id=eq.${clinicId}`,
      {},
      5_000,
    );
    return rows[0] ? { clinicId, summary: rows[0].summary, tour: rows[0].tour } : null;
  } catch (error) {
    // Table not created yet (run supabase-tours.sql), or Supabase unavailable.
    if (/404|42P01|does not exist|schema cache/i.test((error as Error).message)) tourTableMissingAt = Date.now();
    return null;
  }
}
