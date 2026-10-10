// Run detect-villages.js on many rural boxes, one after another, for a fixed time.
// Each finished box is written to web/data/scans/ right away, so the map can show
// results while the batch is still running.
//
//   node scan-batch.js --hours 3
//   node scan-batch.js --hours 3 --grid 566     # cover one country box by box (566 = Nigeria)
//   node scan-batch.js --hours 3 --grid 566 --shard 2/4   # this computer takes share 2 of 4
//
// Box picking: a random point inside the country's border, then a random OSM
// village or hamlet near that point. The box is centered on that village, so there
// is always something to find, and unmapped neighbors show up as satellite hits.
// Restarting the script continues toward the same per-country targets.
//
// Grid mode tiles one country with boxes and scans them in a fixed shuffled order, so
// partial coverage is spread across the country. Each scan records its grid cell, and a
// restart skips cells already done.
//
// Several computers can share one grid: give each the same total and a different
// share (--shard 1/3, 2/3, 3/3). Shares never overlap, every scan is its own pair of
// files, and the results merge through git without conflicts.

import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { feature } from "topojson-client";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(ROOT, "web", "data", "scans");
const COUNTRIES_FILE = join(ROOT, "web", "public", "data", "countries-50m.json");
// Half the box side in degrees. 0.04° square stays under the detector's 400-tile cap.
const HALF_DEG = 0.02;
// How far around the random point to look for an OSM village.
const SEARCH_HALF_DEG = 0.4;
// Tries to find a village before a country's box is skipped for this round.
const PICK_TRIES = 6;
// Pause between boxes so the public Overpass servers are not hammered.
// Each box makes about four Overpass queries.
const PAUSE_MS = 15000;
// Must match CLINIC_PAD_DEG in detect-villages.js (0.36° ≈ 40 km). Saved scans with a
// smaller `clinicRangeKm` are re-run at startup so every scan uses the same clinic search.
const CLINIC_RANGE_KM = 40;
// Bump when the detector's team-tour output changes; grid-country scans below it are re-run.
// 2: settlements need at least one roof cluster, so tours and totals changed.
const TOUR_VERSION = 2;
// Wait before retrying a box that failed because Overpass was busy.
const BUSY_RETRY_MS = 45000;
// A box that takes longer than this is abandoned.
const RUN_TIMEOUT_MS = 8 * 60 * 1000;
const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// Highest zero-dose burden first (WHO/UNICEF). `boxes` is the target per country
// for one pass. When a pass finishes with time left, the next pass doubles it.
// ids match web/public/data/countries-50m.json (ISO 3166 numeric).
const COUNTRIES = [
  { id: "566", name: "Nigeria", boxes: 12 },
  { id: "231", name: "Ethiopia", boxes: 10 },
  { id: "180", name: "Dem. Rep. Congo", boxes: 8 },
  { id: "356", name: "India", boxes: 6 },
  { id: "729", name: "Sudan", boxes: 5 },
  { id: "360", name: "Indonesia", boxes: 5 },
  { id: "004", name: "Afghanistan", boxes: 5 },
  { id: "024", name: "Angola", boxes: 5 },
  { id: "586", name: "Pakistan", boxes: 5 },
  { id: "887", name: "Yemen", boxes: 4 },
  { id: "706", name: "Somalia", boxes: 4 },
  { id: "148", name: "Chad", boxes: 4 },
  { id: "562", name: "Niger", boxes: 4 },
  { id: "466", name: "Mali", boxes: 4 },
  { id: "728", name: "S. Sudan", boxes: 4 },
  { id: "450", name: "Madagascar", boxes: 4 },
  { id: "120", name: "Cameroon", boxes: 3 },
  { id: "508", name: "Mozambique", boxes: 3 },
  { id: "324", name: "Guinea", boxes: 3 },
  { id: "854", name: "Burkina Faso", boxes: 3 },
  { id: "140", name: "Central African Rep.", boxes: 3 },
  { id: "104", name: "Myanmar", boxes: 3 },
  { id: "608", name: "Philippines", boxes: 3 },
  { id: "800", name: "Uganda", boxes: 3 },
  { id: "404", name: "Kenya", boxes: 3 },
];

function readArgs(argv) {
  const value = (flag) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const hours = Number(value("--hours") ?? 3);
  const grid = value("--grid");
  const shardMatch = /^(\d+)\/(\d+)$/.exec(value("--shard") ?? "1/1");
  const shard = shardMatch ? { index: Number(shardMatch[1]), count: Number(shardMatch[2]) } : null;
  if (
    !Number.isFinite(hours) ||
    hours <= 0 ||
    (grid !== undefined && !/^\d+$/.test(grid)) ||
    !shard ||
    shard.index < 1 ||
    shard.index > shard.count
  ) {
    console.error("Usage: node scan-batch.js --hours 3 [--grid COUNTRY_ID] [--shard K/N]");
    process.exit(1);
  }
  return { hours, grid, shard };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (message) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);

// Ray cast over every ring of a Polygon or MultiPolygon. Holes flip the result back.
function pointInGeometry(lon, lat, geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let inside = false;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
          inside = !inside;
        }
      }
    }
  }
  return inside;
}

function geometryBounds(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const polygon of polygons) {
    for (const [lon, lat] of polygon[0]) {
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  }
  return { west, south, east, north };
}

function randomPointIn(geometry) {
  const box = geometryBounds(geometry);
  for (let i = 0; i < 5000; i++) {
    const lon = box.west + Math.random() * (box.east - box.west);
    const lat = box.south + Math.random() * (box.north - box.south);
    if (pointInGeometry(lon, lat, geometry)) return [lon, lat];
  }
  return null;
}

async function fetchOverpass(query) {
  let lastError;
  for (let attempt = 0; attempt < OVERPASS_SERVERS.length * 2; attempt++) {
    try {
      const response = await fetch(OVERPASS_SERVERS[attempt % OVERPASS_SERVERS.length], {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "village-polygon-detector/1.0",
        },
        body: new URLSearchParams({ data: query }),
      });
      const text = await response.text();
      if (!response.ok || text[0] !== "{") throw new Error("Overpass is busy");
      return JSON.parse(text).elements || [];
    } catch (error) {
      lastError = error;
      await sleep(3000);
    }
  }
  throw lastError;
}

// A random OSM village or hamlet near a random point inside the country.
async function pickVillage(geometry) {
  for (let i = 0; i < PICK_TRIES; i++) {
    const point = randomPointIn(geometry);
    if (!point) return null;
    const [lon, lat] = point;
    const query = `[out:json][timeout:60];
node["place"~"^(village|hamlet)$"](${lat - SEARCH_HALF_DEG},${lon - SEARCH_HALF_DEG},${lat + SEARCH_HALF_DEG},${lon + SEARCH_HALF_DEG});
out body 200;`;
    let nodes = [];
    try {
      nodes = await fetchOverpass(query);
    } catch (error) {
      log(`  village search failed: ${error.message}`);
      await sleep(PAUSE_MS);
      continue;
    }
    // The node must sit inside this country, not just inside the search square.
    const inCountry = nodes.filter((node) => pointInGeometry(node.lon, node.lat, geometry));
    if (inCountry.length) {
      const node = inCountry[Math.floor(Math.random() * inCountry.length)];
      return { lon: node.lon, lat: node.lat, name: node.tags?.name ?? null };
    }
  }
  return null;
}

function runDetector(bbox) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        join(ROOT, "detect-villages.js"),
        "--south", String(bbox.south),
        "--west", String(bbox.west),
        "--north", String(bbox.north),
        "--east", String(bbox.east),
      ],
      { cwd: ROOT }
    );
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), RUN_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      for (const line of String(chunk).split("\n")) {
        if (line && !line.startsWith("tiles ")) log(`  ${line}`);
      }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(stderr.trim().split("\n").pop() || `exit ${code}`));
      try {
        resolve({ collection: JSON.parse(stdout), stderr });
      } catch (error) {
        reject(error);
      }
    });
  });
}

// Public Overpass servers turn requests away under load. One slower retry usually works.
async function runDetectorRetrying(country, bbox) {
  try {
    return await runDetector(bbox);
  } catch (error) {
    if (!/Overpass/.test(error.message)) throw error;
    log(`${country.name}: Overpass busy, retrying in ${BUSY_RETRY_MS / 1000}s`);
    await sleep(BUSY_RETRY_MS);
    return runDetector(bbox);
  }
}

// Write to a temp name and rename, so a reader never sees half a file.
function writeAtomic(path, value) {
  writeFileSync(`${path}.tmp`, JSON.stringify(value));
  renameSync(`${path}.tmp`, path);
}

function summarize(collection) {
  let population = 0;
  let costUsd = 0;
  let osmMatched = 0;
  for (const f of collection.features) {
    population += f.properties.population || 0;
    costUsd += f.properties.predictedCostUsd ?? f.properties.healthcareUsd ?? 0;
    if (f.properties.source === "osm") osmMatched += 1;
  }
  return {
    villages: collection.features.length,
    population,
    costUsd,
    osmMatched,
    tourVersion: collection.tour !== undefined ? TOUR_VERSION : undefined,
    tourCostUsd: collection.tour?.costUsd ?? null,
    tourStops: collection.tour?.stops ?? 0,
  };
}

function existingCounts() {
  const counts = new Map();
  for (const file of readdirSync(OUT_DIR)) {
    if (!file.endsWith(".meta.json")) continue;
    const meta = JSON.parse(readFileSync(join(OUT_DIR, file), "utf8"));
    counts.set(meta.countryId, (counts.get(meta.countryId) || 0) + 1);
  }
  return counts;
}

// Round-robin: one box per country per round, so an early stop still covers many countries.
// Pass 2 raises every target to twice `boxes`, pass 3 to three times, and so on.
function schedule(counts, pass) {
  const order = [];
  const max = Math.max(...COUNTRIES.map((c) => c.boxes)) * pass;
  for (let round = 0; round < max; round++) {
    for (const country of COUNTRIES) {
      if (round < country.boxes * pass && round >= (counts.get(country.id) || 0)) {
        order.push(country);
      }
    }
  }
  return order;
}

// Pick a village in the country, scan the box around it, and save the result.
// Returns true when a scan was saved.
async function scanOne(country, shapes) {
  const geometry = shapes.get(country.id);
  if (!geometry) return false;
  log(`${country.name}: picking a village`);
  const village = await pickVillage(geometry);
  if (!village) {
    log(`${country.name}: no OSM village found, skipping`);
    return false;
  }
  log(`${country.name}: scanning near ${village.name ?? "unnamed village"}`);
  return scanBox(country, boxAround(village.lon, village.lat), {
    label: village.name ? `Near ${village.name}` : null,
  });
}

function boxAround(lon, lat) {
  return {
    south: +(lat - HALF_DEG).toFixed(5),
    west: +(lon - HALF_DEG).toFixed(5),
    north: +(lat + HALF_DEG).toFixed(5),
    east: +(lon + HALF_DEG).toFixed(5),
  };
}

// Run the detector on one box and save it. `extra` is merged into the meta file.
async function scanBox(country, bbox, extra) {
  log(`${country.name}: box ${JSON.stringify(bbox)}`);
  try {
    let { collection, stderr } = await runDetectorRetrying(country, bbox);
    // The detector carries on without clinics or roads when Overpass refuses those
    // queries, which leaves the scan without routes. Try once more for complete data.
    if (/(clinics|roads) unavailable/.test(stderr)) {
      log(`${country.name}: clinics or roads missing, retrying in ${BUSY_RETRY_MS / 1000}s`);
      await sleep(BUSY_RETRY_MS);
      ({ collection } = await runDetectorRetrying(country, bbox));
    }
    // The random tail keeps ids unique when several computers save in the same millisecond.
    const id = `${country.id}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const meta = {
      id,
      countryId: country.id,
      countryName: country.name,
      label: null,
      bbox,
      createdAt: new Date().toISOString(),
      origin: "batch",
      clinicRangeKm: CLINIC_RANGE_KM,
      ...extra,
      ...summarize(collection),
    };
    // Data file first, then meta: a meta file always points at a complete scan.
    writeAtomic(join(OUT_DIR, `${id}.json`), collection);
    writeAtomic(join(OUT_DIR, `${id}.meta.json`), meta);
    log(`${country.name}: saved ${id} (${meta.villages} villages, ${meta.population} people)`);
    return true;
  } catch (error) {
    log(`${country.name}: scan failed: ${error.message}`);
    return false;
  }
}

// Seeded so every run shuffles the grid the same way and restarts pick up in order.
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Every box-sized cell whose center is inside the country, in a fixed shuffled order.
function gridCells(countryId, geometry) {
  const bounds = geometryBounds(geometry);
  const step = HALF_DEG * 2;
  const cells = [];
  for (let row = 0; bounds.south + (row + 0.5) * step < bounds.north; row++) {
    for (let col = 0; bounds.west + (col + 0.5) * step < bounds.east; col++) {
      const lon = bounds.west + (col + 0.5) * step;
      const lat = bounds.south + (row + 0.5) * step;
      if (pointInGeometry(lon, lat, geometry)) cells.push({ id: `${row}-${col}`, lon, lat });
    }
  }
  const rand = mulberry32(Number(countryId));
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells;
}

function doneGridCells(countryId) {
  const done = new Set();
  for (const file of readdirSync(OUT_DIR)) {
    if (!file.endsWith(".meta.json")) continue;
    const meta = JSON.parse(readFileSync(join(OUT_DIR, file), "utf8"));
    if (meta.countryId === countryId && meta.gridCell) done.add(meta.gridCell);
  }
  return done;
}

// Stable share number for a string, so every computer agrees who re-runs which scan.
function shardOfId(id, count) {
  let hash = 0;
  for (const ch of id) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) | 0;
  return (Math.abs(hash) % count) + 1;
}

async function scanGrid(countryId, shapes, deadline, shard) {
  const country = COUNTRIES.find((c) => c.id === countryId) ?? { id: countryId, name: countryId };
  const geometry = shapes.get(countryId);
  if (!geometry) throw new Error(`no country with id ${countryId}`);
  // Every computer shuffles the same way, then takes every Nth cell of that order.
  const cells = gridCells(countryId, geometry).filter((_, i) => i % shard.count === shard.index - 1);
  const done = doneGridCells(countryId);
  log(
    `${country.name}: share ${shard.index}/${shard.count} has ${cells.length} grid cells, ` +
      `${cells.filter((c) => done.has(c.id)).length} already scanned`
  );
  let saved = 0;
  for (const cell of cells) {
    if (Date.now() > deadline) break;
    if (done.has(cell.id)) continue;
    const ok = await scanBox(country, boxAround(cell.lon, cell.lat), {
      label: `Grid cell ${cell.id}`,
      gridCell: cell.id,
    });
    if (ok) saved += 1;
    await sleep(PAUSE_MS);
  }
  const finished = cells.filter((c) => done.has(c.id)).length + saved;
  log(`${country.name}: ${finished} of ${cells.length} grid cells in this share scanned`);
  return saved;
}

// Why a saved scan needs re-running, or null when it is current. Same id, box and label
// on re-run, so the map updates in place. Team tours are only required in grid mode.
function outdatedReason(meta, gridCountryId) {
  if ((meta.clinicRangeKm ?? CLINIC_RANGE_KM) < CLINIC_RANGE_KM) {
    return `the ${CLINIC_RANGE_KM} km clinic radius`;
  }
  if (gridCountryId && meta.countryId === gridCountryId && (meta.tourVersion ?? 0) < TOUR_VERSION) {
    return "the current team tour and settlement rules";
  }
  return null;
}

async function rescanOutdated(deadline, onlyCountryId, shard = { index: 1, count: 1 }) {
  for (const file of readdirSync(OUT_DIR)) {
    if (!file.endsWith(".meta.json") || Date.now() > deadline) continue;
    const meta = JSON.parse(readFileSync(join(OUT_DIR, file), "utf8"));
    if (onlyCountryId && meta.countryId !== onlyCountryId) continue;
    const reason = outdatedReason(meta, onlyCountryId);
    if (!reason || shardOfId(meta.id, shard.count) !== shard.index) continue;
    log(`${meta.countryName}: re-running ${meta.id} for ${reason}`);
    try {
      let { collection, stderr } = await runDetectorRetrying({ name: meta.countryName }, meta.bbox);
      if (/(clinics|roads) unavailable/.test(stderr)) {
        log(`${meta.countryName}: clinics or roads missing, retrying in ${BUSY_RETRY_MS / 1000}s`);
        await sleep(BUSY_RETRY_MS);
        ({ collection } = await runDetectorRetrying({ name: meta.countryName }, meta.bbox));
      }
      const updated = {
        ...meta,
        clinicRangeKm: CLINIC_RANGE_KM,
        updatedAt: new Date().toISOString(),
        ...summarize(collection),
      };
      writeAtomic(join(OUT_DIR, `${meta.id}.json`), collection);
      writeAtomic(join(OUT_DIR, file), updated);
      log(`${meta.countryName}: updated ${meta.id} (${updated.villages} villages, ${updated.population} people)`);
    } catch (error) {
      log(`${meta.countryName}: re-run of ${meta.id} failed: ${error.message}`);
    }
    await sleep(PAUSE_MS);
  }
}

async function main() {
  const { hours, grid, shard } = readArgs(process.argv);
  const deadline = Date.now() + hours * 3600 * 1000;
  mkdirSync(OUT_DIR, { recursive: true });

  const topo = JSON.parse(readFileSync(COUNTRIES_FILE, "utf8"));
  const shapes = new Map(
    feature(topo, topo.objects.countries).features.map((f) => [String(f.id), f.geometry])
  );

  await rescanOutdated(deadline, grid, shard);

  if (grid) {
    const saved = await scanGrid(grid, shapes, deadline, shard);
    log(`finished, ${saved} boxes saved`);
    return;
  }

  let done = 0;
  for (let pass = 1; Date.now() < deadline; pass++) {
    const queue = schedule(existingCounts(), pass);
    log(`pass ${pass}: ${queue.length} boxes queued, stopping after ${hours} h`);
    for (const country of queue) {
      if (Date.now() > deadline) break;
      if (await scanOne(country, shapes)) done += 1;
      await sleep(PAUSE_MS);
    }
  }
  log("time budget used up");
  log(`finished, ${done} boxes saved`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
