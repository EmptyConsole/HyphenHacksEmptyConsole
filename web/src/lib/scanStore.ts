import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ScanMeta, ScanRequest, ScanSummary } from "@/data/types";

/**
 * Server-only. Scans are shared through Supabase (table public.scans, one row per scan,
 * json = { meta, scan }) so every computer's scans reach every map. web/data/scans keeps
 * a local copy as `<id>.json` (detector output) plus `<id>.meta.json` (summary), used
 * when Supabase is unreachable or not configured. scan-batch.js writes both the same way.
 *
 * Keys come from web/.env.local (git-ignored): SUPABASE_URL and SUPABASE_SECRET_KEY.
 */

const SCANS_DIR = path.join(process.cwd(), "data", "scans");
const DETECTOR = path.join(process.cwd(), "..", "detect-villages.js");
const RUN_TIMEOUT_MS = 8 * 60 * 1000;
const ID_PATTERN = /^[0-9a-z-]+$/;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const supabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

async function supabase<T>(query: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    ...init,
    cache: "no-store",
    headers: { apikey: SUPABASE_KEY!, "Content-Type": "application/json", ...init.headers },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}

/** Insert the scan, or replace the row that already holds this scan id. Same as supabase-store.js. */
async function upsertScan(meta: ScanMeta, collection: unknown) {
  const json = JSON.stringify({ json: { meta, scan: collection } });
  const existing = await supabase<{ id: string }[]>(
    `scans?select=id&json->meta->>id=eq.${encodeURIComponent(meta.id)}&limit=1`,
  );
  if (existing.length) {
    await supabase(`scans?id=eq.${existing[0].id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: json });
  } else {
    await supabase("scans", { method: "POST", headers: { Prefer: "return=minimal" }, body: json });
  }
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

export async function listScans(): Promise<ScanMeta[]> {
  if (supabaseEnabled) {
    try {
      const rows = await supabase<{ meta: ScanMeta }[]>("scans?select=meta:json->meta&order=created_at.asc");
      const metas = await Promise.all(rows.filter((row) => row.meta).map((row) => withCounts(row.meta)));
      return metas.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } catch (error) {
      console.error(`listScans: Supabase unavailable, using local files (${(error as Error).message})`);
    }
  }
  return listLocalScans();
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
  return metas.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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

/** The raw detector FeatureCollection as text, or null for an unknown id. */
export async function readScan(id: string): Promise<string | null> {
  if (!ID_PATTERN.test(id)) return null;
  if (supabaseEnabled) {
    try {
      const rows = await supabase<{ scan: unknown }[]>(
        `scans?select=scan:json->scan&json->meta->>id=eq.${encodeURIComponent(id)}&limit=1`,
      );
      if (rows[0]?.scan) return JSON.stringify(rows[0].scan);
    } catch (error) {
      console.error(`readScan ${id}: Supabase unavailable, using local file (${(error as Error).message})`);
    }
  }
  try {
    return await readFile(path.join(SCANS_DIR, `${id}.json`), "utf8");
  } catch {
    return null;
  }
}

function runDetector({ south, west, north, east }: ScanRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [DETECTOR, "--south", south, "--west", west, "--north", north, "--east", east].map(String);
    const child = spawn(process.execPath, args, { cwd: path.dirname(DETECTOR) });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), RUN_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim().split("\n").pop() || `detector exited with ${code}`));
    });
  });
}

async function writeAtomic(file: string, text: string) {
  await writeFile(`${file}.tmp`, text);
  await rename(`${file}.tmp`, file);
}

/** Runs detect-villages.js on the box and saves the result the same way scan-batch.js does. */
export async function runAndSaveScan(request: ScanRequest): Promise<ScanMeta> {
  const collection = JSON.parse(await runDetector(request)) as {
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
  await mkdir(SCANS_DIR, { recursive: true });
  // Data first, then meta: a listed meta always points at a complete scan.
  await writeAtomic(path.join(SCANS_DIR, `${id}.json`), JSON.stringify(collection));
  await writeAtomic(path.join(SCANS_DIR, `${id}.meta.json`), JSON.stringify(meta));
  // Share it so every other map sees this scan. The local copy is already safe if this fails;
  // `node scan-batch.js --sync` uploads it later.
  if (supabaseEnabled) {
    try {
      await upsertScan(meta, collection);
    } catch (error) {
      console.error(`runAndSaveScan ${id}: Supabase upload failed (${(error as Error).message})`);
    }
  }
  return meta;
}
