import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Saved scans and clinic tours are read from disk at request time, so tracing can't see
  // them. Ship them with the routes that read them: on Vercel they then load from disk like
  // they do locally, and Supabase is only needed for scans saved after the deploy.
  outputFileTracingIncludes: {
    "/api/scans": ["./data/scans/**/*"],
    "/api/scans/\\[id\\]": ["./data/scans/**/*"],
    "/api/tours/\\[clinicId\\]": ["./data/tours/**/*", "./data/scans/**/*"],
    "/solution": ["./data/scans/**/*"],
  },
};

export default nextConfig;
