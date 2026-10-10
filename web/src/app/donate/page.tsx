import type { Metadata } from "next";
import DonateView from "@/components/donate/DonateView";

export const metadata: Metadata = {
  title: "Donate — Hestia",
  description: "Direct a gift to rural villages that are still missing from vaccine maps.",
};

export default function DonatePage() {
  return <DonateView />;
}
