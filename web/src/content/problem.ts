/**
 * Chart data and sources for the Problem page. User-facing copy lives in the locale catalogs.
 * Every number must point at an entry in `sources`. Don't add one that can't.
 */

export type SourceId = "nature" | "weiss";

export const sources: { id: SourceId; label: string; detail: string; href: string }[] = [
  {
    id: "nature",
    label:
      "Láng-Ritter, Keskinen & Tenkanen (2025): Global gridded population datasets systematically underrepresent rural population",
    detail: "Nature Communications 16, March 2025.",
    href: "https://www.nature.com/articles/s41467-025-56906-7",
  },
  {
    id: "weiss",
    label: "Weiss et al. (2020): Global maps of travel time to healthcare facilities",
    detail: "Nature Medicine 26, 1835–1838. Travel time to the nearest hospital or clinic, on foot and by motorized transport.",
    href: "https://www.nature.com/articles/s41591-020-1059-1",
  },
];

export const problemFigures = {
  undercount: [
    { label: "WorldPop", value: 53 },
    { label: "GWP", value: 65 },
    { label: "GRUMP", value: 67 },
    { label: "LandScan", value: 68 },
    { label: "GHS-POP", value: 84 },
  ],
  travel: { byCar: 8.9, onFoot: 43.3 },
  route: {
    shortest: { km: 18, rate: 4.5 },
    cheapest: { km: 26, rate: 1.4 },
  },
};
