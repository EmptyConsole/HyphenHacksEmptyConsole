import styles from "./ProblemDiagrams.module.css";

/** Illustrative layout, not a real scan: one area drawn as an official map and as a satellite photo. */
const PANEL = { w: 264, h: 200, gap: 32, top: 28 };
const ROAD = "M0,150 C70,142 130,120 170,96 S240,40 264,30";
const TRACKS = ["M118,126 C110,96 80,70 52,58", "M196,74 C206,110 196,140 186,162"];
const TOWN = { x: 128, y: 118 };
const VILLAGES = [
  { x: 48, y: 54, r: 22 },
  { x: 188, y: 166, r: 20 },
  { x: 224, y: 116, r: 16 },
  { x: 40, y: 178, r: 16 },
];
const OFFSETS = [
  [-9, -7], [3, -10], [10, -2], [-4, 2], [7, 8], [-11, 6], [0, 12], [12, 11],
];
const TREES = [
  [20, 20], [96, 30], [150, 14], [230, 170], [100, 180], [70, 110], [244, 70], [160, 190], [16, 120], [120, 60],
];

function roofs(x: number, y: number, n: number) {
  return OFFSETS.slice(0, n).map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
}

function Clinic({ x, y }: { x: number; y: number }) {
  return (
    <g className={styles.clinicMark}>
      <circle cx={x} cy={y} r={9} />
      <path d={`M${x - 4} ${y}h8M${x} ${y - 4}v8`} />
    </g>
  );
}

export default function MapGap() {
  const right = PANEL.w + PANEL.gap;
  return (
    <svg
      className={styles.diagram}
      viewBox={`0 0 ${right + PANEL.w} ${PANEL.top + PANEL.h}`}
      role="img"
      aria-label="On the official map the area shows one road and one town with a clinic. The satellite view of the same area shows four more villages that the map leaves out."
    >
      <text className={styles.panelTitle} x={0} y={16}>
        Official map
      </text>
      <g transform={`translate(0,${PANEL.top})`}>
        <rect className={styles.mapBg} width={PANEL.w} height={PANEL.h} rx={10} />
        <path className={styles.mapRoad} d={ROAD} />
        <circle className={styles.mapTown} cx={TOWN.x} cy={TOWN.y} r={18} />
        <text className={styles.mapLabel} x={TOWN.x} y={TOWN.y + 34} textAnchor="middle">
          Town
        </text>
        <Clinic x={TOWN.x} y={TOWN.y} />
      </g>

      <text className={styles.panelTitle} x={right} y={16}>
        Satellite <tspan className={styles.foundLabel}>· {VILLAGES.length} villages the map left out</tspan>
      </text>
      <g transform={`translate(${right},${PANEL.top})`}>
        <rect className={styles.satBg} width={PANEL.w} height={PANEL.h} rx={10} />
        {TREES.map(([x, y]) => (
          <circle key={`${x},${y}`} className={styles.satTree} cx={x} cy={y} r={7} />
        ))}
        {TRACKS.map((d) => (
          <path key={d} className={styles.satTrack} d={d} />
        ))}
        <path className={styles.satRoad} d={ROAD} />
        <g className={styles.satTown}>
          {roofs(TOWN.x, TOWN.y, 8).map((p) => (
            <rect key={`${p.x},${p.y}`} x={p.x - 4} y={p.y - 3} width={8} height={6} rx={1} />
          ))}
        </g>
        {VILLAGES.map((v) => (
          <g key={`${v.x},${v.y}`}>
            <g className={styles.satRoofs}>
              {roofs(v.x, v.y, v.r > 18 ? 7 : 5).map((p) => (
                <rect key={`${p.x},${p.y}`} x={p.x - 3.5} y={p.y - 2.5} width={7} height={5} rx={1} />
              ))}
            </g>
            <circle className={styles.found} cx={v.x} cy={v.y} r={v.r} />
          </g>
        ))}
      </g>
    </svg>
  );
}
