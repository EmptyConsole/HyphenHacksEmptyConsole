import { area as turfArea, bbox, booleanPointInPolygon } from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import type { AreaFeature, ScanMeta } from "@/data/types";

export type UnscannedTarget = {
  lng: number;
  lat: number;
  countryId: string;
  countryName: string;
};

const MIN_RURAL = 250_000;
const MIN_AREA_M2 = 8_000 * 1e6;
/** Keep the new view clear of a saved scan box. */
const SCAN_GAP_DEG = 0.08;

function largestPart(feature: AreaFeature): Feature<Polygon> | null {
  const geometry = feature.geometry;
  if (geometry.type === "Polygon") {
    return { type: "Feature", properties: {}, geometry };
  }
  if (geometry.type !== "MultiPolygon") return null;
  let best: Feature<Polygon> | null = null;
  let bestArea = 0;
  for (const coordinates of geometry.coordinates) {
    const part: Feature<Polygon> = {
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates },
    };
    const size = turfArea(part);
    if (size > bestArea) {
      best = part;
      bestArea = size;
    }
  }
  return best;
}

function inland(feature: AreaFeature, lng: number, lat: number, margin: number) {
  const hits = (x: number, y: number) => booleanPointInPolygon([x, y], feature);
  if (!hits(lng, lat)) return false;
  if (margin <= 0) return true;
  return hits(lng + margin, lat) && hits(lng - margin, lat) && hits(lng, lat + margin) && hits(lng, lat - margin);
}

function nearScan(lng: number, lat: number, scans: ScanMeta[]) {
  return scans.some((scan) => {
    const box = scan.bbox;
    return (
      lng > box.west - SCAN_GAP_DEG &&
      lng < box.east + SCAN_GAP_DEG &&
      lat > box.south - SCAN_GAP_DEG &&
      lat < box.north + SCAN_GAP_DEG
    );
  });
}

function pickWeighted<T>(items: T[], weights: number[], rand: () => number) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = rand() * total;
  for (let i = 0; i < items.length; i++) {
    cursor -= weights[i];
    if (cursor <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * A point on land in a country with a large rural population, away from scans
 * already saved. Countries with no scans are preferred. Returns null if none is found.
 */
export function pickUnscannedArea(
  countries: AreaFeature[],
  scans: ScanMeta[],
  rand: () => number = Math.random,
): UnscannedTarget | null {
  const counts = new Map<string, number>();
  for (const scan of scans) counts.set(scan.countryId, (counts.get(scan.countryId) ?? 0) + 1);

  const pool = countries.filter((country) => {
    const rural = country.properties.baseline_rural ?? 0;
    if (rural < MIN_RURAL) return false;
    const part = largestPart(country);
    return part !== null && turfArea(part) >= MIN_AREA_M2;
  });
  if (pool.length === 0) return null;

  const weights = pool.map((country) => {
    const rural = country.properties.baseline_rural ?? MIN_RURAL;
    const scanned = counts.get(country.properties.id) ?? 0;
    return Math.log10(rural) / (1 + scanned * 6);
  });

  for (let attempt = 0; attempt < 24; attempt++) {
    const country = pickWeighted(pool, weights, rand);
    const part = largestPart(country);
    if (!part) continue;
    const [west, south, east, north] = bbox(part);
    const padX = (east - west) * 0.08;
    const padY = (north - south) * 0.08;
    const spanX = Math.max(east - west - padX * 2, 0.02);
    const spanY = Math.max(north - south - padY * 2, 0.02);
    for (let i = 0; i < 36; i++) {
      const lng = west + padX + rand() * spanX;
      const lat = south + padY + rand() * spanY;
      if (!inland(country, lng, lat, i < 24 ? 0.05 : 0)) continue;
      if (nearScan(lng, lat, scans)) continue;
      return {
        lng,
        lat,
        countryId: country.properties.id,
        countryName: country.properties.name,
      };
    }
  }
  return null;
}

/**
 * Zoom at which a map of this size stays under the detector's tile cap.
 * Viewport tile count depends on zoom and pixels, not on latitude.
 */
export function scanZoom(width: number, height: number) {
  const w = Math.max(width, 320);
  const h = Math.max(height, 240);
  const targetTiles = 220;
  const ratio = (targetTiles * 512 * 512) / (w * h);
  const zoom = (34 - Math.log2(ratio)) / 2 + 0.35;
  return Math.min(15.5, Math.max(8, zoom));
}
