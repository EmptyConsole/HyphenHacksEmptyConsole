import { connection } from "next/server";
import { readClinicTour } from "@/lib/scanStore";

/** One clinic's joined tour: every scan that uses the clinic, in one round trip. */
export async function GET(_request: Request, ctx: RouteContext<"/api/tours/[clinicId]">) {
  await connection();
  const { clinicId } = await ctx.params;
  const record = await readClinicTour(clinicId);
  if (!record) return Response.json({ error: "no joined tour for this clinic" }, { status: 404 });
  return Response.json(record);
}
