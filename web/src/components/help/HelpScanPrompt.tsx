"use client";

import Link from "next/link";
import { useLocale } from "@/i18n/LocaleProvider";
import styles from "./HelpScanPrompt.module.css";

export default function HelpScanPrompt({ message }: { message: string }) {
  const { t } = useLocale();
  return (
    <div className={styles.prompt}>
      <p>{message}</p>
      <Link href="/?autoscan=1#map" className={styles.button}>
        {t("help.scanRegion")}
      </Link>
    </div>
  );
}
