import { area as turfArea } from "@turf/turf";
import type { Polygon } from "geojson";
import { baselineConfig as cfg } from "./baselineConfig";
import { fillerChildren, fillerCountries } from "./fillerProvider";
import ruralPopulation from "./ruralPopulation.json";
import type {
  AreaCollection,
  AreaFeature,
  ClinicCollection,
  MapDataProvider,
  RouteCollection,
  ScanMeta,
  ScanRequest,
  VillageLayer,
} from "./types";

/**
 * Real data where detect-villages.js has run, modeled data everywhere else.
 *
 * - Country totals: World Bank rural population × no-coverage share × cost per person,
 *   for every country (see baselineConfig).
 * - A country with scans: its regions are the scan boxes, and their villages are the
 *   detected polygons with routes and clinics.
 * - A country without scans: generated regions and villages that split its total.
 */

const rural = ruralPopulation as Record<string, { rural: number; year: number }>;
const SCAN_PREFIX = "scan:";

/** Shape of one feature in a saved detect-villages.js FeatureCollection. */
interface DetectedVillage {
  type: "Feature";
  geometry: Polygon;
  properties: {
    certainty: number;
    source: "osm" | "satellite";
    osmName: string | null;
    population: number;
    healthcareUsd: number;
    reachDifficulty?: number;
    reachLabel?: "easy" | "moderate" | "hard";
    reachUsd?: number;
    predictedCostUsd?: number;
    route?: { type: "LineString"; coordinates: [number, number][] };
    clinic?: { name: string | null; lon: number; lat: number; osmId: number } | null;
  };
}

let scans: ScanMeta[] = [];
let scansVersion = "";
let countriesCache: Promise<AreaCollection> | null = null;
const regionCache = new Map<string, Promise<AreaCollection>>();
const villageCache = new Map<string, Promise<VillageLayer>>();

function clearCaches() {
  countriesCache = null;
  regionCache.clear();
  villageCache.clear();
}

function scansFor(countryId: string) {
  return scans.filter((s) => s.countryId === countryId);
}

/** Observed USD per person over the given scans, or null when they found nobody. */
function observedCostPerPerson(list: ScanMeta[]) {
  const people = list.reduce((sum, s) => sum + s.population, 0);
  const usd = list.reduce((sum, s) => sum + s.costUsd, 0);
  return people > 0 ? usd / people : null;
}

function bboxPolygon({ south, west, north, east }: ScanMeta["bbox"]): Polygon {
  return {
    type: "Polygon",
    coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
  };
}

async function buildCountries(): Promise<AreaCollection> {
  const base = await fillerCountries();
  const globalCost = observedCostPerPerson(scans) ?? cfg.defaultCostPerPerson;
  const features = base.features.map((f): AreaFeature => {
    const id = f.properties.id;
    const own = scansFor(id);
    const ruralPeople = rural[id]?.rural ?? (turfArea(f) / 1e6) * cfg.fallbackRuralPerKm2;
    const population = Math.round(ruralPeople * cfg.noCoverageShare);
    const perPerson = observedCostPerPerson(own) ?? globalCost;
    return {
      ...f,
      properties: {
        ...f.properties,
        estimated_population: population,
        estimated_cost: Math.round(population * perPerson),
        data_source: own.length ? "detected" : "modeled",
      },
    };
  });
  return { type: "FeatureCollection", features };
}

function scanRegions(country: AreaFeature): AreaCollection {
  const list = scansFor(country.properties.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    type: "FeatureCollection",
    features: list.map((s, i) => ({
      type: "Feature",
      geometry: bboxPolygon(s.bbox),
      properties: {
        id: SCAN_PREFIX + s.id,
        name: s.label ?? `Scan area ${i + 1}`,
        level: "region",
        estimated_population: s.population,
        estimated_cost: s.costUsd,
        data_source: "detected",
      },
    })),
  };
}

async function scanVillages(scanId: string): Promise<VillageLayer> {
  const response = await fetch(`/api/scans/${encodeURIComponent(scanId)}`);
  if (!response.ok) throw new Error(`scan ${scanId}: ${response.status}`);
  const detected = (await response.json()) as { features: DetectedVillage[] };

  const areas: AreaCollection = { type: "FeatureCollection", features: [] };
  const routes: RouteCollection = { type: "FeatureCollection", features: [] };
  const clinics: ClinicCollection = { type: "FeatureCollection", features: [] };
  const clinicIds = new Set<string>();
  let unnamed = 0;

  detected.features.forEach((v, i) => {
    const p = v.properties;
    const id = `${scanId}/${i + 1}`;
    areas.features.push({
      type: "Feature",
      geometry: v.geometry,
      properties: {
        id,
        name: p.osmName ?? `Unnamed settlement ${++unnamed}`,
        level: "village",
        estimated_population: p.population,
        estimated_cost: p.predictedCostUsd ?? p.healthcareUsd,
        data_source: "detected",
        certainty: p.certainty,
        detection: p.source,
        reach_label: p.reachLabel,
        reach_difficulty: p.reachDifficulty,
        reach_cost: p.reachUsd,
        clinic_name: p.clinic ? (p.clinic.name ?? "Unnamed clinic") : null,
      },
    });
    const line = p.route?.coordinates ?? [];
    if (line.length >= 2) {
      routes.features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: line },
        // A two-point route is the straight off-road fallback in detect-villages.js.
        properties: { villageId: id, kind: line.length === 2 ? "offroad" : "road" },
      });
    }
    if (p.clinic && !clinicIds.has(String(p.clinic.osmId))) {
      clinicIds.add(String(p.clinic.osmId));
      clinics.features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.clinic.lon, p.clinic.lat] },
        properties: { id: String(p.clinic.osmId), name: p.clinic.name ?? "Unnamed clinic" },
      });
    }
  });
  return { areas, routes, clinics };
}

const EMPTY_ROUTES: RouteCollection = { type: "FeatureCollection", features: [] };
const EMPTY_CLINICS: ClinicCollection = { type: "FeatureCollection", features: [] };

function memo<T>(cache: Map<string, Promise<T>>, key: string, make: () => Promise<T>) {
  let value = cache.get(key);
  if (!value) {
    value = make();
    // A failed load should be retried next time, not cached.
    value.catch(() => cache.delete(key));
    cache.set(key, value);
  }
  return value;
}

export const hestiaProvider: MapDataProvider = {
  async getCountries() {
    if (!scansVersion) {
      // No scan list yet. The map still works on the baseline alone.
      await this.refresh().catch(() => false);
    }
    countriesCache ??= buildCountries();
    return countriesCache;
  },

  getRegions(country) {
    return memo(regionCache, country.properties.id, async () =>
      scansFor(country.properties.id).length ? scanRegions(country) : fillerChildren(country),
    );
  },

  getVillages(region) {
    const id = region.properties.id;
    return memo(villageCache, id, async () =>
      id.startsWith(SCAN_PREFIX)
        ? scanVillages(id.slice(SCAN_PREFIX.length))
        : { areas: fillerChildren(region), routes: EMPTY_ROUTES, clinics: EMPTY_CLINICS },
    );
  },

  getScans() {
    return scans;
  },

  async refresh() {
    const response = await fetch("/api/scans", { cache: "no-store" });
    if (!response.ok) return false;
    const next = ((await response.json()) as { scans: ScanMeta[] }).scans;
    const version = next.map((s) => s.id).join(",") || "none";
    if (version === scansVersion) return false;
    scans = next;
    scansVersion = version;
    clearCaches();
    return true;
  },

  async scanArea(request: ScanRequest) {
    const response = await fetch("/api/scans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? `scan failed (${response.status})`);
    await this.refresh();
    return body.scan as ScanMeta;
  },
};
