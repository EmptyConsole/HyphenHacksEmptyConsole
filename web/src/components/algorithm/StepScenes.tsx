"use client";

import { useId, useState, type CSSProperties, type ReactElement } from "react";
import type { StepId } from "@/content/algorithm";
import styles from "./AlgorithmView.module.css";

const usd = (value: number) => `$${value.toLocaleString("en-US")}`;

function PictureScene() {
  const [run, setRun] = useState(0);
  const tiles = [
    { roofs: [[18, 22, 16, 10], [42, 40, 14, 9]] },
    { roofs: [[22, 28, 18, 11], [48, 18, 12, 8]] },
    { roofs: [[16, 36, 14, 10], [40, 48, 20, 12]] },
    { roofs: [[28, 24, 16, 10], [52, 44, 12, 9]] },
  ];

  return (
    <div className={styles.scene}>
      <div className={styles.mosaic} key={run}>
        {tiles.map((tile, index) => (
          <div key={index} className={styles.tile} style={{ "--n": index } as CSSProperties}>
            {tile.roofs.map(([x, y, w, h]) => (
              <span key={`${x},${y}`} className={styles.miniRoof} style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }} />
            ))}
          </div>
        ))}
      </div>
      <p className={styles.sceneNote}>Four photos land, then the seams close. One picture.</p>
      <button type="button" className={styles.textButton} onClick={() => setRun((value) => value + 1)}>
        Stitch again
      </button>
    </div>
  );
}

const CELLS = [
  "tree", "tree", "tile", "water", "dark", "metal", "road", "pale",
  "tile", "tree", "pale", "road", "tile", "water", "tree", "metal",
  "dark", "metal", "tree", "tile", "road", "pale", "water", "tree",
] as const;

const CELL_LABEL: Record<(typeof CELLS)[number], string> = {
  tree: "Trees",
  water: "Water",
  dark: "Shadow",
  road: "Road",
  tile: "Red tile",
  pale: "Concrete",
  metal: "Metal roof",
};

function RoofsScene() {
  const [mode, setMode] = useState<"play" | "all" | "roofs">("play");
  const kept = mode !== "all";

  return (
    <div className={styles.scene}>
      <div className={styles.pixelGrid} data-mode={mode}>
        {CELLS.map((kind, index) => (
          <span
            key={index}
            className={styles.pixel}
            data-kind={kind}
            data-keep={kind === "tile" || kind === "pale" || kind === "metal" || undefined}
            title={CELL_LABEL[kind]}
          />
        ))}
      </div>
      <div className={styles.choiceRow} role="group" aria-label="What to keep from the picture">
        <button type="button" className={styles.choice} data-on={mode === "all" || undefined} aria-pressed={mode === "all"} onClick={() => setMode("all")}>
          Whole picture
        </button>
        <button type="button" className={styles.choice} data-on={kept || undefined} aria-pressed={kept} onClick={() => setMode("roofs")}>
          Roofs only
        </button>
      </div>
      <p className={styles.sceneNote}>
        {kept
          ? "Green, water, shadow, and the road fade. Red tile, concrete, and metal stay."
          : "This is the satellite picture before anything is removed."}
      </p>
    </div>
  );
}

function JoinScene() {
  const [run, setRun] = useState(0);

  return (
    <div className={styles.scene}>
      <svg key={run} className={styles.joinArt} viewBox="0 0 240 140" role="img" aria-label="Nearby roofs join into one outline. A lone shed is dropped.">
        <rect className={styles.ground} width="240" height="140" rx="10" />
        <path
          className={styles.trace}
          pathLength={1}
          d="M38 24 L118 18 L128 40 L120 92 L48 96 L30 58 Z"
        />
        <g className={styles.roofs}>
          <rect x="46" y="34" width="18" height="12" rx="1" />
          <rect x="70" y="28" width="16" height="12" rx="1" />
          <rect x="92" y="36" width="18" height="12" rx="1" />
          <rect x="54" y="52" width="20" height="14" rx="1" />
          <rect x="80" y="50" width="18" height="14" rx="1" />
          <rect x="62" y="70" width="22" height="12" rx="1" />
        </g>
        <g className={styles.shed}>
          <rect x="176" y="96" width="14" height="10" rx="1" />
          <path className={styles.shedMark} pathLength={1} d="M170 90 L196 112" />
        </g>
      </svg>
      <p className={styles.sceneNote}>Roofs close enough to touch become one village. The shed on its own is too small.</p>
      <button type="button" className={styles.textButton} onClick={() => setRun((value) => value + 1)}>
        Join again
      </button>
    </div>
  );
}

const SAMPLE = { buildings: 6, compactness: 0.36, roofShare: 0.28 };

function satelliteScore(buildings: number, compactness: number, roofShare: number) {
  const buildingScore = Math.min(buildings / 8, 1);
  const shapeScore = Math.min(compactness / 0.45, 1);
  const roofScore = Math.min(roofShare / 0.35, 1);
  const score = 100 * (0.45 * buildingScore + 0.3 * shapeScore + 0.25 * roofScore);
  return {
    total: Math.min(99, Math.round(score)),
    parts: [
      { label: "Roofs", hint: "45% of the score", fill: buildingScore },
      { label: "Compact shape", hint: "30% of the score", fill: shapeScore },
      { label: "Roof color", hint: "25% of the score", fill: roofScore },
    ],
  };
}

function CheckScene() {
  const [mapped, setMapped] = useState(true);
  const score = satelliteScore(SAMPLE.buildings, SAMPLE.compactness, SAMPLE.roofShare);

  return (
    <div className={styles.scene}>
      <div className={styles.choiceRow} role="group" aria-label="Whether OpenStreetMap already has this place">
        <button type="button" className={styles.choice} data-on={mapped || undefined} aria-pressed={mapped} onClick={() => setMapped(true)}>
          On the map
        </button>
        <button type="button" className={styles.choice} data-on={!mapped || undefined} aria-pressed={!mapped} onClick={() => setMapped(false)}>
          No name on the map
        </button>
      </div>
      {mapped ? (
        <p className={styles.score}>
          <span className={styles.scoreValue}>100</span>
          <span>Certainty. A mapped place confirms the village.</span>
        </p>
      ) : (
        <>
          <p className={styles.score}>
            <span className={styles.scoreValue}>{score.total}</span>
            <span>Certainty from the picture alone. It cannot reach 100.</span>
          </p>
          <ul className={styles.meters}>
            {score.parts.map((part) => (
              <li key={part.label}>
                <span className={styles.meterLabel}>
                  {part.label}
                  <span>{part.hint}</span>
                </span>
                <span className={styles.meter} style={{ "--fill": part.fill } as CSSProperties}>
                  <span />
                </span>
              </li>
            ))}
          </ul>
          <p className={styles.sceneNote}>This example has 6 roofs, a compactness of 0.36, and 28% roof-colored ground.</p>
        </>
      )}
    </div>
  );
}

function CostScene() {
  const id = useId();
  const [roofs, setRoofs] = useState(8);
  const people = roofs * 5;
  const cost = people * 10 + 100;

  return (
    <div className={styles.scene}>
      <label className={styles.sliderLabel} htmlFor={id}>
        Roofs
        <span>{roofs}</span>
      </label>
      <input
        id={id}
        className={styles.slider}
        type="range"
        min={1}
        max={16}
        value={roofs}
        onChange={(event) => setRoofs(Number(event.target.value))}
      />
      <p className={styles.formula}>
        <span>
          {roofs} roofs × 5 = <strong>{people} people</strong>
        </span>
        <span>
          {people} × $10 + $100 stop = <strong>{usd(cost)}</strong>
        </span>
      </p>
      <p className={styles.sceneNote}>Drag the slider. The stop costs $100 even for a tiny settlement.</p>
    </div>
  );
}

const ROUTES = [
  {
    id: "primary",
    name: "Clinic A",
    road: "Primary road",
    km: 12,
    rate: 1.4,
    d: "M 36 28 C 110 28, 150 48, 196 70",
    note: "Clinic A is the farthest, and still the cheapest, because the road is paved. Hestia keeps this trip.",
  },
  {
    id: "track",
    name: "Clinic B",
    road: "Dirt track",
    km: 6,
    rate: 4.5,
    d: "M 36 70 L 196 70",
    note: "A shorter track, but $4.50 per kilometer adds up to more than the paved road.",
  },
  {
    id: "none",
    name: "Clinic C",
    road: "No road",
    km: 3,
    rate: 8,
    d: "M 36 112 C 110 112, 150 92, 196 70",
    note: "Only 3 kilometers, but with no road the team moves slowly, so each kilometer costs $8.",
  },
] as const;

function TripScene() {
  const priced = ROUTES.map((route) => ({ ...route, cost: Math.round(route.km * route.rate) }));
  const lowest = Math.min(...priced.map((route) => route.cost));
  const [selected, setSelected] = useState(priced.find((route) => route.cost === lowest)?.id ?? priced[0].id);
  const current = priced.find((route) => route.id === selected) ?? priced[0];

  return (
    <div className={styles.scene}>
      <div className={styles.diagram}>
        <span>Clinics</span>
        <svg viewBox="0 0 220 140" aria-hidden="true">
          {priced.map((route) => (
            <path
              key={`${route.id}-${selected === route.id ? "on" : "off"}`}
              className={styles.path}
              data-on={selected === route.id || undefined}
              d={route.d}
              pathLength={1}
            />
          ))}
          <circle className={styles.clinicDot} cx="28" cy="28" r="5" />
          <circle className={styles.clinicDot} cx="28" cy="70" r="5" />
          <circle className={styles.clinicDot} cx="28" cy="112" r="5" />
          <circle className={styles.villageDot} cx="204" cy="70" r="6" />
        </svg>
        <span>Village</span>
      </div>
      <div className={styles.choices} role="group" aria-label="Clinic trips">
        {priced.map((route) => (
          <button
            key={route.id}
            type="button"
            className={styles.choice}
            data-on={selected === route.id || undefined}
            aria-pressed={selected === route.id}
            onClick={() => setSelected(route.id)}
          >
            <span className={styles.choiceName}>
              {route.name}
              {route.cost === lowest && <span className={styles.badge}>Lowest</span>}
            </span>
            <span className={styles.choiceMeta}>
              {route.km} km · {route.road}
            </span>
            <span className={styles.choiceCost}>
              {route.km} × ${route.rate.toFixed(2)} = {usd(route.cost)}
            </span>
          </button>
        ))}
      </div>
      <p className={styles.sceneNote}>{current.note}</p>
    </div>
  );
}

/** Illustrative layout: a clinic (index 0) and six villages. 10 units = 1 km. */
const TOUR_POINTS: [number, number][] = [
  [24, 70], [75, 117], [174, 119], [124, 31], [152, 42], [84, 32], [106, 98],
];
const TOUR_USD_PER_KM = 2;
const TOURS = [
  {
    id: "greedy",
    name: "Nearest stop first",
    order: [0, 1, 6, 3, 4, 5, 2, 0],
    note: "Always driving to the closest village left looks sensible, but the route doubles back and crosses itself.",
  },
  {
    id: "improved",
    name: "After 2-opt",
    order: [0, 5, 3, 4, 2, 6, 1, 0],
    note: "2-opt reverses any stretch of the loop that makes it cheaper, until no swap helps. Same villages, no crossings.",
  },
] as const;

function tourKm(order: readonly number[]) {
  let units = 0;
  for (let i = 1; i < order.length; i++) {
    const [ax, ay] = TOUR_POINTS[order[i - 1]];
    const [bx, by] = TOUR_POINTS[order[i]];
    units += Math.hypot(bx - ax, by - ay);
  }
  return Math.round(units / 10);
}

function TourScene() {
  const tours = TOURS.map((tour) => {
    const km = tourKm(tour.order);
    return { ...tour, km, cost: km * TOUR_USD_PER_KM };
  });
  const lowest = Math.min(...tours.map((tour) => tour.cost));
  const [selected, setSelected] = useState<string>(tours[0].id);
  const current = tours.find((tour) => tour.id === selected) ?? tours[0];
  const d = current.order.map((k, i) => `${i ? "L" : "M"} ${TOUR_POINTS[k][0]} ${TOUR_POINTS[k][1]}`).join(" ");

  return (
    <div className={styles.scene}>
      <div className={styles.diagram}>
        <span>Clinic</span>
        <svg viewBox="0 0 220 140" aria-hidden="true">
          <path key={current.id} className={styles.path} data-on d={d} pathLength={1} />
          <circle className={styles.clinicDot} cx={TOUR_POINTS[0][0]} cy={TOUR_POINTS[0][1]} r="5" />
          {TOUR_POINTS.slice(1).map(([x, y]) => (
            <circle key={`${x},${y}`} className={styles.villageDot} cx={x} cy={y} r="5" />
          ))}
        </svg>
        <span>6 villages</span>
      </div>
      <div className={styles.choices} role="group" aria-label="Tour order">
        {tours.map((tour) => (
          <button
            key={tour.id}
            type="button"
            className={styles.choice}
            data-on={selected === tour.id || undefined}
            aria-pressed={selected === tour.id}
            onClick={() => setSelected(tour.id)}
          >
            <span className={styles.choiceName}>
              {tour.name}
              {tour.cost === lowest && <span className={styles.badge}>Lowest</span>}
            </span>
            <span className={styles.choiceMeta}>{tour.km} km round trip</span>
            <span className={styles.choiceCost}>
              {tour.km} × ${TOUR_USD_PER_KM.toFixed(2)} = {usd(tour.cost)}
            </span>
          </button>
        ))}
      </div>
      <p className={styles.sceneNote}>{current.note}</p>
    </div>
  );
}

const SCENES: Record<StepId, () => ReactElement> = {
  picture: PictureScene,
  roofs: RoofsScene,
  join: JoinScene,
  check: CheckScene,
  cost: CostScene,
  trip: TripScene,
  tour: TourScene,
};

export default function StepScene({ id }: { id: StepId }) {
  const Scene = SCENES[id];
  return <Scene />;
}
