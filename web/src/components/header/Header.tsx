"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/brand/Logo";
import { useLocale } from "@/i18n/LocaleProvider";
import { LOCALES, type LocaleId } from "@/i18n/locales";
import { navTabs } from "@/content/home";
import styles from "./Header.module.css";

export default function Header() {
  const pathname = usePathname();
  const { locale, setLocale, t } = useLocale();

  return (
    <header className={styles.header}>
      <nav className={`container ${styles.nav}`} aria-label={t("nav.primary")}>
        <Link href="/" className={styles.brand}>
          <Logo size={22} />
          Hestia
        </Link>

        <ul className={styles.tabs}>
          {navTabs.map((tab) => {
            const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  className={styles.tab}
                  data-active={active || undefined}
                  aria-current={active ? "page" : undefined}
                >
                  {t(`nav.${tab.id}`)}
                </Link>
              </li>
            );
          })}
        </ul>

        <label className={styles.lang}>
          <span className={styles.sr}>{t("lang.label")}</span>
          <select
            value={locale}
            aria-label={t("lang.label")}
            onChange={(event) => setLocale(event.target.value as LocaleId)}
          >
            {LOCALES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </nav>
    </header>
  );
}
