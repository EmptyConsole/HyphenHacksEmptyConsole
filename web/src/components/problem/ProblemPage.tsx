"use client";

import type { CSSProperties, ReactNode } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { problemFigures, sources, type SourceId } from "@/content/problem";
import MapGap from "./MapGap";
import Reveal from "./Reveal";
import RouteChoice from "./RouteChoice";
import TravelWaffle from "./TravelWaffle";
import styles from "./ProblemPage.module.css";
import diagrams from "./ProblemDiagrams.module.css";

function Cite({ id }: { id: SourceId }) {
  const { t } = useLocale();
  const n = sources.findIndex((s) => s.id === id) + 1;
  return (
    <a className={styles.cite} href={`#source-${n}`} aria-label={t("common.sourceN", { n })}>
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
              {p.cite?.map((id) => (
                <Cite key={id} id={id} />
              ))}
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
  const { t } = useLocale();
  const location = {
    eyebrow: t("problem.locationEyebrow"),
    title: t("problem.locationTitle"),
    body: [
      { text: t("problem.locationBody1") },
      { text: t("problem.locationBody2"), cite: ["nature" as const] },
    ],
  };
  const routes = {
    eyebrow: t("problem.routesEyebrow"),
    title: t("problem.routesTitle"),
    body: [
      { text: t("problem.routesBody1") },
      { text: t("problem.routesBody2") },
      { text: t("problem.routesBody3") },
    ],
  };
  const funding = {
    eyebrow: t("problem.fundingEyebrow"),
    title: t("problem.fundingTitle"),
    body: [{ text: t("problem.fundingBody1") }, { text: t("problem.fundingBody2") }],
  };

  return (
    <main className={styles.page}>
      <header className={`container ${styles.hero}`}>
        <p className="eyebrow">{t("problem.eyebrow")}</p>
        <h1 className={styles.title}>{t("problem.title")}</h1>
        <p className={styles.subtitle}>{t("problem.subtitle")}</p>
      </header>

      <Section {...location}>
        <Reveal className={styles.card}>
          <figure>
            <figcaption className={styles.caption}>{t("problem.mapCaption")}</figcaption>
            <MapGap />
          </figure>
        </Reveal>

        <Reveal className={styles.card}>
          <figure>
            <figcaption className={styles.caption}>
              {t("problem.undercountCaption")}
              <Cite id="nature" />
            </figcaption>
            <ul className={styles.bars}>
              {problemFigures.undercount.map((u) => (
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
      </Section>

      <Section {...routes}>
        <Reveal className={styles.card}>
          <figure>
            <figcaption className={styles.caption}>
              {t("problem.travelCaption")}
              <Cite id="weiss" />
            </figcaption>
            <TravelWaffle
              {...problemFigures.travel}
              labels={{
                byCar: t("problem.byCar"),
                onFoot: t("problem.onFoot"),
                near: t("problem.near"),
              }}
            />
          </figure>
        </Reveal>

        <figure className={styles.card}>
          <figcaption className={styles.caption}>{t("problem.routeCaption")}</figcaption>
          <RouteChoice
            shortest={{
              label: t("problem.shortest"),
              road: t("problem.dirtTrack"),
              km: problemFigures.route.shortest.km,
              rate: problemFigures.route.shortest.rate,
            }}
            cheapest={{
              label: t("problem.cheapest"),
              road: t("problem.pavedRoad"),
              km: problemFigures.route.cheapest.km,
              rate: problemFigures.route.cheapest.rate,
            }}
          />
        </figure>
      </Section>

      <Section {...funding}>
        <Chain
          caption={t("problem.chainCaption")}
          steps={[1, 2, 3, 4].map((n) => ({
            title: t(`problem.chain${n}Title`),
            text: t(`problem.chain${n}Text`),
          }))}
        />
        <Chain
          caption={t("problem.costChainCaption")}
          steps={[1, 2, 3, 4].map((n) => ({
            title: t(`problem.cost${n}Title`),
            text: t(`problem.cost${n}Text`),
          }))}
        />
      </Section>

      <section id="sources" className={styles.sources}>
        <div className="container">
          <p className="eyebrow">{t("common.sources")}</p>
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
