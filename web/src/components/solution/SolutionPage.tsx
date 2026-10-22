import type { CSSProperties, ReactNode } from "react";
import { solutionContent, sources, type SourceId } from "@/content/solution";
import type { ScanSummary } from "@/data/types";
import Reveal from "@/components/problem/Reveal";
import styles from "@/components/problem/ProblemPage.module.css";
import DetectSteps from "./DetectSteps";
import RouteDiagram from "./RouteDiagram";
import TourDiagram from "./TourDiagram";
import own from "./SolutionPage.module.css";

function Cite({ id }: { id: SourceId }) {
  const n = sources.findIndex((s) => s.id === id) + 1;
  return (
    <a className={styles.cite} href={`#source-${n}`} aria-label={`Source ${n}`}>
      [{n}]
    </a>
  );
}

function fill(value: number, max: number) {
  return { "--fill": value / max } as CSSProperties;
}

const count = (n: number) => n.toLocaleString("en-US");
const usd = (n: number) => `$${n.toFixed(2)}`;

function Section({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body: { text: string; cite?: SourceId[] }[];
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <div className={`container ${styles.split}`}>
        <header className={styles.copy}>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className={styles.h2}>{title}</h2>
          {body.map((p) => (
            <p key={p.text} className={styles.body}>
              {p.text}
              {p.cite?.map((id) => <Cite key={id} id={id} />)}
            </p>
          ))}
        </header>
        <div className={styles.visuals}>{children}</div>
      </div>
    </section>
  );
}

/** `summary` is null in the prerendered shell, before the saved scans are read. */
export default function SolutionPage({ summary }: { summary: ScanSummary | null }) {
  const { find, check, reach, tour } = solutionContent;
  const osmMatched = summary?.osmMatched ?? 0;
  const satelliteOnly = summary ? summary.settlements - summary.osmMatched : 0;
  const scoreTotal = check.score.reduce((sum, s) => sum + s.points, 0);

  return (
    <main className={styles.page}>
      <header className={`container ${styles.hero}`}>
        <p className="eyebrow">{solutionContent.eyebrow}</p>
        <h1 className={styles.title}>{solutionContent.title}</h1>
        <p className={styles.subtitle}>{solutionContent.subtitle}</p>
      </header>

      <Section {...find}>
        <figure className={styles.card}>
          <figcaption className={styles.caption}>{find.stepsCaption}</figcaption>
          <DetectSteps steps={find.steps} />
        </figure>
        <ul className={styles.facts}>
          {find.facts.map((f) => (
            <li key={f.label} className={styles.fact}>
              <span className={styles.factValue}>{f.value}</span>
              <span className={styles.factLabel}>{f.label}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section {...check}>
        <Reveal className={styles.card}>
          <figure>
            <figcaption className={styles.caption}>
              {check.matchCaption}
              <Cite id="hestia" />
            </figcaption>
            <div className={own.split}>
              <span className={`${own.splitPart} ${styles.fillUrban}`} style={{ flexGrow: osmMatched }} />
              <span className={`${own.splitPart} ${styles.fillMissing}`} style={{ flexGrow: satelliteOnly }} />
            </div>
            <ul className={own.splitKey}>
              <li>
                <span className={styles.keyUrban}>On OpenStreetMap</span>
                <strong>{summary ? count(osmMatched) : "–"}</strong>
              </li>
              <li>
                <span className={own.keyMissing}>Satellite only</span>
                <strong>{summary ? count(satelliteOnly) : "–"}</strong>
              </li>
            </ul>
          </figure>
        </Reveal>

        <Reveal className={styles.card}>
          <figure>
            <figcaption className={styles.caption}>{check.scoreCaption}</figcaption>
            <div className={own.stack}>
              {check.score.map((s, i) => (
                <span key={s.label} className={own.stackPart} data-tone={i} style={{ flexGrow: s.points }}>
                  {s.points}
                </span>
              ))}
            </div>
            <ul className={own.stackKey}>
              {check.score.map((s, i) => (
                <li key={s.label} data-tone={i} style={{ flexGrow: s.points }}>
                  <span className={own.stackLabel}>{s.label}</span>
                  <span className={own.stackDetail}>{s.detail}</span>
                </li>
              ))}
            </ul>
            <p className={styles.footnote}>
              That adds up to {scoreTotal} points. The score stops at 99, because only an OpenStreetMap match can reach 100.
            </p>
          </figure>
        </Reveal>

        <div className={styles.callout}>
          <p>{check.caveat}</p>
        </div>
      </Section>

      <Section {...reach}>
        <figure className={styles.card}>
          <figcaption className={styles.caption}>{reach.routeCaption}</figcaption>
          <RouteDiagram />
          <p className={styles.footnote}>This is only an example. The real route for every settlement is on the map.</p>
        </figure>

        <Reveal className={styles.card}>
          <figure>
            <figcaption className={styles.caption}>
              {reach.rateCaption}
              <Cite id="osm" />
            </figcaption>
            <ul className={styles.bars}>
              {reach.rates.map((r) => (
                <li key={r.label} className={styles.barRow}>
                  <span className={styles.barLabel}>{r.label}</span>
                  <span className={styles.track}>
                    <span
                      className={`${styles.fill} ${"offroad" in r ? styles.fillMissing : styles.fillUrban}`}
                      style={fill(r.value, reach.rateMax)}
                    />
                  </span>
                  <span className={styles.barValue}>{usd(r.value)}</span>
                </li>
              ))}
            </ul>
            <p className={styles.footnote}>{reach.rateNote}</p>
          </figure>
        </Reveal>
      </Section>

      <Section {...tour}>
        <figure className={styles.card}>
          <figcaption className={styles.caption}>{tour.diagramCaption}</figcaption>
          <TourDiagram />
          <p className={styles.footnote}>{tour.diagramNote}</p>
        </figure>
        <ul className={styles.facts}>
          {tour.facts.map((f) => (
            <li key={f.label} className={styles.fact}>
              <span className={styles.factValue}>{f.value}</span>
              <span className={styles.factLabel}>{f.label}</span>
            </li>
          ))}
        </ul>
      </Section>

      <section id="sources" className={styles.sources}>
        <div className="container">
          <p className="eyebrow">Sources</p>
          <ol className={styles.sourceList}>
            {sources.map((s, i) => (
              <li key={s.id} id={`source-${i + 1}`}>
                <a
                  href={s.href}
                  {...(s.href.startsWith("http") && { target: "_blank", rel: "noreferrer" })}
                >
                  {s.label}
                </a>
                <span className={styles.sourceDetail}>{s.detail}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
