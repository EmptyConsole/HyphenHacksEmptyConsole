/**
 * Copy for the Algorithm page. Line anchors are unique snippets in
 * src/lib/detector/detectVillages.mjs; the page highlights from `start` through `end`.
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
    "Seven steps, from a box on the map to one route a team can drive to reach every village. Buildings come from Microsoft's building map; everything after that is plain rules about shape, distance, and the roads already on OpenStreetMap.",
  scanSteps: "Want to watch it run for real? Help us scan a region.",
  scanSource: "This is the file a scan runs. Help us scan a region.",
  steps: [
    {
      id: "picture",
      title: "Get the buildings",
      text: "Hestia downloads the outline of every building in a small box of land from Microsoft's global building map.",
      detail:
        "Microsoft traced those outlines with an AI model run over satellite imagery of the whole world. A scan covers roughly 4 by 4 kilometers, and only buildings whose center is inside the box are kept.",
      start: "// Buildings whose center is inside the box, or null when Microsoft has no data",
      end: "  return buildings;",
    },
    {
      id: "roofs",
      title: "Fallback: find roofs by color",
      text: "Where Microsoft has no data at all, Hestia looks for roofs in satellite photos instead.",
      detail:
        "Trees, water, and shadow are dropped. Pale concrete and blue or teal metal count as roofs; red and flat gray only count on a sharp edge, since red soil, dirt roads, and asphalt are the same colors but fade gradually.",
      start: "Brightness difference between this pixel",
      end: "return { built, roof };",
    },
    {
      id: "join",
      title: "Join buildings into settlements",
      text: "Buildings within about 50 meters of each other become one settlement, and its outline is traced around them.",
      detail:
        "Every building is drawn on a 3-meter grid, the gaps between close buildings are filled, and each group is traced. A lone homestead still counts. A group made only of tiny sheds and granaries doesn't, because nobody lives there.",
      start: "// Settlements from footprints: draw every building on a fine grid",
      end: "  return settlements;",
    },
    {
      id: "check",
      title: "Ask if the map already knows it",
      text: "If an OpenStreetMap place sits inside the outline, or within 150 meters, the match is certain.",
      detail:
        "If the map has no name there, Hestia scores what it found: how many buildings, how compact the settlement is, and how much of its outline is covered by buildings. That score stops at 99. Only a mapped place can be 100.",
      start: "The closest OSM place that is inside the ring",
      end: "return Math.min(99, Math.round(score));",
    },
    {
      id: "cost",
      title: "Count people and the vaccine cost",
      text: "Each home stands for 4.7 people, Nigeria's average household. Vaccinating them is $10 a person, plus $100 for the visit.",
      detail:
        "Buildings under 10 square meters are granaries or sheds, not homes. A normal house is one home, and a very large building counts as one home per 150 square meters.",
      start: "// How many homes a building stands for",
      end: "return Math.max(1, Math.round(areaM2 / HOME_M2));",
    },
    {
      id: "trip",
      title: "Find a clinic and price the trip",
      text: "Hestia searches wider and wider until it finds a clinic, then keeps the cheapest trip from the three nearest, not simply the closest.",
      detail:
        "The search starts about 40 kilometers out and widens step by step, up to about 660, so every settlement gets a clinic. Paved roads cost less per kilometer, tracks more, and the stretch with no road the most. To reach a far clinic, only main roads are used for the long part.",
      start: "// The nearest facilities, searching wider and wider until at least one turns up.",
      end: "return { perKm, slow };",
    },
    {
      id: "tour",
      title: "Plan one team tour",
      text: "One team leaves the clinic, visits every settlement, and comes back, in the order that costs the least. Nearby scans that share a clinic are joined into that clinic's one tour.",
      detail:
        "Hestia starts by always driving to the nearest village left, then improves the order with 2-opt: it reverses any stretch of the loop that makes the whole trip cheaper. Every time a scan is saved, the tour of its clinic is re-planned through all of that clinic's scans. Settlements with certainty under 30 are left out, since they are the least likely to be homes.",
      start: "// --- Team tour ---",
      end: "route: { type: \"LineString\", coordinates },",
    },
  ] satisfies AlgorithmStep[],
  source: {
    eyebrow: "The code",
    title: "detectVillages.mjs",
    lead: "This is the detector every scan runs (detect-villages.js on the command line is a small wrapper around it). Every comment is in the box. Open a step above to jump to that part, or download it.",
    command: "node detect-villages.js --south 9.02 --west 38.70 --north 9.06 --east 38.74",
  },
};
