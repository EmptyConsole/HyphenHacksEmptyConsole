/**
 * Copy for the Algorithm page. Line anchors are unique snippets in
 * detect-villages.js; the page highlights from `start` through `end`.
 */

export type StepId = "picture" | "roofs" | "join" | "check" | "cost" | "trip" | "tour";

export type AlgorithmStep = {
  id: StepId;
  title: string;
  text: string;
  detail: string;
  start: string;
  end: string;
};

export const algorithmContent = {
  eyebrow: "The algorithm",
  title: "Algorithm",
  subtitle:
    "Seven steps, from a satellite picture to one route a team can drive to reach every village. There is no trained model. The rules are color, shape, and the roads already on the map.",
  scanSteps: "Want to watch it run for real? Help us scan a region.",
  scanSource: "This is the file a scan runs. Help us scan a region.",
  steps: [
    {
      id: "picture",
      title: "Get the satellite picture",
      text: "Hestia downloads public satellite photos for a small box of land and stitches them into one image.",
      detail:
        "Each tile is about 1.2 meters per pixel, sharp enough to see a single roof. A scan covers roughly 4 by 4 kilometers.",
      start: "Download one JPEG tile",
      end: "zoom: ZOOM, x0, y0",
    },
    {
      id: "roofs",
      title: "Keep the roofs",
      text: "Trees, water, and shadow are dropped. Roof colors on sharp edges stay.",
      detail:
        "Pale concrete and blue or teal metal count as roofs. Red and flat gray only count on a sharp edge: red soil, dirt roads, and asphalt are the same colors, but they fade gradually where a roof has a crisp outline.",
      start: "Brightness difference between this pixel",
      end: "return { built, roof };",
    },
    {
      id: "join",
      title: "Join roofs into a village",
      text: "Roofs within about 30 meters of each other become one settlement, and the outline is traced.",
      detail:
        "A settlement needs at least one roof that is house-shaped: compact, at least about 3.5 meters wide, and no bigger than about 500 square meters. Thin crop rows, tree edges, and big patches of bare ground fail that test. Stringy outlines that snake along tracks are dropped too, unless OpenStreetMap names the place.",
      start: "Turn scattered building pixels into settlement blobs.",
      end: "return found;",
    },
    {
      id: "check",
      title: "Ask if the map already knows it",
      text: "If an OpenStreetMap place sits inside the outline, or within 150 meters, the match is certain.",
      detail:
        "If the map has no name there, Hestia scores the picture: how many roofs, how compact the shape is, and how much of it looks like roof. That score stops at 99. Only a mapped place can be 100.",
      start: "The closest OSM place that is inside the ring",
      end: "return Math.min(99, Math.round(score));",
    },
    {
      id: "cost",
      title: "Count people and the vaccine cost",
      text: "Each roof stands for five people. Vaccinating them is $10 a person, plus $100 for the stop.",
      detail:
        "If roofs have fused into one blob, area is used instead: one home for every 250 square meters, still five people each. The larger estimate is kept.",
      start: "Five people per roof cluster",
      end: "return population * HEALTHCARE_USD_PER_PERSON + HEALTHCARE_USD_PER_STOP;",
    },
    {
      id: "trip",
      title: "Price the trip from a clinic",
      text: "Hestia tries the three nearest clinics and keeps the cheapest trip, not simply the closest.",
      detail:
        "Paved roads cost less per kilometer. A track costs more. The last stretch with no road costs the most, because that is where a team slows down.",
      start: "Dollars per kilometer.",
      end: "return { perKm, slow };",
    },
    {
      id: "tour",
      title: "Plan one team tour",
      text: "One team leaves the clinic, visits every settlement, and comes back, in the order that costs the least.",
      detail:
        "Hestia starts by always driving to the nearest village left, then improves the order with 2-opt: it reverses any stretch of the loop that makes the whole trip cheaper. Settlements with certainty under 30 are left out, since they are often bare ground.",
      start: "// --- Team tour ---",
      end: "route: { type: \"LineString\", coordinates },",
    },
  ] satisfies AlgorithmStep[],
  source: {
    eyebrow: "The code",
    title: "detect-villages.js",
    lead: "This is the file the scans run. Every comment is in the box. Open a step above to jump to that part, or download it.",
    command: "node detect-villages.js --south 9.02 --west 38.70 --north 9.06 --east 38.74",
  },
};
