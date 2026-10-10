"use client";

import { useEffect, useRef } from "react";
import { tokens } from "@/design/tokens";
import { mulberry32 } from "@/lib/rng";

/** Hubs the decorative "constellation" arcs fan out from. Purely visual. */
const HUBS = [
  { lat: 9.06, lng: 7.49 }, // Abuja
  { lat: 12.0, lng: 8.52 }, // Kano
  { lat: -1.29, lng: 36.82 }, // Nairobi
  { lat: 9.03, lng: 38.74 }, // Addis Ababa
  { lat: 23.81, lng: 90.41 }, // Dhaka
  { lat: 25.6, lng: 85.14 }, // Patna
  { lat: 34.53, lng: 69.17 }, // Kabul
  { lat: -15.79, lng: -47.88 }, // Brasília
  { lat: 14.63, lng: -90.51 }, // Guatemala City
  { lat: -6.79, lng: 39.21 }, // Dar es Salaam
];

function buildArcs() {
  const rand = mulberry32(7);
  return HUBS.flatMap((hub) =>
    Array.from({ length: 4 }, () => ({
      startLat: hub.lat,
      startLng: hub.lng,
      endLat: hub.lat + (rand() - 0.5) * 9,
      endLng: hub.lng + (rand() - 0.5) * 9,
      delay: rand() * 4000,
    })),
  );
}

export default function HeroGlobe() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let disposed = false;
    let cleanup = () => {};

    import("globe.gl").then(({ default: Globe }) => {
      if (disposed) return;

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const arcs = buildArcs();

      const globe = new Globe(el, { animateIn: true })
        .width(el.clientWidth)
        .height(el.clientHeight)
        .backgroundColor("rgba(0,0,0,0)")
        .globeImageUrl("/textures/earth-night.jpg")
        .bumpImageUrl("/textures/earth-topology.png")
        .showAtmosphere(true)
        .atmosphereColor(tokens.color.constellation)
        .atmosphereAltitude(0.18)
        .arcsData(arcs)
        .arcColor(() => [`${tokens.color.accent}00`, tokens.color.accent, `${tokens.color.accent}00`])
        .arcAltitudeAutoScale(0.35)
        .arcStroke(0.35)
        .arcDashLength(0.5)
        .arcDashGap(1.5)
        .arcDashInitialGap((d) => (d as { delay: number }).delay / 1000)
        .arcDashAnimateTime(reducedMotion ? 0 : 3200)
        .pointsData(HUBS)
        .pointColor(() => tokens.color.accent)
        .pointAltitude(0.005)
        .pointRadius(0.35)
        .pointOfView({ lat: 12, lng: 20, altitude: 2.1 });

      const controls = globe.controls();
      controls.enableZoom = false;
      controls.enablePan = false;
      controls.enableRotate = false;
      controls.autoRotate = !reducedMotion;
      controls.autoRotateSpeed = 0.45;

      const onResize = () => globe.width(el.clientWidth).height(el.clientHeight);
      window.addEventListener("resize", onResize);

      cleanup = () => {
        window.removeEventListener("resize", onResize);
        globe._destructor();
        el.replaceChildren();
      };
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} aria-hidden="true" />;
}
