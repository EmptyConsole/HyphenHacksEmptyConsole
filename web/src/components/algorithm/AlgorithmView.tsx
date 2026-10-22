"use client";

import { useMemo, useState, type CSSProperties } from "react";
import HelpScanPrompt from "@/components/help/HelpScanPrompt";
import { algorithmContent } from "@/content/algorithm";
import CodePanel from "./CodePanel";
import { lineRange } from "./highlight";
import StepScene from "./StepScenes";
import styles from "./AlgorithmView.module.css";

type AlgorithmViewProps = {
  source: string | null;
  error?: string | null;
};

export default function AlgorithmView({ source, error = null }: AlgorithmViewProps) {
  const steps = algorithmContent.steps;
  const [openId, setOpenId] = useState<string | null>(steps[0].id);
  const [jump, setJump] = useState(0);

  const ranges = useMemo(() => {
    const found = new Map<string, [number, number]>();
    if (!source) return found;
    for (const step of steps) {
      const range = lineRange(source, step.start, step.end);
      if (range) found.set(step.id, range);
    }
    return found;
  }, [source, steps]);

  const openIndex = Math.max(0, steps.findIndex((step) => step.id === openId));
  const openStep = steps.find((step) => step.id === openId) ?? null;
  const range = openStep ? (ranges.get(openStep.id) ?? null) : null;

  function toggle(id: string) {
    setOpenId((current) => (current === id ? null : id));
  }

  function revealSource() {
    setJump((value) => value + 1);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("algorithm-code")?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    });
  }

  return (
    <main className={styles.page}>
      <header className={`container ${styles.hero}`}>
        <p className="eyebrow">{algorithmContent.eyebrow}</p>
        <h1 className={styles.title}>{algorithmContent.title}</h1>
        <p className={styles.subtitle}>{algorithmContent.subtitle}</p>
        {openStep && (
          <p className={styles.progress} aria-live="polite">
            Step {openIndex + 1} of {steps.length} · {openStep.title}
          </p>
        )}
      </header>

      <div className="container">
        <ol className={styles.steps}>
          {steps.map((step, index) => {
            const open = step.id === openId;
            return (
                <li
                key={step.id}
                id={`step-${step.id}`}
                className={styles.step}
                data-open={open || undefined}
                style={{ "--i": index } as CSSProperties}
              >
                <span className={styles.index} aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <button
                    type="button"
                    className={styles.stepButton}
                    aria-expanded={open}
                    onClick={() => toggle(step.id)}
                  >
                    <span className={styles.sr}>Step {index + 1}.</span>
                    <span className={styles.stepTitle}>{step.title}</span>
                    <span className={styles.stepText}>{step.text}</span>
                    <svg className={styles.chevron} viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M4 6 L8 10 L12 6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </button>
                  {open && (
                    <div className={styles.detail}>
                      <p>{step.detail}</p>
                      <StepScene id={step.id} />
                      <button type="button" className={`btn btn-secondary ${styles.codeLink}`} onClick={revealSource}>
                        See these lines in the code
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <section id="algorithm-source" className={`container ${styles.source}`}>
        <header className={styles.sourceHead}>
          <p className="eyebrow">{algorithmContent.source.eyebrow}</p>
          <h2 className={styles.h2}>{algorithmContent.source.title}</h2>
          <p className={styles.lead}>{algorithmContent.source.lead}</p>
          <p className={styles.command}>{algorithmContent.source.command}</p>
        </header>
        <CodePanel source={source} error={error} range={range} label={openStep?.title ?? null} jump={jump} />
        <HelpScanPrompt message={algorithmContent.scanSource} />
      </section>
    </main>
  );
}
