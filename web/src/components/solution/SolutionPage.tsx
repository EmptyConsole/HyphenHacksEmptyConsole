"use client";

import type { CSSProperties, ReactNode } from "react";
import { solutionFigures, sources, type SourceId } from "@/content/solution";
import type { ScanSummary } from "@/data/types";
import Reveal from "@/components/problem/Reveal";
import { useLocale } from "@/i18n/LocaleProvider";
import { formatCount, formatUsd } from "@/lib/format";
import styles from "@/components/problem/ProblemPage.module.css";
import DetectSteps from "./DetectSteps";
import RouteDiagram from "./RouteDiagram";
import TourDiagram from "./TourDiagram";
import own from "./SolutionPage.module.css";

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

const SCORE_KEYS = ["scoreBuildings", "scoreShape", "scoreCover"] as const;
const SCORE_DETAILS = ["scoreBuildingsDetail", "scoreShapeDetail", "scoreCoverDetail"] as const;
const RATE_KEYS = [
  "rateMotorway",
  "ratePrimary",
  "rateSecondary",
  "rateTertiary",
  "rateUnclassified",
  "rateTrack",
  "rateNone",
] as const;

/** `summary` is null in the prerendered shell, before the saved scans are read. */
export default function SolutionPage({ summary }: { summary: ScanSummary | null }) {
  const { t, locale } = useLocale();
  const osmMatched = summary?.osmMatched ?? 0;
  const satelliteOnly = summary ? summary.settlements - summary.osmMatched : 0;
  const scoreTotal = solutionFigures.score.reduce((sum, s) => sum + s.points, 0);
  const find = {
    eyebrow: t("solution.findEyebrow"),
    title: t("solution.findTitle"),
    body: [
      { text: t("solution.findBody1"), cite: ["nature" as const] },
      { text: t("solution.findBody2"), cite: ["microsoft" as const] },
      { text: t("solution.findBody3"), cite: ["esri" as const] },
    ],
  };
  const check = {
    eyebrow: t("solution.checkEyebrow"),
    title: t("solution.checkTitle"),
    body: [{ text: t("solution.checkBody1"), cite: ["osm" as const] }, { text: t("solution.checkBody2") }],
  };
  const reach = {
    eyebrow: t("solution.reachEyebrow"),
    title: t("solution.reachTitle"),
    body: [
      { text: t("solution.reachBody1"), cite: ["osm" as const] },
      { text: t("solution.reachBody2") },
      { text: t("solution.reachBody3") },
    ],
  };
  const tour = {
    eyebrow: t("solution.tourEyebrow"),
    title: t("solution.tourTitle"),
    body: [{ text: t("solution.tourBody1") }, { text: t("solution.tourBody2") }],
  };
  const steps = [1, 2, 3, 4].map((n) => ({
    title: t(`solution.step${n}Title`),
    text: t(`solution.step${n}Text`),
  }));
  const facts = [
    { value: t("solution.factGapValue"), label: t("solution.factGapLabel") },
    { value: t("solution.factAreaValue"), label: t("solution.factAreaLabel") },
    { value: t("solution.factHomeValue"), label: t("solution.factHomeLabel") },
  ];

  return (
    <main className={styles.page}>
      <header className={`container ${styles.hero}`}>
        <p className="eyebrow">{t("solution.eyebrow")}</p>
        <h1 className={styles.title}>{t("solution.title")}</h1>
        <p className={styles.subtitle}>{t("solution.subtitle")}</p>
      </header>

      <Section {...find}>
        <figure className={styles.card}>
          <figcaption className={styles.caption}>{t("solution.stepsCaption")}</figcaption>
          <DetectSteps steps={steps} />
        </figure>
        <ul className={styles.facts}>
          {facts.map((f) => (
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
              {t("solution.matchCaption")}
              <Cite id="hestia" />
            </figcaption>
            <div className={own.split}>
              <span className={`${own.splitPart} ${styles.fillUrban}`} style={{ flexGrow: osmMatched }} />
              <span className={`${own.splitPart} ${styles.fillMissing}`} style={{ flexGrow: satelliteOnly }} />
            </div>
            <ul className={own.splitKey}>
              <li>
                <span className={styles.keyUrban}>{t("solution.onOsm")}</span>
                <strong>{summary ? formatCount(osmMatched, locale) : "–"}</strong>
              </li>
              <li>
                <span className={own.keyMissing}>{t("solution.satelliteOnly")}</span>
                <strong>{summary ? formatCount(satelliteOnly, locale) : "–"}</strong>
              </li>
            </ul>
          </figure>
        </Reveal>

        <Reveal className={styles.card}>
          <figure>
            <figcaption className={styles.caption}>{t("solution.scoreCaption")}</figcaption>
            <div className={own.stack}>
              {solutionFigures.score.map((s, i) => (
                <span key={s.id} className={own.stackPart} data-tone={i} style={{ flexGrow: s.points }}>
                  {s.points}
                </span>
              ))}
            </div>
            <ul className={own.stackKey}>
              {solutionFigures.score.map((s, i) => (
                <li key={s.id} data-tone={i} style={{ flexGrow: s.points }}>
                  <span className={own.stackLabel}>{t(`solution.${SCORE_KEYS[i]}`)}</span>
                  <span className={own.stackDetail}>{t(`solution.${SCORE_DETAILS[i]}`)}</span>
                </li>
              ))}
            </ul>
            <p className={styles.footnote}>{t("solution.scoreFootnote", { total: scoreTotal })}</p>
          </figure>
        </Reveal>
      </Section>

      <Section {...reach}>
        <figure className={styles.card}>
          <figcaption className={styles.caption}>{t("solution.routeCaption")}</figcaption>
          <RouteDiagram />
        </figure>

        <Reveal className={styles.card}>
          <figure>
            <figcaption className={styles.caption}>
              {t("solution.rateCaption")}
              <Cite id="osm" />
            </figcaption>
            <ul className={styles.bars}>
              {solutionFigures.rates.map((r, i) => (
                <li key={r.id} className={styles.barRow}>
                  <span className={styles.barLabel}>{t(`solution.${RATE_KEYS[i]}`)}</span>
                  <span className={styles.track}>
                    <span
                      className={`${styles.fill} ${"offroad" in r ? styles.fillMissing : styles.fillUrban}`}
                      style={fill(r.value, solutionFigures.rateMax)}
                    />
                  </span>
                  <span className={styles.barValue}>{formatUsd(r.value, locale, 2)}</span>
                </li>
              ))}
            </ul>
            <p className={styles.footnote}>{t("solution.rateNote")}</p>
          </figure>
        </Reveal>
      </Section>

      <Section {...tour}>
        <figure className={styles.card}>
          <figcaption className={styles.caption}>{t("solution.diagramCaption")}</figcaption>
          <TourDiagram />
        </figure>
      </Section>

      <section id="sources" className={styles.sources}>
        <div className="container">
          <p className="eyebrow">{t("common.sources")}</p>
          <ol className={styles.sourceList}>
            {sources.map((s, i) => (
              <li key={s.id} id={`source-${i + 1}`}>
                <a href={s.href} {...(s.href.startsWith("http") && { target: "_blank", rel: "noreferrer" })}>
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
