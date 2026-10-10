import Link from "next/link";
import styles from "./HelpScanPrompt.module.css";

export default function HelpScanPrompt({ message }: { message: string }) {
  return (
    <div className={styles.prompt}>
      <p>{message}</p>
      <Link href="/?autoscan=1#map" className={styles.button}>
        Scan a region
      </Link>
    </div>
  );
}
