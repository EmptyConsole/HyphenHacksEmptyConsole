/**
 * Copy, chart data and sources for the Problem page. Edit the strings here.
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

type Paragraph = { text: string; cite?: SourceId[] };

export const problemContent = {
  eyebrow: "The problem",
  title: "Problem",
  subtitle:
    "Globally, 1.9 billion people have no access to healthcare just because they live in rural regions of their country.",

  stats: [
    {
      value: "3.46 billion",
      label: "people live in rural areas around the world",
    },
    {
      value: "1.9 billion",
      label: "of them have no health coverage at all. They are not part of any health system or insurance plan.",
      note: "56% of the rural population (ILO) × 3.46 billion.",
    },
    {
      value: "About half",
      label: "of rural residents were missing from the best global population map in one study.",
      note: "Study of 307 rural areas in 35 countries, 1975–2010.",
      source: "nature",
    },
    {
      value: "13.5 million",
      label: "babies didn't get a single vaccine in their first year of life in 2025.",
    },
  ] satisfies { value: string; label: string; note?: string; source?: SourceId }[],

  location: {
    eyebrow: "01 · Location",
    title: "Offical maps are missing villages",
    body: [
      {
        text: "Many offical maps used by governments in order to give data to health facilities are missing many rural villages. This is especially common in developing countries. Without the maps knowing where these people are, the only way to find them is using a satelite.",
      },
      {
        text: "This was explicitly proven in 2025, when a scientific study compared the five most popular population maps against real-life headcounts in rural areas of the world. None of them were anywhere near the corrent answer. Instead, they all heavily underestimated the region's full population. The best map, WorldPop, only accounted for 47% of the region's population.",
        // text: "A 2025 study checked five popular global population maps against real headcounts from 307 rural areas. Every map undercounted rural people. Even the best one missed about half of them.",
        cite: ["nature"],
      },
    ] satisfies Paragraph[],
    mapCaption: "Offical maps often hide villages that we can find through satellite imagery",
    // mapNote: "A drawing, not a real scan.",
    undercountCaption: "How much each population map undercounted rural residents, on average (1975–2010)",
    undercount: [
      { label: "WorldPop", value: 53 },
      { label: "GWP", value: 65 },
      { label: "GRUMP", value: 67 },
      { label: "LandScan", value: 68 },
      { label: "GHS-POP", value: 84 },
    ],
    // caveat:
      // "The study could only check maps up to 2010. Newer maps might be better, but the authors think they most likely still miss rural people.",
  },

  routes: {
    eyebrow: "02 · Route",
    title: "Clinics don't know the cheapest way to reach them",
    body: [
      {
        text: "Even if the government knows where the villages are, they still don't always know the most efficient way to reach them.",
        // cite: ["weiss"],
      },
      {
        text: "With a large majority of all health clinics being in cities or towns, it can be incredibly difficult to figure out which clinic should take the effort to reach the nearest villages."
      },
      {
        text: "Along with the issue of which clinic should attempt to reach the village, there is also the issue of how they should plan to get there, as the shortest route is often not the cheapest. To solve something like this, the health clinic would need some way to consistently weigh different terrians across paths.",
        // cite: ["ruralRoadsCost"],
      },
      // {
        // text: "This leaves health clinics with two issues: 1) Who should attempt to reach the villages, and 2) How they should efficiently travel there.",
        // cite: ["ruralRoadsCost"],
      // },
    ] satisfies Paragraph[],
    travelCaption: "Out of every 100 people in the world, how far each one is from the nearest health facility",
    travel: { byCar: 8.9, onFoot: 43.3 },
    travelKey: {
      byCar: "More than an hour away, even by car",
      onFoot: "Reachable by car, but more than an hour's walk",
      near: "Within an hour's walk",
    },
    routeCaption: "The shortest route on the map isn't always the cheapest",
    route: {
      shortest: { label: "Shortest", road: "dirt track", km: 18, rate: 4.5 },
      cheapest: { label: "Cheapest", road: "paved road", km: 26, rate: 1.4 },
    },
    // routeNote: "A drawing. Prices per km are Hestia's planning rates, not field measurements.",
  },

  funding: {
    eyebrow: "03 · Funding",
    title: "Rural clinics don't get enough money",
    body: [
      {
        text: "In order to split the money between different health facilities, the cost of travel and number of people visited must be known precisly. In the case of rural facilities, neither of these values are known(due to issues 1 and 2). Without them, governments do not know how much money to give each facility, which severly limits the amount of good they can do.",
        // cite: ["pogo"],
      },
      {
        text: "This is due to what happens when the government is not given a precise cost estimate. Without knowing the true cost of serving their people, governments worry about overspending and wasting resources that could be used elsewhere. As overspending becomes the main thought in their minds, the result is almost always underspending, which can lead to incredible plans going unfullfilled.",
        // cite: ["nigeriaCensus"],
      },
      // {
      //   text: "Without good numbers on people or trip costs, rural areas keep getting too little. The ILO found that a lack of money keeps 63% of rural people from getting care, almost twice the urban rate.",
      //   cite: ["ilo"],
      // },
    ] satisfies Paragraph[],
    chainCaption: "How a missing village loses its funding",
    chain: [
      { title: "Not on the map", text: "Satellites can see the roofs, but the official map is empty." },
      { title: "Not counted", text: "Population estimates leave the people out." },
      { title: "Not in the budget", text: "Money is split by headcount, so none is set aside." },
      { title: "Not enough care", text: "The nearest clinic is short on staff, vaccines and fuel." },
    ],
    costChainCaption: "How a missing cost estimate leads to underspending",
    costChain: [
      { title: "No cost estimate", text: "Nobody knows what staff, fuel and travel to each village will cost." },
      { title: "Budget by guessing", text: "Planners have to guess how much rural outreach needs." },
      { title: "Fear of overspending", text: "Running out of money halfway through is risky, so they guess low." },
      { title: "Too little spent", text: "Trips get cut, and the farthest villages are dropped first." },
    ],
  },
};
