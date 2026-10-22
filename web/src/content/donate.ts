/**
 * Copy for the Donate page. Every number is a published figure.
 * Global totals match the Problem page and its sources.
 * Country totals are World Bank rural population (SP.RUR.TOTL), 2025.
 */
export const donateContent = {
  eyebrow: "Donate",
  title: "Help get vaccines to villages that aren't on the map",
  lead:
    "A lot of rural villages just aren't on official maps, and if a village isn't on the map then nobody is going to plan a route there. So the people living there don't get vaccines. When you donate, it goes toward finding those villages and figuring out how to get to them.",
  scanChoose: "Can't donate right now? You can still help us scan a region.",
  facts: [
    {
      value: "3.46 billion",
      label: "people live in rural areas, about 42% of the world's population.",
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
      title: "Villages that aren't on the map get skipped",
      text: "Health workers can only go where they know people live. If a village never made it onto the map, nobody is ever going to plan a vaccine route out there.",
    },
    {
      title: "Most rural people have no coverage",
      text: "The ILO found that 56% of rural people don't have any health coverage. Put that together with the World Bank's 3.46 billion rural people and you get about 1.9 billion.",
    },
    {
      title: "A route tells the money where to go",
      text: "Once a government can actually see a village, and how to get there from the closest clinic, it finally knows where its health budget should go.",
    },
  ],
  whereTitle: "Where your gift goes",
  whereLead:
    "You choose which government gets your gift. We use it to find rural villages in that country that the health maps left out, and then we plan vaccine routes to them.",
  where: [
    {
      step: "01",
      title: "Find the village",
      text: "We look through satellite images and map data for settlements the official health maps left out.",
    },
    {
      step: "02",
      title: "Plan the path",
      text: "Hestia finds the closest clinic and works out the best way from there to the village.",
    },
    {
      step: "03",
      title: "Deliver the vaccines",
      text: "Your gift pays for the vaccines and for the health workers who make the trip out.",
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
      label: "World Bank: Rural population (World Development Indicators)",
      detail: "Indicator SP.RUR.TOTL, 2025. Country rows and the 3.46 billion total use this series.",
      href: "https://data.worldbank.org/indicator/SP.RUR.TOTL",
    },
    {
      label: "International Labour Organization (2015): Global evidence on inequities in rural health protection",
      detail: "56% of rural people have no health coverage, across 174 countries.",
      href: "https://www.ilo.org/sites/default/files/wcmsp5/groups/public/@ed_protect/@soc_sec/documents/publication/wcms_383890.pdf",
    },
    {
      label: "WHO and UNICEF (July 2026): Estimates of National Immunization Coverage, 2025",
      detail: "13.5 million babies got no vaccine in their first year of life in 2025.",
      href: "https://www.who.int/news/item/15-07-2026-global-childhood-immunization-coverage-inches-forward-despite-conflict-and-hesitancy---unicef--who",
    },
  ],
};
