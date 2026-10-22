import styles from "./ProblemDiagrams.module.css";

type Leg = { label: string; road: string; km: number; rate: number };

const CLINIC = { x: 56, y: 170 };
const VILLAGE = { x: 504, y: 170 };
const SHORT = `M${CLINIC.x},${CLINIC.y} C180,200 380,196 ${VILLAGE.x - 20},${VILLAGE.y}`;
const LONG = `M${CLINIC.x},${CLINIC.y} C110,30 450,30 ${VILLAGE.x - 20},${VILLAGE.y - 6}`;
const HOUSES = [
  [494, 160], [508, 156], [520, 164], [498, 176], [514, 178],
];

const cost = (leg: Leg) => `$${Math.round(leg.km * leg.rate)}`;

/** Illustrative layout: two ways from one clinic to one village, priced per km. */
export default function RouteChoice({ shortest, cheapest }: { shortest: Leg; cheapest: Leg }) {
  return (
    <svg
      className={styles.diagram}
      viewBox="0 0 560 240"
      role="img"
      aria-label={`${shortest.label}: ${shortest.km} km of ${shortest.road}, ${cost(shortest)}. ${cheapest.label}: ${cheapest.km} km of ${cheapest.road}, ${cost(cheapest)}.`}
    >
      <path className={styles.shortRoute} d={SHORT} />
      <path className={styles.cheapRoute} d={LONG} />

      <g className={styles.routeLabel}>
        <text x={280} y={46} textAnchor="middle">
          <tspan className={styles.cheapLabel}>{cheapest.label}</tspan> · {cheapest.km} km of {cheapest.road} ·{" "}
          <tspan className={styles.cheapLabel}>{cost(cheapest)}</tspan>
        </text>
        <text x={280} y={222} textAnchor="middle">
          <tspan className={styles.shortLabel}>{shortest.label}</tspan> · {shortest.km} km of {shortest.road} ·{" "}
          <tspan className={styles.shortLabel}>{cost(shortest)}</tspan>
        </text>
      </g>

      <g className={styles.clinicMark}>
        <circle cx={CLINIC.x} cy={CLINIC.y} r={14} />
        <path d={`M${CLINIC.x - 6} ${CLINIC.y}h12M${CLINIC.x} ${CLINIC.y - 6}v12`} />
      </g>
      <text className={styles.mapLabel} x={CLINIC.x} y={CLINIC.y + 34} textAnchor="middle">
        Clinic
      </text>

      <g className={styles.satRoofs}>
        {HOUSES.map(([x, y]) => (
          <rect key={`${x},${y}`} x={x} y={y} width={10} height={8} rx={1.5} />
        ))}
      </g>
      <text className={styles.mapLabel} x={VILLAGE.x + 6} y={VILLAGE.y + 34} textAnchor="middle">
        Village
      </text>
    </svg>
  );
}
