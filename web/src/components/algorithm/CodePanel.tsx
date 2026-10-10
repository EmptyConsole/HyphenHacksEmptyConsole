"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { highlightLines, lineCount, type TokenKind } from "./highlight";
import styles from "./AlgorithmView.module.css";

const KIND_CLASS: Record<TokenKind, string | undefined> = {
  plain: undefined,
  comment: styles.tokComment,
  string: styles.tokString,
  keyword: styles.tokKeyword,
  number: styles.tokNumber,
};

type CodePanelProps = {
  source: string | null;
  error: string | null;
  range: [number, number] | null;
  label: string | null;
  jump: number;
};

function downloadSource(source: string) {
  const blob = new Blob([source], { type: "text/javascript;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "detect-villages.js";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function CodePanel({ source, error, range, label, jump }: CodePanelProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState(false);
  const lines = useMemo(() => (source ? highlightLines(source) : []), [source]);
  const count = source ? lineCount(source) : 0;

  useEffect(() => {
    const box = scroller.current;
    if (!box || !range || jump === 0) return;
    const line = box.querySelector(`[data-line="${range[0]}"]`);
    if (!(line instanceof HTMLElement)) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollTo({ top: Math.max(0, line.offsetTop - 12), behavior: reduce ? "auto" : "smooth" });
  }, [range, jump, lines]);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 2000);
    return () => window.clearTimeout(timer);
  }, [saved]);

  return (
    <div className={styles.codeBox}>
      <div className={styles.codeBar}>
        <div className={styles.codeMeta}>
          <span className={styles.fileName}>detect-villages.js</span>
          <span>{source ? `${count.toLocaleString("en-US")} lines · comments included` : "Source"}</span>
          {range && label && (
            <span className={styles.jumpLabel}>
              Lines {range[0].toLocaleString("en-US")}–{range[1].toLocaleString("en-US")} · {label}
            </span>
          )}
        </div>
        <button
          type="button"
          className={`btn btn-primary ${styles.download}`}
          disabled={!source}
          onClick={() => {
            if (!source) return;
            downloadSource(source);
            setSaved(true);
          }}
        >
          {saved ? "Downloaded" : "Download"}
        </button>
      </div>
      <div
        ref={scroller}
        className={styles.scroller}
        tabIndex={0}
        role="region"
        aria-label="detect-villages.js, scroll to read"
      >
        {error && <p className={styles.codeStatus}>{error}</p>}
        {!error && !source && <p className={styles.codeStatus}>Reading the source…</p>}
        {lines.map((tokens, index) => {
          const number = index + 1;
          const active = range ? number >= range[0] && number <= range[1] : false;
          return (
            <div key={number} className={styles.line} data-line={number} data-active={active || undefined}>
              <span className={styles.num}>{number}</span>
              <code className={styles.code}>
                {tokens.map((token, tokenIndex) =>
                  token.kind === "plain" || !KIND_CLASS[token.kind] ? (
                    <span key={tokenIndex}>{token.text}</span>
                  ) : (
                    <span key={tokenIndex} className={KIND_CLASS[token.kind]}>
                      {token.text}
                    </span>
                  ),
                )}
              </code>
            </div>
          );
        })}
      </div>
    </div>
  );
}
