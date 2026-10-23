"use client";

import { useLocale } from "@/i18n/LocaleProvider";
import ExplorerMapLoader from "./ExplorerMapLoader";
import styles from "./MapSection.module.css";

export default function MapSection() {
  const { t } = useLocale();

  return (
    <section id="map" className={styles.section}>
      <div className="container">
        <header className={styles.header}>
          <p className="eyebrow">{t("home.mapEyebrow")}</p>
          <h2 className={styles.title}>{t("home.mapTitle")}</h2>
          <p className={styles.lead}>{t("home.mapLead")}</p>
        </header>
        <ExplorerMapLoader />
      </div>
    </section>
  );
}
