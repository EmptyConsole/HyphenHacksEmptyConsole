import ProblemPage from "@/components/problem/ProblemPage";
import { pageMetadata } from "@/i18n/pageMetadata";

export function generateMetadata() {
  return pageMetadata("meta.problemTitle");
}

export default function Page() {
  return <ProblemPage />;
}
