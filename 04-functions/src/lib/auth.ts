// auth.ts
//
// The live check helpers.
//
// The whole reason a callable exists is the LIVE document. A token's claims
// are a snapshot and can be up to an hour old, so a claim can answer "is
// this caller allowed to touch this document" but it CANNOT answer "is this
// complaint still inside the inspector's ward right now".
//
// Every helper here re-reads the live document. Never trust a claim for a
// decision the contract says needs a live read.

import * as functions from 'firebase-functions/v1';

import { db } from './firebase';
import { fail } from './reasonCodes';

/** The authenticated uid, or a reason code. */
export function requireUid(context: functions.https.CallableContext): string {
  const uid = context.auth?.uid;
  if (typeof uid !== 'string' || uid.length === 0) fail('notAuthorised');
  return uid;
}

/** One claim from the caller's token, or a reason code. */
export function requireClaim(
  context: functions.https.CallableContext,
  name: string
): string {
  const value = context.auth?.token[name];
  if (typeof value !== 'string' || value.length === 0) fail('notAuthorised');
  return value;
}

/** The caller's live staff scope. This is the instant-revocation check. */
export interface StaffScope {
  staffId: string;
  role: string;
  wardIds: string[];
  name: string;
}

export async function requireStaff(
  context: functions.https.CallableContext
): Promise<StaffScope> {
  requireUid(context);
  const staffId = requireClaim(context, 'staffId');

  const snap = await db.collection('staff').doc(staffId).get();
  if (!snap.exists) fail('notFound');

  const data = snap.data() as Record<string, unknown> | undefined;
  if (data === undefined) fail('notFound');

  // The live active flag. A revoked staff member's token stays valid for up
  // to an hour, so this read is the whole point of routing admin writes
  // through a callable. See ADR-0003.
  if (data.active === false) fail('notAuthorised');

  const wardIds = Array.isArray(data.wardIds)
    ? (data.wardIds as string[]).filter((id) => typeof id === 'string')
    : [];

  return {
    staffId,
    role: typeof data.role === 'string' ? data.role : 'inspector',
    wardIds,
    name: typeof data.name === 'string' ? data.name : staffId,
  };
}

/**
 * The staff member may act on this ward, or not.
 *
 * The DDO and the TDO have no ward list. They are the district and the
 * taluka. They act everywhere. Everyone else is limited to their wards.
 */
export function assertWardInScope(scope: StaffScope, wardId: string): void {
  if (scope.role === 'ddo' || scope.role === 'tdo') return;
  if (!scope.wardIds.includes(wardId)) fail('notAuthorised');
}

/** The staff member may act on this van's ward, or not. */
export function assertVanInScope(scope: StaffScope, wardId: string | undefined): void {
  if (scope.role === 'ddo' || scope.role === 'tdo') return;
  if (wardId === undefined || wardId.length === 0) fail('notAuthorised');
  if (!scope.wardIds.includes(wardId)) fail('notAuthorised');
}
