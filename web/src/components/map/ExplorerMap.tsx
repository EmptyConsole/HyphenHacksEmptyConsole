"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, LngLatBoundsLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { area as turfArea, bbox, featureCollection, pointOnFeature } from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import { dataProvider, type AreaCollection, type AreaFeature, type AreaProperties } from "@/data";
import { tokens } from "@/design/tokens";
import { formatCost, formatPopulation } from "@/lib/format";
import { baseStyle, intensityColor } from "./mapStyle";
import styles from "./ExplorerMap.module.css";

// Turbopack rewrites import.meta.url, so MapLibre can't find its worker on its own.
// `npm run dev`/`build` copy it into public/vendor (see package.json).
maplibregl.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");

const WORLD_VIEW = { center: [18, 12] as [number, number], zoom: 1.9 };
const EMPTY = featureCollection([]);
const LEVEL_LABEL = ["World", "Country", "Region"] as const;
const CHILD_LABEL = ["countries", "regions", "villages"] as const;

type Hover = { x: number; y: number; flip: boolean; props: AreaProperties } | null;

/** Adds a 0–1 rank-based `intensity` so colors spread evenly at every zoom level. */
function withIntensity(fc: AreaCollection) {
  const ranked = [...fc.features].sort((a, b) => a.properties.estimated_cost - b.properties.estimated_cost);
  const rank = new Map(ranked.map((f, i) => [f.properties.id, ranked.length > 1 ? i / (ranked.length - 1) : 1]));
  return featureCollection(
    fc.features.map((f) => ({ ...f, properties: { ...f.properties, intensity: rank.get(f.properties.id) } })),
  );
}

/** Bounds to fit; for shapes spanning the antimeridian, use the largest part instead. */
function boundsOf(feature: AreaFeature): LngLatBoundsLike {
  let [minX, minY, maxX, maxY] = bbox(feature);
  if (maxX - minX > 180 && feature.geometry.type === "MultiPolygon") {
    const parts = feature.geometry.coordinates.map(
      (coordinates): Feature<Polygon> => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates } }),
    );
    const largest = parts.reduce((a, b) => (turfArea(b) > turfArea(a) ? b : a));
    [minX, minY, maxX, maxY] = bbox(largest);
  }
  return [minX, minY, maxX, maxY];
}

export default function ExplorerMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const collectionRef = useRef<AreaCollection | null>(null);
  const hoverIdRef = useRef<string | null>(null);

  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [trail, setTrail] = useState<AreaFeature[]>([]); // [country?, region?]
  const [collection, setCollection] = useState<AreaCollection | null>(null);
  const [selected, setSelected] = useState<AreaProperties | null>(null);
  const [hover, setHover] = useState<Hover>(null);

  const level = trail.length;
  const trailRef = useRef(trail);
  useEffect(() => {
    trailRef.current = trail;
  }, [trail]);

  const drillInto = useCallback((feature: AreaFeature) => {
    setHover(null);
    setSelected(null);
    if (trailRef.current.length < 2) setTrail((t) => [...t, feature]);
    else setSelected(feature.properties);
  }, []);

  const goTo = useCallback((depth: number) => {
    setSelected(null);
    setTrail((t) => t.slice(0, depth));
  }, []);

  // ---- Map setup (once) ----
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: baseStyle,
      center: WORLD_VIEW.center,
      zoom: WORLD_VIEW.zoom,
      minZoom: 1,
      maxZoom: 14,
      cooperativeGestures: true,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      map.addSource("context", { type: "geojson", data: EMPTY });
      map.addSource("areas", { type: "geojson", data: EMPTY, promoteId: "id" });
      map.addSource("dots", { type: "geojson", data: EMPTY });

      map.addLayer({
        id: "areas-fill",
        type: "fill",
        source: "areas",
        paint: {
          "fill-color": intensityColor,
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false], 0.85,
            ["boolean", ["feature-state", "selected"], false], 0.85,
            0.5,
          ],
          "fill-opacity-transition": { duration: 150 },
        },
      });
      map.addLayer({
        id: "areas-line",
        type: "line",
        source: "areas",
        paint: {
          "line-color": [
            "case",
            ["boolean", ["feature-state", "hover"], false], tokens.color.accent,
            ["boolean", ["feature-state", "selected"], false], tokens.color.accent,
            "rgba(255,255,255,0.28)",
          ],
          "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2, 0.6],
        },
      });
      map.addLayer({
        id: "context-line",
        type: "line",
        source: "context",
        paint: { "line-color": tokens.color.constellation, "line-width": 1.5 },
      });
      map.addLayer({
        id: "dots-halo",
        type: "circle",
        source: "dots",
        paint: { "circle-radius": 9, "circle-color": tokens.color.accent, "circle-opacity": 0.18, "circle-blur": 1 },
      });
      map.addLayer({
        id: "dots-core",
        type: "circle",
        source: "dots",
        paint: { "circle-radius": 2.5, "circle-color": tokens.color.accent },
      });

      const setHoverState = (id: string | null) => {
        if (hoverIdRef.current) map.setFeatureState({ source: "areas", id: hoverIdRef.current }, { hover: false });
        hoverIdRef.current = id;
        if (id) map.setFeatureState({ source: "areas", id }, { hover: true });
      };

      map.on("mousemove", "areas-fill", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        map.getCanvas().style.cursor = "pointer";
        setHoverState(String(f.id));
        const flip = e.point.x > map.getContainer().clientWidth - 240;
        setHover({ x: e.point.x, y: e.point.y, flip, props: f.properties as AreaProperties });
      });
      map.on("mouseleave", "areas-fill", () => {
        map.getCanvas().style.cursor = "";
        setHoverState(null);
        setHover(null);
      });
      map.on("click", "areas-fill", (e) => {
        // Rendered features are tile-clipped; look up the full original geometry.
        const id = String(e.features?.[0]?.id);
        const feature = collectionRef.current?.features.find((f) => f.properties.id === id);
        if (feature) drillInto(feature);
      });

      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [drillInto]);

  // ---- Load data for the current level and move the camera ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    let cancelled = false;
    const parent = trail[trail.length - 1];

    (async () => {
      setLoading(true);
      // Let the loading state paint before (possibly heavy) polygon generation.
      await new Promise((r) => setTimeout(r, 30));
      const fc =
        level === 0
          ? await dataProvider.getCountries()
          : level === 1
            ? await dataProvider.getRegions(trail[0])
            : (await dataProvider.getVillages(trail[1])).areas;
      if (cancelled) return;

      hoverIdRef.current = null;
      collectionRef.current = fc;
      setCollection(fc);
      (map.getSource("areas") as GeoJSONSource).setData(withIntensity(fc));
      (map.getSource("context") as GeoJSONSource).setData(parent ? featureCollection([parent]) : EMPTY);
      (map.getSource("dots") as GeoJSONSource).setData(
        level === 2 ? featureCollection(fc.features.map((f) => pointOnFeature(f))) : EMPTY,
      );

      const wide = map.getContainer().clientWidth > 760;
      const padding = wide ? { top: 60, bottom: 60, left: 360, right: 60 } : { top: 200, bottom: 30, left: 30, right: 30 };
      if (parent) map.fitBounds(boundsOf(parent), { padding, duration: 1600, maxZoom: 12 });
      else map.flyTo({ ...WORLD_VIEW, duration: 1600 });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, trail, level]);

  // ---- Selected village highlight ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !selected) return;
    map.setFeatureState({ source: "areas", id: selected.id }, { selected: true });
    return () => {
      if (map.getSource("areas")) map.setFeatureState({ source: "areas", id: selected.id }, { selected: false });
    };
  }, [ready, selected]);

  // ---- Escape goes up a level ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && trailRef.current.length > 0) goTo(trailRef.current.length - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo]);

  const totals = useMemo(() => {
    const features = collection?.features ?? [];
    return {
      count: features.length,
      population: features.reduce((s, f) => s + f.properties.estimated_population, 0),
      cost: features.reduce((s, f) => s + f.properties.estimated_cost, 0),
    };
  }, [collection]);

  const hint =
    level === 0
      ? "Hover a country for estimates. Click to zoom in."
      : level === 1
        ? "Click a region to see its villages."
        : "Click a village for details.";

  return (
    <div className={styles.wrap}>
      <div ref={containerRef} className={styles.map} />

      <aside className={styles.panel} aria-live="polite">
        <nav className={styles.crumbs} aria-label="Map level">
          <button onClick={() => goTo(0)} data-current={level === 0 || undefined}>
            World
          </button>
          {trail.map((f, i) => (
            <span key={f.properties.id}>
              <span aria-hidden="true">/</span>
              <button onClick={() => goTo(i + 1)} data-current={level === i + 1 || undefined}>
                {f.properties.name}
              </button>
            </span>
          ))}
        </nav>

        <div>
          <p className="eyebrow">{LEVEL_LABEL[level]}</p>
          <h3 className={styles.title}>{trail[level - 1]?.properties.name ?? "All countries"}</h3>
        </div>

        <dl className={styles.stats}>
          <div>
            <dt>Est. population</dt>
            <dd>{formatPopulation(totals.population)}</dd>
          </div>
          <div>
            <dt>Est. cost</dt>
            <dd>{formatCost(totals.cost)}</dd>
          </div>
          <div>
            <dt>{CHILD_LABEL[level]}</dt>
            <dd>{totals.count}</dd>
          </div>
        </dl>

        {selected && (
          <div className={styles.selected}>
            <p className="eyebrow">Selected</p>
            <strong>{selected.name}</strong>
            <span>
              {formatPopulation(selected.estimated_population)} people · {formatCost(selected.estimated_cost)}
            </span>
          </div>
        )}

        <div className={styles.legend}>
          <span>Est. cost</span>
          <div className={styles.ramp} />
          <div className={styles.rampLabels}>
            <span>Lower</span>
            <span>Higher</span>
          </div>
        </div>

        <p className={styles.hint}>
          {loading ? "Loading…" : hint}
          {level > 0 && !loading && <> Press Esc to go back.</>}
        </p>
      </aside>

      {hover && (
        <div
          className={styles.tooltip}
          style={{ left: hover.x, top: hover.y }}
          data-flip={hover.flip || undefined}
        >
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
        </div>
      )}
    </div>
  );
}
