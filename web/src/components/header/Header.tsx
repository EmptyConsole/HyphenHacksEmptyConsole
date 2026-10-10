"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navTabs } from "@/content/home";
import styles from "./Header.module.css";

export default function Header() {
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <nav className={`container ${styles.nav}`} aria-label="Primary">
        <Link href="/" className={styles.brand}>
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M3 15 L8 5 L13 11 L17 3" stroke="currentColor" strokeWidth="1.2" fill="none" opacity="0.5" />
            <circle cx="3" cy="15" r="1.8" fill="var(--color-accent)" />
            <circle cx="8" cy="5" r="1.4" fill="currentColor" />
            <circle cx="13" cy="11" r="1.4" fill="currentColor" />
            <circle cx="17" cy="3" r="1.8" fill="var(--color-accent)" />
          </svg>
          Constellations
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
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
