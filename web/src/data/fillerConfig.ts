/**
 * Knobs for the generated placeholder data. Tweak freely; delete once the
 * backend is wired up.
 */
export const fillerConfig = {
  /** Change to reshuffle every generated number and polygon. */
  seed: 2026,

  country: {
    /** Estimated unmapped population per country. */
    populationRange: [20_000, 6_000_000] as const,
    /** USD per person reached. */
    costPerPersonRange: [3, 18] as const,
  },

  /** How many sub-polygons each level splits into. */
  regionsPerCountry: [6, 14] as const,
  villagesPerRegion: [8, 18] as const,

  /** Placeholder names. `{n}` is replaced with an index. */
  regionName: "Region {n}",
  villageName: "Village {n}",
};
