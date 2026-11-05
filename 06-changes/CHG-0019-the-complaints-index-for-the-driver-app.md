# CHG-0019: The complaints index for the driver app's bounded fetch

**Severity**: S3 (Additive) | **Priority**: P3 | **Version**: 2.1.0 → 2.2.0
**Date**: 2026-11-05 | **Author**: platform-owner | **Decides**: none

## What changed

| Item | Before | After |
|---|---|---|
| `03-rules/firestore.indexes.json` | `complaints` had one composite index: `category` ASC, `wardId` ASC, `createdAt` ASC | A second index: `category` ASC, `wardId` ASC, `createdAt` DESC |
| A descending query on that path | Firestore rejected it with `FAILED_PRECONDITION`, or the app downloaded the window and sorted in Dart | The query is served by the index |

**No schema change. No field change. No enum change.** The index is additive.

## Why

**B-05: the driver app over-fetched complaints.** Pending Reports fetched every `missed_collection` complaint in the day window for the route's wards, then filtered and sorted in Dart. On a busy day the app downloaded more documents than the screen could show.

**The bounded query needs a descending index.** The fix is a `limit(200)` with `orderBy('createdAt', descending: true)`. Firestore documents that a descending sort on a field served by an ascending index needs a separate descending index. The existing `(category ASC, wardId ASC, createdAt ASC)` index serves today's ascending range query and does not serve the descending order.

**The driver app harness filed this as issue #5.** The query is unchanged in shape; only the direction of the last field is new.

## What breaks

| App | What breaks |
|---|---|
| driverapp | Nothing until it switches the query. The current ascending query keeps working |
| userapp | Nothing. It does not run this query |
| adminpanel | Nothing. It does not run this query |

## Who is affected

| App | Affected? | What they must do | Blocked release? |
|---|---|---|---|
| driverapp | YES | Switch to the bounded descending query after the index is live | No, but the switch must wait for the index |
| userapp | NO | Nothing | No |
| adminpanel | NO | Nothing | No |

## Migration steps

| # | Step | Why here |
|---|---|---|
| 1 | The platform runs `firebase deploy --only firestore:indexes` | The index must exist before a query that needs it |
| 2 | Wait for the index to finish building in the console | A building index can still reject the query |
| 3 | driverapp switches `Pending Reports` to `.orderBy('createdAt', descending: true).limit(200)` | The bounded query is what the index exists for |
| 4 | Keep the ascending query until step 2 is done | A missing index fails the query with `FAILED_PRECONDITION`, which is a blank screen |

**Why this is S3 and not S2.** Nobody's correct code becomes wrong. The app can ship today's query and switch when the index is live.

## The deprecation window

Not applicable. This is an addition, not a removal. The ascending index is kept because the current query still uses it.

## Rollback

**Drop the new index entry and redeploy.** The current ascending query is unaffected, because its index stays in place.

## The failure modes

| Failure | What the user sees | What the log says |
|---|---|---|
| The app switches before the index is live | A blank Pending Reports list | `FAILED_PRECONDITION: The query requires an index` |
| The index is deployed but not yet built | The same blank list | The same `FAILED_PRECONDITION` until the build finishes |
| The index is deployed and the app keeps the old query | Nothing. It still works | Nothing |

**The emulator does not prove this.** The Firestore emulator does not enforce composite indexes. Index coverage is proven only against the real project, after the deploy.

## Files changed

| File | What changed in it |
|---|---|
| `03-rules/firestore.indexes.json` | The `(category ASC, wardId ASC, createdAt DESC)` index |
| `06-changes/manifest.json` | The `CHG-0019` entry |
| `06-changes/adoption.json` | The driver app's `not_started` row, and `not_applicable` for the other two |
| `03-rules/README.md` | The index count |
| `VERSION` | 2.1.0 → 2.2.0 |

## See also

- [The indexes](../03-rules/firestore.indexes.json)
- [The complaints schema](../02-contracts/collections/complaint.schema.json)
- [The rules README, section 7](../03-rules/README.md), the emulator caveat
