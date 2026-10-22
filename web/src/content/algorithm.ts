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
    "You draw a box on the map and Hestia turns it into one route a team can drive to get to every likely village inside it. There are seven steps. We get the building outlines from Microsoft's building map, and after that it's honestly just simple rules about shape, distance and whatever roads OpenStreetMap already has.",
  scanSteps: "Want to watch it run for real? Help us scan a region.",
  scanSource: "Every scan runs this file. Help us scan a region!",
  steps: [
    {
      id: "picture",
      title: "Get the buildings",
      text: "First we download the outline of every building in a small box of land from Microsoft's global building map.",
      detail:
        "Microsoft made these outlines by running an AI model on satellite images of the whole world. A scan is about 4 by 4 kilometers and we only keep the buildings whose center is inside the box.",
      start: "// Buildings whose center is inside the box, or null when Microsoft has no data",
      end: "  return buildings;",
    },
    {
      id: "roofs",
      title: "Backup plan: find roofs by color",
      text: "Some places Microsoft doesn't have any data for, so there we look for roofs in the satellite photos ourselves.",
      detail:
        "We throw out trees, water and shadows. Pale concrete and blue metal always count as roof. Red, teal and flat gray only count if there's a sharp edge, since red soil, dirt roads and asphalt are the same colors and their edges fade out slowly.",
      start: "Brightness difference between this pixel",
      end: "return { built, roof };",
    },
    {
      id: "join",
      title: "Group buildings into settlements",
      text: "Buildings within about 50 meters of each other go into the same settlement, and then we draw an outline around the group.",
      detail:
        "We draw every building onto a 3 meter grid, fill in the gaps between the ones that are close and trace around each group. One house by itself still counts as a settlement. If a group is only tiny sheds and granaries we drop it though, because nobody lives in those.",
      start: "// Settlements from footprints: draw every building on a fine grid",
      end: "  return settlements;",
    },
    {
      id: "check",
      title: "Check if it's already on the map",
      text: "If OpenStreetMap has a village, hamlet, town, suburb or lone homestead inside the outline or within 150 meters of it, we call it a sure match. It doesn't need a name.",
      detail:
        "When the map doesn't have anything there, we score the settlement out of 99: 45 points for how many buildings it has (full at 8), 30 for how compact it is and 25 for how much of it is buildings. Only places that are already on the map get 100. The code here is the color backup's version, where full marks for that last part means 35% of the outline looks like roof. With Microsoft's outlines the same weights are used further down the file, and full marks there is 15% of the outline covered by buildings.",
      start: "The closest OSM place that is inside the ring",
      end: "return Math.min(99, Math.round(score));",
    },
    {
      id: "cost",
      title: "Count people and vaccine cost",
      text: "We count each home as 4.7 people because that's the average household size in Nigeria. Vaccines are $10 a person and the visit itself is another $100.",
      detail:
        "Anything under 10 square meters is probably a granary or shed, so we don't count it. A normal house is one home, and a really big building counts as one home for every 150 square meters. With the color backup we can't measure buildings, so we count 5 people per roof or 5 per 250 square meters of settlement, whichever is more, and never fewer than 5.",
      start: "// How many homes a building stands for",
      end: "return Math.max(1, Math.round(areaM2 / HOME_M2));",
    },
    {
      id: "trip",
      title: "Find a clinic and price the trip",
      text: "We keep looking farther out until we find a clinic. Then we price trips from the clinics nearby, always including each settlement's three closest, and keep the cheapest, which isn't always the closest one.",
      detail:
        "The search starts at about 40 kilometers and goes out bit by bit to about 660. If there's still no clinic that far out, the trip is priced as about 660 kilometers with no road and no clinic. Paved roads are the cheapest per kilometer, tracks cost more and anywhere with no road costs the most. If the clinic is really far, we only use main roads for the long part of the drive.",
      start: "// The nearest facilities, searching wider and wider until at least one turns up.",
      end: "return { perKm, slow };",
    },
    {
      id: "tour",
      title: "Plan one trip for the team",
      text: "One team leaves a clinic, stops at every settlement and comes back, in whatever order is cheapest. Every scan whose trip starts at the same clinic is also joined into one trip for that clinic, even if the scans aren't next to each other.",
      detail:
        "The trip starts at the clinic most of the scan's settlements already got routed from. If there's no clinic, it starts at the settlement closest to a road. At first it just keeps going to the cheapest stop that's left. Then we clean up the order with 2-opt, which flips part of the loop if that makes the whole trip cheaper. Each leg takes the roads or goes straight across country, whichever costs less. Whenever a scan gets saved we plan that clinic's trip again with all of its scans. We skip settlements with a certainty under 30 because those are the least likely to really be homes.",
      start: "// --- Team tour ---",
      end: "route: { type: \"LineString\", coordinates },",
    },
  ] satisfies AlgorithmStep[],
  source: {
    eyebrow: "The code",
    title: "detectVillages.mjs",
    lead: "Here's the detector code every scan runs, comments and all (detect-villages.js on the command line just calls it). Open a step above to jump to that part, or download the whole file.",
    command: "node detect-villages.js --south 9.02 --west 38.70 --north 9.06 --east 38.74",
  },
};
