# CHG-0004: Route every admin panel write through a callable

**Severity**: S1 (Breaking) | **Priority**: P1 | **Version**: 1.0.0 → 2.0.0
**Date**: 2026-11-01 | **Author**: platform-owner | **Decides**: ADR-0003

## What changed

**Every** write from the admin panel goes through a callable. **Every** admin write rule becomes `if false`.

| Before | After |
|---|---|
| The panel writes to Firestore directly | The panel calls a callable |
| The rules check `request.auth != null` for admin writes | The rules deny admin writes entirely |
| A disabled staff member keeps access until their token expires | A disabled staff member loses access **immediately** |

**The five callables.** `setComplaintStatus`, `publishNotice`, `upsertDriver`, `upsertStaff`, `setVanDepot`.

**Reads stay direct queries.** The panel still reads `complaints`, `vans`, `trips`, `wards`, `notices` and `staff` directly, scoped by the `wardIds` and `role` claims. Only writes move.

## Why

**A Firebase ID token's claims are a snapshot.** They are set at sign-in and they live for up to an hour. The office disables a staff member who transfers or leaves. **With a rules-only admin panel, that person keeps their write access for up to an hour after being disabled.**

**Only a server-side read of the live document can lock them out immediately.** The callable reads `staff/{id}.active` on every privileged action. That is the whole reason.

**And the scope NARROWING can wait.** A slightly-too-wide ward scope for an hour is a UX annoyance. An un-revoked account is a security hole. **The two problems get different solutions because they are different problems.**

**The alternative was rejected.** Making every admin READ check the live staff doc would cost a `get` on every read, and Firestore rules get expensive fast, with a hard limit on how complex a rule can be.

## What breaks

| App | What breaks |
|---|---|
| adminpanel | Every save button stops working. The write is denied by the rules with no explanation in the UI |
| driverapp | Nothing. It never wrote to these collections |
| userapp | Nothing. It never wrote to these collections |

**The visible symptom of a partial migration.** The admin clicks "Resolve", the spinner runs, and nothing happens. **No error dialog, because a denied write in the Firestore web SDK surfaces as a permission error, not as a rejected promise the UI was written to catch.**

## Who is affected

| App | Affected? | What they must do | Blocked release? |
|---|---|---|---|
| driverapp | NO | Never wrote to these collections | No |
| userapp | NO | Never wrote to these collections | No |
| adminpanel | YES | Replace all five direct writes with the callable calls. Handle the callables' reason codes | **Yes, immediately** |

## Migration steps

| # | Step | Why here |
|---|---|---|
| 1 | Deploy the five callables | The panel can now reach them |
| 2 | Update the panel to call them. Each call handles its reason codes | |
| 3 | **Deploy the rules that deny admin writes LAST** | The old rules keep the old panel working until this exact moment |

**The order that works**: the rules last. The panel keeps working throughout steps 1 and 2.

**The order that breaks**: the rules first. Every save button in the panel silently stops working, and the panel's error handling was written for a different failure.

## The deprecation window

Not applicable. No field is removed. What is deprecated is the direct-write path.

**The direct-write path stays open until every panel has migrated.** It is the deploy order that is the window.

## Rollback

**Redeploy the old rules.** The panel works again immediately, because the old rules allowed direct writes and the old panel code still has that path.

**The one thing a rollback does not undo**: anything the callables already wrote. That data is legal under both rule sets, because the callables write the same fields the rules allowed.

## The failure modes

| Failure | What the user sees | What the log says |
|---|---|---|
| The panel was not migrated | The save button does nothing. No error | `PERMISSION_DENIED` on the write |
| The rules deployed before the panel | The same | The same |
| A staff member was disabled but the panel still acts | **Nothing visible. That is the point** | The callable logs `staff inactive` |
| The panel sends a ward outside its scope | The write is refused | The callable returns `notAuthorised` |
| The callable reads `staff.active` from the token instead of the doc | A revoked member still gets through | Nothing. This is the bug the whole change prevents |

**The last row is the one to check.** If any code path reads `active` from a claim or from a cached value, the instant revocation does not work. **The doc is the only valid source.**

## Files changed

| File | What changed in it |
|---|---|
| `03-rules/firestore.rules` | Every admin write becomes `if false` |
| `02-contracts/callables.json` | The five admin callables with their checks |
| `02-contracts/errors.json` | `notAuthorised` for the scope refusal |
| `04-functions/src/index.ts` | The five callables |
| `VERSION` | 1.0.0 → 2.0.0 |
| `06-changes/manifest.json` | The `CHG-0004` entry |

## See also

- [ADR-0003](../05-decisions/0003-admin-writes-go-through-callables.md)
- [The callables](../02-contracts/callables.json)
- [The reason codes](../02-contracts/errors.json)
