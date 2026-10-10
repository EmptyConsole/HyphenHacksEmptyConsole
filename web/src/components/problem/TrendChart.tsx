import styles from "./ProblemPage.module.css";

type Point = { year: number; rural: number; urban: number };

const W = 560;
const H = 320;
const M = { top: 20, right: 92, bottom: 32, left: 36 };
const Y_MAX = 5;

type TrendChartProps = {
  data: Point[];
  /** Year urban population overtook rural, from annual data (5-year points would misplace it). */
  crossoverYear: number;
};

export default function TrendChart({ data, crossoverYear }: TrendChartProps) {
  const x0 = data[0].year;
  const x1 = data[data.length - 1].year;
  const x = (year: number) => M.left + ((year - x0) / (x1 - x0)) * (W - M.left - M.right);
  const y = (v: number) => H - M.bottom - (v / Y_MAX) * (H - M.top - M.bottom);

  const line = (key: "rural" | "urban") =>
    data.map((d, i) => `${i ? "L" : "M"}${x(d.year).toFixed(1)},${y(d[key]).toFixed(1)}`).join("");
  const ruralArea = `${line("rural")}L${x(x1)},${y(0)}L${x(x0)},${y(0)}Z`;

  const last = data[data.length - 1];
  const cross = { year: crossoverYear, value: ruralAt(data, crossoverYear) };

  return (
    <svg
      className={styles.trend}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Rural population grew from ${data[0].rural} billion in ${x0} to ${last.rural} billion in ${x1}; urban population grew from ${data[0].urban} to ${last.urban} billion and overtook rural around ${cross.year}.`}
    >
      <defs>
        <linearGradient id="ruralFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--data-4)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--data-4)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0, 1, 2, 3, 4, 5].map((v) => (
        <g key={v}>
          <line className={styles.grid} x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} />
          <text className={styles.axis} x={M.left - 10} y={y(v) + 4} textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      {[1960, 1980, 2000, 2025].map((yr) => (
        <text key={yr} className={styles.axis} x={x(yr)} y={H - 8} textAnchor="middle">
          {yr}
        </text>
      ))}

      <path d={ruralArea} fill="url(#ruralFill)" />
      <path className={`${styles.line} ${styles.lineUrban}`} d={line("urban")} />
      <path className={`${styles.line} ${styles.lineRural}`} d={line("rural")} />

      <g className={styles.marker}>
        <line x1={x(cross.year)} x2={x(cross.year)} y1={y(cross.value) - 8} y2={y(4.6)} />
        <circle cx={x(cross.year)} cy={y(cross.value)} r={4} />
        <text x={x(cross.year) - 6} y={y(4.6) - 6} textAnchor="end">
          Cities pass rural areas, {cross.year}
        </text>
      </g>

      <text className={`${styles.endLabel} ${styles.endRural}`} x={x(x1) + 10} y={y(last.rural) + 5}>
        Rural {last.rural}B
      </text>
      <text className={`${styles.endLabel} ${styles.endUrban}`} x={x(x1) + 10} y={y(last.urban) + 5}>
        Urban {last.urban}B
      </text>
    </svg>
  );
}

function ruralAt(data: Point[], year: number) {
  const i = data.findIndex((d) => d.year >= year);
  if (i <= 0) return data[Math.max(i, 0)].rural;
  const a = data[i - 1];
  const b = data[i];
  return a.rural + ((year - a.year) / (b.year - a.year)) * (b.rural - a.rural);
}
