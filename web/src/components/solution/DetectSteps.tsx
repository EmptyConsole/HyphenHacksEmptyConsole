import styles from "./SolutionPage.module.css";

type Roof = [x: number, y: number, w: number, h: number, kind: "tile" | "pale" | "metal"];

/** Illustrative only: one village of nine roofs plus a lone shed in a 120×120 patch. */
const VILLAGE: Roof[] = [
  [30, 36, 11, 9, "tile"],
  [45, 30, 10, 9, "pale"],
  [60, 34, 12, 9, "metal"],
  [34, 51, 10, 10, "pale"],
  [49, 47, 12, 10, "tile"],
  [66, 50, 10, 10, "pale"],
  [40, 66, 11, 9, "metal"],
  [56, 63, 10, 11, "pale"],
  [71, 66, 9, 9, "tile"],
];
const SHED: Roof = [96, 98, 7, 5, "pale"];
const TREES = [
  [14, 18, 7], [24, 96, 9], [88, 24, 8], [102, 46, 6], [12, 60, 6], [84, 86, 5], [60, 104, 7], [104, 72, 5],
];
const SPECKLE = [[16, 22], [100, 28], [22, 100], [90, 84]];
const ROOF_COLOR = { tile: "#c98a5e", pale: "#d6d8dc", metal: "#7f97c9" };
const GROW = 5;

function hull(points: [number, number][]) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: [number, number][]) => {
    const out: [number, number][] = [];
    for (const pt of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], pt) <= 0) out.pop();
      out.push(pt);
    }
    return out.slice(0, -1);
  };
  return [...half(p), ...half([...p].reverse())];
}

const outline = hull(
  VILLAGE.flatMap(([x, y, w, h]) => [
    [x - GROW, y - GROW],
    [x + w + GROW, y - GROW],
    [x + w + GROW, y + h + GROW],
    [x - GROW, y + h + GROW],
  ]) as [number, number][],
);

function Roofs({ fill }: { fill?: string }) {
  return (
    <>
      {[...VILLAGE, SHED].map(([x, y, w, h, kind]) => (
        <rect key={`${x},${y}`} x={x} y={y} width={w} height={h} rx={1} fill={fill ?? ROOF_COLOR[kind]} />
      ))}
    </>
  );
}

function Grown() {
  return (
    <g className={styles.grown}>
      {[...VILLAGE, SHED].map(([x, y, w, h]) => (
        <rect key={`${x},${y}`} x={x - GROW} y={y - GROW} width={w + GROW * 2} height={h + GROW * 2} rx={GROW} />
      ))}
    </g>
  );
}

const ART = [
  <>
    <rect className={styles.satellite} width={120} height={120} rx={10} />
    <path className={styles.dirtRoad} d="M-4 90 C 30 82, 70 92, 124 78" />
    {TREES.map(([cx, cy, r]) => (
      <circle key={`${cx},${cy}`} className={styles.tree} cx={cx} cy={cy} r={r} />
    ))}
    <Roofs />
  </>,
  <>
    <rect className={styles.panel} width={120} height={120} rx={10} />
    {SPECKLE.map(([x, y]) => (
      <rect key={`${x},${y}`} className={styles.speckle} x={x} y={y} width={2.5} height={2.5} />
    ))}
    <Roofs fill="var(--data-4)" />
  </>,
  <>
    <rect className={styles.panel} width={120} height={120} rx={10} />
    <Grown />
    <Roofs fill="var(--data-4)" />
  </>,
  <>
    <rect className={styles.panel} width={120} height={120} rx={10} />
    <polygon className={styles.outline} points={outline.map((p) => p.join(",")).join(" ")} />
    <g className={styles.ghostRoofs}>
      {VILLAGE.map(([x, y, w, h]) => (
        <rect key={`${x},${y}`} x={x} y={y} width={w} height={h} rx={1} />
      ))}
    </g>
    {outline.map(([x, y]) => (
      <circle key={`${x},${y}`} className={styles.vertex} cx={x} cy={y} r={1.8} />
    ))}
    <rect className={styles.dropped} x={SHED[0] - 3} y={SHED[1] - 3} width={SHED[2] + 6} height={SHED[3] + 6} rx={2} />
    <path className={styles.droppedMark} d={`M${SHED[0] - 3} ${SHED[1] - 3} l${SHED[2] + 6} ${SHED[3] + 6}`} />
  </>,
];

export default function DetectSteps({ steps }: { steps: { title: string; text: string }[] }) {
  return (
    <ol className={styles.steps}>
      {steps.map((step, i) => (
        <li key={step.title} className={styles.step}>
          <svg className={styles.stepArt} viewBox="0 0 120 120" aria-hidden="true">
            {ART[i]}
          </svg>
          <span className={styles.stepNum}>{String(i + 1).padStart(2, "0")}</span>
          <span className={styles.stepTitle}>{step.title}</span>
          <span className={styles.stepText}>{step.text}</span>
        </li>
      ))}
    </ol>
  );
}
