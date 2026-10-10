import { hestiaProvider } from "./hestiaProvider";
import type { MapDataProvider } from "./types";

/** Scans from detect-villages.js where they exist, World Bank baseline + filler elsewhere. */
export const dataProvider: MapDataProvider = hestiaProvider;

export type * from "./types";
