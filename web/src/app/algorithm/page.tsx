import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import AlgorithmView from "@/components/algorithm/AlgorithmView";

export const metadata: Metadata = {
  title: "Algorithm — Hestia",
  description: "The seven steps Hestia uses to find a village and price a route from the nearest clinic.",
};

function readAlgorithmSource() {
  try {
    return {
      source: readFileSync(path.join(process.cwd(), "..", "detect-villages.js"), "utf8"),
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
