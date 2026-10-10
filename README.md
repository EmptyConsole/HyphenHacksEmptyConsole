# Hestia — Unmapped Village Discovery & Vaccination Routing

**Short summary:** A tool that finds rural settlements missing from official maps and census lists, then plans reachable routes from the nearest health facilities so vaccination and aid teams can reach people who would otherwise be skipped.

---

## Table of contents

1. [The problem](#the-problem)
2. [Why this matters](#why-this-matters)
3. [The idea](#the-idea)
4. [Theme: constellations as connections](#theme-constellations-as-connections)
5. [How it works (overview)](#how-it-works-overview)
6. [Pipeline in detail](#pipeline-in-detail)
7. [Routing: mapped roads and the last mile](#routing-mapped-roads-and-the-last-mile)
8. [Why routing is almost always possible](#why-routing-is-almost-always-possible)
9. [Routing step by step](#routing-step-by-step)
10. [Backend → frontend contract](#backend--frontend-contract)
11. [Data sources & licenses](#data-sources--licenses)
12. [False positives & human verification](#false-positives--human-verification)
13. [Cost & population estimation](#cost--population-estimation)
14. [Feedback loop: OpenStreetMap](#feedback-loop-openstreetmap)
15. [Architecture (planned)](#architecture-planned)
16. [References & statistics](#references--statistics)
17. [Project status](#project-status)
18. [License & contribution](#license--contribution)

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

1. **Scans** open satellite-derived **building footprint** data for **clusters of rooftops** (candidate settlements).  
2. **Compares** those clusters with **OpenStreetMap (OSM)** places, buildings, and roads.  
3. **Flags** settlements that **nobody has recorded** (or that are materially offset from OSM).  
4. For each flag, **suggests a route** from the nearest clinic or team base so health workers can **reach and verify** the site.  
5. After verification, **returns confirmed settlements to OSM** so the next campaign starts from a better map.

The core insight: **buildings from space** and **places on OSM** are two imperfect views of the same ground truth. Their **disagreement** is a strong signal for “here might be people planners don’t see.”

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
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│ Building footprints │     │ Cluster → candidate │     │ Compare with OSM    │
│ (Google / Microsoft │ ──► │ settlements (DBSCAN)  │ ──► │ places, buildings,  │
│  or custom detection)│     │                     │     │ roads → gap flags   │
└─────────────────────┘     └─────────────────────┘     └──────────┬──────────┘
                                                                     │
                    ┌────────────────────────────────────────────────┘
                    ▼
         ┌─────────────────────┐     ┌─────────────────────┐
         │ Filter false        │     │ Route: OSRM /       │
         │ positives (sheds,   │ ──► │ Valhalla + terrain  │
         │ abandoned sites)    │     │ last-mile estimate  │
         └─────────────────────┘     └──────────┬──────────┘
                                                │
                    ┌───────────────────────────┘
                    ▼
         ┌─────────────────────┐     ┌─────────────────────┐
         │ Hand list to local    │     │ Confirmed places    │
         │ health workers verify │ ──► │ written back to OSM │
         └─────────────────────┘     └─────────────────────┘
```

You can **almost always** produce **a route** to a flagged village. What varies is how much of that route follows **real, mapped** road network versus an **estimated** walking segment off the network.

---

## Pipeline in detail

### Step 1 — Obtain building footprints

**Inputs (choose one or fuse several):**

- **[Google Open Buildings](https://sites.research.google/gr/open-buildings/)** — global footprint polygons from open imagery; dual-licensed **CC BY 4.0** or **ODbL 1.0** (pick one license for your use case).  
- **[Microsoft Global ML Building Footprints](https://github.com/microsoft/GlobalMLBuildingFootprints)** — billions of footprints from Bing Maps imagery; **CDLA Permissive 2.0**.  
- **Custom detection** — train or run inference on open imagery (e.g. Sentinel-2, Maxar where licensed) if you need fresher or region-specific coverage.

**Output:** A geospatial layer of polygon or point building geometries for the region of interest (e.g. a state, LGA, or custom AOI).

**Notes:**

- Footprints are **imperfect** (merged buildings, missed huts, industrial roofs). The pipeline treats them as **evidence**, not ground truth.  
- Align all layers to a common CRS (typically **EPSG:4326** for storage, local UTM for distance/clustering).

---

### Step 2 — Cluster buildings into candidate settlements

**Goal:** Turn millions of isolated footprints into **candidate hamlets/villages**.

**Typical approach:**

- Convert footprints to **centroids** or **weighted points** (weight = footprint area).  
- Cluster in projected coordinates using **DBSCAN** (or HDBSCAN):
  - **`eps`**: maximum distance between buildings in the same settlement (tune per context—dense savanna vs sparse Sahel).  
  - **`min_samples`**: minimum buildings to form a cluster (filters lone farm structures early).

**Output per cluster:**

- Centroid or concave hull polygon  
- Building count, total footprint area, density  
- Optional: confidence score from cluster cohesion

**Parameter tuning:** Urban periphery and rural Nigeria may need **different** `eps` / `min_samples`. Document defaults per biome and allow overrides per deployment.

---

### Step 3 — Compare with OpenStreetMap and flag gaps

**OSM layers to load** (via Overpass, Geofabrik extract, or planet subset):

- `place=*` (hamlet, village, town, isolated_dwelling, etc.)  
- `building=*`  
- `highway=*` (for proximity and routing context)

**For each candidate cluster, compute:**

| Check | Purpose |
|-------|---------|
| Nearest OSM `place` within radius *R* | If none, **strong unmapped flag** |
| Nearest OSM building | Detect mapped structures without place tags |
| Distance / offset if a place exists nearby | **Positional mismatch** (satellite cluster vs OSM node) |
| Road proximity | Context for routing; not always required for flagging |

**Flag types (example taxonomy):**

- **`UNMAPPED`** — no place tag within *R*  
- **`OFFSET`** — place exists but centroid &gt; *d* meters from cluster  
- **`PARTIAL`** — buildings on OSM but no settlement place  
- **`CONFIRMED`** — matches after field visit (downstream)

Store provenance: building source, OSM changeset date, algorithm version.

---

### Step 4 — Filter false positives

Not every rooftop cluster is a village needing vaccines.

**Common false positives:**

- **Farm sheds and granaries** — small, linear along fields  
- **Abandoned or seasonal sites** — low building count, no path wear in imagery  
- **Industrial / commercial** — large single footprints, non-residential land cover  
- **Mining or construction camps** — atypical spatial pattern

**Filters (combine heuristics + optional ML):**

- Minimum building count and **residential-like** footprint size distribution  
- **Land cover** (ESA WorldCover, MODIS): exclude predominant water, bare rock, industrial  
- **Distance to known agricultural patterns** (optional)  
- **Temporal consistency** (Open Buildings Temporal) — persistent clusters vs ephemeral

**Human-in-the-loop:** Filters reduce noise; **field verification remains authoritative**.

---

### Step 5 — Routing to each flagged settlement

See [Routing: mapped roads and the last mile](#routing-mapped-roads-and-the-last-mile) and [Routing step by step](#routing-step-by-step).

**Engines:** [OSRM](http://project-osrm.org/), [Valhalla](https://valhalla.github.io/valhalla/), or GraphHopper on OSM road graphs from [Geofabrik](https://download.geofabrik.de/) extracts.

**Profiles:** `car`, `motorcycle`, or `foot` depending on how teams actually travel.

**Output:** GeoJSON (or equivalent) with **two segments** when needed:

1. **Mapped network** — snap to nearest road, route to closest approach point  
2. **Estimated off-network** — least-cost path from road end to village centroid

Label each segment with `source: "osm_routed" | "terrain_estimated"` and attach **distance**, **duration**, and **uncertainty** metadata.

---

### Step 6 — Field verification and OSM write-back

1. Export prioritized list (map + offline pack if needed).  
2. Health workers visit; confirm population, name, accessibility.  
3. For confirmed sites, create or fix OSM entities (`place=hamlet`, `place=village`, buildings, tracks).  
4. Mark internal records **`VERIFIED`** and link to OSM id.

This closes the loop: the next gap-analysis run should **not** re-flag verified settlements.

---

## Routing: mapped roads and the last mile

| Segment | Data source | Trust level |
|---------|-------------|-------------|
| Clinic → along mapped roads | OSM + OSRM/Valhalla | High where OSM completeness is good |
| Road end → village centroid | Terrain / land-cover cost grid | Medium—estimate, not survey |
| Total time/distance | Sum of segments + mode assumptions | Disclose assumptions in UI |

**UI requirement:** Show mapped and estimated portions **differently** (color, linestyle, legend). Never present an estimated foot path as surveyed road.

---

## Why routing is almost always possible

Routing needs:

1. A **network** of roads and paths  
2. A **start** (clinic, depot, team base) and **end** (flagged village)

You already have the **end** from clustering. The **network** comes from OSM. Even where mapping is sparse, OSM often contains **main roads and many tracks**—mappers have traced substantial coverage across much of Nigeria and many other regions from satellite imagery.

A village with **no road mapped to its doorstep** still sits **near** some road feature in most cases. The engine routes to the **nearest point on the network**, then the system handles the **gap** explicitly.

---

## Routing step by step

### 1. Pick the start point

Use the **nearest health facility** from:

- OSM (`amenity=clinic`, `amenity=hospital`, `healthcare=*`, etc.), and/or  
- **National master facility lists** (DHIS2, MoH shapefiles) when OSM is incomplete  

Alternatively use a **fixed team base** for a campaign week.

**Rule:** Document which source wins when multiple clinics are equidistant (e.g. prefer public PHC over private pharmacy).

### 2. Route over the mapped network

1. Load a regional OSM extract into the routing engine.  
2. Select profile: **motorbike** is common for rural outreach; **foot** for last-mile-only planning.  
3. Compute shortest or fastest path from **start** to **snap point** near the village.

### 3. Find the end of the road

- Snap village location (cluster centroid) to **nearest edge** on the routable graph.  
- Record **`off_network_distance_m`**: geodesic or projected distance from snap point to true centroid.

### 4. Cover the gap (when off-network distance is significant)

If the village is more than a **few hundred meters** from the nearest routable edge:

1. Build a **cost grid** from terrain and land cover:  
   - **High cost:** water, steep slopes, dense vegetation  
   - **Low cost:** open ground, bare earth, existing visible tracks in imagery  
2. Run **least-cost path** from road snap point to village:  
   - Python: `skimage.graph.route_through_array`  
   - GRASS GIS: `r.walk`  
3. Optionally refine using **visible paths** between buildings in high-resolution imagery (manual or CV-assisted).

### 5. Return the route with provenance

Response should include:

- Full geometry (MultiLineString with part indices)  
- Per-part labels: `osm_routed` vs `terrain_estimated`  
- Total distance, estimated time, routing profile  
- Warnings: e.g. `"off_network_km > 2"`, `"no clinic within 50 km"`

---

## Backend → frontend contract

The frontend map and planning views expect the backend to provide, **per polygon** (cluster / catchment / planning zone):

| Field | Type | Description |
|-------|------|-------------|
| `polygon` | GeoJSON Polygon/MultiPolygon | Boundary of cluster or aggregated planning area |
| `estimated_population` | number | Model estimate from building count × regional multiplier (document method) |
| `estimated_cost` | money object | Campaign cost estimate for serving this polygon (fuel, staff-days, cold chain—assumptions documented) |
| `flag_status` | enum | e.g. `UNMAPPED`, `OFFSET`, `VERIFIED` |
| `route` | GeoJSON Feature | LineString(s) with segment metadata |
| `nearest_facility` | Point + properties | Id, name, distance |
| `confidence` | 0–1 or low/med/high | Combined detection + OSM gap confidence |

**Aggregates for country- or region-level views:**

- Total estimated cost for all flagged routes needed  
- Count of polygons by status  
- Total estimated population in unmapped clusters  

Exact JSON schema to be versioned in `api/` when implemented; this README is the **product contract**.

---

## Data sources & licenses

| Dataset | Use | License |
|---------|-----|---------|
| Google Open Buildings | Building footprints | **CC BY 4.0** or **ODbL 1.0** (choose one) |
| Microsoft Global ML Building Footprints | Building footprints | **CDLA Permissive 2.0** |
| OpenStreetMap | Places, roads, facilities | **ODbL 1.0** (share-alike for DB derivatives) |
| Geofabrik OSM extracts | Routing graphs | ODbL (via OSM) |
| Copernicus Sentinel-2 | Imagery / land context | Copernicus license |
| ESA WorldCover / similar | Land cover costs | Check product license |

**Compliance:** Attribute Google/Microsoft/OSM per their terms. If contributing verified places to OSM, respect [ODbL](https://www.openstreetmap.org/copyright) and local mapping conventions.

---

## False positives & human verification

Algorithmic discovery **must not** auto-publish personal or sensitive locations at scale without local review. Workflow:

1. **Internal** flag list for authorized health/planning users  
2. **Field verification** before public OSM edits or public map tiles at high precision  
3. **Audit log** of who verified what and when  

Satellite clustering finds **candidates**; health workers find **communities**.

---

## Cost & population estimation

**Population (illustrative method—document constants per deployment):**

\[
\text{estimated\_population} = n_{\text{buildings}} \times \text{avg\_household\_size} \times \text{occupancy\_factor}
\]

Calibrate `avg_household_size` from DHS/MICS or national census for the region.

**Cost (illustrative components):**

- Travel distance × fuel / vehicle cost per km  
- Staff time (hours × daily rate)  
- Per-dose supplies and cold-chain allocation (optional module)  
- Amortized planning overhead per polygon  

The backend should expose **assumptions** so planners can sensitivity-test numbers.

---

## Architecture (planned)

```
┌──────────────┐    REST/GeoJSON     ┌──────────────┐
│   Frontend   │ ◄──────────────────► │   Backend    │
│  Map + tables│                      │  API + jobs  │
└──────────────┘                      └──────┬───────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    ▼                        ▼                        ▼
             ┌─────────────┐          ┌─────────────┐          ┌─────────────┐
             │ PostGIS /   │          │ Routing     │          │ Object      │
             │ spatial DB  │          │ OSRM/Valhalla│          │ storage     │
             └─────────────┘          └─────────────┘          └─────────────┘
                    ▲
                    │ batch pipelines
             ┌─────────────┐
             │ Clustering  │
             │ + OSM diff  │
             └─────────────┘
```

**Suggested components (not yet in repo):**

- `ingest/` — footprint download, clip to AOI  
- `detect/` — DBSCAN clustering, feature extraction  
- `osm/` — Overpass queries, gap logic  
- `route/` — graph build, off-network LCP  
- `api/` — polygons, routes, costs  
- `web/` — map UI, verification workflow  

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

This repository currently contains **product specification and algorithm design** (`ToDo.txt`, this README). Implementation of ingest, clustering, routing services, and the map frontend is **in progress / planned**.

**Near-term milestones:**

- [ ] AOI pipeline: footprints → clusters for one Nigerian LGA  
- [ ] OSM gap flags with export GeoJSON  
- [ ] OSRM routing + terrain last-mile prototype  
- [ ] API: polygons + population + cost fields  
- [ ] Verification export for field teams  
- [ ] OSM upload workflow for confirmed villages  

---

## License & contribution

License for application code: **TBD** (choose before public release). Third-party data remains under the licenses listed in [Data sources & licenses](#data-sources--licenses).

Contributions welcome once code lands: issues for false-positive patterns, regional DBSCAN defaults, and OSM tagging guidelines for verified hamlets.

---

**Hestia** — connecting rural settlements to the healthcare they need, one route at a time.
