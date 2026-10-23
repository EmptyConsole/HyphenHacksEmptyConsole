"use client";

import { useId, useState, type CSSProperties, type ReactElement } from "react";
import type { StepId } from "@/content/algorithm";
import { useLocale } from "@/i18n/LocaleProvider";
import { formatUsd } from "@/lib/format";
import styles from "./AlgorithmView.module.css";

function PictureScene() {
  const { t } = useLocale();
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
      <p className={styles.sceneNote}>{t("scenes.pictureNote")}</p>
      <button type="button" className={styles.textButton} onClick={() => setRun((value) => value + 1)}>
        {t("scenes.loadAgain")}
      </button>
    </div>
  );
}

const CELLS = [
  "tree", "tree", "tile", "water", "dark", "metal", "road", "pale",
  "tile", "tree", "pale", "road", "tile", "water", "tree", "metal",
  "dark", "metal", "tree", "tile", "road", "pale", "water", "tree",
] as const;

function RoofsScene() {
  const { t } = useLocale();
  const [mode, setMode] = useState<"play" | "all" | "roofs">("play");
  const kept = mode !== "all";
  const cellLabel: Record<(typeof CELLS)[number], string> = {
    tree: t("scenes.trees"),
    water: t("scenes.water"),
    dark: t("scenes.shadow"),
    road: t("scenes.road"),
    tile: t("scenes.redTile"),
    pale: t("scenes.concrete"),
    metal: t("scenes.metalRoof"),
  };

  return (
    <div className={styles.scene}>
      <div className={styles.pixelGrid} data-mode={mode}>
        {CELLS.map((kind, index) => (
          <span
            key={index}
            className={styles.pixel}
            data-kind={kind}
            data-keep={kind === "tile" || kind === "pale" || kind === "metal" || undefined}
            title={cellLabel[kind]}
          />
        ))}
      </div>
      <div className={styles.choiceRow} role="group" aria-label={t("scenes.keepLabel")}>
        <button type="button" className={styles.choice} data-on={mode === "all" || undefined} aria-pressed={mode === "all"} onClick={() => setMode("all")}>
          {t("scenes.wholePicture")}
        </button>
        <button type="button" className={styles.choice} data-on={kept || undefined} aria-pressed={kept} onClick={() => setMode("roofs")}>
          {t("scenes.roofsOnly")}
        </button>
      </div>
      <p className={styles.sceneNote}>
        {kept ? t("scenes.roofsKept") : t("scenes.roofsAll")}
      </p>
    </div>
  );
}

function JoinScene() {
  const { t } = useLocale();
  const [run, setRun] = useState(0);

  return (
    <div className={styles.scene}>
      <svg key={run} className={styles.joinArt} viewBox="0 0 240 140" role="img" aria-label={t("scenes.joinLabel")}>
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
      <p className={styles.sceneNote}>{t("scenes.joinNote")}</p>
      <button type="button" className={styles.textButton} onClick={() => setRun((value) => value + 1)}>
        {t("scenes.joinAgain")}
      </button>
    </div>
  );
}

// Mirrors footprintCertainty() in detectVillages.mjs.
const SAMPLE = { buildings: 6, compactness: 0.36, roofShare: 0.11 };

function satelliteScore(buildings: number, compactness: number, roofShare: number) {
  const buildingScore = Math.min(buildings / 8, 1);
  const shapeScore = Math.min(compactness / 0.45, 1);
  const roofScore = Math.min(roofShare / 0.15, 1);
  const score = 100 * (0.45 * buildingScore + 0.3 * shapeScore + 0.25 * roofScore);
  return {
    total: Math.min(99, Math.round(score)),
    parts: [
      { label: "Buildings", hint: "45% of the score", fill: buildingScore },
      { label: "Compact shape", hint: "30% of the score", fill: shapeScore },
      { label: "Area covered by buildings", hint: "25% of the score", fill: roofScore },
    ],
  };
}

function CheckScene() {
  const { t } = useLocale();
  const [mapped, setMapped] = useState(true);
  const score = satelliteScore(SAMPLE.buildings, SAMPLE.compactness, SAMPLE.roofShare);
  const parts = [
    { label: t("scenes.scoreBuildings"), hint: t("scenes.scoreBuildingsHint"), fill: score.parts[0].fill },
    { label: t("scenes.scoreShape"), hint: t("scenes.scoreShapeHint"), fill: score.parts[1].fill },
    { label: t("scenes.scoreCover"), hint: t("scenes.scoreCoverHint"), fill: score.parts[2].fill },
  ];

  return (
    <div className={styles.scene}>
      <div className={styles.choiceRow} role="group" aria-label={t("scenes.mappedLabel")}>
        <button type="button" className={styles.choice} data-on={mapped || undefined} aria-pressed={mapped} onClick={() => setMapped(true)}>
          {t("scenes.onTheMap")}
        </button>
        <button type="button" className={styles.choice} data-on={!mapped || undefined} aria-pressed={!mapped} onClick={() => setMapped(false)}>
          {t("scenes.notOnTheMap")}
        </button>
      </div>
      {mapped ? (
        <p className={styles.score}>
          <span className={styles.scoreValue}>100</span>
          <span>{t("scenes.certaintyMapped")}</span>
        </p>
      ) : (
        <>
          <p className={styles.score}>
            <span className={styles.scoreValue}>{score.total}</span>
            <span>{t("scenes.certaintyAlone")}</span>
          </p>
          <ul className={styles.meters}>
            {parts.map((part) => (
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
          <p className={styles.sceneNote}>{t("scenes.checkExample")}</p>
        </>
      )}
    </div>
  );
}

function CostScene() {
  const { t, locale } = useLocale();
  const id = useId();
  const [homes, setHomes] = useState(8);
  // Mirrors PEOPLE_PER_HOME and the vaccination cost in detectVillages.mjs.
  const people = Math.round(homes * 4.7);
  const cost = people * 10 + 100;

  return (
    <div className={styles.scene}>
      <label className={styles.sliderLabel} htmlFor={id}>
        {t("scenes.homes")}
        <span>{homes}</span>
      </label>
      <input
        id={id}
        className={styles.slider}
        type="range"
        min={1}
        max={16}
        value={homes}
        onChange={(event) => setHomes(Number(event.target.value))}
      />
      <p className={styles.formula}>
        <span>
          {t("scenes.homesFormula", { homes, people })}
        </span>
        <span>
          {t("scenes.costFormula", { people, cost: formatUsd(cost, locale, 0) })}
        </span>
      </p>
      <p className={styles.sceneNote}>{t("scenes.costNote")}</p>
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
    note: "Clinic A is the farthest away. The road is paved though, so it is the cheapest trip and Hestia picks it.",
  },
  {
    id: "track",
    name: "Clinic B",
    road: "Dirt track",
    km: 6,
    rate: 4.5,
    d: "M 36 70 L 196 70",
    note: "The track is shorter. It costs $4.50 per kilometer, so the trip costs more than the paved road.",
  },
  {
    id: "none",
    name: "Clinic C",
    road: "No road",
    km: 3,
    rate: 8,
    d: "M 36 112 C 110 112, 150 92, 196 70",
    note: "It is only 3 kilometers. There is no road though, so the team goes slowly and every kilometer costs $8.",
  },
] as const;

function TripScene() {
  const { t, locale } = useLocale();
  const priced = ROUTES.map((route) => ({ ...route, cost: Math.round(route.km * route.rate) }));
  const lowest = Math.min(...priced.map((route) => route.cost));
  const [selected, setSelected] = useState(priced.find((route) => route.cost === lowest)?.id ?? priced[0].id);
  const current = priced.find((route) => route.id === selected) ?? priced[0];
  const nameKey = { primary: "scenes.clinicA", track: "scenes.clinicB", none: "scenes.clinicC" } as const;
  const roadKey = { primary: "scenes.primaryRoad", track: "scenes.dirtTrack", none: "scenes.noRoad" } as const;
  const noteKey = { primary: "scenes.notePrimary", track: "scenes.noteTrack", none: "scenes.noteNone" } as const;

  return (
    <div className={styles.scene}>
      <div className={styles.diagram}>
        <span>{t("scenes.clinics")}</span>
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
        <span>{t("scenes.village")}</span>
      </div>
      <div className={styles.choices} role="group" aria-label={t("scenes.tripsLabel")}>
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
              {t(nameKey[route.id])}
              {route.cost === lowest && <span className={styles.badge}>{t("scenes.lowest")}</span>}
            </span>
            <span className={styles.choiceMeta}>
              {t("scenes.tripMeta", { km: route.km, road: t(roadKey[route.id]) })}
            </span>
            <span className={styles.choiceCost}>
              {t("scenes.tripCost", { km: route.km, rate: route.rate.toFixed(2), cost: formatUsd(route.cost, locale, 0) })}
            </span>
          </button>
        ))}
      </div>
      <p className={styles.sceneNote}>{t(noteKey[current.id])}</p>
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
    name: "Cheapest stop first",
    order: [0, 1, 6, 3, 4, 5, 2, 0],
    note: "Going to the village that's cheapest to reach next each time seems like it would work. Then the route goes back the way it came and crosses over itself.",
  },
  {
    id: "improved",
    name: "After 2-opt",
    order: [0, 5, 3, 4, 2, 6, 1, 0],
    note: "2-opt reverses parts of the loop if that makes it cheaper, and stops when nothing helps. These are the same villages without the crossings.",
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
  const { t, locale } = useLocale();
  const tours = TOURS.map((tour) => {
    const km = tourKm(tour.order);
    return { ...tour, km, cost: km * TOUR_USD_PER_KM };
  });
  const lowest = Math.min(...tours.map((tour) => tour.cost));
  const [selected, setSelected] = useState<string>(tours[0].id);
  const current = tours.find((tour) => tour.id === selected) ?? tours[0];
  const d = current.order.map((k, i) => `${i ? "L" : "M"} ${TOUR_POINTS[k][0]} ${TOUR_POINTS[k][1]}`).join(" ");
  const nameKey = { greedy: "scenes.greedy", improved: "scenes.improved" } as const;
  const noteKey = { greedy: "scenes.noteGreedy", improved: "scenes.noteImproved" } as const;

  return (
    <div className={styles.scene}>
      <div className={styles.diagram}>
        <span>{t("scenes.clinic")}</span>
        <svg viewBox="0 0 220 140" aria-hidden="true">
          <path key={current.id} className={styles.path} data-on d={d} pathLength={1} />
          <circle className={styles.clinicDot} cx={TOUR_POINTS[0][0]} cy={TOUR_POINTS[0][1]} r="5" />
          {TOUR_POINTS.slice(1).map(([x, y]) => (
            <circle key={`${x},${y}`} className={styles.villageDot} cx={x} cy={y} r="5" />
          ))}
        </svg>
        <span>{t("scenes.sixVillages")}</span>
      </div>
      <div className={styles.choices} role="group" aria-label={t("scenes.tourLabel")}>
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
              {t(nameKey[tour.id])}
              {tour.cost === lowest && <span className={styles.badge}>{t("scenes.lowest")}</span>}
            </span>
            <span className={styles.choiceMeta}>{t("scenes.roundTrip", { km: tour.km })}</span>
            <span className={styles.choiceCost}>
              {t("scenes.tripCost", {
                km: tour.km,
                rate: TOUR_USD_PER_KM.toFixed(2),
                cost: formatUsd(tour.cost, locale, 0),
              })}
            </span>
          </button>
        ))}
      </div>
      <p className={styles.sceneNote}>{t(noteKey[current.id])}</p>
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
