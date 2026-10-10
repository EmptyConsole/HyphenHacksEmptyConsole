/**
 * Copy for the Donate page. Every number is a published figure.
 * Global totals match the Problem page and its sources.
 * Country totals are World Bank rural population (SP.RUR.TOTL), 2025.
 */
export const donateContent = {
  eyebrow: "Donate",
  title: "Send vaccines to villages the maps left out.",
  lead:
    "Rural villages are missing from official maps, so health workers never get a route and people there go without vaccines. Your gift pays for that route.",
  scanChoose: "Can't donate? Help us scan a region.",
  facts: [
    {
      value: "3.46 billion",
      label: "people live in rural areas — 42% of everyone on Earth.",
      note: "World Bank, 2025.",
    },
    {
      value: "56%",
      label: "of rural people have no health coverage.",
      note: "International Labour Organization, 174 countries.",
    },
    {
      value: "1.9 billion",
      label: "rural people have no health coverage.",
      note: "56% of the rural population (ILO) × 3.46 billion.",
    },
    {
      value: "13.5 million",
      label: "babies got no vaccine in their first year of life in 2025.",
      note: "WHO and UNICEF, July 2026.",
    },
  ],
  whyTitle: "Why donate",
  why: [
    {
      title: "A missing village gets no team",
      text: "Health workers can only visit places they can find. If a village is not on the map, no vaccine route is planned.",
    },
    {
      title: "Most rural people are still waiting",
      text: "The ILO found that 56% of rural people have no health coverage. That is 1.9 billion people: 56% of the World Bank’s 3.46 billion rural residents.",
    },
    {
      title: "A route lets a budget land",
      text: "Once a government can see the village and the path from the nearest clinic, it can spend health money on a real place.",
    },
  ],
  whereTitle: "Where your gift goes",
  whereLead:
    "You choose the government. The gift is used to find rural villages in that country that official health maps leave out, and to plan a vaccine route to them.",
  where: [
    {
      step: "01",
      title: "Find the village",
      text: "Satellites and maps locate settlements that official health maps leave out.",
    },
    {
      step: "02",
      title: "Plan the path",
      text: "Hestia finds the nearest clinic and the most practical way in.",
    },
    {
      step: "03",
      title: "Deliver the vaccines",
      text: "The gift covers doses and the health workers who travel that route.",
    },
  ],
  amounts: [25, 50, 100, 250],
  /**
   * Governments where rural people are still widely without care.
   * Names match Natural Earth. The chooser only offers these.
   */
  governmentsInNeed: [
    "Nigeria",
    "Ethiopia",
    "Dem. Rep. Congo",
    "India",
    "Pakistan",
    "Bangladesh",
    "Tanzania",
    "Uganda",
    "Kenya",
    "Afghanistan",
    "Mozambique",
    "Madagascar",
    "Niger",
    "Mali",
    "Burkina Faso",
    "Chad",
    "Malawi",
    "S. Sudan",
    "Yemen",
    "Myanmar",
    "Nepal",
    "Haiti",
    "Papua New Guinea",
    "Somalia",
    "Sudan",
  ],
  sources: [
    {
      label: "World Bank — Rural population (World Development Indicators)",
      detail: "Indicator SP.RUR.TOTL, 2025. Country rows and the 3.46 billion total use this series.",
      href: "https://data.worldbank.org/indicator/SP.RUR.TOTL",
    },
    {
      label: "International Labour Organization (2015) — Global evidence on inequities in rural health protection",
      detail: "56% of rural people have no health coverage, across 174 countries.",
      href: "https://www.ilo.org/sites/default/files/wcmsp5/groups/public/@ed_protect/@soc_sec/documents/publication/wcms_383890.pdf",
    },
    {
      label: "WHO and UNICEF (July 2026) — Estimates of National Immunization Coverage, 2025",
      detail: "13.5 million babies got no vaccine in their first year of life in 2025.",
      href: "https://www.who.int/news/item/15-07-2026-global-childhood-immunization-coverage-inches-forward-despite-conflict-and-hesitancy---unicef--who",
    },
  ],
};
