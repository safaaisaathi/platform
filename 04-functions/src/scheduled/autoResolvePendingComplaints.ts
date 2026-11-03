// autoResolvePendingComplaints.ts
//
// The office resolved a complaint and asked the citizen to confirm it. The
// citizen went quiet. After the deadline the complaint closes itself, so the
// office's word is not held open forever by silence.
//
// auto_resolved is not final. The citizen can still reopen it, which is why
// reopenComplaint accepts both resolved and auto_resolved.
//
// The deadline field is a server timestamp, and a null deadline means no
// verification was ever asked for. A null deadline is skipped: a complaint
// that is pending_verification without a deadline is not this sweep's job.

import * as functions from 'firebase-functions/v1';

import { db, serverNow, Timestamp } from '../lib/firebase';

/** The statuses and fields this sweep reads and writes, from the contract. */
const STATUS_PENDING_VERIFICATION = 'pending_verification';
const STATUS_AUTO_RESOLVED = 'auto_resolved';

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

// --- autoResolvePendingComplaints -------------------------------------------

export const autoResolvePendingComplaints = functions.pubsub
  .schedule('every hour')
  .onRun(async () => {
    const nowMs = Date.now();

    // Filtering by status alone keeps the query on the automatic single-field
    // index, and the deadline comparison is done in code so it tolerates both
    // a Firestore timestamp and an ISO string.
    const pendingSnap = await db
      .collection('complaints')
      .where('status', '==', STATUS_PENDING_VERIFICATION)
      .get();

    for (const doc of pendingSnap.docs) {
      const data: Record<string, unknown> = doc.data() ?? {};

      const deadline = data.autoResolveDeadline;
      // A null deadline means no verification was asked for. Never touch it.
      if (deadline === undefined || deadline === null) continue;

      const deadlineMs = timestampMillis(deadline);
      if (deadlineMs === undefined || deadlineMs > nowMs) continue;

      await doc.ref.update({
        status: STATUS_AUTO_RESOLVED,
        resolvedAt: serverNow(),
      });
    }

    return null;
  });
