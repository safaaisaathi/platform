# CHG-0018: Publish the notice read receipt

**Severity**: S2 (New capability) | **Priority**: P2 | **Version**: 2.1.0 → 2.2.0
**Date**: 2026-11-05 | **Author**: platform-owner | **Decides**: none

## What changed

| Item | Before | After |
|---|---|---|
| `notices/{noticeId}/receipts/{driverCode}` | The schema and the strict rules existed, but no change entry named them, so the manifest, the app checklist and the adoption record could not see the change | Published as a change entry. The schema and the rules are unchanged |
| `noticeReceipt.readAt` | A field with no paper trail | `readAt` is the one field the driver writes |

**No new collection, no new field, no new enum.** This entry publishes a capability that was already in the contract. The shape is unchanged.

## Why

**B-11: the unread dot did not survive a restart.** The driver app tracked which notices were read in memory for the session. A restart or a shift end cleared the set, so every notice looked unread again. For a `targetType: all` notice the read state is per driver, not per device, so a local flag was wrong even before the restart.

**The contract already had the answer.** `02-contracts/collections/noticeReceipt.schema.json` defines one small doc per driver per notice, at `notices/{noticeId}/receipts/{driverCode}`, holding `readAt`. A subcollection is the right shape because a `targetType: all` notice is read by every driver, and an array on the notice document would grow without bound.

**Only the paper trail was missing.** `06-changes/manifest.json` had no entry, the driver app's checklist had no row, and `06-changes/impact-matrix.md` had no line. An app owner reading the change log could not learn that the capability exists, and `check-adoption.ts` could not report whether the app had adopted it. The driver app harness filed this as issue #4.

## What breaks

| App | What breaks |
|---|---|
| driverapp | Nothing. The app keeps the session-local unread set until it adopts this |
| userapp | Nothing. It does not read receipts |
| adminpanel | Nothing. It does not read receipts |

## Who is affected

| App | Affected? | What they must do | Blocked release? |
|---|---|---|---|
| driverapp | YES | Write the receipt when a notice is opened, and read it back to drive the unread dot | No. The current session-local behaviour still works |
| userapp | NO | Nothing | No |
| adminpanel | NO | Nothing | No |

## Migration steps

| # | Step | Why here |
|---|---|---|
| 1 | Write `notices/{noticeId}/receipts/{driverCode}` with `readAt` when the driver opens a notice | The receipt is what makes the dot survive a restart |
| 2 | Take the doc id from the `driverId` claim | The strict rules compare the doc id with the claim, so a client-chosen id is denied |
| 3 | Keep the session-local unread set as the fallback until the write path works | A failed write leaves the dot on. It never loses a notice |
| 4 | Compute the dot from the cached receipts plus the local set | The driver must see a correct state offline |
| 5 | Do not add a receipt array to the notice document | A `targetType: all` notice is read by every driver, so the array would grow without bound |

**The PHASE 1 caveat.** The strict rules (`03-rules/firestore.strict.rules`) already allow the receipt write through `isOwnDriver(driverCode)`, with `readAt` as the only allowed key. The loose PHASE 1 rules (`03-rules/firestore.rules`) do not match `receipts`, so the write is denied until the CHG-0003 rules switch. That is a deployment-order fact, not a contract gap: the capability lands with the rules switch.

## The deprecation window

Not applicable. This is an addition, not a removal.

## Rollback

**Stop writing receipts and compute the dot from the session-local set again.** That is today's behaviour. Nothing else changes.

## The failure modes

| Failure | What the user sees | What the log says |
|---|---|---|
| The app writes a receipt for another driver's code | The write is denied | A permission-denied on the receipt write |
| The app adds a field other than `readAt` | The write is denied | A permission-denied, because the rule allows only `readAt` |
| The receipt write fails offline | The dot stays on | Nothing. The write queues and retries |
| The app reads a receipt it did not write | The read is denied | A permission-denied on the receipt read |

## Files changed

| File | What changed in it |
|---|---|
| `06-changes/manifest.json` | The `CHG-0018` entry |
| `06-changes/adoption.json` | The driver app's `not_started` row, and `not_applicable` for the other two |
| `06-changes/impact-matrix.md` | Regenerated section 1 |
| `09-reference/issue-register.md` | B-11 now points at this entry |
| `VERSION` | 2.1.0 → 2.2.0 |

## See also

- [The receipt schema](../02-contracts/collections/noticeReceipt.schema.json)
- [The strict rules](../03-rules/firestore.strict.rules), `match /notices/{noticeId}/receipts/{driverCode}`
- [CHG-0003: scope the rules by custom claims](./CHG-0003-scope-the-rules-by-custom-claims.md)
