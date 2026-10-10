import { connection } from "next/server";
import { Suspense } from "react";
import SolutionPage from "@/components/solution/SolutionPage";
import { listScans, summarizeScans } from "@/lib/scanStore";

/** Scan totals are read per request so they include scans saved since the last build. */
async function LiveSolutionPage() {
  await connection();
  return <SolutionPage summary={summarizeScans(await listScans())} />;
}

export default function Page() {
  return (
    <Suspense fallback={<SolutionPage summary={null} />}>
      <LiveSolutionPage />
    </Suspense>
  );
}
