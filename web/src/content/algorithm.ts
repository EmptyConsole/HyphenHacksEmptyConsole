/**
 * Line anchors for the Algorithm page. Titles and explanations live in the locale catalogs.
 * Anchors are unique snippets in src/lib/detector/detectVillages.mjs.
 */

export type StepId = "picture" | "roofs" | "join" | "check" | "cost" | "trip" | "tour";

export const algorithmSteps: { id: StepId; start: string; end: string }[] = [
  {
    id: "picture",
    start: "// Buildings whose center is inside the box, or null when Microsoft has no data",
    end: "  return buildings;",
  },
  {
    id: "roofs",
    start: "Brightness difference between this pixel",
    end: "return { built, roof };",
  },
  {
    id: "join",
    start: "// Settlements from footprints: draw every building on a fine grid",
    end: "  return settlements;",
  },
  {
    id: "check",
    start: "The closest OSM place that is inside the ring",
    end: "return Math.min(99, Math.round(score));",
  },
  {
    id: "cost",
    start: "// How many homes a building stands for",
    end: "return Math.max(1, Math.round(areaM2 / HOME_M2));",
  },
  {
    id: "trip",
    start: "// The nearest facilities, searching wider and wider until at least one turns up.",
    end: "return { perKm, slow };",
  },
  {
    id: "tour",
    start: "// --- Team tour ---",
    end: "route: { type: \"LineString\", coordinates },",
  },
];

export const algorithmCommand = "node detect-villages.js --south 9.02 --west 38.70 --north 9.06 --east 38.74";
