// mergeDuplicates.ts
//
// The same problem reported twice in one ward.
//
// Two complaints in the same ward, of the same category, closer together than
// DUPLICATE_RADIUS_M are the same ticket. The OLDER complaint survives. The
// NEW one gets mergedInto = the older id, so the ticket id the citizen already
// holds stays valid and points at the live ticket.
//
// This runs on creation: a new report is the only thing that can be a
// duplicate. It never merges into a newer complaint, and a complaint that is
// already merged is left alone.

import * as functions from 'firebase-functions/v1';

import { db, Timestamp } from '../lib/firebase';
import { distanceMeters, type GeoPoint } from '../lib/time';
import { DUPLICATE_RADIUS_M } from '../generated/constants';

/** The complaint statuses an incoming report may merge into. */
const OPEN_STATUSES = ['received', 'assigned', 'in_progress'];

// --- small shape helpers ----------------------------------------------------

function asGeo(value: unknown): GeoPoint | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.lat !== 'number' || typeof record.lng !== 'number') return undefined;
  return { lat: record.lat, lng: record.lng };
}

/** The millis of a stored timestamp, or undefined when it is not a time. */
function timestampMillis(value: unknown): number | undefined {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

// --- mergeDuplicates --------------------------------------------------------

export const mergeDuplicates = functions.firestore
  .document('complaints/{complaintId}')
  .onCreate(async (snap) => {
    const data = snap.data();
    if (data === undefined) return null;

    // A complaint that is already merged is not merged again.
    if (data.mergedInto !== undefined && data.mergedInto !== null) return null;

    const location = asGeo(data.location);
    const category = data.category;
    const wardId = data.wardId;
    if (location === undefined || typeof category !== 'string') return null;
    if (typeof wardId !== 'string' || wardId.length === 0) return null;

    const selfCreatedAt = timestampMillis(data.createdAt);
    if (selfCreatedAt === undefined) return null;

    // Read the ward's complaints by wardId alone. Filtering the status and the
    // category in code keeps the query on the automatic single-field index,
    // because the emulator does not prove composite index coverage.
    const sameWard = await db.collection('complaints').where('wardId', '==', wardId).get();

    let oldestId: string | undefined;
    let oldestMs: number | undefined;

    for (const doc of sameWard.docs) {
      if (doc.id === snap.id) continue;

      const other: Record<string, unknown> = doc.data() ?? {};
      if (typeof other.status !== 'string' || !OPEN_STATUSES.includes(other.status)) continue;
      if (other.category !== category) continue;

      const otherLocation = asGeo(other.location);
      if (otherLocation === undefined) continue;
      if (distanceMeters(location, otherLocation) > DUPLICATE_RADIUS_M) continue;

      const otherMs = timestampMillis(other.createdAt);
      // Only a complaint older than this one may absorb it. The older
      // complaint survives, so we keep the smallest createdAt seen.
      if (otherMs === undefined || otherMs >= selfCreatedAt) continue;
      if (oldestMs === undefined || otherMs < oldestMs) {
        oldestMs = otherMs;
        oldestId = doc.id;
      }
    }

    if (oldestId !== undefined) {
      await snap.ref.update({ mergedInto: oldestId });
    }

    return null;
  });
