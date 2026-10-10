import { fillerProvider } from "./fillerProvider";
import type { MapDataProvider } from "./types";

/** Swap this for a backend-backed provider when the API is ready. */
export const dataProvider: MapDataProvider = fillerProvider;

export type * from "./types";
