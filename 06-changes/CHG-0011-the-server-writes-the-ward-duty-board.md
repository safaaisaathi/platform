# CHG-0011: The server writes the ward duty board, not the citizen

**Severity**: S0 (Emergency) | **Priority**: **P0** | **Version**: 1.0.0 → 2.0.0
**Date**: 2026-11-02 | **Author**: platform-owner | **Decides**: none

## What changed

`wardDuty` did not exist in the contract. The user app created it and also WROTE it, in the method `syncWardDutyToCloud` in `apps/citizen_app/src/services/firebaseService.ts`. A citizen could mark any ward's duty as over, for any date, and the citizen's own `checkWardDutyOver` then read that write back. The document id is `{date}_{wardId}`, where the date is YYYY-MM-DD in IST. The contract now says `wardDuty` is a core collection that the server writes. `startShift` creates one row per ward in the route with status `in_progress`. `markWardDone` flips it to `completed`. The admin panel's `markWardDutyCompleted` closes a ward the van could not serve. The citizen reads it through the `getWardDutyStatus` callable, not by computing the document id, because the id carries the IST day and a client must not compute the business day boundary.

## Why

**A citizen could decide a ward's collection was done.** The write was a direct client write, so any phone could set `isDutyOver` for any ward on any date. The same phone then read its own write back as truth. That is not a data-quality bug, it is a trust hole in the one tick the whole product is built on. The doc id also made the client compute the IST day boundary, so a phone in the wrong timezone read yesterday's duty.

## What breaks

| App | What breaks |
|---|---|
| userapp | The `syncWardDutyToCloud` write is denied the moment the rule deploys. `checkWardDutyOver` then reports nothing, because it read the document it used to write. The "Collection done today" tick goes back to off |
| driverapp | Nothing today, but it must call `markWardDone` so the server writes the row. Until it does, the row for a ward it served stays `in_progress` |
| adminpanel | Nothing today. It must call `markWardDutyCompleted` to close a ward the van could not serve |

**The visible symptom after the rule deploys.** The citizen's "Collection done today" tick never turns on, even after the van served the ward, because the row it reads is server-written and the client write that used to set it is gone.

## Who is affected

| App | Affected? | What they must do | Blocked release? |
|---|---|---|---|
| driverapp | YES | Call `markWardDone`. The server writes `wardDuty` | Yes, by 2026-11-09 |
| userapp | YES | Delete the `wardDuty` write in `apps/citizen_app/src/services/firebaseService.ts`. Call `getWardDutyStatus` instead of reading the document directly | Yes, by 2026-11-09 |
| adminpanel | YES | Call `markWardDutyCompleted` | Yes, by 2026-11-09 |

## Migration steps

1. wardDuty is a new core collection. The document id is {IST date}_{wardId}
2. userapp: DELETE the wardDuty write in apps/citizen_app/src/services/firebaseService.ts. A citizen may not decide that a ward's duty is over
3. userapp: call getWardDutyStatus instead of reading the document directly
4. driverapp: call markWardDone. The server writes wardDuty
5. adminpanel: call markWardDutyCompleted
6. Deploy the wardDuty rule. It denies every client write

**The order that works**: server first. Deploy `startShift` and `markWardDone`, then move the clients onto the callables, then deploy the `wardDuty` rule that denies every client write.

**The order that breaks**: deploy the `wardDuty` rule first. The citizen's write is denied, no server write has happened yet, and every ward reads as "collection not done today" even after the van served it.

## The deprecation window

| Field | Meaning | Value |
|---|---|---|
| `oldFieldReadableUntil` | The last date the old field can be read | null |
| `oldFieldWritableUntil` | The last date the old field can be written. `null` means read-only | 2026-11-09 |

**`oldFieldReadableUntil` is null because there is no old field to read out.** The collection is new. **`oldFieldWritableUntil` is 2026-11-09**: that is the last day the citizen's direct write may land, and it is the day the rule denies it.

## Rollback

**Redeploy the rules that allow the citizen write.** The tick works again immediately, because the client-side write path is still in the shipped app.

**What breaks if you do**: the trust hole reopens. Any phone can mark any ward's duty as over, for any date, and the client reads it back as truth. **A rollback here restores the S0.**

**The data rollback is nothing.** `wardDuty` rows are server-written; delete them and let the next shift recreate them.

## The failure modes

| What you see | Why |
|---|---|
| The "Collection done today" tick stays off all day | The row was never created, because the client write is denied and `startShift` did not create it |
| A citizen can mark any ward's duty as over | The old `syncWardDutyToCloud` write is still allowed. This is the S0 |
| The tick is true on the phone that wrote it and false on every other phone | `checkWardDutyOver` read a client-written document no other phone can see |
| A ward the van skipped never closes | Nobody called `markWardDutyCompleted` |

## Files changed

| File | What changed in it |
|---|---|
| `02-contracts/collections/wardDuty.schema.json` | The new core collection, doc id `{date}_{wardId}` |
| `02-contracts/enums.json` | `wardDuty.status`, `in_progress` and `completed` |
| `02-contracts/callables.json` | `startShift`, `markWardDone`, `getWardDutyStatus`, `markWardDutyCompleted` |
| `03-rules/firestore.rules` | The `wardDuty` rule denies every client write |
| `VERSION` | 1.0.0 → 2.0.0 |
| `06-changes/manifest.json` | The `CHG-0011` entry |

## See also

- [The ward duty schema](../02-contracts/collections/wardDuty.schema.json)
- [The callables](../02-contracts/callables.json)
- [The emergency change guide](../07-guides/emergency-changes.md)
- [The impact matrix](impact-matrix.md)
