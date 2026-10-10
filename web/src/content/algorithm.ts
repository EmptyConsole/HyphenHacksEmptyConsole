/**
 * Copy for the Algorithm page. Line anchors are unique snippets in
 * detect-villages.js; the page highlights from `start` through `end`.
 */

export type StepId = "picture" | "roofs" | "join" | "check" | "cost" | "trip" | "pick";

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
    "Seven steps, from a satellite picture to the village a team should reach first. There is no trained model. The rules are color, shape, and the roads already on the map.",
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
      text: "Trees, water, and shadow are dropped. Roof colors and hard edges stay.",
      detail:
        "Red tile, pale concrete, and blue metal count as roofs. Flat gray only counts when it has an edge, so a road is not mistaken for a house.",
      start: "Brightness difference between this pixel",
      end: "return { built, roof };",
    },
    {
      id: "join",
      title: "Join roofs into a village",
      text: "Roofs within about 30 meters of each other become one settlement, and the outline is traced.",
      detail:
        "Speckles are wiped away first. Anything smaller than about 500 square meters, like a lone shed, is left out.",
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
      id: "pick",
      title: "Recommend the cheapest place",
      text: "Vaccine cost plus the trip is the predicted cost. The lowest one is the place to reach first.",
      detail:
        "Every settlement keeps its own route, so a map can draw all of them. The recommendation is the polygon where that sum is lowest.",
      start: "Route every village, then keep the polygon whose predicted cost is lowest.",
      end: "clinic: best.clinic,",
    },
  ] satisfies AlgorithmStep[],
  source: {
    eyebrow: "The code",
    title: "detect-villages.js",
    lead: "This is the file the scans run. Every comment is in the box. Open a step above to jump to that part, or download it.",
    command: "node detect-villages.js --south 9.02 --west 38.70 --north 9.06 --east 38.74",
  },
};
