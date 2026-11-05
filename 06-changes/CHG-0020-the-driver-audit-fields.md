# CHG-0020: Audit who created and last changed a driver

**Severity**: S3 (Additive) | **Priority**: P3 | **Version**: 2.2.0 → 2.3.0
**Date**: 2026-11-05 | **Author**: platform-owner | **Decides**: issue #9

## What changed

| Item | Before | After |
|---|---|---|
| `drivers.createdAt` | Did not exist | Optional date-time. Set once, on create |
| `drivers.createdBy` | Did not exist | Optional string. The staff id that created the record |
| `drivers.updatedAt` | Did not exist | Optional date-time. Rewritten on every update |
| `drivers.updatedBy` | Did not exist | Optional string. The staff id that last changed it |

**No field is required and no existing field moves.** A record written before this change keeps working; it simply has no audit trail until its next write.

## Why

**B-13: the office could not answer "who changed this and when".** An admin edits a driver's van allotment. A week later the office asks who moved the driver, and the answer did not exist anywhere.

**The fields are server-set, on purpose.** `upsertDriver` already re-reads the live staff document through `requireStaff`, so it knows the caller's staff id and it has the server clock. Writing the audit fields there means a client cannot forge them, and no new rule is needed.

**They live on `drivers`, not in a separate log.** The question is about the current record, and one small set of fields answers it. An append-only audit collection would be a new collection and a new retention decision, which this request did not need.

## What breaks

| App | What breaks |
|---|---|
| adminpanel | Nothing. It may show the fields, or not |
| driverapp | Nothing. Its own driver read stays field-restricted; it must not start returning these by accident |
| userapp | Nothing. It does not read `drivers` |

## Who is affected

| App | Affected? | What they must do | Blocked release? |
|---|---|---|---|
| adminpanel | YES | Nothing required. Showing the four fields is optional | No |
| driverapp | NO | Nothing | No |
| userapp | NO | Nothing | No |

## Migration steps

| # | Step | Why here |
|---|---|---|
| 1 | `upsertDriver` sets `createdAt` and `createdBy` once, on create | A later update must not rewrite history |
| 2 | `upsertDriver` sets `updatedAt` and `updatedBy` on every update | The last change is the one the office asks about |
| 3 | Take both values from the server: the clock and the `staffId` claim | A client-supplied value would be a forgeable audit trail |
| 4 | Leave old records alone | A backfill would have to invent a staff id, which is worse than an empty field |
| 5 | Do not add the fields to the driver app's read | The driver does not need them, and its read is deliberately narrow |

## The deprecation window

Not applicable. This is an addition.

## Rollback

**Stop writing the four fields.** They are optional, so nothing else changes. Old documents keep whatever they have.

## The failure modes

| Failure | What the user sees | What the log says |
|---|---|---|
| A client sends `createdAt` in the callable input | It is ignored. The handler only reads named inputs | Nothing |
| The transaction loses a race with another admin | The write retries | Nothing |
| A record has no audit fields | The admin panel shows a blank, not an error | Nothing |

## Files changed

| File | What changed in it |
|---|---|
| `02-contracts/collections/driver.schema.json` | The four optional fields |
| `04-functions/src/callables/admin.ts` | `upsertDriver` sets them in a transaction |
| `06-changes/manifest.json` | The `CHG-0020` entry |
| `09-reference/issue-register.md` | B-13 now points at this entry |

## See also

- [The driver schema](../02-contracts/collections/driver.schema.json)
- [upsertDriver](../04-functions/src/callables/admin.ts)
