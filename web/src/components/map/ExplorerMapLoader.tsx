"use client";

import dynamic from "next/dynamic";
import { MapMoneyProvider } from "./MapMoney";

// MapLibre needs `window`/WebGL, so render it client-side only.
const ExplorerMap = dynamic(() => import("./ExplorerMap"), { ssr: false });

export default function ExplorerMapLoader() {
  return (
    <MapMoneyProvider>
      <ExplorerMap />
    </MapMoneyProvider>
  );
}
