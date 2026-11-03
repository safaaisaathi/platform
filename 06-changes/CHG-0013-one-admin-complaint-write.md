# CHG-0013: One callable for the admin complaint write, and no client named staff member

**Severity**: S1 (Breaking) | **Priority**: **P1** | **Version**: 1.0.0 → 2.0.0
**Date**: 2026-11-02 | **Author**: platform-owner | **Decides**: ADR-0003

## What changed

The old callable was `adminResolveComplaint`. Its input was `{ complaintId, workerName, workerId, cleanedPhotoUrl, cleaningNote }` and it returned `{ success, status: 'pending_verification', autoResolveDeadline }`. `workerId` and `workerName` are client parameters, which means the client said who did the work, and the client can be edited. The new callable is `setComplaintStatus`, its input is `{ complaintId, status, note?, resolvedPhotoUrl? }`, and the server reads the staff member from the token and from the live staff doc. The citizen side gets two new callables, `citizenVerifyResolution` and `reopenComplaint`. The complaint fields for the cross verification loop are `autoResolveDeadline`, `citizenVerifiedAt`, `citizenVerifiedStatus`, `citizenRejectReason`, `citizenRejectPhotoUrl`, `reopenedAt`, `reopenReason` and `reopenPhotoUrl`.

## Why

**The client named the staff member.** `workerId` and `workerName` came from the panel, so a caller could credit the work to anyone. The server already knows who is calling from the token, and it re-reads the live `staff/{id}` document to check the caller is still active. That is the ADR-0003 rule: the claim gets the caller in the door, the live document decides whether they stay.

The second half is the citizen loop. A resolution is now provisional until the citizen confirms it. `pending_verification` plus `autoResolveDeadline` means the complaint closes on its own if the citizen goes quiet, and the citizen can reject or reopen instead of filing a second complaint.

## What breaks

| App | What breaks |
|---|---|
| adminpanel | A panel that still calls `adminResolveComplaint` gets `notFound`, because the callable is gone. The Resolve button spins and fails, and no status changes |
| userapp | The citizen's direct complaint update is denied once the write rule tightens. The confirm and reject actions must go through `citizenVerifyResolution` and `reopenComplaint` |
| driverapp | Nothing. It writes only `status` and `resolvedAt` inside its trip scope, and it does not resolve complaints |

**A panel that still sends `workerId` and `workerName`** has them silently ignored. The resolution succeeds, but it is credited to whoever the token says, not to the name the panel sent.

## Who is affected

| App | Affected? | What they must do | Blocked release? |
|---|---|---|---|
| driverapp | NO | It reads `complaints.status` in the trip scope and does not resolve | No |
| userapp | YES | Call `citizenVerifyResolution` and `reopenComplaint`. Delete the direct complaint update | Yes, by 2026-11-15 |
| adminpanel | YES | Call `setComplaintStatus` and stop sending `workerId` and `workerName`. Call `citizenVerifyResolution` and `reopenComplaint` from the detail screen | Yes, by 2026-11-15 |

## Migration steps

1. adminResolveComplaint is replaced by setComplaintStatus. The input is { complaintId, status, note?, resolvedPhotoUrl? }
2. adminpanel: stop sending workerId and workerName. The server reads the staff member from the token and the live staff doc
3. adminpanel: call citizenVerifyResolution and reopenComplaint from the complaint detail screen, not from a client write
4. userapp: call citizenVerifyResolution and reopenComplaint. Delete the direct complaint update
5. The status values are the seven from CHG-0010

**The order that works**: deploy `setComplaintStatus` and the two citizen callables first, ship both clients, then deploy the tightened write rules. The old callable can stay deployed until every panel is on the new one.

**The order that breaks**: delete `adminResolveComplaint` before the panel ships. Every resolve fails with `notFound`, and the office cannot close a complaint at all.

## The deprecation window

| Field | Meaning | Value |
|---|---|---|
| `oldFieldReadableUntil` | The last date the old field can be read | null |
| `oldFieldWritableUntil` | The last date the old field can be written. `null` means read-only | 2026-11-15 |

**`oldFieldReadableUntil` is null because this is not a read window; a callable is replaced, not a field.** **`oldFieldWritableUntil` is 2026-11-15**: that is the last day `adminResolveComplaint` may be called, and after it only `setComplaintStatus` writes the complaint status.

## Rollback

**Redeploy `adminResolveComplaint` and keep the old panel.** The old input shape works again.

**What breaks if you do**: the forgeable `workerId` and `workerName` return, and the client says who did the work again. The citizen verification loop is also lost, so a resolution is final the moment the panel sends it.

## The failure modes

| What you see | Why |
|---|---|
| The Resolve button fails with a not-found error | `adminResolveComplaint` was deleted before the panel was updated |
| The resolution is credited to the wrong staff member | The panel still sends `workerId` and `workerName`, which the server now ignores |
| The citizen cannot confirm or reject the resolution | The user app was not moved to `citizenVerifyResolution` and `reopenComplaint` |
| Every complaint write from the panel is denied | The admin write rule was tightened before the panel moved to the callable |

## Files changed

| File | What changed in it |
|---|---|
| `02-contracts/callables.json` | `setComplaintStatus`, `citizenVerifyResolution`, `reopenComplaint` |
| `02-contracts/collections/complaint.schema.json` | The cross-verification fields, `autoResolveDeadline` through `reopenPhotoUrl` |
| `02-contracts/enums.json` | `complaint.status` and `complaint.verificationOutcome` |
| `04-functions/src/index.ts` | The three callables |
| `03-rules/firestore.rules` | The admin write is denied; the citizen writes go through the callables |
| `VERSION` | 1.0.0 → 2.0.0 |
| `06-changes/manifest.json` | The `CHG-0013` entry |

## See also

- [ADR-0003, admin writes go through callables](../05-decisions/0003-admin-writes-go-through-callables.md)
- [The callables](../02-contracts/callables.json)
- [CHG-0010, the seven statuses](CHG-0010-wider-complaint-statuses-and-categories.md)
- [CHG-0004, the five-callable admin write change](CHG-0004-admin-writes-go-through-callables.md)
