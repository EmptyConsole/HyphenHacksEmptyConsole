import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { MultiPolygon, Polygon } from "geojson";
import { unwrapAntimeridian } from "@/lib/antimeridian";
import { hashString, mulberry32, randBetween } from "@/lib/rng";
import { subdivide } from "@/lib/subdivide";
import { fillerConfig as cfg } from "./fillerConfig";
import type { AreaCollection, AreaFeature } from "./types";

/**
 * Placeholder data: real country borders (Natural Earth via world-atlas),
 * fake numbers, and generated sub-polygons. Children's numbers sum to their parent.
 * hestiaProvider rescales the country numbers to the World Bank baseline and
 * uses these helpers wherever no scan exists.
 */

const rngFor = (id: string) => mulberry32(hashString(id) ^ cfg.seed);

function splitTotal(total: number, weights: number[]) {
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (total * w) / sum);
}

function children(parent: AreaFeature, level: "region" | "village", range: readonly [number, number], nameTpl: string) {
  const rand = rngFor(parent.properties.id);
  const count = Math.round(randBetween(rand, range));
  const cells = subdivide(parent, count, rand);

  // Skewed weights so some cells clearly stand out on the map.
  const popWeights = cells.map(() => rand() ** 2 + 0.05);
  const costWeights = popWeights.map((w) => w * randBetween(rand, [0.6, 1.6]));
  const populations = splitTotal(parent.properties.estimated_population, popWeights);
  const costs = splitTotal(parent.properties.estimated_cost, costWeights);

  const features: AreaFeature[] = cells.map(({ cell }, i) => ({
    type: "Feature",
    geometry: cell.geometry,
    properties: {
      id: `${parent.properties.id}/${i + 1}`,
      name: nameTpl.replace("{n}", String(i + 1)),
      level,
      estimated_population: Math.round(populations[i]),
      estimated_cost: Math.round(costs[i]),
      data_source: "modeled",
    },
  }));
  return { type: "FeatureCollection", features } as AreaCollection;
}

/** Generated sub-areas whose numbers sum to the parent's. Deterministic per parent id. */
export function fillerChildren(parent: AreaFeature): AreaCollection {
  return parent.properties.level === "country"
    ? children(parent, "region", cfg.regionsPerCountry, cfg.regionName)
    : children(parent, "village", cfg.villagesPerRegion, cfg.villageName);
}

let countriesCache: Promise<AreaCollection> | null = null;

/** Country borders with random placeholder numbers. Antarctica is left out. */
export function fillerCountries(): Promise<AreaCollection> {
  countriesCache ??= fetch("/data/countries-50m.json")
    .then((r) => r.json() as Promise<Topology>)
    .then((topo) => {
      const fc = feature(topo, topo.objects.countries as GeometryCollection<{ name: string }>);
      const features = fc.features
        .filter((f) => f.properties.name !== "Antarctica")
        .map((f): AreaFeature => {
          const id = String(f.id ?? f.properties.name);
          const rand = rngFor(id);
          // Extra rand() factor skews toward smaller countries so the map has contrast.
          const [minPop, maxPop] = cfg.country.populationRange;
          const population = minPop + (maxPop - minPop) * rand() * rand();
          const cost = population * randBetween(rand, cfg.country.costPerPersonRange);
          return {
            type: "Feature",
            geometry: unwrapAntimeridian(f.geometry as Polygon | MultiPolygon),
            properties: {
              id,
              name: f.properties.name,
              level: "country",
              estimated_population: Math.round(population),
              estimated_cost: Math.round(cost),
              data_source: "modeled",
            },
          };
        });
      return { type: "FeatureCollection", features } as AreaCollection;
    });
  return countriesCache;
}
