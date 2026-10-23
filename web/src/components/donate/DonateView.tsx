"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import HelpScanPrompt from "@/components/help/HelpScanPrompt";
import { donateContent } from "@/content/donate";
import { dataProvider } from "@/data";
import ruralPopulation from "@/data/ruralPopulation.json";
import { useLocale } from "@/i18n/LocaleProvider";
import { localizedCountryName } from "@/i18n/place";
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
  const { t, locale } = useLocale();
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
    return rows.filter((government) => {
      const local = localizedCountryName(government.id, government.name, locale).toLowerCase();
      return government.name.toLowerCase().includes(needle) || local.includes(needle);
    });
  }, [governments, locale, query]);

  const countryName = (government: Government) => localizedCountryName(government.id, government.name, locale);

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
        <p className={styles.eyebrow}>{t("donate.eyebrow")}</p>
        <h1 className={styles.title}>{t("donate.title")}</h1>
        <p className={styles.subtitle}>{t("donate.lead")}</p>
      </header>

      <section className={styles.section} aria-labelledby="why-it-matters">
        <div className={styles.sectionHeader}>
          <h2 id="why-it-matters">{t("donate.needTitle")}</h2>
          <p>{t("donate.needLead")}</p>
        </div>
        <div className={styles.facts}>
          {[1, 2, 3, 4].map((n) => (
            <article key={n} className={styles.card}>
              <strong className={styles.stat}>{t(`donate.fact${n}Value`)}</strong>
              <p>{t(`donate.fact${n}Label`)}</p>
              <p className={styles.note}>{t(`donate.fact${n}Note`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="why-donate">
        <div className={styles.sectionHeader}>
          <h2 id="why-donate">{t("donate.whyTitle")}</h2>
        </div>
        <div className={styles.grid}>
          {[1, 2, 3].map((n) => (
            <article key={n} className={styles.card}>
              <h3>{t(`donate.why${n}Title`)}</h3>
              <p>{t(`donate.why${n}Text`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="where-it-goes">
        <div className={styles.sectionHeader}>
          <h2 id="where-it-goes">{t("donate.whereTitle")}</h2>
          <p>{t("donate.whereLead")}</p>
        </div>
        <div className={styles.grid}>
          {[1, 2, 3].map((n) => (
            <article key={n} className={styles.card}>
              <p className={styles.stepNumber}>{String(n).padStart(2, "0")}</p>
              <h3>{t(`donate.where${n}Title`)}</h3>
              <p>{t(`donate.where${n}Text`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="choose" className={styles.section} aria-labelledby="choose-title">
        <div className={styles.sectionHeader}>
          <h2 id="choose-title">{t("donate.chooseTitle")}</h2>
          <p>{t("donate.chooseLead")}</p>
        </div>

        {status === "loading" && <p className={styles.status}>{t("donate.loadingGovernments")}</p>}
        {status === "error" && (
          <p className={styles.status} role="alert">
            {t("donate.loadError")}
          </p>
        )}

        {status === "ready" && selected && (
          <div className={styles.panel}>
            <label className={styles.field} htmlFor={selectId}>
              <span>{t("donate.government")}</span>
              <select
                id={selectId}
                className={styles.select}
                value={choice === RECOMMENDED ? RECOMMENDED : governmentKey(selected)}
                onChange={(event) => choose(event.target.value)}
              >
                <option value={RECOMMENDED}>{t("donate.recommended", { name: recommended ? countryName(recommended) : "" })}</option>
                {governments.map((government) => (
                  <option key={governmentKey(government)} value={governmentKey(government)}>
                    {countryName(government)}
                  </option>
                ))}
              </select>
            </label>

            {isRecommended && recommended && (
              <p className={styles.recommend}>
                {t("donate.recommendedNote", {
                  name: countryName(recommended),
                  rural: formatCount(recommended.rural, locale),
                  year: recommended.year,
                })}
              </p>
            )}

            <dl className={styles.summary}>
              <div>
                <dt>{t("donate.ruralPeople")}</dt>
                <dd>{formatCount(selected.rural, locale)}</dd>
              </div>
              <div>
                <dt>{t("donate.year")}</dt>
                <dd>{selected.year}</dd>
              </div>
              <div>
                <dt>{t("donate.source")}</dt>
                <dd>{t("donate.worldBankSeries")}</dd>
              </div>
            </dl>

            <div className={styles.amounts}>
              <p className={styles.amountLabel} id="amount-label">
                {t("donate.giftAmount")}
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
                    {formatDollars(value, locale)}
                  </button>
                ))}
                <label className={styles.custom} data-active={usingCustom || undefined}>
                  {t("donate.custom")}
                  <input
                    type="text"
                    inputMode="numeric"
                    value={custom}
                    placeholder={t("donate.amountPlaceholder")}
                    aria-label={t("donate.customAmount")}
                    onChange={(event) => setCustom(event.target.value.replace(/[^\d]/g, ""))}
                  />
                </label>
              </div>
            </div>

            <section className={styles.impact} aria-live="polite" aria-labelledby="impact-title">
              <h3 id="impact-title">{t("donate.impact")}</h3>
              <p>
                {amountReady
                  ? t("donate.impactReady", {
                      amount: formatDollars(amount, locale),
                      name: countryName(selected),
                      rural: formatCount(selected.rural, locale),
                      year: selected.year,
                    })
                  : t("donate.impactMinimum")}
              </p>
              <p>
                {t("donate.impactContext", { name: countryName(selected) })}
              </p>
            </section>

            <button type="button" className={`btn btn-primary ${styles.pay}`} onClick={openPay} disabled={!amountReady}>
              {t("donate.pay")}
            </button>

            <dialog ref={payDialog} className={styles.popup} aria-labelledby="pay-title">
              <div className={styles.popupHead}>
                <h3 id="pay-title">{t("donate.pay")}</h3>
                <button type="button" className={styles.close} onClick={() => payDialog.current?.close()} aria-label={t("common.close")}>
                  ×
                </button>
              </div>
              <p>
                {t("donate.payBody", {
                  amount: formatDollars(amountReady ? amount : 0, locale),
                  name: countryName(selected),
                  rural: formatCount(selected.rural, locale),
                  year: selected.year,
                })}
              </p>
              <p className={styles.fine}>{t("donate.payFine")}</p>
            </dialog>
          </div>
        )}
        <HelpScanPrompt message={t("donate.scanChoose")} />
      </section>

      <section className={styles.section} aria-labelledby="all-governments">
        <div className={styles.tableHead}>
          <div className={styles.sectionHeader}>
            <h2 id="all-governments">{t("donate.governmentsTitle")}</h2>
            <p>{t("donate.governmentsLead")}</p>
          </div>
          <label className={styles.field} htmlFor={searchId}>
            <span>{t("donate.findGovernment")}</span>
            <input
              id={searchId}
              className={styles.search}
              type="search"
              value={query}
              placeholder={t("donate.searchPlaceholder")}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>

        {status === "loading" && <p className={styles.status}>{t("donate.loadingGovernments")}</p>}
        {status === "error" && <p className={styles.status}>{t("donate.figuresPending")}</p>}
        {status === "ready" && (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th scope="col">{t("donate.government")}</th>
                  <th scope="col" className={styles.num}>{t("donate.ruralPeople")}</th>
                  <th scope="col" className={styles.num}>{t("donate.year")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={3} className={styles.empty}>
                      {t("donate.noMatch")}
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
                          {countryName(government)}
                        </button>
                      </td>
                      <td className={styles.num}>{formatCount(government.rural, locale)}</td>
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
          <h2 id="sources-title">{t("common.sources")}</h2>
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
