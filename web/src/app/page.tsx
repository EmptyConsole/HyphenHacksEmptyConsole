import Hero from "@/components/hero/Hero";
import MapSection from "@/components/map/MapSection";
import { pageMetadata } from "@/i18n/pageMetadata";

export function generateMetadata() {
  return pageMetadata("meta.title");
}

export default function Home() {
  return (
    <main>
      <Hero />
      <MapSection />
    </main>
  );
}
