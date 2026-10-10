import { hashString, mulberry32, randBetween } from "@/lib/rng";
import { fillerConfig as cfg } from "./fillerConfig";

/**
 * Village and region counts use the same first random draw as fillerProvider,
 * before any polygon clipping. Totals can be slightly high where a border
 * cannot be split into every requested piece.
 */
function childCount(parentId: string, range: readonly [number, number]) {
  const rand = mulberry32(hashString(parentId) ^ cfg.seed);
  return Math.round(randBetween(rand, range));
}

export function villageCount(regionId: string) {
  return childCount(regionId, cfg.villagesPerRegion);
}

export function countryRuralAreas(countryId: string) {
  const regions = childCount(countryId, cfg.regionsPerCountry);
  let villages = 0;
  for (let i = 1; i <= regions; i++) villages += villageCount(`${countryId}/${i}`);
  return { regions, villages };
}
