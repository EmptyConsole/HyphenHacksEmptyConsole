// Command-line wrapper around the detector in web/src/lib/detector/detectVillages.mjs.
// The web app imports that file directly; scan-batch.js and people run this one.
//
//   node detect-villages.js --south 9.02 --west 38.70 --north 9.06 --east 38.74
//
// GeoJSON is printed on stdout. Progress lines go to stderr.

import { detectVillages } from "./web/src/lib/detector/detectVillages.mjs";

// Read --south --west --north --east from the command line.
function readBbox(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    args[argv[i].slice(2)] = Number(argv[++i]);
  }
  return args;
}

// A failure message goes to stderr and the process exits non-zero, so a caller can
// tell a bad run from an empty FeatureCollection.
detectVillages(readBbox(process.argv))
  .then((collection) => {
    // Pretty-print to stdout so the JSON can be piped or saved on its own.
    console.log(JSON.stringify(collection, null, 2));
  })
  .catch((error) => {
    console.error(error.message || error);
    if (/needs numeric/.test(error.message)) {
      console.error("Usage: node detect-villages.js --south LAT --west LNG --north LAT --east LNG");
    }
    process.exit(1);
  });
