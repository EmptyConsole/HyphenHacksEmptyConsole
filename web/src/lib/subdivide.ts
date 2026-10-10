import { bbox, booleanPointInPolygon, featureCollection, intersect, point, voronoi } from "@turf/turf";
import type { Feature, MultiPolygon, Point, Polygon } from "geojson";

type Area = Feature<Polygon | MultiPolygon>;

/**
 * Split a polygon into roughly `count` Voronoi cells clipped to its outline.
 * Returns the clipped cells plus the seed point that produced each one.
 */
export function subdivide(area: Area, count: number, rand: () => number) {
  const box = bbox(area) as [number, number, number, number];
  const [minX, minY, maxX, maxY] = box;

  const seeds: Feature<Point>[] = [];
  const maxAttempts = count * 60;
  for (let i = 0; i < maxAttempts && seeds.length < count; i++) {
    const p = point([minX + rand() * (maxX - minX), minY + rand() * (maxY - minY)]);
    if (booleanPointInPolygon(p, area)) seeds.push(p);
  }
  if (seeds.length < 2) return [{ cell: area, seed: seeds[0] ?? null }];

  const cells = voronoi(featureCollection(seeds), { bbox: box });
  const result: { cell: Area; seed: Feature<Point> }[] = [];

  cells.features.forEach((cell, i) => {
    if (!cell) return;
    const clipped = intersect(featureCollection<Polygon | MultiPolygon>([cell, area]));
    if (clipped) result.push({ cell: clipped, seed: seeds[i] });
  });

  return result;
}
