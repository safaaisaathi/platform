// tracking.ts
//
// The driver's mock-location call.
//
// F-D9 says the driver's phone must leave a durable record when Android
// reports a mocked GPS fix. The phone is the only party that can detect a mock
// fix, but the trip document is server-owned: 03-rules/firestore.strict.rules
// denies every client write on trips/{tripId} except the trail subcollection.
// So the decision is the client's and the write is the server's, which is
// exactly what a callable is for.
//
// The latch is one-way. This call sets trips.mockLocationDetected to true and
// never to false, and a second call on an already-flagged trip writes nothing.
// The flag is self-reported, so it is a review hint, not proof; a scheduled
// trail-anomaly sweep is the planned backstop.

import * as functions from 'firebase-functions/v1';
import type { DocumentReference, Transaction } from 'firebase-admin/firestore';

import { db } from '../lib/firebase';
import { fail, withInternalGuard } from '../lib/reasonCodes';
import { requireClaim } from '../lib/auth';
import { CLAIM_DRIVER_ID } from '../generated/constants';

/** The trip status while the shift is live, from 02-contracts/enums.json. */
const TRIP_STATUS_ON_SHIFT = 'on_shift';

// --- small input helpers ----------------------------------------------------
//
// The input block in 02-contracts/callables.json is the contract. A missing
// or wrong-typed required field is `invalidInput`, never a guessed default.

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('invalidInput');
  return value as Record<string, unknown>;
}

function requiredString(data: Record<string, unknown>, name: string): string {
  const value = data[name];
  if (typeof value !== 'string' || value.length === 0) fail('invalidInput');
  return value;
}

// --- flagMockLocation -------------------------------------------------------

/**
 * Set the mock-location latch on the caller's own open trip.
 *
 * The caller must own the trip: the driverId claim is compared with the
 * stored trips.driverId, never with anything the client sent. The trip must
 * still be on_shift, because a flag on a closed trip has nothing to review.
 *
 * Only trips.mockLocationDetected is written, and only ever to true. A second
 * call on an already-flagged trip succeeds and writes nothing, so a client
 * retry after a dropped response is safe.
 */
export const flagMockLocation = functions.https.onCall((data, context) =>
  withInternalGuard(async () => {
    const body = asRecord(data);
    const tripId = requiredString(body, 'tripId');

    // The token names the driver. The input never does.
    const driverId = requireClaim(context, CLAIM_DRIVER_ID);

    // The server's clock for this call. The latch stores no timestamp, so
    // this is what the response reports as flaggedAt.
    const flaggedAt = new Date();

    const tripRef: DocumentReference = db.collection('trips').doc(tripId);

    // True when this call set the latch, false when it was already set.
    const flagged = await db.runTransaction(async (tx: Transaction) => {
      const tripSnap = await tx.get(tripRef);
      if (!tripSnap.exists) fail('notFound');

      const trip: Record<string, unknown> = tripSnap.data() ?? {};
      if (trip.driverId !== driverId) fail('notAuthorised');
      if (trip.status !== TRIP_STATUS_ON_SHIFT) fail('invalidState');

      // The one-way latch. The transaction reads the current value first, so
      // a second call does not write and does not flip the flag back.
      if (trip.mockLocationDetected === true) return false;

      tx.update(tripRef, { mockLocationDetected: true });
      return true;
    });

    return { flagged, flaggedAt: flaggedAt.toISOString() };
  }, 'flagMockLocation')
);
