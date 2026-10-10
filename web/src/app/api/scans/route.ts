import { connection } from "next/server";
import { baselineConfig } from "@/data/baselineConfig";
import type { ScanRequest } from "@/data/types";
import { listScans, runAndSaveScan } from "@/lib/scanStore";
import { tileCount } from "@/lib/tiles";

/** Every saved scan's summary. Read from disk on each request so new scans show up. */
export async function GET() {
  await connection();
  return Response.json({ scans: await listScans() });
}

// A scan takes from ~10 s to a few minutes. Vercel stops a function at this limit
// (300 s is the most the Hobby plan allows with Fluid compute).
export const maxDuration = 300;

// One live scan at a time: each run downloads hundreds of tiles and queries Overpass.
let running = false;

/** Plain-language reason for a failed scan, instead of the raw error. */
function scanError(message: string) {
  if (/Overpass/i.test(message)) {
    return "OpenStreetMap's server (Overpass) is busy right now. Try again in a minute.";
  }
  if (/tile|JPEG|arcgisonline/i.test(message)) return "Satellite images couldn't be downloaded. Try again.";
  if (/took too long/.test(message)) return "The scan took too long. Try a smaller area.";
  return `Scan failed: ${message}`;
}

/** Runs the detector on the posted box. Takes from ~10 s to a few minutes. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<ScanRequest> | null;
  const { south, west, north, east, countryId, countryName } = body ?? {};
  const numbers = [south, west, north, east];
  if (!numbers.every((n) => typeof n === "number" && Number.isFinite(n))) {
    return Response.json({ error: "south, west, north and east must be numbers" }, { status: 400 });
  }
  if (typeof countryId !== "string" || !/^\d+$/.test(countryId) || typeof countryName !== "string") {
    return Response.json({ error: "countryId and countryName are required" }, { status: 400 });
  }
  const box = { south: south!, west: west!, north: north!, east: east! };
  if (!(box.south < box.north && box.west < box.east) || box.south <= -85 || box.north >= 85) {
    return Response.json({ error: "invalid bounding box" }, { status: 400 });
  }
  const tiles = tileCount(box.south, box.west, box.north, box.east);
  if (tiles > baselineConfig.maxScanTiles) {
    return Response.json({ error: `area covers ${tiles} tiles; zoom in further` }, { status: 400 });
  }
  if (running) {
    return Response.json({ error: "another scan is already running" }, { status: 409 });
  }

  running = true;
  try {
    const scan = await runAndSaveScan({ ...box, countryId, countryName });
    return Response.json({ scan });
  } catch (error) {
    console.error("scan failed:", error);
    return Response.json({ error: scanError((error as Error).message) }, { status: 502 });
  } finally {
    running = false;
  }
}
