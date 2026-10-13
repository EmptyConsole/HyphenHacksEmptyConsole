import type { Feature, FeatureCollection, LineString, MultiPolygon, Point, Polygon } from "geojson";

export type AreaLevel = "country" | "region" | "village";

/**
 * "detected": backed by detect-villages.js scans.
 * "modeled": World Bank baseline or generated filler, no scan behind it.
 */
export type DataSource = "detected" | "modeled";

/**
 * Field names follow the backend contract in the root README.
 * Kept flat (no nested objects) because MapLibre stringifies nested properties.
 */
export interface AreaProperties {
  id: string;
  name: string;
  level: AreaLevel;
  estimated_population: number;
  /** USD */
  estimated_cost: number;
  data_source: DataSource;

  // Detected villages only.
  /** 0–100. 100 means an OSM place confirmed it. */
  certainty?: number;
  /** Which evidence produced `certainty`. */
  detection?: "osm" | "satellite";
  reach_label?: "easy" | "moderate" | "hard";
  /** 0–100 */
  reach_difficulty?: number;
  /** USD to get a team there, part of `estimated_cost`. */
  reach_cost?: number;
  clinic_name?: string | null;

  // Explanation inputs. Present when known; older scans leave some out.
  /** Vaccination part of `estimated_cost`. */
  healthcare_cost?: number;
  /** Buildings counted inside the polygon: footprints, or roof clusters in older color scans. */
  buildings?: number;
  /** Homes those buildings stand for (footprint scans only). */
  homes?: number | null;
  /** "footprints" (Microsoft building outlines) or "pixels" (roof colors). Unset in older scans. */
  building_source?: "footprints" | "pixels";
  area_m2?: number;
  /** 1 for a circle, near 0 for a thin strip. */
  compactness?: number;
  /** Share of the polygon that passed the roof-color test. */
  roof_share?: number;
  /** Whole clinic → village trip, meters. */
  travel_m?: number;
  /** Off-road gap at the village end, meters. */
  offroad_m?: number;
  /** Tracks, unpaved roads and off-road stretches, meters. */
  slow_m?: number;
  /** Position in the scan's team tour (1 = first stop). Unset when skipped or no tour. */
  tour_stop?: number;
  /** Travel cost of this scan's team tour, USD. Null when the scan has no tour. */
  tour_cost?: number | null;
  /** Center of the settlement outline (average of its corners), or of a scan box. */
  lon?: number;
  lat?: number;

  // Countries only.
  /** World Bank rural population, or an area-based estimate when the World Bank has none. */
  baseline_rural?: number;
  baseline_year?: number;
  baseline_source?: "world_bank" | "area_estimate";
  /** USD per person used for `estimated_cost`. */
  cost_per_person?: number;
  cost_per_person_source?: "own_scans" | "all_scans" | "default";
  /** Scans behind `cost_per_person`. */
  cost_scan_count?: number;
}

export type AreaFeature = Feature<Polygon | MultiPolygon, AreaProperties>;
export type AreaCollection = FeatureCollection<Polygon | MultiPolygon, AreaProperties>;

export interface RouteProperties {
  /** The village this route reaches. */
  villageId: string;
  /** "road" follows OSM roads; "offroad" is a straight line priced as off-road. */
  kind: "road" | "offroad";
}

export interface ClinicProperties {
  id: string;
  name: string;
}

export type RouteCollection = FeatureCollection<LineString, RouteProperties>;
export type ClinicCollection = FeatureCollection<Point, ClinicProperties>;

/** One team's round trip from a clinic through every settlement worth visiting. */
export interface TourSummary {
  depotKind: "clinic" | "settlement";
  depotName: string | null;
  /** Settlements visited. */
  stops: number;
  /** Settlements left out for certainty below `minCertainty`. */
  skipped: number;
  minCertainty: number;
  /** Travel cost of the whole loop, USD. */
  costUsd: number;
  roadUsd: number;
  offroadUsd: number;
  roadMeters: number;
  offroadMeters: number;
  /** Cost of the nearest-stop-first order before 2-opt improved it. */
  greedyUsd: number;
  /** Vaccination cost of the visited settlements. */
  vaccinationUsd: number;
  /** Rough cost of a separate clinic round trip to each visited settlement. */
  separateTripsUsd: number;
  /** Set when this is the clinic's joined tour through several scans. */
  joined?: { clinicId: string; scanCount: number };
}

export interface TourLayer {
  summary: TourSummary;
  line: FeatureCollection<LineString>;
}

/** Village polygons plus the clinic routes that reach them. */
export interface VillageLayer {
  areas: AreaCollection;
  routes: RouteCollection;
  clinics: ClinicCollection;
  /** Null for filler areas and for scans made before tours existed. */
  tour: TourLayer | null;
  /**
   * The clinic's joined tour through several scans, when there is one. It loads alongside
   * the scan, and the map draws the settlements first and the joined tour when it arrives.
   */
  joined?: Promise<JoinedTourUpdate | null>;
}

/** What changes when a scan's joined clinic tour arrives. */
export interface JoinedTourUpdate {
  tour: TourLayer;
  /** Settlement id → stop number on the joined tour. */
  stops: Record<string, number>;
  /** The clinic's marker, when it isn't already drawn (it can be far outside the scan). */
  clinic: ClinicCollection["features"][number] | null;
}

/** One saved run of detect-villages.js. Mirrors `<id>.meta.json`. */
export interface ScanMeta {
  id: string;
  /** ISO 3166 numeric, same as the country ids in countries-50m.json. */
  countryId: string;
  countryName: string;
  label: string | null;
  bbox: { south: number; west: number; north: number; east: number };
  createdAt: string;
  origin: "batch" | "live";
  /** Clinic search radius the detector used. Older scans used 13 km. */
  clinicRangeKm?: number;
  /** Set when the scan was re-run in place. */
  updatedAt?: string;
  /** Present once the scan has a team tour. */
  tourVersion?: number;
  /** Travel cost of the team tour, USD. */
  tourCostUsd?: number | null;
  tourStops?: number;
  villages: number;
  population: number;
  costUsd: number;
  osmMatched: number;
  /** Settlements the map draws (at least one roof cluster). Backfilled by listScans for older scans. */
  settlements?: number;
  /** Settlements whose route starts at a clinic. 0 means no clinic was in range. */
  withClinic?: number;
  /** OSM id of the clinic this scan's tour starts from; scans sharing it form one joined tour. */
  tourClinicId?: string | null;
  tourClinicName?: string | null;
}

/** Small part of a joined clinic tour (one tour through every scan that uses the clinic). */
export interface ClinicTourSummary {
  clinicId: string;
  clinicName: string | null;
  lon: number;
  lat: number;
  scans: string[];
  scanCount: number;
  stops: number;
  skipped: number;
  costUsd: number;
  roadUsd: number;
  offroadUsd: number;
  roadMeters: number;
  offroadMeters: number;
  vaccinationUsd: number;
  updatedAt: string;
}

/** A joined clinic tour, as saved in web/data/tours/<clinicId>.json and Supabase. */
export interface ClinicTourRecord {
  clinicId: string;
  summary: ClinicTourSummary;
  tour: {
    /** Visiting order: settlement `index` of scan `scanId`. */
    order: { scanId: string; index: number }[];
    route: { type: "LineString"; coordinates: [number, number][] };
  };
}

/** Totals over every saved scan's meta. */
export interface ScanSummary {
  scans: number;
  countries: number;
  settlements: number;
  osmMatched: number;
  population: number;
  costUsd: number;
}

export interface ScanRequest {
  south: number;
  west: number;
  north: number;
  east: number;
  countryId: string;
  countryName: string;
}

/**
 * Everything the map needs. The map only talks to this interface.
 */
export interface MapDataProvider {
  getCountries(): Promise<AreaCollection>;
  getRegions(country: AreaFeature): Promise<AreaCollection>;
  getVillages(region: AreaFeature): Promise<VillageLayer>;
  /** Saved scans as of the last refresh. */
  getScans(): ScanMeta[];
  /** Re-reads the scan list. Resolves true when it changed and cached levels were dropped. */
  refresh(): Promise<boolean>;
  /** Runs the detector on a box. Resolves when the scan is saved. */
  scanArea(request: ScanRequest): Promise<ScanMeta>;
}
