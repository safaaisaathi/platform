// time.ts
//
// The server clock and the geometry.
//
// Two rules live here.
//
// 1. The IST day boundary is a BUSINESS rule. The day a complaint belongs
//    to, the day a ward's duty belongs to, the day the rate limit counts
//    are all IST days. A phone in the wrong timezone, or a phone whose
//    clock is 12 hours off, must not be able to move a document into
//    yesterday. So the server computes the day, and the client asks.
//
// 2. The distance is the HAVERSINE distance on a sphere. The arrival alert
//    compares it to the ward's radius plus the alert radius.

import { Timestamp } from './firebase';

/** IST is UTC+05:30. */
const IST_OFFSET_MIN = 330;

/** The current IST day as YYYY-MM-DD. */
export function istDayKey(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + IST_OFFSET_MIN * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/** The IST midnight instant that starts the given day. */
export function istDayStart(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00+05:30`);
}

/** The IST midnight instant of the current day. */
export function istDayStartNow(now: Date = new Date()): Date {
  return istDayStart(istDayKey(now));
}

/** The ISO string of an IST day, used for the trips.date field. */
export function istDayInstant(dayKey: string): string {
  return istDayStart(dayKey).toISOString();
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * The distance between two points in metres, on a sphere.
 *
 * The same formula the client uses, so the client and the server agree on
 * the number. If they ever disagree, the citizen sees a van arrive at a
 * time the server disagrees with.
 */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371e3;
  const phi1 = (a.lat * Math.PI) / 180;
  const phi2 = (b.lat * Math.PI) / 180;
  const deltaPhi = ((b.lat - a.lat) * Math.PI) / 180;
  const deltaLambda = ((b.lng - a.lng) * Math.PI) / 180;

  const h =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** True when the location is older than the given number of seconds. */
export function isStale(
  updatedAt: unknown,
  maxAgeSeconds: number,
  now: Date = new Date()
): boolean {
  if (updatedAt === null || updatedAt === undefined) return true;
  if (updatedAt instanceof Timestamp) {
    return now.getTime() - updatedAt.toMillis() > maxAgeSeconds * 1000;
  }
  if (updatedAt instanceof Date) {
    return now.getTime() - updatedAt.getTime() > maxAgeSeconds * 1000;
  }
  if (typeof updatedAt === 'string') {
    const parsed = Date.parse(updatedAt);
    if (Number.isNaN(parsed)) return true;
    return now.getTime() - parsed > maxAgeSeconds * 1000;
  }
  return true;
}
