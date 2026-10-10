import styles from "./ContentPage.module.css";

const DEFAULT_SUBTITLE =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";

type ContentPageProps = {
  title: string;
  subtitle?: string;
};

export default function ContentPage({
  title,
  subtitle = DEFAULT_SUBTITLE,
}: ContentPageProps) {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.subtitle}>{subtitle}</p>
    </main>
  );
}
