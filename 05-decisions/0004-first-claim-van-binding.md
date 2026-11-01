---
id: adr-0004-first-claim-van-binding
title: First-claim van binding
status: accepted        # proposed | accepted | rejected | superseded
owner: platform-owner
updated: 2026-11-01
audience: harness
deciders: [office, platform-owner]
consulted: [driverapp-team, adminpanel-team]
informed: [office, userapp-team]
supersedes: null
supersededBy: null
see_also:
  - ../02-contracts/callables.json
  - ../02-contracts/collections/vanDevice.schema.json
---

# First-claim van binding

## Context

The driver badge code (`AB-1001`) is public. It is printed, handed over, visible on the van. So the code identifies, it does not authenticate. The real identity anchor is the binding between a phone (an install) and a van, and somebody has to set it. Two models:

| Option | How it works | What it costs |
|---|---|---|
| First claim | The first phone presenting a valid driver code claims the van, right there at shift start | A wrong or racing claim is possible, and must be handled |
| Pre-provision | The office creates `vanDevices/{vanId}` with the expected install id before the driver ever signs in | No admin console exists yet, so every binding and every van swap is an office ticket to the console |

The decision was the office's to make, because it defines their day-one workflow. Office's call, 2026-11-01: FIRST-CLAIM.

## Decision

The first phone with a valid driver code claims the van, inside a Firestore transaction on `vanDevices/{vanId}`. The binding doc records `claimMode: "firstClaim"`.

The `bindDeviceToVan` callable performs these checks, in order:

| # | Check | What it stops |
|---|---|---|
| 1 | The driver exists in `drivers/{driverCode}` | Typos and invented codes |
| 2 | `drivers.vanId` matches the van this phone is claiming | A driver with a valid code claiming ANY van |
| 3 | `vanDevices/{vanId}` does not exist yet, OR its `installId` matches this `installId` | A second phone stealing an existing binding |

On create, the binding doc gets `installId`, `boundAt`, `boundBy`, `claimMode = "firstClaim"`. On match (check 3's second branch), the callable returns the existing binding and does NOT rewrite it. The collection is never client-writable: `../02-contracts/collections/vanDevice.schema.json` marks it platform-functions-only.

## Consequences

### Good

| Consequence | Why it matters |
|---|---|
| Day one works with zero office setup | The driver installs, enters the code, and is bound. No pre-registration step exists to forget |
| The binding is still server-minted | The transaction, not the client, writes the doc. A client-writable binding would be a client-writable identity |
| The mode is recorded | `claimMode` on the doc says which model produced this binding, so the Phase 11 hardening does not silently mix the two |

### Bad

| Cost | Why it is accepted |
|---|---|
| The race is real | Two phones presenting the same code at once both try to claim. The transaction settles it: the loser gets the `vanAlreadyClaimed` reason code, not a silent double-bind. A conflict is a distinct outcome with its own copy, per `../02-contracts/errors.json`, not a generic error |
| A wrong claim needs a manual undo | Delete the `vanDevices/{vanId}` doc from the Firebase console, and the next phone can claim. There is no admin console, so this MUST be a documented runbook step, not tribal knowledge |
| Check 2 must never be dropped | Without the `drivers.vanId` match, any driver with any valid code could claim any van. The code proves the driver exists. The doc proves which van is theirs |
| The `installId` must be stable per install | Not a per-launch value. A per-launch value makes every app restart a new binding candidate, and a re-install would orphan the old binding silently |

Also accepted: the callable is rate limited (`BIND_RATE_LIMIT_MAX` attempts per window). Without that limit, the callable is an oracle for testing whether a code exists.

## Hardening, Phase 11

Match-only. The office pre-provisions `vanDevices/{vanId}` with the expected install id, and the callable never creates, it only matches. The race disappears, because a second phone can never be first. `claimMode` on new bindings flips to the pre-provisioned mode. First-claim remains recorded here as the day-one model that made launch possible without an admin console.

## References

| What | Where |
|---|---|
| The callable contract: input, checks, transaction, hardening | `../02-contracts/callables.json`, `bindDeviceToVan` |
| The binding document schema | `../02-contracts/collections/vanDevice.schema.json` |
| The `vanAlreadyClaimed` conflict code | `../02-contracts/errors.json` |
| The claims this binding mints | `../02-contracts/claims.json`, `vanId`, `driverId` |
| Why the rules scope by the claim this callable mints | ADR 0002 in `./index.md` |
