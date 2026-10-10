"use client";

import dynamic from "next/dynamic";

// MapLibre needs `window`/WebGL, so render it client-side only.
const ExplorerMap = dynamic(() => import("./ExplorerMap"), { ssr: false });

export default function ExplorerMapLoader() {
  return <ExplorerMap />;
}
