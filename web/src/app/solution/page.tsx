import ContentPage from "@/components/content/ContentPage";
import { solutionContent } from "@/content/solution";

export default function SolutionPage() {
  return (
    <ContentPage
      title={solutionContent.title}
      subtitle={solutionContent.subtitle}
    />
  );
}
