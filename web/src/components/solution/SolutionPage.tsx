import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import HelpScanPrompt from "@/components/help/HelpScanPrompt";
import { solutionContent, sources, type SourceId } from "@/content/solution";
import type { ScanSummary } from "@/data/types";
import { formatCost, formatPopulation } from "@/lib/format";
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
  scan,
  children,
}: {
  eyebrow: string;
  title: string;
  body: { text: string; cite?: SourceId[] }[];
  scan: string;
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
      <div className="container">
        <HelpScanPrompt message={scan} />
      </div>
    </section>
  );
}

/** `summary` is null in the prerendered shell, before the saved scans are read. */
export default function SolutionPage({ summary }: { summary: ScanSummary | null }) {
  const { find, check, reach, tour, price, closing } = solutionContent;
  const stats = solutionContent.stats(summary, { count, people: formatPopulation });
  const osmMatched = summary?.osmMatched ?? 0;
  const satelliteOnly = summary ? summary.settlements - summary.osmMatched : 0;
  const unicefTotal = price.unicef.reduce((sum, u) => sum + u.value, 0);
  const scoreTotal = check.score.reduce((sum, s) => sum + s.points, 0);

  return (
    <main className={styles.page}>
      <header className={`container ${styles.hero}`}>
        <p className="eyebrow">{solutionContent.eyebrow}</p>
        <h1 className={styles.title}>{solutionContent.title}</h1>
        <p className={styles.subtitle}>{solutionContent.subtitle}</p>
      </header>

      <div className="container">
        <ul className={styles.stats}>
          {stats.map((s) => (
            <li key={s.label} className={styles.stat}>
              <span className={styles.statValue}>{s.value}</span>
              <span className={styles.statLabel}>
                {s.label}
                <Cite id={s.source} />
              </span>
              {s.note && <span className={styles.statNote}>{s.note}</span>}
            </li>
          ))}
        </ul>
      </div>

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
              {scoreTotal} points in all, capped at 99. Only an OpenStreetMap match scores 100.
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
          <p className={styles.footnote}>Illustration. Real routes for every settlement are drawn on the map.</p>
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

      <Section {...price}>
        <Reveal className={styles.card}>
          <figure>
            <figcaption className={styles.caption}>
              {price.unicefCaption}
              <Cite id="unicef" />
            </figcaption>
            <div className={own.stack}>
              {price.unicef.map((u, i) => (
                <span key={u.label} className={own.stackPart} data-tone={i ? 0 : 3} style={{ flexGrow: u.value }}>
                  {Math.round((u.value / unicefTotal) * 100)}%
                </span>
              ))}
            </div>
            <ul className={own.stackKey}>
              {price.unicef.map((u, i) => (
                <li key={u.label} data-tone={i ? 0 : 3} style={{ flexGrow: u.value }}>
                  <span className={own.stackLabel}>{u.label}</span>
                  <span className={own.stackDetail}>{usd(u.value)}</span>
                </li>
              ))}
            </ul>
            <p className={styles.footnote}>
              Total {usd(unicefTotal)} per child. {price.unicefNote}
            </p>
          </figure>
        </Reveal>

        <figure className={styles.card}>
          <figcaption className={styles.caption}>{price.formulaCaption}</figcaption>
          <dl className={own.formula}>
            {price.formula.map((f) => (
              <div key={f.label} className={own.formulaRow}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
          {summary && summary.population > 0 && (
            <p className={styles.footnote}>
              Across all {summary.scans} saved scans: {formatPopulation(summary.population)} people for about{" "}
              {formatCost(summary.costUsd)}, or {usd(summary.costUsd / summary.population)} per person.
              <Cite id="hestia" />
            </p>
          )}
        </figure>

        <div className={styles.callout}>
          <p>{price.caveat}</p>
        </div>
      </Section>

      <section className={styles.closing}>
        <div className="container">
          <h2 className={styles.h2}>{closing.title}</h2>
          <p className={styles.body}>{closing.body}</p>
          <div className={styles.ctas}>
            <Link href={closing.primaryCta.href} className="btn btn-primary">
              {closing.primaryCta.label}
            </Link>
            <Link href={closing.secondaryCta.href} className="btn btn-secondary">
              {closing.secondaryCta.label}
            </Link>
          </div>
          <HelpScanPrompt message={closing.scan} />
        </div>
      </section>

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
