---
id: rules-readme
title: The Rules Folder
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: harness
see_also:
  - ./firestore.rules
  - ../02-contracts/claims.json
  - ../07-guides/backend-split.md
---

# The Rules Folder

**The security boundary for all three apps.** One file, one owner, one review path.

## The files

| File | What it is |
|---|---|
| `firestore.rules` | The Firestore authorization. **The security boundary** |
| `storage.rules` | The Cloud Storage authorization. The complaint photos |
| `firestore.indexes.json` | The composite indexes. **Four exist. More are needed** |
| `firebase.json` | The emulator config and the deploy paths |

## The three rules of the rules

### 1. One file, one owner

**The platform owner writes the rules. Nobody else.** A teammate who edits `firestore.rules` and deploys can open a hole for everyone.

**A change request goes through a PR.** See `../06-changes/templates/contract-request.md`.

### 2. The rules scope by claim, not by "is signed in"

| Collection | The claim that scopes it |
|---|---|
| `vans` | `vanId` |
| `trips` | `vanId`, and `currentTripId` for the D4 scope |
| `drivers` | `driverId`. **And field-restricted** |
| `complaints` | `deviceId` for the citizen, the trip scope for the driver, the live staff scope for the admin |
| `ratings` | `deviceId` |

**`allow read: if request.auth != null` is not authorization.** It is a comment that says "the door is unlocked".

### 3. Every admin write is denied

```rules
allow write: if false;
```

**The admin panel writes through callables.** A revoked staff member's token stays valid for up to an hour, and only a server-side read of the live `staff` doc can lock them out immediately.

**Admin READS stay allowed**, scoped by the claim.

## The field-level restriction

**A Firestore `get` returns the whole document. Rules do not redact.**

| Consequence | What it forces |
|---|---|
| A field-restricted read still returns every field | The PII field cannot live on the same doc as the reader |
| A collection-level rule is not enough for `drivers` | The rule must check the field set explicitly, AND the raw phone must live in `staffPhones` |

**This is the rule that most often gets written wrong**, because the collection-level version looks correct and passes a casual review.

## The current state of the rules

**The rules in this folder today are the OLD ones.** They are `request.auth != null` across the board, except `vanSecrets` which is denied by default.

**A 17-probe emulator test on these exact rules proved the holes.**

| # | The probe | The result |
|---|---|---|
| 1 | Read another driver's phone | **It succeeded.** The phone leaked |
| 2 | Read another driver's doc | It succeeded |
| 3 | Rewrite another van's `status` | **It succeeded.** The write landed |
| 4 | Rewrite another van's `currentTripId` | **It succeeded.** The write landed |
| 5 | Write a trip for a van the caller does not own | It succeeded |
| 6 | Read `vanSecrets` | It was denied. The one thing that worked |
| 7 | And 10 more | Each is documented in `../09-reference/` |

**The rewrite is `CHG-0003`.** It is the P0.

## The emulator caveat

**The Firestore emulator enforces the rules. It does NOT enforce composite indexes.**

**A green emulator run is not proof of index coverage.** The only place index coverage is proven is a staging project with the real indexes deployed.

## The deploy order

```bash
firebase deploy --only firestore:rules      # after EVERY rules edit
firebase deploy --only firestore:indexes    # after every index change
```

**The rules must be in the RELEASED rules, not just in the file.** A rule that is committed but not deployed does nothing.

**And the order between the rules and the clients matters.** See `../06-changes/CHG-0003-scope-the-rules-by-custom-claims.md`.
