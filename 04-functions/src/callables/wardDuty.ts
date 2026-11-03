// wardDuty.ts
//
// The citizen's daily collection tick.
//
// wardDuty/{date}_{wardId} records whether the van finished its duty in one
// ward on one IST day. The document id carries the day, so the server computes
// the day: a phone in the wrong timezone must not read or write yesterday's
// row. That is why the citizen asks through getWardDutyStatus instead of
// reading the document.
//
// The write used to be the citizen's. CHG-0011 removes it: a citizen could
// mark any ward's duty as over. The driver app writes the board through
// startShift and markWardDone. The office corrects it here, and only inside
// its live ward scope.

import * as functions from 'firebase-functions/v1';

import { db, serverNow } from '../lib/firebase';
import { fail, withInternalGuard } from '../lib/reasonCodes';
import { requireStaff, assertWardInScope } from '../lib/auth';
import { istDayKey } from '../lib/time';

/** The two wardDuty statuses, from the frozen enum. */
const STATUS_IN_PROGRESS = 'in_progress';
const STATUS_COMPLETED = 'completed';

/** The IST day key shape: YYYY-MM-DD. */
const DAY_KEY_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

// --- small input helpers ----------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('invalidInput');
  return value as Record<string, unknown>;
}

function requiredString(data: Record<string, unknown>, name: string): string {
  const value = data[name];
  if (typeof value !== 'string' || value.length === 0) fail('invalidInput');
  return value;
}

function optionalString(data: Record<string, unknown>, name: string): string | undefined {
  const value = data[name];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') fail('invalidInput');
  return value;
}

/** The wardDuty document id is `{IST day}_{wardId}`. Only the server builds it. */
function wardDutyId(dayKey: string, wardId: string): string {
  return `${dayKey}_${wardId}`;
}

/** A stored status that is not one of the two enum values reads as in_progress. */
function normalizeStatus(value: unknown): string {
  return value === STATUS_COMPLETED ? STATUS_COMPLETED : STATUS_IN_PROGRESS;
}

// --- getWardDutyStatus ------------------------------------------------------

/**
 * Tell the citizen whether the van finished the duty in their ward today.
 *
 * The date is optional. When the client omits it, the SERVER's IST day is
 * used, so a phone with a wrong clock cannot read the wrong day's duty.
 */
export const getWardDutyStatus = functions.https.onCall((data) =>
  withInternalGuard(async () => {
    const body = asRecord(data);
    const wardId = requiredString(body, 'wardId');
    const date = optionalString(body, 'date');
    if (date !== undefined && !DAY_KEY_PATTERN.test(date)) fail('invalidInput');

    const dayKey = date ?? istDayKey();

    const dutySnap = await db.collection('wardDuty').doc(wardDutyId(dayKey, wardId)).get();
    if (!dutySnap.exists) {
      // No row yet means the van has not served this ward today.
      return { isDutyOver: false, status: STATUS_IN_PROGRESS };
    }

    const duty: Record<string, unknown> = dutySnap.data() ?? {};
    const status = normalizeStatus(duty.status);
    return {
      isDutyOver: duty.isDutyOver === true || status === STATUS_COMPLETED,
      status,
    };
  }, 'getWardDutyStatus')
);

// --- markWardDutyCompleted --------------------------------------------------

/**
 * The office marks a ward's duty as finished.
 *
 * The citizen app used to write this document, so a citizen could decide that
 * a ward's collection was done. CHG-0011 removes that write. This callable is
 * the office's correction path, for a van that could not serve the ward or a
 * duty done off-system.
 *
 * The caller's Live staff doc is the authority: the staff member must be
 * active and the ward must be inside their scope.
 */
export const markWardDutyCompleted = functions.https.onCall((data, context) =>
  withInternalGuard(async () => {
    const body = asRecord(data);
    const wardId = requiredString(body, 'wardId');
    const vanId = optionalString(body, 'vanId');

    const scope = await requireStaff(context);
    assertWardInScope(scope, wardId);

    const dayKey = istDayKey();

    // vanId is optional, because the office may close a duty with no van.
    // routeId is accepted from the input block but the wardDuty schema has no
    // routeId field, so it is not persisted. tripId is not known here either.
    const duty: Record<string, unknown> = {
      wardId,
      date: dayKey,
      status: STATUS_COMPLETED,
      isDutyOver: true,
      updatedAt: serverNow(),
    };
    if (vanId !== undefined) duty.vanId = vanId;

    await db.collection('wardDuty').doc(wardDutyId(dayKey, wardId)).set(duty, { merge: true });

    return { wardId, status: STATUS_COMPLETED, isDutyOver: true };
  }, 'markWardDutyCompleted')
);
