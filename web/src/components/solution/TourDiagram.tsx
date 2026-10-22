import styles from "./SolutionPage.module.css";

/**
 * Illustrative layout, not a real scan: one clinic and six villages. The faint loop is
 * "cheapest stop first"; the bright loop is the same stops after 2-opt.
 */
const POINTS: [number, number][] = [
  [24, 70], [75, 117], [174, 119], [124, 31], [152, 42], [84, 32], [106, 98],
].map(([x, y]) => [x * 2.4 + 8, y * 2.1 + 12]);
const GREEDY = [0, 1, 6, 3, 4, 5, 2, 0];
const IMPROVED = [0, 5, 3, 4, 2, 6, 1, 0];
const HOUSE_OFFSETS = [[-9, -6], [3, -8], [-4, 4]];

const d = (order: number[]) => order.map((k, i) => `${i ? "L" : "M"}${POINTS[k][0]},${POINTS[k][1]}`).join("");

export default function TourDiagram() {
  const [cx, cy] = POINTS[0];
  return (
    <svg
      className={styles.route}
      viewBox="0 0 560 320"
      role="img"
      aria-label="One team leaves the clinic, visits six villages and returns. The faint loop visits the cheapest next village each time and crosses itself; the bright loop is the same villages in a cheaper order."
    >
      <path className={styles.ghost} d={d(GREEDY)} />
      <path className={`${styles.leg} ${styles.legRoad}`} d={d(IMPROVED)} />
      <g className={styles.houses}>
        {POINTS.slice(1).flatMap(([x, y]) =>
          HOUSE_OFFSETS.map(([dx, dy]) => (
            <rect key={`${x + dx},${y + dy}`} x={x + dx} y={y + dy} width={9} height={7} rx={1.5} />
          )),
        )}
      </g>
      <g className={styles.clinicChosen}>
        <circle cx={cx} cy={cy} r={13} />
        <path d={`M${cx - 6} ${cy}h12M${cx} ${cy - 6}v12`} />
        <text x={cx - 13} y={cy - 22}>
          Clinic · start and end
        </text>
      </g>
    </svg>
  );
}
