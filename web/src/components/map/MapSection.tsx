import { homeContent } from "@/content/home";
import ExplorerMapLoader from "./ExplorerMapLoader";
import styles from "./MapSection.module.css";

export default function MapSection() {
  const { map } = homeContent;

  return (
    <section id="map" className={styles.section}>
      <div className="container">
        <header className={styles.header}>
          <p className="eyebrow">{map.eyebrow}</p>
          <h2 className={styles.title}>{map.title}</h2>
          <p className={styles.lead}>{map.lead}</p>
        </header>
        <ExplorerMapLoader />
      </div>
    </section>
  );
}
