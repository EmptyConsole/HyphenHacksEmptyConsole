import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

export type AreaLevel = "country" | "region" | "village";

/** Field names follow the backend contract in the root README. */
export interface AreaProperties {
  id: string;
  name: string;
  level: AreaLevel;
  estimated_population: number;
  /** USD */
  estimated_cost: number;
}

export type AreaFeature = Feature<Polygon | MultiPolygon, AreaProperties>;
export type AreaCollection = FeatureCollection<Polygon | MultiPolygon, AreaProperties>;

/**
 * Everything the map needs. Swap the filler implementation for one that
 * calls the backend (see src/data/index.ts) — the map won't need to change.
 */
export interface MapDataProvider {
  getCountries(): Promise<AreaCollection>;
  getRegions(country: AreaFeature): Promise<AreaCollection>;
  getVillages(region: AreaFeature): Promise<AreaCollection>;
}
