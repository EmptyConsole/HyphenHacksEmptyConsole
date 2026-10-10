import { connection } from "next/server";
import { readScan } from "@/lib/scanStore";

/** One scan's village polygons, routes and clinics, exactly as detect-villages.js wrote them. */
export async function GET(_request: Request, ctx: RouteContext<"/api/scans/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const text = await readScan(id);
  if (!text) return Response.json({ error: "scan not found" }, { status: 404 });
  return new Response(text, { headers: { "Content-Type": "application/json" } });
}
