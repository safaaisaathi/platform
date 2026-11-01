---
id: platform-boundaries
title: What the Platform Owns and What the Apps Own
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: both
see_also:
  - ./product-overview.md
  - ../07-guides/backend-split.md
  - ../02-contracts/README.md
---

# What the Platform Owns and What the Apps Own

**Every piece of work in this system lands in exactly one of five buckets.** This file says which bucket, and why.

## The five buckets

| Bucket | Home | Who edits it |
|---|---|---|
| **The contract** | `02-contracts/` | The platform owner. Apps request changes |
| **The rules** | `03-rules/` | The platform owner. Apps request changes |
| **The functions** | `04-functions/` | The platform owner |
| **The decisions** | `05-decisions/` | Anyone proposes, the platform owner accepts |
| **The change log** | `06-changes/` | The platform owner |

**And the app's own code** lives in the app's repo. The platform has no application code. No screens, no widgets, no repositories.

## The one-way dependency

```
driverapp ──┐
userapp ────┼──▶ platform ──▶ Firebase (one project)
adminpanel ─┘
```

**The platform never depends on an app repo.** That direction is what makes the contract authoritative. If the platform imported anything from an app, a change in that app would silently change the contract for everyone.

## The decision rule for the backend

**This is the rule that decides where a write goes.**

> **A write is a RULE when the claim is the authority. A write is a CALLABLE when a live document is the authority.**

| The write | The authority | The mechanism |
|---|---|---|
| The driver writes its own van's telemetry | The `vanId` claim | **Rule** |
| The citizen files their own complaint | The `deviceId` claim | **Rule** |
| The admin resolves a complaint | The live `staff` doc | **Callable** |

**Why.** A token's claims are a snapshot. They can be up to an hour old. **If the authority is a document that can change, only the server can see the current value**, so only the server can make the decision.

**The one exception.** The trail chunk is a direct client write. Chunking exists to reduce the number of writes, and a Function per write adds a network hop. The rule protects it fully: the parent `vanId` must match, the size is capped, and update and delete are denied.

## The three rules of thumb

### Rule 1: the server sends a reason code, the client owns the words

The Function returns `vanAlreadyClaimed`. The app maps it to `identityShiftConflictClaimed` in its arb files. **A server that sends English text to the app breaks localization the moment the copy is edited**, and it puts presentation inside the server where three apps would each need a different wording.

### Rule 2: a collection's schema is shared, a field's meaning is shared, but a field only one app uses is an extension

**If two apps must agree on the meaning, it is core.** If only one app uses it, it is an extension, and that app can add it itself. See `../02-contracts/extensions/README.md`.

### Rule 3: the device decides how it behaves, and it must work offline

A read is free and instant. A decision needs the server. **The device never asks "am I allowed to?" and the server never asks "how should the phone look?"**

## The read-versus-write split

| | Reads | Writes |
|---|---|---|
| **The user app** | Direct query, scoped by the `routeId` claim | Direct create, scoped by the `deviceId` claim |
| **The admin panel** | Direct query, scoped by the `wardIds` claim | **Every write is a callable** |
| **The driver app** | Direct read, scoped by the `vanId` claim | Direct write for telemetry. **Callables for the shift calls** |

**Every admin read is a direct query.** Reads are cheap and the rules can scope them by the claim. It is only the writes that need the server, because only the writes need live revocation.

## The forbidden list

| Never | Why |
|---|---|
| The Admin SDK in a client app | It bypasses every rule. A leaked service account is a full database takeover |
| A service account key in any repo | Same |
| A client parameter as a scope | The client controls it. That is the B-01 bug class |
| The badge code as an authorization token | It is printed on the van |
| The admin panel writing to Firestore directly | A revoked staff member keeps access for up to an hour |
| A hardcoded constant that exists in `constants.json` | The Dart side and the Function side drift, and nobody notices |
| An enum value written out in two places | One gets edited and the other silently accepts a rejected value |
| A new field in an app repo without a request | The contract has one home |

## The one-line check before you commit

**Ask: "does this change what another app can see?"**

| Answer | Where it goes |
|---|---|
| No | Your app repo. Just do it |
| Yes, but only your app reads it | An extension. Register it, then just do it |
| Yes, another app reads it too | A contract request. Fill `../06-changes/templates/contract-request.md` |
