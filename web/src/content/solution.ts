/**
 * Copy, chart data and sources for the Solution page. Edit the strings here.
 * Every outside number must point at an entry in `sources`. Numbers about our own
 * scans are recomputed from web/data/scans on each load and cite "hestia".
 * Detector constants mirror detect-villages.js; keep them in sync when tuning it.
 */

import type { ScanSummary } from "@/data/types";

export type SourceId =
  | "hestia"
  | "unicef"
  | "nature"
  | "esri"
  | "osm"
  | "menzies"
  | "worldBank"
  | "ilo";

export const sources: { id: SourceId; label: string; detail: string; href: string }[] = [
  {
    id: "hestia",
    label: "Hestia: saved detector scans (this project)",
    detail:
      "Runs of detect-villages.js saved in web/data/scans. The scan numbers on this page are recomputed from them on every load.",
    href: "/#map",
  },
  {
    id: "unicef",
    label: "UNICEF (August 2024): Costs of Fully Vaccinating a Child: Countries Eligible for Gavi Vaccine Prices",
    detail: "Table 4: US$73.15 per fully vaccinated child under 24 months, of which US$42.03 is delivery.",
    href: "https://www.unicef.org/media/161751/file/Standard%20costs%20of%20fully%20vaccinating%20a%20child_UNICEF_2024",
  },
  {
    id: "nature",
    label:
      "Láng-Ritter, Keskinen & Tenkanen (2025): Global gridded population datasets systematically underrepresent rural population",
    detail: "Nature Communications 16, March 2025.",
    href: "https://www.nature.com/articles/s41467-025-56906-7",
  },
  {
    id: "esri",
    label: "Esri: World Imagery",
    detail: "One meter or better satellite and aerial imagery for most of the world's landmass. Esri, Vantor, Earthstar Geographics and the GIS User Community.",
    href: "https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9",
  },
  {
    id: "osm",
    label: "OpenStreetMap contributors: places, health facilities and roads",
    detail: "Queried through the Overpass API. Data © OpenStreetMap contributors, available under the Open Database License.",
    href: "https://www.openstreetmap.org/copyright",
  },
  {
    id: "menzies",
    label:
      "Menzies et al. (2017): The cost determinants of routine infant immunization services: a meta-regression analysis of six country studies",
    detail: "BMC Medicine 15, 178. Sites in Benin, Ghana, Honduras, Moldova, Uganda and Zambia.",
    href: "https://link.springer.com/article/10.1186/s12916-017-0942-1",
  },
  {
    id: "worldBank",
    label: "World Bank: Rural population (World Development Indicators)",
    detail: "Indicator SP.RUR.TOTL, the starting point for every country on the map.",
    href: "https://data.worldbank.org/indicator/SP.RUR.TOTL",
  },
  {
    id: "ilo",
    label:
      "International Labour Organization (2015): Global evidence on inequities in rural health protection",
    detail: "56% of rural people worldwide have no health coverage. Ed. X. Scheil-Adlung, ESS Document No. 47.",
    href: "https://www.ilo.org/sites/default/files/wcmsp5/groups/public/@ed_protect/@soc_sec/documents/publication/wcms_383890.pdf",
  },
];

type Paragraph = { text: string; cite?: SourceId[] };

export const solutionContent = {
  eyebrow: "The solution",
  title: "Solution",
  subtitle:
    "Hestia finds settlements in satellite images, checks which ones the map already knows, and prices a route from the nearest clinic so health teams can plan to reach them.",

  /** `s` is null while the live scan totals are still loading. */
  stats: (s: ScanSummary | null, fmt: { count: (n: number) => string; people: (n: number) => string }) =>
    [
      {
        value: s ? fmt.count(s.settlements) : "–",
        label: "settlements traced from satellite images so far.",
        note: s ? `${s.scans} scan areas of about 4 × 4 km in ${s.countries} countries.` : undefined,
        source: "hestia",
      },
      {
        value: s?.settlements ? `${Math.round((1 - s.osmMatched / s.settlements) * 100)}%` : "–",
        label: "of them have no OpenStreetMap place name within 150 m.",
        note: s ? `Only ${fmt.count(s.osmMatched)} matched a mapped village, hamlet or town.` : undefined,
        source: "hestia",
      },
      {
        value: s ? fmt.people(s.population) : "–",
        label: "people estimated to live in them.",
        note: "Five people per roof, or per 250 m² where roofs merge.",
        source: "hestia",
      },
      {
        value: "57%",
        label: "of the cost of vaccinating a child is getting the vaccine there, not the vaccine itself.",
        note: "$42.03 of $73.15 per fully vaccinated child under 2.",
        source: "unicef",
      },
    ] satisfies { value: string; label: string; note?: string; source: SourceId }[],

  find: {
    eyebrow: "01 · Find",
    title: "Satellites see the roofs that maps leave out.",
    body: [
      {
        text: "Population maps miss rural people largely because the records they're built from miss them. From above, a village is still a cluster of roofs, whether or not anyone has written its name down.",
        cite: ["nature"],
      },
      {
        text: "Hestia downloads satellite imagery at about 1.2 m per pixel, keeps the pixels that look like roofs, joins roofs that sit close together and traces the edge of each cluster. There's no trained model, just color and shape rules, so it works anywhere without labeled data.",
        cite: ["esri"],
      },
    ] satisfies Paragraph[],
    stepsCaption: "From satellite pixels to a settlement outline",
    steps: [
      { title: "Satellite image", text: "Esri World Imagery tiles, stitched into one picture." },
      { title: "Keep roofs", text: "Drop green, water and shadow. Keep roof colors and hard edges." },
      { title: "Join neighbors", text: "Roofs less than about 30 m apart merge into one settlement." },
      { title: "Trace the outline", text: "Drop anything under about 500 m², like a lone shed." },
    ],
    facts: [
      { value: "1.2 m", label: "per pixel, sharp enough to see a single roof" },
      { value: "16 km²", label: "per scan, a box about 4 × 4 km" },
      { value: "0", label: "trained models: only color and shape rules" },
    ],
    scan: "Want to see what a scan finds? Help us scan a region.",
  },

  check: {
    eyebrow: "02 · Check",
    title: "Most of what we find has no name on the map.",
    body: [
      {
        text: "Every outline is compared with OpenStreetMap's villages, hamlets and towns. If one sits inside the outline or within 150 m of it, the settlement is confirmed and gets a certainty of 100.",
        cite: ["osm"],
      },
      {
        text: "If none does, it may be a place no map records. Its certainty then comes from the picture alone (how many roofs, how compact, how roof-colored) and never reaches 100.",
      },
    ] satisfies Paragraph[],
    matchCaption: "Settlements found in saved scans, by whether OpenStreetMap has a place there",
    scoreCaption: "How a settlement with no OpenStreetMap match is scored (0–99)",
    score: [
      { label: "Roof clusters", points: 45, detail: "full at 8 roofs" },
      { label: "Compact shape", points: 30, detail: "full at 0.45 (a circle is 1)" },
      { label: "Roof-colored area", points: 25, detail: "full at 35% of the outline" },
    ],
    caveat:
      "Color rules can mistake rocks, bare fields or farm sheds for roofs. A certainty under 100 is a lead for a health team to check, not a confirmed village.",
    scan: "Most of these places have no name yet. Help us scan a region.",
  },

  reach: {
    eyebrow: "03 · Reach",
    title: "A route from the clinic, priced by the road.",
    body: [
      {
        text: "For each settlement, Hestia finds the three nearest hospitals, clinics, doctors and health posts in OpenStreetMap, up to about 40 km away, and builds a network from its drivable roads and tracks.",
        cite: ["osm"],
      },
      {
        text: "It finds the cheapest trip from each of those clinics and keeps the winner. Rough roads cost more per kilometer, and the last stretch with no road costs the most, because that's where a team slows down.",
      },
      {
        text: "Every trip also gets a difficulty score from 0 to 100: half from how far the settlement is from a road, the rest from trip length and how much of it is rough going.",
      },
    ] satisfies Paragraph[],
    routeCaption: "Hestia tries the three nearest clinics and keeps the cheapest trip",
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
      "Paved road types tagged as dirt, gravel or sand cost 1.5× more. These rates are Hestia's planning assumptions, not measured prices.",
    scan: "A route needs a real village. Help us scan a region.",
  },

  tour: {
    eyebrow: "04 · Tour",
    title: "One trip that reaches them all.",
    body: [
      {
        text: "A separate trip to every settlement repeats the same drive again and again. So for each scan area, Hestia plans one round trip: a single team leaves the clinic, visits every settlement, and comes back.",
      },
      {
        text: "It starts by always driving to the nearest village left, then keeps improving the order: any stretch of the loop that would be cheaper reversed gets reversed (a method called 2-opt). Each leg uses roads where that's cheaper, or goes straight across country where it isn't.",
      },
      {
        text: "Settlements with a certainty under 30 are left out of the tour, because they are more often bare ground than homes.",
      },
    ] satisfies Paragraph[],
    diagramCaption: "One team, one loop: clinic → every village → clinic",
    diagramNote: "Illustration. The faint loop visits the nearest village each time and crosses itself; the bright one is the same villages after 2-opt. Real tours are drawn on the map.",
    facts: [
      { value: "1", label: "team and one round trip per scan area" },
      { value: "30+", label: "certainty needed for a settlement to be a stop" },
      { value: "⅓", label: "less travel, at best, than nearest-stop-first in our scans" },
    ],
    scan: "One team, one loop. Help us scan a region.",
  },

  price: {
    eyebrow: "05 · Price",
    title: "Getting there is most of the bill.",
    body: [
      {
        text: "UNICEF puts the cost of fully vaccinating a child under 2 at about $73, and more than half of that is delivery: staff, travel, vehicles, fuel and cold storage.",
        cite: ["unicef"],
      },
      {
        text: "Remote places cost more to serve. A study of immunization sites in six countries found that outreach and longer trips to collect vaccines both raised the cost per dose.",
        cite: ["menzies"],
      },
      {
        text: "So Hestia prices each settlement as vaccines for everyone there plus the trip to reach them. Countries with no scans yet still get an estimate: rural population × the 56% with no health coverage × the average cost per person from the scans.",
        cite: ["worldBank", "ilo"],
      },
    ] satisfies Paragraph[],
    unicefCaption: "Cost to fully vaccinate one child under 2 in Gavi-eligible countries (2024 US$)",
    unicef: [
      { label: "Vaccines & syringes", value: 31.12 },
      { label: "Delivery", value: 42.03 },
    ],
    unicefNote: "Ranges from $46 to $130 across countries, mostly because delivery costs differ.",
    formulaCaption: "How Hestia prices one settlement",
    formula: [
      { label: "People", value: "roofs × 5, or area ÷ 250 m² × 5" },
      { label: "Vaccination", value: "people × $10 + $100 per stop" },
      { label: "Travel", value: "road km × rate + off-road km × $8" },
      { label: "Estimated cost", value: "vaccination + travel" },
    ],
    caveat:
      "Hestia's $10 is spread over everyone in a settlement, not just children, so it isn't directly comparable with UNICEF's per-child figure. Both are rough planning numbers: UNICEF notes its benchmarks can't be used to budget a specific country.",
    scan: "The cost only becomes real on the ground. Help us scan a region.",
  },

  closing: {
    title: "Satellites find candidates. Health workers find communities.",
    body: "Each flagged settlement is a lead to verify. The next step is handing these lists to local teams and adding the places they confirm to OpenStreetMap, so the next campaign starts from a better map.",
    primaryCta: { label: "Explore the map", href: "/#map" },
    secondaryCta: { label: "See the algorithm", href: "/algorithm" },
    scan: "See a real candidate. Help us scan a region.",
  },
};
