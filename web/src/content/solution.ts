/**
 * Chart data and sources for the Solution page. User-facing copy lives in the locale catalogs.
 * Every outside number must point at an entry in `sources`. Numbers about our own
 * scans are recomputed from web/data/scans on each load and cite "hestia".
 */

export type SourceId = "hestia" | "nature" | "microsoft" | "esri" | "osm";

export const sources: {
  id: SourceId;
  label: string;
  detail: string;
  href: string;
}[] = [
  {
    id: "hestia",
    label: "Hestia: saved detector scans (this project)",
    detail:
      "Runs of detect-villages.js saved in web/data/scans. The scan numbers on this page are recomputed from them on every load.",
    href: "/#map",
  },
  {
    id: "nature",
    label:
      "Láng-Ritter, Keskinen & Tenkanen (2025): Global gridded population datasets systematically underrepresent rural population",
    detail: "Nature Communications 16, March 2025.",
    href: "https://www.nature.com/articles/s41467-025-56906-7",
  },
  {
    id: "microsoft",
    label: "Microsoft: Global ML Building Footprints",
    detail:
      "Building outlines traced from satellite imagery by a machine learning model. Open Database License.",
    href: "https://github.com/microsoft/GlobalMLBuildingFootprints",
  },
  {
    id: "esri",
    label: "Esri: World Imagery",
    detail:
      "One meter or better satellite and aerial imagery for most of the world's landmass. Esri, Vantor, Earthstar Geographics and the GIS User Community.",
    href: "https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9",
  },
  {
    id: "osm",
    label: "OpenStreetMap contributors: places, health facilities and roads",
    detail:
      "Queried through the Overpass API. Data © OpenStreetMap contributors, available under the Open Database License.",
    href: "https://www.openstreetmap.org/copyright",
  },
];

export const solutionFigures = {
  score: [
    { id: "buildings", points: 45 },
    { id: "shape", points: 30 },
    { id: "cover", points: 25 },
  ],
  rates: [
    { id: "motorway", value: 1.2 },
    { id: "primary", value: 1.4 },
    { id: "secondary", value: 1.6 },
    { id: "tertiary", value: 1.8 },
    { id: "unclassified", value: 2.2 },
    { id: "track", value: 4.5 },
    { id: "none", value: 8, offroad: true },
  ],
  rateMax: 8,
};
