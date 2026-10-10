/**
 * Copy, chart data and sources for the Problem page. Edit the strings here.
 * Every number must point at an entry in `sources` — don't add one that can't.
 */

export type SourceId = "worldBank" | "ilo" | "nature" | "wuenic";

export const sources: { id: SourceId; label: string; detail: string; href: string }[] = [
  {
    id: "worldBank",
    label: "World Bank — Rural population & urban population (World Development Indicators)",
    detail: "Indicators SP.RUR.TOTL, SP.RUR.TOTL.ZS and SP.URB.TOTL, 1960–2025.",
    href: "https://data.worldbank.org/indicator/SP.RUR.TOTL",
  },
  {
    id: "ilo",
    label:
      "International Labour Organization (2015) — Global evidence on inequities in rural health protection",
    detail: "New data on rural deficits in health coverage for 174 countries. Ed. X. Scheil-Adlung, ESS Document No. 47.",
    href: "https://www.ilo.org/sites/default/files/wcmsp5/groups/public/@ed_protect/@soc_sec/documents/publication/wcms_383890.pdf",
  },
  {
    id: "nature",
    label:
      "Láng-Ritter, Keskinen & Tenkanen (2025) — Global gridded population datasets systematically underrepresent rural population",
    detail: "Nature Communications 16, March 2025.",
    href: "https://www.nature.com/articles/s41467-025-56906-7",
  },
  {
    id: "wuenic",
    label: "WHO & UNICEF (July 2026) — Estimates of National Immunization Coverage, 2025",
    detail: "Press release and the accompanying “Progress and challenges” report.",
    href: "https://www.who.int/news/item/15-07-2026-global-childhood-immunization-coverage-inches-forward-despite-conflict-and-hesitancy---unicef--who",
  },
];

export const problemContent = {
  eyebrow: "The problem",
  title: "Problem",
  subtitle:
    "Billions of people live far from cities, and far from care. Many of them are also missing from the maps that health services are planned from.",

  stats: [
    {
      value: "3.46 billion",
      label: "people live in rural areas — 42% of everyone on Earth.",
      source: "worldBank",
    },
    {
      value: "1.9 billion",
      label: "of them have no health coverage — no health system or insurance scheme they belong to.",
      note: "56% of the rural population (ILO) × 3.46 billion.",
      source: "ilo",
    },
    {
      value: "About half",
      label: "of rural residents were missing from even the most accurate global population map.",
      note: "Study of 307 rural areas in 35 countries, 1975–2010.",
      source: "nature",
    },
    {
      value: "13.5 million",
      label: "babies didn't get a single vaccine in their first year of life in 2025.",
      source: "wuenic",
    },
  ] satisfies { value: string; label: string; note?: string; source: SourceId }[],

  rural: {
    eyebrow: "01 · Rural world",
    title: "More people live in the countryside today than ever recorded.",
    body: [
      "Cities get the attention, but the rural population has kept growing: from 2.0 billion people in 1960 to 3.46 billion in 2025. Cities just grew faster, passing the countryside in 2007.",
      "Rural life is most common where money is tightest. In low-income countries, nearly two out of three people live in rural areas.",
    ],
    trendCaption: "World population by where people live, 1960–2025 (billions)",
    crossoverYear: 2007,
    trend: [
      { year: 1960, rural: 1.99, urban: 1.03 },
      { year: 1965, rural: 2.15, urban: 1.17 },
      { year: 1970, rural: 2.34, urban: 1.34 },
      { year: 1975, rural: 2.53, urban: 1.53 },
      { year: 1980, rural: 2.69, urban: 1.75 },
      { year: 1985, rural: 2.84, urban: 2.01 },
      { year: 1990, rural: 3.03, urban: 2.27 },
      { year: 1995, rural: 3.19, urban: 2.54 },
      { year: 2000, rural: 3.28, urban: 2.89 },
      { year: 2005, rural: 3.33, urban: 3.25 },
      { year: 2010, rural: 3.38, urban: 3.62 },
      { year: 2015, rural: 3.39, urban: 4.05 },
      { year: 2020, rural: 3.42, urban: 4.43 },
      { year: 2025, rural: 3.46, urban: 4.75 },
    ],
    shareCaption: "Share of people living in rural areas, by country income group (2025)",
    share: [
      { label: "Low income", value: 65 },
      { label: "Lower-middle income", value: 58 },
      { label: "World", value: 42 },
      { label: "Upper-middle income", value: 32 },
      { label: "High income", value: 20 },
    ],
    source: "worldBank" as SourceId,
    scan: "Country totals hide the villages. Help us scan a region.",
  },

  health: {
    eyebrow: "02 · The health gap",
    title: "Rural people are 2.5× as likely to have no health coverage.",
    body: [
      "The ILO compared rural and urban health care in 174 countries. On every measure, people in the countryside came out behind.",
    ],
    compareCaption: "Rural vs. urban, worldwide (ILO estimates, published 2015)",
    compare: [
      { label: "Have no health coverage", rural: 56, urban: 22, unit: "%", max: 100 },
      {
        label: "Can't get care because there aren't enough health workers",
        rural: 52,
        urban: 24,
        unit: "%",
        max: 100,
      },
      { label: "Mothers who die per 10,000 births", rural: 29, urban: 11, unit: "", max: 40 },
    ],
    workers: {
      title: "Where the health workers are",
      people: { value: 50, label: "of the world's people lived in rural areas" },
      staff: { value: 23, label: "of its health workers worked there" },
      shortfall:
        "Of the 10.3 million health workers the world is short of, about 7 million are needed in rural areas.",
    },
    source: "ilo" as SourceId,
    scan: "The gap is in the countryside. Help us scan a region.",
  },

  invisible: {
    eyebrow: "03 · Invisible on the map",
    title: "You can't plan for people you can't see.",
    body: [
      "Governments and aid groups use census counts and population maps to decide where clinics go, how many vaccines to send, and which villages outreach teams visit.",
      "A 2025 study checked five of the most widely used global population maps against independent headcounts from 307 rural areas. Every one of them under-counted rural people — the best by about half.",
    ],
    undercountCaption: "How much each population map under-counted rural residents, on average (1975–2010)",
    undercount: [
      { label: "WorldPop", value: 53 },
      { label: "GWP", value: 65 },
      { label: "GRUMP", value: 67 },
      { label: "LandScan", value: 68 },
      { label: "GHS-POP", value: 84 },
    ],
    takeaway:
      "When people are missing from the data, they can be missing from the plan. The study's authors warn that past health-access studies built on these maps may have led planners to provide too few health services in rural areas.",
    caveat:
      "The study could only check maps up to 2010. Newer maps may be better, but the authors say there is strong reason to believe they still miss rural people.",
    source: "nature" as SourceId,
    scan: "Still missing from the map? Help us scan a region.",
  },

  vaccines: {
    eyebrow: "04 · Vaccines",
    title: "The children no vaccine reaches.",
    body: [
      "Health workers call them “zero-dose” children: babies who never receive a single routine vaccine. In 2025 there were 13.5 million of them — still more than in 2019.",
    ],
    facts: [
      { value: "13.5M", label: "zero-dose children in 2025" },
      { value: "54%", label: "of them live in fragile or conflict-affected countries" },
      { value: "#1", label: "Nigeria has more zero-dose children than any other country" },
    ],
    source: "wuenic" as SourceId,
    scan: "Zero-dose children live somewhere. Help us scan a region.",
  },

  closing: {
    title: "Reaching them starts with knowing where they are.",
    body: "Hestia looks for settlements that satellites can see but maps don't show, then plots a route from the nearest clinic so health teams can get there.",
    primaryCta: { label: "Explore the map", href: "/#map" },
    secondaryCta: { label: "See the algorithm", href: "/algorithm" },
    scan: "Reaching them starts with a place on the map. Help us scan a region.",
  },
};
