// identity.ts
//
// The three session minters. They are one pattern, from 02-contracts/
// callables.json `x-family.minting`:
//
//   check the caller, read the authoritative document, mint the token with
//   the claims that document says, return it. The client asks, the server
//   answers.
//
// A client parameter is never a claim. The routeId comes from the ward doc,
// the role and the wardIds come from the live staff doc, and the vanId comes
// from the driver doc. If a client could name its own scope it would read
// another route's trips or mint itself an inspector's authority.
//
// The other whole point of this file is bindDeviceToVan's rate limit. Without
// it the callable is an oracle: a caller could keep guessing driver codes and
// learn from the answer whether a code exists. So the counter is charged
// BEFORE the driver lookup, and a wrong code and a missing code both answer
// `notFound`.

import * as functions from 'firebase-functions/v1';
import {
  Timestamp,
  type DocumentReference,
  type Transaction,
} from 'firebase-admin/firestore';

import { db, auth, serverNow } from '../lib/firebase';
import { fail, withInternalGuard } from '../lib/reasonCodes';
import { requireUid } from '../lib/auth';
import {
  BIND_RATE_LIMIT_MAX,
  BIND_RATE_LIMIT_WINDOW_MIN,
  CLAIM_DEVICE_ID,
  CLAIM_DRIVER_ID,
  CLAIM_ROLE,
  CLAIM_ROUTE_ID,
  CLAIM_STAFF_ID,
  CLAIM_VAN_ID,
  CLAIM_WARD_IDS,
  DRIVER_CODE_PATTERN,
  VAN_DEVICE_CLAIM_MODE_FIRST,
  VAN_DEVICE_CLAIM_MODE_PREPROVISIONED,
} from '../generated/constants';

/** DRIVER_CODE_PATTERN, compiled once. The admin panel normalises; the server checks. */
const DRIVER_CODE = new RegExp(DRIVER_CODE_PATTERN);

/** The rate limit window in milliseconds. The constant is in minutes. */
const BIND_RATE_LIMIT_WINDOW_MS = BIND_RATE_LIMIT_WINDOW_MIN * 60 * 1000;

/**
 * The staff roles, from 02-contracts/enums.json#/$defs/staff.role.
 *
 * There is no generated TypeScript enum for this: 08-tools only generates
 * constants.json. The list is repeated here so the server can reject a role
 * the contract does not name.
 */
const STAFF_ROLES = ['inspector', 'chief_officer', 'tdo', 'ddo'] as const;

// --- small input helpers ----------------------------------------------------
//
// A callable's input block in 02-contracts/callables.json is the contract.
// Every required field is checked here, and a missing or wrong-typed field is
// `invalidInput`, never a guessed default.

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('invalidInput');
  return value as Record<string, unknown>;
}

function requiredString(data: Record<string, unknown>, name: string): string {
  const value = data[name];
  if (typeof value !== 'string' || value.length === 0) fail('invalidInput');
  return value;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/** The millis of a stored timestamp, or undefined when it is not a timestamp. */
function timestampMillis(value: unknown): number | undefined {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return undefined;
}

/** A stored claimMode that is not one of the two enum values reads as the default. */
function claimModeOf(value: unknown): string {
  return value === VAN_DEVICE_CLAIM_MODE_PREPROVISIONED
    ? VAN_DEVICE_CLAIM_MODE_PREPROVISIONED
    : VAN_DEVICE_CLAIM_MODE_FIRST;
}

// --- the device binding's oracle guard --------------------------------------

/**
 * Charge one bind attempt against `rateLimits/{bind:driverCode}`.
 *
 * The counter is the whole reason a wrong code and a missing code cannot be
 * told apart: after BIND_RATE_LIMIT_MAX attempts in the window the caller
 * gets `rateLimited` and learns nothing about any code.
 *
 * The read and the write are one transaction. Two phones racing on the same
 * code must not both fit inside the limit because both read count = 4.
 */
async function chargeBindAttempt(driverCode: string): Promise<void> {
  const key = `bind:${driverCode}`;
  const ref: DocumentReference = db.collection('rateLimits').doc(key);

  await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    const stored: Record<string, unknown> = snap.data() ?? {};

    const nowMs = Date.now();
    const startedMs = timestampMillis(stored.windowStartedAt);
    const count = typeof stored.count === 'number' ? stored.count : 0;
    const windowExpired =
      startedMs === undefined || nowMs - startedMs >= BIND_RATE_LIMIT_WINDOW_MS;

    if (windowExpired) {
      // A fresh window. This attempt is the first one in it.
      tx.set(ref, {
        key,
        count: 1,
        windowStartedAt: serverNow(),
        updatedAt: serverNow(),
      });
      return;
    }

    if (count >= BIND_RATE_LIMIT_MAX) fail('rateLimited');

    tx.set(ref, {
      key,
      count: count + 1,
      windowStartedAt: stored.windowStartedAt,
      updatedAt: serverNow(),
    });
  });
}

// --- bindDeviceToVan --------------------------------------------------------

/**
 * Bind an install id to a van and mint the driver's token.
 *
 * First claim wins. The vanDevices transaction is what settles two phones
 * presenting the same code at the same moment: one creates, the other sees a
 * different installId and gets `vanAlreadyClaimed`. A silent double-bind
 * would give two phones the same driver's authority.
 */
export const bindDeviceToVan = functions.https.onCall((data) =>
  withInternalGuard(async () => {
    const body = asRecord(data);
    const driverCode = requiredString(body, 'driverCode');
    const installId = requiredString(body, 'installId');

    // The pattern is public, so checking it reveals nothing. Do it before the
    // rate limit so a typo'd shape does not burn an attempt.
    if (!DRIVER_CODE.test(driverCode)) fail('invalidInput');

    // The oracle guard runs before any lookup that could reveal whether the
    // code exists.
    await chargeBindAttempt(driverCode);

    const driverSnap = await db.collection('drivers').doc(driverCode).get();
    // A wrong code and a missing code answer the same way on purpose.
    if (!driverSnap.exists) fail('notFound');

    const driver: Record<string, unknown> = driverSnap.data() ?? {};
    const vanId = typeof driver.vanId === 'string' && driver.vanId.length > 0 ? driver.vanId : undefined;
    if (vanId === undefined) fail('notFound');

    const vanDeviceRef: DocumentReference = db.collection('vanDevices').doc(vanId);
    let claimMode: string = VAN_DEVICE_CLAIM_MODE_FIRST;

    await db.runTransaction(async (tx: Transaction) => {
      const snap = await tx.get(vanDeviceRef);

      if (snap.exists) {
        const existing: Record<string, unknown> = snap.data() ?? {};
        // Another phone holds this van. Do not rewrite the binding.
        if (existing.installId !== installId) fail('vanAlreadyClaimed');
        // A match returns the binding as it already is. Nothing is written.
        claimMode = claimModeOf(existing.claimMode);
        return;
      }

      tx.set(vanDeviceRef, {
        installId,
        boundAt: serverNow(),
        boundBy: driverCode,
        claimMode: VAN_DEVICE_CLAIM_MODE_FIRST,
      });
      claimMode = VAN_DEVICE_CLAIM_MODE_FIRST;
    });

    const token = await auth.createCustomToken(driverCode, {
      [CLAIM_VAN_ID]: vanId,
      [CLAIM_DRIVER_ID]: driverCode,
    });

    return { token, vanId, driverId: driverCode, claimMode };
  }, 'bindDeviceToVan')
);

// --- bootstrapUserSession ---------------------------------------------------

/**
 * The citizen's session. The ward doc decides the route.
 *
 * The routeId is NOT a client parameter. If the citizen chose it, the client
 * could listen to any route's trips and see another neighbourhood's vans.
 */
export const bootstrapUserSession = functions.https.onCall((data) =>
  withInternalGuard(async () => {
    const body = asRecord(data);
    const deviceId = requiredString(body, 'deviceId');
    const wardId = requiredString(body, 'wardId');

    const wardSnap = await db.collection('wards').doc(wardId).get();
    if (!wardSnap.exists) fail('notFound');

    const ward: Record<string, unknown> = wardSnap.data() ?? {};
    // routeId is a required field on the ward schema. A ward without it is a
    // broken seed, not a client mistake, so it reads as `notFound`.
    const routeId = typeof ward.routeId === 'string' && ward.routeId.length > 0 ? ward.routeId : undefined;
    if (routeId === undefined) fail('notFound');

    const token = await auth.createCustomToken(deviceId, {
      [CLAIM_DEVICE_ID]: deviceId,
      [CLAIM_ROUTE_ID]: routeId,
    });

    return { token, deviceId, routeId };
  }, 'bootstrapUserSession')
);

// --- mintStaffToken ---------------------------------------------------------

/**
 * The admin panel's session. The live staff doc decides the scope.
 *
 * The panel signs in with its email account first, so the caller must already
 * be a signed-in Firebase Auth user. When the staff doc names that account in
 * authUid, the two must match: otherwise a signed-in panel user could ask for
 * another staff member's authority by guessing a doc id.
 *
 * The live `active` flag is re-read here, so a revoked staff member cannot
 * even refresh their token.
 */
export const mintStaffToken = functions.https.onCall((data, context) =>
  withInternalGuard(async () => {
    const body = asRecord(data);
    const staffId = requiredString(body, 'staffId');

    const uid = requireUid(context);

    const staffSnap = await db.collection('staff').doc(staffId).get();
    if (!staffSnap.exists) fail('notFound');

    const staff: Record<string, unknown> = staffSnap.data() ?? {};
    if (staff.active === false) fail('notAuthorised');

    const linkedUid = staff.authUid;
    if (typeof linkedUid === 'string' && linkedUid.length > 0 && linkedUid !== uid) {
      fail('notAuthorised');
    }

    const role = STAFF_ROLES.find((candidate) => candidate === staff.role);
    // role is required on the staff schema. A doc without a contract role is
    // not a usable staff record.
    if (role === undefined) fail('notFound');

    const wardIds = stringArray(staff.wardIds);
    // The scope was read from the live doc just now. This is the time the
    // panel shows so the office knows the token's scope is a snapshot. The
    // value comes from the server clock, never the client's.
    const scopeRefreshedAt = Timestamp.now().toDate().toISOString();

    const token = await auth.createCustomToken(staffId, {
      [CLAIM_STAFF_ID]: staffId,
      [CLAIM_ROLE]: role,
      [CLAIM_WARD_IDS]: wardIds,
    });

    return { token, role, staffId, wardIds, scopeRefreshedAt };
  }, 'mintStaffToken')
);
