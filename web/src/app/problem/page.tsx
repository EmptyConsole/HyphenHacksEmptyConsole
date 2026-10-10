import ContentPage from "@/components/content/ContentPage";
import { problemContent } from "@/content/problem";

export default function ProblemPage() {
  return (
    <ContentPage
      title={problemContent.title}
      subtitle={problemContent.subtitle}
    />
  );
}
