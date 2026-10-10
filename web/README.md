# Hestia: web

Next.js frontend. Home page = rotating night-lights globe hero + drill-down map (world → country → region → village).

```bash
npm install
npm run dev   # http://localhost:3000
```

## Where to change things

| What | File |
|------|------|
| Headline, copy, nav tabs | `src/content/home.ts` |
| Design tokens (colors, type, spacing, motion) | `src/styles/tokens.css` + `src/design/tokens.ts` (see `DESIGN.md`) |
| Filler numbers / how many polygons per level | `src/data/fillerConfig.ts` |
| Swap filler for the real backend | implement `MapDataProvider` (`src/data/types.ts`) and export it from `src/data/index.ts` |
| Map tile source (OSM) | `src/components/map/mapStyle.ts` |

The map only consumes `estimated_population` and `estimated_cost` (USD) per polygon, matching the backend contract in the root README.

## Notes
- `predev`/`prebuild` copy MapLibre's web worker into `public/vendor/` (Turbopack breaks its default worker lookup).
- Globe textures come from `three-globe` examples; country borders from `world-atlas` (Natural Earth, public domain).
- OSM tiles are used directly from tile.openstreetmap.org. That is fine for a hackathon demo, but follow the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) and switch to another OSM tile host for real traffic.
