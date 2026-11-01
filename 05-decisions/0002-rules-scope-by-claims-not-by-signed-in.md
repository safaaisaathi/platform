---
id: adr-0002-rules-scope-by-claims
title: Rules scope by claims, not by "is signed in"
status: accepted        # proposed | accepted | rejected | superseded
owner: platform-owner
updated: 2026-11-01
audience: harness
deciders: [platform-owner]
consulted: [driverapp-team, userapp-team, adminpanel-team]
informed: [office]
supersedes: null
supersededBy: null
see_also:
  - ../03-rules/firestore.rules
  - ../02-contracts/claims.json
---

# Rules scope by claims, not by "is signed in"

## Context

The current `firestore.rules` in the driver app is, for every collection except `vanSecrets`:

```
allow read: if request.auth != null;
```

`vanSecrets` is denied by default, which is the only thing the current file gets right.

A 17-probe emulator test ran against exactly these rules. Every probe landed. The suite proved three capabilities:

| # | Capability proven | Detail |
|---|---|---|
| 1 | Read any driver's phone number | A caller with any Firebase account, including anonymous auth, passes `request.auth != null` and gets the whole `drivers/{code}` doc back |
| 2 | Rewrite another van's `status` | The write landed |
| 3 | Rewrite another van's `currentTripId` | The write landed, which means the next shift on that van desyncs |

"Is signed in" is not an identity. It is a pulse.

The PRD contradicts itself:

| Where | What it says |
|---|---|
| PRD line 68 | The rules must check a `vanId` custom claim |
| PRD line 193, section 0.16 (the newer text) | "the rules carry no custom-claim checks" |

Both cannot be true. A rule either reads `request.auth.token.vanId` or it does not.

## Decision

Section 0.8's model wins. Line 193 is corrected to read:

> The badge code is not a secret and is never used as an authorization token. The rules scope writes by the `vanId` custom claim on the session, which the server sets after the device binding. The badge code only attributes the shift.

Concretely, the rules trust only claims the server minted:

| App | Claims in the token | Minted by |
|---|---|---|
| `driverapp` | `vanId`, `driverId`, `currentTripId` | `bindDeviceToVan`, `startShift` |
| `userapp` | `deviceId`, `routeId` | `bootstrapUserSession` |
| `adminpanel` | `role`, `staffId`, `wardIds` | `mintStaffToken` |

The full claim vocabulary is `../02-contracts/claims.json`. A claim that is missing from a token makes every rule that depends on it deny. That is the correct failure mode: deny, never leak.

## Consequences

### Good

| Consequence | Why it matters |
|---|---|
| The authorization boundary is a server-minted claim | A client cannot argue its way into a wider scope. It cannot mint a claim, it can only present one |
| The badge code stops being a pretend password | It is public by design. It attributes the shift, it never authorizes one |
| The probe suite gets a stable target | "Reads are claim-scoped" is testable in the emulator, one probe per collection |
| The PRD contradiction is closed at the source | The corrected sentence is quoted here, so the next reader does not re-litigate line 193 |

### Bad

| Cost | Why it is accepted |
|---|---|
| Rules do not redact | A Firestore `get` returns the WHOLE document. A collection-scoped read still hands over every field on it, so the `drivers` read must ALSO be field-restricted. This is the same class as the `flagged` field leak: a field a reader must not see cannot live on a doc that reader can get |
| Every claim rule must handle the absent claim | If a token arrives without `vanId`, the rule must deny, not throw. Absent claim equals deny is the standing convention |
| More rules to write and test | Each collection now carries a scope rule instead of one shared `!= null` line. The probe suite grows with it |

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Keep `request.auth != null` and hide fields in the client | The data is on the wire. Any caller with a proxy or the emulator reads it. Hiding in the UI is not authorization |
| Use the badge code as the authorization token inside rules | The badge code is printed, shared and public by design. A public string cannot be a boundary |
| Real accounts for drivers (email and password) | Turn a shift-start screen into an account-recovery flow, for drivers who share devices. It also does not scope a driver to their van, which is the actual problem |

## References

| What | Where |
|---|---|
| The claim vocabulary and who mints each claim | `../02-contracts/claims.json` |
| The rules this decision corrects | `../03-rules/firestore.rules` |
| The reason codes the scoped writes can still fail with | `../02-contracts/errors.json` |
| The device binding that mints `vanId` | ADR 0004 in `./index.md` |
| The field restriction on `drivers` | ADR 0005 in `./index.md` |
