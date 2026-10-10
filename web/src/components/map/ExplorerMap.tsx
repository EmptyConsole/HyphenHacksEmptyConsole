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
  type ScanMeta,
  type VillageLayer,
} from "@/data";
import { baselineConfig } from "@/data/baselineConfig";
import { tokens } from "@/design/tokens";
import { formatCost, formatPopulation } from "@/lib/format";
import { tileCount } from "@/lib/tiles";
import { getBaseStyle, intensityColor, type MapTheme } from "./mapStyle";
import styles from "./ExplorerMap.module.css";
import {
  explainStat,
  explainVillage,
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
const CHILD_LABEL = ["countries", "regions", "villages"] as const;
/** The scan button appears from this zoom; below it the view is far too big to scan. */
const SCAN_MIN_ZOOM = 8;

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
            halo: 14,
            core: 3.5,
          },
        ),
      ),
    );
  }
  if (level === 1 && fc.features[0]?.properties.data_source !== "detected")
    return EMPTY;
  const size = level === 1 ? { halo: 16, core: 4.5 } : {};
  return featureCollection(
    fc.features.map((f) => ({
      ...pointOnFeature(f),
      properties: { areaId: f.properties.id, ...size },
    })),
  );
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

  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [trail, setTrail] = useState<AreaFeature[]>([]); // [country?, region?]
  const [collection, setCollection] = useState<AreaCollection | null>(null);
  const [extras, setExtras] = useState<Omit<VillageLayer, "areas"> | null>(
    null,
  );
  const [parentProps, setParentProps] = useState<AreaProperties | null>(null);
  const [selected, setSelected] = useState<AreaProperties | null>(null);
  const [hover, setHover] = useState<Hover>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [scans, setScans] = useState<ScanMeta[]>([]);
  const [viewTiles, setViewTiles] = useState<number | null>(null);
  const [scan, setScan] = useState<ScanState>({ status: "idle" });
  const [now, setNow] = useState(() => Date.now());
  const [mapTheme, setMapTheme] = useState<MapTheme>("dark");

  /** Which number's explanation is open, e.g. "stat:cost" or "village:reach". */
  const [explain, setExplain] = useState<string | null>(null);
  const toggleExplain = useCallback(
    (key: string) => setExplain((k) => (k === key ? null : key)),
    [],
  );

  const syncMapTheme = useCallback((theme: MapTheme) => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const dark = theme === "dark";
    map.setPaintProperty("osm", "raster-brightness-min", dark ? 0.92 : 0);
    map.setPaintProperty("osm", "raster-brightness-max", dark ? 0.04 : 1);
    map.setPaintProperty("osm", "raster-hue-rotate", dark ? 180 : 0);
    map.setPaintProperty("osm", "raster-saturation", dark ? -0.55 : 0);
    map.setPaintProperty("osm", "raster-contrast", dark ? 0.1 : 0);
  }, []);

  const level = trail.length;
  const trailRef = useRef(trail);
  useEffect(() => {
    trailRef.current = trail;
  }, [trail]);

  const drillInto = useCallback((feature: AreaFeature) => {
    setHover(null);
    setExplain(null);
    if (trailRef.current.length < 2) {
      setSelected(null);
      setTrail((t) => [...t, feature]);
    } else setSelected(feature.properties);
  }, []);

  const goTo = useCallback((depth: number) => {
    setSelected(null);
    setExplain(null);
    setTrail((t) => t.slice(0, depth));
  }, []);

  // ---- Map setup (once) ----
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: getBaseStyle(mapTheme),
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
      map.addSource("areas", { type: "geojson", data: EMPTY, promoteId: "id" });
      map.addSource("dots", { type: "geojson", data: EMPTY });
      map.addSource("routes", { type: "geojson", data: EMPTY });
      map.addSource("clinics", { type: "geojson", data: EMPTY });

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

      map.addLayer({
        id: "areas-fill",
        type: "fill",
        source: "areas",
        paint: {
          "fill-color": intensityColor,
          "fill-opacity": ["case", hovered, 0.85, isSelected, 0.85, 0.5],
          "fill-opacity-transition": { duration: 150 },
        },
      });
      map.addLayer({
        id: "areas-line",
        type: "line",
        source: "areas",
        paint: {
          // Detected areas get a solid constellation outline; modeled ones a faint one.
          "line-color": [
            "case",
            hovered,
            tokens.color.accent,
            isSelected,
            tokens.color.accent,
            detected,
            tokens.color.constellation,
            "rgba(255,255,255,0.28)",
          ],
          "line-width": ["case", hovered, 2, detected, 1.6, 0.6],
        },
      });
      map.addLayer({
        id: "context-line",
        type: "line",
        source: "context",
        paint: { "line-color": tokens.color.constellation, "line-width": 1.5 },
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
      map.addLayer({
        id: "dots-halo",
        type: "circle",
        source: "dots",
        // Larger on the world and country views, where a marker is the only sign of a ~4 km scan.
        paint: {
          "circle-radius": ["coalesce", ["get", "halo"], 9],
          "circle-color": tokens.color.accent,
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
          "circle-color": tokens.color.accent,
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
      map.on("mousemove", "dots-hit", (e) =>
        hoverArea(e, e.features?.[0]?.properties.areaId),
      );
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

      // Rendered features are tile-clipped; always drill into the full original geometry.
      map.on("click", "areas-fill", (e) => {
        const feature = findArea(e.features?.[0]?.id);
        if (feature) drillInto(feature);
      });
      map.on("click", "dots-hit", (e) => {
        const feature = findArea(e.features?.[0]?.properties.areaId);
        if (feature) drillInto(feature);
      });

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
    if (!ready || !map) return;
    let cancelled = false;
    const parent = trail[trail.length - 1];

    (async () => {
      setLoading(true);
      // Let the loading state paint before (possibly heavy) polygon generation.
      await new Promise((r) => setTimeout(r, 30));
      let fc: AreaCollection;
      let layer: Omit<VillageLayer, "areas"> | null = null;
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
          layer = { routes: villages.routes, clinics: villages.clinics };
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

      const currentScans = dataProvider.getScans();
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
      (map.getSource("dots") as GeoJSONSource).setData(
        markerPoints(level, fc, currentScans),
      );
      (map.getSource("routes") as GeoJSONSource).setData(
        layer?.routes ?? EMPTY,
      );
      (map.getSource("clinics") as GeoJSONSource).setData(
        layer?.clinics ?? EMPTY,
      );

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
        if (parent)
          map.fitBounds(boundsOf(parent), { padding, duration: 1600, maxZoom });
        else map.flyTo({ ...WORLD_VIEW, duration: 1600 });
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, trail, level, dataVersion]);

  // ---- Selected village highlight and its route ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
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
      if (e.key === "Escape" && trailRef.current.length > 0)
        goTo(trailRef.current.length - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo]);

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
      setScan({ status: "error", message: (error as Error).message });
    }
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
    setScan({ status: "idle" });
    setTrail(region ? [country, region] : [country]);
  }, []);

  const totals = useMemo(
    () => ({
      count: collection?.features.length ?? 0,
      population:
        level === 0
          ? sum(collection, "estimated_population")
          : (parentProps?.estimated_population ?? 0),
      cost:
        level === 0
          ? sum(collection, "estimated_cost")
          : (parentProps?.estimated_cost ?? 0),
    }),
    [collection, level, parentProps],
  );

  const detectedHere =
    collection?.features[0]?.properties.data_source === "detected" && level > 0;
  const detectedCountries = new Set(scans.map((s) => s.countryId)).size;
  const detectedVillages = scans.reduce((s, x) => s + x.villages, 0);
  const osmConfirmed =
    detectedHere && level === 2
      ? collection!.features.filter((f) => f.properties.detection === "osm")
          .length
      : 0;

  const hint =
    level === 0
      ? "Hover a country for estimates. Gold dots are real scans. Click any number to see how it was worked out."
      : level === 1
        ? detectedHere
          ? "Each box is a satellite scan. Click one to see what it found."
          : "Click a region to see its villages."
        : detectedHere
          ? "Click a settlement for its route and certainty. Click any number to see how it was worked out."
          : "Click a village for details.";

  const panelContext: PanelContext = {
    level,
    parent: parentProps,
    collection,
    scans,
  };

  const canScan =
    viewTiles !== null && viewTiles <= baselineConfig.maxScanTiles;

  return (
    <div className={styles.wrap}>
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

        <div>
          <p className="eyebrow">{LEVEL_LABEL[level]}</p>
          <h3 className={styles.title}>
            {parentProps?.name ?? "All countries"}
          </h3>
          {parentProps && <SourceBadge props={parentProps} />}
        </div>

        <div className={styles.stats}>
          {(
            [
              [
                "population",
                "Est. population",
                formatPopulation(totals.population),
              ],
              ["cost", "Est. cost", formatCost(totals.cost)],
              ["count", CHILD_LABEL[level], String(totals.count)],
            ] as const
          ).map(([key, label, value]) => (
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
        {explain?.startsWith("stat:") && explain !== "stat:detected" && (
          <ExplainBox
            explanation={explainStat(explain.slice(5) as StatKey, panelContext)}
          />
        )}

        {(level === 0 || detectedHere) && (
          <button
            className={styles.detected}
            aria-expanded={explain === "stat:detected"}
            onClick={() => toggleExplain("stat:detected")}
          >
            {level === 0 ? (
              <>
                <strong>Real detections</strong>
                {scans.length
                  ? `${detectedCountries} countries · ${scans.length} scan areas · ${detectedVillages} settlements`
                  : "No scans yet. Totals use the World Bank baseline."}
              </>
            ) : (
              <>
                <strong>Detected here</strong>
                {formatPopulation(sum(collection, "estimated_population"))}{" "}
                people · {formatCost(sum(collection, "estimated_cost"))}
                {level === 2 &&
                  ` · ${osmConfirmed} of ${totals.count} confirmed by OSM`}
              </>
            )}
          </button>
        )}
        {explain === "stat:detected" && (
          <ExplainBox explanation={explainStat("detected", panelContext)} />
        )}

        {selected && (
          <div className={styles.selected}>
            <p className="eyebrow">Selected</p>
            <strong>{selected.name}</strong>
            <VillageDetails
              props={selected}
              open={explain}
              onToggle={toggleExplain}
            />
          </div>
        )}

        <div className={styles.legend}>
          <span>Est. cost</span>
          <div className={styles.ramp} />
          <div className={styles.rampLabels}>
            <span>Lower</span>
            <span>Higher</span>
          </div>
          <ul className={styles.key}>
            <li>
              <i className={styles.keyDetected} /> Detected by satellite scan
            </li>
            <li>
              <i className={styles.keyModeled} /> Modeled estimate
            </li>
            {extras && extras.routes.features.length > 0 && (
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

        <p className={styles.hint}>
          {loading ? "Loading…" : hint}
          {level > 0 && !loading && <> Press Esc to go back.</>}
        </p>
      </aside>

      <div className={styles.rightControls}>
        {(viewTiles !== null || scan.status !== "idle") && (
          <div className={styles.scanBox}>
            {scan.status === "running" ? (
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
                <div>
                  <dt>Cost</dt>
                  <dd>{formatCost(hover.props.estimated_cost)}</dd>
                </div>
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
        <dt>Certainty</dt>
        <dd>
          {props.certainty}
          <small>
            {props.detection === "osm"
              ? " · OSM confirmed"
              : " · satellite only"}
          </small>
        </dd>
      </div>
      {props.reach_label && (
        <div>
          <dt>Reach</dt>
          <dd>
            {props.reach_label} · {formatCost(props.reach_cost ?? 0)}
          </dd>
        </div>
      )}
      <div>
        <dt>Clinic</dt>
        <dd>{props.clinic_name ?? "none in range"}</dd>
      </div>
    </dl>
  );
}

/** Every number for the selected village; each row opens an explanation of itself. */
function VillageDetails({
  props,
  open,
  onToggle,
}: {
  props: AreaProperties;
  open: string | null;
  onToggle: (key: string) => void;
}) {
  const rows: [VillageKey, string, ReactNode][] = [
    ["population", "Population", formatPopulation(props.estimated_population)],
    ["cost", "Cost", formatCost(props.estimated_cost)],
  ];
  if (props.certainty !== undefined) {
    rows.push(
      [
        "certainty",
        "Certainty",
        <>
          {props.certainty}
          <small>
            {props.detection === "osm"
              ? " · OSM confirmed"
              : " · satellite only"}
          </small>
        </>,
      ],
      [
        "reach",
        "Reach",
        props.reach_label
          ? `${props.reach_label} · ${props.reach_difficulty}/100`
          : "–",
      ],
      ["clinic", "Clinic", props.clinic_name ?? "none in range"],
    );
  }
  return (
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
          {open === `village:${key}` && (
            <ExplainBox explanation={explainVillage(key, props)} />
          )}
        </div>
      ))}
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
