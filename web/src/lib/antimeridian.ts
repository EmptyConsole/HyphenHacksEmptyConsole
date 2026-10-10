import type { MultiPolygon, Polygon, Position } from "geojson";

/**
 * Rings that cross the antimeridian (e.g. Russia, Fiji) come split as -180/180 and
 * render as a band around the globe. Shift their western half past 180° instead.
 */
function unwrapRing(ring: Position[]): Position[] {
  const xs = ring.map(([x]) => x);
  if (Math.max(...xs) - Math.min(...xs) <= 180) return ring;
  return ring.map(([x, y]) => [x < 0 ? x + 360 : x, y]);
}

export function unwrapAntimeridian<G extends Polygon | MultiPolygon>(geometry: G): G {
  if (geometry.type === "Polygon") {
    return { ...geometry, coordinates: geometry.coordinates.map(unwrapRing) };
  }
  return { ...geometry, coordinates: (geometry as MultiPolygon).coordinates.map((p) => p.map(unwrapRing)) };
}
