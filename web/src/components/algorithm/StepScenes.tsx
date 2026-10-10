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

const PLACES = [
  { id: "north", name: "North hamlet", people: 30, trip: 80, note: "Recommended. Reaching 30 people here costs the least." },
  { id: "river", name: "River village", people: 80, trip: 160, note: "The most people, and the highest bill. A later stop." },
  { id: "hill", name: "Hill cluster", people: 15, trip: 320, note: "The fewest people, but the hard trip costs more than the vaccines." },
] as const;

function vaccineCost(people: number) {
  return people * 10 + 100;
}

function PickScene() {
  const places = PLACES.map((place) => {
    const vaccines = vaccineCost(place.people);
    return { ...place, vaccines, total: vaccines + place.trip };
  });
  const lowest = Math.min(...places.map((place) => place.total));
  const [selected, setSelected] = useState(places.find((place) => place.total === lowest)?.id ?? places[0].id);
  const current = places.find((place) => place.id === selected) ?? places[0];
  const max = Math.max(...places.map((place) => place.total));

  return (
    <div className={styles.scene}>
      <ul className={styles.places}>
        {places.map((place) => (
          <li key={place.id}>
            <button
              type="button"
              className={styles.place}
              data-on={selected === place.id || undefined}
              data-best={place.total === lowest || undefined}
              aria-pressed={selected === place.id}
              onClick={() => setSelected(place.id)}
            >
              <span className={styles.choiceName}>
                {place.name}
                {place.total === lowest && <span className={styles.badge}>First stop</span>}
              </span>
              <span className={styles.meter} style={{ "--fill": place.total / max } as CSSProperties}>
                <span />
              </span>
              <span className={styles.choiceCost}>{usd(place.total)}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className={styles.formula}>
        <span>
          {current.people} people → vaccines <strong>{usd(current.vaccines)}</strong>
        </span>
        <span>
          vaccines {usd(current.vaccines)} + trip {usd(current.trip)} = <strong>{usd(current.total)}</strong>
        </span>
      </p>
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
  pick: PickScene,
};

export default function StepScene({ id }: { id: StepId }) {
  const Scene = SCENES[id];
  return <Scene />;
}
