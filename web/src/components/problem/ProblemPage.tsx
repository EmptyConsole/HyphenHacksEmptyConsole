import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import HelpScanPrompt from "@/components/help/HelpScanPrompt";
import { problemContent, sources, type SourceId } from "@/content/problem";
import Reveal from "./Reveal";
import TrendChart from "./TrendChart";
import styles from "./ProblemPage.module.css";

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
  source,
  scan,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string[];
  source: SourceId;
  scan: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <div className={`container ${styles.split}`}>
        <header className={styles.copy}>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className={styles.h2}>{title}</h2>
          {body.map((p, i) => (
            <p key={i} className={styles.body}>
              {p}
              {i === body.length - 1 && <Cite id={source} />}
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

export default function ProblemPage() {
  const { stats, rural, health, invisible, vaccines, closing } = problemContent;
  return (
    <main className={styles.page}>
      <header className={`container ${styles.hero}`}>
        <p className="eyebrow">{problemContent.eyebrow}</p>
        <h1 className={styles.title}>{problemContent.title}</h1>
        <p className={styles.subtitle}>{problemContent.subtitle}</p>
      </header>

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

      <Section {...rural}>
        <figure className={styles.card}>
          <figcaption className={styles.caption}>{rural.trendCaption}</figcaption>
          <TrendChart data={rural.trend} crossoverYear={rural.crossoverYear} />
          <div className={styles.legend}>
            <span className={styles.keyRural}>Rural</span>
            <span className={styles.keyUrban}>Urban</span>
          </div>
        </figure>

        <Reveal className={styles.card}>
          <figure>
            <figcaption className={styles.caption}>{rural.shareCaption}</figcaption>
            <ul className={styles.bars}>
              {rural.share.map((s) => (
                <li key={s.label} className={styles.barRow} data-muted={s.label === "World" || undefined}>
                  <span className={styles.barLabel}>{s.label}</span>
                  <span className={styles.track}>
                    <span className={`${styles.fill} ${styles.fillRural}`} style={fill(s.value, 100)} />
                  </span>
                  <span className={styles.barValue}>{s.value}%</span>
                </li>
              ))}
            </ul>
          </figure>
        </Reveal>
      </Section>

      <Section {...health}>
        <Reveal className={styles.card}>
          <figure>
            <figcaption className={styles.caption}>{health.compareCaption}</figcaption>
            <div className={styles.legend}>
              <span className={styles.keyRural}>Rural</span>
              <span className={styles.keyUrban}>Urban</span>
            </div>
            <ul className={styles.compare}>
              {health.compare.map((c) => (
                <li key={c.label}>
                  <p className={styles.compareLabel}>{c.label}</p>
                  <div className={styles.barRow}>
                    <span className={styles.barLabelSm}>Rural</span>
                    <span className={styles.track}>
                      <span className={`${styles.fill} ${styles.fillRural}`} style={fill(c.rural, c.max)} />
                    </span>
                    <span className={styles.barValue}>
                      {c.rural}
                      {c.unit}
                    </span>
                  </div>
                  <div className={styles.barRow}>
                    <span className={styles.barLabelSm}>Urban</span>
                    <span className={styles.track}>
                      <span className={`${styles.fill} ${styles.fillUrban}`} style={fill(c.urban, c.max)} />
                    </span>
                    <span className={styles.barValue}>
                      {c.urban}
                      {c.unit}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </figure>
        </Reveal>

        <Reveal className={styles.card}>
          <figure>
            <figcaption className={styles.caption}>{health.workers.title}</figcaption>
            <div className={styles.workers}>
              {[
                { ...health.workers.people, cls: styles.fillNeutral },
                { ...health.workers.staff, cls: styles.fillRural },
              ].map((w) => (
                <div key={w.label} className={styles.worker}>
                  <span className={styles.workerValue}>{w.value}%</span>
                  <span className={styles.workerLabel}>{w.label}</span>
                  <span className={`${styles.track} ${styles.trackTall}`}>
                    <span className={`${styles.fill} ${w.cls}`} style={fill(w.value, 100)} />
                  </span>
                </div>
              ))}
            </div>
            <p className={styles.footnote}>{health.workers.shortfall}</p>
          </figure>
        </Reveal>
      </Section>

      <Section {...invisible}>
        <Reveal className={styles.card}>
          <figure>
            <figcaption className={styles.caption}>{invisible.undercountCaption}</figcaption>
            <ul className={styles.bars}>
              {invisible.undercount.map((u) => (
                <li key={u.label} className={styles.barRow}>
                  <span className={styles.barLabel}>{u.label}</span>
                  <span className={styles.track}>
                    <span className={`${styles.fill} ${styles.fillMissing}`} style={fill(u.value, 100)} />
                  </span>
                  <span className={styles.barValue}>−{u.value}%</span>
                </li>
              ))}
            </ul>
          </figure>
        </Reveal>
        <div className={styles.callout}>
          <p>{invisible.takeaway}</p>
          <p className={styles.footnote}>{invisible.caveat}</p>
        </div>
      </Section>

      <Section {...vaccines}>
        <ul className={styles.facts}>
          {vaccines.facts.map((f) => (
            <li key={f.label} className={styles.fact}>
              <span className={styles.factValue}>{f.value}</span>
              <span className={styles.factLabel}>{f.label}</span>
            </li>
          ))}
        </ul>
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
