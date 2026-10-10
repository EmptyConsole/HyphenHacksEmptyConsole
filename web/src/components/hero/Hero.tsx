import Link from "next/link";
import { homeContent } from "@/content/home";
import HeroGlobeLoader from "./HeroGlobeLoader";
import styles from "./Hero.module.css";

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
            <Link key={cta.href} href={cta.href} className={`btn btn-${cta.variant}`}>
              {cta.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
