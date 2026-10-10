import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ScanMeta, ScanRequest, ScanSummary } from "@/data/types";

/**
 * Server-only. Scans live in web/data/scans as `<id>.json` (detector output) plus
 * `<id>.meta.json` (summary). scan-batch.js at the repo root writes the same files.
 */

const SCANS_DIR = path.join(process.cwd(), "data", "scans");
const DETECTOR = path.join(process.cwd(), "..", "detect-villages.js");
const RUN_TIMEOUT_MS = 8 * 60 * 1000;
const ID_PATTERN = /^[0-9a-z-]+$/;

export async function listScans(): Promise<ScanMeta[]> {
  let files: string[];
  try {
    files = await readdir(SCANS_DIR);
  } catch {
    return [];
  }
  const metas = await Promise.all(
    files
      .filter((f) => f.endsWith(".meta.json"))
      .map(async (f) => JSON.parse(await readFile(path.join(SCANS_DIR, f), "utf8")) as ScanMeta),
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
    features: { properties: { population?: number; predictedCostUsd?: number; healthcareUsd?: number; source?: string } }[];
  };
  let population = 0;
  let costUsd = 0;
  let osmMatched = 0;
  for (const { properties: p } of collection.features) {
    population += p.population ?? 0;
    costUsd += p.predictedCostUsd ?? p.healthcareUsd ?? 0;
    if (p.source === "osm") osmMatched += 1;
  }
  const id = `${request.countryId}-${Date.now().toString(36)}`;
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
    // Matches TOUR_VERSION in scan-batch.js.
    tourVersion: collection.tour !== undefined ? 2 : undefined,
    tourCostUsd: collection.tour?.costUsd ?? null,
    tourStops: collection.tour?.stops ?? 0,
  };
  await mkdir(SCANS_DIR, { recursive: true });
  // Data first, then meta: a listed meta always points at a complete scan.
  await writeAtomic(path.join(SCANS_DIR, `${id}.json`), JSON.stringify(collection));
  await writeAtomic(path.join(SCANS_DIR, `${id}.meta.json`), JSON.stringify(meta));
  return meta;
}
