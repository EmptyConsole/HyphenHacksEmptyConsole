// Builds src/data/ruralPopulation.json: World Bank rural population (SP.RUR.TOTL,
// latest year) keyed by ISO 3166 numeric id, the ids used in countries-50m.json.
//
//   node scripts/build-rural-baseline.mjs

import { writeFileSync } from "node:fs";

const WB =
  "https://api.worldbank.org/v2/country/all/indicator/SP.RUR.TOTL?format=json&mrnev=1&per_page=400";
// cca3 → ccn3 lookup. World Bank only gives ISO alpha-3.
const CODES = "https://cdn.jsdelivr.net/npm/world-countries@5.1.0/countries.json";

const [[, rows], countries] = await Promise.all([
  fetch(WB).then((r) => r.json()),
  fetch(CODES).then((r) => r.json()),
]);
const numeric = new Map(countries.map((c) => [c.cca3, c.ccn3]));
// World Bank uses XKX for Kosovo; world-atlas has no numeric id for it.
const out = {};
for (const row of rows) {
  const id = numeric.get(row.countryiso3code);
  if (!id || row.value == null) continue;
  out[id] = { rural: row.value, year: Number(row.date) };
}
writeFileSync(new URL("../src/data/ruralPopulation.json", import.meta.url), JSON.stringify(out, null, 0) + "\n");
console.log(`${Object.keys(out).length} countries`);
