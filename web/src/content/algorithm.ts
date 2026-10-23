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
    "Seven steps. One groundbreaking algorithm.",
  scanSteps: "Want to watch it run for real? Help us scan a region.",
  scanSource: "Every scan runs this file. Help us scan a region!",
  steps: [
    {
      id: "picture",
      title: "Get the buildings",
      text: "First we download the outline of every building in a small box of land from Microsoft's global building map.",
      detail:
        "Microsoft's global building map was built on an AI model trained with satellite imaging of the whole world. A scan is about 4 by 4 kilometers and we only keep the buildings whose center is inside the box.",
      start: "// Buildings whose center is inside the box, or null when Microsoft has no data",
      end: "  return buildings;",
    },
    {
      id: "roofs",
      title: "Backup plan: find roofs by color",
      text: "Some places Microsoft doesn't have any data for, so there we look for roofs in the satellite photos ourselves.",
      detail:
        "We exclude trees, water and shadows. Pale concrete and blue metal are always counted as a roof, while red, teal and flat gray only count if there's a sharp edge. Red soil, dirt roads and asphalt are the same colors and their edges fade out slowly, so they are also excluded.",
      start: "Brightness difference between this pixel",
      end: "return { built, roof };",
    },
    {
      id: "join",
      title: "Group buildings into settlements",
      text: "Buildings within about 50 meters of each other go into the same settlement, and then we create a mesh and then a polygon around the group.",
      detail:
        "We draw every building onto a 3 meter grid, fill in the gaps between the ones that are close and trace around each group. One house by itself still counts as a settlement. If a group is only tiny sheds and granaries we drop it though, because nobody lives in those.",
      start: "// Settlements from footprints: draw every building on a fine grid",
      end: "  return settlements;",
    },
    {
      id: "check",
      title: "Check if it's already on the map",
      text: "If OpenStreetMap has a village, hamlet, town, suburb or lone homestead inside the outline or within 150 meters of it, we call it an 100% match, even without a set name.",
      detail:
        "When the map doesn't have anything there, we score the settlement out of 99: 45 points for how many buildings it has (full at 8), 30 for how compact it is and 25 for how much of it is buildings. Only places that are already on the map get 100. The code here is the color backup's version, where full marks for that last part means 35% of the outline looks like roof. With Microsoft's outlines the same weights are used further down the file, and full marks there is 15% of the outline covered by buildings.",
      start: "The closest OSM place that is inside the ring",
      end: "return Math.min(99, Math.round(score));",
    },
    {
      id: "cost",
      title: "Count people and vaccine cost",
      text: "We count population as 4.7 people per home(Nigeria's average), using the average number of people per home in the region. Vaccines are counted as $10 a person and the visit itself is another $100.",
      detail:
        "Anything under 10 square meters is probably a granary or shed, so we don't count it. A normal house is one home, and a really big building counts as one home for every 150 square meters. With the color backup we can't measure buildings, so we count 5 people per roof or 5 per 250 square meters of settlement, whichever is more, and never fewer than 5.",
      start: "// How many homes a building stands for",
      end: "return Math.max(1, Math.round(areaM2 / HOME_M2));",
    },
    {
      id: "trip",
      title: "Find a clinic and price the trip",
      text: "No matter what, we keep scanning nearby areas until we find a clinic. We then price the trips from the nearby clinics, checking the three closest clinics for the cheapest trip, not the closest.",
      detail:
        "The search starts at about 40 kilometers and goes out bit by bit to about 660. If there's still no clinic that far out, the trip is priced as about 660 kilometers with no road and no clinic. Paved roads are generally the cheapest per kilometer, while tracks cost more and anywhere off-road costs the most. If the clinic is really far out, we prioritize using main roads for a majority of the drive.",
      start: "// The nearest facilities, searching wider and wider until at least one turns up.",
      end: "return { perKm, slow };",
    },
    {
      id: "tour",
      title: "Plan one trip for the team",
      text: "One team leaves a clinic, stops at every settlement and comes back, in whatever order is cheapest. Each trip depends on the shared clinic, not just the region, giving us the best possible route for each trip.",
      detail:
        "The trip starts at the most popularly scanned clinic. If there's no clinic, it starts at the settlement closest to a road. At first it just keeps going to the cheapest stop that's left. Then we check the trip by predicting the alternative route, if the loop was flipped, then pick the cheapest solution. Clinic trips are planned off other scans as well as it's own. Low certainty settlements are skipped(<30 certainty).",
      start: "// --- Team tour ---",
      end: "route: { type: \"LineString\", coordinates },",
    },
  ] satisfies AlgorithmStep[],
  source: {
    eyebrow: "The code",
    title: "detectVillages.mjs",
    lead: "Here's the detector code every scan runs (commented) (detect-villages.js on the command line calls it). Open a step above to jump to that part, or download the whole file to use!",
    command: "node detect-villages.js --south 9.02 --west 38.70 --north 9.06 --east 38.74",
  },
};
