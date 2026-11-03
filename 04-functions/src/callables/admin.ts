// admin.ts
//
// The five admin writes. They are callables and not rules because the authority
// is a LIVE document, not a claim: the admin panel's token can be up to an hour
// old, so a revoked staff member would keep writing for an hour. Every handler
// re-reads the live staff doc through requireStaff, which is the
// instant-revocation check. See ADR-0003.
//
// The staff member comes from the token, never from an input field. The old
// adminResolveComplaint took workerId and workerName from the client, and both
// were forgeable. setComplaintStatus replaces it. CHG-0013.
//
// Field shapes defer to 02-contracts/collections/*.schema.json. The composed
// strict schemas set additionalProperties: false, so a handler writes the
// fields the schema lists and nothing else.

import * as functions from 'firebase-functions/v1';
import {
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type Transaction,
  type UpdateData,
} from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

import { db, serverNow } from '../lib/firebase';
import { fail, withInternalGuard } from '../lib/reasonCodes';
import { requireStaff, assertWardInScope, assertVanInScope } from '../lib/auth';
import { maskPhone, isValidIndianPhone } from '../lib/phone';
import { DRIVER_CODE_PATTERN } from '../generated/constants';

// --- the frozen enums -------------------------------------------------------
//
// 02-contracts/enums.json is the authority. There is no generated TypeScript
// copy of it, so the list is repeated here and the guards reject anything the
// contract does not name.

/** 02-contracts/enums.json#/$defs/complaint.status */
const COMPLAINT_STATUSES = [
  'received',
  'assigned',
  'resolved',
  'escalated',
  'pending_verification',
  'auto_resolved',
  'reopened',
] as const;

type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

function isComplaintStatus(value: string): value is ComplaintStatus {
  return (COMPLAINT_STATUSES as readonly string[]).includes(value);
}

/** 02-contracts/enums.json#/$defs/staff.role */
const STAFF_ROLES = ['inspector', 'chief_officer', 'tdo', 'ddo'] as const;

type StaffRole = (typeof STAFF_ROLES)[number];

function isStaffRole(value: string): value is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(value);
}

/** 02-contracts/enums.json#/$defs/notice.targetType */
const NOTICE_TARGET_TYPES = ['van', 'ward', 'all'] as const;

type NoticeTargetType = (typeof NOTICE_TARGET_TYPES)[number];

function isNoticeTargetType(value: string): value is NoticeTargetType {
  return (NOTICE_TARGET_TYPES as readonly string[]).includes(value);
}

/** DRIVER_CODE_PATTERN, compiled once. The panel normalises; the server checks. */
const DRIVER_CODE = new RegExp(DRIVER_CODE_PATTERN);

/**
 * How long a resolved-but-unverified complaint waits before the server closes
 * it. 02-contracts/constants.json has no AUTO_RESOLVE_HOURS yet, so it lives
 * here for now. It MUST move into the contract in a follow-up so this callable
 * and the autoResolvePendingComplaints schedule cannot drift apart.
 */
const AUTO_RESOLVE_HOURS = 72;

const HOUR_MS = 60 * 60 * 1000;

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

/** An optional string. Null and empty both read as "not supplied". */
function optionalString(data: Record<string, unknown>, name: string): string | undefined {
  const value = data[name];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') fail('invalidInput');
  return value.length === 0 ? undefined : value;
}

function requiredBoolean(data: Record<string, unknown>, name: string): boolean {
  const value = data[name];
  if (typeof value !== 'boolean') fail('invalidInput');
  return value;
}

function optionalBoolean(data: Record<string, unknown>, name: string): boolean | undefined {
  const value = data[name];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') fail('invalidInput');
  return value;
}

function requiredNumber(data: Record<string, unknown>, name: string): number {
  const value = data[name];
  if (typeof value !== 'number' || Number.isNaN(value)) fail('invalidInput');
  return value;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

// --- setComplaintStatus -----------------------------------------------------

/**
 * The office's one complaint write. It replaces adminResolveComplaint, which
 * took the worker's id and name from the client. Here the staff member is the
 * caller, read from the token and confirmed against the live staff doc.
 *
 * The whole read-decide-write is one transaction on the complaint, so two
 * panel tabs cannot settle on different next states.
 */
export const setComplaintStatus = functions.https.onCall((data, context) =>
  withInternalGuard(async () => {
    const body = asRecord(data);
    const complaintId = requiredString(body, 'complaintId');
    const status = requiredString(body, 'status');
    const note = optionalString(body, 'note');
    const resolvedPhotoUrl = optionalString(body, 'resolvedPhotoUrl');
    // The assign target is optional. When it is absent the staff member
    // assigns the complaint to themselves, which is the common case. When it
    // is present it is NOT trusted: it must name a live staff doc that covers
    // the complaint's ward.
    const assignedToInput = optionalString(body, 'assignedTo');

    if (!isComplaintStatus(status)) fail('invalidInput');
    // auto_resolved is the scheduler's transition, never a staff action.
    if (status === 'auto_resolved') fail('invalidState');

    const staffScope = await requireStaff(context);

    const complaintRef: DocumentReference = db.collection('complaints').doc(complaintId);
    const nowMs = Timestamp.now().toMillis();
    let deadlineIso: string | undefined;

    await db.runTransaction(async (tx: Transaction) => {
      const snap = await tx.get(complaintRef);
      if (!snap.exists) fail('notFound');

      const complaint: Record<string, unknown> = snap.data() ?? {};

      // A complaint outside the live staff ward scope is not this member's.
      const wardId = typeof complaint.wardId === 'string' ? complaint.wardId : '';
      assertWardInScope(staffScope, wardId);

      const update: UpdateData<DocumentData> = { status };
      if (note !== undefined) update.note = note;
      if (resolvedPhotoUrl !== undefined) update.resolvedPhotoUrl = resolvedPhotoUrl;

      if (status === 'assigned') {
        const assignedTo = assignedToInput ?? staffScope.staffId;
        if (assignedTo !== staffScope.staffId) {
          const targetRef: DocumentReference = db.collection('staff').doc(assignedTo);
          const targetSnap = await tx.get(targetRef);
          if (!targetSnap.exists) fail('invalidInput');
          const target: Record<string, unknown> = targetSnap.data() ?? {};
          if (target.active === false) fail('invalidInput');
          if (!stringArray(target.wardIds).includes(wardId)) fail('invalidInput');
        }
        update.assignedTo = assignedTo;
        update.assignedAt = serverNow();
      }

      if (status === 'escalated') {
        const currentLevel =
          typeof complaint.escalationLevel === 'number' ? complaint.escalationLevel : 0;
        // At least level 1, and never lower than it already is.
        update.escalationLevel = Math.max(currentLevel, 1);
        update.escalatedAt = serverNow();
      }

      if (status === 'resolved') {
        const current = complaint.status;
        // A resolved or auto-resolved complaint is final from the office's
        // side. Reopening is the citizen's call, through reopenComplaint.
        if (current === 'resolved' || current === 'auto_resolved') fail('invalidState');
        update.resolvedAt = serverNow();
        update.autoResolveDeadline = null;
      }

      if (status === 'pending_verification') {
        // The deadline is a server instant. A Firestore serverTimestamp cannot
        // take an offset, so it is built from the server clock here.
        const deadlineMs = nowMs + AUTO_RESOLVE_HOURS * HOUR_MS;
        update.autoResolveDeadline = Timestamp.fromMillis(deadlineMs);
        deadlineIso = new Date(deadlineMs).toISOString();
      }

      tx.update(complaintRef, update);
    });

    const result: Record<string, unknown> = {
      updatedAt: new Date(nowMs).toISOString(),
    };
    // The deadline is present only when the new status is pending_verification.
    if (deadlineIso !== undefined) result.autoResolveDeadline = deadlineIso;
    return result;
  }, 'setComplaintStatus')
);

// --- publishNotice ----------------------------------------------------------

/**
 * The FCM topic for a notice, from 02-contracts/topics.json.
 *
 * x-patterns names the three: van -> van_{vanId}, ward -> ward_{wardId},
 * broadcast -> "all". The file has no mapping for any other targetType, so this
 * returns undefined and publishNotice skips the push rather than inventing a
 * topic name.
 */
function noticeTopic(
  targetType: NoticeTargetType,
  targetId: string | undefined
): string | undefined {
  if (targetType === 'all') return 'all';
  if (targetId === undefined || targetId.length === 0) return undefined;
  if (targetType === 'van') return `van_${targetId}`;
  if (targetType === 'ward') return `ward_${targetId}`;
  return undefined;
}

/**
 * Send a notice to a van, a ward, or everyone.
 *
 * notices/*.schema.json has no title field, so no title is written. The push
 * body is the notice's own message; the server writes no other English.
 */
export const publishNotice = functions.https.onCall((data, context) =>
  withInternalGuard(async () => {
    const body = asRecord(data);
    const targetType = requiredString(body, 'targetType');
    const message = requiredString(body, 'message');
    const targetId = optionalString(body, 'targetId');

    if (!isNoticeTargetType(targetType)) fail('invalidInput');
    // A van or ward notice needs a target. 'all' ignores the target entirely.
    if (targetType !== 'all' && targetId === undefined) fail('invalidInput');

    const staffScope = await requireStaff(context);

    const noticeRef: DocumentReference = db.collection('notices').doc();
    const noticeId = noticeRef.id;

    await noticeRef.set({
      targetType,
      targetId: targetType === 'all' ? null : (targetId ?? null),
      message,
      createdAt: serverNow(),
      createdBy: staffScope.staffId,
    });

    // The push is a side effect of a notice that is already written, so a
    // send failure must not lose the notice or fail the call. The topic comes
    // from 02-contracts/topics.json; an unmapped targetType skips the push.
    const topic = noticeTopic(targetType, targetId);
    if (topic !== undefined) {
      try {
        await getMessaging().send({
          topic,
          notification: { body: message },
          data: {
            type: 'notice',
            noticeId,
            targetType,
            targetId: targetId ?? '',
          },
        });
      } catch (cause: unknown) {
        console.error('publishNotice: FCM send failed', {
          noticeId,
          topic,
          message: cause instanceof Error ? cause.message : String(cause),
        });
      }
    }

    return { noticeId };
  }, 'publishNotice')
);

// --- upsertDriver -----------------------------------------------------------

/**
 * Create or update a driver record. The phone is masked on the way in.
 *
 * The raw phone never lands on drivers/{code}: this doc is field-restricted
 * for the driver's own read, and the raw value lives in staffPhones/{code}.
 * CHG-0012.
 */
export const upsertDriver = functions.https.onCall((data, context) =>
  withInternalGuard(async () => {
    const body = asRecord(data);
    const code = requiredString(body, 'code');
    const name = requiredString(body, 'name');
    const phone = requiredString(body, 'phone');
    const vanId = optionalString(body, 'vanId');
    const routeId = optionalString(body, 'routeId');
    const active = optionalBoolean(body, 'active');

    if (!DRIVER_CODE.test(code)) fail('invalidInput');
    if (!isValidIndianPhone(phone)) fail('invalidInput');
    if (body.wardIds !== undefined && !Array.isArray(body.wardIds)) fail('invalidInput');
    const wardIds = body.wardIds === undefined ? undefined : stringArray(body.wardIds);

    const staffScope = await requireStaff(context);

    const phoneMasked = maskPhone(phone);

    // Only the supplied fields are written, so an update does not blank an
    // allotment the panel did not mean to touch. driver.schema.json has no
    // updatedAt and the composed strict schema sets additionalProperties:
    // false, so none is written.
    const driver: Record<string, unknown> = { name, phoneMasked };
    if (vanId !== undefined) driver.vanId = vanId;
    if (routeId !== undefined) driver.routeId = routeId;
    if (wardIds !== undefined) driver.wardIds = wardIds;
    if (active !== undefined) driver.active = active;

    await db.collection('drivers').doc(code).set(driver, { merge: true });

    // The raw phone's only home. staffPhone.schema.json requires all three.
    await db
      .collection('staffPhones')
      .doc(code)
      .set(
        {
          phone,
          updatedAt: serverNow(),
          updatedBy: staffScope.staffId,
        },
        { merge: true }
      );

    return { code, phoneMasked };
  }, 'upsertDriver')
);

// --- upsertStaff ------------------------------------------------------------

/**
 * Create or update a staff member. Setting active = false revokes them: the
 * next admin action fails at requireStaff's live read, even with a live token.
 *
 * A staff member may set their own active to false. That is the revocation
 * path, not a mistake.
 */
export const upsertStaff = functions.https.onCall((data, context) =>
  withInternalGuard(async () => {
    const body = asRecord(data);
    const staffId = requiredString(body, 'staffId');
    const name = requiredString(body, 'name');
    const role = requiredString(body, 'role');
    const talukaId = optionalString(body, 'talukaId');
    const phone = optionalString(body, 'phone');
    const active = requiredBoolean(body, 'active');

    if (!isStaffRole(role)) fail('invalidInput');
    if (!Array.isArray(body.wardIds)) fail('invalidInput');
    const wardIds = stringArray(body.wardIds);
    if (phone !== undefined && !isValidIndianPhone(phone)) fail('invalidInput');

    const staffScope = await requireStaff(context);

    // staff.schema.json has no updatedAt and the composed strict schema sets
    // additionalProperties: false, so none is written.
    const staffDoc: Record<string, unknown> = { name, role, wardIds, active };
    if (talukaId !== undefined) staffDoc.talukaId = talukaId;
    if (phone !== undefined) staffDoc.phoneMasked = maskPhone(phone);

    await db.collection('staff').doc(staffId).set(staffDoc, { merge: true });

    if (phone !== undefined) {
      await db
        .collection('staffPhones')
        .doc(staffId)
        .set(
          {
            phone,
            updatedAt: serverNow(),
            updatedBy: staffScope.staffId,
          },
          { merge: true }
        );
    }

    return { staffId };
  }, 'upsertStaff')
);

// --- setVanDepot ------------------------------------------------------------

/**
 * Set the van's depot tag. The driver never writes this.
 *
 * The depot belongs to the van's route: a staff member may tag it when they
 * cover a ward on that route, and the district roles cover every ward.
 */
export const setVanDepot = functions.https.onCall((data, context) =>
  withInternalGuard(async () => {
    const body = asRecord(data);
    const vanId = requiredString(body, 'vanId');
    const lat = requiredNumber(body, 'lat');
    const lng = requiredNumber(body, 'lng');

    if (lat < -90 || lat > 90) fail('invalidInput');
    if (lng < -180 || lng > 180) fail('invalidInput');

    const staffScope = await requireStaff(context);

    const vanRef: DocumentReference = db.collection('vans').doc(vanId);

    await db.runTransaction(async (tx: Transaction) => {
      const vanSnap = await tx.get(vanRef);
      if (!vanSnap.exists) fail('notFound');

      const van: Record<string, unknown> = vanSnap.data() ?? {};
      const routeId =
        typeof van.routeId === 'string' && van.routeId.length > 0 ? van.routeId : undefined;
      // A van without a route has no ward to check the depot against.
      if (routeId === undefined) fail('invalidInput');

      const routeRef: DocumentReference = db.collection('routes').doc(routeId);
      const routeSnap = await tx.get(routeRef);
      if (!routeSnap.exists) fail('notFound');

      const route: Record<string, unknown> = routeSnap.data() ?? {};
      const routeWardIds = stringArray(route.wardIds);

      // A route serves several wards in visiting order. assertVanInScope
      // decides one ward, so it is handed a ward the caller covers, or
      // undefined when they cover none, which is the notAuthorised answer.
      assertVanInScope(
        staffScope,
        routeWardIds.find((wardId) => staffScope.wardIds.includes(wardId))
      );

      // van.schema.json's depot is {lat, lng}. The composed strict schema sets
      // additionalProperties: false, so no updatedAt is added.
      tx.update(vanRef, { depot: { lat, lng } });
    });

    return { vanId };
  }, 'setVanDepot')
);
