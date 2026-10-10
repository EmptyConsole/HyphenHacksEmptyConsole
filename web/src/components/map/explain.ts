import { baselineConfig } from "@/data/baselineConfig";
import type { AreaCollection, AreaProperties, ScanMeta } from "@/data/types";
import { formatCost, formatPopulation } from "@/lib/format";

/**
 * Plain-language breakdowns for every number in the map panel.
 * The constants mirror detect-villages.js; keep them in sync when tuning it.
 */
const DETECTOR = {
  peoplePerBuilding: 5,
  metersPerDwelling: 250,
  usdPerPerson: 10,
  usdPerStop: 100,
  offroadUsdPerKm: 8,
  osmMeters: 150,
  clinicsPerVillage: 3,
  clinicRangeKm: 40,
};

export interface ExplanationRow {
  label: string;
  value: string;
}

export interface Explanation {
  summary: string;
  rows?: ExplanationRow[];
  note?: string;
}

export type StatKey = "population" | "cost" | "count" | "detected";
export type VillageKey = "population" | "cost" | "certainty" | "reach" | "clinic";

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
const pts = (n: number) => `${Math.round(n)} pts`;

function total(features: AreaProperties[], key: keyof AreaProperties) {
  return features.reduce((s, f) => s + (Number(f[key]) || 0), 0);
}

function costPerPersonText(p: AreaProperties) {
  switch (p.cost_per_person_source) {
    case "own_scans":
      return `Average detected cost per person across this country's ${p.cost_scan_count} scan${p.cost_scan_count === 1 ? "" : "s"} (vaccination plus travel).`;
    case "all_scans":
      return `No scans here yet, so this uses the average over all ${p.cost_scan_count} scans worldwide.`;
    default:
      return `No scans yet, so this uses the $${baselineConfig.defaultCostPerPerson} default: $${DETECTOR.usdPerPerson} of vaccine per person plus a share of the stop and travel.`;
  }
}

// ---- Panel stats ----------------------------------------------------------

function worldStat(key: StatKey, ctx: PanelContext): Explanation {
  const countries = (ctx.collection?.features ?? []).map((f) => f.properties);
  const fallback = countries.filter((c) => c.baseline_source === "area_estimate").length;
  const detected = countries.filter((c) => c.data_source === "detected").length;
  const share = baselineConfig.noCoverageShare;
  if (key === "population") {
    return {
      summary: "Rural people without health coverage, added up over every country.",
      rows: [
        { label: "Rural population (World Bank)", value: formatPopulation(total(countries, "baseline_rural")) },
        { label: "× share without coverage (ILO)", value: pct(share) },
        { label: "= Estimated population", value: formatPopulation(total(countries, "estimated_population")) },
      ],
      note: fallback
        ? `${fallback} places have no World Bank figure (e.g. Taiwan, Kosovo); they use ${baselineConfig.fallbackRuralPerKm2} rural people per km² of land.`
        : undefined,
    };
  }
  if (key === "cost") {
    const own = countries.filter((c) => c.cost_per_person_source === "own_scans").length;
    const other = countries.find((c) => c.cost_per_person_source !== "own_scans");
    return {
      summary: "Each country's estimated population × a cost per person, added up.",
      rows: [
        { label: "Countries priced from their own scans", value: num(own) },
        {
          label: "Cost per person everywhere else",
          value: other ? usd(other.cost_per_person ?? baselineConfig.defaultCostPerPerson) : "–",
        },
        { label: "= Estimated cost", value: formatCost(total(countries, "estimated_cost")) },
      ],
      note: other ? costPerPersonText(other) : undefined,
    };
  }
  if (key === "count") {
    return {
      summary: `Every country on the map (Natural Earth borders, Antarctica left out). ${detected} have real satellite scans; the other ${countries.length - detected} use the modeled baseline only.`,
    };
  }
  return {
    summary:
      "Real runs of the village detector. Each scan covers about 4 × 4 km around a random OSM village in a high zero-dose country, finds settlement outlines in Esri satellite imagery, and checks them against OpenStreetMap.",
    rows: [
      { label: "Scan areas", value: num(ctx.scans.length) },
      { label: "Settlements found", value: num(ctx.scans.reduce((s, x) => s + x.villages, 0)) },
      { label: "Confirmed by an OSM place", value: num(ctx.scans.reduce((s, x) => s + x.osmMatched, 0)) },
    ],
  };
}

function countryStat(key: StatKey, ctx: PanelContext, p: AreaProperties): Explanation {
  const children = (ctx.collection?.features ?? []).map((f) => f.properties);
  const detected = p.data_source === "detected";
  if (key === "population") {
    const worldBank = p.baseline_source === "world_bank";
    return {
      summary: `Rural people in ${p.name} likely to lack health coverage.`,
      rows: [
        {
          label: worldBank ? `Rural population (World Bank ${p.baseline_year})` : "Rural population (area estimate)",
          value: formatPopulation(p.baseline_rural ?? 0),
        },
        { label: "× share without coverage (ILO)", value: pct(baselineConfig.noCoverageShare) },
        { label: "= Estimated population", value: formatPopulation(p.estimated_population) },
      ],
      note: worldBank
        ? "The 56% is the ILO's global rural figure, applied the same way to every country."
        : `The World Bank has no figure here, so this uses ${baselineConfig.fallbackRuralPerKm2} rural people per km² of land.`,
    };
  }
  if (key === "cost") {
    return {
      summary: "Estimated population × cost to vaccinate and reach one person.",
      rows: [
        { label: "Estimated population", value: num(p.estimated_population) },
        { label: "× cost per person", value: `$${(p.cost_per_person ?? 0).toFixed(2)}` },
        { label: "= Estimated cost", value: formatCost(p.estimated_cost) },
      ],
      note: costPerPersonText(p),
    };
  }
  if (key === "count") {
    return {
      summary: detected
        ? `${children.length} satellite scan box${children.length === 1 ? "" : "es"} in ${p.name}. Each one is a separate run of the detector.`
        : `Placeholder regions generated to split ${p.name}'s estimate. They are not real administrative areas, and no scan has run here yet.`,
    };
  }
  return {
    summary:
      "What the scans in this country actually found. It's far below the country total because each scan covers only about 16 km²; the country total comes from the World Bank baseline.",
    rows: [
      { label: "Detected people", value: formatPopulation(total(children, "estimated_population")) },
      { label: "Detected cost", value: formatCost(total(children, "estimated_cost")) },
    ],
  };
}

function regionStat(key: StatKey, ctx: PanelContext, p: AreaProperties): Explanation {
  const villages = (ctx.collection?.features ?? []).map((f) => f.properties);
  if (p.data_source !== "detected") {
    const what = key === "count" ? "villages" : key === "cost" ? "cost" : "population";
    return {
      summary: `Placeholder ${what}: ${p.name} is a generated share of its country's modeled estimate, not a scan.`,
      note: "Scan this area with “Scan this view” (zoom in first) to replace it with real detections.",
    };
  }
  const osm = villages.filter((v) => v.detection === "osm").length;
  if (key === "population" || key === "detected") {
    return {
      summary: `People in the ${villages.length} settlements detected in this box, added up. Click a settlement to see how its number was estimated.`,
      rows: [
        { label: "Settlements", value: num(villages.length) },
        { label: "Roof clusters counted", value: num(total(villages, "buildings")) || "not saved" },
        { label: "= Estimated population", value: num(total(villages, "estimated_population")) },
      ],
    };
  }
  if (key === "cost") {
    return {
      summary: "Vaccination plus travel for every detected settlement, added up.",
      rows: [
        { label: "Vaccination", value: usd(total(villages, "healthcare_cost")) },
        { label: "+ Travel from clinics", value: usd(total(villages, "reach_cost")) },
        { label: "= Estimated cost", value: usd(total(villages, "estimated_cost")) },
      ],
    };
  }
  return {
    summary: "Settlement outlines the detector traced in this box.",
    rows: [
      { label: "Confirmed by an OSM place", value: num(osm) },
      { label: "Satellite only", value: num(villages.length - osm) },
    ],
  };
}

export function explainStat(key: StatKey, ctx: PanelContext): Explanation {
  if (ctx.level === 0 || !ctx.parent) return worldStat(key, ctx);
  if (ctx.level === 1) return countryStat(key, ctx, ctx.parent);
  return regionStat(key, ctx, ctx.parent);
}

// ---- One settlement -------------------------------------------------------

function villagePopulation(v: AreaProperties): Explanation {
  const { peoplePerBuilding: per, metersPerDwelling: m2 } = DETECTOR;
  const area = v.area_m2 ?? 0;
  const fromArea = Math.round(area / m2) * per;
  // Older scans did not save the roof count; when area loses, the roofs must have won.
  const buildings = v.buildings ?? (v.estimated_population > fromArea ? v.estimated_population / per : undefined);
  const fromRoofs = buildings !== undefined ? buildings * per : undefined;
  const method =
    v.estimated_population === per && (fromRoofs ?? 0) < per && fromArea < per
      ? "minimum"
      : fromRoofs !== undefined && fromRoofs >= fromArea
        ? "roofs"
        : "area";
  return {
    summary:
      method === "roofs"
        ? `Counted ${num(buildings!)} separate roofs in the satellite image and assumed ${per} people per dwelling.`
        : method === "area"
          ? `Some roofs touch and merge into one cluster, so the settlement's area gives a bigger count: one dwelling per ${m2} m², ${per} people each.`
          : `Too small to count, so it gets the minimum of one dwelling (${per} people).`,
    rows: [
      { label: `Roof clusters × ${per}`, value: fromRoofs !== undefined ? `${num(buildings!)} × ${per} = ${num(fromRoofs)}` : "not saved" },
      { label: `Area ÷ ${m2} m² × ${per}`, value: `${num(area)} m² → ${num(fromArea)}` },
      { label: "= Larger of the two", value: num(v.estimated_population) },
    ],
  };
}

function villageCost(v: AreaProperties): Explanation {
  const healthcare = v.healthcare_cost ?? v.estimated_population * DETECTOR.usdPerPerson + DETECTOR.usdPerStop;
  const reach = v.reach_cost ?? v.estimated_cost - healthcare;
  return {
    summary: "Vaccinating everyone here, plus getting a team here from the clinic.",
    rows: [
      {
        label: `Vaccination (${num(v.estimated_population)} × $${DETECTOR.usdPerPerson} + $${DETECTOR.usdPerStop} stop)`,
        value: usd(healthcare),
      },
      { label: "+ Travel", value: usd(reach) },
      { label: "= Estimated cost", value: usd(v.estimated_cost) },
    ],
    note: v.clinic_name
      ? `Travel follows OSM roads at $1.20–$4.50 per km depending on road type (×1.5 when unpaved), plus $${DETECTOR.offroadUsdPerKm}/km for any stretch with no road.`
      : `No clinic was found in range, so travel is priced as the whole search distance off-road at $${DETECTOR.offroadUsdPerKm}/km.`,
  };
}

function villageReach(v: AreaProperties): Explanation {
  const scale = "0–33 is easy, 34–66 moderate, 67–100 hard.";
  if (v.travel_m === undefined || v.offroad_m === undefined || v.slow_m === undefined) {
    return {
      summary: v.clinic_name
        ? `${v.reach_label} (${v.reach_difficulty}/100). Up to 50 points for the off-road gap at the settlement (full at 1 km), up to 30 for trip length (full at 30 km), and up to 20 for the share on tracks, unpaved roads or no road.`
        : `${v.reach_label} (${v.reach_difficulty}/100). No clinic was found in range, so the whole trip counts as off-road: the full 50 points for the gap, the full 20 for surface, and the rest for distance.`,
      note: `This scan predates the per-part breakdown. ${scale}`,
    };
  }
  const offroad = Math.min(v.offroad_m / 1000, 1) * 50;
  const distance = Math.min(v.travel_m / 30000, 1) * 30;
  const share = v.travel_m === 0 ? 1 : Math.min(v.slow_m / v.travel_m, 1);
  return {
    summary: `${v.reach_label} (${v.reach_difficulty}/100). Points add up from how far the settlement is from a road, how long the trip is, and how much of it is rough going.`,
    rows: [
      { label: `Off-road gap at the settlement: ${km(v.offroad_m)} (full at 1 km)`, value: `${pts(offroad)} / 50` },
      { label: `Trip from clinic: ${km(v.travel_m)} (full at 30 km)`, value: `${pts(distance)} / 30` },
      { label: `Tracks, unpaved or no road: ${pct(share)} of the trip`, value: `${pts(share * 20)} / 20` },
    ],
    note: v.clinic_name ? scale : `No clinic was found in range, so the whole trip counts as off-road. ${scale}`,
  };
}

function villageCertainty(v: AreaProperties): Explanation {
  if (v.detection === "osm") {
    return {
      summary: `An OpenStreetMap place (${v.name}) sits inside this outline or within ${DETECTOR.osmMeters} m of it, so the settlement is confirmed: certainty 100.`,
    };
  }
  const parts =
    v.buildings !== undefined && v.compactness !== undefined && v.roof_share !== undefined
      ? {
          buildings: Math.min(v.buildings / 8, 1) * 45,
          shape: Math.min(v.compactness / 0.45, 1) * 30,
          roofs: Math.min(v.roof_share / 0.35, 1) * 25,
        }
      : null;
  return {
    summary: `No OSM place is nearby, so the score comes from the satellite image alone and is capped at 99. Certainty ${v.certainty}.`,
    rows: parts
      ? [
          { label: `Roof clusters: ${v.buildings} (full at 8)`, value: `${pts(parts.buildings)} / 45` },
          { label: `Compactness: ${v.compactness!.toFixed(2)} (full at 0.45, a circle is 1)`, value: `${pts(parts.shape)} / 30` },
          { label: `Roof-colored share: ${pct(v.roof_share!)} (full at 35%)`, value: `${pts(parts.roofs)} / 25` },
        ]
      : [
          { label: "Roof clusters (full at 8)", value: "up to 45" },
          { label: "Compact, village-like shape", value: "up to 30" },
          { label: "Share of roof-colored pixels", value: "up to 25" },
        ],
    note: parts ? undefined : "This scan predates the per-factor breakdown.",
  };
}

function villageClinic(v: AreaProperties): Explanation {
  return v.clinic_name
    ? {
        summary: `${v.clinic_name} is the cheapest of the ${DETECTOR.clinicsPerVillage} nearest OpenStreetMap health facilities (hospital, clinic, doctor or health post), comparing road routes and straight off-road trips.`,
      }
    : {
        summary: `OpenStreetMap lists no health facility within range of this scan, so no route is drawn.`,
        note: `Scans made before the search radius widened to ~${DETECTOR.clinicRangeKm} km looked only ~13 km out.`,
      };
}

export function explainVillage(key: VillageKey, v: AreaProperties): Explanation {
  if (v.data_source !== "detected") {
    return {
      summary: `Placeholder value: ${v.name} is a generated share of its region's modeled estimate, not a detected settlement.`,
    };
  }
  switch (key) {
    case "population":
      return villagePopulation(v);
    case "cost":
      return villageCost(v);
    case "reach":
      return villageReach(v);
    case "certainty":
      return villageCertainty(v);
    case "clinic":
      return villageClinic(v);
  }
}
