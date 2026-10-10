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

/** Village polygons plus the clinic routes that reach them. */
export interface VillageLayer {
  areas: AreaCollection;
  routes: RouteCollection;
  clinics: ClinicCollection;
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
  villages: number;
  population: number;
  costUsd: number;
  osmMatched: number;
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
