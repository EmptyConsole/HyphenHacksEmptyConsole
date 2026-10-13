// Build the local OpenStreetMap data the detector reads instead of asking Overpass.
//
//   node prepare-osm.js            # Nigeria (default)
//   node prepare-osm.js nigeria    # any Geofabrik Africa region name works
//
// Needs osmium-tool (macOS: brew install osmium-tool; Linux: apt install osmium-tool).
// Takes a few minutes and writes ~0.5 GB to osm-data/<region>/ (git-ignored):
//   meta.json      what's covered: the extract's bounding box and when it was built
//   places.json    villages, hamlets, towns… with names   (detector step: OSM match)
//   clinics.json   hospitals, clinics, doctors, health posts (detector step: clinic search)
//   roads/<x>_<y>.ndjson.gz   every drivable road in 0.1° squares (~11 km)
//   main/<x>_<y>.ndjson.gz    main roads only, in 1° squares, for trips to far clinics
// Re-run it to refresh the data (Geofabrik updates daily).

import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = dirname(fileURLToPath(import.meta.url));
const REGION = process.argv[2] ?? "nigeria";
const DATA = join(ROOT, "osm-data");
const OUT = join(DATA, REGION);
const PBF = join(DATA, `${REGION}-latest.osm.pbf`);
const URL = `https://download.geofabrik.de/africa/${REGION}-latest.osm.pbf`;

// Same lists the detector uses with Overpass.
const ALL_ROADS = [
  "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link",
  "tertiary", "tertiary_link", "unclassified", "residential", "living_street", "service", "track",
];
const MAIN_ROADS = new Set(ALL_ROADS.slice(0, 10));
const PLACES = ["village", "hamlet", "isolated_dwelling", "town", "suburb"];
const AMENITIES = ["hospital", "clinic", "doctors", "health_post"];
const HEALTHCARE = ["hospital", "clinic", "doctor", "centre", "center"];

// Tile sizes in degrees: all roads, and main roads only.
const ROAD_TILE = 0.1;
const MAIN_TILE = 1;
// Flush a tile's buffered lines to disk once it holds this many characters.
const FLUSH_CHARS = 256 * 1024;

const log = (message) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);

function osmium(args) {
  execFileSync("osmium", args, { stdio: ["ignore", "inherit", "inherit"] });
}

function checkOsmium() {
  try {
    execFileSync("osmium", ["--version"], { stdio: "ignore" });
  } catch {
    console.error("osmium is not installed. macOS: brew install osmium-tool · Linux: sudo apt install osmium-tool");
    process.exit(1);
  }
}

// Each line of osmium's GeoJSON sequence, parsed. Lines may start with a record separator.
async function* features(file) {
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const raw of lines) {
    const line = raw.replace(/^\x1e/, "").trim();
    if (line) yield JSON.parse(line);
  }
}

function centerOf(geometry) {
  const flat = [];
  const walk = (c) => (typeof c[0] === "number" ? flat.push(c) : c.forEach(walk));
  walk(geometry.coordinates);
  const lon = flat.reduce((s, p) => s + p[0], 0) / flat.length;
  const lat = flat.reduce((s, p) => s + p[1], 0) / flat.length;
  return [Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6];
}


// Buffered writer for many tile files: lines collect in memory and go to disk in chunks.
function tileWriter(dir, size) {
  mkdirSync(dir, { recursive: true });
  const buffers = new Map();
  const flush = (key) => {
    const text = buffers.get(key);
    if (text) appendFileSync(join(dir, `${key}.ndjson`), text);
    buffers.set(key, "");
  };
  return {
    add(line, bbox) {
      const [w, s, e, n] = bbox;
      for (let x = Math.floor(w / size); x <= Math.floor(e / size); x++) {
        for (let y = Math.floor(s / size); y <= Math.floor(n / size); y++) {
          const key = `${x}_${y}`;
          const text = (buffers.get(key) ?? "") + line + "\n";
          buffers.set(key, text);
          if (text.length > FLUSH_CHARS) flush(key);
        }
      }
    },
    close() {
      for (const key of buffers.keys()) flush(key);
      // Compress each finished tile; the detector reads them with gunzip.
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".ndjson")) continue;
        const path = join(dir, file);
        writeFileSync(`${path}.gz`, gzipSync(readFileSync(path)));
        rmSync(path);
      }
    },
  };
}

async function main() {
  checkOsmium();
  mkdirSync(DATA, { recursive: true });
  if (!existsSync(PBF) || Date.now() - statSync(PBF).mtimeMs > 7 * 24 * 3600 * 1000) {
    log(`downloading ${URL}`);
    execFileSync("curl", ["-L", "--fail", "-o", `${PBF}.tmp`, URL], { stdio: "inherit" });
    renameSync(`${PBF}.tmp`, PBF);
  }
  const header = execFileSync("osmium", ["fileinfo", "-g", "header.boxes", PBF]).toString().trim();
  const [west, south, east, north] = header.replace(/[()]/g, "").split(",").map(Number);

  const work = join(DATA, `${REGION}-work`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const building = `${OUT}.building`;
  rmSync(building, { recursive: true, force: true });
  mkdirSync(building, { recursive: true });

  // 1. Places with a name.
  log("places");
  osmium(["tags-filter", PBF, `n/place=${PLACES.join(",")}`, "-o", join(work, "places.pbf"), "--overwrite"]);
  osmium(["export", join(work, "places.pbf"), "-f", "geojsonseq", "-a", "id", "-o", join(work, "places.seq"), "--overwrite"]);
  const places = [];
  for await (const f of features(join(work, "places.seq"))) {
    const [lon, lat] = centerOf(f.geometry);
    places.push({ id: f.properties["@id"], name: f.properties.name ?? null, place: f.properties.place, lon, lat });
  }
  writeFileSync(join(building, "places.json"), JSON.stringify(places));
  log(`  ${places.length} places`);

  // 2. Health facilities: nodes, and buildings drawn as areas (their center).
  log("clinics");
  osmium([
    "tags-filter", PBF,
    `nw/amenity=${AMENITIES.join(",")}`, `nw/healthcare=${HEALTHCARE.join(",")}`,
    "-o", join(work, "clinics.pbf"), "--overwrite",
  ]);
  osmium(["export", join(work, "clinics.pbf"), "-f", "geojsonseq", "-a", "type,id", "-o", join(work, "clinics.seq"), "--overwrite"]);
  const clinics = [];
  for await (const f of features(join(work, "clinics.seq"))) {
    const p = f.properties;
    const [lon, lat] = centerOf(f.geometry);
    clinics.push({ id: p["@id"], name: p.name ?? null, kind: p.amenity ?? p.healthcare ?? "clinic", lon, lat });
  }
  writeFileSync(join(building, "clinics.json"), JSON.stringify(clinics));
  log(`  ${clinics.length} health facilities`);

  // 3. Drivable roads, split into tiles. Each line: [id, highway, surface, oneway, coords]
  //    with coordinates rounded to 6 decimals (~0.1 m). Roads meeting at a junction share
  //    the exact same coordinate, which is how the detector connects them.
  log("roads (the slow part)");
  osmium(["tags-filter", PBF, `w/highway=${ALL_ROADS.join(",")}`, "-o", join(work, "roads.pbf"), "--overwrite"]);
  osmium([
    "export", join(work, "roads.pbf"), "-f", "geojsonseq", "-a", "id",
    "--geometry-types=linestring", "-o", join(work, "roads.seq"), "--overwrite",
  ]);
  const roads = tileWriter(join(building, "roads"), ROAD_TILE);
  const main = tileWriter(join(building, "main"), MAIN_TILE);
  let count = 0;
  for await (const f of features(join(work, "roads.seq"))) {
    const p = f.properties;
    const coords = f.geometry.coordinates.map(([lon, lat]) => [Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6]);
    if (coords.length < 2) continue;
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const [lon, lat] of coords) {
      if (lon < w) w = lon;
      if (lon > e) e = lon;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
    const line = JSON.stringify([p["@id"], p.highway, p.surface ?? null, p.oneway ?? null, coords]);
    roads.add(line, [w, s, e, n]);
    if (MAIN_ROADS.has(p.highway)) main.add(line, [w, s, e, n]);
    if (++count % 200000 === 0) log(`  ${count} roads`);
  }
  log(`  ${count} roads; compressing tiles`);
  roads.close();
  main.close();

  writeFileSync(
    join(building, "meta.json"),
    JSON.stringify({ region: REGION, bbox: { west, south, east, north }, builtAt: new Date().toISOString(), roadTile: ROAD_TILE, mainTile: MAIN_TILE }),
  );
  // Swap in the new data only once it's complete, so a scan never reads half a build.
  rmSync(OUT, { recursive: true, force: true });
  renameSync(building, OUT);
  rmSync(work, { recursive: true, force: true });
  log(`done: ${OUT}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
