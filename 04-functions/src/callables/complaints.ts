// complaints.ts
//
// The two citizen calls on a complaint.
//
// A citizen acts on their OWN complaint and nothing else. The deviceId claim
// is the citizen's only key: the complaint carries the same value, so the
// server compares the two before any write. A complaint id is not a secret,
// and a caller who guessed another citizen's id must still be refused.
//
// The live state machine is the authority here, not a rule:
//
//   citizenVerifyResolution  pending_verification -> resolved (confirmed) or
//                            reopened (rejected)
//   reopenComplaint          resolved | auto_resolved -> reopened
//
// Any other starting status is `invalidState`, which is a state conflict,
// not a failure.
//
// Both calls exist because the client may not decide these transitions
// directly. CHG-0013 removes the client-side complaint update.

import * as functions from 'firebase-functions/v1';

import { db, serverNow } from '../lib/firebase';
import { fail, withInternalGuard } from '../lib/reasonCodes';
import { requireClaim } from '../lib/auth';
import { CLAIM_DEVICE_ID } from '../generated/constants';

/** The complaint statuses these calls read and write, from the frozen enum. */
const STATUS_PENDING_VERIFICATION = 'pending_verification';
const STATUS_RESOLVED = 'resolved';
const STATUS_AUTO_RESOLVED = 'auto_resolved';
const STATUS_REOPENED = 'reopened';

/** What the citizen answered, from complaint.verificationOutcome. */
const VERIFICATION_CONFIRMED = 'confirmed';
const VERIFICATION_REJECTED = 'rejected';

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

function requiredBoolean(data: Record<string, unknown>, name: string): boolean {
  const value = data[name];
  if (typeof value !== 'boolean') fail('invalidInput');
  return value;
}

function optionalString(data: Record<string, unknown>, name: string): string | undefined {
  const value = data[name];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') fail('invalidInput');
  return value;
}

/** The complainant's install id, from the token. Never a client parameter. */
function citizenDeviceId(context: functions.https.CallableContext): string {
  return requireClaim(context, CLAIM_DEVICE_ID);
}

// --- citizenVerifyResolution ------------------------------------------------

/**
 * The citizen answers the office's cleaning proof.
 *
 *   confirmed true  -> status resolved, the auto-resolve clock is cleared
 *   confirmed false -> status reopened, the citizen's proof and reason are kept
 *
 * Only the citizen whose deviceId claim matches the complaint may answer, and
 * only while the complaint is pending_verification.
 */
export const citizenVerifyResolution = functions.https.onCall((data, context) =>
  withInternalGuard(async () => {
    const body = asRecord(data);
    const complaintId = requiredString(body, 'complaintId');
    const confirmed = requiredBoolean(body, 'confirmed');
    const proofPhotoUrl = optionalString(body, 'proofPhotoUrl');
    const reason = optionalString(body, 'reason');

    const deviceId = citizenDeviceId(context);

    const ref = db.collection('complaints').doc(complaintId);
    const snap = await ref.get();
    if (!snap.exists) fail('notFound');

    const complaint: Record<string, unknown> = snap.data() ?? {};
    if (complaint.deviceId !== deviceId) fail('notAuthorised');
    if (complaint.status !== STATUS_PENDING_VERIFICATION) fail('invalidState');

    if (confirmed) {
      const update: Record<string, unknown> = {
        status: STATUS_RESOLVED,
        resolvedAt: serverNow(),
        citizenVerifiedAt: serverNow(),
        citizenVerifiedStatus: VERIFICATION_CONFIRMED,
        // The citizen answered, so no auto-resolve is pending any more.
        autoResolveDeadline: null,
      };
      if (proofPhotoUrl !== undefined) update.resolvedPhotoUrl = proofPhotoUrl;
      await ref.update(update);
      return { newStatus: STATUS_RESOLVED };
    }

    const update: Record<string, unknown> = {
      status: STATUS_REOPENED,
      citizenVerifiedAt: serverNow(),
      citizenVerifiedStatus: VERIFICATION_REJECTED,
      autoResolveDeadline: null,
    };
    if (proofPhotoUrl !== undefined) update.citizenRejectPhotoUrl = proofPhotoUrl;
    if (reason !== undefined) update.citizenRejectReason = reason;
    await ref.update(update);
    return { newStatus: STATUS_REOPENED };
  }, 'citizenVerifyResolution')
);

// --- reopenComplaint --------------------------------------------------------

/**
 * The citizen reopens a complaint that was closed without the work being done.
 *
 * Only resolved or auto_resolved complaints can reopen. The escalation clock
 * restarts at level 0, because the complaint is back in the office's queue.
 */
export const reopenComplaint = functions.https.onCall((data, context) =>
  withInternalGuard(async () => {
    const body = asRecord(data);
    const complaintId = requiredString(body, 'complaintId');
    const proofPhotoUrl = optionalString(body, 'proofPhotoUrl');
    const reason = optionalString(body, 'reason');

    const deviceId = citizenDeviceId(context);

    const ref = db.collection('complaints').doc(complaintId);
    const snap = await ref.get();
    if (!snap.exists) fail('notFound');

    const complaint: Record<string, unknown> = snap.data() ?? {};
    if (complaint.deviceId !== deviceId) fail('notAuthorised');

    const status = complaint.status;
    if (status !== STATUS_RESOLVED && status !== STATUS_AUTO_RESOLVED) fail('invalidState');

    const update: Record<string, unknown> = {
      status: STATUS_REOPENED,
      escalationLevel: 0,
      autoResolveDeadline: null,
      reopenedAt: serverNow(),
    };
    if (proofPhotoUrl !== undefined) update.reopenPhotoUrl = proofPhotoUrl;
    if (reason !== undefined) update.reopenReason = reason;
    await ref.update(update);

    return { status: STATUS_REOPENED };
  }, 'reopenComplaint')
);
