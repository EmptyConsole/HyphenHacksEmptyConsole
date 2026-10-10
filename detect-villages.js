// Village polygons from satellite tiles, scored against OpenStreetMap.
// No model: color and shape only.
//
//   node detect-villages.js --south 9.02 --west 38.70 --north 9.06 --east 38.74

import jpeg from "jpeg-js";

const ZOOM = 17;
const TILE = 256;
const OPEN_RADIUS = 1;
const CLOSE_RADIUS = 12;
const MIN_PIXELS = 400;
const OSM_METERS = 150;
const SIMPLIFY_PX = 2;
const MAX_TILES = 400;
const ESRI =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";
const OVERPASS = "https://overpass-api.de/api/interpreter";

function readBbox(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    args[argv[i].slice(2)] = Number(argv[++i]);
  }
  const keys = ["south", "west", "north", "east"];
  if (keys.some((key) => !Number.isFinite(args[key]))) {
    console.error(
      "Usage: node detect-villages.js --south LAT --west LNG --north LAT --east LNG"
    );
    process.exit(1);
  }
  if (!(args.south < args.north) || !(args.west < args.east)) {
    console.error("bbox must have south < north and west < east");
    process.exit(1);
  }
  if (args.south <= -85 || args.north >= 85) {
    console.error("latitude must stay inside -85 and 85");
    process.exit(1);
  }
  return args;
}

function lonToTileX(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}

function latToTileY(lat, zoom) {
  const rad = (lat * Math.PI) / 180;
  const merc = Math.log(Math.tan(rad) + 1 / Math.cos(rad));
  return Math.floor(((1 - merc / Math.PI) / 2) * 2 ** zoom);
}

function cornerToLonLat(px, py, grid) {
  const world = TILE * 2 ** grid.zoom;
  const gx = grid.x0 * TILE + px;
  const gy = grid.y0 * TILE + py;
  const lon = (gx / world) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * gy) / world))) * 180) / Math.PI;
  return [lon, lat];
}

function lonToPixelX(lon, grid) {
  const world = TILE * 2 ** grid.zoom;
  return ((lon + 180) / 360) * world - grid.x0 * TILE;
}

function latToPixelY(lat, grid) {
  const world = TILE * 2 ** grid.zoom;
  const rad = (lat * Math.PI) / 180;
  const merc = Math.log(Math.tan(rad) + 1 / Math.cos(rad));
  return ((1 - merc / Math.PI) / 2) * world - grid.y0 * TILE;
}

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

async function loadSatellite(bbox) {
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

function isVegetation(r, g, b) {
  return g > 40 && g > r + 12 && g > b + 12;
}

function isWater(r, g, b) {
  const brightness = (r + g + b) / 3;
  return brightness < 90 && b > 40 && b > r + 12 && b >= g;
}

function isDark(r, g, b) {
  return r + g + b < 120;
}

// Red tile, pale concrete, blue metal, or a gray roof that has an edge.
function isRoof(r, g, b, edge) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brightness = (r + g + b) / 3;
  if (r > 90 && r > g + 25 && r > b + 25) return true;
  if (min > 165 && max - min < 40) return true;
  if (b > 90 && b > r + 18 && b > g + 8 && brightness >= 100) return true;
  return brightness > 90 && brightness < 190 && max - min < 22 && edge >= 18;
}

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

// Square max/min filter. Horizontal then vertical, so the window is a square.
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

function rectFilter(src, width, height, radius, dilate, scratch, dst) {
  filterH(src, width, height, radius, scratch, dilate);
  filterV(scratch, width, height, radius, dst, dilate);
}

// Open drops speckle. Close joins nearby roofs into one settlement.
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

function countRoofClusters(indices, width, height) {
  const remaining = new Set(indices);
  let clusters = 0;
  const stack = [];
  for (const start of indices) {
    if (!remaining.has(start)) continue;
    let size = 0;
    remaining.delete(start);
    stack.push(start);
    while (stack.length) {
      const pixel = stack.pop();
      size += 1;
      const x = pixel % width;
      const y = (pixel - x) / width;
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
    if (size >= 8) clusters += 1;
  }
  return clusters;
}

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
        if (next === startKey) break;
        cursor = next;
      }
      if (ring.length < 3) continue;
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

function components(mask, roof, width, height) {
  const seen = new Uint8Array(mask.length);
  const found = [];
  const stack = [];

  for (let index = 0; index < mask.length; index++) {
    if (!mask[index] || seen[index]) continue;
    seen[index] = 1;
    stack.push(index);
    let pixels = 0;
    let roofPixels = 0;
    const roofIndices = [];
    const edges = [];

    while (stack.length) {
      const pixel = stack.pop();
      pixels += 1;
      const x = pixel % width;
      const y = (pixel - x) / width;
      if (roof[pixel]) {
        roofPixels += 1;
        roofIndices.push(pixel);
      }

      const left = x > 0 && mask[pixel - 1];
      const right = x + 1 < width && mask[pixel + 1];
      const up = y > 0 && mask[pixel - width];
      const down = y + 1 < height && mask[pixel + width];
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

    if (pixels < MIN_PIXELS) continue;
    const ring = outerRing(height, edges);
    if (!ring) continue;
    found.push({
      ring,
      pixels,
      roofPixels,
      buildings: countRoofClusters(roofIndices, width, height),
    });
  }
  return found;
}

function perpendicularDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  return Math.abs((point[0] - start[0]) * dy - (point[1] - start[1]) * dx) / length;
}

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

function toMeters(lon, lat, lat0) {
  const cos = Math.cos((lat0 * Math.PI) / 180);
  return [lon * 111320 * cos, lat * 110540];
}

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
  return { area2, compactness };
}

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
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distanceToRing(lon, lat, ring) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const distance = distanceToSegment(lon, lat, ring[i], ring[(i + 1) % ring.length]);
    if (distance < best) best = distance;
  }
  return best;
}

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

// OSM match is 100. Satellite shape never reaches that.
function satelliteCertainty(buildings, compactness, roofShare) {
  const buildingScore = Math.min(buildings / 8, 1);
  const shapeScore = Math.min(compactness / 0.45, 1);
  const roofScore = Math.min(roofShare / 0.35, 1);
  const score = 100 * (0.45 * buildingScore + 0.3 * shapeScore + 0.25 * roofScore);
  return Math.min(99, Math.round(score));
}

async function fetchOsmPlaces(bbox) {
  const query = `[out:json][timeout:60];
node["place"~"^(village|hamlet|isolated_dwelling|town|suburb)$"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
out body;`;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(OVERPASS, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "village-polygon-detector/1.0",
        },
        body: new URLSearchParams({ data: query }),
      });
      const text = await response.text();
      if (!response.ok || text[0] !== "{") {
        throw new Error("Overpass is busy or returned an error");
      }
      const json = JSON.parse(text);
      return (json.elements || [])
        .filter((element) => element.type === "node")
        .map((element) => ({
          id: element.id,
          name: element.tags && element.tags.name ? element.tags.name : null,
          lon: element.lon,
          lat: element.lat,
        }));
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  throw lastError;
}

function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

function countOnes(mask) {
  let count = 0;
  for (let i = 0; i < mask.length; i++) count += mask[i];
  return count;
}

async function main() {
  const bbox = readBbox(process.argv);
  const grid = await loadSatellite(bbox);
  const { built, roof } = classify(grid.rgb, grid.width, grid.height);
  grid.rgb = null;
  const left = lonToPixelX(bbox.west, grid);
  const top = latToPixelY(bbox.north, grid);
  const right = lonToPixelX(bbox.east, grid);
  const bottom = latToPixelY(bbox.south, grid);
  clipToBbox(built, grid.width, grid.height, left, top, right, bottom);
  clipToBbox(roof, grid.width, grid.height, left, top, right, bottom);
  console.error(`built pixels ${countOnes(built)}, roof pixels ${countOnes(roof)}`);
  const mask = settlementMask(built, grid.width, grid.height);
  const blobs = components(mask, roof, grid.width, grid.height);
  console.error(`settlements ${blobs.length}`);

  const places = await fetchOsmPlaces(bbox);
  console.error(`osm places ${places.length}`);

  const features = [];
  for (const blob of blobs) {
    const simplified = simplify(blob.ring, SIMPLIFY_PX);
    if (simplified.length < 3) continue;
    const geographic = simplified.map(([x, y]) => cornerToLonLat(x, y, grid));
    const { area2 } = ringStats(geographic);
    if (area2 < 0) geographic.reverse();
    const stats = ringStats(geographic);
    const place = nearestPlace(geographic, places);
    const roofShare = blob.pixels === 0 ? 0 : blob.roofPixels / blob.pixels;
    const certainty = place
      ? 100
      : satelliteCertainty(blob.buildings, stats.compactness, roofShare);
    const closed = geographic.map(([lon, lat]) => [round6(lon), round6(lat)]);
    closed.push(closed[0]);
    features.push({
      type: "Feature",
      properties: {
        certainty,
        source: place ? "osm" : "satellite",
        osmName: place ? place.name : null,
        osmId: place ? place.id : null,
      },
      geometry: { type: "Polygon", coordinates: [closed] },
    });
  }

  const collection = { type: "FeatureCollection", features };
  console.log(JSON.stringify(collection, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
