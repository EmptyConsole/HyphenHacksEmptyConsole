import { baselineConfig } from "@/data/baselineConfig";
import type { AreaCollection, AreaProperties, ClinicTourSummary, ScanMeta, TourSummary } from "@/data/types";
import type { Vars } from "@/i18n/translate";

/**
 * Plain-language breakdowns for every number in the map panel: one short sentence,
 * the key math, then a smaller note with more detail.
 * The constants mirror detect-villages.js; keep them in sync when tuning it.
 */
const DETECTOR = {
  peoplePerHome: 4.7,
  minHomeM2: 10,
  homeM2: 150,
  fullCoverage: 0.15,
  peoplePerBuilding: 5,
  metersPerDwelling: 250,
  usdPerPerson: 10,
  usdPerStop: 100,
  offroadUsdPerKm: 8,
  roadLowUsdPerKm: 1.2,
  roadHighUsdPerKm: 4.5,
  osmMeters: 150,
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
export type VillageKey = "location" | "population" | "cost" | "certainty" | "reach" | "tour";

export interface PanelContext {
  level: number;
  parent: AreaProperties | null;
  collection: AreaCollection | null;
  scans: ScanMeta[];
  tour: TourSummary | null;
}

export type ExplainCopy = {
  t: (key: string, vars?: Vars) => string;
  money: (usd: number) => string;
  exact: (usd: number) => string;
  people: (n: number) => string;
  count: (n: number) => string;
  km: (meters: number) => string;
  pct: (fraction: number) => string;
  place: (name: string, id?: string, level?: string) => string;
};

const pts = (copy: ExplainCopy, n: number, max: number) =>
  copy.t("map.explain.pts", { n: Math.round(n), max });

function total(features: AreaProperties[], key: keyof AreaProperties) {
  return features.reduce((s, f) => s + (Number(f[key]) || 0), 0);
}

function named(copy: ExplainCopy, p: { id: string; name: string; level?: string }) {
  return copy.place(p.name, p.id, p.level);
}

export function confidenceLevel(v: AreaProperties, copy: ExplainCopy) {
  const c = v.certainty ?? 0;
  const level = v.detection === "osm" || c >= 75 ? "High" : c >= 50 ? "Medium" : "Low";
  return copy.t(`map.confidence${level}`);
}

export function confidenceLabel(v: AreaProperties, copy: ExplainCopy) {
  return `${confidenceLevel(v, copy)} · ${v.detection === "osm" ? copy.t("map.onOsm") : copy.t("map.satellite")}`;
}

export function accessLabel(v: AreaProperties, copy: ExplainCopy) {
  if (!v.reach_label) return copy.t("map.explain.dash");
  const level = v.reach_label.charAt(0).toUpperCase() + v.reach_label.slice(1);
  return copy.t(`map.access${level}`);
}

export function formatLatLon(lat: number, lon: number, copy: ExplainCopy) {
  return copy.t("map.coords", {
    lat: Math.abs(lat).toFixed(5),
    ns: copy.t(lat >= 0 ? "map.compassN" : "map.compassS"),
    lon: Math.abs(lon).toFixed(5),
    ew: copy.t(lon >= 0 ? "map.compassE" : "map.compassW"),
  });
}

function costSourceNote(p: AreaProperties, copy: ExplainCopy) {
  switch (p.cost_per_person_source) {
    case "own_scans":
      return copy.t("map.explain.costOwn", { count: p.cost_scan_count ?? 0 });
    case "all_scans":
      return copy.t("map.explain.costAll");
    default:
      return copy.t("map.explain.costDefault", {
        fallback: copy.exact(baselineConfig.defaultCostPerPerson),
        vaccine: copy.exact(DETECTOR.usdPerPerson),
      });
  }
}

function worldStat(key: StatKey, ctx: PanelContext, copy: ExplainCopy): Explanation {
  const countries = (ctx.collection?.features ?? []).map((f) => f.properties);
  const people = total(countries, "estimated_population");
  const cost = total(countries, "estimated_cost");
  const detected = countries.filter((c) => c.data_source === "detected").length;
  if (key === "population") {
    return {
      summary: copy.t("map.explain.worldPopSummary", { people: copy.people(people) }),
      rows: [
        { label: copy.t("map.explain.ruralPopulation"), value: copy.people(total(countries, "baseline_rural")) },
        { label: copy.t("map.explain.withoutCoverage"), value: copy.pct(baselineConfig.noCoverageShare) },
        { label: copy.t("map.explain.equalsPeople"), value: copy.people(people) },
      ],
      note: copy.t("map.explain.worldPopNote"),
    };
  }
  if (key === "cost") {
    return {
      summary: copy.t("map.explain.worldCostSummary"),
      rows: [
        { label: copy.t("map.explain.people"), value: copy.people(people) },
        {
          label: copy.t("map.explain.timesAverage"),
          value: people ? copy.exact(cost / people) : copy.t("map.explain.dash"),
        },
        { label: copy.t("map.explain.equalsCost"), value: copy.money(cost) },
      ],
      note: copy.t("map.explain.worldCostNote"),
    };
  }
  if (key === "count") {
    return { summary: copy.t("map.explain.worldCountSummary", { detected }) };
  }
  return {
    summary: copy.t("map.explain.worldDetectedSummary"),
    rows: [
      { label: copy.t("map.explain.countries"), value: copy.count(new Set(ctx.scans.map((s) => s.countryId)).size) },
      { label: copy.t("map.scanAreas"), value: copy.count(ctx.scans.length) },
      {
        label: copy.t("map.explain.settlementsFound"),
        value: copy.count(ctx.scans.reduce((s, x) => s + x.villages, 0)),
      },
    ],
    note: copy.t("map.explain.worldDetectedNote"),
  };
}

function countryStat(key: StatKey, ctx: PanelContext, p: AreaProperties, copy: ExplainCopy): Explanation {
  const children = (ctx.collection?.features ?? []).map((f) => f.properties);
  const name = named(copy, p);
  if (key === "population") {
    const worldBank = p.baseline_source === "world_bank";
    return {
      summary: copy.t("map.explain.countryPopSummary", {
        people: copy.people(p.estimated_population),
        name,
      }),
      rows: [
        { label: copy.t("map.explain.ruralPopulation"), value: copy.people(p.baseline_rural ?? 0) },
        { label: copy.t("map.explain.withoutCoverage"), value: copy.pct(baselineConfig.noCoverageShare) },
        { label: copy.t("map.explain.equalsPeople"), value: copy.people(p.estimated_population) },
      ],
      note: worldBank
        ? copy.t("map.explain.countryPopBank", { year: p.baseline_year ?? "" })
        : copy.t("map.explain.countryPopArea"),
    };
  }
  if (key === "cost") {
    return {
      summary: copy.t("map.explain.countryCostSummary"),
      rows: [
        { label: copy.t("map.explain.people"), value: copy.people(p.estimated_population) },
        { label: copy.t("map.explain.timesCost"), value: copy.exact(p.cost_per_person ?? 0) },
        { label: copy.t("map.explain.equalsCost"), value: copy.money(p.estimated_cost) },
      ],
      note: costSourceNote(p, copy),
    };
  }
  if (key === "count") {
    return {
      summary:
        p.data_source === "detected"
          ? copy.t("map.explain.countryScans", { count: children.length, name })
          : copy.t("map.explain.countryNoScans", { name }),
    };
  }
  return {
    summary: copy.t("map.explain.countryDetectedSummary", { name }),
    rows: [
      { label: copy.t("map.scanAreas"), value: copy.count(children.length) },
      { label: copy.t("map.explain.people"), value: copy.people(total(children, "estimated_population")) },
      { label: copy.t("map.explain.cost"), value: copy.money(total(children, "estimated_cost")) },
    ],
    note: copy.t("map.explain.countryDetectedNote"),
  };
}

function regionStat(key: StatKey, ctx: PanelContext, p: AreaProperties, copy: ExplainCopy): Explanation {
  const villages = (ctx.collection?.features ?? []).map((f) => f.properties);
  if (p.data_source !== "detected") {
    return {
      summary: copy.t("map.explain.placeholderRegion", { name: named(copy, p) }),
      note: copy.t("map.explain.placeholderZoom"),
    };
  }
  const onTour = ctx.tour ? villages.filter((v) => v.tour_stop !== undefined) : villages;
  const excluded = ctx.tour ? villages.filter((v) => v.tour_stop === undefined) : [];
  const excludedPeople =
    ctx.tour && excluded.length
      ? ` ${copy.t("map.explain.excludedPeople", {
          people: copy.count(total(excluded, "estimated_population")),
          count: excluded.length,
          min: ctx.tour.minCertainty,
        })}`
      : "";
  if (key === "population") {
    return {
      summary: ctx.tour ? copy.t("map.explain.regionPopTour") : copy.t("map.explain.regionPopAll"),
      rows: [
        {
          label: ctx.tour ? copy.t("map.explain.settlementsOnTour") : copy.t("map.explain.settlements"),
          value: copy.count(onTour.length),
        },
        { label: copy.t("map.explain.equalsPeople"), value: copy.count(total(onTour, "estimated_population")) },
      ],
      note: copy.t("map.explain.regionPopNote") + excludedPeople,
    };
  }
  if (key === "cost") {
    if (!ctx.tour) return { summary: copy.t("map.explain.noTeam") };
    const tour = explainTour(ctx.tour, copy);
    return {
      ...tour,
      note: `${tour.note ?? ""} ${copy.t("map.explain.vaccineNote", {
        perPerson: copy.exact(DETECTOR.usdPerPerson),
        perStop: copy.exact(DETECTOR.usdPerStop),
      })}`.trim(),
    };
  }
  const osm = onTour.filter((v) => v.detection === "osm").length;
  return {
    summary: copy.t("map.explain.regionCountSummary", {
      which: ctx.tour ? copy.t("map.explain.regionCountTour") : copy.t("map.explain.regionCountScan"),
      osm,
      satellite: onTour.length - osm,
    }),
    note:
      ctx.tour && excluded.length
        ? copy.t("map.explain.excludedSettlements", { count: excluded.length, min: ctx.tour.minCertainty })
        : undefined,
  };
}

export function explainStat(key: StatKey, ctx: PanelContext, copy: ExplainCopy): Explanation {
  if (ctx.level === 0 || !ctx.parent) return worldStat(key, ctx, copy);
  if (ctx.level === 1) return countryStat(key, ctx, ctx.parent, copy);
  return regionStat(key, ctx, ctx.parent, copy);
}

export function explainTour(tour: TourSummary, copy: ExplainCopy): Explanation {
  const start =
    tour.depotKind === "clinic"
      ? (tour.depotName ?? copy.t("map.explain.nearestClinic"))
      : copy.t("map.explain.nearestRoad");
  const across = tour.joined ? copy.t("map.explain.acrossScans", { count: tour.joined.scanCount }) : "";
  return {
    summary: copy.t("map.explain.tourSummary", {
      start,
      stops: tour.stops,
      across,
      cost: copy.exact(tour.costUsd),
    }),
    rows: [
      { label: copy.t("map.explain.roadsKm", { km: copy.km(tour.roadMeters) }), value: copy.exact(tour.roadUsd) },
      { label: copy.t("map.explain.offroadKm", { km: copy.km(tour.offroadMeters) }), value: copy.exact(tour.offroadUsd) },
      { label: copy.t("map.explain.equalsTravel"), value: copy.exact(tour.costUsd) },
      { label: copy.t("map.explain.plusVaccination"), value: copy.exact(tour.vaccinationUsd) },
      { label: copy.t("map.explain.equalsTotal"), value: copy.exact(tour.costUsd + tour.vaccinationUsd) },
    ],
    note:
      (tour.joined ? copy.t("map.explain.tourJoined") : "") +
      copy.t("map.explain.tourOrder") +
      (tour.depotKind === "clinic" ? "" : copy.t("map.explain.tourNoClinic")) +
      (tour.skipped ? copy.t("map.explain.tourSkipped", { count: tour.skipped }) : ""),
  };
}

export function explainClinicLocation(lat: number, lon: number, copy: ExplainCopy): Explanation {
  return {
    summary: copy.t("map.explain.clinicWhere"),
    rows: [
      { label: copy.t("map.explain.latitude"), value: lat.toFixed(5) },
      { label: copy.t("map.explain.longitude"), value: lon.toFixed(5) },
    ],
    note: copy.t("map.explain.pastePair"),
  };
}

export function explainClinicTour(s: ClinicTourSummary, copy: ExplainCopy): Explanation {
  return {
    summary: copy.t("map.explain.clinicTour", {
      count: s.scanCount,
      name: s.clinicName ?? copy.t("map.explain.thisClinic"),
      areas: s.scanCount,
      stops: s.stops,
    }),
    rows: [
      { label: copy.t("map.explain.roadsKm", { km: copy.km(s.roadMeters) }), value: copy.exact(s.roadUsd) },
      { label: copy.t("map.explain.offroadKm", { km: copy.km(s.offroadMeters) }), value: copy.exact(s.offroadUsd) },
      { label: copy.t("map.explain.equalsTravel"), value: copy.exact(s.costUsd) },
      { label: copy.t("map.explain.plusVaccination"), value: copy.exact(s.vaccinationUsd) },
      { label: copy.t("map.explain.equalsTotal"), value: copy.exact(s.costUsd + s.vaccinationUsd) },
    ],
    note:
      copy.t("map.explain.clinicTourNote") +
      (s.skipped ? copy.t("map.explain.tourSkipped", { count: s.skipped }) : ""),
  };
}

function footprintPopulation(v: AreaProperties, copy: ExplainCopy): Explanation {
  const homes = v.homes ?? 0;
  return {
    summary: copy.t("map.explain.footprintSummary", {
      people: copy.count(v.estimated_population),
      buildings: copy.count(v.buildings ?? 0),
      homes: copy.count(homes),
      per: DETECTOR.peoplePerHome,
    }),
    rows: [
      { label: copy.t("map.explain.buildingsFootprints"), value: copy.count(v.buildings ?? 0) },
      { label: copy.t("map.explain.toHomes"), value: copy.count(homes) },
      {
        label: copy.t("map.explain.perHome", { n: DETECTOR.peoplePerHome }),
        value: copy.count(v.estimated_population),
      },
    ],
    note: copy.t("map.explain.footprintNote", {
      min: DETECTOR.minHomeM2,
      home: DETECTOR.homeM2,
      per: DETECTOR.peoplePerHome,
    }),
  };
}

function villagePopulation(v: AreaProperties, copy: ExplainCopy): Explanation {
  if (v.building_source === "footprints") return footprintPopulation(v, copy);
  const { peoplePerBuilding: per, metersPerDwelling: m2 } = DETECTOR;
  const area = v.area_m2 ?? 0;
  const fromArea = Math.round(area / m2) * per;
  const roofs = v.buildings ?? (v.estimated_population > fromArea ? v.estimated_population / per : undefined);
  const fromRoofs = roofs !== undefined ? roofs * per : undefined;
  const byRoofs = fromRoofs !== undefined && fromRoofs >= fromArea;
  return {
    summary: byRoofs
      ? copy.t("map.explain.roofSummary", {
          people: copy.count(v.estimated_population),
          roofs: copy.count(roofs!),
          per,
        })
      : copy.t("map.explain.sizeSummary", { people: copy.count(v.estimated_population) }),
    rows: [
      {
        label: copy.t("map.explain.fromRoofs"),
        value:
          fromRoofs !== undefined
            ? copy.t("map.explain.roofProduct", {
                roofs: copy.count(roofs!),
                per,
                people: copy.count(fromRoofs),
              })
            : copy.t("map.explain.notRecorded"),
      },
      {
        label: copy.t("map.explain.fromSize"),
        value: copy.t("map.explain.sizeValue", { area: copy.count(area), people: copy.count(fromArea) }),
      },
      { label: copy.t("map.explain.equalsPeopleLarger"), value: copy.count(v.estimated_population) },
    ],
    note: copy.t("map.explain.roofNote", { per, m2 }),
  };
}

function villageCost(v: AreaProperties, copy: ExplainCopy): Explanation {
  const vaccination = v.healthcare_cost ?? v.estimated_population * DETECTOR.usdPerPerson + DETECTOR.usdPerStop;
  const travel = v.reach_cost ?? v.estimated_cost - vaccination;
  return {
    summary: copy.t("map.explain.villageCostSummary"),
    rows: [
      { label: copy.t("map.explain.vaccination"), value: copy.exact(vaccination) },
      { label: copy.t("map.explain.plusTravel"), value: copy.exact(travel) },
      { label: copy.t("map.explain.equalsCost"), value: copy.exact(v.estimated_cost) },
    ],
    note: v.clinic_name
      ? copy.t("map.explain.villageCostRoad", {
          perPerson: copy.exact(DETECTOR.usdPerPerson),
          perStop: copy.exact(DETECTOR.usdPerStop),
          low: copy.exact(DETECTOR.roadLowUsdPerKm),
          high: copy.exact(DETECTOR.roadHighUsdPerKm),
          offroad: copy.exact(DETECTOR.offroadUsdPerKm),
        })
      : copy.t("map.explain.villageCostNoClinic", {
          perPerson: copy.exact(DETECTOR.usdPerPerson),
          perStop: copy.exact(DETECTOR.usdPerStop),
        }),
  };
}

function villageAccess(v: AreaProperties, copy: ExplainCopy): Explanation {
  const label = accessLabel(v, copy);
  const scale = copy.t("map.explain.accessScale");
  if (!v.clinic_name) {
    return {
      summary: copy.t("map.explain.accessNoClinic", { label, score: v.reach_difficulty ?? 0 }),
      note: scale,
    };
  }
  const summary = copy.t("map.explain.accessFrom", {
    label,
    clinic: v.clinic_name,
    score: v.reach_difficulty ?? 0,
  });
  if (v.travel_m === undefined || v.offroad_m === undefined || v.slow_m === undefined) {
    return { summary, note: scale };
  }
  const share = v.travel_m === 0 ? 1 : Math.min(v.slow_m / v.travel_m, 1);
  return {
    summary,
    rows: [
      {
        label: copy.t("map.explain.distanceRoad", { km: copy.km(v.offroad_m) }),
        value: pts(copy, Math.min(v.offroad_m / 1000, 1) * 50, 50),
      },
      {
        label: copy.t("map.explain.tripClinic", { km: copy.km(v.travel_m) }),
        value: pts(copy, Math.min(v.travel_m / 30000, 1) * 30, 30),
      },
      {
        label: copy.t("map.explain.roughRoad", { pct: copy.pct(share) }),
        value: pts(copy, share * 20, 20),
      },
    ],
    note: scale,
  };
}

function villageConfidence(v: AreaProperties, copy: ExplainCopy): Explanation {
  if (v.detection === "osm") {
    return {
      summary: copy.t("map.explain.osmConfirm"),
      note: copy.t("map.explain.osmConfirmNote", { meters: DETECTOR.osmMeters }),
    };
  }
  const has = v.buildings !== undefined && v.compactness !== undefined && v.roof_share !== undefined;
  const footprints = v.building_source === "footprints";
  const fullShare = footprints ? DETECTOR.fullCoverage : 0.35;
  return {
    summary: footprints
      ? copy.t("map.explain.confidenceFootprints", {
          level: confidenceLevel(v, copy),
          score: v.certainty ?? 0,
        })
      : copy.t("map.explain.confidenceSatellite", {
          level: confidenceLevel(v, copy),
          score: v.certainty ?? 0,
        }),
    rows: has
      ? [
          {
            label: copy.t(footprints ? "map.explain.buildingsCount" : "map.explain.roofsCounted", {
              n: v.buildings ?? 0,
            }),
            value: pts(copy, Math.min(v.buildings! / 8, 1) * 45, 45),
          },
          { label: copy.t("map.explain.villageShape"), value: pts(copy, Math.min(v.compactness! / 0.45, 1) * 30, 30) },
          {
            label: copy.t(footprints ? "map.explain.coveredBuildings" : "map.explain.coveredRoofs", {
              pct: copy.pct(v.roof_share!),
            }),
            value: pts(copy, Math.min(v.roof_share! / fullShare, 1) * 25, 25),
          },
        ]
      : undefined,
    note: footprints
      ? copy.t("map.explain.confidenceFootprintNote", { coverage: copy.pct(DETECTOR.fullCoverage) })
      : copy.t("map.explain.confidenceColorNote"),
  };
}

function villageLocation(v: AreaProperties, copy: ExplainCopy): Explanation {
  return {
    summary: copy.t("map.explain.locationSummary"),
    rows:
      v.lat !== undefined && v.lon !== undefined
        ? [
            { label: copy.t("map.explain.latitude"), value: v.lat.toFixed(5) },
            { label: copy.t("map.explain.longitude"), value: v.lon.toFixed(5) },
          ]
        : undefined,
    note: copy.t("map.explain.locationNote"),
  };
}

export function explainScanLocation(p: AreaProperties, copy: ExplainCopy): Explanation {
  return {
    summary: copy.t("map.explain.scanLocationSummary"),
    rows:
      p.lat !== undefined && p.lon !== undefined
        ? [
            { label: copy.t("map.explain.latitude"), value: p.lat.toFixed(5) },
            { label: copy.t("map.explain.longitude"), value: p.lon.toFixed(5) },
          ]
        : undefined,
    note: copy.t("map.explain.scanLocationNote"),
  };
}

function villageTourStop(v: AreaProperties, tour: TourSummary | null, copy: ExplainCopy): Explanation {
  if (!tour) return { summary: copy.t("map.explain.noTour") };
  if (v.tour_stop === undefined) {
    return { summary: copy.t("map.explain.skippedStop", { score: v.certainty ?? 0 }) };
  }
  return {
    summary: copy.t("map.explain.tourStopSummary", {
      stop: v.tour_stop,
      stops: tour.stops,
      start: tour.depotName ?? copy.t("map.explain.theStart"),
    }),
    note: copy.t("map.explain.tourStopNote"),
  };
}

export function explainVillage(
  key: VillageKey,
  v: AreaProperties,
  tour: TourSummary | null,
  copy: ExplainCopy,
): Explanation {
  if (key === "location") return villageLocation(v, copy);
  if (v.data_source !== "detected") {
    return { summary: copy.t("map.explain.placeholderVillage", { name: named(copy, v) }) };
  }
  switch (key) {
    case "population":
      return villagePopulation(v, copy);
    case "cost":
      return villageCost(v, copy);
    case "reach":
      return villageAccess(v, copy);
    case "certainty":
      return villageConfidence(v, copy);
    case "tour":
      return villageTourStop(v, tour, copy);
  }
}
