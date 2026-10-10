"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { donateContent } from "@/content/donate";
import { dataProvider, type AreaFeature } from "@/data";
import { countryRuralAreas, villageCount } from "@/data/ruralCounts";
import { formatCost, formatCount, formatDollars } from "@/lib/format";
import styles from "./DonateView.module.css";

type Government = {
  id: string;
  name: string;
  people: number;
  cost: number;
  regions: number;
  villages: number;
  feature: AreaFeature;
};

type RegionStat = {
  id: string;
  name: string;
  people: number;
  villages: number;
};

const RECOMMENDED = "recommended";

/** Natural Earth reuses some numeric ids (Australia and Ashmore and Cartier Islands). */
function governmentKey(government: Government) {
  return `${government.id}:${government.name}`;
}

function peopleReached(amount: number, government: Government) {
  if (government.people <= 0 || government.cost <= 0) return 0;
  return amount * (government.people / government.cost);
}

export default function DonateView() {
  const selectId = useId();
  const searchId = useId();
  const [governments, setGovernments] = useState<Government[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [choice, setChoice] = useState(RECOMMENDED);
  const [regions, setRegions] = useState<RegionStat[] | null>(null);
  const [regionStatus, setRegionStatus] = useState<"loading" | "ready" | "error">("loading");
  const [preset, setPreset] = useState<number>(donateContent.amounts[1]);
  const [custom, setCustom] = useState("");
  const [query, setQuery] = useState("");
  const payDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let cancelled = false;
    dataProvider
      .getCountries()
      .then((collection) => {
        if (cancelled) return;
        const inNeed = new Set(donateContent.governmentsInNeed);
        const rows = collection.features
          .filter((feature) => inNeed.has(feature.properties.name))
          .map((feature) => {
          const areas = countryRuralAreas(feature.properties.id);
          return {
            id: feature.properties.id,
            name: feature.properties.name,
            people: feature.properties.estimated_population,
            cost: feature.properties.estimated_cost,
            regions: areas.regions,
            villages: areas.villages,
            feature,
          };
        });
        rows.sort((a, b) => a.name.localeCompare(b.name));
        setGovernments(rows);
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
      if (!best || government.people > best.people) return government;
      return best;
    }, null),
    [governments],
  );

  const selected = useMemo(() => {
    if (!recommended) return null;
    if (choice === RECOMMENDED) return recommended;
    return governments.find((government) => governmentKey(government) === choice) ?? recommended;
  }, [choice, governments, recommended]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setRegionStatus("loading");
    setRegions(null);
    dataProvider
      .getRegions(selected.feature)
      .then((collection) => {
        if (cancelled) return;
        const rows = collection.features.map((feature) => ({
          id: feature.properties.id,
          name: feature.properties.name,
          people: feature.properties.estimated_population,
          villages: villageCount(feature.properties.id),
        }));
        rows.sort((a, b) => b.people - a.people || a.name.localeCompare(b.name));
        setRegions(rows);
        setRegionStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setRegionStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const byNeed = useMemo(
    () => [...governments].sort((a, b) => b.people - a.people || a.name.localeCompare(b.name)),
    [governments],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return byNeed;
    return byNeed.filter((government) => government.name.toLowerCase().includes(needle));
  }, [byNeed, query]);

  const usingCustom = custom.trim() !== "";
  const customAmount = Number(custom);
  const amount = usingCustom ? customAmount : preset;
  const amountReady = Number.isFinite(amount) && amount >= 1;
  const reached = selected && amountReady ? peopleReached(amount, selected) : 0;
  const perPerson = selected && selected.people > 0 ? selected.cost / selected.people : 0;
  const isRecommended = selected != null && selected.id === recommended?.id;

  function choose(next: string) {
    setChoice(next);
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
      <div className="container">
        <header className={styles.intro}>
          <p className="eyebrow">{donateContent.eyebrow}</p>
          <h1 className={styles.title}>{donateContent.title}</h1>
          <p className={styles.lead}>{donateContent.lead}</p>
        </header>
      </div>

      <div className="container">
        <section className={styles.section} aria-labelledby="why-it-matters">
          <h2 id="why-it-matters" className={styles.sectionTitle}>
            The need
          </h2>
          <div className={styles.facts}>
            {donateContent.facts.map((fact) => (
              <article key={fact.label} className={styles.fact}>
                <strong>{fact.value}</strong>
                <span>{fact.label}</span>
              </article>
            ))}
          </div>
          <p className={styles.sources}>{donateContent.sources}</p>
        </section>
      </div>

      <div className="container">
        <section className={styles.section} aria-labelledby="why-donate">
          <h2 id="why-donate" className={styles.sectionTitle}>
            {donateContent.whyTitle}
          </h2>
          <div className={styles.reasons}>
            {donateContent.why.map((reason) => (
              <article key={reason.title} className={styles.reason}>
                <h3>{reason.title}</h3>
                <p>{reason.text}</p>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="container">
        <section className={styles.section} aria-labelledby="where-it-goes">
          <div className={styles.block}>
            <h2 id="where-it-goes" className={styles.sectionTitle}>
              {donateContent.whereTitle}
            </h2>
            <p className={styles.sectionLead}>{donateContent.whereLead}</p>
          </div>
          <div className={styles.steps}>
            {donateContent.where.map((step) => (
              <article key={step.step} className={styles.step}>
                <p className={styles.stepNumber}>{step.step}</p>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="container">
        <section id="choose" className={styles.chooser} aria-labelledby="choose-title">
          <div className={styles.block}>
            <h2 id="choose-title" className={styles.sectionTitle}>
              Choose a government
            </h2>
            <p className={styles.sectionLead}>
              These 25 governments are where rural people are still widely without vaccines. The first option is recommended: the one on this list with the most rural people still waiting for a route.
            </p>
          </div>

          {status === "loading" && <p className={styles.status}>Loading governments…</p>}
          {status === "error" && (
            <p className={styles.status} role="alert">
              The map estimates could not be loaded. Refresh the page to try again.
            </p>
          )}

          {status === "ready" && selected && (
            <>
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

              {isRecommended && (
                <p className={styles.note}>
                  <strong>Recommended: {selected.name}.</strong> Among these governments, it has the most rural people still waiting for a vaccine route.
                </p>
              )}

              <dl className={styles.summary}>
                <div className={styles.summaryItem}>
                  <dt>Rural people</dt>
                  <dd>
                    <strong>{formatCount(selected.people)}</strong>
                  </dd>
                </div>
                <div className={styles.summaryItem}>
                  <dt>Rural villages</dt>
                  <dd>
                    <strong>{formatCount(selected.villages)}</strong>
                  </dd>
                </div>
                <div className={styles.summaryItem}>
                  <dt>Regions</dt>
                  <dd>
                    <strong>{formatCount(selected.regions)}</strong>
                  </dd>
                </div>
                <div className={styles.summaryItem}>
                  <dt>Cost to reach them</dt>
                  <dd>
                    <strong>{formatCost(selected.cost)}</strong>
                  </dd>
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
                    ? `${formatDollars(amount)} reaches ${reached >= 1 ? `about ${formatCount(Math.round(reached))} rural people` : "part of one person’s vaccine route"} in ${selected.name}.`
                    : "Enter a gift of at least $1."}
                </p>
                <p>
                  About {formatDollars(Math.max(1, Math.round(perPerson)))} reaches one person. It finds their village, plans the path from the nearest clinic, and carries the vaccines.
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
                  {formatDollars(amountReady ? amount : 0)} is directed to {selected.name}. That reaches{" "}
                  {reached >= 1 ? `about ${formatCount(Math.round(reached))} rural people` : "part of one person’s vaccine route"} who still need vaccines.
                  It pays to find their villages, plan the path from the nearest clinic, and carry the vaccines there.
                </p>
                <p className={styles.fine}>Placeholder. This does not charge a card.</p>
              </dialog>

              <div className={styles.tableBlock}>
                <h3 className={styles.subhead}>Regions in {selected.name}</h3>
                <p className={styles.sectionLead}>
                  Rural villages are the settlements Hestia found in that region. Rural people are the people living there who still need vaccines.
                </p>
                {regionStatus === "loading" && <p className={styles.status}>Loading regions…</p>}
                {regionStatus === "error" && (
                  <p className={styles.status} role="alert">
                    Regions for {selected.name} could not be loaded.
                  </p>
                )}
                {regionStatus === "ready" && regions && (
                  <div className={`${styles.tableWrap} ${styles.tableWrapTight}`}>
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Region</th>
                          <th scope="col" className={styles.num}>Rural villages</th>
                          <th scope="col" className={styles.num}>Rural people</th>
                        </tr>
                      </thead>
                      <tbody>
                        {regions.map((region) => (
                          <tr key={region.id}>
                            <td>{region.name}</td>
                            <td className={styles.num}>{formatCount(region.villages)}</td>
                            <td className={styles.num}>{formatCount(region.people)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <div className="container">
        <section className={styles.section} aria-labelledby="all-governments">
          <div className={styles.tableHead}>
            <div className={styles.block}>
              <h2 id="all-governments" className={styles.sectionTitle}>
                Governments in need
              </h2>
              <p className={styles.sectionLead}>
                These 25 governments are where rural people are still widely without vaccines. The numbers are Hestia’s estimates of the villages missing from official maps, and the people there who still need vaccines.
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
            <p className={styles.status}>Estimates will appear here once the map data loads.</p>
          )}
          {status === "ready" && (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Government</th>
                    <th scope="col" className={styles.num}>Rural villages</th>
                    <th scope="col" className={styles.num}>Rural people</th>
                    <th scope="col" className={styles.num}>Cost to reach them</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={4} className={styles.empty}>
                        No government matches that name.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((government) => (
                      <tr key={governmentKey(government)} data-selected={governmentKey(government) === (selected ? governmentKey(selected) : "") || undefined}>
                        <td>
                          <button type="button" className={styles.nameBtn} onClick={() => chooseFromTable(government)}>
                            {government.name}
                          </button>
                        </td>
                        <td className={styles.num}>{formatCount(government.villages)}</td>
                        <td className={styles.num}>{formatCount(government.people)}</td>
                        <td className={styles.num}>{formatCost(government.cost)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
