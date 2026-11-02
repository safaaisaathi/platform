---
id: ext-0001-driverapp-trip-id
title: "EXT-0001: The driver app owns trips.id"
status: frozen
owner: driverapp-team
updated: 2026-11-02
contractVersion: "1.0.0"
audience: harness
see_also:
  - ./README.md
  - ../02-contracts/extensions/README.md
  - ../02-contracts/collections/trip.schema.json
---

# EXT-0001: The driver app owns `trips.id`

**One field. One app. No core version bump.**

## 1. What changed

**The driver app writes a field the core `trip` schema does not have: `id`.**

| | |
|---|---|
| **The field** | `trips.id`, a string |
| **Who writes it** | `driverapp`, in `FirestoreTripsRepository.createTrip` |
| **Who reads it** | `driverapp`, in `Trip.fromMap` |
| **Why** | The driver app's `Trip` model is a round-trip shape. The id has to survive a write and a read, so it is written into the document |
| **The extension file** | `driverapp/.contract/extensions/driverapp.json`, `extensionVersion` 1 |
| **The registration** | `platform/02-contracts/extensions/registry.json`, key `driverapp` |

**The core contract did not move.** `VERSION` stays at `1.0.0`. The other two apps are not notified, because they are not affected.

## 2. Why this is an extension and not core

**The rule.** *If two apps must agree on the meaning of a field, it is core. If only one app uses it, it is an extension.*

| Test | Result |
|---|---|
| Does a second app read the field from the document? | No. The admin panel and the user app read `trips` and take the id from the snapshot, not from the field |
| Does a function need it? | No. A function has the trip id in the document path, `trips/{tripId}` |
| Is it personal data? | No |
| Is it required? | No. It is optional in the extension |
| Does it hold an enum value? | No |

**One app uses it, so it is an extension.**

## 3. Why it had to be registered at all

**The composed schema is strict.** It closes the document with `unevaluatedProperties: false`. A field that is in neither the core schema nor a registered extension is **rejected**.

**And the rules are about to tighten.** `CHG-0003` replaces `request.auth != null` with a field allowlist. If `trips.id` were unknown to the platform, the driver's trip create would start failing with a permission error the day the new rules deploy.

**Registering it now means the rules can name it.** That is the whole point of doing the write-path audit before the rules rewrite.

## 4. The known debt on this field

**`trips.id` is redundant.** The Firestore document id is already the trip id, and every reader gets it from the snapshot for free.

| Why it should eventually go | The risk it carries today |
|---|---|
| It duplicates a value the document path already holds | It can drift. A `copyWith` that copies a stale id writes a wrong id |
| It is a second identity field on a document | Under a field allowlist, an allowlisted `id` is an injection surface. A writer could set `id` to another trip's id |
| No reader needs it | Every reader pays for it in every read |

**The right long-term shape.** Drop `id` from the write path. Read it from `snapshot.id`, which the driver app already does on three of its four read paths.

**This entry records the field as it is today, so the contract matches the code.** The removal is a separate change, and it is the driver app's to make.

## 5. What the driver app has to do

| # | Task | Status |
|---|---|---|
| 1 | Keep writing `trips.id` | **Done.** The write is unchanged |
| 2 | Bump `extensionVersion` when the extension file changes | Not yet needed. It is at 1 |
| 3 | Ask the platform owner to re-register after a bump | Not yet needed |
| 4 | Adopt this entry in `.contract/adopted.json` | **Done** |

**No other app has anything to do.**

## 6. How to verify

```bash
node 08-tools/check-consistency.ts
```

**Expected:** `manifest consistent`. The check resolves `trips.id` against the registered extension, and the registry's hash matches the driver's file byte for byte.

```bash
node 08-tools/build-schemas.ts
```

**Expected:** `composed schemas built: 14 collections, 1 extension merge(s), 28 files in 02-contracts/collections/.composed`.

## 7. Report format

```
CHANGE ID: EXT-0001
CONTRACT VERSION: 1.0.0 (unchanged, extension only)
SEVERITY: S3
FILES READ: 02-contracts/collections/trip.schema.json, 02-contracts/extensions/registry.json
FILES CHANGED: 02-contracts/extensions/registry.json, 06-changes/manifest.json, 06-changes/EXT-0001-driverapp-trip-id.md
VALIDATION: check-consistency -> pass | build-schemas -> 1 extension merge
OPEN QUESTION: none
```
