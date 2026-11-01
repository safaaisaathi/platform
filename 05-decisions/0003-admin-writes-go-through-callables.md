---
id: adr-0003-admin-writes-go-through-callables
title: Admin writes go through callables
status: accepted        # proposed | accepted | rejected | superseded
owner: platform-owner
updated: 2026-11-01
audience: harness
deciders: [platform-owner, office]
consulted: [adminpanel-team, driverapp-team, userapp-team]
informed: [office]
supersedes: null
supersededBy: null
see_also:
  - ../02-contracts/callables.json
  - ../02-contracts/claims.json
---

# Admin writes go through callables

## Context

A Firebase ID token's claims are a snapshot. They expire after one hour, and the client refreshes them. A claim says what the caller WAS when the token was minted, not what the caller is right now.

The office may disable a staff member who leaves. The disable is one field: `staff/{id}.active = false`. A rules-only admin panel checks the token's claims, and the token still says `role: inspector`. The timeline looks like this:

| Minute | What happens in a rules-only panel |
|---|---|
| 0 | The office sets `staff/stf-007.active = false`. The person is fired |
| 0 to 60 | The fired inspector's token still carries `role: inspector, staffId, wardIds`. Every rules-checked write still lands |
| 60+ | The token refreshes, the claims re-mint, and the writes finally deny |

That is up to an hour of writes by someone the office already fired. Complaints can be resolved, notices sent, driver records edited. The office does not get those writes back.

## Decision

Every admin write goes through a callable that reads the LIVE `staff/{id}` document and checks `active`. The claim gets the caller in the door, the live doc decides whether they stay.

The five callables, already in `../02-contracts/callables.json`:

| Callable | What it writes | Extra check beyond `active` |
|---|---|---|
| `setComplaintStatus` | `complaints/{id}` | The complaint's ward must be in the live staff `wardIds` scope |
| `publishNotice` | `notices/{id}`, plus the FCM push | Role check for who may publish |
| `upsertDriver` | `drivers/{code}`, `staffPhones/{code}` | Applies the phone mask at the source (ADR 0005) |
| `upsertStaff` | `staff/{id}`, `staffPhones/{id}` | Setting `active = false` here IS the revocation act |
| `setVanDepot` | `vans/{vanId}` | The driver never writes the depot tag |

Every admin WRITE rule becomes `if false`. There is no direct write path left for the panel. Admin READS stay direct queries, scoped by the claim, because reads are the high-volume path and a claim-scoped read is cheap.

## Consequences

### Good

| Consequence | Why it matters |
|---|---|
| Revocation is instant | The next call fails at the live check, whatever the token says. Minute 0 in the table above becomes the last minute of access |
| One place to audit | Every privileged write has a Function log entry with the `staffId` attached. A rules-only panel has no equivalent record of who did what |
| One place to validate | Input shape, enum values and ward scope are checked in TypeScript with real error codes, not in the rules language |

### Bad

| Cost | Why it is accepted |
|---|---|
| Five functions to write, deploy and test | Five small functions of the same shape: check caller, read staff doc, check active, do the write |
| A stricter rule set | Admin write rules become `if false`, so an emergency fix cannot go through the panel. Emergency writes go through the console with owner privileges, which is a human action anyway |
| Scope NARROWING still waits for the next sign-in | If the office shrinks a staff member's `wardIds`, the old, wider set sits in the token for up to an hour. Accepted, because a slightly-too-wide scope for an hour is not a data leak the way an un-revoked account is. A narrowed scope expires on its own. A revoked account does not |

## Alternatives considered

| Alternative | Verdict | Why |
|---|---|---|
| A live `staff/{id}` check inside the rules on every operation | Rejected | Costs a `get()` on every read, and Firestore rules get expensive fast. Reads are the high-volume path, so the bill and the latency land where volume is |
| A separate admin API (a custom server) | Rejected | Duplicative. It re-opens the custom-backend door ADR 0001 just closed, and gives the panel a second, different auth model from the two apps |
| Claim refresh on staff doc change (a Function re-mints tokens when the staff doc changes) | Deferred to Phase 11 | It would narrow scope faster, but it is extra machinery, and it still cannot be instant for tokens already in flight. The callable's live check already covers the case that matters |

## References

| What | Where |
|---|---|
| The five callables, with inputs, outputs and reason codes | `../02-contracts/callables.json`, `x-callables` and `x-family.adminWrites` |
| The claims-versus-live-doc principle | `../02-contracts/claims.json`, `x-staleness` |
| The deploy order for this change (callable, then panel, then tighten rules) | `../02-contracts/severity-policy.md`, section 6 |
| The reason codes a denied write returns | `../02-contracts/errors.json`, `notAuthorised` |
| Why the rules need this help at all | ADR 0001, ADR 0002 in `./index.md` |
