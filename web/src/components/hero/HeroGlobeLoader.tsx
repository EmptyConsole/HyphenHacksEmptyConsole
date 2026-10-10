"use client";

import dynamic from "next/dynamic";

// globe.gl touches `window` on import, so it must never render on the server.
const HeroGlobe = dynamic(() => import("./HeroGlobe"), { ssr: false });

export default function HeroGlobeLoader() {
  return <HeroGlobe />;
}
