import { area as turfArea } from "@turf/turf";
import type { Polygon } from "geojson";
import { baselineConfig as cfg } from "./baselineConfig";
import { fillerCountries } from "./fillerProvider";
import ruralPopulation from "./ruralPopulation.json";
import type {
  AreaCollection,
  AreaFeature,
  ClinicCollection,
  MapDataProvider,
  RouteCollection,
  ScanMeta,
  ClinicTourRecord,
  JoinedTourUpdate,
  ScanRequest,
  TourLayer,
  VillageLayer,
} from "./types";

/**
 * Real data where detect-villages.js has run, modeled data everywhere else.
 *
 * - Country totals: World Bank rural population × no-coverage share × cost per person,
 *   for every country (see baselineConfig).
 * - A country with scans: its regions are the scan boxes, and their villages are the
 *   detected polygons with routes and clinics.
 * - A country without scans: no regions, just its own outline and total.
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
    // Saved by newer detector runs only.
    buildings?: number;
    homes?: number | null;
    buildingSource?: "footprints" | "pixels";
    areaM2?: number;
    compactness?: number;
    roofShare?: number;
    travelMeters?: number;
    offroadMeters?: number;
    slowMeters?: number;
    tourStop?: number;
    route?: { type: "LineString"; coordinates: [number, number][] };
    clinic?: { name: string | null; lon: number; lat: number; osmId: number } | null;
  };
}

/** The `tour` object detect-villages.js writes next to the features. */
interface DetectedTour {
  depot: { kind: "clinic" | "settlement"; name: string | null; osmId?: number };
  minCertainty: number;
  stops: number;
  skipped: number;
  order: number[];
  costUsd: number;
  roadUsd: number;
  offroadUsd: number;
  roadMeters: number;
  offroadMeters: number;
  greedyUsd: number;
  route: { type: "LineString"; coordinates: [number, number][] };
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
  const observedGlobal = observedCostPerPerson(scans);
  const globalCost = observedGlobal ?? cfg.defaultCostPerPerson;
  const globalCostSource = observedGlobal !== null ? "all_scans" : "default";
  const features = base.features.map((f): AreaFeature => {
    const id = f.properties.id;
    const own = scansFor(id);
    const wb = rural[id];
    const ruralPeople = Math.round(wb?.rural ?? (turfArea(f) / 1e6) * cfg.fallbackRuralPerKm2);
    const population = Math.round(ruralPeople * cfg.noCoverageShare);
    const ownCost = observedCostPerPerson(own);
    const perPerson = ownCost ?? globalCost;
    return {
      ...f,
      properties: {
        ...f.properties,
        estimated_population: population,
        estimated_cost: Math.round(population * perPerson),
        data_source: own.length ? "detected" : "modeled",
        baseline_rural: ruralPeople,
        baseline_year: wb?.year,
        baseline_source: wb ? "world_bank" : "area_estimate",
        cost_per_person: perPerson,
        cost_per_person_source: ownCost !== null ? "own_scans" : globalCostSource,
        cost_scan_count: ownCost !== null ? own.length : globalCostSource === "all_scans" ? scans.length : 0,
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
        tour_cost: s.withClinic === 0 ? null : (s.tourCostUsd ?? null),
        // Center of the scan box.
        lat: (s.bbox.south + s.bbox.north) / 2,
        lon: (s.bbox.west + s.bbox.east) / 2,
      },
    })),
  };
}

async function scanVillages(scanId: string): Promise<VillageLayer> {
  // The scan list already says which clinic this scan's tour starts from, so its joined tour
  // can load at the same time as the scan. Older scans don't record it and have no joined tour.
  const meta = scans.find((m) => m.id === scanId);
  const joinedRecord = meta?.tourClinicId ? joinedTour(meta.tourClinicId) : null;
  joinedRecord?.catch(() => null);
  const response = await fetch(`/api/scans/${encodeURIComponent(scanId)}`);
  if (!response.ok) throw new Error(`scan ${scanId}: ${response.status}`);
  const detected = (await response.json()) as { features: DetectedVillage[]; tour?: DetectedTour | null };

  const areas: AreaCollection = { type: "FeatureCollection", features: [] };
  const routes: RouteCollection = { type: "FeatureCollection", features: [] };
  const clinics: ClinicCollection = { type: "FeatureCollection", features: [] };
  const clinicIds = new Set<string>();
  // Same rule as the yellow map dot: with no clinic in range there is no team to send.
  const tour = detected.features.some((v) => v.properties.buildings !== 0 && v.properties.clinic)
    ? (detected.tour ?? null)
    : null;
  let unnamed = 0;

  detected.features.forEach((v, i) => {
    const p = v.properties;
    // A blob with no roof cluster is not a settlement. Newer scans drop these already.
    if (p.buildings === 0) return;
    const id = `${scanId}/${i + 1}`;
    const [lon, lat] = ringCenter(v.geometry.coordinates[0]);
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
        healthcare_cost: p.healthcareUsd,
        buildings: p.buildings,
        homes: p.homes,
        building_source: p.buildingSource,
        // Older scans did not save the area; the polygon gives it back.
        area_m2: p.areaM2 ?? Math.round(turfArea(v)),
        compactness: p.compactness,
        roof_share: p.roofShare,
        travel_m: p.travelMeters,
        offroad_m: p.offroadMeters,
        slow_m: p.slowMeters,
        tour_stop: tour ? p.tourStop : undefined,
        lon,
        lat,
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
  // A scan whose clinic serves other scans too shows that clinic's joined tour instead.
  // It arrives separately, so the settlements can be drawn without waiting for it.
  const clinicId = meta?.tourClinicId ?? null;
  const joined =
    tour && clinicId && joinedRecord
      ? joinedRecord
          .then((record): JoinedTourUpdate | null => {
            if (!record || record.summary.scanCount <= 1) return null;
            const position = new Map(record.tour.order.map((stop, i) => [`${stop.scanId}/${stop.index + 1}`, i + 1]));
            const stops: Record<string, number> = {};
            for (const area of areas.features) {
              const n = position.get(area.properties.id);
              if (n !== undefined) stops[area.properties.id] = n;
            }
            return {
              tour: joinedTourLayer(record, tour.minCertainty ?? 30),
              stops,
              // The clinic can be far outside this scan: make sure its marker is drawn.
              clinic: clinicIds.has(clinicId)
                ? null
                : {
                    type: "Feature",
                    geometry: { type: "Point", coordinates: [record.summary.lon, record.summary.lat] },
                    properties: { id: clinicId, name: record.summary.clinicName ?? "Unnamed clinic" },
                  },
            };
          })
          .catch(() => null)
      : undefined;
  return { areas, routes, clinics, tour: tour ? tourLayer(tour, detected.features) : null, joined };
}

/** A clinic's joined tour (null when it has none). */
async function joinedTour(clinicId: string): Promise<ClinicTourRecord | null> {
  const response = await fetch(`/api/tours/${encodeURIComponent(clinicId)}`);
  return response.ok ? ((await response.json()) as ClinicTourRecord) : null;
}

export function joinedTourLayer(record: ClinicTourRecord, minCertainty: number): TourLayer {
  const s = record.summary;
  return {
    summary: {
      depotKind: "clinic",
      depotName: s.clinicName,
      stops: s.stops,
      skipped: s.skipped,
      minCertainty,
      costUsd: s.costUsd,
      roadUsd: s.roadUsd,
      offroadUsd: s.offroadUsd,
      roadMeters: s.roadMeters,
      offroadMeters: s.offroadMeters,
      greedyUsd: s.costUsd,
      vaccinationUsd: s.vaccinationUsd,
      separateTripsUsd: 0,
      joined: { clinicId: s.clinicId, scanCount: s.scanCount },
    },
    line: { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: record.tour.route }] },
  };
}

/** Average of the ring's corners, the same point detect-villages.js routes to. */
function ringCenter(ring: number[][]): [number, number] {
  const closed = ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1];
  const count = closed ? ring.length - 1 : ring.length;
  let lon = 0;
  let lat = 0;
  for (let i = 0; i < count; i++) {
    lon += ring[i][0];
    lat += ring[i][1];
  }
  return [lon / count, lat / count];
}

function tourLayer(t: DetectedTour, villages: DetectedVillage[]): TourLayer {
  const visited = t.order.map((i) => villages[i].properties);
  return {
    summary: {
      depotKind: t.depot.kind,
      depotName: t.depot.name,
      stops: t.stops,
      skipped: t.skipped,
      minCertainty: t.minCertainty,
      costUsd: t.costUsd,
      roadUsd: t.roadUsd,
      offroadUsd: t.offroadUsd,
      roadMeters: t.roadMeters,
      offroadMeters: t.offroadMeters,
      greedyUsd: t.greedyUsd,
      vaccinationUsd: visited.reduce((sum, v) => sum + v.healthcareUsd, 0),
      // reachUsd is one way from the clinic, so a round trip is about twice that.
      separateTripsUsd: visited.reduce((sum, v) => sum + 2 * (v.reachUsd ?? 0), 0),
    },
    line: {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: t.route }],
    },
  };
}

const EMPTY_AREAS: AreaCollection = { type: "FeatureCollection", features: [] };
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

/** Loads the scan list once. The map still works on the baseline alone if it fails. */
async function ensureScans() {
  if (!scansVersion) await hestiaProvider.refresh().catch(() => false);
}

export const hestiaProvider: MapDataProvider = {
  async getCountries() {
    await ensureScans();
    countriesCache ??= buildCountries();
    return countriesCache;
  },

  async getRegions(country) {
    await ensureScans();
    return memo(regionCache, country.properties.id, async () =>
      scansFor(country.properties.id).length ? scanRegions(country) : EMPTY_AREAS,
    );
  },

  async getVillages(region) {
    await ensureScans();
    const id = region.properties.id;
    return memo(villageCache, id, async () =>
      id.startsWith(SCAN_PREFIX)
        ? scanVillages(id.slice(SCAN_PREFIX.length))
        : { areas: EMPTY_AREAS, routes: EMPTY_ROUTES, clinics: EMPTY_CLINICS, tour: null },
    );
  },

  getScans() {
    return scans;
  },

  async refresh() {
    const response = await fetch("/api/scans", { cache: "no-store" });
    if (!response.ok) return false;
    const next = ((await response.json()) as { scans: ScanMeta[] }).scans;
    // Re-run scans keep their id, so include the update time to notice them too.
    const version = next.map((s) => `${s.id}@${s.updatedAt ?? ""}`).join(",") || "none";
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
