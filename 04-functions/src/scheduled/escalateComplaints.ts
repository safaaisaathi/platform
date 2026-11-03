// escalateComplaints.ts
//
// Nobody acted, so the complaint moves up the chain.
//
// The clock is the SERVER's and it runs from the complaint's createdAt, which
// is a server timestamp. A complaint older than ESCALATION_L1_HOURS becomes
// level 1, and one older than ESCALATION_L2_HOURS becomes level 2. The level
// only ever rises: a complaint already at level 2 is left alone.
//
// There are exactly three statuses this sweep never touches: resolved,
// auto_resolved and reopened. Those are closed, or back in the office's queue
// with fresh work to do, and escalating them would be noise.
//
// escalatedTo is filled only when the ward names a staff member and that
// staff doc exists. The staff name is never copied into the complaint; the
// reader resolves the id against staff/{escalatedTo}.

import * as functions from 'firebase-functions/v1';

import { db, serverNow, Timestamp } from '../lib/firebase';
import { ESCALATION_L1_HOURS, ESCALATION_L2_HOURS } from '../generated/constants';

/**
 * The statuses this sweep scans. It is the complement of the three the
 * contract forbids, so the filter is a positive list rather than a `not-in`.
 */
const SCANNED_STATUSES = ['received', 'assigned', 'in_progress', 'escalated', 'pending_verification'];

/** The three statuses the contract says this sweep must never touch. */
const NEVER_TOUCHED = new Set(['resolved', 'auto_resolved', 'reopened']);

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

/**
 * The staff doc the ward points at, when there is one.
 *
 * The ward's escalationTo is the level-one target from the ward schema, and
 * inspectorId is the fallback. The id is only returned when the staff doc
 * really exists, so the complaint never points at a ghost.
 */
async function escalationTargetForWard(wardId: string): Promise<string | null> {
  const wardSnap = await db.collection('wards').doc(wardId).get();
  const ward: Record<string, unknown> = wardSnap.data() ?? {};

  const escalationTo =
    typeof ward.escalationTo === 'string' && ward.escalationTo.length > 0 ? ward.escalationTo : undefined;
  const inspectorId =
    typeof ward.inspectorId === 'string' && ward.inspectorId.length > 0 ? ward.inspectorId : undefined;
  const target = escalationTo ?? inspectorId;
  if (target === undefined) return null;

  const staffSnap = await db.collection('staff').doc(target).get();
  return staffSnap.exists ? target : null;
}

// --- escalateComplaints -----------------------------------------------------

export const escalateComplaints = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async () => {
    const nowMs = Date.now();
    const l1ThresholdMs = nowMs - ESCALATION_L1_HOURS * 3600 * 1000;
    const l2ThresholdMs = nowMs - ESCALATION_L2_HOURS * 3600 * 1000;

    const openSnap = await db.collection('complaints').where('status', 'in', SCANNED_STATUSES).get();

    const batch = db.batch();
    let updatedCount = 0;

    for (const doc of openSnap.docs) {
      const data: Record<string, unknown> = doc.data() ?? {};

      // Belt and braces: the query already excludes these, but the check is
      // the contract's "never touches" rule and stays close to the write.
      if (typeof data.status === 'string' && NEVER_TOUCHED.has(data.status)) continue;

      const createdMs = timestampMillis(data.createdAt);
      if (createdMs === undefined) continue;

      const currentLevel = typeof data.escalationLevel === 'number' ? data.escalationLevel : 0;

      let nextLevel = 0;
      if (createdMs <= l2ThresholdMs && currentLevel < 2) {
        nextLevel = 2;
      } else if (createdMs <= l1ThresholdMs && currentLevel < 1) {
        nextLevel = 1;
      }
      if (nextLevel === 0) continue;

      const wardId = typeof data.wardId === 'string' && data.wardId.length > 0 ? data.wardId : undefined;
      const escalatedTo = wardId === undefined ? null : await escalationTargetForWard(wardId);

      batch.update(doc.ref, {
        escalationLevel: nextLevel,
        escalatedAt: serverNow(),
        escalatedTo,
      });
      updatedCount++;
    }

    if (updatedCount > 0) {
      await batch.commit();
      console.log(`escalateComplaints: escalated ${updatedCount} complaints.`);
    }

    return null;
  });
