import type { Feature, FeatureCollection, Geometry } from "geojson";
import type {
  AreaCollection,
  AreaProperties,
  ScanMeta,
  VillageLayer,
} from "@/data";

/** Everything the panel is showing, as handed to the download buttons. */
export interface ExportView {
  level: number;
  /** Breadcrumb names below "World". */
  path: string[];
  parent: AreaProperties | null;
  collection: AreaCollection;
  layer: Omit<VillageLayer, "areas"> | null;
  scans: ScanMeta[];
  /** The panel's headline numbers. `costUsd` is null when the panel shows "–". */
  summary: { population: number; costUsd: number | null; count: number; countLabel: string };
  /** When set, only this settlement, its route and its clinic are exported. */
  selected: AreaProperties | null;
}

export type ExportFormat = "geojson" | "csv";

/** Area columns that lead every CSV; the rest follow in first-seen order. */
const LEAD_COLUMNS = [
  "id",
  "name",
  "level",
  "data_source",
  "estimated_population",
  "estimated_cost",
] as const;

function scansInView({ level, parent, scans }: ExportView) {
  if (level === 0) return scans;
  if (!parent) return [];
  if (level === 1) return scans.filter((s) => s.countryId === parent.id);
  return scans.filter((s) => `scan:${s.id}` === parent.id);
}

/** An area's properties, plus the saved scan's details when the area is a scan box. */
function areaProps(view: ExportView, props: AreaProperties): Record<string, unknown> {
  const scan = view.scans.find((s) => `scan:${s.id}` === props.id);
  if (view.level !== 1 || !scan) return { ...props };
  return {
    ...props,
    settlements: scan.settlements ?? scan.villages,
    settlements_with_clinic: scan.withClinic,
    osm_matched: scan.osmMatched,
    tour_stops: scan.tourStops,
    clinic_range_km: scan.clinicRangeKm,
    bbox_south: scan.bbox.south,
    bbox_west: scan.bbox.west,
    bbox_north: scan.bbox.north,
    bbox_east: scan.bbox.east,
    scan_origin: scan.origin,
    scanned_at: scan.updatedAt ?? scan.createdAt,
  };
}

/** The areas, routes, clinics and tour that the export covers. */
function contents(view: ExportView) {
  const { collection, layer, selected } = view;
  if (!selected) {
    return {
      areas: collection.features,
      routes: layer?.routes.features ?? [],
      clinics: layer?.clinics.features ?? [],
      tour: layer?.tour ?? null,
    };
  }
  return {
    areas: collection.features.filter((f) => f.properties.id === selected.id),
    routes: (layer?.routes.features ?? []).filter(
      (f) => f.properties.villageId === selected.id,
    ),
    clinics: (layer?.clinics.features ?? []).filter(
      (f) => f.properties.name === selected.clinic_name,
    ),
    tour: null,
  };
}

/** Short description of what a download holds, for the panel. */
export function describeExport(view: ExportView): string {
  const { areas, routes, clinics, tour } = contents(view);
  if (view.selected) {
    const parts = ["Outline"];
    if (routes.length) parts.push("route");
    if (clinics.length) parts.push("clinic");
    return `${parts.join(", ")} and costs for this settlement`;
  }
  const parts = [`${areas.length} ${view.summary.countLabel}`];
  const scans = view.level < 2 ? scansInView(view).length : 0;
  if (scans && view.summary.countLabel !== "scans") parts.push(`${scans} scans`);
  if (routes.length) parts.push(`${routes.length} routes`);
  if (clinics.length) parts.push(`${clinics.length} clinics`);
  if (tour) parts.push("team tour");
  return parts.join(" · ");
}

/** `metadata` is a foreign member (RFC 7946 §6.1): GIS tools keep the features and ignore it. */
function toGeoJSON(view: ExportView): FeatureCollection<Geometry> & { metadata: object } {
  const { areas, routes, clinics, tour } = contents(view);
  const features: Feature<Geometry>[] = [
    ...areas.map((f) => ({ ...f, properties: { layer: "area", ...areaProps(view, f.properties) } })),
    ...routes.map((f) => ({ ...f, properties: { layer: "route", ...f.properties } })),
    ...clinics.map((f) => ({ ...f, properties: { layer: "clinic", ...f.properties } })),
    ...(tour?.line.features ?? []).map((f) => ({
      ...f,
      properties: { layer: "tour", ...tour!.summary },
    })),
  ];
  return {
    type: "FeatureCollection",
    metadata: {
      source: "Hestia",
      exportedAt: new Date().toISOString(),
      view: ["World", ...view.path].join(" / "),
      level: ["world", "country", "region"][view.level],
      selected: view.selected?.name ?? null,
      summary: view.selected
        ? null
        : {
            population: view.summary.population,
            cost_usd: view.summary.costUsd,
            [view.summary.countLabel]: view.summary.count,
          },
      parent: view.parent,
      tour: tour?.summary ?? null,
      scans: scansInView(view),
    },
    features,
  };
}

function csvCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** One row per area with every property; geometry stays in the GeoJSON. */
function toCSV(view: ExportView): string {
  const rows = contents(view).areas.map((f) => areaProps(view, f.properties));
  const columns: string[] = [...LEAD_COLUMNS];
  for (const props of rows) {
    for (const key of Object.keys(props)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  const lines = rows.map((props) => columns.map((key) => csvCell(props[key])).join(","));
  return [columns.join(","), ...lines].join("\n") + "\n";
}

function slug(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function exportFileName(view: ExportView, format: ExportFormat) {
  const names = view.selected
    ? [...view.path, view.selected.name]
    : [...(view.path.length ? view.path : ["world"]), view.summary.countLabel];
  return `hestia-${names.map(slug).filter(Boolean).join("-")}.${format}`;
}

export function downloadView(view: ExportView, format: ExportFormat) {
  const blob =
    format === "geojson"
      ? new Blob([JSON.stringify(toGeoJSON(view))], {
          type: "application/geo+json",
        })
      : new Blob([toCSV(view)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = exportFileName(view, format);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking right away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
