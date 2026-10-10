import ContentPage from "@/components/content/ContentPage";
import { impactContent } from "@/content/impact";

export default function ImpactPage() {
  return (
    <ContentPage
      title={impactContent.title}
      subtitle={impactContent.subtitle}
    />
  );
}
