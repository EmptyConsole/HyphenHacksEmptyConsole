import styles from "./page.module.css";
import { solutionContent } from "@/content/solution";

export default function SolutionPage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>{solutionContent.eyebrow}</p>
        <h1 className={styles.title}>{solutionContent.title}</h1>
        <p className={styles.subtitle}>{solutionContent.subtitle}</p>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>{solutionContent.sectionTitle}</h2>
          <p>{solutionContent.sectionIntro}</p>
        </div>

        <div className={styles.grid}>
          {solutionContent.pillars.map((pillar) => (
            <article key={pillar.title} className={styles.card}>
              <h3>{pillar.title}</h3>
              <p>{pillar.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>{solutionContent.flowTitle}</h2>
        </div>

        <div className={styles.diagramWrap}>
          <svg
            className={styles.diagram}
            viewBox="0 0 940 220"
            role="img"
            aria-label="Village data to funding flow diagram"
          >
            <defs>
              <linearGradient id="flowFill" x1="0" x2="1">
                <stop offset="0%" stopColor="#7dd3fc" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>

            <rect
              x="20"
              y="60"
              width="150"
              height="100"
              rx="16"
              fill="rgba(125,211,252,0.12)"
              stroke="#7dd3fc"
            />
            <text
              x="95"
              y="99"
              textAnchor="middle"
              fill="#e2e8f0"
              fontSize="16"
              fontWeight="600"
            >
              Village
            </text>
            <text
              x="95"
              y="120"
              textAnchor="middle"
              fill="#cbd5e1"
              fontSize="13"
            >
              scan
            </text>

            <path
              d="M170 110 H260"
              stroke="#7dd3fc"
              strokeWidth="3"
              markerEnd="url(#arrow)"
            />

            <rect
              x="260"
              y="60"
              width="160"
              height="100"
              rx="16"
              fill="rgba(139,92,246,0.12)"
              stroke="#8b5cf6"
            />
            <text
              x="340"
              y="99"
              textAnchor="middle"
              fill="#e2e8f0"
              fontSize="16"
              fontWeight="600"
            >
              Need
            </text>
            <text
              x="340"
              y="120"
              textAnchor="middle"
              fill="#cbd5e1"
              fontSize="13"
            >
              estimate
            </text>

            <path
              d="M420 110 H500"
              stroke="#8b5cf6"
              strokeWidth="3"
              markerEnd="url(#arrow)"
            />

            <rect
              x="500"
              y="60"
              width="170"
              height="100"
              rx="16"
              fill="rgba(96,165,250,0.12)"
              stroke="#60a5fa"
            />
            <text
              x="585"
              y="99"
              textAnchor="middle"
              fill="#e2e8f0"
              fontSize="16"
              fontWeight="600"
            >
              Priority
            </text>
            <text
              x="585"
              y="120"
              textAnchor="middle"
              fill="#cbd5e1"
              fontSize="13"
            >
              model
            </text>

            <path
              d="M670 110 H760"
              stroke="#60a5fa"
              strokeWidth="3"
              markerEnd="url(#arrow)"
            />

            <rect
              x="760"
              y="60"
              width="160"
              height="100"
              rx="16"
              fill="rgba(16,185,129,0.12)"
              stroke="#34d399"
            />
            <text
              x="840"
              y="99"
              textAnchor="middle"
              fill="#e2e8f0"
              fontSize="16"
              fontWeight="600"
            >
              Funding
            </text>
            <text
              x="840"
              y="120"
              textAnchor="middle"
              fill="#cbd5e1"
              fontSize="13"
            >
              match
            </text>

            <defs>
              <marker
                id="arrow"
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="5"
                orient="auto"
              >
                <path d="M0,0 L10,5 L0,10 z" fill="#a5b4fc" />
              </marker>
            </defs>
          </svg>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>{solutionContent.priorityTitle}</h2>
          <p>{solutionContent.priorityIntro}</p>
        </div>

        <div className={styles.bars}>
          {solutionContent.priorities.map((priority) => (
            <div key={priority.label} className={styles.barGroup}>
              <div
                className={styles.bar}
                style={{ height: `${priority.value}%` }}
                aria-label={`${priority.label} ${priority.value}%`}
              />
              <div className={styles.barLabel}>{priority.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>{solutionContent.sourcesTitle}</h2>
        </div>

        <ul className={styles.sourceList}>
          {solutionContent.sources.map((source) => (
            <li key={source.label}>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.label}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
