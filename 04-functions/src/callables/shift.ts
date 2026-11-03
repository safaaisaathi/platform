// shift.ts
//
// The driver's three shift calls. They exist because the duplicate-trip race
// is real: two clients on one van both read "no open trip", both create a
// trip, and both write vans.currentTripId. The last write wins and one shift
// is orphaned. Every read-decide-write here is therefore a transaction on the
// van document, and the resume branch writes nothing at all.
//
// The other rule this file keeps: the ward list is a SNAPSHOT. trips.wardIds
// is taken at shift start, so a mid-shift change to the driver's allotment
// does not rewrite today's record. markWardDone scopes on that snapshot, not
// on the driver doc and not on a client parameter.
//
// wardDuty is the citizen's daily tick. startShift creates the row as
// in_progress and markWardDone flips it to completed. The citizen never
// writes it. CHG-0011.

import * as functions from 'firebase-functions/v1';
import {
  Timestamp,
  type DocumentReference,
  type Transaction,
} from 'firebase-admin/firestore';

import { db, auth, serverNow } from '../lib/firebase';
import { fail, withInternalGuard } from '../lib/reasonCodes';
import { requireClaim } from '../lib/auth';
import { istDayInstant, istDayKey } from '../lib/time';
import {
  CLAIM_CURRENT_TRIP_ID,
  CLAIM_DRIVER_ID,
  CLAIM_VAN_ID,
} from '../generated/constants';

/**
 * The trip and van status strings, from 02-contracts/enums.json.
 *
 * van.status is the frozen enum. A trip's status is the same two live values
 * and is named by 02-contracts/callables.json (`on_shift`, `ended`). There is
 * no generated TypeScript enum for either, so the strings live here.
 */
const VAN_STATUS_ON_SHIFT = 'on_shift';
const VAN_STATUS_IDLE = 'idle';
const TRIP_STATUS_ON_SHIFT = 'on_shift';
const TRIP_STATUS_ENDED = 'ended';
const WARD_DUTY_STATUS_IN_PROGRESS = 'in_progress';
const WARD_DUTY_STATUS_COMPLETED = 'completed';

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

function optionalBoolean(data: Record<string, unknown>, name: string): boolean | undefined {
  const value = data[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') fail('invalidInput');
  return value;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/** The wards already recorded on a trip, tolerant of an old or odd shape. */
interface WardDoneEntry {
  wardId: string;
  doneAt: unknown;
  flagged?: boolean;
}

function readWardsDone(value: unknown): WardDoneEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: WardDoneEntry[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.wardId !== 'string') continue;
    const entry: WardDoneEntry = { wardId: record.wardId, doneAt: record.doneAt };
    if (record.flagged === true) entry.flagged = true;
    entries.push(entry);
  }
  return entries;
}

/** The ISO string of a stored doneAt, which may be a Timestamp or a string. */
function doneAtIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return '';
}

/**
 * The IST day a trip belongs to, as YYYY-MM-DD.
 *
 * trips.date is the IST midnight instant of the shift's day (time.ts keeps it
 * as an ISO string). The day key is derived from it so a shift that starts
 * before IST midnight and marks a ward after it still belongs to the start
 * day, which is the day the citizen's tick is about.
 */
function tripDayKey(value: unknown): string {
  if (value instanceof Timestamp) return istDayKey(value.toDate());
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return istDayKey(parsed);
  }
  // A trip always carries a date. Falling back to the server's day keeps the
  // write on the IST boundary rather than on the phone's.
  return istDayKey();
}

/** The wardDuty document id is `{IST day}_{wardId}`. The server computes it. */
function wardDutyId(dayKey: string, wardId: string): string {
  return `${dayKey}_${wardId}`;
}

// --- startShift -------------------------------------------------------------

/**
 * Start the driver's shift, or resume the one already open.
 *
 * The transaction is on vans/{vanId}:
 *
 *   marker set and the van is on shift  -> read the trip
 *     another driver  -> vanHeldByAnotherDriver
 *     another van     -> staleMarker
 *     otherwise       -> RESUME, write nothing
 *   otherwise          -> create the trip, set the marker, seed wardDuty
 *
 * The trip id is deterministic per driver per IST day, so a retried request
 * cannot create a second trip for the same day.
 */
export const startShift = functions.https.onCall((data, context) =>
  withInternalGuard(async () => {
    const body = asRecord(data);
    const driverId = requiredString(body, 'driverId');
    const shiftDate = requiredString(body, 'date');
    if (Number.isNaN(Date.parse(shiftDate))) fail('invalidInput');

    // The caller must be the driver whose badge code is in the input, and the
    // token must carry the van binding. The claim is the identity.
    const claimedDriverId = requireClaim(context, CLAIM_DRIVER_ID);
    requireClaim(context, CLAIM_VAN_ID);
    if (claimedDriverId !== driverId) fail('notAuthorised');

    const driverSnap = await db.collection('drivers').doc(driverId).get();
    if (!driverSnap.exists) fail('notFound');

    const driver: Record<string, unknown> = driverSnap.data() ?? {};
    const vanId = typeof driver.vanId === 'string' && driver.vanId.length > 0 ? driver.vanId : undefined;
    const routeId = typeof driver.routeId === 'string' && driver.routeId.length > 0 ? driver.routeId : undefined;
    // A driver with no allotment cannot start a shift. The allotment is a
    // live-doc fact, never a client parameter.
    if (vanId === undefined || routeId === undefined) fail('notFound');

    const routeSnap = await db.collection('routes').doc(routeId).get();
    if (!routeSnap.exists) fail('notFound');
    const routeWardIds = stringArray((routeSnap.data() ?? {}).wardIds);

    // The server owns the day. A phone with a wrong clock cannot move the
    // shift to another day, and a retry on the same day lands on the same id.
    const dayKey = istDayKey();
    const tripDate = istDayInstant(dayKey);
    const tripId = `${driverId}_${dayKey}`;

    const vanRef: DocumentReference = db.collection('vans').doc(vanId);
    const tripRef: DocumentReference = db.collection('trips').doc(tripId);

    const openTripId = await db.runTransaction(async (tx: Transaction) => {
      const vanSnap = await tx.get(vanRef);
      if (!vanSnap.exists) fail('notFound');

      const van: Record<string, unknown> = vanSnap.data() ?? {};
      const currentTripId =
        typeof van.currentTripId === 'string' && van.currentTripId.length > 0
          ? van.currentTripId
          : undefined;

      if (currentTripId !== undefined && van.status === VAN_STATUS_ON_SHIFT) {
        const openTripRef: DocumentReference = db.collection('trips').doc(currentTripId);
        const openSnap = await tx.get(openTripRef);
        // The marker points at nothing. That is a stale marker, not a new
        // shift: creating one would orphan whatever the marker meant.
        if (!openSnap.exists) fail('staleMarker');

        const openTrip: Record<string, unknown> = openSnap.data() ?? {};
        if (openTrip.driverId !== driverId) fail('vanHeldByAnotherDriver');
        if (openTrip.vanId !== vanId) fail('staleMarker');

        // RESUME. The trip is already open, so nothing is written.
        return currentTripId;
      }

      // Create. The trip, the van marker and the wardDuty rows commit together
      // or not at all.
      tx.set(tripRef, {
        // EXT-0001: the driver app's Trip model reads trips.id and casts it to
        // a non-null string. The server now creates the trip, so it writes the
        // registered extension field too.
        id: tripId,
        driverId,
        vanId,
        routeId,
        wardIds: routeWardIds,
        date: tripDate,
        startedAt: serverNow(),
        endedAt: null,
        status: TRIP_STATUS_ON_SHIFT,
        wardsDone: [],
        alertedWardIds: [],
      });

      tx.update(vanRef, {
        currentTripId: tripId,
        status: VAN_STATUS_ON_SHIFT,
      });

      for (const wardId of routeWardIds) {
        const dutyRef: DocumentReference = db
          .collection('wardDuty')
          .doc(wardDutyId(dayKey, wardId));
        tx.set(dutyRef, {
          wardId,
          date: dayKey,
          status: WARD_DUTY_STATUS_IN_PROGRESS,
          isDutyOver: false,
          vanId,
          tripId,
          updatedAt: serverNow(),
        });
      }

      return tripId;
    });

    const token = await auth.createCustomToken(driverId, {
      [CLAIM_CURRENT_TRIP_ID]: openTripId,
      [CLAIM_VAN_ID]: vanId,
      [CLAIM_DRIVER_ID]: driverId,
    });

    return { token, tripId: openTripId, vanId };
  }, 'startShift')
);

// --- endShift ---------------------------------------------------------------

/**
 * End the driver's shift and clear the van's marker.
 *
 * The caller must own the trip. The marker is cleared ONLY when it still
 * points at this trip: if another shift took the van between the read and the
 * write, that shift keeps its marker and the van stays on shift.
 */
export const endShift = functions.https.onCall((data, context) =>
  withInternalGuard(async () => {
    const body = asRecord(data);
    const tripId = requiredString(body, 'tripId');

    const driverId = requireClaim(context, CLAIM_DRIVER_ID);

    // The value the response reports. The stored value is the server
    // timestamp written below, resolved by Firestore at commit.
    const handledAt = new Date();

    const tripRef: DocumentReference = db.collection('trips').doc(tripId);

    await db.runTransaction(async (tx: Transaction) => {
      const tripSnap = await tx.get(tripRef);
      if (!tripSnap.exists) fail('notFound');

      const trip: Record<string, unknown> = tripSnap.data() ?? {};
      if (trip.driverId !== driverId) fail('notAuthorised');
      if (trip.status !== TRIP_STATUS_ON_SHIFT) fail('invalidState');

      const vanId = typeof trip.vanId === 'string' && trip.vanId.length > 0 ? trip.vanId : undefined;
      const vanRef: DocumentReference | undefined =
        vanId === undefined ? undefined : db.collection('vans').doc(vanId);
      const vanSnap = vanRef === undefined ? undefined : await tx.get(vanRef);

      tx.update(tripRef, {
        endedAt: serverNow(),
        status: TRIP_STATUS_ENDED,
      });

      const van: Record<string, unknown> | undefined = vanSnap?.data();
      if (vanRef !== undefined && van !== undefined && van.currentTripId === tripId) {
        tx.update(vanRef, {
          currentTripId: null,
          status: VAN_STATUS_IDLE,
        });
      }
    });

    return { endedAt: handledAt.toISOString() };
  }, 'endShift')
);

// --- markWardDone -----------------------------------------------------------

/**
 * Record a ward as collected during the open trip.
 *
 * The ward must be in the trip's snapshot. Marks may arrive out of order, and
 * re-marking a ward is allowed: it just refreshes doneAt. The flag is a
 * tamper signal (the driver marked the ward from outside its radius), so once
 * true it stays true.
 *
 * The same transaction flips wardDuty/{date}_{wardId} to completed, which is
 * how the citizen's daily tick becomes true.
 */
export const markWardDone = functions.https.onCall((data, context) =>
  withInternalGuard(async () => {
    const body = asRecord(data);
    const tripId = requiredString(body, 'tripId');
    const wardId = requiredString(body, 'wardId');
    const flagged = optionalBoolean(body, 'flagged') === true;

    const driverId = requireClaim(context, CLAIM_DRIVER_ID);

    const tripRef: DocumentReference = db.collection('trips').doc(tripId);

    const wardsDone: WardDoneEntry[] = await db.runTransaction(async (tx: Transaction) => {
      const tripSnap = await tx.get(tripRef);
      if (!tripSnap.exists) fail('notFound');

      const trip: Record<string, unknown> = tripSnap.data() ?? {};
      if (trip.driverId !== driverId) fail('notAuthorised');
      if (trip.status !== TRIP_STATUS_ON_SHIFT) fail('invalidState');

      // The shift-start snapshot is the scope. A ward the driver was allotted
      // after the shift began is not part of today's record.
      const tripWardIds = stringArray(trip.wardIds);
      if (!tripWardIds.includes(wardId)) fail('invalidState');

      const entries = readWardsDone(trip.wardsDone);
      const previous = entries.find((entry) => entry.wardId === wardId);

      // A server timestamp cannot live inside an array element, so the entry
      // carries the server's clock as a resolved Timestamp. Every other
      // timestamp in this file is FieldValue.serverTimestamp().
      const entry: WardDoneEntry = {
        wardId,
        doneAt: Timestamp.fromDate(new Date()),
      };
      if (flagged || previous?.flagged === true) entry.flagged = true;

      const index = entries.findIndex((existing) => existing.wardId === wardId);
      if (index === -1) {
        entries.push(entry);
      } else {
        entries[index] = entry;
      }

      tx.update(tripRef, { wardsDone: entries });

      // The citizen's daily tick. The doc may not exist yet (the shift may
      // have started before the route's wards were seeded), so this creates it
      // as well as updating it.
      const dayKey = tripDayKey(trip.date);
      const duty: Record<string, unknown> = {
        wardId,
        date: dayKey,
        status: WARD_DUTY_STATUS_COMPLETED,
        isDutyOver: true,
        tripId,
        updatedAt: serverNow(),
      };
      if (typeof trip.vanId === 'string' && trip.vanId.length > 0) {
        duty.vanId = trip.vanId;
      }
      const dutyRef: DocumentReference = db
        .collection('wardDuty')
        .doc(wardDutyId(dayKey, wardId));
      tx.set(dutyRef, duty, { merge: true });

      return entries;
    });

    return {
      wardsDone: wardsDone.map((entry) => {
        const shape: Record<string, unknown> = {
          wardId: entry.wardId,
          doneAt: doneAtIso(entry.doneAt),
        };
        if (entry.flagged === true) shape.flagged = true;
        return shape;
      }),
    };
  }, 'markWardDone')
);
