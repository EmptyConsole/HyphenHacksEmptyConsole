import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";
import type { StyleSpecification } from "maplibre-gl";
import { tokens } from "@/design/tokens";

/**
 * OpenStreetMap raster tiles. Mind the OSM tile usage policy for production
 * (https://operations.osmfoundation.org/policies/tiles/) — swap this URL for a
 * self-hosted or commercial OSM tile server when traffic grows.
 */
export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const baseStyle: StyleSpecification = {
  version: 8,
  projection: { type: "globe" },
  sky: {
    "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.35, 5, 0.35, 7, 0],
  },
  sources: {
    osm: {
      type: "raster",
      tiles: [OSM_TILE_URL],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": tokens.color.bg } },
    {
      id: "osm",
      type: "raster",
      source: "osm",
      // min > max inverts the light OSM tiles into a dark basemap; hue-rotate restores water/land hues.
      paint: {
        "raster-brightness-min": 0.92,
        "raster-brightness-max": 0.04,
        "raster-hue-rotate": 180,
        "raster-saturation": -0.55,
        "raster-contrast": 0.1,
      },
    },
  ],
};

/** fill-color expression mapping the 0–1 `intensity` property onto the data ramp. */
export const intensityColor: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["get", "intensity"],
  ...tokens.data.flatMap((color, i) => [i / (tokens.data.length - 1), color]),
];
