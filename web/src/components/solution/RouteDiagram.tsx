"use client";

import { useLocale } from "@/i18n/LocaleProvider";
import styles from "./SolutionPage.module.css";

/** Illustrative layout, not a real scan: three clinics, one settlement, the cheapest trip highlighted. */
const VILLAGE = { x: 488, y: 168 };
const CHOSEN = { x: 56, y: 200 };
const ROAD = [CHOSEN, { x: 150, y: 184 }, { x: 250, y: 196 }];
const TRACK = [ROAD[2], { x: 330, y: 170 }, { x: 404, y: 178 }];
const OFFROAD = [TRACK[2], { x: 462, y: 170 }];
const OTHERS = [
  { x: 118, y: 60, path: [{ x: 250, y: 70 }, { x: 380, y: 110 }, { x: 462, y: 162 }] },
  { x: 140, y: 284, path: [{ x: 300, y: 280 }, { x: 440, y: 272 }, { x: 480, y: 196 }] },
];
const HOUSES = [
  [470, 156], [484, 150], [498, 156], [474, 172], [490, 166], [504, 172], [480, 186], [496, 184],
];

type Pt = { x: number; y: number };
const d = (pts: Pt[]) => pts.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join("");

function Clinic({ x, y, label, chosen }: Pt & { label: string; chosen?: boolean }) {
  return (
    <g className={chosen ? styles.clinicChosen : styles.clinic}>
      <circle cx={x} cy={y} r={13} />
      <path d={`M${x - 6} ${y}h12M${x} ${y - 6}v12`} />
      <text x={chosen ? x - 13 : x} y={y + 30} textAnchor={chosen ? "start" : "middle"}>
        {label}
      </text>
    </g>
  );
}

export default function RouteDiagram() {
  const { t } = useLocale();
  return (
    <svg
      className={styles.route}
      viewBox="0 0 560 320"
      role="img"
      aria-label={t("diagrams.routeDiagramLabel")}
    >
      {OTHERS.map((c) => (
        <path key={c.x} className={styles.ghost} d={d([c, ...c.path])} />
      ))}

      <path className={`${styles.leg} ${styles.legRoad}`} d={d(ROAD)} />
      <path className={`${styles.leg} ${styles.legTrack}`} d={d(TRACK)} />
      <path className={`${styles.leg} ${styles.legOffroad}`} d={d(OFFROAD)} />
      {[ROAD[1], ROAD[2], TRACK[1], TRACK[2]].map((p) => (
        <circle key={`${p.x},${p.y}`} className={styles.star} cx={p.x} cy={p.y} r={4} />
      ))}

      <g className={styles.legLabel}>
        <text x={150} y={170} textAnchor="middle">{t("diagrams.pavedRate")}</text>
        <text x={330} y={150} textAnchor="middle">{t("diagrams.trackRate")}</text>
        <text x={420} y={208} textAnchor="middle">{t("diagrams.noRoadRate")}</text>
      </g>

      <g className={styles.houses}>
        {HOUSES.map(([x, y]) => (
          <rect key={`${x},${y}`} x={x} y={y} width={10} height={8} rx={1.5} />
        ))}
      </g>
      <text className={styles.villageLabel} x={VILLAGE.x + 4} y={VILLAGE.y - 30} textAnchor="middle">
        {t("diagrams.settlement")}
      </text>

      {OTHERS.map((c, i) => (
        <Clinic key={c.x} x={c.x} y={c.y} label={t(i ? "diagrams.clinicC" : "diagrams.clinicB")} />
      ))}
      <Clinic {...CHOSEN} label={t("diagrams.clinicACheapest")} chosen />
    </svg>
  );
}
