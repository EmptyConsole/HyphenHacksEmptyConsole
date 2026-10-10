import { baselineConfig } from "@/data/baselineConfig";
import type { AreaCollection, AreaProperties, ScanMeta, TourSummary } from "@/data/types";
import { formatCost, formatPopulation } from "@/lib/format";

/**
 * Plain-language breakdowns for every number in the map panel: one short sentence,
 * the key math, then a smaller note with more detail.
 * The constants mirror detect-villages.js; keep them in sync when tuning it.
 */
const DETECTOR = {
  peoplePerBuilding: 5,
  metersPerDwelling: 250,
  usdPerPerson: 10,
  usdPerStop: 100,
  offroadUsdPerKm: 8,
  osmMeters: 150,
};

export interface ExplanationRow {
  label: string;
  value: string;
}

export interface Explanation {
  /** One plain sentence. */
  summary: string;
  /** The key math, last row being the result. */
  rows?: ExplanationRow[];
  /** Smaller text with more detail. */
  note?: string;
}

export type StatKey = "population" | "cost" | "count" | "detected";
export type VillageKey = "location" | "population" | "cost" | "certainty" | "reach" | "tour";

export interface PanelContext {
  level: number;
  parent: AreaProperties | null;
  collection: AreaCollection | null;
  scans: ScanMeta[];
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const num = (n: number) => Math.round(n).toLocaleString("en-US");
const km = (m: number) => `${(m / 1000).toFixed(1)} km`;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const pts = (n: number, max: number) => `${Math.round(n)} / ${max}`;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function total(features: AreaProperties[], key: keyof AreaProperties) {
  return features.reduce((s, f) => s + (Number(f[key]) || 0), 0);
}

// ---- Labels shared with the panel ------------------------------------------

/** "High", "Medium" or "Low", from the 0–100 certainty. */
export function confidenceLevel(v: AreaProperties) {
  const c = v.certainty ?? 0;
  return v.detection === "osm" || c >= 75 ? "High" : c >= 50 ? "Medium" : "Low";
}

/** e.g. "High · on OSM" or "Low · satellite". Short enough for one panel row. */
export function confidenceLabel(v: AreaProperties) {
  return `${confidenceLevel(v)} · ${v.detection === "osm" ? "on OSM" : "satellite"}`;
}

export function accessLabel(v: AreaProperties) {
  return v.reach_label ? capitalize(v.reach_label) : "–";
}

/** Plain-text coordinates, e.g. "9.45231° N, 9.02114° E". */
export function formatLatLon(lat: number, lon: number) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(5)}° ${ns}, ${Math.abs(lon).toFixed(5)}° ${ew}`;
}

// ---- Panel stats ----------------------------------------------------------

function costSourceNote(p: AreaProperties) {
  switch (p.cost_per_person_source) {
    case "own_scans":
      return `The cost per person is the average from this country's ${p.cost_scan_count} scan${p.cost_scan_count === 1 ? "" : "s"}: vaccine, the visit and travel.`;
    case "all_scans":
      return "This country has no scans yet, so it uses the average cost per person from all scans.";
    default:
      return `No scans yet, so it uses a $${baselineConfig.defaultCostPerPerson} default: $${DETECTOR.usdPerPerson} of vaccine per person plus the visit and travel.`;
  }
}

function worldStat(key: StatKey, ctx: PanelContext): Explanation {
  const countries = (ctx.collection?.features ?? []).map((f) => f.properties);
  const people = total(countries, "estimated_population");
  const cost = total(countries, "estimated_cost");
  const detected = countries.filter((c) => c.data_source === "detected").length;
  if (key === "population") {
    return {
      summary: `About ${formatPopulation(people)} rural people likely have no health coverage.`,
      rows: [
        { label: "Rural population", value: formatPopulation(total(countries, "baseline_rural")) },
        { label: "× without coverage", value: pct(baselineConfig.noCoverageShare) },
        { label: "= People", value: formatPopulation(people) },
      ],
      note: "Rural population is the World Bank's latest count for each country. The 56% is the International Labour Organization's global rural rate. Places with no World Bank figure are estimated from their land area.",
    };
  }
  if (key === "cost") {
    return {
      summary: "What it would cost to reach and vaccinate all of them.",
      rows: [
        { label: "People", value: formatPopulation(people) },
        { label: "× average cost per person", value: people ? `$${(cost / people).toFixed(2)}` : "–" },
        { label: "= Cost", value: formatCost(cost) },
      ],
      note: "A country with scans uses the cost per person its scans found. Every other country uses the average across all scans.",
    };
  }
  if (key === "count") {
    return {
      summary: `Every country on the map. ${detected} have satellite scans; the rest are estimates only.`,
    };
  }
  return {
    summary: "Places we've actually scanned with satellite imagery.",
    rows: [
      { label: "Countries", value: num(new Set(ctx.scans.map((s) => s.countryId)).size) },
      { label: "Scan areas", value: num(ctx.scans.length) },
      { label: "Settlements found", value: num(ctx.scans.reduce((s, x) => s + x.villages, 0)) },
    ],
    note: "Each scan covers about 4 × 4 km. Settlements are found in satellite images and checked against OpenStreetMap.",
  };
}

function countryStat(key: StatKey, ctx: PanelContext, p: AreaProperties): Explanation {
  const children = (ctx.collection?.features ?? []).map((f) => f.properties);
  if (key === "population") {
    const worldBank = p.baseline_source === "world_bank";
    return {
      summary: `About ${formatPopulation(p.estimated_population)} rural people in ${p.name} likely have no health coverage.`,
      rows: [
        { label: "Rural population", value: formatPopulation(p.baseline_rural ?? 0) },
        { label: "× without coverage", value: pct(baselineConfig.noCoverageShare) },
        { label: "= People", value: formatPopulation(p.estimated_population) },
      ],
      note: worldBank
        ? `Rural population is the World Bank's ${p.baseline_year} figure. The 56% is the International Labour Organization's global rural rate.`
        : "The World Bank has no figure here, so rural population is estimated from land area.",
    };
  }
  if (key === "cost") {
    return {
      summary: "What it would cost to reach and vaccinate them.",
      rows: [
        { label: "People", value: formatPopulation(p.estimated_population) },
        { label: "× cost per person", value: `$${(p.cost_per_person ?? 0).toFixed(2)}` },
        { label: "= Cost", value: formatCost(p.estimated_cost) },
      ],
      note: costSourceNote(p),
    };
  }
  if (key === "count") {
    return {
      summary:
        p.data_source === "detected"
          ? `${children.length} satellite scan${children.length === 1 ? "" : "s"} in ${p.name}. Each dot on the map is one.`
          : `Placeholder regions that split ${p.name}'s estimate. No scans here yet.`,
    };
  }
  return {
    summary: `What the satellite scans in ${p.name} actually found.`,
    rows: [
      { label: "Scan areas", value: num(children.length) },
      { label: "People", value: formatPopulation(total(children, "estimated_population")) },
      { label: "Cost", value: formatCost(total(children, "estimated_cost")) },
    ],
    note: "Far smaller than the country total because each scan covers only about 16 km². The total above is an estimate for the whole country.",
  };
}

function regionStat(key: StatKey, ctx: PanelContext, p: AreaProperties): Explanation {
  const villages = (ctx.collection?.features ?? []).map((f) => f.properties);
  if (p.data_source !== "detected") {
    return {
      summary: `A placeholder: ${p.name} is a share of the country's estimate, not a scan.`,
      note: "Zoom in and use “Scan this view” to replace it with real detections.",
    };
  }
  const osm = villages.filter((v) => v.detection === "osm").length;
  if (key === "population") {
    return {
      summary: "People living in the settlements found in this scan.",
      rows: [
        { label: "Settlements", value: num(villages.length) },
        { label: "= People", value: num(total(villages, "estimated_population")) },
      ],
      note: "Each settlement's count comes from its roofs or its size. Click a settlement to see how.",
    };
  }
  if (key === "cost") {
    return {
      summary: "Vaccinating everyone here, plus travel from the nearest clinic.",
      rows: [
        { label: "Vaccination", value: usd(total(villages, "healthcare_cost")) },
        { label: "+ Travel", value: usd(total(villages, "reach_cost")) },
        { label: "= Cost", value: usd(total(villages, "estimated_cost")) },
      ],
      note: `Vaccination is $${DETECTOR.usdPerPerson} per person plus $${DETECTOR.usdPerStop} per settlement visited.`,
    };
  }
  return {
    summary: `Settlements found in this scan. ${osm} are on OpenStreetMap; the other ${villages.length - osm} were found only in satellite images.`,
  };
}

export function explainStat(key: StatKey, ctx: PanelContext): Explanation {
  if (ctx.level === 0 || !ctx.parent) return worldStat(key, ctx);
  if (ctx.level === 1) return countryStat(key, ctx, ctx.parent);
  return regionStat(key, ctx, ctx.parent);
}

// ---- Team tour ------------------------------------------------------------

export function explainTour(t: TourSummary): Explanation {
  const start = t.depotKind === "clinic" ? (t.depotName ?? "the nearest clinic") : "the settlement nearest a road";
  return {
    summary: `One team leaves ${start}, visits ${t.stops} settlements and comes back, for ${usd(t.costUsd)} in travel.`,
    rows: [
      { label: `Roads, ${km(t.roadMeters)}`, value: usd(t.roadUsd) },
      { label: `Off-road, ${km(t.offroadMeters)}`, value: usd(t.offroadUsd) },
      { label: "= Travel", value: usd(t.costUsd) },
      { label: "+ Vaccination", value: usd(t.vaccinationUsd) },
      { label: "= Total", value: usd(t.costUsd + t.vaccinationUsd) },
    ],
    note:
      "Stops are put in the order that keeps travel cheapest, using roads wherever that's cheaper than going straight across country." +
      (t.depotKind === "clinic" ? "" : " No clinic was found nearby, so the tour starts at the settlement closest to a road.") +
      (t.skipped ? ` ${t.skipped} low-confidence detections are left out.` : ""),
  };
}

// ---- One settlement -------------------------------------------------------

function villagePopulation(v: AreaProperties): Explanation {
  const { peoplePerBuilding: per, metersPerDwelling: m2 } = DETECTOR;
  const area = v.area_m2 ?? 0;
  const fromArea = Math.round(area / m2) * per;
  // Older scans did not save the roof count; when area loses, the roofs must have won.
  const roofs = v.buildings ?? (v.estimated_population > fromArea ? v.estimated_population / per : undefined);
  const fromRoofs = roofs !== undefined ? roofs * per : undefined;
  const byRoofs = fromRoofs !== undefined && fromRoofs >= fromArea;
  return {
    summary: byRoofs
      ? `About ${num(v.estimated_population)} people: ${num(roofs!)} roofs × ${per} people per home.`
      : `About ${num(v.estimated_population)} people, estimated from the settlement's size.`,
    rows: [
      {
        label: "From roofs",
        value: fromRoofs !== undefined ? `${num(roofs!)} × ${per} = ${num(fromRoofs)}` : "not recorded",
      },
      { label: "From size", value: `${num(area)} m² → ${num(fromArea)}` },
      { label: "= People (the larger)", value: num(v.estimated_population) },
    ],
    note: `Each home is assumed to hold ${per} people. Roofs that touch can look like one, so the size estimate (one home per ${m2} m²) is used when it's higher.`,
  };
}

function villageCost(v: AreaProperties): Explanation {
  const vaccination = v.healthcare_cost ?? v.estimated_population * DETECTOR.usdPerPerson + DETECTOR.usdPerStop;
  const travel = v.reach_cost ?? v.estimated_cost - vaccination;
  return {
    summary: "Vaccinating everyone here, plus getting a team here.",
    rows: [
      { label: "Vaccination", value: usd(vaccination) },
      { label: "+ Travel", value: usd(travel) },
      { label: "= Cost", value: usd(v.estimated_cost) },
    ],
    note:
      `Vaccination is $${DETECTOR.usdPerPerson} per person plus $${DETECTOR.usdPerStop} for the visit. ` +
      (v.clinic_name
        ? `Travel follows roads where possible ($1.20–$4.50 per km) and costs $${DETECTOR.offroadUsdPerKm} per km off-road.`
        : "No clinic was found nearby, so travel is priced as a long off-road trip."),
  };
}

function villageAccess(v: AreaProperties): Explanation {
  const label = accessLabel(v);
  const scale = "Distance from a road counts most, then trip length, then how much of the way is rough. 0–33 is easy, 34–66 moderate, 67–100 hard.";
  if (!v.clinic_name) {
    return {
      summary: `${label} (${v.reach_difficulty}/100): no clinic was found nearby, so the whole trip counts as off-road.`,
      note: scale,
    };
  }
  const summary = `${label} to reach from ${v.clinic_name} (${v.reach_difficulty}/100).`;
  if (v.travel_m === undefined || v.offroad_m === undefined || v.slow_m === undefined) {
    return { summary, note: scale };
  }
  const share = v.travel_m === 0 ? 1 : Math.min(v.slow_m / v.travel_m, 1);
  return {
    summary,
    rows: [
      { label: `Distance from a road, ${km(v.offroad_m)}`, value: pts(Math.min(v.offroad_m / 1000, 1) * 50, 50) },
      { label: `Trip from the clinic, ${km(v.travel_m)}`, value: pts(Math.min(v.travel_m / 30000, 1) * 30, 30) },
      { label: `Rough or no road, ${pct(share)}`, value: pts(share * 20, 20) },
    ],
    note: scale,
  };
}

function villageConfidence(v: AreaProperties): Explanation {
  if (v.detection === "osm") {
    return {
      summary: "High: this settlement is listed on OpenStreetMap.",
      note: `A mapped place inside the outline, or within ${DETECTOR.osmMeters} m of it, confirms it.`,
    };
  }
  const has = v.buildings !== undefined && v.compactness !== undefined && v.roof_share !== undefined;
  return {
    summary: `${confidenceLevel(v)}: found only in satellite images (score ${v.certainty}/100).`,
    rows: has
      ? [
          { label: `Roofs counted, ${v.buildings}`, value: pts(Math.min(v.buildings! / 8, 1) * 45, 45) },
          { label: "Village-like shape", value: pts(Math.min(v.compactness! / 0.45, 1) * 30, 30) },
          { label: `Roof-colored area, ${pct(v.roof_share!)}`, value: pts(Math.min(v.roof_share! / 0.35, 1) * 25, 25) },
        ]
      : undefined,
    note: "More roofs, a compact shape and more roof-colored ground all raise the score. It stays below 100 unless OpenStreetMap confirms the place. High is 75+, Medium 50–74, Low under 50.",
  };
}

function villageLocation(v: AreaProperties): Explanation {
  return {
    summary: "The center of the settlement.",
    rows:
      v.lat !== undefined && v.lon !== undefined
        ? [
            { label: "Latitude", value: v.lat.toFixed(5) },
            { label: "Longitude", value: v.lon.toFixed(5) },
          ]
        : undefined,
    note: "Paste the pair into any map app to find it. Routes and the team tour arrive at this point.",
  };
}

function villageTourStop(v: AreaProperties, tour: TourSummary | null): Explanation {
  if (!tour) return { summary: "This scan doesn't have a team tour yet." };
  if (v.tour_stop === undefined) {
    return {
      summary: `Not on the team tour: confidence is low (${v.certainty}/100), so it may be bare ground rather than homes.`,
    };
  }
  return {
    summary: `Stop ${v.tour_stop} of ${tour.stops} on the team's round trip from ${tour.depotName ?? "the start"}.`,
    note: "The order is the one that keeps total travel cost lowest.",
  };
}

export function explainVillage(key: VillageKey, v: AreaProperties, tour: TourSummary | null = null): Explanation {
  if (key === "location") return villageLocation(v);
  if (v.data_source !== "detected") {
    return { summary: `A placeholder: ${v.name} is a share of its region's estimate, not a detected settlement.` };
  }
  switch (key) {
    case "population":
      return villagePopulation(v);
    case "cost":
      return villageCost(v);
    case "reach":
      return villageAccess(v);
    case "certainty":
      return villageConfidence(v);
    case "tour":
      return villageTourStop(v, tour);
  }
}
