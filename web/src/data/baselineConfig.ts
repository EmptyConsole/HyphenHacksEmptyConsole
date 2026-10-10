/**
 * Knobs for the country-level baseline that every country uses, detected or not.
 *
 *   estimated_population = World Bank rural population × NO_COVERAGE_SHARE
 *   estimated_cost       = estimated_population × cost per person
 *
 * Cost per person comes from the scans: the country's own scans if it has any,
 * otherwise the average over every scan, otherwise DEFAULT_COST_PER_PERSON.
 */
export const baselineConfig = {
  /** ILO: 56% of rural people worldwide lack health coverage. */
  noCoverageShare: 0.56,
  /** USD per person, used until at least one scan exists. Matches detect-villages.js ($10 + stop + travel). */
  defaultCostPerPerson: 11,
  /** Rural people per km² for places the World Bank has no figure for (Taiwan, Kosovo, small territories). */
  fallbackRuralPerKm2: 25,
  /** How often the map checks for new scans. */
  pollMs: 20_000,
  /** detect-villages.js refuses boxes over this many zoom-17 tiles. */
  maxScanTiles: 400,
};
