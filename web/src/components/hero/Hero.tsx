"use client";

import Link from "next/link";
import { homeContent } from "@/content/home";
import HeroGlobeLoader from "./HeroGlobeLoader";
import styles from "./Hero.module.css";

function scrollMapIntoCenter(event: React.MouseEvent<HTMLAnchorElement>) {
  const map = document.getElementById("map-canvas");
  if (!map) return;

  event.preventDefault();
  const rect = map.getBoundingClientRect();
  const top = window.scrollY + rect.top - (window.innerHeight - rect.height) / 2;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({
    top: Math.max(0, top),
    behavior: reduceMotion ? "auto" : "smooth",
  });
}

export default function Hero() {
  const { hero } = homeContent;

  return (
    <section className={styles.hero}>
      <div className={styles.globe}>
        <HeroGlobeLoader />
      </div>
      <div className={styles.fade} aria-hidden="true" />

      <div className={`container ${styles.content}`}>
        <p className="eyebrow">{hero.eyebrow}</p>
        <h1 className={styles.headline}>
          {hero.headlineLines.map((line, index) => {
            const isLast = index === hero.headlineLines.length - 1;
            return (
              <span key={line}>
                {index > 0 && <br />}
                {isLast ? (
                  <span className={styles.accent}>{line}</span>
                ) : (
                  line
                )}
              </span>
            );
          })}
        </h1>
        <p className={styles.lead}>{hero.lead}</p>
        <div className={styles.ctas}>
          {hero.ctas.map((cta) => (
            <Link
              key={cta.href}
              href={cta.href}
              scroll={cta.href === "#map" ? false : undefined}
              onClick={cta.href === "#map" ? scrollMapIntoCenter : undefined}
              className={`btn btn-${cta.variant}`}
            >
              {cta.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
