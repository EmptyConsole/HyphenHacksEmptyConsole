// Joined clinic tours: every scan whose team tour starts at the same clinic is joined into
// one tour from that clinic. Used by scan-batch.js and by the web app after a scan is saved.
//
// A tour record is { clinicId, summary, tour }:
//   summary: small, for lists and the clinic marker (name, scans, stops, cost, distance)
//   tour:    the stop order as [{ scanId, index }] and the route as a GeoJSON LineString

import { planClinicTour } from "./detectVillages.mjs";

/** The clinic a scan's own tour starts from, or null when it has none. */
export function tourClinicOf(collection) {
  const depot = collection?.tour?.depot;
  if (!depot || depot.kind !== "clinic" || depot.osmId == null) return null;
  return { osmId: depot.osmId, name: depot.name ?? null, lon: depot.lon, lat: depot.lat };
}

function vaccinationOf(scans, order) {
  const byId = new Map(scans.map((scan) => [scan.meta.id, scan.collection]));
  return order.reduce((sum, stop) => sum + (byId.get(stop.scanId)?.features[stop.index]?.properties.healthcareUsd ?? 0), 0);
}

/**
 * Build the joined tour for one clinic. `scans` is [{ meta, collection }], all sharing that
 * clinic. One scan reuses its own tour; several are planned together on one road network.
 */
export async function buildClinicTour(clinic, scans) {
  if (!scans.length) return null;
  let tour;
  if (scans.length === 1) {
    const own = scans[0].collection.tour;
    if (!own) return null;
    tour = { ...own, order: own.order.map((index) => ({ scanId: scans[0].meta.id, index })) };
  } else {
    tour = await planClinicTour(
      clinic,
      scans.map(({ meta, collection }) => ({ id: meta.id, bbox: meta.bbox, features: collection.features })),
    );
    if (!tour) return null;
  }
  const clinicId = String(clinic.osmId);
  return {
    clinicId,
    summary: {
      clinicId,
      clinicName: clinic.name,
      lon: clinic.lon,
      lat: clinic.lat,
      scans: scans.map((scan) => scan.meta.id),
      scanCount: scans.length,
      stops: tour.stops,
      skipped: tour.skipped,
      costUsd: tour.costUsd,
      roadUsd: tour.roadUsd,
      offroadUsd: tour.offroadUsd,
      roadMeters: tour.roadMeters,
      offroadMeters: tour.offroadMeters,
      vaccinationUsd: vaccinationOf(scans, tour.order),
      updatedAt: new Date().toISOString(),
    },
    tour: { order: tour.order, route: tour.route },
  };
}
