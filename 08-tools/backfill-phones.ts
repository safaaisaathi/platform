// backfill-phones.ts
//
// PHASE 2 preconditions 5 and 6 (CHG-0012). Moves the raw phone values into
// complaintPhones/{complaintId} and staffPhones/{personId}, then removes them
// from the readable documents. It never deletes a document, it never prints a
// phone number, and without --apply it writes nothing.
//
// The order is the safety. Copy first, strip second. If the strip ran first and
// the copy failed, the raw number would be gone.
//
// Usage:
//   node --experimental-strip-types backfill-phones.ts --project <id>
//   node --experimental-strip-types backfill-phones.ts --project <id> --apply --phase=copy --updated-by=<staffId>
//   node --experimental-strip-types backfill-phones.ts --project <id> --apply --phase=strip --backup=<export-ref>
//   node --experimental-strip-types backfill-phones.ts --project <id> --verify
//
// The emulator needs no credential. Point the Admin SDK at it and use any
// project id:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node --experimental-strip-types backfill-phones.ts --project demo-safaai

import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type Firestore, type WriteBatch } from 'firebase-admin/firestore';

import { ok, printErrors } from './lib.ts';

const HEADER = 'backfill-phones failed';
const USAGE = 'usage: node backfill-phones.ts --project=<id> [--apply] [--phase=copy|strip] [--backup=<ref>] [--updated-by=<staffId>] [--verify]';

// Firestore caps a batch at 500 writes. 450 leaves room and keeps failures small.
const BATCH_LIMIT = 450;

// The fields CHG-0012 removes from the readable documents.
const COMPLAINT_STRIP_FIELDS = ['phone', 'assignedPhone', 'escalatedToPhone'] as const;
const STAFF_STRIP_FIELDS = ['phone'] as const;

// Every phone-shaped field a document may keep. Anything else that looks like a
// phone field is reported and blocks the run, because the contract does not
// name it and guessing is how a raw number survives a migration.
const ALLOWED_PHONE_FIELDS = new Set<string>([
  ...COMPLAINT_STRIP_FIELDS,
  ...STAFF_STRIP_FIELDS,
  'phoneMasked',
]);

const PHONE_LIKE = /phone/i;

type Options = {
  project: string;
  apply: boolean;
  phase: 'copy' | 'strip';
  verify: boolean;
  backup?: string;
  updatedBy?: string;
};

type Row = {
  id: string;
  data: Record<string, unknown>;
};

type DuplicatePhone = {
  field: string;
  phone: string;
};

type ComplaintRow = {
  id: string;
  rawPhone?: string;
  mask?: string;
  strip: string[];
  duplicates: DuplicatePhone[];
  unknown: string[];
};

type StaffRow = {
  id: string;
  rawPhone?: string;
  mask?: string;
  strip: string[];
  unknown: string[];
};

type CopyAction = {
  collection: 'complaintPhones' | 'staffPhones';
  id: string;
  phone: string;
};

type StripAction = {
  collection: 'complaints' | 'staff';
  id: string;
  fields: string[];
};

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function parseArgs(): Options {
  let project: string | undefined;
  let apply = false;
  let phase: 'copy' | 'strip' = 'copy';
  let verify = false;
  let backup: string | undefined;
  let updatedBy: string | undefined;

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--project=')) project = arg.slice('--project='.length);
    else if (arg === '--apply') apply = true;
    else if (arg.startsWith('--phase=')) {
      const value = arg.slice('--phase='.length);
      if (value !== 'copy' && value !== 'strip') throw new Error(`unknown phase "${value}". ${USAGE}`);
      phase = value;
    } else if (arg === '--verify') verify = true;
    else if (arg.startsWith('--backup=')) backup = arg.slice('--backup='.length);
    else if (arg.startsWith('--updated-by=')) updatedBy = arg.slice('--updated-by='.length);
    else throw new Error(`unknown argument "${arg}". ${USAGE}`);
  }

  if (project === undefined) throw new Error(`--project is required on purpose, so a stray run cannot hit the wrong project. ${USAGE}`);
  if (verify && apply) throw new Error('--verify is read-only, it cannot be combined with --apply');
  if (apply && phase === 'strip' && backup === undefined) throw new Error('--phase=strip requires --backup, the Firestore export you can restore from');

  return { project, apply, phase, verify, backup, updatedBy };
}

async function readAll(db: Firestore, collection: string): Promise<Row[]> {
  const snapshot = await db.collection(collection).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as Record<string, unknown> }));
}

function unknownPhoneFields(data: Record<string, unknown>): string[] {
  return Object.keys(data).filter((key) => PHONE_LIKE.test(key) && !ALLOWED_PHONE_FIELDS.has(key));
}

function complaintRow(row: Row): ComplaintRow {
  return {
    id: row.id,
    rawPhone: text(row.data['phone']),
    mask: text(row.data['phoneMasked']),
    strip: COMPLAINT_STRIP_FIELDS.filter((field) => text(row.data[field]) !== undefined),
    duplicates: ['assignedPhone', 'escalatedToPhone']
      .map((field) => ({ field, phone: text(row.data[field]) }))
      .filter((entry): entry is DuplicatePhone => entry.phone !== undefined),
    unknown: unknownPhoneFields(row.data),
  };
}

function staffRow(row: Row): StaffRow {
  return {
    id: row.id,
    rawPhone: text(row.data['phone']),
    mask: text(row.data['phoneMasked']),
    strip: STAFF_STRIP_FIELDS.filter((field) => text(row.data[field]) !== undefined),
    unknown: unknownPhoneFields(row.data),
  };
}

function blockersFor(complaints: ComplaintRow[], staff: StaffRow[]): string[] {
  const blockers: string[] = [];
  for (const row of complaints) {
    if (row.unknown.length > 0) {
      blockers.push(`complaints/${row.id} carries ${row.unknown.join(', ')}, which the contract does not name. Report it before stripping anything`);
    }
  }
  for (const row of staff) {
    if (row.unknown.length > 0) {
      blockers.push(`staff/${row.id} carries ${row.unknown.join(', ')}, which the contract does not name. Report it before stripping anything`);
    }
  }
  return blockers;
}

// The copy plan. A document that already has an identical PII doc is a no-op, so
// a second run writes nothing. A different value is a conflict, never an overwrite.
function copyPlan(
  complaints: ComplaintRow[],
  staff: StaffRow[],
  complaintPhones: Map<string, string>,
  staffPhones: Map<string, string>,
  updatedBy: string | undefined
): { actions: CopyAction[]; skipped: number; conflicts: string[]; blockers: string[] } {
  const actions: CopyAction[] = [];
  const conflicts: string[] = [];
  const blockers: string[] = [];
  let skipped = 0;

  for (const row of complaints) {
    if (row.rawPhone === undefined) continue;
    const existing = complaintPhones.get(row.id);
    if (existing === row.rawPhone) skipped += 1;
    else if (existing !== undefined) conflicts.push(`complaintPhones/${row.id} already holds a different number`);
    else actions.push({ collection: 'complaintPhones', id: row.id, phone: row.rawPhone });
  }

  for (const row of staff) {
    if (row.rawPhone === undefined) continue;
    const existing = staffPhones.get(row.id);
    if (existing === row.rawPhone) skipped += 1;
    else if (existing !== undefined) conflicts.push(`staffPhones/${row.id} already holds a different number`);
    else if (updatedBy === undefined) blockers.push('staffPhones requires updatedBy. Pass --updated-by=<staffId>');
    else actions.push({ collection: 'staffPhones', id: row.id, phone: row.rawPhone });
  }

  return { actions, skipped, conflicts, blockers };
}

// The strip plan runs only after the copy. Every value it removes must already
// have a home in a PII collection.
function stripPlan(
  complaints: ComplaintRow[],
  staff: StaffRow[],
  complaintPhones: Map<string, string>,
  staffPhones: Map<string, string>
): { ready: StripAction[]; blocked: string[] } {
  const ready: StripAction[] = [];
  const blocked: string[] = [];
  const coveredPhones = new Set<string>(staffPhones.values());

  for (const row of complaints) {
    if (row.strip.length === 0) continue;
    const missingRaw = row.rawPhone !== undefined && complaintPhones.get(row.id) !== row.rawPhone;
    const uncovered = row.duplicates.filter((entry) => !coveredPhones.has(entry.phone));
    if (row.mask === undefined) blocked.push(`complaints/${row.id}: phoneMasked is missing, so stripping ${row.strip.join(', ')} would lose the only number`);
    else if (missingRaw) blocked.push(`complaints/${row.id}: the raw phone has no complaintPhones copy yet`);
    else if (uncovered.length > 0) blocked.push(`complaints/${row.id}: ${uncovered.map((entry) => entry.field).join(', ')} is not in staffPhones`);
    else ready.push({ collection: 'complaints', id: row.id, fields: row.strip });
  }

  for (const row of staff) {
    if (row.strip.length === 0) continue;
    if (row.mask === undefined) blocked.push(`staff/${row.id}: phoneMasked is missing, so stripping phone would lose the only number`);
    else if (row.rawPhone !== undefined && staffPhones.get(row.id) !== row.rawPhone) {
      blocked.push(`staff/${row.id}: the raw phone has no staffPhones copy yet`);
    } else ready.push({ collection: 'staff', id: row.id, fields: row.strip });
  }

  return { ready, blocked };
}

function phoneMap(rows: Row[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const value = text(row.data['phone']);
    if (value !== undefined) map.set(row.id, value);
  }
  return map;
}

// Firestore caps a batch at 500 writes, so the work is split into chunks. Each
// chunk is all-or-nothing, which keeps a failed run small and re-runnable.
async function writeAll(db: Firestore, operations: Array<(batch: WriteBatch) => void>): Promise<void> {
  for (let start = 0; start < operations.length; start += BATCH_LIMIT) {
    const batch = db.batch();
    for (const operation of operations.slice(start, start + BATCH_LIMIT)) operation(batch);
    await batch.commit();
  }
}

async function main(): Promise<void> {
  const options = parseArgs();
  const db = getFirestore(initializeApp({ projectId: options.project }, 'backfill-phones'));

  const complaintRows = (await readAll(db, 'complaints')).map(complaintRow);
  const staffRows = (await readAll(db, 'staff')).map(staffRow);
  const complaintPhones = phoneMap(await readAll(db, 'complaintPhones'));
  const staffPhones = phoneMap(await readAll(db, 'staffPhones'));

  const blockers = blockersFor(complaintRows, staffRows);
  const copy = copyPlan(complaintRows, staffRows, complaintPhones, staffPhones, options.updatedBy);
  const strip = stripPlan(complaintRows, staffRows, complaintPhones, staffPhones);

  console.log(`backfill-phones: project ${options.project}${options.apply ? '' : ' (dry run)'}`);
  console.log(`complaints: ${complaintRows.length} docs, ${complaintRows.filter((row) => row.rawPhone !== undefined).length} with a raw phone`);
  console.log(`staff: ${staffRows.length} docs, ${staffRows.filter((row) => row.rawPhone !== undefined).length} with a raw phone`);
  console.log(`complaintPhones: ${complaintPhones.size} docs, staffPhones: ${staffPhones.size} docs`);
  console.log(`copy plan: ${copy.actions.length} write(s), ${copy.skipped} already correct`);
  console.log(`strip plan: ${strip.ready.length} ready, ${strip.blocked.length} blocked`);

  const fatal = [...blockers, ...copy.conflicts];
  for (const problem of strip.blocked) console.log(`  - ${problem}`);

  if (fatal.length > 0) {
    printErrors(HEADER, fatal);
  }

  if (options.verify) {
    const remaining = [
      ...complaintRows.filter((row) => row.strip.length > 0).map((row) => `complaints/${row.id}`),
      ...staffRows.filter((row) => row.strip.length > 0).map((row) => `staff/${row.id}`),
    ];
    if (remaining.length > 0) printErrors(HEADER, remaining.map((id) => `${id} still carries a raw phone field`));
    ok(`verify: 0 readable documents carry a raw phone field, ${complaintPhones.size} complaintPhones and ${staffPhones.size} staffPhones docs are present`);
    return;
  }

  if (!options.apply) {
    ok('dry run: nothing written');
    return;
  }

  if (options.phase === 'copy') {
    if (copy.blockers.length > 0) printErrors(HEADER, copy.blockers);
    if (copy.actions.length === 0) {
      ok('copy: nothing to do');
      return;
    }
    const operations = copy.actions.map((action) => (batch: WriteBatch) => {
      if (action.collection === 'complaintPhones') {
        batch.create(db.collection('complaintPhones').doc(action.id), {
          complaintId: action.id,
          phone: action.phone,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        batch.create(db.collection('staffPhones').doc(action.id), {
          phone: action.phone,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: options.updatedBy,
        });
      }
    });
    await writeAll(db, operations);
    ok(`copy: wrote ${copy.actions.length} document(s), ${copy.skipped} already correct`);
    return;
  }

  if (strip.blocked.length > 0) {
    printErrors(HEADER, strip.blocked);
  }
  if (strip.ready.length === 0) {
    ok('strip: nothing to do');
    return;
  }
  console.log(`strip: backup ref ${options.backup}`);
  const operations = strip.ready.map((action) => (batch: WriteBatch) => {
    const update: Record<string, unknown> = {};
    for (const field of action.fields) update[field] = FieldValue.delete();
    batch.update(db.collection(action.collection).doc(action.id), update);
  });
  await writeAll(db, operations);
  ok(`strip: removed raw phone fields from ${strip.ready.length} document(s)`);
}

try {
  await main();
} catch (cause) {
  printErrors(HEADER, [errorText(cause)]);
}
