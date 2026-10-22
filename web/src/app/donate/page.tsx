// import type { Metadata } from "next";
// import DonateView from "@/components/donate/DonateView";
import { notFound } from "next/navigation";

// Donate page is switched off for now. Restore the lines below (and the nav tab in
// src/content/home.ts) to bring it back.
//
// export const metadata: Metadata = {
//   title: "Donate · Hestia",
//   description: "Direct a gift to rural villages that are still missing from vaccine maps.",
// };

export default function DonatePage() {
  notFound();
  // return <DonateView />;
}
