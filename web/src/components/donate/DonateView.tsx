"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { donateContent } from "@/content/donate";
import { dataProvider } from "@/data";
import ruralPopulation from "@/data/ruralPopulation.json";
import { formatCount, formatDollars } from "@/lib/format";
import styles from "./DonateView.module.css";

type RuralRecord = { rural: number; year: number };

const ruralByIso = ruralPopulation as Record<string, RuralRecord>;

type Government = {
  id: string;
  name: string;
  rural: number;
  year: number;
};

const RECOMMENDED = "recommended";

function governmentKey(government: Government) {
  return `${government.id}:${government.name}`;
}

export default function DonateView() {
  const selectId = useId();
  const searchId = useId();
  const [governments, setGovernments] = useState<Government[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [choice, setChoice] = useState(RECOMMENDED);
  const [preset, setPreset] = useState<number>(donateContent.amounts[1]);
  const [custom, setCustom] = useState("");
  const [query, setQuery] = useState("");
  const payDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let cancelled = false;
    const wanted = new Set(donateContent.governmentsInNeed);
    dataProvider
      .getCountries()
      .then((collection) => {
        if (cancelled) return;
        const list: Government[] = [];
        for (const feature of collection.features) {
          const name = feature.properties.name;
          if (!wanted.has(name)) continue;
          const record = ruralByIso[feature.properties.id];
          if (!record) continue;
          list.push({
            id: feature.properties.id,
            name,
            rural: record.rural,
            year: record.year,
          });
        }
        if (list.length !== donateContent.governmentsInNeed.length) {
          setStatus("error");
          return;
        }
        list.sort((a, b) => a.name.localeCompare(b.name));
        setGovernments(list);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const recommended = useMemo(
    () => governments.reduce<Government | null>((best, government) => {
      if (!best || government.rural > best.rural) return government;
      return best;
    }, null),
    [governments],
  );

  const selected = useMemo(() => {
    if (choice === RECOMMENDED) return recommended;
    return governments.find((government) => governmentKey(government) === choice) ?? recommended;
  }, [choice, governments, recommended]);

  const usingCustom = custom !== "";
  const amount = usingCustom ? Number(custom) : preset;
  const amountReady = Number.isFinite(amount) && amount >= 1;
  const isRecommended = Boolean(selected && recommended && governmentKey(selected) === governmentKey(recommended));

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = [...governments].sort((a, b) => b.rural - a.rural);
    if (!needle) return rows;
    return rows.filter((government) => government.name.toLowerCase().includes(needle));
  }, [governments, query]);

  function choose(value: string) {
    setChoice(value);
  }

  function openPay() {
    if (!selected || !amountReady) return;
    payDialog.current?.showModal();
  }

  function chooseFromTable(government: Government) {
    choose(governmentKey(government));
    document.getElementById("choose")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>{donateContent.eyebrow}</p>
        <h1 className={styles.title}>{donateContent.title}</h1>
        <p className={styles.subtitle}>{donateContent.lead}</p>
      </header>

      <section className={styles.section} aria-labelledby="why-it-matters">
        <div className={styles.sectionHeader}>
          <h2 id="why-it-matters">The need</h2>
          <p>Published counts for rural life, health coverage, and children who received no vaccine.</p>
        </div>
        <div className={styles.facts}>
          {donateContent.facts.map((fact) => (
            <article key={fact.value} className={styles.card}>
              <strong className={styles.stat}>{fact.value}</strong>
              <p>{fact.label}</p>
              <p className={styles.note}>{fact.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="why-donate">
        <div className={styles.sectionHeader}>
          <h2 id="why-donate">{donateContent.whyTitle}</h2>
        </div>
        <div className={styles.grid}>
          {donateContent.why.map((reason) => (
            <article key={reason.title} className={styles.card}>
              <h3>{reason.title}</h3>
              <p>{reason.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="where-it-goes">
        <div className={styles.sectionHeader}>
          <h2 id="where-it-goes">{donateContent.whereTitle}</h2>
          <p>{donateContent.whereLead}</p>
        </div>
        <div className={styles.grid}>
          {donateContent.where.map((step) => (
            <article key={step.step} className={styles.card}>
              <p className={styles.stepNumber}>{step.step}</p>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="choose" className={styles.section} aria-labelledby="choose-title">
        <div className={styles.sectionHeader}>
          <h2 id="choose-title">Choose a government</h2>
          <p>
            These 25 governments are where rural people are still widely without care. The first option is recommended: the one on this list with the most people living in rural areas.
          </p>
        </div>

        {status === "loading" && <p className={styles.status}>Loading governments…</p>}
        {status === "error" && (
          <p className={styles.status} role="alert">
            World Bank rural population figures could not be loaded. Refresh the page to try again.
          </p>
        )}

        {status === "ready" && selected && (
          <div className={styles.panel}>
            <label className={styles.field} htmlFor={selectId}>
              <span>Government</span>
              <select
                id={selectId}
                className={styles.select}
                value={choice === RECOMMENDED ? RECOMMENDED : governmentKey(selected)}
                onChange={(event) => choose(event.target.value)}
              >
                <option value={RECOMMENDED}>Recommended — {recommended?.name}</option>
                {governments.map((government) => (
                  <option key={governmentKey(government)} value={governmentKey(government)}>
                    {government.name}
                  </option>
                ))}
              </select>
            </label>

            {isRecommended && recommended && (
              <p className={styles.recommend}>
                <strong>Recommended: {recommended.name}.</strong> Among these governments, it has the most people living in rural areas: {formatCount(recommended.rural)} in {recommended.year} (World Bank).
              </p>
            )}

            <dl className={styles.summary}>
              <div>
                <dt>Rural people</dt>
                <dd>{formatCount(selected.rural)}</dd>
              </div>
              <div>
                <dt>Year</dt>
                <dd>{selected.year}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>World Bank, SP.RUR.TOTL</dd>
              </div>
            </dl>

            <div className={styles.amounts}>
              <p className={styles.amountLabel} id="amount-label">
                Gift amount
              </p>
              <div className={styles.amountRow} role="group" aria-labelledby="amount-label">
                {donateContent.amounts.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={styles.amount}
                    aria-pressed={!usingCustom && value === preset}
                    onClick={() => {
                      setPreset(value);
                      setCustom("");
                    }}
                  >
                    {formatDollars(value)}
                  </button>
                ))}
                <label className={styles.custom} data-active={usingCustom || undefined}>
                  Custom
                  <input
                    type="text"
                    inputMode="numeric"
                    value={custom}
                    placeholder="Amount"
                    aria-label="Custom gift amount in dollars"
                    onChange={(event) => setCustom(event.target.value.replace(/[^\d]/g, ""))}
                  />
                </label>
              </div>
            </div>

            <section className={styles.impact} aria-live="polite" aria-labelledby="impact-title">
              <h3 id="impact-title">Impact</h3>
              <p>
                {amountReady
                  ? `${formatDollars(amount)} is directed to ${selected.name}, where ${formatCount(selected.rural)} people live in rural areas (World Bank, ${selected.year}).`
                  : "Enter a gift of at least $1."}
              </p>
              <p>
                In 2025, 13.5 million babies worldwide got no vaccine in their first year of life (WHO and UNICEF). This gift pays to find villages missing from official maps in {selected.name}, plan the path from the nearest clinic, and carry vaccines there.
              </p>
            </section>

            <button type="button" className={`btn btn-primary ${styles.pay}`} onClick={openPay} disabled={!amountReady}>
              Pay
            </button>

            <dialog ref={payDialog} className={styles.popup} aria-labelledby="pay-title">
              <div className={styles.popupHead}>
                <h3 id="pay-title">Pay</h3>
                <button type="button" className={styles.close} onClick={() => payDialog.current?.close()} aria-label="Close">
                  ×
                </button>
              </div>
              <p>
                {formatDollars(amountReady ? amount : 0)} is directed to {selected.name}, where {formatCount(selected.rural)} people live in rural areas (World Bank, {selected.year}). It pays to find villages missing from official maps, plan the path from the nearest clinic, and carry vaccines there.
              </p>
              <p className={styles.fine}>Placeholder. This does not charge a card.</p>
            </dialog>
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="all-governments">
        <div className={styles.tableHead}>
          <div className={styles.sectionHeader}>
            <h2 id="all-governments">Governments in need</h2>
            <p>
              Rural people is the World Bank count of people living in rural areas in 2025. These are published totals for each country.
            </p>
          </div>
          <label className={styles.field} htmlFor={searchId}>
            <span>Find a government</span>
            <input
              id={searchId}
              className={styles.search}
              type="search"
              value={query}
              placeholder="Search by name"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>

        {status === "loading" && <p className={styles.status}>Loading governments…</p>}
        {status === "error" && (
          <p className={styles.status}>Figures will appear here once the World Bank counts load.</p>
        )}
        {status === "ready" && (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Government</th>
                  <th scope="col" className={styles.num}>Rural people</th>
                  <th scope="col" className={styles.num}>Year</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={3} className={styles.empty}>
                      No government matches that name.
                    </td>
                  </tr>
                ) : (
                  filtered.map((government) => (
                    <tr
                      key={governmentKey(government)}
                      data-selected={governmentKey(government) === (selected ? governmentKey(selected) : "") || undefined}
                    >
                      <td>
                        <button type="button" className={styles.nameBtn} onClick={() => chooseFromTable(government)}>
                          {government.name}
                        </button>
                      </td>
                      <td className={styles.num}>{formatCount(government.rural)}</td>
                      <td className={styles.num}>{government.year}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="sources-title">
        <div className={styles.sectionHeader}>
          <h2 id="sources-title">Sources</h2>
        </div>
        <ul className={styles.sourceList}>
          {donateContent.sources.map((source) => (
            <li key={source.href}>
              <a href={source.href} target="_blank" rel="noreferrer">
                {source.label}
              </a>
              <p>{source.detail}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
