import type { CSSProperties } from "react";
import styles from "./ProblemDiagrams.module.css";

type Tone = "byCar" | "onFoot" | "near";

/** 100 squares, one per person. `byCar` and `onFoot` are percentages of the world population, and byCar ⊂ onFoot. */
export default function TravelWaffle({
  byCar,
  onFoot,
  labels,
}: {
  byCar: number;
  onFoot: number;
  labels: Record<Tone, string>;
}) {
  const car = Math.round(byCar);
  const foot = Math.round(onFoot);
  const tones: Tone[] = Array.from({ length: 100 }, (_, i) => (i < car ? "byCar" : i < foot ? "onFoot" : "near"));
  const counts: Record<Tone, number> = { byCar: car, onFoot: foot - car, near: 100 - foot };

  return (
    <div className={styles.waffleWrap}>
      <div
        className={styles.waffle}
        role="img"
        aria-label={`${counts.byCar} in 100: ${labels.byCar}. ${counts.onFoot}: ${labels.onFoot}. ${counts.near}: ${labels.near}.`}
      >
        {tones.map((tone, i) => (
          <span key={i} className={styles.cell} data-tone={tone} style={{ "--i": i } as CSSProperties} />
        ))}
      </div>
      <ul className={styles.waffleKey}>
        {(Object.keys(counts) as Tone[]).map((tone) => (
          <li key={tone} data-tone={tone}>
            <strong>{counts[tone]}</strong>
            <span>{labels[tone]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
