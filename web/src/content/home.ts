/**
 * All homepage copy in one place. Replace the lorem ipsum here.
 */
export const homeContent = {
  hero: {
    eyebrow: "The goal",
    headlineLines: ["Bringing healthcare", "to rural", "populations."],
    lead:
      "In today's world, there are over 1.9 billion people living in rural areas without any healthcare.",
    ctas: [
      { label: "Explore the map", href: "#map", variant: "primary" },
      { label: "See the algorithm", href: "/algorithm", variant: "secondary" },
    ],
  },
  map: {
    eyebrow: "The map",
    title: "Hestia Map",
    lead: "We analyze real world data to deliver a comprehensive view of healthcare access. Check out our solution for more details. \n Hover a country for estimates, click it to see its scans, then the settlements they found.",
  },
};

export const navTabs = [
  { label: "Home", href: "/" },
  { label: "Problem", href: "/problem" },
  { label: "Solution", href: "/solution" },
  { label: "Algorithm", href: "/algorithm" },
  { label: "Donate", href: "/donate" },
];
