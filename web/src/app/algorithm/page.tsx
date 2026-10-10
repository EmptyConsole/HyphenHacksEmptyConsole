import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import AlgorithmView from "@/components/algorithm/AlgorithmView";

export const metadata: Metadata = {
  title: "Algorithm · Hestia",
  description: "The seven steps Hestia uses to find villages and plan one route from the nearest clinic that reaches them all.",
};

function readAlgorithmSource() {
  try {
    return {
      // The detector's real code. detect-villages.js at the repo root is only a command-line wrapper.
      source: readFileSync(path.join(process.cwd(), "src", "lib", "detector", "detectVillages.mjs"), "utf8"),
      error: null,
    };
  } catch {
    return { source: null, error: "detect-villages.js could not be read." };
  }
}

export default function Page() {
  const { source, error } = readAlgorithmSource();
  return <AlgorithmView source={source} error={error} />;
}
