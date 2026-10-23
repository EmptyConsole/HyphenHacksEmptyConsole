"use client";

import Link from "next/link";
import { useLocale } from "@/i18n/LocaleProvider";
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
  const { t } = useLocale();
  const lines = [t("home.line1"), t("home.line2"), t("home.line3")];

  return (
    <section className={styles.hero}>
      <div className={styles.globe}>
        <HeroGlobeLoader />
      </div>
      <div className={styles.fade} aria-hidden="true" />

      <div className={`container ${styles.content}`}>
        <p className="eyebrow">{t("home.eyebrow")}</p>
        <h1 className={styles.headline}>
          {lines.map((line, index) => {
            const isLast = index === lines.length - 1;
            return (
              <span key={index}>
                {index > 0 && <br />}
                {isLast ? <span className={styles.accent}>{line}</span> : line}
              </span>
            );
          })}
        </h1>
        <p className={styles.lead}>{t("home.lead")}</p>
        <div className={styles.ctas}>
          <Link href="#map" scroll={false} onClick={scrollMapIntoCenter} className="btn btn-primary">
            {t("home.ctaMap")}
          </Link>
          <Link href="/algorithm" className="btn btn-secondary">
            {t("home.ctaAlgorithm")}
          </Link>
        </div>
      </div>
    </section>
  );
}
