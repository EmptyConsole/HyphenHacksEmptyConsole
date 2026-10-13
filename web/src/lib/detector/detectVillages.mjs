// Village polygons from satellite tiles, scored against OpenStreetMap.
// No model: color and shape only.
//
// This is the detector itself, used two ways:
//   - from the command line: node detect-villages.js --south 9.02 --west 38.70 --north 9.06 --east 38.74
//     (detect-villages.js at the repo root is a thin wrapper around this file)
//   - inside the web app: the "Scan this view" API route imports detectVillages() directly,
//     so it also runs on Vercel, where there is no separate script to start.
//
// Pipeline:
//   1. Get the buildings in the box: Microsoft's building footprints (an outline per
//      building, from an AI model run over satellite imagery). Only where Microsoft has
//      no data at all, fall back to finding roofs by color in Esri satellite tiles.
//   2. Join buildings within ~50 m into settlements and trace each outline.
//   3. If an OSM place sits inside or near a settlement, certainty is 100.
//      Otherwise score it from its buildings and shape, capped at 99.
//   4. Estimate population (homes × people per home) and the money to vaccinate it.
//   5. Price a route from the nearest clinic along OSM roads.
//   6. Recommend the polygon with the lowest predicted cost, and that route.
//   7. Plan one team tour: clinic → every settlement → clinic, ordered for lowest cost.
//
// The function returns GeoJSON. Progress lines go to stderr.

import jpeg from "jpeg-js";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

// Zoom 17 is about 1.2 m per pixel, small enough to see individual roofs.
const ZOOM = 17;
// Esri World Imagery tiles are 256×256 JPEG images.
const TILE = 256;
// Erode-then-dilate radius. Knocks out 1-pixel speckle before villages are joined.
const OPEN_RADIUS = 1;
// Dilate-then-erode radius. Bridges gaps of about 2×12 pixels (~30 m) between roofs.
const CLOSE_RADIUS = 12;
// Blobs smaller than this are a shed or noise, not a village. ~400 px is ~500 m².
const MIN_PIXELS = 400;
// --- Building footprints (Microsoft Global ML Building Footprints, ODbL) ---
// List of every footprint file, one per zoom-9 map square (~78 km), with its download link.
const FOOTPRINT_LINKS_URL = "https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv";
const FOOTPRINT_QUADKEY_ZOOM = 9;
// Downloaded files are kept here and reused; the link list is refreshed after a week.
const FOOTPRINT_CACHE_DIR = join(tmpdir(), "hestia-footprints");
const FOOTPRINT_LINKS_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
// Footprints are drawn on a grid this fine (meters per cell) to join and trace them.
const FOOTPRINT_RES_M = 3;
// Buildings closer than this belong to the same settlement.
const FOOTPRINT_LINK_M = 50;
// Smaller structures are granaries, sheds or latrines: part of a settlement, but nobody's home.
const MIN_HOME_M2 = 10;
// A building bigger than this counts as one home per this much floor area (compounds, blocks).
const HOME_M2 = 150;
// Average people per household in Nigeria (Nigeria DHS 2018).
const PEOPLE_PER_HOME = 4.7;
// The share of a settlement's outline covered by buildings that earns full marks (footprints).
const FULL_COVERAGE = 0.15;

// A blob with no separate roof at all is bare ground or a road, not a settlement.
const MIN_ROOF_CLUSTERS = 1;
// Red pixels count as roof only on a sharp edge. Red laterite soil and dirt roads are
// as red as tile roofs, but they fade gradually; a roof has a crisp outline.
const RED_ROOF_MIN_EDGE = 22;
// Painted or galvanized metal roofs often read teal at zoom 17: green and blue both well
// above red and close to each other. Houses are only 4–6 px across, so they are all edge.
const METAL_ROOF_MIN_EDGE = 15;
// A roof cluster bigger than this is a patch of ground, not a house. ~360 px is ~500 m².
const MAX_ROOF_CLUSTER_PX = 360;
// Houses are rectangles, so a cluster should fill a fair share of its bounding box.
// Soil fragments are ragged and fill little of theirs.
const MIN_ROOF_FILL = 0.4;
// Average width of a cluster (pixels ÷ longest side). Crop-row lines and the bright rim
// around a dark tree are 1–2 px wide; a house is 4–10 px across. 3 px is ~3.5 m.
const MIN_ROOF_THICKNESS_PX = 3;
// A house is at most a few times longer than it is wide. Longer is a field edge or track.
const MAX_ROOF_ASPECT = 4;
// Below this compactness a blob is a stringy web of soil and tracks, not a village.
// An OSM place still confirms it, but then people come from roofs only, not its size.
const MIN_COMPACTNESS = 0.06;
// An OSM place this close to a polygon counts as the same settlement.
const OSM_METERS = 150;
// Douglas–Peucker tolerance in pixels. Drops stair-steps along a straight wall.
const SIMPLIFY_PX = 2;
// A safety cap so a huge bbox cannot download thousands of tiles.
const MAX_TILES = 400;
// Public satellite imagery. No API key. URL shape is .../tile/{z}/{y}/{x}.
const ESRI =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";
// Public OSM query services. The second is used when the first is busy.
const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
// How far outside the village box to look for a clinic, widening until one is found.
// 0.36° is about 40 km; remote villages are often 20–50 km from the nearest facility.
// The last step (~660 km) covers any country, so every scan gets a clinic.
const CLINIC_SEARCH_PADS_DEG = [0.36, 0.72, 1.5, 3, 6];
// The search width used when even the widest step finds nothing (no clinic mapped at all).
const CLINIC_PAD_DEG = CLINIC_SEARCH_PADS_DEG[CLINIC_SEARCH_PADS_DEG.length - 1];
// All drivable roads are downloaded this far around the box. Farther out, toward a distant
// clinic, only main roads are, which keeps the download small and is how a team would drive.
const LOCAL_ROADS_PAD_DEG = 0.05;
// Clinics tried per village. The cheapest road trip of these three wins.
const CLINICS_PER_VILLAGE = 3;
// A road farther than this is not a usable approach. The trip is priced off-road.
const MAX_SNAP_METERS = 8000;
// One roof cluster stands in for one dwelling.
const PEOPLE_PER_BUILDING = 5;
// Used when the roof test missed houses: one dwelling per this much settlement area.
const METERS_PER_DWELLING = 250;
// Vaccine, syringe, and a share of the health worker's time, per person.
const HEALTHCARE_USD_PER_PERSON = 10;
// Cooler, records, and the stop itself, paid once even for a tiny settlement.
const HEALTHCARE_USD_PER_STOP = 100;
// Last mile with no road. Slow, so the team's time dominates the fuel.
const OFFROAD_USD_PER_KM = 8;
// The team tour skips detections below this certainty: they are often bare ground, not homes.
const TOUR_MIN_CERTAINTY = 30;
// 2-opt passes over the tour. Each pass tries every pair of legs; it usually settles in a few.
const TOUR_MAX_PASSES = 50;

// Check a { south, west, north, east } box. Latitudes must stay inside Web Mercator's usable range.
function validateBbox(bbox) {
  const keys = ["south", "west", "north", "east"];
  if (keys.some((key) => !Number.isFinite(bbox?.[key]))) {
    throw new Error("bbox needs numeric south, west, north and east");
  }
  if (!(bbox.south < bbox.north) || !(bbox.west < bbox.east)) {
    throw new Error("bbox must have south < north and west < east");
  }
  if (bbox.south <= -85 || bbox.north >= 85) {
    throw new Error("latitude must stay inside -85 and 85");
  }
}

// Slippy-map column. Longitude maps linearly across the world.
function lonToTileX(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}

// Slippy-map row. Latitude is stretched with the Mercator formula.
// Row 0 is the north edge of the world, so a north latitude has a smaller y.
function latToTileY(lat, zoom) {
  const rad = (lat * Math.PI) / 180;
  const merc = Math.log(Math.tan(rad) + 1 / Math.cos(rad));
  return Math.floor(((1 - merc / Math.PI) / 2) * 2 ** zoom);
}

// Turn a pixel corner in the stitched image back into longitude and latitude.
// px/py are measured from the top-left of the mosaic, not from a single tile.
function cornerToLonLat(px, py, grid) {
  const world = TILE * 2 ** grid.zoom;
  const gx = grid.x0 * TILE + px;
  const gy = grid.y0 * TILE + py;
  const lon = (gx / world) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * gy) / world))) * 180) / Math.PI;
  return [lon, lat];
}

// Inverse of cornerToLonLat: where a longitude falls inside the mosaic.
function lonToPixelX(lon, grid) {
  const world = TILE * 2 ** grid.zoom;
  return ((lon + 180) / 360) * world - grid.x0 * TILE;
}

// Inverse for latitude. Used to throw away tile pixels that sit outside the bbox.
function latToPixelY(lat, grid) {
  const world = TILE * 2 ** grid.zoom;
  const rad = (lat * Math.PI) / 180;
  const merc = Math.log(Math.tan(rad) + 1 / Math.cos(rad));
  return ((1 - merc / Math.PI) / 2) * world - grid.y0 * TILE;
}

// Tiles cover a rectangle slightly larger than the requested bbox.
// Zero every mask pixel outside the bbox so a village just past the edge is ignored.
function clipToBbox(mask, width, height, left, top, right, bottom) {
  const x0 = Math.max(0, Math.floor(left));
  const y0 = Math.max(0, Math.floor(top));
  const x1 = Math.min(width, Math.ceil(right));
  const y1 = Math.min(height, Math.ceil(bottom));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < x0 || x >= x1 || y < y0 || y >= y1) mask[y * width + x] = 0;
    }
  }
}

// Download one JPEG tile and decode it to RGBA bytes. Retry a flaky response.
async function fetchTile(zoom, x, y) {
  const url = `${ESRI}/${zoom}/${y}/${x}`;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "village-polygon-detector/1.0" },
      });
      if (!response.ok) throw new Error(`${response.status} for ${url}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      // JPEG files start with the SOI marker FF D8. Anything else is an error page.
      if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
        throw new Error(`tile ${zoom}/${y}/${x} was not a JPEG`);
      }
      const image = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true });
      if (image.width !== TILE || image.height !== TILE) {
        throw new Error(`unexpected tile size ${image.width}x${image.height}`);
      }
      return image.data;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

// Copy one decoded tile into the big RGB mosaic. Alpha is dropped.
// dx/dy are the tile's top-left pixel inside that mosaic.
function blit(rgb, width, pixels, dx, dy) {
  for (let row = 0; row < TILE; row++) {
    const src = row * TILE * 4;
    const dst = ((dy + row) * width + dx) * 3;
    for (let col = 0; col < TILE; col++) {
      const from = src + col * 4;
      const to = dst + col * 3;
      rgb[to] = pixels[from];
      rgb[to + 1] = pixels[from + 1];
      rgb[to + 2] = pixels[from + 2];
    }
  }
}

// Run `fn` over `items` with at most `limit` downloads in flight.
// JavaScript is single-threaded, so writing each tile into its own region is safe.
async function mapPool(items, limit, fn) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      await fn(items[index]);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
}

// Build one RGB image covering the bbox, plus the tile origin needed for lat/lng.
async function loadSatellite(bbox) {
  // Tile y grows southward, so the north edge is the smaller row index.
  const x0 = lonToTileX(bbox.west, ZOOM);
  const x1 = lonToTileX(bbox.east, ZOOM);
  const y0 = latToTileY(bbox.north, ZOOM);
  const y1 = latToTileY(bbox.south, ZOOM);
  const tilesX = x1 - x0 + 1;
  const tilesY = y1 - y0 + 1;
  if (tilesX < 1 || tilesY < 1) throw new Error("bbox does not cover a tile");
  if (tilesX * tilesY > MAX_TILES) {
    throw new Error(
      `bbox covers ${tilesX * tilesY} tiles; keep it under ${MAX_TILES}`
    );
  }

  const width = tilesX * TILE;
  const height = tilesY * TILE;
  const rgb = new Uint8Array(width * height * 3);
  const tiles = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) tiles.push({ x, y });
  }

  let done = 0;
  console.error(`loading ${tiles.length} satellite tiles at zoom ${ZOOM}`);
  await mapPool(tiles, 6, async (tile) => {
    const pixels = await fetchTile(ZOOM, tile.x, tile.y);
    blit(rgb, width, pixels, (tile.x - x0) * TILE, (tile.y - y0) * TILE);
    done += 1;
    if (done === tiles.length || done % 25 === 0) {
      console.error(`tiles ${done}/${tiles.length}`);
    }
  });

  return { rgb, width, height, zoom: ZOOM, x0, y0 };
}

// Brightness difference between this pixel and its four neighbors.
// Roof edges and walls score high. A flat field scores low.
function contrastAt(rgb, width, height, x, y) {
  const index = (y * width + x) * 3;
  const center = (rgb[index] + rgb[index + 1] + rgb[index + 2]) / 3;
  let maxDiff = 0;
  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dx, dy] of neighbors) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const n = (ny * width + nx) * 3;
    const brightness = (rgb[n] + rgb[n + 1] + rgb[n + 2]) / 3;
    const diff = Math.abs(center - brightness);
    if (diff > maxDiff) maxDiff = diff;
  }
  return maxDiff;
}

// Green dominates both other channels: trees, crops, grass.
function isVegetation(r, g, b) {
  return g > 40 && g > r + 12 && g > b + 12;
}

// Dark and blue: open water. Bright blue metal roofs are handled separately.
function isWater(r, g, b) {
  const brightness = (r + g + b) / 3;
  return brightness < 90 && b > 40 && b > r + 12 && b >= g;
}

// Shadow, dense forest, or bare dark soil. Average brightness under 40.
function isDark(r, g, b) {
  return r + g + b < 120;
}

// Roof colors, checked only after vegetation, water, and darkness are rejected.
// Red tile or flat gray that also has an edge, pale concrete, blue corrugated metal,
// or teal-looking painted metal on an edge.
// Gray without an edge is asphalt, so it does not count as a roof by itself.
function isRoof(r, g, b, edge) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brightness = (r + g + b) / 3;
  if (r > 90 && r > g + 25 && r > b + 25 && edge >= RED_ROOF_MIN_EDGE) return true;
  if (min > 165 && max - min < 40) return true;
  if (b > 90 && b > r + 18 && b > g + 8 && brightness >= 100) return true;
  if (g > r + 25 && b > r + 25 && Math.abs(g - b) <= 15 && brightness >= 60 && edge >= METAL_ROOF_MIN_EDGE) {
    return true;
  }
  return brightness > 90 && brightness < 190 && max - min < 22 && edge >= 18;
}

// Two masks from the same pass:
//   roof  : pixels that look like a roof, used later to count buildings
//   built : roof pixels plus any high-contrast structure (walls, roof edges)
function classify(rgb, width, height) {
  const built = new Uint8Array(width * height);
  const roof = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      const offset = pixel * 3;
      const r = rgb[offset];
      const g = rgb[offset + 1];
      const b = rgb[offset + 2];
      if (isVegetation(r, g, b) || isWater(r, g, b) || isDark(r, g, b)) continue;
      const edge = contrastAt(rgb, width, height, x, y);
      const roofLike = isRoof(r, g, b, edge);
      if (roofLike) roof[pixel] = 1;
      if (roofLike || edge >= 28) built[pixel] = 1;
    }
  }
  return { built, roof };
}

// One-row sliding-window max (dilate) or min (erode).
// The deque keeps indexes whose values can still win the current window,
// so a whole row costs linear time instead of window-width times the row.
function filterH(src, width, height, radius, dst, dilate) {
  const deque = new Int32Array(width);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let head = 0;
    let tail = 0;
    for (let x = 0; x < width + radius; x++) {
      if (x < width) {
        const value = src[row + x];
        while (tail > head) {
          const previous = src[row + deque[tail - 1]];
          if (dilate ? previous > value : previous < value) break;
          tail -= 1;
        }
        deque[tail++] = x;
      }
      const outX = x - radius;
      if (outX < 0) continue;
      const left = outX - radius;
      while (tail > head && deque[head] < left) head += 1;
      dst[row + outX] = src[row + deque[head]];
    }
  }
}

// Same window, applied down each column. After filterH, the pair is a square.
function filterV(src, width, height, radius, dst, dilate) {
  const deque = new Int32Array(height);
  for (let x = 0; x < width; x++) {
    let head = 0;
    let tail = 0;
    for (let y = 0; y < height + radius; y++) {
      if (y < height) {
        const value = src[y * width + x];
        while (tail > head) {
          const previous = src[deque[tail - 1] * width + x];
          if (dilate ? previous > value : previous < value) break;
          tail -= 1;
        }
        deque[tail++] = y;
      }
      const outY = y - radius;
      if (outY < 0) continue;
      const top = outY - radius;
      while (tail > head && deque[head] < top) head += 1;
      dst[outY * width + x] = src[deque[head] * width + x];
    }
  }
}

// Square dilate (grow foreground) or erode (shrink foreground).
// `scratch` holds the horizontal pass so src and dst can stay separate.
function rectFilter(src, width, height, radius, dilate, scratch, dst) {
  filterH(src, width, height, radius, scratch, dilate);
  filterV(scratch, width, height, radius, dst, dilate);
}

// Turn scattered building pixels into settlement blobs.
// Open (erode, then dilate) deletes speckle. Close (dilate, then erode)
// fills the gaps between nearby roofs without growing the outer footprint.
function settlementMask(built, width, height) {
  const count = width * height;
  const scratch = new Uint8Array(count);
  const a = new Uint8Array(count);
  const b = new Uint8Array(count);
  rectFilter(built, width, height, OPEN_RADIUS, false, scratch, a);
  rectFilter(a, width, height, OPEN_RADIUS, true, scratch, b);
  rectFilter(b, width, height, CLOSE_RADIUS, true, scratch, a);
  rectFilter(a, width, height, CLOSE_RADIUS, false, scratch, b);
  return b;
}

// How many separate buildings sit in this blob, and how many pixels those buildings cover.
// Roof pixels were stored before the close, so a gap between houses still splits them.
// A cluster under 8 pixels is glare or a speck; one too big or too ragged is ground;
// one too thin or too long is a crop-row line, a track, or the rim of a tree.
function countRoofClusters(indices, width, height) {
  const remaining = new Set(indices);
  let clusters = 0;
  let pixels = 0;
  const stack = [];
  for (const start of indices) {
    if (!remaining.has(start)) continue;
    let size = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    remaining.delete(start);
    stack.push(start);
    while (stack.length) {
      const pixel = stack.pop();
      size += 1;
      const x = pixel % width;
      const y = (pixel - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (!remaining.has(next)) continue;
        remaining.delete(next);
        stack.push(next);
      }
    }
    const boxW = maxX - minX + 1;
    const boxH = maxY - minY + 1;
    const fill = size / (boxW * boxH);
    const thickness = size / Math.max(boxW, boxH);
    const aspect = Math.max(boxW, boxH) / Math.min(boxW, boxH);
    if (
      size >= 8 &&
      size <= MAX_ROOF_CLUSTER_PX &&
      fill >= MIN_ROOF_FILL &&
      thickness >= MIN_ROOF_THICKNESS_PX &&
      aspect <= MAX_ROOF_ASPECT
    ) {
      clusters += 1;
      pixels += size;
    }
  }
  return { clusters, pixels };
}

// Stitch directed pixel edges into loops and keep the largest one.
// That loop is the outer contour. Smaller loops are courtyards and holes.
// `edges` is a flat list of x1,y1,x2,y2 segments in pixel-corner coordinates.
function outerRing(height, edges) {
  const stride = height + 1;
  const nexts = new Map();
  for (let i = 0; i < edges.length; i += 4) {
    const x1 = edges[i];
    const y1 = edges[i + 1];
    const x2 = edges[i + 2];
    const y2 = edges[i + 3];
    const key = x1 * stride + y1;
    let list = nexts.get(key);
    if (!list) {
      list = [];
      nexts.set(key, list);
    }
    list.push(x2 * stride + y2);
  }

  let best = null;
  let bestArea = 0;
  for (const [startKey, list] of nexts) {
    while (list.length) {
      const ring = [];
      let cursor = startKey;
      const guard = edges.length;
      for (let step = 0; step < guard; step++) {
        const x = Math.floor(cursor / stride);
        const y = cursor % stride;
        ring.push([x, y]);
        const outs = nexts.get(cursor);
        if (!outs || outs.length === 0) break;
        const next = outs.pop();
        // Back at the start: the loop is closed. Do not append the start twice.
        if (next === startKey) break;
        cursor = next;
      }
      if (ring.length < 3) continue;
      // Shoelace area. The biggest loop is the outside of the blob.
      let area2 = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        area2 += a[0] * b[1] - b[0] * a[1];
      }
      const area = Math.abs(area2) / 2;
      if (area > bestArea) {
        bestArea = area;
        best = ring;
      }
    }
  }
  if (!best || bestArea < 1) return null;
  return best;
}

// Label each connected settlement and trace its outline.
// Neighbors are 4-connected (up, down, left, right), matching the edge rules below.
// A foreground pixel emits an edge on any side whose neighbor is background.
// `labels`, when given, gets each blob's label at every one of its pixels, so callers can
// tell which blob a point falls in. The blob's own `label` field says which value it used.
function components(mask, roof, width, height, { minPixels = MIN_PIXELS, labels = null } = {}) {
  const seen = new Uint8Array(mask.length);
  const found = [];
  const stack = [];
  let label = 0;

  for (let index = 0; index < mask.length; index++) {
    if (!mask[index] || seen[index]) continue;
    seen[index] = 1;
    stack.push(index);
    label += 1;
    let pixels = 0;
    const roofIndices = [];
    const edges = [];

    while (stack.length) {
      const pixel = stack.pop();
      pixels += 1;
      if (labels) labels[pixel] = label;
      const x = pixel % width;
      const y = (pixel - x) / width;
      if (roof[pixel]) roofIndices.push(pixel);

      const left = x > 0 && mask[pixel - 1];
      const right = x + 1 < width && mask[pixel + 1];
      const up = y > 0 && mask[pixel - width];
      const down = y + 1 < height && mask[pixel + width];
      // Edges walk clockwise around the pixel: top, right, bottom, left.
      if (!up) edges.push(x, y, x + 1, y);
      if (!right) edges.push(x + 1, y, x + 1, y + 1);
      if (!down) edges.push(x + 1, y + 1, x, y + 1);
      if (!left) edges.push(x, y + 1, x, y);

      if (left && !seen[pixel - 1]) {
        seen[pixel - 1] = 1;
        stack.push(pixel - 1);
      }
      if (right && !seen[pixel + 1]) {
        seen[pixel + 1] = 1;
        stack.push(pixel + 1);
      }
      if (up && !seen[pixel - width]) {
        seen[pixel - width] = 1;
        stack.push(pixel - width);
      }
      if (down && !seen[pixel + width]) {
        seen[pixel + width] = 1;
        stack.push(pixel + width);
      }
    }

    if (pixels < minPixels) continue;
    const ring = outerRing(height, edges);
    if (!ring) continue;
    // Only pixels in house-like clusters count toward the roof share.
    const roofs = countRoofClusters(roofIndices, width, height);
    found.push({
      ring,
      pixels,
      label,
      roofPixels: roofs.pixels,
      buildings: roofs.clusters,
    });
  }
  return found;
}

// Distance from a point to the infinite line through start and end.
// Used by the simplifier to decide which corners are worth keeping.
function perpendicularDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  return Math.abs((point[0] - start[0]) * dy - (point[1] - start[1]) * dx) / length;
}

// Ramer–Douglas–Peucker. Keeps a point only when it bends the outline
// by more than `epsilon` pixels. Straight runs collapse to their endpoints.
function simplify(points, epsilon) {
  const count = points.length;
  if (count <= 2) return points.slice();
  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;
  const stack = [[0, count - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    let maxDistance = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const distance = perpendicularDistance(points[i], points[start], points[end]);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }
    if (index !== -1 && maxDistance > epsilon) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  const simplified = [];
  for (let i = 0; i < count; i++) if (keep[i]) simplified.push(points[i]);
  return simplified;
}

// Local flat map in meters around latitude lat0.
// 111320 m per degree of longitude at the equator, 110540 m per degree of latitude.
function toMeters(lon, lat, lat0) {
  const cos = Math.cos((lat0 * Math.PI) / 180);
  return [lon * 111320 * cos, lat * 110540];
}

// Signed area (for winding order) and compactness, both in meters.
// Compactness is 1 for a circle and near 0 for a long road or field edge.
function ringStats(ring) {
  const lat0 = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
  const meters = ring.map(([lon, lat]) => toMeters(lon, lat, lat0));
  let area2 = 0;
  let perimeter = 0;
  for (let i = 0; i < meters.length; i++) {
    const a = meters[i];
    const b = meters[(i + 1) % meters.length];
    area2 += a[0] * b[1] - b[0] * a[1];
    perimeter += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const area = Math.abs(area2) / 2;
  const compactness = perimeter === 0 ? 0 : (4 * Math.PI * area) / (perimeter * perimeter);
  return { area2, compactness, area };
}

// Ray cast: a point is inside when a ray to the right crosses the ring an odd number of times.
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = yi > lat !== yj > lat;
    if (!crosses) continue;
    const x = ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (lon < x) inside = !inside;
  }
  return inside;
}

// Shortest distance in meters from a lon/lat point to one edge of the polygon.
function distanceToSegment(lon, lat, a, b) {
  const cos = Math.cos((lat * Math.PI) / 180);
  const px = lon * cos * 111320;
  const py = lat * 110540;
  const ax = a[0] * cos * 111320;
  const ay = a[1] * 110540;
  const bx = b[0] * cos * 111320;
  const by = b[1] * 110540;
  const dx = bx - ax;
  const dy = by - ay;
  const length2 = dx * dx + dy * dy;
  let t = length2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / length2;
  // Clamp to the segment, not the infinite line.
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Distance from a point to the polygon boundary. Zero when the point is inside.
function distanceToRing(lon, lat, ring) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const distance = distanceToSegment(lon, lat, ring[i], ring[(i + 1) % ring.length]);
    if (distance < best) best = distance;
  }
  return best;
}

// The closest OSM place that is inside the ring or within OSM_METERS of it.
// Places farther away are left for the satellite score.
function nearestPlace(ring, places) {
  let best = null;
  let bestDistance = Infinity;
  for (const place of places) {
    const distance = pointInRing(place.lon, place.lat, ring)
      ? 0
      : distanceToRing(place.lon, place.lat, ring);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = place;
    }
  }
  if (!best || bestDistance > OSM_METERS) return null;
  return best;
}

// Satellite-only certainty. Weights live here so they are easy to change.
//   45% building count : 8 or more roof clusters fills this part
//   30% compactness   : a circle is 1; 0.45 is a typical tight village
//   25% roof share    : fraction of the blob that passed the roof-color test
// The result is capped at 99. 100 is reserved for an OSM match.
function satelliteCertainty(buildings, compactness, roofShare) {
  const buildingScore = Math.min(buildings / 8, 1);
  const shapeScore = Math.min(compactness / 0.45, 1);
  const roofScore = Math.min(roofShare / 0.35, 1);
  const score = 100 * (0.45 * buildingScore + 0.3 * shapeScore + 0.25 * roofScore);
  return Math.min(99, Math.round(score));
}

// Ask Overpass for JSON. Alternates servers because the public ones often answer "too busy".
async function fetchOverpass(query) {
  let lastError;
  const attempts = OVERPASS_SERVERS.length * 2;
  for (let attempt = 0; attempt < attempts; attempt++) {
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
      // A busy Overpass returns an HTML error page instead of JSON.
      if (!response.ok || text[0] !== "{") {
        throw new Error("Overpass is busy or returned an error");
      }
      return JSON.parse(text).elements || [];
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  }
  throw lastError;
}

// Ask Overpass for settlement nodes in the bbox.
async function fetchOsmPlaces(bbox) {
  const query = `[out:json][timeout:60];
node["place"~"^(village|hamlet|isolated_dwelling|town|suburb)$"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
out body;`;
  const elements = await fetchOverpass(query);
  return elements
    .filter((element) => element.type === "node")
    .map((element) => ({
      id: element.id,
      name: element.tags && element.tags.name ? element.tags.name : null,
      lon: element.lon,
      lat: element.lat,
    }));
}

// --- Cost and route --------------------------------------------------------
// Predicted cost is the dollars to vaccinate a village plus the dollars to
// get a team there. The recommendation is the polygon where that sum is lowest.

// Local distance in meters. Accurate enough inside one clinic's reach.
function metersBetween(lon1, lat1, lon2, lat2) {
  const cos = Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  const dx = (lon2 - lon1) * 111320 * cos;
  const dy = (lat2 - lat1) * 110540;
  return Math.hypot(dx, dy);
}

// Grow a bbox by a fixed number of degrees, staying inside Web Mercator.
function padBbox(bbox, degrees) {
  return {
    south: Math.max(-85, bbox.south - degrees),
    west: Math.max(-180, bbox.west - degrees),
    north: Math.min(85, bbox.north + degrees),
    east: Math.min(180, bbox.east + degrees),
  };
}

// Five people per roof cluster, or five per 250 m², whichever is larger.
// The area figure covers adjoining roofs that fused into one cluster.
function estimatePopulation(buildings, areaM2) {
  const fromRoofs = buildings * PEOPLE_PER_BUILDING;
  const fromArea = Math.round(areaM2 / METERS_PER_DWELLING) * PEOPLE_PER_BUILDING;
  return Math.max(fromRoofs, fromArea, PEOPLE_PER_BUILDING);
}

// Dollars to vaccinate everyone in the settlement, including the stop itself.
function healthcareCost(population) {
  return population * HEALTHCARE_USD_PER_PERSON + HEALTHCARE_USD_PER_STOP;
}

// Average of the ring corners. The repeated closing point is left out.
function ringCentroid(ring) {
  const count = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
    ? ring.length - 1
    : ring.length;
  let lon = 0;
  let lat = 0;
  for (let i = 0; i < count; i++) {
    lon += ring[i][0];
    lat += ring[i][1];
  }
  return [lon / count, lat / count];
}

// Hospitals, clinics, doctors, and health posts. Ways use their center point.
// The nearest facilities, searching wider and wider until at least one turns up.
async function fetchClinics(bbox) {
  for (const pad of CLINIC_SEARCH_PADS_DEG) {
    const clinics = await fetchClinicsWithin(padBbox(bbox, pad));
    if (clinics.length) {
      console.error(`clinic search: ${clinics.length} within ${Math.round(pad * 111)} km`);
      return clinics;
    }
  }
  return [];
}

// Hospitals, clinics, doctors, and health posts inside one box.
async function fetchClinicsWithin(box) {
  const query = `[out:json][timeout:90];
(
  node["amenity"~"^(hospital|clinic|doctors|health_post)$"](${box.south},${box.west},${box.north},${box.east});
  way["amenity"~"^(hospital|clinic|doctors|health_post)$"](${box.south},${box.west},${box.north},${box.east});
  node["healthcare"~"^(hospital|clinic|doctor|centre|center)$"](${box.south},${box.west},${box.north},${box.east});
);
out center;`;
  const elements = await fetchOverpass(query);
  const clinics = [];
  for (const element of elements) {
    const lat = Number.isFinite(element.lat) ? element.lat : element.center && element.center.lat;
    const lon = Number.isFinite(element.lon) ? element.lon : element.center && element.center.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const tags = element.tags || {};
    clinics.push({
      osmId: element.id,
      name: tags.name || null,
      kind: tags.amenity || tags.healthcare || "clinic",
      lon,
      lat,
    });
  }
  // A building outline and its entrance node are the same facility.
  const kept = [];
  for (const clinic of clinics) {
    const match = kept.find(
      (other) => metersBetween(other.lon, other.lat, clinic.lon, clinic.lat) < 40
    );
    if (!match) {
      kept.push(clinic);
      continue;
    }
    if (!match.name && clinic.name) {
      match.name = clinic.name;
      match.osmId = clinic.osmId;
      match.kind = clinic.kind;
    }
  }
  return kept;
}

// The few clinics actually worth routing to, so the road download stays local.
function clinicsNearVillages(features, clinics) {
  const chosen = new Map();
  for (const feature of features) {
    const [lon, lat] = ringCentroid(feature.geometry.coordinates[0]);
    const nearest = clinics
      .map((clinic) => ({
        clinic,
        meters: metersBetween(lon, lat, clinic.lon, clinic.lat),
      }))
      .sort((a, b) => a.meters - b.meters)
      .slice(0, CLINICS_PER_VILLAGE);
    for (const item of nearest) chosen.set(item.clinic.osmId, item.clinic);
  }
  return [...chosen.values()];
}

// Box that contains the villages and the clinics the routes will start from.
function bboxAround(bbox, clinics) {
  let south = bbox.south;
  let west = bbox.west;
  let north = bbox.north;
  let east = bbox.east;
  for (const clinic of clinics) {
    south = Math.min(south, clinic.lat);
    north = Math.max(north, clinic.lat);
    west = Math.min(west, clinic.lon);
    east = Math.max(east, clinic.lon);
  }
  // A little extra so a road just past a clinic is still in the graph.
  return padBbox({ south, west, north, east }, 0.01);
}

// Drivable roads, including tracks. Footpaths are not a vaccination route.
const ALL_ROADS =
  "motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service|track";
// Roads a team uses to cover long distances between a far clinic and the settlements.
const MAIN_ROADS = "motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link";

// Roads of the given types inside any of the boxes, in a single Overpass request.
async function fetchRoads(boxes, types = ALL_ROADS) {
  const parts = boxes
    .map((b) => `  way["highway"~"^(${types})$"](${b.south},${b.west},${b.north},${b.east});`)
    .join("\n");
  const query = `[out:json][timeout:180];
(
${parts}
);
out geom;`;
  const elements = await fetchOverpass(query);
  return elements.filter((element) => element.type === "way");
}

// Every road near the boxes, plus main roads across the whole area out to the clinics.
// `boxes` is one or more scan boxes (a joined clinic tour spans several).
export async function fetchRoadNetwork(boxes, clinics) {
  const ways = new Map();
  const add = (list) => list.forEach((way) => ways.set(way.id, way));
  add(await fetchRoads(boxes.map((box) => padBbox(box, LOCAL_ROADS_PAD_DEG))));
  const all = boxes.reduce((acc, box) => ({
    south: Math.min(acc.south, box.south),
    west: Math.min(acc.west, box.west),
    north: Math.max(acc.north, box.north),
    east: Math.max(acc.east, box.east),
  }));
  const extent = bboxAround(all, clinics);
  const local = boxes.length === 1 ? padBbox(boxes[0], LOCAL_ROADS_PAD_DEG) : null;
  const reachesOut =
    !local || extent.south < local.south || extent.west < local.west || extent.north > local.north || extent.east > local.east;
  if (reachesOut) {
    add(await fetchRoads([extent], MAIN_ROADS));
    // The clinic itself may sit on a small road, so add every road right around each one.
    if (clinics.length) {
      add(
        await fetchRoads(
          clinics.map((c) => padBbox({ south: c.lat, west: c.lon, north: c.lat, east: c.lon }, LOCAL_ROADS_PAD_DEG)),
        ),
      );
    }
  }
  return [...ways.values()];
}

// Dollars per kilometer. A track costs more because it is slower and harder on the vehicle.
function roadUsdPerKm(tags) {
  const highway = String(tags.highway || "").replace(/_link$/, "");
  const rates = {
    motorway: 1.2,
    trunk: 1.3,
    primary: 1.4,
    secondary: 1.6,
    tertiary: 1.8,
    unclassified: 2.2,
    residential: 2,
    living_street: 2.2,
    service: 2.4,
    track: 4.5,
  };
  let perKm = rates[highway] ?? 2.5;
  const surface = tags.surface || "";
  const unpaved = /unpaved|dirt|ground|earth|gravel|sand|mud|grass/.test(surface);
  if (unpaved && highway !== "track") perKm *= 1.5;
  const slow = highway === "track" || unpaved;
  return { perKm, slow };
}

function addDirected(adj, from, to, meters, usd, slow) {
  let list = adj.get(from);
  if (!list) {
    list = [];
    adj.set(from, list);
  }
  list.push({ to, meters, usd, slow });
}

// OSM ways become a graph. Intersections share node ids, so ways join there.
function buildRoadGraph(ways) {
  const nodes = new Map();
  const adj = new Map();
  const segments = [];
  for (const way of ways) {
    if (!way.nodes || !way.geometry || way.nodes.length < 2) continue;
    if (way.nodes.length !== way.geometry.length) continue;
    const tags = way.tags || {};
    const { perKm, slow } = roadUsdPerKm(tags);
    const oneway = tags.oneway;
    const forward = oneway !== "-1" && oneway !== "reverse";
    const backward = oneway !== "yes" && oneway !== "true" && oneway !== "1";
    for (let i = 0; i < way.nodes.length; i++) {
      const point = way.geometry[i];
      if (!nodes.has(way.nodes[i])) {
        nodes.set(way.nodes[i], { lon: point.lon, lat: point.lat });
      }
    }
    for (let i = 1; i < way.nodes.length; i++) {
      const a = way.nodes[i - 1];
      const b = way.nodes[i];
      const pa = nodes.get(a);
      const pb = nodes.get(b);
      const meters = metersBetween(pa.lon, pa.lat, pb.lon, pb.lat);
      if (meters === 0) continue;
      const usd = (meters / 1000) * perKm;
      if (forward) addDirected(adj, a, b, meters, usd, slow);
      if (backward) addDirected(adj, b, a, meters, usd, slow);
      segments.push({ a, b, meters, usd, slow, forward, backward });
    }
  }
  return { nodes, adj, segments, nextTemp: -1 };
}

// Closest point on a road segment, in meters, plus where it falls (0 at a, 1 at b).
function projectToSegment(lon, lat, a, b) {
  const cos = Math.cos((lat * Math.PI) / 180);
  const px = lon * cos * 111320;
  const py = lat * 110540;
  const ax = a.lon * cos * 111320;
  const ay = a.lat * 110540;
  const bx = b.lon * cos * 111320;
  const by = b.lat * 110540;
  const dx = bx - ax;
  const dy = by - ay;
  const length2 = dx * dx + dy * dy;
  let t = length2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / length2;
  t = Math.max(0, Math.min(1, t));
  const sx = ax + t * dx;
  const sy = ay + t * dy;
  return {
    t,
    meters: Math.hypot(px - sx, py - sy),
    lon: sx / (cos * 111320),
    lat: sy / 110540,
  };
}

// Join a clinic or village to the road graph at the nearest point on a segment.
// Returns null when every road is farther than MAX_SNAP_METERS.
function snapToRoad(graph, lon, lat) {
  if (graph.segments.length === 0) return null;
  let best = null;
  let bestSegment = null;
  for (const segment of graph.segments) {
    const snap = projectToSegment(lon, lat, graph.nodes.get(segment.a), graph.nodes.get(segment.b));
    if (!best || snap.meters < best.meters) {
      best = snap;
      bestSegment = segment;
    }
  }
  if (!best || best.meters > MAX_SNAP_METERS) return null;
  // Already on a vertex. Reuse that node instead of splitting the edge.
  if (best.t <= 0.02) {
    const node = graph.nodes.get(bestSegment.a);
    return { id: bestSegment.a, lon: node.lon, lat: node.lat, meters: best.meters };
  }
  if (best.t >= 0.98) {
    const node = graph.nodes.get(bestSegment.b);
    return { id: bestSegment.b, lon: node.lon, lat: node.lat, meters: best.meters };
  }
  const id = graph.nextTemp;
  graph.nextTemp -= 1;
  graph.nodes.set(id, { lon: best.lon, lat: best.lat });
  const metersA = bestSegment.meters * best.t;
  const metersB = bestSegment.meters * (1 - best.t);
  const usdA = bestSegment.usd * best.t;
  const usdB = bestSegment.usd * (1 - best.t);
  // Moving toward A is against the way direction, so it follows `backward`.
  if (bestSegment.backward && metersA > 0) {
    addDirected(graph.adj, id, bestSegment.a, metersA, usdA, bestSegment.slow);
  }
  if (bestSegment.forward && metersA > 0) {
    addDirected(graph.adj, bestSegment.a, id, metersA, usdA, bestSegment.slow);
  }
  if (bestSegment.forward && metersB > 0) {
    addDirected(graph.adj, id, bestSegment.b, metersB, usdB, bestSegment.slow);
  }
  if (bestSegment.backward && metersB > 0) {
    addDirected(graph.adj, bestSegment.b, id, metersB, usdB, bestSegment.slow);
  }
  return { id, lon: best.lon, lat: best.lat, meters: best.meters };
}

function heapPush(heap, item) {
  heap.push(item);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heap[parent][0] <= heap[i][0]) break;
    const swap = heap[parent];
    heap[parent] = heap[i];
    heap[i] = swap;
    i = parent;
  }
}

function heapPop(heap) {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length === 0) return top;
  heap[0] = last;
  let i = 0;
  for (;;) {
    const left = i * 2 + 1;
    const right = left + 1;
    let smallest = i;
    if (left < heap.length && heap[left][0] < heap[smallest][0]) smallest = left;
    if (right < heap.length && heap[right][0] < heap[smallest][0]) smallest = right;
    if (smallest === i) break;
    const swap = heap[i];
    heap[i] = heap[smallest];
    heap[smallest] = swap;
    i = smallest;
  }
  return top;
}

// One search from every clinic. The first time a village node is settled,
// that path is the cheapest way to reach it.
function cheapestRoadTrips(graph, sources, targets) {
  const dist = new Map();
  const prev = new Map();
  const origin = new Map();
  const heap = [];
  sources.forEach((source, index) => {
    const cost = source.offroadUsd;
    if (dist.has(source.nodeId) && dist.get(source.nodeId) <= cost) return;
    dist.set(source.nodeId, cost);
    origin.set(source.nodeId, index);
    prev.set(source.nodeId, null);
    heapPush(heap, [cost, source.nodeId, index]);
  });

  const settled = new Set();
  const found = new Map();
  let remaining = 0;
  for (const list of targets.values()) remaining += list.length;

  while (heap.length && remaining > 0) {
    const [cost, node, sourceIndex] = heapPop(heap);
    if (settled.has(node)) continue;
    if (dist.get(node) !== cost || origin.get(node) !== sourceIndex) continue;
    settled.add(node);
    const villages = targets.get(node);
    if (villages) {
      for (const villageIndex of villages) {
        if (found.has(villageIndex)) continue;
        found.set(villageIndex, { node, sourceIndex });
        remaining -= 1;
      }
    }
    const edges = graph.adj.get(node) || [];
    for (const edge of edges) {
      if (settled.has(edge.to)) continue;
      const next = cost + edge.usd;
      if (dist.has(edge.to) && dist.get(edge.to) <= next) continue;
      dist.set(edge.to, next);
      origin.set(edge.to, sourceIndex);
      prev.set(edge.to, { node, meters: edge.meters, usd: edge.usd, slow: edge.slow });
      heapPush(heap, [next, edge.to, sourceIndex]);
    }
  }
  return { found, prev };
}

// Walk predecessors back to the clinic's road node.
function traceRoad(graph, prev, node) {
  const points = [];
  let roadMeters = 0;
  let slowMeters = 0;
  let roadUsd = 0;
  let cursor = node;
  const seen = new Set();
  const guard = prev.size + 2;
  for (let step = 0; step < guard; step++) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const point = graph.nodes.get(cursor);
    points.push([point.lon, point.lat]);
    const from = prev.get(cursor);
    if (!from) break;
    roadMeters += from.meters;
    roadUsd += from.usd;
    if (from.slow) slowMeters += from.meters;
    cursor = from.node;
  }
  points.reverse();
  return { points, roadMeters, slowMeters, roadUsd };
}

// 0 is a short paved hop. 100 is a long way off the road network.
// The off-road gap at the village itself is half the score.
function reachDifficulty(villageOffroadMeters, travelMeters, slowMeters) {
  const offroad = Math.min(villageOffroadMeters / 1000, 1) * 50;
  const distance = Math.min(travelMeters / 30000, 1) * 30;
  const share = travelMeters === 0 ? 1 : slowMeters / travelMeters;
  const surface = Math.min(share, 1) * 20;
  const score = Math.max(0, Math.min(100, Math.round(offroad + distance + surface)));
  const label = score <= 33 ? "easy" : score <= 66 ? "moderate" : "hard";
  return { score, label };
}

function pushCoord(coordinates, lon, lat) {
  const point = [round6(lon), round6(lat)];
  const last = coordinates[coordinates.length - 1];
  if (last && last[0] === point[0] && last[1] === point[1]) return;
  coordinates.push(point);
}

// Direct line, priced entirely as off-road. Used when no road connects the two.
function straightTrip(clinic, lon, lat) {
  const meters = metersBetween(clinic.lon, clinic.lat, lon, lat);
  const reachUsd = Math.round((meters / 1000) * OFFROAD_USD_PER_KM);
  const difficulty = reachDifficulty(meters, meters, meters);
  return {
    reachUsd,
    reachDifficulty: difficulty.score,
    reachLabel: difficulty.label,
    travelMeters: meters,
    offroadMeters: meters,
    slowMeters: meters,
    route: [
      [round6(clinic.lon), round6(clinic.lat)],
      [round6(lon), round6(lat)],
    ],
    clinic,
  };
}

function tripFromRoad(clinic, source, village, traced, destLon, destLat) {
  const travelMeters = traced.roadMeters + source.meters + village.meters;
  const slowMeters = traced.slowMeters + source.meters + village.meters;
  const reachUsd = Math.round(traced.roadUsd + source.offroadUsd + (village.meters / 1000) * OFFROAD_USD_PER_KM);
  const difficulty = reachDifficulty(village.meters, travelMeters, slowMeters);
  const route = [];
  pushCoord(route, clinic.lon, clinic.lat);
  for (const [lon, lat] of traced.points) pushCoord(route, lon, lat);
  pushCoord(route, destLon, destLat);
  return {
    reachUsd,
    reachDifficulty: difficulty.score,
    reachLabel: difficulty.label,
    travelMeters,
    offroadMeters: village.meters,
    slowMeters,
    route,
    clinic,
  };
}

function cheaperTrip(current, candidate) {
  if (!current || candidate.reachUsd < current.reachUsd) return candidate;
  return current;
}

// Fill reach fields on every polygon and return the one with the lowest predicted cost.
function scoreAccess(features, clinics, graph) {
  const arrivals = features.map((feature) => ringCentroid(feature.geometry.coordinates[0]));
  const clinicChoices = arrivals.map(([lon, lat]) =>
    clinics
      .map((clinic) => ({ clinic, meters: metersBetween(lon, lat, clinic.lon, clinic.lat) }))
      .sort((a, b) => a.meters - b.meters)
      .slice(0, CLINICS_PER_VILLAGE)
  );

  const sources = [];
  const sourceKey = new Map();
  for (const choices of clinicChoices) {
    for (const choice of choices) {
      if (sourceKey.has(choice.clinic.osmId)) continue;
      const snap = snapToRoad(graph, choice.clinic.lon, choice.clinic.lat);
      if (!snap) continue;
      sourceKey.set(choice.clinic.osmId, sources.length);
      sources.push({
        clinic: choice.clinic,
        nodeId: snap.id,
        meters: snap.meters,
        offroadUsd: (snap.meters / 1000) * OFFROAD_USD_PER_KM,
      });
    }
  }

  const villageSnaps = arrivals.map(([lon, lat]) => snapToRoad(graph, lon, lat));
  const targets = new Map();
  villageSnaps.forEach((snap, index) => {
    if (!snap) return;
    let list = targets.get(snap.id);
    if (!list) {
      list = [];
      targets.set(snap.id, list);
    }
    list.push(index);
  });

  const road = sources.length && targets.size
    ? cheapestRoadTrips(graph, sources, targets)
    : { found: new Map(), prev: new Map() };

  return features.map((feature, index) => {
    const [lon, lat] = arrivals[index];
    let best = null;
    const hit = road.found.get(index);
    if (hit && villageSnaps[index]) {
      const source = sources[hit.sourceIndex];
      const traced = traceRoad(graph, road.prev, hit.node);
      best = tripFromRoad(source.clinic, source, villageSnaps[index], traced, lon, lat);
    }
    for (const choice of clinicChoices[index]) {
      best = cheaperTrip(best, straightTrip(choice.clinic, lon, lat));
    }
    if (!best) {
      // No clinic mapped anywhere in the widest search. Price that whole distance as off-road.
      const meters = CLINIC_PAD_DEG * 110540;
      const difficulty = reachDifficulty(meters, meters, meters);
      best = {
        reachUsd: Math.round((meters / 1000) * OFFROAD_USD_PER_KM),
        reachDifficulty: difficulty.score,
        reachLabel: difficulty.label,
        travelMeters: meters,
        offroadMeters: meters,
        slowMeters: meters,
        route: [[round6(lon), round6(lat)]],
        clinic: null,
      };
    }
    const population = feature.properties.population;
    const healthcareUsd = feature.properties.healthcareUsd;
    return {
      population,
      healthcareUsd,
      reachDifficulty: best.reachDifficulty,
      reachLabel: best.reachLabel,
      reachUsd: best.reachUsd,
      travelMeters: Math.round(best.travelMeters),
      offroadMeters: Math.round(best.offroadMeters),
      slowMeters: Math.round(best.slowMeters),
      predictedCostUsd: healthcareUsd + best.reachUsd,
      route: best.route,
      clinic: best.clinic
        ? {
            name: best.clinic.name,
            lon: round6(best.clinic.lon),
            lat: round6(best.clinic.lat),
            osmId: best.clinic.osmId,
          }
        : null,
    };
  });
}

function isLowerCost(score, other) {
  if (score.predictedCostUsd !== other.predictedCostUsd) {
    return score.predictedCostUsd < other.predictedCostUsd;
  }
  if (score.reachDifficulty !== other.reachDifficulty) {
    return score.reachDifficulty < other.reachDifficulty;
  }
  return score.population > other.population;
}

// Route every village, then keep the polygon whose predicted cost is lowest.
async function recommendAccess(features, bbox) {
  if (features.length === 0) return { recommendation: null, tour: null };

  let clinics = [];
  try {
    clinics = await fetchClinics(bbox);
  } catch (error) {
    console.error(`clinics unavailable: ${error.message || error}`);
  }
  console.error(`clinics ${clinics.length}`);

  const routed = clinicsNearVillages(features, clinics);
  let graph = buildRoadGraph([]);
  // Roads are needed even with no clinic: the team tour drives between settlements.
  try {
    const ways = await fetchRoadNetwork([bbox], routed);
    graph = buildRoadGraph(ways);
    console.error(`road segments ${graph.segments.length}`);
  } catch (error) {
    console.error(`roads unavailable: ${error.message || error}`);
  }

  const scores = scoreAccess(features, routed, graph);
  let bestIndex = 0;
  for (let i = 0; i < scores.length; i++) {
    const score = scores[i];
    features[i].properties.reachDifficulty = score.reachDifficulty;
    features[i].properties.reachLabel = score.reachLabel;
    features[i].properties.reachUsd = score.reachUsd;
    // The three inputs to reachDifficulty, so a map can explain the score.
    features[i].properties.travelMeters = score.travelMeters;
    features[i].properties.offroadMeters = score.offroadMeters;
    features[i].properties.slowMeters = score.slowMeters;
    features[i].properties.predictedCostUsd = score.predictedCostUsd;
    // Each polygon keeps its own trip so a map can draw every route, not just the winner.
    features[i].properties.route = { type: "LineString", coordinates: score.route };
    features[i].properties.clinic = score.clinic;
    if (isLowerCost(score, scores[bestIndex])) bestIndex = i;
  }

  const best = scores[bestIndex];
  features[bestIndex].properties.recommended = true;
  const clinicName = best.clinic ? best.clinic.name || "unnamed clinic" : "no clinic in range";
  console.error(
    `lowest cost polygon: $${best.predictedCostUsd} ` +
      `(healthcare $${best.healthcareUsd}, reach $${best.reachUsd}, ` +
      `${best.reachLabel} ${best.reachDifficulty}/100, population ${best.population}, ${clinicName})`
  );
  const recommendation = {
    polygon: features[bestIndex].geometry.coordinates[0],
    population: best.population,
    healthcareUsd: best.healthcareUsd,
    reachDifficulty: best.reachDifficulty,
    reachLabel: best.reachLabel,
    reachUsd: best.reachUsd,
    predictedCostUsd: best.predictedCostUsd,
    route: { type: "LineString", coordinates: best.route },
    clinic: best.clinic,
  };
  const tour = planTour(features, scores, routed, graph);
  return { recommendation, tour };
}

// --- Team tour -------------------------------------------------------------
// One vaccination team leaves a clinic, visits every settlement, and returns.
// Each leg costs the cheaper of driving (roads + off-road gaps) or a straight
// off-road line. The visiting order is nearest-neighbor, then improved by 2-opt.

// Cheapest cost from one road node to every node, stopping once `targets` are settled.
function roadCosts(graph, source, targets) {
  const dist = new Map([[source, 0]]);
  const prev = new Map([[source, null]]);
  const heap = [[0, source]];
  const settled = new Set();
  let remaining = targets.size;
  while (heap.length && remaining > 0) {
    const [cost, node] = heapPop(heap);
    if (settled.has(node) || dist.get(node) !== cost) continue;
    settled.add(node);
    if (targets.has(node)) remaining -= 1;
    for (const edge of graph.adj.get(node) || []) {
      const next = cost + edge.usd;
      if (settled.has(edge.to) || (dist.has(edge.to) && dist.get(edge.to) <= next)) continue;
      dist.set(edge.to, next);
      prev.set(edge.to, { node, meters: edge.meters, usd: edge.usd, slow: edge.slow });
      heapPush(heap, [next, edge.to]);
    }
  }
  return { dist, prev };
}

// The clinic most settlements already route from, or else the nearest one.
function pickDepot(stops, scores, clinics) {
  const votes = new Map();
  for (const stop of stops) {
    const clinic = scores[stop.index].clinic;
    if (clinic) votes.set(clinic.osmId, (votes.get(clinic.osmId) || 0) + 1);
  }
  let best = null;
  for (const clinic of clinics) {
    const count = votes.get(clinic.osmId) || 0;
    if (count && (!best || count > best.count)) best = { clinic, count };
  }
  return best ? best.clinic : null;
}

// Total of a closed tour under the symmetric cost matrix.
function tourLength(order, cost) {
  let total = 0;
  for (let i = 0; i < order.length - 1; i++) total += cost[order[i]][order[i + 1]];
  return total;
}

// Reverse order[i..j] whenever that makes the loop cheaper. order[0] and the end stay put.
function twoOpt(order, cost) {
  for (let pass = 0; pass < TOUR_MAX_PASSES; pass++) {
    let improved = false;
    for (let i = 1; i < order.length - 2; i++) {
      for (let j = i + 1; j < order.length - 1; j++) {
        const a = order[i - 1];
        const b = order[i];
        const c = order[j];
        const d = order[j + 1];
        const delta = cost[a][c] + cost[b][d] - cost[a][b] - cost[c][d];
        if (delta < -1e-9) {
          for (let lo = i, hi = j; lo < hi; lo++, hi--) [order[lo], order[hi]] = [order[hi], order[lo]];
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return order;
}

// `depot`, when given, is the clinic the tour must start from (a joined clinic tour).
function planTour(features, scores, clinics, graph, { depot: fixedDepot = null } = {}) {
  const stops = [];
  let skipped = 0;
  features.forEach((feature, index) => {
    if (feature.properties.certainty < TOUR_MIN_CERTAINTY) {
      skipped += 1;
      return;
    }
    const [lon, lat] = ringCentroid(feature.geometry.coordinates[0]);
    stops.push({ index, lon, lat, snap: snapToRoad(graph, lon, lat) });
  });
  if (stops.length === 0) return null;

  // Node 0 is the depot: a clinic, or the settlement closest to a road when no clinic is in range.
  const clinic = fixedDepot ?? pickDepot(stops, scores, clinics);
  let depot;
  if (clinic) {
    depot = {
      lon: clinic.lon,
      lat: clinic.lat,
      snap: snapToRoad(graph, clinic.lon, clinic.lat),
      info: { kind: "clinic", name: clinic.name, osmId: clinic.osmId, lon: round6(clinic.lon), lat: round6(clinic.lat) },
    };
  } else {
    const start = stops.reduce((a, b) => ((a.snap?.meters ?? Infinity) <= (b.snap?.meters ?? Infinity) ? a : b));
    depot = {
      lon: start.lon,
      lat: start.lat,
      snap: start.snap,
      info: { kind: "settlement", name: features[start.index].properties.osmName, lon: round6(start.lon), lat: round6(start.lat) },
    };
  }
  const nodes = [depot, ...stops];
  const n = nodes.length;
  const offroadUsd = (snap) => (snap.meters / 1000) * OFFROAD_USD_PER_KM;

  // Directed leg costs. `road[i][j]` is false when the straight off-road line is cheaper.
  const targets = new Set(nodes.filter((node) => node.snap).map((node) => node.snap.id));
  const direct = Array.from({ length: n }, () => new Float64Array(n));
  const road = Array.from({ length: n }, () => new Uint8Array(n));
  for (let i = 0; i < n; i++) {
    const from = nodes[i];
    const reach = from.snap ? roadCosts(graph, from.snap.id, targets).dist : null;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const to = nodes[j];
      const straight = (metersBetween(from.lon, from.lat, to.lon, to.lat) / 1000) * OFFROAD_USD_PER_KM;
      const viaRoad =
        reach && to.snap && reach.has(to.snap.id)
          ? offroadUsd(from.snap) + reach.get(to.snap.id) + offroadUsd(to.snap)
          : Infinity;
      direct[i][j] = Math.min(straight, viaRoad);
      road[i][j] = viaRoad < straight ? 1 : 0;
    }
  }
  // Roads are almost all two-way out here, so plan on the cheaper direction of each pair.
  const cost = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => Math.min(direct[i][j], direct[j][i]))
  );

  // Nearest neighbor from the depot, back to the depot, then 2-opt.
  const order = [0];
  const left = new Set(Array.from({ length: n - 1 }, (_, k) => k + 1));
  while (left.size) {
    const last = order[order.length - 1];
    let next = null;
    for (const k of left) if (next === null || cost[last][k] < cost[last][next]) next = k;
    order.push(next);
    left.delete(next);
  }
  order.push(0);
  const greedyUsd = tourLength(order, cost);
  twoOpt(order, cost);

  // Draw each leg and add up road and off-road distance.
  const coordinates = [];
  let roadMeters = 0;
  let roadUsd = 0;
  let offroadMeters = 0;
  let offroadUsdTotal = 0;
  for (let k = 0; k < order.length - 1; k++) {
    // Walk the leg in whichever direction the plan priced, then flip it back if needed.
    let a = order[k];
    let b = order[k + 1];
    const flipped = direct[b][a] < direct[a][b];
    if (flipped) [a, b] = [b, a];
    const from = nodes[a];
    const to = nodes[b];
    let points;
    if (road[a][b]) {
      const { prev } = roadCosts(graph, from.snap.id, new Set([to.snap.id]));
      const traced = traceRoad(graph, prev, to.snap.id);
      points = [[from.lon, from.lat], ...traced.points, [to.lon, to.lat]];
      roadMeters += traced.roadMeters;
      roadUsd += traced.roadUsd;
      offroadMeters += from.snap.meters + to.snap.meters;
      offroadUsdTotal += offroadUsd(from.snap) + offroadUsd(to.snap);
    } else {
      const meters = metersBetween(from.lon, from.lat, to.lon, to.lat);
      points = [[from.lon, from.lat], [to.lon, to.lat]];
      offroadMeters += meters;
      offroadUsdTotal += (meters / 1000) * OFFROAD_USD_PER_KM;
    }
    if (flipped) points.reverse();
    for (const [lon, lat] of points) pushCoord(coordinates, lon, lat);
  }

  // Visit position on each settlement, 1 = first stop after the depot.
  const visit = order.slice(1, -1).map((node) => nodes[node].index);
  visit.forEach((featureIndex, position) => {
    features[featureIndex].properties.tourStop = position + 1;
  });

  const costUsd = Math.round(roadUsd + offroadUsdTotal);
  console.error(
    `team tour: ${stops.length} stops, $${costUsd} ` +
      `(${(roadMeters / 1000).toFixed(1)} km road, ${(offroadMeters / 1000).toFixed(1)} km off-road), ` +
      `nearest-neighbor $${Math.round(greedyUsd)} improved by 2-opt`
  );
  return {
    depot: depot.info,
    minCertainty: TOUR_MIN_CERTAINTY,
    stops: stops.length,
    skipped,
    order: visit,
    costUsd,
    roadUsd: Math.round(roadUsd),
    offroadUsd: Math.round(offroadUsdTotal),
    roadMeters: Math.round(roadMeters),
    offroadMeters: Math.round(offroadMeters),
    greedyUsd: Math.round(greedyUsd),
    route: { type: "LineString", coordinates },
  };
}

// Six decimal places is about 0.1 m. Enough for a roof, small enough to read.
function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

// How many pixels in a 0/1 mask are set. Logged so a run can be sanity-checked.
function countOnes(mask) {
  let count = 0;
  for (let i = 0; i < mask.length; i++) count += mask[i];
  return count;
}

// --- Building footprints -----------------------------------------------------

// Zoom-9 quadkey of a point: the name Microsoft uses for each footprint file's map square.
function quadkey(lon, lat, zoom) {
  const n = 2 ** zoom;
  const x = Math.min(n - 1, Math.floor(((lon + 180) / 360) * n));
  const rad = (lat * Math.PI) / 180;
  const y = Math.min(n - 1, Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n));
  let key = "";
  for (let i = zoom; i > 0; i--) {
    const bit = 1 << (i - 1);
    key += String((x & bit ? 1 : 0) + (y & bit ? 2 : 0));
  }
  return key;
}

// Every quadkey the box touches. A 4 km box usually sits in one, at most four.
function quadkeysForBbox(bbox) {
  const keys = new Set();
  for (const lon of [bbox.west, bbox.east]) {
    for (const lat of [bbox.south, bbox.north]) keys.add(quadkey(lon, lat, FOOTPRINT_QUADKEY_ZOOM));
  }
  return [...keys];
}

// Download once, then reuse the copy in the cache folder.
async function cachedDownload(url, file, maxAgeMs = Infinity) {
  const path = join(FOOTPRINT_CACHE_DIR, file);
  try {
    const info = await stat(path);
    if (Date.now() - info.mtimeMs < maxAgeMs) return readFile(path);
  } catch {
    // Not cached yet.
  }
  const response = await fetch(url, { headers: { "User-Agent": "village-polygon-detector/1.0" } });
  if (!response.ok) throw new Error(`footprints: ${response.status} for ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  try {
    await mkdir(FOOTPRINT_CACHE_DIR, { recursive: true });
    await writeFile(`${path}.tmp`, buffer);
    await rename(`${path}.tmp`, path);
  } catch {
    // No writable cache (unusual). Still fine for this run.
  }
  return buffer;
}

let footprintLinks = null;

// quadkey → download links. One square can have several files (parts, or country borders).
async function loadFootprintLinks() {
  if (footprintLinks) return footprintLinks;
  const csv = (await cachedDownload(FOOTPRINT_LINKS_URL, "dataset-links.csv", FOOTPRINT_LINKS_MAX_AGE_MS)).toString();
  const links = new Map();
  for (const line of csv.split("\n").slice(1)) {
    const [, key, url] = line.split(",");
    if (!key || !url) continue;
    if (!links.has(key)) links.set(key, []);
    links.get(key).push(url.trim());
  }
  footprintLinks = links;
  return links;
}

// Buildings whose center is inside the box, or null when Microsoft has no data for this
// part of the world (then the caller falls back to finding roofs by color).
// A missing square inside a covered region just means no buildings were found there.
async function loadFootprints(bbox) {
  const links = await loadFootprintLinks();
  const keys = quadkeysForBbox(bbox);
  const covered = keys.some((key) => {
    const region = key.slice(0, 6);
    for (const known of links.keys()) if (known.startsWith(region)) return true;
    return false;
  });
  if (!covered) return null;

  const buildings = [];
  const margin = 0.01;
  for (const key of keys) {
    for (const [i, url] of (links.get(key) ?? []).entries()) {
      const gz = await cachedDownload(url, `${key}-${i}.csv.gz`);
      for (const line of gunzipSync(gz).toString().split("\n")) {
        // Cheap check on the first corner before parsing the whole line.
        const at = line.indexOf("[[[");
        if (at < 0) continue;
        const comma = line.indexOf(",", at);
        const lon = Number(line.slice(at + 3, comma));
        const lat = Number(line.slice(comma + 1, line.indexOf("]", comma)));
        if (lon < bbox.west - margin || lon > bbox.east + margin || lat < bbox.south - margin || lat > bbox.north + margin) {
          continue;
        }
        const ring = JSON.parse(line).geometry.coordinates[0];
        const [cx, cy] = ringCentroid(ring);
        if (cx < bbox.west || cx > bbox.east || cy < bbox.south || cy > bbox.north) continue;
        buildings.push({ ring, lon: cx, lat: cy, areaM2: ringStats(ring).area });
      }
    }
  }
  return buildings;
}

// How many homes a building stands for: none for a granary or shed, one for a house,
// several for a big compound or block.
function homesIn(areaM2) {
  if (areaM2 < MIN_HOME_M2) return 0;
  return Math.max(1, Math.round(areaM2 / HOME_M2));
}

// Fill a polygon (pixel coordinates) into a mask with an even-odd scanline.
function fillPolygon(mask, width, height, points) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of points) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(height - 1, Math.ceil(maxY)); y++) {
    const yc = y + 0.5;
    const xs = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if (yi > yc !== yj > yc) xs.push(xi + ((yc - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.round(xs[k])); x < Math.min(width, Math.round(xs[k + 1])); x++) {
        mask[y * width + x] = 1;
      }
    }
  }
}

// Settlements from footprints: draw every building on a fine grid, join buildings within
// FOOTPRINT_LINK_M by closing the gaps, trace each group, and count its homes.
function footprintSettlements(bbox, buildings) {
  const lat0 = (bbox.south + bbox.north) / 2;
  const mPerLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const mPerLat = 110540;
  const pad = FOOTPRINT_LINK_M;
  const width = Math.ceil(((bbox.east - bbox.west) * mPerLon + 2 * pad) / FOOTPRINT_RES_M);
  const height = Math.ceil(((bbox.north - bbox.south) * mPerLat + 2 * pad) / FOOTPRINT_RES_M);
  const toPx = (lon, lat) => [
    ((lon - bbox.west) * mPerLon + pad) / FOOTPRINT_RES_M,
    ((bbox.north - lat) * mPerLat + pad) / FOOTPRINT_RES_M,
  ];
  const toLonLat = (x, y) => [
    bbox.west + (x * FOOTPRINT_RES_M - pad) / mPerLon,
    bbox.north - (y * FOOTPRINT_RES_M - pad) / mPerLat,
  ];

  const mask = new Uint8Array(width * height);
  const centerPixel = [];
  for (const b of buildings) {
    fillPolygon(mask, width, height, b.ring.map(([lon, lat]) => toPx(lon, lat)));
    // A building smaller than one cell still marks its center.
    const [x, y] = toPx(b.lon, b.lat).map(Math.floor);
    const pixel = y * width + x;
    mask[pixel] = 1;
    centerPixel.push(pixel);
  }

  // Close (grow, then shrink) by half the link distance: gaps narrower than the link
  // distance fill in, and the outline still hugs the outer buildings.
  const radius = Math.ceil(FOOTPRINT_LINK_M / 2 / FOOTPRINT_RES_M);
  const scratch = new Uint8Array(mask.length);
  const grown = new Uint8Array(mask.length);
  const closed = new Uint8Array(mask.length);
  rectFilter(mask, width, height, radius, true, scratch, grown);
  rectFilter(grown, width, height, radius, false, scratch, closed);

  const labels = new Int32Array(mask.length);
  const blobs = components(closed, new Uint8Array(mask.length), width, height, { minPixels: 1, labels });
  const byLabel = new Map(blobs.map((blob) => [blob.label, { blob, buildings: [] }]));
  buildings.forEach((b, i) => byLabel.get(labels[centerPixel[i]])?.buildings.push(b));

  const settlements = [];
  for (const { blob, buildings: members } of byLabel.values()) {
    const homes = members.reduce((sum, b) => sum + homesIn(b.areaM2), 0);
    // Only sheds and granaries: nobody lives here.
    if (homes === 0) continue;
    const simplified = simplify(blob.ring, 1);
    if (simplified.length < 3) continue;
    const ring = simplified.map(([x, y]) => toLonLat(x, y));
    const builtM2 = members.reduce((sum, b) => sum + b.areaM2, 0);
    settlements.push({ ring, buildings: members.length, homes, builtM2 });
  }
  return settlements;
}

// Footprint certainty. Same three parts and weights as satelliteCertainty, but the last
// part is the share of the outline covered by building footprints, which is real data.
function footprintCertainty(buildings, compactness, coverage) {
  const buildingScore = Math.min(buildings / 8, 1);
  const shapeScore = Math.min(compactness / 0.45, 1);
  const coverageScore = Math.min(coverage / FULL_COVERAGE, 1);
  const score = 100 * (0.45 * buildingScore + 0.3 * shapeScore + 0.25 * coverageScore);
  return Math.min(99, Math.round(score));
}

// --- Color fallback --------------------------------------------------------

// Settlements by finding roofs in Esri satellite pixels. Used only where there are no footprints.
async function pixelSettlements(bbox) {
  // Download and stitch the satellite tiles that cover that box.
  const grid = await loadSatellite(bbox);

  // Split the image into two masks: any structure, and roof-colored pixels.
  // Roof pixels are kept separate so buildings can be counted after roofs are joined.
  const { built, roof } = classify(grid.rgb, grid.width, grid.height);
  // The raw image is large and unused after classification, so release it.
  grid.rgb = null;

  // Tiles are bigger than the box. Convert each edge into mosaic pixels
  // so the next step can erase the margin outside the request.
  const left = lonToPixelX(bbox.west, grid);
  const top = latToPixelY(bbox.north, grid);
  const right = lonToPixelX(bbox.east, grid);
  const bottom = latToPixelY(bbox.south, grid);
  // Drop built pixels outside the box, or a village just past the edge would be included.
  clipToBbox(built, grid.width, grid.height, left, top, right, bottom);
  // Same clip on the roof mask, so building counts stay inside the box too.
  clipToBbox(roof, grid.width, grid.height, left, top, right, bottom);
  // Stderr only. Confirms the classifier saw something before polygons are built.
  console.error(`built pixels ${countOnes(built)}, roof pixels ${countOnes(roof)}`);

  // Join nearby roofs into one blob per settlement and remove speckle.
  const mask = settlementMask(built, grid.width, grid.height);
  const settlements = [];
  for (const blob of components(mask, roof, grid.width, grid.height)) {
    if (blob.buildings < MIN_ROOF_CLUSTERS) continue;
    // Pixel outlines follow every stair-step. Keep only corners that change direction.
    const simplified = simplify(blob.ring, SIMPLIFY_PX);
    // A ring needs three corners. Fewer than that is a degenerate sliver.
    if (simplified.length < 3) continue;
    // Pixel corners are in image space. GeoJSON needs longitude, latitude.
    const ring = simplified.map(([x, y]) => cornerToLonLat(x, y, grid));
    // Share of the blob that looked like a roof. Roads and fields score low here.
    const roofShare = blob.pixels === 0 ? 0 : blob.roofPixels / blob.pixels;
    settlements.push({ ring, buildings: blob.buildings, roofShare });
  }
  return settlements;
}

// Run the whole pipeline on one box and return the GeoJSON FeatureCollection.
// Progress lines go to console.error. Throws when tiles or OpenStreetMap can't be reached.
export async function detectVillages(bbox) {
  // The only input is the bounding box. Everything else is derived from it.
  validateBbox(bbox);

  // Real building outlines where Microsoft has them; roof colors only as a fallback.
  let buildingSource = "footprints";
  let found;
  let footprints = null;
  try {
    footprints = await loadFootprints(bbox);
  } catch (error) {
    console.error(`footprints unavailable: ${error.message || error}`);
  }
  if (footprints) {
    console.error(`footprint buildings ${footprints.length}`);
    found = footprintSettlements(bbox, footprints);
  } else {
    buildingSource = "pixels";
    found = await pixelSettlements(bbox);
  }
  console.error(`settlements ${found.length} (${buildingSource})`);

  // OSM places are the only source that can produce certainty 100.
  const places = await fetchOsmPlaces(bbox);
  console.error(`osm places ${places.length}`);

  // One GeoJSON feature per village polygon.
  const features = [];
  for (const settlement of found) {
    const geographic = settlement.ring;
    // Signed area tells the winding. GeoJSON exteriors must be counter-clockwise.
    const { area2 } = ringStats(geographic);
    // Negative area is clockwise, so flip the ring. Shape and area stay the same.
    if (area2 < 0) geographic.reverse();
    // Compactness is measured after the flip, on the ring that will be written out.
    const stats = ringStats(geographic);

    // Inside the polygon, or within 150 m, this place confirms the village.
    const place = nearestPlace(geographic, places);

    let certaintyScore;
    let population;
    let roofShare;
    if (buildingSource === "footprints") {
      // Share of the outline covered by building footprints.
      roofShare = stats.area === 0 ? 0 : Math.min(1, settlement.builtM2 / stats.area);
      certaintyScore = footprintCertainty(settlement.buildings, stats.compactness, roofShare);
      population = Math.max(1, Math.round(settlement.homes * PEOPLE_PER_HOME));
    } else {
      // A stringy web of soil and tracks. Keep it only if OSM says people live there.
      const stringy = stats.compactness < MIN_COMPACTNESS;
      if (stringy && !place) continue;
      roofShare = settlement.roofShare;
      certaintyScore = satelliteCertainty(settlement.buildings, stats.compactness, roofShare);
      // People from roofs and from settlement area. The larger figure is kept.
      // A stringy outline's area is mostly empty ground, so it counts roofs only.
      population = estimatePopulation(settlement.buildings, stringy ? 0 : stats.area);
    }
    // A matched OSM place is 100. Anything else is a satellite guess, never 100.
    const certainty = place ? 100 : certaintyScore;
    const healthcareUsd = healthcareCost(population);

    // Round so coordinates stay readable. Six decimals is about 0.1 m.
    const closed = geographic.map(([lon, lat]) => [round6(lon), round6(lat)]);
    // GeoJSON polygons are closed rings: the first point is repeated at the end.
    closed.push(closed[0]);
    features.push({
      type: "Feature",
      properties: {
        // 100 when OSM confirmed the blob, otherwise the satellite score.
        certainty,
        // Which evidence produced that number.
        source: place ? "osm" : "satellite",
        // Name and id are present only when a place matched. Otherwise null.
        osmName: place ? place.name : null,
        osmId: place ? place.id : null,
        // People and vaccination cost. Reach cost is filled in after routing.
        population,
        healthcareUsd,
        // Where the buildings came from: "footprints" (Microsoft) or "pixels" (roof colors).
        buildingSource,
        // Inputs to the population estimate and the certainty, kept for explanations.
        buildings: settlement.buildings,
        homes: settlement.homes ?? null,
        areaM2: Math.round(stats.area),
        compactness: Math.round(stats.compactness * 1000) / 1000,
        roofShare: Math.round(roofShare * 1000) / 1000,
      },
      // One outer ring. Holes were dropped when the contour was traced.
      geometry: { type: "Polygon", coordinates: [closed] },
    });
  }

  // Price a clinic route for every polygon, keep the cheapest one, and plan the team tour.
  const { recommendation, tour } = await recommendAccess(features, bbox);

  // Wrap the polygons in the standard GeoJSON collection type.
  // `recommendation` is the route section: points, population, healthcare
  // money, reach difficulty, and the cost to get there.
  // `tour` is one round trip from a clinic through every settlement worth visiting.
  return { type: "FeatureCollection", recommendation, tour, features };
}

// --- Joined clinic tours ---------------------------------------------------

// One tour from `clinic` through the settlements of several scans, on one road network that
// covers all of them. `scans` is [{ id, bbox, features }]. Stops come back as
// { scanId, index } (index into that scan's features), in visiting order.
export async function planClinicTour(clinic, scans) {
  const features = [];
  const owners = [];
  for (const scan of scans) {
    scan.features.forEach((feature, index) => {
      // Copies, so planning never writes into the saved scans.
      features.push({ ...feature, properties: { ...feature.properties } });
      owners.push({ scanId: scan.id, index });
    });
  }
  if (!features.length) return null;
  const graph = buildRoadGraph(await fetchRoadNetwork(scans.map((scan) => scan.bbox), [clinic]));
  console.error(`joined tour: ${scans.length} scans, ${features.length} settlements, ${graph.segments.length} road segments`);
  const tour = planTour(features, null, [clinic], graph, { depot: clinic });
  if (!tour) return null;
  return { ...tour, order: tour.order.map((i) => owners[i]) };
}
