import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import Header from "@/components/header/Header";
import LocaleProvider from "@/i18n/LocaleProvider";
import { loadLocale } from "@/i18n/loadLocale";
import { LOCALE_COOKIE, resolveLocale, textDirection } from "@/i18n/locales";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const instant = false;

export const metadata: Metadata = {
  title: "Hestia",
  description: "Finding unmapped villages and routing vaccination teams to them.",
  icons: {
    icon: [
      { url: "/favicon.ico?v=3", sizes: "32x32" },
      { url: "/favicon-32.png?v=3", type: "image/png", sizes: "32x32" },
      { url: "/favicon.svg?v=3", type: "image/svg+xml" },
    ],
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const jar = await cookies();
  const locale = resolveLocale(jar.get(LOCALE_COOKIE)?.value);
  const messages = await loadLocale(locale);

  return (
    <html lang={locale} dir={textDirection(locale)} className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <LocaleProvider initialLocale={locale} initialMessages={messages}>
          <Header />
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
