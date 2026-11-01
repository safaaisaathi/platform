# CHG-0003: Scope the Firestore rules by custom claims

**Severity**: S1 (Breaking) | **Priority**: **P0** | **Version**: 1.0.0 → 2.0.0
**Date**: 2026-11-01 | **Author**: platform-owner | **Decides**: ADR-0002

## What changed

The rules stop asking *"is someone signed in?"* and start asking *"which claim does this session carry, and does it match this document?"*

| Collection | Before | After |
|---|---|---|
| `vans` | `allow read: if request.auth != null` | Read only own van, via the `vanId` claim. List is **denied** |
| `vans` write | Any signed-in caller, any van | Only `request.auth.token.vanId == vanId`, and only the telemetry fields |
| `trips` | Any signed-in caller | Only the trip whose `vanId` matches the `vanId` claim |
| `drivers` | Any signed-in caller, whole doc | Only `request.auth.token.driverId == driverId`, **field-restricted** |
| `complaints` | Any signed-in caller | The citizen's own, via the `deviceId` claim. The driver's, via the trip scope. The admin's, via the live staff scope |
| `ratings` | Any signed-in caller | The citizen's own, via the `deviceId` claim |

**Three new callables** mint the claims: `bindDeviceToVan` (the driver), `bootstrapUserSession` (the user app), `mintStaffToken` (the admin panel).

## Why

**The current rules are authentication-only, and the holes are proven.** A 17-probe emulator test on the actual rules file showed that an anonymous caller could read every driver's phone number, and could rewrite another van's `status` and `currentTripId`. **The writes landed.**

**The badge code cannot be the boundary.** It is printed on the van and read aloud over the phone. PRD section 0.16 says so. A public identifier cannot authenticate anything.

**The PRD contradicts itself, and the contradiction is now resolved.** Line `:68` says the rules must check a `vanId` custom claim. Line `:193` (the newer section 0.16) says *"the rules carry no custom-claim checks"*. Both cannot be true. Section 0.8's model wins, and `:193` gets corrected to:

> *"The badge code is not a secret and is never used as an authorization token. The rules scope writes by the `vanId` custom claim on the session, which the server sets after the device binding. The badge code only attributes the shift."*

**Reading `:193` literally would leave the P0 open.** Under that model the rules can only check `request.auth != null`, which is exactly what the probes exploited. **A document known to be wrong cannot be the specification.**

## What breaks

| App | What breaks |
|---|---|
| driverapp | Every write is denied until the app signs in with a custom token. The `vans` list query now fails, because the list is denied |
| userapp | Every complaint read is denied until the app calls `bootstrapUserSession`. **The failure looks like "the complaints screen is empty"** |
| adminpanel | Every read is denied until the app calls `mintStaffToken` and scopes its queries by the `wardIds` claim |

**The empty-screen failure is the dangerous one.** A denied read is not an error the user sees. It is a screen with nothing on it. **That is why the deploy order matters.**

## Who is affected

| App | Affected? | What they must do | Blocked release? |
|---|---|---|---|
| driverapp | YES | Call `bindDeviceToVan` at sign-in. Sign in with the returned custom token. Stop sending the badge code as a client parameter. Drop the `vans` list query | **Yes, immediately** |
| userapp | YES | Call `bootstrapUserSession` at launch. Sign in with the custom token. Use the `deviceId` and `routeId` claims | **Yes, immediately** |
| adminpanel | YES | Call `mintStaffToken` at sign-in. Scope every query by the `wardIds` claim | **Yes, immediately** |

## Migration steps

**The order is the whole design. The server goes first, the clients go second, the rules tighten last.**

| # | Step | Why here |
|---|---|---|
| 1 | Deploy `bindDeviceToVan`, `bootstrapUserSession`, `mintStaffToken` | The clients can now obtain a claim |
| 2 | Ship the driver app's half. Call the bind callable, sign in with the custom token | |
| 3 | Ship the user app's half. Call the bootstrap callable, sign in with the custom token | |
| 4 | Ship the admin panel's half. Call the mint callable, scope the queries | |
| 5 | **Deploy the new rules LAST** | The old loose rules keep the old clients working until this exact moment |

**The order that works**: the rules last. Between step 1 and step 5, the old rules are permissive and both the old and the new clients work.

**The order that breaks**: the rules first. Between that moment and step 2, every write is denied and every scoped read is empty. The app looks broken with no error message, and the diagnostic is a permission error buried in the console.

## The deprecation window

Not applicable. No field is removed. The **rules** change, and the rules change is instantaneous by design.

**What is deprecated is the loose rule set.** It stays in place until every app has the claim. That is the deprecation window, expressed in deploy order rather than in dates.

## Rollback

**Redeploy the old rules.** The clients are unaffected, because a client that signs in with a custom token is still a signed-in caller, and the old rules accept any signed-in caller.

**The one thing a rollback does not undo**: any data written under the new rules stays written. That is fine, because the new rules only ever wrote legal data.

## The failure modes

| Failure | What the user sees | What the log says |
|---|---|---|
| The rules deployed before the client | The complaints screen is empty. The shift will not start. No error dialog | `PERMISSION_DENIED` in the console, easy to miss |
| The client sends the badge code as a parameter instead of using the claim | The request is rejected. The driver cannot start a shift | `PERMISSION_DENIED` on the write |
| The claim name is misspelled in the Function or the rule | Every write is denied, and nothing says why | `PERMISSION_DENIED`. The mismatch is invisible |
| The `drivers` read is not field-restricted | The raw phone is still returned. The field restriction is collection-scoped, and a `get` returns everything | No error. The leak is silent |
| The app still calls the `vans` list query | The query fails | `PERMISSION_DENIED` on the list |

**The claim-name mismatch is the one to worry about.** If the Function writes `vanId` and the rule reads `van_id`, every write is denied and **nothing says why**. That is why the claim names are in `constants.json` and why the shared constants test covers them.

## Files changed

| File | What changed in it |
|---|---|
| `03-rules/firestore.rules` | The whole file. Claim-scoped. Admin writes denied |
| `02-contracts/claims.json` | The eight claims, who mints them, who reads them |
| `02-contracts/callables.json` | The three session-minting callables |
| `04-functions/src/index.ts` | The three callables |
| `VERSION` | 1.0.0 → 2.0.0 |
| `06-changes/manifest.json` | The `CHG-0003` entry |

## See also

- [ADR-0002](../05-decisions/0002-rules-scope-by-claims-not-by-signed-in.md)
- [The claims](../02-contracts/claims.json)
- [The callables](../02-contracts/callables.json)
- [The backend split](../07-guides/backend-split.md)
