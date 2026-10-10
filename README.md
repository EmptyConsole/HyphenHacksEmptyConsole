# Hestia — Unmapped Village Discovery & Vaccination Routing

**Short summary:** A tool that finds rural settlements missing from official maps and census lists, then plans reachable routes from the nearest health facilities so vaccination and aid teams can reach people who would otherwise be skipped.

---

## Table of contents

1. [The problem](#the-problem)
2. [Why this matters](#why-this-matters)
3. [The idea](#the-idea)
4. [Theme: constellations as connections](#theme-constellations-as-connections)
5. [How it works (overview)](#how-it-works-overview)
6. [Algorithms](#algorithms)
7. [Backend → frontend contract](#backend--frontend-contract)
8. [Data sources & licenses](#data-sources--licenses)
9. [False positives & human verification](#false-positives--human-verification)
10. [Cost & population estimation](#cost--population-estimation)
11. [Architecture](#architecture)
12. [References & statistics](#references--statistics)
13. [Project status](#project-status)
14. [License & contribution](#license--contribution)

---

## The problem

Vaccination campaigns, routine immunization, and emergency aid are planned from **maps** and **official settlement lists**. Any village that appears on **neither** is easy to miss entirely: planners cannot budget for it, routes are not drawn to it, and field teams may never know it exists.

Healthcare workers currently **cannot find many rural villages** that desperately need vaccinations. Officers often know that gaps exist, but they lack:

- A **discoverable list** of where unmapped settlements likely are  
- A **practical path** from a clinic or depot to each settlement  
- **Rough cost and population signals** to prioritize polygons and justify budgets  

In **Nigeria alone**, about **2.1 million children** have never received a vaccine (“zero-dose” children)—the highest national burden globally as of WHO/UNICEF 2023 estimates. A large share of that gap is tied to settlements and populations that are **not reliably recorded** on maps used for planning.

This is not only a Nigerian problem. Globally, roughly **3.46 billion people** live in rural areas (World Bank, ~2024–2025). Rural populations face systematically weaker health access: the ILO reports that **56% of people in rural areas worldwide lack legal health coverage**, compared with **22% in urban areas**—and more than half of the global rural population lacks **effective** access to health care, often because health workers are not deployed where people live.

**Zero-dose** means a child has received **no dose** of routine immunization (e.g. no first pentavalent dose). Finding unmapped villages does not replace immunization programs; it **feeds** them with locations and routes that census-only planning cannot see.

---

## Why this matters

| Stakeholder | Without this tool | With this tool |
|-------------|-------------------|----------------|
| Health officers | Guess where informal/rural clusters might be; repeat failed outreach | Target clusters flagged by satellite + OSM gap analysis |
| Planners | Under-count rural polygons in budgets | See estimated population and cost **per polygon** |
| Communities | Remain invisible on maps used for campaigns | Become candidates for verification, then mapped and served |
| OpenStreetMap | Rural gaps persist | Confirmed settlements written back after field verification |

**Why it solves the planning gap:** Once officers know **where** people likely are and **how** to reach them, budgets and route plans can be reworked around **evidence** instead of incomplete registries. The path between a clinic and a village is long in sparse regions; this project treats that path as something to **compute, label, and improve**—not assume away.

---

## The idea

Build a system that:

1. **Scans** satellite photos for **clusters of roofs** (candidate settlements).  
2. **Compares** those clusters with **OpenStreetMap (OSM)** places.  
3. **Flags** settlements the map has no name for.  
4. For each flag, **prices a route** from a nearby clinic so health workers can **reach and verify** the site.  
5. After verification, **returns confirmed settlements to OSM** so the next campaign starts from a better map.

The core insight: **roofs from space** and **places on OSM** are two imperfect views of the same ground truth. Their **disagreement** is a strong signal for “here might be people planners don’t see.”

---

## Theme: constellations as connections

We interpreted **constellations** as **connections**. Stars are far apart; alone, the distance is hard to cross. Drawing constellations between them makes the path **meaningful and navigable**.

Analogously:

- **Stars** → scattered rural settlements detected from imagery  
- **Constellation lines** → routes from health facilities to those settlements  
- **The sky chart** → the map product officers use to plan outreach  

We are creating **connections between rural people and the healthcare they need**, by making the long path from clinic to village **visible, measurable, and actionable**.

---

## How it works (overview)

```
 satellite tiles          roof pixels           settlement outlines
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│ Esri imagery   │ ──► │ color + edge   │ ──► │ join nearby    │
│ ~1.2 m / pixel │     │ rules          │     │ roofs, trace   │
└────────────────┘     └────────────────┘     └───────┬────────┘
                                                      │
                      ┌───────────────────────────────┘
                      ▼
         ┌────────────────────┐     ┌────────────────────┐
         │ OSM place within   │     │ people × $10       │
         │ 150 m → certainty  │ ──► │ + $100 per stop    │
         │ 100, else score    │     │ + cheapest trip    │
         └────────────────────┘     └─────────┬──────────┘
                                              │
                      ┌───────────────────────┘
                      ▼
         ┌────────────────────┐     ┌────────────────────┐
         │ cheapest clinic    │     │ one team tour:     │
         │ trip on OSM roads  │ ──► │ clinic → villages  │
         │                    │     │ → clinic           │
         └────────────────────┘     └────────────────────┘
```

A scan always returns a route when it can find a clinic or a road. Mapped kilometers follow OpenStreetMap. The last stretch with no road is a straight line, priced higher because a team slows down there.

---

## Algorithms

Detection uses color and shape. Routing uses the roads already drawn on OpenStreetMap. There is no trained model and no separate routing engine: `detect-villages.js` downloads the picture, finds the settlements, prices every trip, and prints one GeoJSON document.

```
node detect-villages.js --south 9.02 --west 38.70 --north 9.06 --east 38.74
```

The only input is a bounding box. Progress lines go to stderr. The FeatureCollection on stdout is what the map saves and draws. Constants named below live at the top of that file.

The map then does two more things with those results. Countries that have been scanned show the polygons. Every country, scanned or not, gets a national cost from rural population and the dollars-per-person the scans observed.

### 1. Get the satellite picture

The box is turned into Web Mercator tiles at zoom 17, about **1.2 meters per pixel**, from [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9). Each tile is a 256×256 JPEG. Up to six tiles download at once. A box that would need more than **400 tiles** is refused.

Tiles cover a rectangle slightly larger than the request. After classification, every pixel outside the box is cleared, so a village just past the edge is ignored.

A batch scan (`scan-batch.js`) uses a square of **0.04° × 0.04°**, about 4 km on a side near the equator.

### 2. Keep the roofs

Each pixel is accepted or dropped with fixed color rules. Vegetation, water, and darkness are dropped first:

| Reject | Rule |
|--------|------|
| Vegetation | Green is stronger than red and blue |
| Water | Dark and blue. Bright blue metal roofs are kept later |
| Dark | Average brightness under 40 (shadow, dense forest, dark soil) |

A pixel that survives is a **roof** when it looks like red tile, pale concrete, blue corrugated metal, or flat gray that also has a hard edge. Gray without an edge is asphalt, so a road is not counted as a house by itself.

The same pass writes two masks:

- **roof** — roof-colored pixels, used later to count buildings
- **built** — those pixels, plus any pixel whose brightness differs from a neighbor by 28 or more (walls and roof edges)

### 3. Join roofs into a village

Scattered built pixels become one blob per settlement with two morphological passes, each a square window:

1. **Open** (erode, then dilate) with a 1-pixel radius. Single-pixel speckle disappears.
2. **Close** (dilate, then erode) with a 12-pixel radius. Gaps of about **30 meters** between roofs fill in. The outer footprint does not grow, because the dilate is undone by the erode.

Connected components are then traced with 4-connectivity (up, down, left, right). A blob is kept only when it covers at least **400 pixels** (about 500 m²). Smaller blobs are a shed or noise.

The outline is the largest loop of pixel edges around the blob. Courtyards and holes are the smaller loops and are dropped. Stair-steps along a straight wall are removed with Ramer–Douglas–Peucker at a tolerance of **2 pixels**. The ring is converted back to longitude and latitude and wound counter-clockwise for GeoJSON.

Roof pixels were stored before the close, so a gap between houses still splits them. Each connected group of at least **8 roof pixels** counts as one building. A blob with no building at all is dropped.

### 4. Ask if the map already knows it

OpenStreetMap places inside the box are loaded through the Overpass API: `village`, `hamlet`, `isolated_dwelling`, `town`, and `suburb`.

For each outline, the closest of those places is measured. Distance is zero when the place sits inside the ring, otherwise it is the distance to the boundary. A place within **150 meters** confirms the settlement:

- **Certainty 100**, source `osm`, and the place's name and id are stored.
- Anything farther away is left to the satellite score.

Satellite certainty is a weighted score, **capped at 99**. Only a mapped place can be 100.

| Part | Weight | Full marks |
|------|--------|------------|
| Roof clusters | 45 | 8 or more buildings |
| Compact shape | 30 | compactness 0.45 (a circle is 1) |
| Roof-colored area | 25 | 35% of the outline is roof-colored |

Compactness is \(4\pi A / P^2\). A round village scores high. A long field edge or a road scores near zero.

A certainty under 100 is a lead. Color rules can still mistake rocks, bare fields, or farm sheds for roofs.

### 5. Count people and the vaccine cost

Population is the larger of two estimates, and never below one dwelling:

\[
\text{people} = \max(5 \times \text{buildings},\; 5 \times \mathrm{round}(\text{area} / 250\,\mathrm{m}^2),\; 5)
\]

Five people stand in for one roof. When adjoining roofs fused into one cluster, area is used instead: one dwelling per **250 m²**, still five people each.

Vaccinating that settlement is:

\[
\text{healthcare} = \text{people} \times \$10 + \$100
\]

The $10 is vaccine, syringe, and a share of the health worker's time, spread over everyone in the settlement. The $100 is the stop itself: cooler, records, and setup, paid once even for a tiny place.

### 6. Price the trip from a clinic

Clinics are hospitals, clinics, doctors, and health posts in OpenStreetMap, searched about **40 km** past the box (`amenity` or `healthcare` tags). A building outline and an entrance node within 40 meters are treated as the same facility.

Each settlement tries its **three nearest** clinics. The road download is limited to the box around those clinics. Drivable ways are loaded, including tracks. Footpaths are left out.

**Road graph.** Each OSM way becomes directed edges. Intersections share node ids, so ways join there. One-way tags are honored. Each edge stores length in meters and a dollar cost:

| Road | USD / km |
|------|----------|
| Motorway | 1.2 |
| Trunk | 1.3 |
| Primary | 1.4 |
| Secondary | 1.6 |
| Tertiary | 1.8 |
| Residential | 2.0 |
| Unclassified, living street | 2.2 |
| Service | 2.4 |
| Track | 4.5 |
| No road | 8.0 |

A paved type tagged dirt, gravel, sand, mud, or similar costs **1.5×** more. Tracks and unpaved surfaces are marked slow. These rates are planning assumptions.

**Snap.** The clinic and the settlement centroid are each joined to the nearest point on a road segment. A road farther than **8 km** is not a usable approach. The snap splits that segment so the search can start and stop mid-edge.

**Search.** One Dijkstra run starts from every snapped clinic at once. Edge weight is dollars, so the first time a village's road node is settled, that path is the cheapest way to reach it. The trip cost is road dollars plus the two off-road gaps (clinic to its road, and road to the village) at **$8 / km**.

A straight line from clinic to village, priced entirely at $8 / km, is always computed too. The cheaper of the road trip and the straight line wins. When no clinic is inside the search pad, the whole 40 km is priced as off-road.

**Difficulty** is a score from 0 to 100:

| Part | Points | Full marks |
|------|--------|------------|
| Off-road gap at the village | 50 | 1 km or more off the road |
| Whole trip length | 30 | 30 km |
| Share that is slow | 20 | the entire trip is track, unpaved, or off-road |

0–33 is easy, 34–66 is moderate, 67–100 is hard.

Predicted cost for the settlement is healthcare plus this trip.

### 7. Recommend the cheapest place

Every polygon keeps its own route, clinic, and predicted cost, so the map can draw all of them. The recommendation is the polygon whose predicted cost is lowest. Ties break toward the easier trip, then toward the larger population.

### 8. Plan one team tour

A separate clinic trip to every settlement double-counts the drive out and back. The tour sends **one team** out from a depot, through every settlement worth visiting, and back.

Settlements under certainty **30** are skipped. They are often bare ground. The depot is the clinic that most of the remaining settlements already route from. If no clinic is in range, the depot is the settlement closest to a road.

Each leg costs the cheaper of driving (road dollars plus both off-road snaps) or a straight off-road line. Rural roads are almost all two-way, so each pair of stops uses the cheaper direction.

The visiting order starts as nearest-neighbor from the depot, then **2-opt** rewrites it: any stretch of the loop is reversed when that cuts the total cost. That repeats for up to 50 passes, and usually settles in a few. The map also shows what separate round trips would have cost (twice each settlement's one-way trip) so the saving from one loop is visible.

### 9. Roll scans up to a country

Saved scans live in `web/data/scans/`. On the map, a scanned country is drawn as those boxes, and each box opens into the detected polygons, clinic routes, and the team tour.

Every country also gets a national estimate, scanned or not:

\[
\text{people} = \text{rural population} \times 0.56
\]

Rural population is the World Bank figure. Where the World Bank has none, it is the country's area times 25 rural people per km². The 0.56 is the ILO share of rural people without health coverage.

Dollars per person come from the scans: that country's own scans when it has any, otherwise the average over every scan, otherwise **$11**. National cost is people times that rate.

A country with no scans still has to be clickable. Its outline is split into regions, and those into villages, with a seeded Voronoi partition so the same country always splits the same way. Child populations and costs sum to the parent. Those shapes are labeled **modeled**. They are a placeholder split of the national total, and they carry no routes.

### 10. Draw it on the map

The map has three levels: the world, one country, and one scan box. A click moves down a level, and Escape moves back up.

**Color** shows cost. Inside the current level, areas are ranked by estimated cost, and each gets a rank from 0 (cheapest) to 1 (most expensive). That rank picks a color from the data ramp. Ranking keeps the colors spread out at every level, even when one country's total dwarfs the rest.

**Opacity** shows certainty. A detected settlement fades as its certainty drops:

| Certainty | Fill | Outline |
|-----------|------|---------|
| 0 | 0.12 | 0.28 |
| 50 | 0.42 | 0.64 |
| 100 | 0.72 | 1.0 |

Values in between are linear. A hovered or selected settlement goes to 0.85 whatever its score, so a weak lead can still be inspected. Countries, scan boxes, and modeled villages have no certainty and keep a flat 0.5.

**Outlines** show where a number came from. Detected areas get a solid line, and modeled ones a faint line.

**Routes.** The scan view draws either the team tour or each settlement's clinic route, never both, because together they are unreadable. A clinic route that follows roads is a solid line. A two-point route is the straight off-road fallback, and it is dashed so nobody reads it as a road. Hovering or selecting a settlement highlights its own route.

**Markers.** A 4 km scan is invisible from orbit, so scan boxes and small settlements also get a dot. On the world and country views, a scan's dot is colored by what it found:

| Dot | Meaning |
|-----|---------|
| Orange | Settlements found, and at least one has a clinic route |
| Blue | Settlements found, but no clinic was in range of any of them |
| Black (thin light ring) | No settlements found |

**Antimeridian.** Countries that cross 180° (Russia, Fiji) come split at −180 and 180. Rings wider than 180° have their western half shifted past 180°, so they do not draw as a band around the globe.

**Live scan.** From zoom 8, the map counts the zoom-17 tiles the current view would need, using the same tile math as the detector. When the count is 400 or fewer, the view can be scanned. The country is the one under the center of the view. The scan runs on the server and is saved like a batch scan.

**Refresh.** Every 20 seconds the map re-reads the scan list. When it has changed, cached levels are dropped and the current view reloads, so a batch run fills in while the map is open.

### Where the boxes come from

`scan-batch.js` runs the detector on many boxes and writes each result as soon as it finishes.

In the default mode it picks countries with the highest zero-dose burden first, round-robin, so a short run still covers many countries. Inside a country it draws a random point in the border, asks Overpass for a village or hamlet nearby, and centers the 0.04° box on that place. The mapped village is then something to find, and unmapped neighbors show up as satellite hits.

Grid mode (`--grid`) tiles one country with the same box size and walks the cells in a fixed shuffle, skipping cells already saved, so a partial run is spread across the country.

A live scan from the map runs the same detector on a box the user draws and saves it the same way.

---

## Backend → frontend contract

`detect-villages.js` prints one GeoJSON `FeatureCollection`. Each feature is a settlement polygon. The collection also carries `recommendation` (the cheapest polygon and its route) and `tour` (the team loop). The map reads saved copies of that document from `web/data/scans/`.

| Field | Meaning |
|-------|---------|
| `certainty` | 100 when an OSM place matched, otherwise the satellite score, 0–99 |
| `source` | `osm` or `satellite` |
| `population`, `healthcareUsd` | People, and the vaccination bill |
| `predictedCostUsd` | Healthcare plus the trip |
| `reachUsd`, `reachDifficulty`, `reachLabel` | Trip cost, 0–100 difficulty, and easy / moderate / hard |
| `route` | LineString from the chosen clinic to the settlement |
| `clinic` | Name and point of that clinic |
| `tourStop` | Position on the team tour, when the settlement is visited |

Country polygons use `estimated_population` and `estimated_cost` from the national rollup in [step 9](#9-roll-scans-up-to-a-country). A scanned area is marked `detected`. A Voronoi placeholder is marked `modeled`.

---

## Data sources & licenses

| Dataset | Use | License |
|---------|-----|---------|
| Esri World Imagery | Satellite tiles for roof detection | Esri, Vantor, Earthstar Geographics, and the GIS User Community. Check [the layer terms](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9) before redistribution |
| OpenStreetMap | Places, clinics, and roads, via the Overpass API | **ODbL 1.0** |
| World Bank `SP.RUR.TOTL` | Rural population for country totals | World Bank terms |
| Natural Earth (world-atlas) | Country borders on the map | Public domain |

**Compliance:** Attribute Esri and OpenStreetMap per their terms. If contributing verified places to OSM, respect [ODbL](https://www.openstreetmap.org/copyright) and local mapping conventions.

---

## False positives & human verification

Algorithmic discovery **must not** auto-publish personal or sensitive locations at scale without local review. Workflow:

1. **Internal** flag list for authorized health/planning users  
2. **Field verification** before public OSM edits or public map tiles at high precision  
3. **Audit log** of who verified what and when  

Satellite outlines find **candidates**; health workers find **communities**.

---

## Cost & population estimation

The formulas and the constants they use are in [Algorithms](#algorithms), steps 5, 6, and 9. In short:

- **One settlement:** five people per roof (or per 250 m² when roofs merge), then $10 a person plus $100 for the stop, plus the cheapest clinic trip.
- **One country:** World Bank rural population × 56% without health coverage × the dollars per person observed in scans.

Hestia's $10 is spread over everyone in a settlement, so it is a planning number for a place, and it is separate from UNICEF's per-child cost of fully vaccinating a child. The road rates ($1.20–$8 per km) are assumptions, and each scan keeps the inputs (building count, area, compactness, roof share, off-road meters) so a map can show how a number was built.

---

## Architecture

```
┌────────────────────┐     GeoJSON      ┌────────────────────┐
│ detect-villages.js │ ───────────────► │ web/data/scans/    │
│ one bounding box   │                  │ one JSON per scan  │
└────────────────────┘                  └─────────┬──────────┘
         ▲                                        │
         │ spawn                                  ▼
┌────────────────────┐                  ┌────────────────────┐
│ scan-batch.js      │                  │ Next.js map        │
│ or a box on the map│                  │ countries, routes, │
│                    │                  │ tours              │
└────────────────────┘                  └────────────────────┘
```

- `detect-villages.js` — satellite tiles, settlement outlines, OSM match, clinic routes, team tour
- `scan-batch.js` — picks rural boxes and saves each finished scan immediately
- `web/` — the map. `web/src/app/api/scans/` runs the detector for a box drawn on the map. `hestiaProvider.ts` turns saved scans and the World Bank baseline into the layers the map draws  

---

## References & statistics

| Claim | Source |
|-------|--------|
| ~2.1M zero-dose children in Nigeria (2023) | [WHO/UNICEF immunization estimates](https://data.unicef.org/topic/child-health/immunization/); widely reported e.g. [UNICEF Nigeria](https://www.unicef.org/nigeria/stories/increasing-vaccine-voices) |
| ~3.46B rural population globally | [World Bank `SP.RUR.TOTL`](https://data.worldbank.org/indicator/SP.RUR.TOTL) |
| 56% rural vs 22% urban without legal health coverage | [ILO — Global evidence on inequities in rural health protection](https://www.ilo.org/sites/default/files/wcmsp5/groups/public/@ed_protect/@soc_sec/documents/publication/wcms_383890.pdf) |
| Zero-dose in remote-rural LMIC settings | [PLOS Global Public Health (2023)](https://journals.plos.org/globalpublichealth/article?id=10.1371/journal.pgph.0001126) |

**Note:** The hackathon notes cite “56% … do not have access to vaccines” in the ILO sense; the precise ILO indicator is **legal health coverage / effective access**, not vaccine coverage alone. Vaccine-specific rural gaps are documented in WHO/UNICEF and PLOS sources above.

---

## Project status

The detector, the batch scanner, and the map are in the repo. Saved scans in `web/data/scans/` are what the map draws for countries that have been visited. Countries without scans still show the national estimate, split into modeled regions.

**Still ahead:**

- [ ] Hand verified lists to local health teams
- [ ] Write confirmed settlements back to OpenStreetMap
- [ ] Calibrate people-per-roof and the road rates against a field survey  

---

## License & contribution

License for application code: **TBD** (choose before public release). Third-party data remains under the licenses listed in [Data sources & licenses](#data-sources--licenses).

Contributions welcome: false-positive patterns in the color rules, regional defaults for the roof and cost constants, and OSM tagging guidelines for verified hamlets.

---

**Hestia** — connecting rural settlements to the healthcare they need, one route at a time.
