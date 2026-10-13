"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";
import * as maplibregl from "maplibre-gl";
import type {
  GeoJSONSource,
  LngLatBoundsLike,
  MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  area as turfArea,
  bbox,
  bboxPolygon,
  booleanPointInPolygon,
  featureCollection,
  point,
  pointOnFeature,
} from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import {
  dataProvider,
  type AreaCollection,
  type AreaFeature,
  type AreaProperties,
  type ClinicTourRecord,
  type ClinicTourSummary,
  type ScanMeta,
  type TourSummary,
  type VillageLayer,
} from "@/data";
import { baselineConfig } from "@/data/baselineConfig";
import { tokens } from "@/design/tokens";
import {
  clearAutoscanOnLoad,
  consumeQueuedAutoScan,
  onAutoScan,
  peekAutoscanOnLoad,
} from "@/lib/autoscan";
import { formatCost, formatPopulation } from "@/lib/format";
import { tileCount } from "@/lib/tiles";
import { pickUnscannedArea, scanZoom, type UnscannedTarget } from "@/lib/unscanned";
import {
  getBaseStyle,
  intensityColor,
  MAP_THEMES,
  type MapTheme,
} from "./mapStyle";
import styles from "./ExplorerMap.module.css";
import {
  describeExport,
  downloadView,
  type ExportFormat,
  type ExportView,
} from "./exportData";
import {
  accessLabel,
  confidenceLabel,
  confidenceLevel,
  explainScanLocation,
  explainClinicTour,
  explainStat,
  explainTour,
  explainVillage,
  formatLatLon,
  type Explanation,
  type PanelContext,
  type StatKey,
  type VillageKey,
} from "./explain";

// Turbopack rewrites import.meta.url, so MapLibre can't find its worker on its own.
// `npm run dev`/`build` copy it into public/vendor (see package.json).
maplibregl.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");

const WORLD_VIEW = { center: [18, 12] as [number, number], zoom: 1.9 };
const EMPTY = featureCollection([]);
const LEVEL_LABEL = ["World", "Country", "Region"] as const;
const CHILD_LABEL = ["countries", "scans", "villages"] as const;
/** Inside a scanned country the children are scans; inside a scan they are settlements. */
const DETECTED_CHILD_LABEL = ["countries", "scans", "settlements"] as const;
/** The scan button appears from this zoom; below it the view is far too big to scan. */
const SCAN_MIN_ZOOM = 8;

const hovered: ExpressionSpecification = [
  "boolean",
  ["feature-state", "hover"],
  false,
];
const isSelected: ExpressionSpecification = [
  "boolean",
  ["feature-state", "selected"],
  false,
];
const detected: ExpressionSpecification = [
  "==",
  ["get", "data_source"],
  "detected",
];

/**
 * Detected settlements fade with certainty (0 → faint, 100 → solid).
 * Hover and selection stay bright so a weak lead can still be inspected.
 * Countries, scan boxes, and modeled villages have no certainty and keep a flat fill.
 */
const settlementFillOpacity: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["get", "certainty"],
  0,
  0.12,
  100,
  0.72,
];
const settlementLineOpacity: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["get", "certainty"],
  0,
  0.28,
  100,
  1,
];
const fillOpacity: ExpressionSpecification = [
  "case",
  hovered,
  0.85,
  isSelected,
  0.85,
  ["has", "certainty"],
  settlementFillOpacity,
  0.5,
];
const lineOpacity: ExpressionSpecification = [
  "case",
  hovered,
  1,
  isSelected,
  1,
  ["has", "certainty"],
  settlementLineOpacity,
  1,
];

/** Countries share one flat color (hover highlights); lower levels use the cost ramp. */
const areaFillColor: ExpressionSpecification = [
  "case",
  ["!=", ["get", "level"], "country"],
  intensityColor,
  hovered,
  tokens.color.accent,
  tokens.data[1],
];

const SCAN_EMPTY_COLOR = "#ff4d4d";
const markerStatus: ExpressionSpecification = ["coalesce", ["get", "status"], ""];
const markerColor: ExpressionSpecification = [
  "match",
  markerStatus,
  "empty",
  SCAN_EMPTY_COLOR,
  "noClinic",
  tokens.color.accent,
  tokens.color.constellation,
];

/** Detected areas get a solid constellation outline; modeled ones a faint one. */
function areaLineColor(theme: MapTheme): ExpressionSpecification {
  return [
    "case",
    hovered,
    tokens.color.accent,
    isSelected,
    tokens.color.accent,
    detected,
    tokens.color.constellation,
    MAP_THEMES[theme].modeledLine,
  ];
}

type Hover =
  | {
      x: number;
      y: number;
      flip: boolean;
      flipY: boolean;
      kind: "area";
      props: AreaProperties;
    }
  | {
      x: number;
      y: number;
      flip: boolean;
      flipY: boolean;
      kind: "clinic";
      name: string;
    }
  | null;

type ScanState =
  | { status: "idle" }
  | { status: "seeking"; countryName: string | null }
  | { status: "running"; startedAt: number }
  | { status: "done"; scan: ScanMeta }
  | { status: "error"; message: string };

/** Adds a 0–1 rank-based `intensity` so colors spread evenly at every zoom level. */
function withIntensity(fc: AreaCollection) {
  const ranked = [...fc.features].sort(
    (a, b) => a.properties.estimated_cost - b.properties.estimated_cost,
  );
  const rank = new Map(
    ranked.map((f, i) => [
      f.properties.id,
      ranked.length > 1 ? i / (ranked.length - 1) : 1,
    ]),
  );
  return featureCollection(
    fc.features.map((f) => ({
      ...f,
      properties: { ...f.properties, intensity: rank.get(f.properties.id) },
    })),
  );
}

/** Bounds to fit; for shapes spanning the antimeridian, use the largest part instead. */
function boundsOf(feature: AreaFeature): LngLatBoundsLike {
  let [minX, minY, maxX, maxY] = bbox(feature);
  if (maxX - minX > 180 && feature.geometry.type === "MultiPolygon") {
    const parts = feature.geometry.coordinates.map(
      (coordinates): Feature<Polygon> => ({
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates },
      }),
    );
    const largest = parts.reduce((a, b) => (turfArea(b) > turfArea(a) ? b : a));
    [minX, minY, maxX, maxY] = bbox(largest);
  }
  return [minX, minY, maxX, maxY];
}

/**
 * Marker points for areas too small to see at the current zoom: scan locations on the
 * world view, scan boxes inside a country, and villages inside a scan box.
 * `areaId` is the area in the current collection that the marker stands for.
 */
function markerPoints(level: number, fc: AreaCollection, scans: ScanMeta[]) {
  if (level === 0) {
    return featureCollection(
      scans.map((s) =>
        point(
          [(s.bbox.west + s.bbox.east) / 2, (s.bbox.south + s.bbox.north) / 2],
          {
            areaId: s.countryId,
            scanId: s.id,
            halo: 14,
            core: 3.5,
            status: scanStatus(s),
          },
        ),
      ),
    );
  }
  if (level === 1 && fc.features[0]?.properties.data_source !== "detected")
    return EMPTY;
  const size = level === 1 ? { halo: 16, core: 4.5 } : {};
  const byArea = new Map(scans.map((s) => [`scan:${s.id}`, s]));
  return featureCollection(
    fc.features.map((f) => {
      const scan = level === 1 ? byArea.get(f.properties.id) : undefined;
      return {
        ...pointOnFeature(f),
        properties: {
          areaId: f.properties.id,
          ...size,
          ...(scan && { status: scanStatus(scan) }),
        },
      };
    }),
  );
}

type ScanStatus = "empty" | "noClinic" | "reached";

/** Marker color for a scan: nothing found, settlements but no clinic in range, or reachable. */
function scanStatus(s: ScanMeta): ScanStatus {
  if ((s.settlements ?? s.villages) === 0) return "empty";
  return s.withClinic === 0 ? "noClinic" : "reached";
}

/** Tooltip fields for a scan dot on the world view, where the dot is not its own area. */
function propsForScan(s: ScanMeta): AreaProperties {
  return {
    id: `scan:${s.id}`,
    name: s.label ?? `Scan in ${s.countryName}`,
    level: "region",
    estimated_population: s.population,
    estimated_cost: s.costUsd,
    data_source: "detected",
    tour_cost: scanStatus(s) === "noClinic" ? null : (s.tourCostUsd ?? null),
  };
}

/** Team-route cost for a scan. Country totals are omitted. Other areas keep their own cost. */
function formatHoverCost(props: AreaProperties): string | null {
  if (props.level === "country") return null;
  if (props.level === "region" && props.data_source === "detected") {
    return props.tour_cost == null ? "–" : formatCost(props.tour_cost);
  }
  return formatCost(props.estimated_cost);
}

function sum(
  fc: AreaCollection | null,
  key: "estimated_population" | "estimated_cost",
) {
  return (fc?.features ?? []).reduce((s, f) => s + f.properties[key], 0);
}

export default function ExplorerMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const collectionRef = useRef<AreaCollection | null>(null);
  const hoverIdRef = useRef<string | null>(null);
  const cameraKeyRef = useRef<string | null>(null);
  const scansRef = useRef<ScanMeta[]>([]);
  const pendingFly = useRef<UnscannedTarget | null>(null);
  const flyToken = useRef(0);
  const helpScanRef = useRef(false);
  const scanViewRef = useRef<() => Promise<void>>(async () => {});

  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [trail, setTrail] = useState<AreaFeature[]>([]); // [country?, region?]
  const [collection, setCollection] = useState<AreaCollection | null>(null);
  const [extras, setExtras] = useState<Omit<VillageLayer, "areas"> | null>(
    null,
  );
  const [parentProps, setParentProps] = useState<AreaProperties | null>(null);
  const [selected, setSelected] = useState<AreaProperties | null>(null);
  /** A clicked clinic marker and its joined tour (null tour: it has none; undefined: loading). */
  const [clinicCard, setClinicCard] = useState<{
    id: string;
    name: string;
    tour?: ClinicTourSummary | null;
  } | null>(null);
  const [hover, setHover] = useState<Hover>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [scans, setScans] = useState<ScanMeta[]>([]);
  const [viewTiles, setViewTiles] = useState<number | null>(null);
  const [scan, setScan] = useState<ScanState>({ status: "idle" });
  const scanRef = useRef(scan);
  useEffect(() => {
    scanRef.current = scan;
  }, [scan]);
  const [now, setNow] = useState(() => Date.now());
  const [mapTheme, setMapTheme] = useState<MapTheme>("dark");
  // The map is built once with the starting theme; later changes go through syncMapTheme
  // without rebuilding it, so the setup effect reads the theme from here, not as a dependency.
  const initialThemeRef = useRef(mapTheme);
  const [legendOpen, setLegendOpen] = useState(false);

  /** Which number's explanation is open, e.g. "stat:cost" or "village:reach". */
  const [explain, setExplain] = useState<string | null>(null);
  const toggleExplain = useCallback(
    (key: string) => setExplain((k) => (k === key ? null : key)),
    [],
  );

  const syncMapTheme = useCallback((theme: MapTheme) => {
    const map = mapRef.current;
    // Not isStyleLoaded(): it stays false while tiles load, which would drop the change.
    if (!map || !map.getLayer("areas-line")) return;

    const { background, raster } = MAP_THEMES[theme];
    map.setPaintProperty("background", "background-color", background);
    for (const key of Object.keys(raster) as (keyof typeof raster)[])
      map.setPaintProperty("osm", key, raster[key]);
    map.setPaintProperty("areas-line", "line-color", areaLineColor(theme));
  }, []);

  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const level = trail.length;
  const trailRef = useRef(trail);
  useEffect(() => {
    trailRef.current = trail;
  }, [trail]);

  const drillInto = useCallback((feature: AreaFeature) => {
    setHover(null);
    setExplain(null);
    setClinicCard(null);
    helpScanRef.current = false;
    if (trailRef.current.length < 2) {
      setSelected(null);
      // A marker and the area under it both fire on one click; add the area only once.
      setTrail((t) =>
        t.length >= 2 ||
        t.some((f) => f.properties.id === feature.properties.id)
          ? t
          : [...t, feature],
      );
    } else setSelected(feature.properties);
  }, []);

  const closeSelected = useCallback(() => {
    setSelected(null);
    setClinicCard(null);
    setExplain(null);
  }, []);

  /** Open a clinic's card and load the joined tour it starts. */
  const openClinic = useCallback(async (id: string, name: string) => {
    setSelected(null);
    setExplain(null);
    setClinicCard({ id, name });
    const response = await fetch(`/api/tours/${encodeURIComponent(id)}`).catch(() => null);
    const record = response?.ok ? ((await response.json()) as ClinicTourRecord) : null;
    setClinicCard((card) => (card?.id === id ? { id, name, tour: record?.summary ?? null } : card));
  }, []);

  const openScan = useCallback(async (result: ScanMeta) => {
    const countries = await dataProvider.getCountries();
    const country = countries.features.find(
      (f) => f.properties.id === result.countryId,
    );
    if (!country) return;
    const regions = await dataProvider.getRegions(country);
    const region = regions.features.find(
      (f) => f.properties.id === `scan:${result.id}`,
    );
    setSelected(null);
    setClinicCard(null);
    setExplain(null);
    setScan({ status: "idle" });
    setTrail(region ? [country, region] : [country]);
  }, []);
  // The map's click handler is registered once, so it reaches openScan through a ref.
  const openScanRef = useRef(openScan);
  useEffect(() => {
    openScanRef.current = openScan;
  }, [openScan]);

  // The map's click handlers are registered once, so they read these refs for current values.
  const clinicCardRef = useRef(clinicCard);
  const openClinicRef = useRef(openClinic);
  useEffect(() => {
    clinicCardRef.current = clinicCard;
    openClinicRef.current = openClinic;
  }, [clinicCard, openClinic]);

  const goTo = useCallback((depth: number) => {
    setSelected(null);
    setClinicCard(null);
    setExplain(null);
    setTrail((t) => t.slice(0, depth));
  }, []);

  const flyToTarget = useCallback((target: UnscannedTarget) => {
    const map = mapRef.current;
    if (!map) return;
    const token = ++flyToken.current;
    pendingFly.current = target;
    helpScanRef.current = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const zoom = scanZoom(map.getContainer().clientWidth, map.getContainer().clientHeight);
    const finish = () => {
      if (flyToken.current !== token || !mapRef.current) return;
      const center = map.getCenter();
      const close =
        Math.abs(center.lng - target.lng) < 0.25 &&
        Math.abs(center.lat - target.lat) < 0.25 &&
        map.getZoom() >= SCAN_MIN_ZOOM - 0.5;
      if (!close) {
        if (map.isMoving()) map.once("moveend", finish);
        else if (flyToken.current === token) {
          pendingFly.current = null;
          helpScanRef.current = false;
          setScan((current) => (current.status === "seeking" ? { status: "idle" } : current));
        }
        return;
      }
      const bounds = map.getBounds();
      const tiles = tileCount(bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast());
      if (tiles > baselineConfig.maxScanTiles && map.getZoom() < 16) {
        map.zoomTo(Math.min(16, map.getZoom() + 0.45), { duration: reduce ? 0 : 350 });
        map.once("moveend", finish);
        return;
      }
      pendingFly.current = null;
      if (tiles > baselineConfig.maxScanTiles) {
        helpScanRef.current = false;
        setScan({ status: "error", message: "That view is still too large to scan. Try again." });
        return;
      }
      void scanViewRef.current();
    };
    map.flyTo({
      center: [target.lng, target.lat],
      zoom,
      duration: reduce ? 0 : 2200,
      essential: true,
    });
    if (reduce) finish();
    else map.once("moveend", finish);
  }, []);

  // ---- Map setup (once) ----
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: getBaseStyle(initialThemeRef.current),
      center: WORLD_VIEW.center,
      zoom: WORLD_VIEW.zoom,
      minZoom: 1,
      maxZoom: 17,
      cooperativeGestures: true,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );

    map.on("load", () => {
      map.addSource("context", { type: "geojson", data: EMPTY });
      // Inside a scan: the boxes of the country's other scans, so you can jump between them.
      map.addSource("other-scans", { type: "geojson", data: EMPTY });
      map.addSource("areas", { type: "geojson", data: EMPTY, promoteId: "id" });
      map.addSource("dots", { type: "geojson", data: EMPTY });
      map.addSource("routes", { type: "geojson", data: EMPTY });
      map.addSource("clinics", { type: "geojson", data: EMPTY });
      map.addSource("tour", { type: "geojson", data: EMPTY });

      map.addLayer({
        id: "areas-fill",
        type: "fill",
        source: "areas",
        paint: {
          "fill-color": areaFillColor,
          "fill-opacity": fillOpacity,
          "fill-opacity-transition": { duration: 150 },
        },
      });
      map.addLayer({
        id: "areas-line",
        type: "line",
        source: "areas",
        paint: {
          "line-color": areaLineColor("dark"),
          "line-opacity": lineOpacity,
          "line-width": ["case", hovered, 2, detected, 1.6, 0.6],
        },
      });
      map.addLayer({
        id: "context-line",
        type: "line",
        source: "context",
        paint: { "line-color": tokens.color.constellation, "line-width": 1.5 },
      });
      // Invisible fill so a click anywhere inside another scan's box opens it.
      map.addLayer({
        id: "other-scans-fill",
        type: "fill",
        source: "other-scans",
        paint: { "fill-color": tokens.color.constellation, "fill-opacity": 0 },
      });
      map.addLayer({
        id: "other-scans-line",
        type: "line",
        source: "other-scans",
        paint: { "line-color": tokens.color.constellation, "line-width": 1.5, "line-opacity": 0.75 },
      });
      // Clinic → village routes. Off-road fallbacks are dashed so nobody mistakes them for roads.
      map.addLayer({
        id: "routes-road",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "kind"], "road"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": tokens.color.constellation,
          "line-width": 1.2,
          "line-opacity": 0.35,
        },
      });
      map.addLayer({
        id: "routes-offroad",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "kind"], "offroad"],
        paint: {
          "line-color": tokens.color.constellation,
          "line-width": 1.2,
          "line-opacity": 0.35,
          "line-dasharray": [2, 2],
        },
      });
      map.addLayer({
        id: "routes-active",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "villageId"], ""],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": tokens.color.accent, "line-width": 3 },
      });
      // The team tour: one loop from the clinic through every settlement and back.
      map.addLayer({
        id: "tour-casing",
        type: "line",
        source: "tour",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": tokens.color.bg, "line-width": 5, "line-opacity": 0.6 },
      });
      map.addLayer({
        id: "tour-line",
        type: "line",
        source: "tour",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": tokens.color.accent, "line-width": 2.5 },
      });
      map.addLayer({
        id: "dots-halo",
        type: "circle",
        source: "dots",
        // Larger on the world and country views, where a marker is the only sign of a ~4 km scan.
        paint: {
          "circle-radius": ["coalesce", ["get", "halo"], 9],
          "circle-color": markerColor,
          "circle-opacity": 0.3,
          "circle-blur": 1,
        },
      });
      map.addLayer({
        id: "dots-core",
        type: "circle",
        source: "dots",
        paint: {
          "circle-radius": ["coalesce", ["get", "core"], 2.5],
          "circle-color": markerColor,
        },
      });
      // Invisible, bigger target so tiny markers are easy to hover and click.
      map.addLayer({
        id: "dots-hit",
        type: "circle",
        source: "dots",
        paint: { "circle-radius": 11, "circle-opacity": 0 },
      });
      map.addLayer({
        id: "clinics-halo",
        type: "circle",
        source: "clinics",
        paint: {
          "circle-radius": 12,
          "circle-color": tokens.color.text,
          "circle-opacity": 0.15,
          "circle-blur": 1,
        },
      });
      map.addLayer({
        id: "clinics-core",
        type: "circle",
        source: "clinics",
        paint: {
          "circle-radius": 5,
          "circle-color": tokens.color.text,
          "circle-stroke-color": tokens.color.constellation,
          "circle-stroke-width": 2,
        },
      });

      const setHoverState = (id: string | null) => {
        if (hoverIdRef.current)
          map.setFeatureState(
            { source: "areas", id: hoverIdRef.current },
            { hover: false },
          );
        hoverIdRef.current = id;
        if (id) map.setFeatureState({ source: "areas", id }, { hover: true });
      };
      const findArea = (id: unknown) =>
        collectionRef.current?.features.find(
          (f) => f.properties.id === String(id),
        );
      // Keep the tooltip inside the map: open left near the right edge, upward near the bottom.
      const flipAt = (e: MapLayerMouseEvent) => ({
        flip: e.point.x > map.getContainer().clientWidth - 240,
        flipY: e.point.y > map.getContainer().clientHeight - 240,
      });

      const hoverArea = (e: MapLayerMouseEvent, id: unknown) => {
        const feature = findArea(id);
        if (!feature) return;
        map.getCanvas().style.cursor = "pointer";
        setHoverState(feature.properties.id);
        setHover({
          x: e.point.x,
          y: e.point.y,
          ...flipAt(e),
          kind: "area",
          props: feature.properties,
        });
      };
      const leave = () => {
        map.getCanvas().style.cursor = "";
        setHoverState(null);
        setHover(null);
      };

      map.on("mousemove", "areas-fill", (e) =>
        hoverArea(e, e.features?.[0]?.id),
      );
      // Hovering a scan's dot starts loading it, so it's usually ready by the click.
      // getVillages caches, so hovering again costs nothing.
      const preload = (areaId: string) => {
        if (!areaId.startsWith("scan:")) return;
        const feature = collectionRef.current?.features.find((f) => f.properties.id === areaId);
        if (feature) dataProvider.getVillages(feature).catch(() => {});
      };
      map.on("mousemove", "dots-hit", (e) => {
        const raw = e.features?.[0]?.properties;
        const scanId = raw?.scanId ? String(raw.scanId) : "";
        preload(scanId ? `scan:${scanId}` : String(raw?.areaId ?? ""));
        if (scanId) {
          const scan = scansRef.current.find((s) => s.id === scanId);
          if (!scan) return;
          map.getCanvas().style.cursor = "pointer";
          setHoverState(null);
          setHover({
            x: e.point.x,
            y: e.point.y,
            ...flipAt(e),
            kind: "area",
            props: propsForScan(scan),
          });
          return;
        }
        hoverArea(e, raw?.areaId);
      });
      map.on("mousemove", "clinics-core", (e) => {
        const name = e.features?.[0]?.properties.name;
        map.getCanvas().style.cursor = "default";
        setHover({
          x: e.point.x,
          y: e.point.y,
          ...flipAt(e),
          kind: "clinic",
          name: String(name),
        });
      });
      map.on("mouseleave", "areas-fill", leave);
      map.on("mouseleave", "dots-hit", leave);
      map.on("mouseleave", "clinics-core", leave);
      // A clinic opens its card: the one tour it runs through every scan it's nearest to.
      // One click handler, so only the top thing under the cursor responds: a clinic, then a
      // marker dot, then an area, then another scan's box. Separate per-layer handlers would
      // all fire, and a settlement under a clinic would take the click away from the clinic.
      const clickable = ["clinics-core", "dots-hit", "areas-fill", "other-scans-fill"];
      map.on("click", (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: clickable.filter((id) => map.getLayer(id)) });
        const top = (layer: string) => hits.find((hit) => hit.layer.id === layer);

        const clinic = top("clinics-core");
        if (clinic) {
          openClinicRef.current(String(clinic.properties.id), String(clinic.properties.name));
          return;
        }
        // Rendered features are tile-clipped; always drill into the full original geometry.
        const dot = top("dots-hit");
        const dotArea = dot && findArea(dot.properties.areaId);
        if (dotArea) return drillInto(dotArea);
        const area = top("areas-fill");
        const areaFeature = area && findArea(area.id);
        if (areaFeature) return drillInto(areaFeature);
        const other = top("other-scans-fill");
        const otherScan = other && scansRef.current.find((s) => s.id === String(other.properties.scanId));
        if (otherScan) openScanRef.current(otherScan);
      });
      map.on("mousemove", "other-scans-fill", (e) => {
        // Settlements, markers and clinics keep their own hover; only bare box area shows this.
        const above = map.queryRenderedFeatures(e.point, {
          layers: ["clinics-core", "dots-hit", "areas-fill"].filter((id) => map.getLayer(id)),
        });
        if (above.length) return;
        const scan = scansRef.current.find((s) => s.id === String(e.features?.[0]?.properties.scanId));
        if (!scan) return;
        map.getCanvas().style.cursor = "pointer";
        setHover({ x: e.point.x, y: e.point.y, ...flipAt(e), kind: "area", props: propsForScan(scan) });
      });
      map.on("mouseleave", "other-scans-fill", leave);

      const measureView = () => {
        if (map.getZoom() < SCAN_MIN_ZOOM) return setViewTiles(null);
        const b = map.getBounds();
        setViewTiles(
          tileCount(b.getSouth(), b.getWest(), b.getNorth(), b.getEast()),
        );
      };
      map.on("moveend", measureView);

      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      // A recreated map (e.g. after Fast Refresh) needs its data and camera set again.
      cameraKeyRef.current = null;
      hoverIdRef.current = null;
      setHover(null);
      setReady(false);
    };
  }, [drillInto]);

  useEffect(() => {
    if (!ready) return;
    syncMapTheme(mapTheme);
  }, [ready, mapTheme, syncMapTheme]);

  // ---- Poll for scans saved by scan-batch.js or a live scan ----
  useEffect(() => {
    const timer = setInterval(async () => {
      const changed = await dataProvider.refresh().catch(() => false);
      if (changed) setDataVersion((v) => v + 1);
    }, baselineConfig.pollMs);
    return () => clearInterval(timer);
  }, []);

  // ---- Load data for the current level; move the camera only when the level changes ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !map.getSource("areas")) return;
    let cancelled = false;
    const parent = trail[trail.length - 1];

    (async () => {
      setLoading(true);
      // Let the loading state paint before (possibly heavy) polygon generation.
      await new Promise((r) => setTimeout(r, 30));
      let fc: AreaCollection;
      let layer: Omit<VillageLayer, "areas"> | null = null;
      let joined: VillageLayer["joined"];
      // The trail holds features from when they were clicked; look up current numbers.
      let fresh: AreaProperties | null = null;
      try {
        if (level === 0) {
          fc = await dataProvider.getCountries();
        } else if (level === 1) {
          fc = await dataProvider.getRegions(trail[0]);
          fresh =
            (await dataProvider.getCountries()).features.find(
              (f) => f.properties.id === parent.properties.id,
            )?.properties ?? null;
        } else {
          const villages = await dataProvider.getVillages(trail[1]);
          fc = villages.areas;
          layer = { routes: villages.routes, clinics: villages.clinics, tour: villages.tour };
          joined = villages.joined;
          fresh =
            (await dataProvider.getRegions(trail[0])).features.find(
              (f) => f.properties.id === parent.properties.id,
            )?.properties ?? null;
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) setLoading(false);
        return;
      }
      if (cancelled) return;
      // After a hot reload the map is rebuilt; this load belongs to the old one, or the new
      // one hasn't added its layers yet. It runs again once the new map is ready.
      if (mapRef.current !== map || !map.getSource("areas")) return;

      const currentScans = dataProvider.getScans();
      scansRef.current = currentScans;
      hoverIdRef.current = null;
      collectionRef.current = fc;
      setCollection(fc);
      setExtras(layer);
      setScans(currentScans);
      setParentProps(fresh ?? parent?.properties ?? null);
      setSelected((s) =>
        s && fc.features.some((f) => f.properties.id === s.id) ? s : null,
      );
      (map.getSource("areas") as GeoJSONSource).setData(withIntensity(fc));
      (map.getSource("context") as GeoJSONSource).setData(
        parent ? featureCollection([parent]) : EMPTY,
      );
      const otherScans =
        level === 2 && parent?.properties.data_source === "detected"
          ? currentScans.filter(
              (s) => s.countryId === trail[0].properties.id && `scan:${s.id}` !== parent.properties.id,
            )
          : [];
      (map.getSource("other-scans") as GeoJSONSource).setData(
        featureCollection(
          otherScans.map((s) =>
            bboxPolygon([s.bbox.west, s.bbox.south, s.bbox.east, s.bbox.north], { properties: { scanId: s.id } }),
          ),
        ),
      );
      (map.getSource("dots") as GeoJSONSource).setData(
        markerPoints(level, fc, currentScans),
      );
      (map.getSource("routes") as GeoJSONSource).setData(
        layer?.routes ?? EMPTY,
      );
      (map.getSource("clinics") as GeoJSONSource).setData(
        layer?.clinics ?? EMPTY,
      );
      (map.getSource("tour") as GeoJSONSource).setData(
        layer?.tour?.line ?? EMPTY,
      );
      // The clinic's joined tour loads alongside the scan; draw it as soon as it arrives.
      joined?.then((update) => {
        if (cancelled || !update || !mapRef.current) return;
        const withStops: AreaCollection = {
          ...fc,
          features: fc.features.map((f) => ({
            ...f,
            properties: { ...f.properties, tour_stop: update.stops[f.properties.id] },
          })),
        };
        collectionRef.current = withStops;
        setCollection(withStops);
        setSelected((s) => (s ? { ...s, tour_stop: update.stops[s.id] } : s));
        (map.getSource("areas") as GeoJSONSource).setData(withIntensity(withStops));
        (map.getSource("tour") as GeoJSONSource).setData(update.tour.line);
        if (layer) {
          const clinics = update.clinic
            ? { ...layer.clinics, features: [...layer.clinics.features, update.clinic] }
            : layer.clinics;
          (map.getSource("clinics") as GeoJSONSource).setData(clinics);
          setExtras({ ...layer, tour: update.tour, clinics });
        }
      });

      if (level === 0 && peekAutoscanOnLoad() && !pendingFly.current) {
        const target = pickUnscannedArea(fc.features, currentScans);
        clearAutoscanOnLoad();
        if (target) {
          pendingFly.current = target;
          helpScanRef.current = true;
          setScan({ status: "seeking", countryName: target.countryName });
        } else {
          setScan({
            status: "error",
            message: "Couldn't find an unscanned area. Try again.",
          });
        }
      }

      const cameraKey = trail.map((f) => f.properties.id).join("|");
      if (cameraKey !== cameraKeyRef.current) {
        cameraKeyRef.current = cameraKey;
        const wide = map.getContainer().clientWidth > 760;
        const padding = wide
          ? { top: 60, bottom: 60, left: 360, right: 60 }
          : { top: 200, bottom: 30, left: 30, right: 30 };
        // Scan boxes are ~4 km across, so allow a much closer zoom for detected regions.
        const maxZoom =
          parent?.properties.data_source === "detected" && level === 2
            ? 15
            : 12;
        const queued = pendingFly.current;
        if (queued && level === 0) flyToTarget(queued);
        else if (parent)
          map.fitBounds(boundsOf(parent), { padding, duration: 1600, maxZoom });
        else map.flyTo({ ...WORLD_VIEW, duration: 1600 });
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, trail, level, dataVersion, flyToTarget]);

  // ---- Team tour or clinic routes, never both: together they are unreadable ----
  // A scan with a team tour shows only the tour; older scans fall back to clinic routes.
  const showTour = !!extras?.tour;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !map.getSource("areas")) return;
    const visible = (on: boolean) => (on ? "visible" : "none");
    for (const id of ["tour-casing", "tour-line"]) map.setLayoutProperty(id, "visibility", visible(showTour));
    for (const id of ["routes-road", "routes-offroad", "routes-active"]) {
      map.setLayoutProperty(id, "visibility", visible(!showTour));
    }
  }, [ready, showTour]);

  // ---- Selected village highlight and its route ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !map.getSource("areas")) return;
    const routeFor =
      selected?.id ??
      (hover?.kind === "area" && hover.props.level === "village"
        ? hover.props.id
        : "");
    map.setFilter("routes-active", ["==", ["get", "villageId"], routeFor]);
  }, [ready, selected, hover]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !selected) return;
    map.setFeatureState(
      { source: "areas", id: selected.id },
      { selected: true },
    );
    return () => {
      if (map.getSource("areas"))
        map.setFeatureState(
          { source: "areas", id: selected.id },
          { selected: false },
        );
    };
  }, [ready, selected]);

  // ---- Escape goes up a level ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // A selected settlement closes first; the next Esc goes up a level.
      if (selectedRef.current || clinicCardRef.current) closeSelected();
      else if (trailRef.current.length > 0) goTo(trailRef.current.length - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, closeSelected]);

  // ---- Elapsed-time ticker while a live scan runs ----
  useEffect(() => {
    if (scan.status !== "running") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [scan.status]);

  const scanView = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    const center = map.getCenter();
    const countries = await dataProvider.getCountries();
    const country = countries.features.find((f) =>
      booleanPointInPolygon([center.lng, center.lat], f),
    );
    if (!country) {
      setScan({
        status: "error",
        message: "Center the view on land inside a country.",
      });
      return;
    }
    setScan({ status: "running", startedAt: Date.now() });
    setNow(Date.now());
    try {
      const result = await dataProvider.scanArea({
        south: b.getSouth(),
        west: b.getWest(),
        north: b.getNorth(),
        east: b.getEast(),
        countryId: country.properties.id,
        countryName: country.properties.name,
      });
      setScan({ status: "done", scan: result });
      setDataVersion((v) => v + 1);
    } catch (error) {
      helpScanRef.current = false;
      setScan({ status: "error", message: (error as Error).message });
    }
  }, []);
  useEffect(() => {
    scanViewRef.current = scanView;
  }, [scanView]);

  const startHelpScan = useCallback(async () => {
    const map = mapRef.current;
    const current = scanRef.current.status;
    if (!map || current === "running" || current === "seeking") return;
    const seeking = { status: "seeking" as const, countryName: null };
    scanRef.current = seeking;
    setScan(seeking);
    try {
      const countries = await dataProvider.getCountries();
      const target = pickUnscannedArea(countries.features, dataProvider.getScans());
      if (!mapRef.current) return;
      if (!target) {
        helpScanRef.current = false;
        setScan({
          status: "error",
          message: "Couldn't find an unscanned area. Try again.",
        });
        return;
      }
      pendingFly.current = target;
      helpScanRef.current = true;
      setScan({ status: "seeking", countryName: target.countryName });
      if (trailRef.current.length === 0) flyToTarget(target);
      else {
        setSelected(null);
        setExplain(null);
        setTrail([]);
      }
    } catch (error) {
      helpScanRef.current = false;
      setScan({ status: "error", message: (error as Error).message });
    }
  }, [flyToTarget]);

  useEffect(() => {
    if (!ready) return;
    // A scan queued before the map was ready starts on the next tick, not inside the effect,
    // so its state updates don't cascade through this render.
    const queued = consumeQueuedAutoScan() ? setTimeout(() => void startHelpScan(), 0) : undefined;
    const unsubscribe = onAutoScan(() => {
      void startHelpScan();
    });
    return () => {
      clearTimeout(queued);
      unsubscribe();
    };
  }, [ready, startHelpScan]);


  useEffect(() => {
    if (scan.status !== "done" || !helpScanRef.current) return;
    helpScanRef.current = false;
    void openScan(scan.scan);
  }, [scan, openScan]);

  const totals = useMemo(() => {
    // Inside a scan with a team tour, only the settlements the tour visits count.
    const onTour =
      level === 2 && extras?.tour && collection
        ? collection.features.filter((f) => f.properties.tour_stop !== undefined)
        : null;
    return {
      count: onTour ? onTour.length : (collection?.features.length ?? 0),
      population: onTour
        ? onTour.reduce((s, f) => s + (f.properties.estimated_population || 0), 0)
        : level === 0
          ? sum(collection, "estimated_population")
          : (parentProps?.estimated_population ?? 0),
      cost:
        level === 0
          ? sum(collection, "estimated_cost")
          : (parentProps?.estimated_cost ?? 0),
    };
  }, [collection, extras, level, parentProps]);

  const detectedHere =
    collection?.features[0]?.properties.data_source === "detected" && level > 0;
  const detectedVillages = scans.reduce((s, x) => s + x.villages, 0);

  const hint =
    level === 0
      ? "Click a country to zoom in. Click any number to see how it's worked out."
      : level === 1
        ? detectedHere
          ? "Click a dot to open a scan."
          : "No scans here yet. Zoom in and use “Scan this view” to find settlements."
        : detectedHere
          ? "Click a settlement for details."
          : "Click a village for details.";

  const showTourCost = level === 2 && detectedHere && !!extras?.tour;
  // A country's own total is a national estimate, not a route. Scans show the team tour instead.
  const hideCountryCost = level === 1;
  // An unscanned country has nothing inside it to count.
  const hideCount = level === 1 && !detectedHere;
  const inScan = level === 2 && parentProps?.data_source === "detected";
  const tourSummary = extras?.tour?.summary ?? null;
  const costUsd = !inScan
    ? totals.cost
    : tourSummary
      ? tourSummary.costUsd + tourSummary.vaccinationUsd
      : null;
  const costLabel = costUsd === null ? "–" : formatCost(costUsd);
  const countLabel = detectedHere ? DETECTED_CHILD_LABEL[level] : CHILD_LABEL[level];

  const exportView: ExportView | null =
    collection && !loading
      ? {
          level,
          path: trail.map((f) => f.properties.name),
          parent: parentProps,
          parentFeature:
            trail.length && parentProps
              ? { ...trail[trail.length - 1], properties: parentProps }
              : null,
          collection,
          layer: extras,
          scans,
          summary: { population: totals.population, costUsd, count: totals.count, countLabel },
          selected,
        }
      : null;

  const panelContext: PanelContext = {
    level,
    parent: parentProps,
    collection,
    scans,
    tour: tourSummary,
  };

  const canScan =
    viewTiles !== null && viewTiles <= baselineConfig.maxScanTiles;
  const helpScanBusy = scan.status === "seeking" || scan.status === "running";

  return (
    <div className={styles.wrap} data-theme={mapTheme}>
      <div ref={containerRef} className={styles.map} />

      <aside className={styles.panel} aria-live="polite">
        <nav className={styles.crumbs} aria-label="Map level">
          <button
            onClick={() => goTo(0)}
            data-current={level === 0 || undefined}
          >
            World
          </button>
          {trail.map((f, i) => (
            <span key={f.properties.id}>
              <span aria-hidden="true">/</span>
              <button
                onClick={() => goTo(i + 1)}
                data-current={level === i + 1 || undefined}
              >
                {f.properties.name}
              </button>
            </span>
          ))}
        </nav>

        {clinicCard && !selected ? (
          <ClinicCard
            card={clinicCard}
            backLabel={parentProps?.name ?? "area"}
            open={explain}
            onToggle={toggleExplain}
            onClose={closeSelected}
          />
        ) : selected ? (
          <SettlementCard
            props={selected}
            tour={extras?.tour?.summary ?? null}
            backLabel={parentProps?.name ?? "area"}
            open={explain}
            onToggle={toggleExplain}
            onClose={closeSelected}
          />
        ) : (
          <>
            <div>
              <p className="eyebrow">{LEVEL_LABEL[level]}</p>
              <h3 className={styles.title}>
                {parentProps?.name ?? "All countries"}
              </h3>
              {level === 2 && parentProps?.lat !== undefined && parentProps.lon !== undefined && (
                <button
                  className={styles.coords}
                  aria-expanded={explain === "stat:location"}
                  onClick={() => toggleExplain("stat:location")}
                >
                  {formatLatLon(parentProps.lat, parentProps.lon)}
                </button>
              )}
              {parentProps && <SourceBadge props={parentProps} />}
            </div>
            {explain === "stat:location" && parentProps && (
              <ExplainBox explanation={explainScanLocation(parentProps)} />
            )}

            <div
              className={styles.stats}
              data-columns={3 - Number(hideCountryCost) - Number(hideCount)}
            >
              {(
                [
                  ["population", "People", formatPopulation(totals.population)],
                  ["cost", "Cost", costLabel],
                  ["count", countLabel, String(totals.count)],
                ] as const
              )
                .filter(
                  ([key]) =>
                    (key !== "cost" || !hideCountryCost) &&
                    (key !== "count" || !hideCount),
                )
                .map(([key, label, value]) => (
                <button
                  key={key}
                  className={styles.stat}
                  aria-expanded={explain === `stat:${key}`}
                  onClick={() => toggleExplain(`stat:${key}`)}
                >
                  <span className={styles.statLabel}>{label}</span>
                  <span className={styles.statValue}>{value}</span>
                </button>
              ))}
            </div>
            {(explain === "stat:population" ||
              explain === "stat:cost" ||
              explain === "stat:count") && (
              <ExplainBox
                explanation={explainStat(explain.slice(5) as StatKey, panelContext)}
              />
            )}

            {/* Inside a scan the stats above already are the detections, so no second line. */}
            {(level === 0 || (level === 1 && detectedHere)) && (
              <button
                className={styles.detected}
                aria-expanded={explain === "stat:detected"}
                onClick={() => toggleExplain("stat:detected")}
              >
                <strong>{level === 0 ? "Scanned so far" : "Found by scans"}</strong>
                {level === 0
                  ? scans.length
                    ? `${scans.length} areas · ${formatPopulation(detectedVillages)} settlements`
                    : "No scans yet"
                  : `${formatPopulation(sum(collection, "estimated_population"))} people in ${totals.count} scan areas`}
              </button>
            )}
            {explain === "stat:detected" && (
              <ExplainBox explanation={explainStat("detected", panelContext)} />
            )}

            {showTourCost && extras?.tour && (
              <button
                className={styles.detected}
                aria-expanded={explain === "stat:tour"}
                onClick={() => toggleExplain("stat:tour")}
              >
                <strong>
                  {extras.tour.summary.joined
                    ? extras.tour.summary.depotName
                      ? `${extras.tour.summary.depotName}'s tour`
                      : "Nearest clinic's tour"
                    : "Team tour"}
                </strong>
                {formatCost(extras.tour.summary.costUsd)} travel for{" "}
                {extras.tour.summary.stops} stops
                {extras.tour.summary.joined && ` · ${extras.tour.summary.joined.scanCount} scan areas`}
              </button>
            )}
            {explain === "stat:tour" && extras?.tour && (
              <ExplainBox explanation={explainTour(extras.tour.summary)} />
            )}
          </>
        )}

        {/* A clinic's panel is only about the clinic; the scan's download comes back with the scan. */}
        {!(clinicCard && !selected) && <DownloadBox view={exportView} />}

        <div className={styles.legendBox}>
          <button
            className={styles.legendToggle}
            aria-expanded={legendOpen}
            onClick={() => setLegendOpen((o) => !o)}
          >
            Map key
          </button>
          {legendOpen && (
            <div className={styles.legend}>
              {level > 0 && (
                <>
                  <span>Cost</span>
                  <div className={styles.ramp} />
                  <div className={styles.rampLabels}>
                    <span>Lower</span>
                    <span>Higher</span>
                  </div>
                </>
              )}
              <ul className={styles.key}>
                <li>
                  <i className={styles.keyDetected} /> Satellite scan
                </li>
                <li>
                  <i className={styles.keyModeled} /> Estimate only
                </li>
                {((level === 0 && scans.length > 0) || (level === 1 && detectedHere)) && (
                  <>
                    <li>
                      <i className={styles.keyScan} data-status="reached" /> Scan with clinic routes
                    </li>
                    <li>
                      <i className={styles.keyScan} data-status="noClinic" /> Settlements, no clinic nearby
                    </li>
                    <li>
                      <i className={styles.keyScan} data-status="empty" /> No settlements found
                    </li>
                  </>
                )}
                {showTour && (
                  <li>
                    <i className={styles.keyTour} /> Team tour
                  </li>
                )}
                {!showTour && extras && extras.routes.features.length > 0 && (
                  <>
                    <li>
                      <i className={styles.keyRoute} /> Road route from clinic
                    </li>
                    <li>
                      <i className={styles.keyOffroad} /> Off-road stretch
                    </li>
                    <li>
                      <i className={styles.keyClinic} /> Clinic
                    </li>
                  </>
                )}
              </ul>
            </div>
          )}
        </div>

        <p className={styles.hint}>
          {loading ? "Loading…" : hint}
          {level > 0 && !loading && <> Esc goes back.</>}
        </p>
      </aside>

      {ready && (
        <button
          type="button"
          className={styles.worldScan}
          onClick={() => void startHelpScan()}
          disabled={helpScanBusy}
          aria-busy={helpScanBusy || undefined}
        >
          <svg className={styles.worldScanMark} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="8" cy="8" r="1.5" fill="currentColor" />
            <path
              d="M8 1.4v2.1M8 12.5v2.1M1.4 8h2.1M12.5 8h2.1"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
          Help us scan the world&apos;s rural areas
        </button>
      )}

      <div className={styles.rightControls}>
        {(viewTiles !== null || scan.status !== "idle") && (
          <div className={styles.scanBox}>
            {scan.status === "seeking" ? (
              <span>
                {scan.countryName
                  ? `Opening an unscanned area in ${scan.countryName}…`
                  : "Finding an unscanned area…"}
              </span>
            ) : scan.status === "running" ? (
              <span>
                Scanning… {Math.round((now - scan.startedAt) / 1000)}s
              </span>
            ) : scan.status === "done" ? (
              <>
                <span>
                  Found {scan.scan.villages} settlements in{" "}
                  {scan.scan.countryName}.
                </span>
                <button onClick={() => openScan(scan.scan)}>
                  View results
                </button>
              </>
            ) : scan.status === "error" ? (
              <>
                <span>{scan.message}</span>
                <button onClick={() => setScan({ status: "idle" })}>
                  Dismiss
                </button>
              </>
            ) : (
              <button
                onClick={scanView}
                disabled={!canScan}
                title={canScan ? undefined : `${viewTiles} tiles in view`}
              >
                {canScan ? "Scan this view" : "Zoom in to scan"}
              </button>
            )}
          </div>
        )}

        <div className={styles.themeToggle} aria-label="Map theme selector">
          <div className={styles.themeButtons}>
            <button
              type="button"
              className={styles.themeButton}
              aria-pressed={mapTheme === "dark"}
              data-active={mapTheme === "dark" || undefined}
              onClick={() => setMapTheme("dark")}
            >
              Dark
            </button>
            <button
              type="button"
              className={styles.themeButton}
              aria-pressed={mapTheme === "light"}
              data-active={mapTheme === "light" || undefined}
              onClick={() => setMapTheme("light")}
            >
              Light
            </button>
          </div>
        </div>
      </div>

      {hover && (
        <div
          className={styles.tooltip}
          style={{ left: hover.x, top: hover.y }}
          data-flip={hover.flip || undefined}
          data-flip-y={hover.flipY || undefined}
        >
          {hover.kind === "clinic" ? (
            <>
              <span className={styles.badge}>Clinic</span>
              <strong>{hover.name}</strong>
            </>
          ) : (
            <>
              <SourceBadge props={hover.props} />
              <strong>{hover.props.name}</strong>
              <dl>
                <div>
                  <dt>Population</dt>
                  <dd>{formatPopulation(hover.props.estimated_population)}</dd>
                </div>
                {formatHoverCost(hover.props) !== null && (
                  <div>
                    <dt>Cost</dt>
                    <dd>{formatHoverCost(hover.props)}</dd>
                  </div>
                )}
              </dl>
              {hover.props.certainty !== undefined && (
                <VillageSummary props={hover.props} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SourceBadge({ props }: { props: AreaProperties }) {
  const detected = props.data_source === "detected";
  return (
    <span className={styles.badge} data-detected={detected || undefined}>
      {detected ? "Detected" : "Modeled estimate"}
    </span>
  );
}

/** Certainty, reach and clinic for a detected village, read-only (tooltip). */
function VillageSummary({ props }: { props: AreaProperties }) {
  return (
    <dl className={styles.details}>
      <div>
        <dt>Confidence</dt>
        <dd>{confidenceLevel(props)}</dd>
      </div>
      {props.reach_label && (
        <div>
          <dt>Access</dt>
          <dd>{accessLabel(props)}</dd>
        </div>
      )}
    </dl>
  );
}

/** A clicked clinic, at the top of the panel: the one tour it runs through every scan it serves. */
function ClinicCard({
  card,
  backLabel,
  open,
  onToggle,
  onClose,
}: {
  card: { id: string; name: string; tour?: ClinicTourSummary | null };
  backLabel: string;
  open: string | null;
  onToggle: (key: string) => void;
  onClose: () => void;
}) {
  const t = card.tour;
  return (
    <div className={styles.card}>
      <button className={styles.back} onClick={onClose}>
        ← {backLabel}
      </button>
      <div>
        <p className="eyebrow">Clinic</p>
        <h3 className={styles.title}>{card.name}</h3>
      </div>
      {t === undefined ? (
        <p className={styles.hint}>Loading its tour…</p>
      ) : t === null ? (
        <p className={styles.hint}>No tour starts here yet. It gets one when a scan nearby is saved.</p>
      ) : (
        <>
          <div className={styles.details}>
            {(
              [
                ["Scan areas", String(t.scanCount)],
                ["Stops", String(t.stops)],
                ["Travel", formatCost(t.costUsd)],
                ["Distance", `${((t.roadMeters + t.offroadMeters) / 1000).toFixed(1)} km`],
              ] as const
            ).map(([label, value]) => (
              <button
                key={label}
                className={styles.detailRow}
                aria-expanded={open === "clinic:tour"}
                onClick={() => onToggle("clinic:tour")}
              >
                <span>{label}</span>
                <span>{value}</span>
              </button>
            ))}
          </div>
          {open === "clinic:tour" && <ExplainBox explanation={explainClinicTour(t)} />}
        </>
      )}
    </div>
  );
}

/** The selected settlement, at the top of the panel. Every row explains itself when clicked. */
function SettlementCard({
  props,
  tour,
  backLabel,
  open,
  onToggle,
  onClose,
}: {
  props: AreaProperties;
  tour: TourSummary | null;
  backLabel: string;
  open: string | null;
  onToggle: (key: string) => void;
  onClose: () => void;
}) {
  const rows: [VillageKey, string, ReactNode][] = [
    ["population", "People", formatPopulation(props.estimated_population)],
    ["cost", "Cost", formatCost(props.estimated_cost)],
  ];
  if (props.certainty !== undefined) {
    rows.push(
      ["certainty", "Confidence", confidenceLabel(props)],
      ["reach", "Access", accessLabel(props)],
    );
    if (tour) {
      rows.push([
        "tour",
        "Tour stop",
        props.tour_stop !== undefined ? `${props.tour_stop} of ${tour.stops}` : "Not on tour",
      ]);
    }
  }
  const explainRow = (key: VillageKey) =>
    open === `village:${key}` && <ExplainBox explanation={explainVillage(key, props, tour)} />;
  return (
    <div className={styles.card}>
      <button className={styles.back} onClick={onClose}>
        ← {backLabel}
      </button>
      <div>
        <p className="eyebrow">Settlement</p>
        <h3 className={styles.title}>{props.name}</h3>
        {props.lat !== undefined && props.lon !== undefined && (
          <button
            className={styles.coords}
            aria-expanded={open === "village:location"}
            onClick={() => onToggle("village:location")}
          >
            {formatLatLon(props.lat, props.lon)}
          </button>
        )}
      </div>
      {explainRow("location")}
      <div className={styles.details}>
        {rows.map(([key, label, value]) => (
          <div key={key}>
            <button
              className={styles.detailRow}
              aria-expanded={open === `village:${key}`}
              onClick={() => onToggle(`village:${key}`)}
            >
              <span>{label}</span>
              <span>{value}</span>
            </button>
            {explainRow(key)}
          </div>
        ))}
      </div>
    </div>
  );
}

const DOWNLOAD_FORMATS: { format: ExportFormat; label: string; detail: string }[] = [
  { format: "geojson", label: "GeoJSON", detail: "Shapes & routes" },
  { format: "csv", label: "CSV", detail: "Table of costs" },
];

/** Downloads whatever the panel shows: countries, scans, settlements, or one settlement. */
function DownloadBox({ view }: { view: ExportView | null }) {
  const [saved, setSaved] = useState<ExportFormat | null>(null);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(null), 1600);
    return () => clearTimeout(timer);
  }, [saved]);

  const download = (format: ExportFormat) => {
    if (!view) return;
    downloadView(view, format);
    setSaved(format);
  };

  return (
    <div className={styles.download}>
      <div className={styles.downloadHead}>
        <span className={styles.downloadIcon} aria-hidden="true">
          <svg viewBox="0 0 16 16" width="14" height="14">
            <path
              d="M8 2v8m0 0L4.5 6.5M8 10l3.5-3.5M2.5 13.5h11"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div>
          <strong>{view?.selected ? "Download settlement" : "Download data"}</strong>
          <span>{view ? describeExport(view) : "Loading…"}</span>
        </div>
      </div>
      <div className={styles.downloadButtons}>
        {DOWNLOAD_FORMATS.map(({ format, label, detail }) => (
          <button
            key={format}
            type="button"
            className={styles.downloadButton}
            data-primary={format === "geojson" || undefined}
            data-saved={saved === format || undefined}
            disabled={!view}
            onClick={() => download(format)}
          >
            <span>{saved === format ? "Saved ✓" : label}</span>
            <small>{detail}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function ExplainBox({ explanation }: { explanation: Explanation }) {
  const ref = useRef<HTMLDivElement>(null);
  // The panel scrolls; bring a freshly opened explanation into view.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);
  return (
    <div ref={ref} className={styles.explain} role="note">
      <p>{explanation.summary}</p>
      {explanation.rows && (
        <dl>
          {explanation.rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {explanation.note && <small>{explanation.note}</small>}
    </div>
  );
}
