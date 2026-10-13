# Hestia: Unmapped Village Discovery & Vaccination Routing

Hestia finds rural settlements that are missing from official maps, estimates how many people live there, and plans the cheapest way for a vaccination team to reach them from the nearest clinic.

---

## The problem

Vaccination campaigns are planned from maps and official settlement lists. A village that appears on neither gets no budget, no route and no visit.

- About **2.1 million children** in Nigeria have never received a vaccine, the highest number of any country (WHO/UNICEF, 2023).
- About **3.46 billion people** live in rural areas worldwide (World Bank).
- **56%** of rural people lack health coverage, compared with 22% in cities (ILO).

Health officers know these gaps exist. What they lack is a list of where the unmapped settlements are, a practical route to each one, and a rough cost to put in a budget.

## The idea

1. **Find** clusters of roofs in satellite images.
2. **Check** each one against OpenStreetMap. A cluster the map doesn't know about is a lead.
3. **Estimate** its population and the cost of vaccinating it.
4. **Route** a team there from a real clinic, along real roads.
5. **Plan** one round trip that covers a whole area as cheaply as possible.

**Theme: constellations as connections.** Settlements are scattered stars. The routes between them and the clinics are the lines that turn them into a constellation, a path a health team can actually follow.

---

## Algorithms

Everything in a scan comes from one script, `detect-villages.js`. It takes a bounding box and prints one GeoJSON document. It uses no trained model and no separate routing engine.

```bash
node detect-villages.js --south 9.43 --west 9.00 --north 9.47 --east 9.04
```

### 1. Satellite detection

Downloads Esri World Imagery at zoom 17, about 1.2 m per pixel, and capped at 400 tiles (roughly 4 × 4 km). Each pixel is classified by color and edge strength:

- **Rejected:** vegetation (green dominant), water (dark blue) and shadow.
- **Roof:** pale concrete, blue metal, teal-looking painted metal on an edge, red tile on a sharp edge, or flat gray on an edge.

  The edge rules matter. Red laterite soil and dirt roads are as red as tile roofs, but they fade gradually where a roof has a crisp outline.

Nearby roof and edge pixels are joined into one blob per settlement: specks are removed, then gaps up to about 30 m are closed. Each blob is traced into an outline.

### 2. Settlement filtering

A blob only counts if it contains real house-shaped roofs. A **roof cluster** must be:

- between 8 and about 360 pixels (up to about 500 m²)
- filling at least 40% of its bounding box
- at least about 3.5 m wide on average
- no more than 4 times longer than it is wide

These limits remove crop-row lines, tracks, tree edges and patches of bare ground.

A blob must also have at least one roof cluster, and compactness ≥ 0.06 (4πA/P², where a circle is 1). Stringy webs of soil and tracks fail the compactness test unless OpenStreetMap confirms the place.

### 3. Confidence

- An **OpenStreetMap place** (village, hamlet and so on) inside the outline or within 150 m sets confidence to **100**.
- Otherwise it's a satellite score, **capped at 99**:
  - roof clusters: 45 points (full marks at 8)
  - compact shape: 30 points (full marks at 0.45)
  - roof-colored share: 25 points (full marks at 35%)

The panel shows this as High (75+), Medium (50–74) or Low (under 50).

### 4. Population and cost

- **People:** the larger of 5 per roof cluster, or 5 per 250 m² of outline. Stringy outlines use roofs only.
- **Vaccination:** $10 per person, plus $100 per settlement visited.

### 5. Clinic routes

- **Clinics:** OSM hospitals, clinics, doctors and health posts within about 40 km.
- **Roads:** drivable OSM roads become a graph, priced per km by road type ($1.20 for a motorway up to $4.50 for a track, ×1.5 when unpaved). Any stretch with no road costs $8 per km.
- **Search:** one multi-source Dijkstra from the 3 nearest clinics finds each settlement's cheapest trip. A straight off-road line is also priced, and the cheaper of the two wins.
- **Access difficulty (0–100):**
  - distance from a road: up to 50 points
  - trip length: up to 30 points
  - share of the trip that is rough: up to 20 points

### 6. Team tour

One team leaves a clinic, visits every settlement with confidence ≥ 30, and comes back. The depot is the clinic most settlements already route from. Each leg uses the cheaper of road or off-road.

The visiting order starts as "nearest stop next" and is improved with **2-opt**, which reverses any stretch of the loop that lowers total cost. In our scans it cut travel by anywhere from 1% to about a third compared with the naive order, and the shared loop is far cheaper than a separate trip to each settlement.

### 7. Country estimates

Every country gets a national figure, scanned or not:

- **People** = World Bank rural population × 56% without coverage.
- **Cost** = people × the cost per person observed in that country's scans, or the average across all scans, or $11 when there are no scans yet.

Countries without scans are split into placeholder regions on the map, labeled "estimate only".

---

## Running it

```bash
npm install                   # repo root: detector + batch scanner
node prepare-osm.js           # once per computer: local Nigeria map data (needs osmium-tool)
cd web && npm install && npm run dev   # the map, at http://localhost:3000
```

`prepare-osm.js` downloads Nigeria's OpenStreetMap file from Geofabrik (~700 MB) and uses [osmium](https://osmcode.org/osmium-tool/) (`brew install osmium-tool`) to save its places, health facilities and roads to `osm-data/` (~240 MB, git-ignored). Scans inside it read that data instead of asking the public Overpass servers, which are often busy: a scan takes seconds instead of minutes. Outside it, and on Vercel, scans fall back to Overpass. Re-run it now and then for fresher data.

`scan-batch.js` runs the detector on many boxes and saves each one to `web/data/scans/` as soon as it finishes. The map picks up new scans within 20 seconds.

| Command | What it does |
|---------|--------------|
| `node scan-batch.js --hours 2 --grid 566 --new-only` | Scan new 4 × 4 km grid cells across Nigeria (566), in a fixed shuffled order |
| `node scan-batch.js --hours 2 --grid 566 --rescan-old` | Re-run Nigeria scans made with older rules |
| `node scan-batch.js --hours 2 --grid 566 --shard 1/2` | Split one grid across computers (`1/2` and `2/2`) |
| `node scan-batch.js --rescan <id>` | Re-run one saved scan by its id |
| `node scan-batch.js --hours 2` | Sample high zero-dose countries, boxes centered on random OSM villages |

Several computers can scan at once. Each saved scan is its own pair of files, so results merge through git without conflicts, and every scan is also saved to Supabase. Without local map data, use separate networks: Overpass limits requests per IP.

The map also has **Scan this view**: zoom in far enough and the current view is scanned on the server and saved like any other scan.

---

## Limitations

- **Color is a weak signal at 1.2 m per pixel.** Small tin roofs are only 4–6 pixels across. The rules above remove most false positives (red soil, roads, field edges), but they also miss some real villages. Treat satellite-only settlements as leads, not facts.
- **Planned fix:** use building outlines from [Google Open Buildings](https://sites.research.google/gr/open-buildings/) or [Microsoft Global ML Building Footprints](https://github.com/microsoft/GlobalMLBuildingFootprints) instead of pixel colors. Routing, tours and the map would stay the same.
- **Costs are planning assumptions:** $10 per person, $100 per visit and the road rates have not been checked against field data yet.
- **Verify before publishing.** Detected locations should be checked by local health teams before any public map or OpenStreetMap edit.

---

## Data sources

| Dataset | Use | License |
|---------|-----|---------|
| [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9) | Satellite tiles | Esri terms; check before redistributing |
| OpenStreetMap (via Overpass) | Places, clinics, roads | ODbL 1.0 |
| World Bank `SP.RUR.TOTL` | Rural population | World Bank terms |
| Natural Earth (world-atlas) | Country borders | Public domain |

## References

| Claim | Source |
|-------|--------|
| ~2.1M zero-dose children in Nigeria (2023) | [WHO/UNICEF immunization estimates](https://data.unicef.org/topic/child-health/immunization/) |
| ~3.46B rural population | [World Bank `SP.RUR.TOTL`](https://data.worldbank.org/indicator/SP.RUR.TOTL) |
| 56% rural vs 22% urban without health coverage | [ILO, rural health protection](https://www.ilo.org/sites/default/files/wcmsp5/groups/public/@ed_protect/@soc_sec/documents/publication/wcms_383890.pdf) |
| Zero-dose children in remote rural areas | [PLOS Global Public Health (2023)](https://journals.plos.org/globalpublichealth/article?id=10.1371/journal.pgph.0001126) |

The ILO figure measures legal health coverage, not vaccine access specifically.

---

**Hestia**: connecting rural settlements to the healthcare they need, one route at a time.
