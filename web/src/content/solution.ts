/**
 * Copy, chart data and sources for the Solution page. Edit the strings here.
 * Every outside number must point at an entry in `sources`. Numbers about our own
 * scans are recomputed from web/data/scans on each load and cite "hestia".
 * Detector constants mirror src/lib/detector/detectVillages.mjs; keep them in sync when tuning it.
 */

export type SourceId = "hestia" | "nature" | "microsoft" | "esri" | "osm";

export const sources: {
  id: SourceId;
  label: string;
  detail: string;
  href: string;
}[] = [
  {
    id: "hestia",
    label: "Hestia: saved detector scans (this project)",
    detail:
      "Runs of detect-villages.js saved in web/data/scans. The scan numbers on this page are recomputed from them on every load.",
    href: "/#map",
  },
  {
    id: "nature",
    label:
      "Láng-Ritter, Keskinen & Tenkanen (2025): Global gridded population datasets systematically underrepresent rural population",
    detail: "Nature Communications 16, March 2025.",
    href: "https://www.nature.com/articles/s41467-025-56906-7",
  },
  {
    id: "microsoft",
    label: "Microsoft: Global ML Building Footprints",
    detail:
      "Building outlines traced from satellite imagery by a machine learning model. Open Database License.",
    href: "https://github.com/microsoft/GlobalMLBuildingFootprints",
  },
  {
    id: "esri",
    label: "Esri: World Imagery",
    detail:
      "One meter or better satellite and aerial imagery for most of the world's landmass. Esri, Vantor, Earthstar Geographics and the GIS User Community.",
    href: "https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9",
  },
  {
    id: "osm",
    label: "OpenStreetMap contributors: places, health facilities and roads",
    detail:
      "Queried through the Overpass API. Data © OpenStreetMap contributors, available under the Open Database License.",
    href: "https://www.openstreetmap.org/copyright",
  },
];

type Paragraph = { text: string; cite?: SourceId[] };

export const solutionContent = {
  eyebrow: "The solution",
  title: "Solution",
  subtitle: "Finds settlements, a route, and cost.",

  find: {
    eyebrow: "01 · Find",
    title: "Satellites find the roofs maps forgot",
    body: [
      {
        //In a 2025 study of 307 rural areas, even the best global population map missed
        // about half of the people, but their roofs still show up in satellite photos.
        text: "A study in 2025 missed half the population in the rural areas they scanned, but their roofs can be found in satellite photos",
        cite: ["nature"],
      },
      {
        //Microsoft traces building outlines from satellite photos with a machine learning
        // model and shares them under the Open Database License.
        // Hestia loads the ones inside each 4 x 4 km scan box.
        // Buildings less than 50 m apart join into one settlement.
        // A building under 10 m² counts as zero homes,
        // and one over 150 m² counts as one home for every 150 m².
        text: "Hestia uses Microsoft building outline data as a first pass over an area. Learn more about how they are grouped in the Algorithm page.",
        cite: ["microsoft"],
      },
      {
        //Where Microsoft has no data, Hestia downloads pictures from Esri World Imagery Wayback
        // tiles at zoom 17, about 1.2 m per pixel. A house there is 4 to 6 pixels wide.
        // Hestia keeps pixels with roof colors, joins roofs within about 30 m of each other
        // and drops blobs under about 500 m². There it counts 5 people per roof, or 5 per 250 m²
        // of settlement if that is more.
        text: "Commonly, Microsoft won't have data for a majority of the rural areas, so Hestia downloads images from the Esire World Imagery Wayback, which we run our custom algorithm over.",
        cite: ["esri"],
      },
    ] satisfies Paragraph[],
    stepsCaption: "From satellite to settlement",
    steps: [
      {
        title: "Find the roofs",
        text: "Microsoft outlines by default, but resorts to satellite without it.",
      },
      {
        title: "Separate from surroundings",
        text: "Each building is drawn on a grid to remove everything but the homes.",
      },
      {
        title: "Join neighbors",
        text: "Nearby buildings are combined into a settlement.",
      },
      {
        title: "Trace the outline",
        text: "To display, we outline them to make them easy to see.",
      },
    ],
    facts: [
      {
        value: "50 m",
        label: "largest gap between buildings in one settlement",
      },
      { value: "16 km²", label: "per scan, about 4 x 4 km" },
      { value: "4.7", label: "people per home (average household in Nigeria)" },
    ],
    scan: "Want to see what a scan finds? Help us scan a region.",
  },

  check: {
    eyebrow: "02 · Check",
    title: "Most of Hestia's settlements have't been mapped",
    body: [
      {
        //Hestia checks each outline against OpenStreetMap. A village, hamlet, town, suburb or
        // lone homestead nearby confirms the settlement with a certainty of 100.
        text: "To be sure, Hestia compares it's results with OpenStreetMap to check for neighboring homes, outputting a certainty of 100.",
        cite: ["osm"],
      },
      {
        //Without a match, the certainty is built from three parts and tops out at 99.
        // Building count is worth 45 points, compactness 30 and building cover 25.
        // With the color backup, building cover means the share of the outline that looks like roof.
        text: "If OpenStreetMap doesn't return anything nearby we limit our certainty to 99 and use three signs of a settlement to build that value. Building count, compactness, and building cover (the amount of outline that looks like roof).",
      },
    ] satisfies Paragraph[],
    matchCaption:
      //Settlements in our saved scans, split by whether OpenStreetMap has a place there
      "The split of our scans by whether OpenStreetMap returns a nearby home.",
    scoreCaption:
      "Scoring a settlement OpenStreetMap doesn't know about (0-99)",
    score: [
      { label: "Buildings", points: 45, detail: "full points at 8 buildings" },
      {
        label: "Compact shape",
        points: 30,
        detail: "full points at 0.45 (a circle is 1)",
      },
      {
        label: "Area covered by buildings",
        points: 25,
        detail:
          "full points at 15% of the outline (35% roof pixels with the color backup)",
      },
    ],
  },

  reach: {
    eyebrow: "03 · Reach",
    title: "Finding the cheapest route from a clinic",
    body: [
      {
        text: "Hestia looks for hospitals, clinics, doctors and health posts in OpenStreetMap. It starts looking about 40 km past the scan. If it finds nothing, it looks farther, up to about 660 km. If there is still nothing, the trip is priced as 660 km with no road and no clinic. Then it builds a map of all the roads and tracks a car can use.",
        cite: ["osm"],
      },
      {
        text: "Hestia works out the cost of a trip from the clinics nearby, always including the three closest to each settlement, and keeps the cheapest one. Dirt and gravel roads cost more per kilometer. Places with no road cost the most, $8 per kilometer, because the team moves slowly there.",
      },
      {
        text: "Each trip also gets a difficulty score from 0 to 100. Half of the score is how far the settlement is from a road. The other half is how long the trip is and how much of it is on rough ground.",
      },
    ] satisfies Paragraph[],
    routeCaption:
      "Hestia tries the three nearest clinics and keeps the cheapest trip",
    rateCaption: "Travel cost per kilometer, by OpenStreetMap road type (US$)",
    rates: [
      { label: "Motorway", value: 1.2 },
      { label: "Primary", value: 1.4 },
      { label: "Secondary", value: 1.6 },
      { label: "Tertiary", value: 1.8 },
      { label: "Unclassified", value: 2.2 },
      { label: "Track", value: 4.5 },
      { label: "No road", value: 8, offroad: true },
    ],
    rateMax: 8,
    rateNote:
      "Roads that are usually paved cost 1.5 times more if OpenStreetMap says they are dirt, gravel or sand. We chose these rates for planning. They have not been measured in the field yet.",
    scan: "A route needs a real village. Help us scan a region.",
  },

  tour: {
    eyebrow: "04 · Tour",
    title: "One trip to reach all of them",
    body: [
      {
        text: "Sending a team to each settlement one at a time would mean driving the same roads many times. So Hestia plans one round trip for each scan area. One team leaves the clinic that most of the settlements route from, visits every settlement and comes back. If no clinic was found, the trip starts at the settlement closest to a road.",
      },
      {
        text: "Scan areas whose trips start at the same clinic are then joined into one trip from that clinic, even if they are far apart. That trip is planned again every time a new scan is saved.",
      },
      {
        text: "First, Hestia always goes to the stop that is cheapest to reach next. This route often crosses itself. Then a method called 2-opt fixes it by turning around any part of the loop that is cheaper the other way. Each leg uses roads if that is cheaper, or goes straight across the land if not.",
      },
      {
        text: "Settlements with a certainty under 30 are left out, because they are often just bare ground.",
      },
    ] satisfies Paragraph[],
    diagramCaption: "One team, one loop out of the clinic and back",
    diagramNote:
      "This is only a drawing. The real loops are on the map. The faint loop goes to the cheapest next village each time and crosses itself. The bright loop visits the same villages after 2-opt.",
    facts: [
      {
        value: "1",
        label: "team and one round trip per clinic, across all its scan areas",
      },
      { value: "30+", label: "certainty before a settlement becomes a stop" },
    ],
    scan: "One team, one loop. Help us scan a region.",
  },
};
