import type { CSSProperties, ReactNode } from "react";
import { problemContent, sources, type SourceId } from "@/content/problem";
import MapGap from "./MapGap";
import Reveal from "./Reveal";
import RouteChoice from "./RouteChoice";
import TravelWaffle from "./TravelWaffle";
import styles from "./ProblemPage.module.css";
import diagrams from "./ProblemDiagrams.module.css";

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

function Chain({ caption, steps }: { caption: string; steps: { title: string; text: string }[] }) {
  return (
    <figure className={styles.card}>
      <figcaption className={styles.caption}>{caption}</figcaption>
      <ol className={diagrams.chain}>
        {steps.map((step) => (
          <li key={step.title} className={diagrams.chainStep}>
            <span className={diagrams.chainTitle}>{step.title}</span>
            <span className={diagrams.chainText}>{step.text}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

export default function ProblemPage() {
  const { /* stats, */ location, routes, funding } = problemContent;
  return (
    <main className={styles.page}>
      <header className={`container ${styles.hero}`}>
        <p className="eyebrow">{problemContent.eyebrow}</p>
        <h1 className={styles.title}>{problemContent.title}</h1>
        <p className={styles.subtitle}>{problemContent.subtitle}</p>
      </header>

      {/*
      <div className="container">
        <ul className={styles.stats}>
          {stats.map((s) => (
            <li key={s.value} className={styles.stat}>
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
      */}

      <Section {...location}>
        <Reveal className={styles.card}>
          <figure>
            <figcaption className={styles.caption}>{location.mapCaption}</figcaption>
            <MapGap />
            <p className={styles.footnote}>{location.mapNote}</p>
          </figure>
        </Reveal>

        <Reveal className={styles.card}>
          <figure>
            <figcaption className={styles.caption}>
              {location.undercountCaption}
              <Cite id="nature" />
            </figcaption>
            <ul className={styles.bars}>
              {location.undercount.map((u) => (
                <li key={u.label} className={styles.barRow}>
                  <span className={styles.barLabel}>{u.label}</span>
                  <span className={styles.track}>
                    <span className={`${styles.fill} ${styles.fillMissing}`} style={fill(u.value, 100)} />
                  </span>
                  <span className={styles.barValue}>−{u.value}%</span>
                </li>
              ))}
            </ul>
            <p className={styles.footnote}>{location.caveat}</p>
          </figure>
        </Reveal>
      </Section>

      <Section {...routes}>
        <Reveal className={styles.card}>
          <figure>
            <figcaption className={styles.caption}>
              {routes.travelCaption}
              <Cite id="weiss" />
            </figcaption>
            <TravelWaffle {...routes.travel} labels={routes.travelKey} />
          </figure>
        </Reveal>

        <figure className={styles.card}>
          <figcaption className={styles.caption}>{routes.routeCaption}</figcaption>
          <RouteChoice {...routes.route} />
          <p className={styles.footnote}>{routes.routeNote}</p>
        </figure>
      </Section>

      <Section {...funding}>
        <Chain caption={funding.chainCaption} steps={funding.chain} />
        <Chain caption={funding.costChainCaption} steps={funding.costChain} />
      </Section>

      <section id="sources" className={styles.sources}>
        <div className="container">
          <p className="eyebrow">Sources</p>
          <ol className={styles.sourceList}>
            {sources.map((s, i) => (
              <li key={s.id} id={`source-${i + 1}`}>
                <a href={s.href} target="_blank" rel="noreferrer">
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
