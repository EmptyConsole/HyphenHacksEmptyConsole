/**
 * All homepage copy in one place. Replace the lorem ipsum here.
 */
export const homeContent = {
  hero: {
    eyebrow: "The goal",
    headlineLines: ["Bringing healthcare", "to rural", "populations."],
    lead:
      "Currently, over 1.9 billion people have no access to healthcare, just because of where they live.",
    ctas: [
      { label: "Explore the map", href: "#map", variant: "primary" },
      { label: "See the algorithm", href: "/algorithm", variant: "secondary" },
    ],
  },
  map: {
    eyebrow: "The map",
    title: "Hestia Map",
    lead: "The global rural healthcare issue stems from 3 reasons: 1) Governments don't know where people live, 2) Governments don't know the most efficient way to reach them, and 3) Governments don't know how much it will cost to help. Each of these issues comes from a lack of data, data that we now provide through computer vision on satellites and OpenStreetMap information. Click into a country to see our scans along with all of their information.",
  },
};

export const navTabs = [
  { label: "Home", href: "/" },
  { label: "Problem", href: "/problem" },
  { label: "Solution", href: "/solution" },
  { label: "Algorithm", href: "/algorithm" },
  // { label: "Donate", href: "/donate" },
];
