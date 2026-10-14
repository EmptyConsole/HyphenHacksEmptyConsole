import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The repo root (one level up) holds the scanner's package-lock.json. Saying so stops
  // Next.js from guessing between lockfiles and warning about it on every start.
  turbopack: { root: path.join(process.cwd(), "..") },
  // Saved scans are read from disk at request time, so tracing can't see them. Ship them with
  // the routes that read them: on Vercel they then load from disk like they do locally, and
  // Supabase is only needed for scans saved after the deploy. Clinic tours come from Supabase.
  outputFileTracingIncludes: {
    "/api/scans": ["./data/scans/**/*"],
    "/api/scans/\\[id\\]": ["./data/scans/**/*"],
    "/solution": ["./data/scans/**/*"],
  },
};

export default nextConfig;
