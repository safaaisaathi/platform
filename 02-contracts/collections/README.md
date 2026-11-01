---
id: collections-readme
title: The Collection Table
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: harness
see_also:
  - ./README.md
  - ../03-rules/firestore.rules
  - ../02-contracts/callables.json
---

# The Collection Table

**One row per collection. Start here, then open the schema.**

## 1. The table

| Collection | Doc id | Schema | Writes | Reads | Status |
|---|---|---|---|---|---|
| `wards` | `ward-1` | [ward](ward.schema.json) | Admin, platform owner | All three apps, functions | Exists |
| `routes` | `route-01` | [route](route.schema.json) | Admin | All three apps, functions | Exists |
| `vans` | `van-01` | [van](van.schema.json) | Driver (telemetry), Functions (`offline`), Admin (`depot`) | All three apps, functions | Exists |
| `trips` | auto | [trip](trip.schema.json) | Driver, Functions | All three apps, functions | Exists. `gpsTrail` needs sharding |
| `trips/{id}/trail` | `0`, `1`, `2` | [trailChunk](trailChunk.schema.json) | Driver | Driver, Admin | **NEW.** Solves the 1 MiB cliff |
| `complaints` | auto | [complaint](complaint.schema.json) | User (create), Driver (2 fields, D4 scope), Admin (via callable), Functions | User (own), Driver (trip scope), Admin (staff scope) | Exists |
| `notices` | auto | [notice](notice.schema.json) | Admin (via callable) | All three apps | Exists. **No read-state** |
| `notices/{id}/receipts` | `AB-1234` | [noticeReceipt](noticeReceipt.schema.json) | Driver | Driver | **NEW.** Persistent read-state |
| `ratings` | auto | [rating](rating.schema.json) | User | User (own), Admin | Exists |
| `staff` | auto | [staff](staff.schema.json) | Admin (via callable) | Admin, Functions | Exists |
| `staffPhones` | `AB-1234` | [staffPhone](staffPhone.schema.json) | Admin (via callable) | Admin only | **NEW.** Q4. The raw phone's home |
| `drivers` | `AB-1234` | [driver](driver.schema.json) | Admin (via callable) | Driver (own, field-restricted), Admin | Exists. `phone` is becoming `phoneMasked` |
| `vanDevices` | `van-01` | [vanDevice](vanDevice.schema.json) | **Functions only** | Functions only | **NEW.** The authorization anchor |
| `deviceTopics` | the uid | [deviceTopic](deviceTopic.schema.json) | Client (own uid) | Functions only | **OPTIONAL.** Phase 11, not needed today |

## 2. The join keys

**Three joins carry the whole system. Get these wrong and the apps show the wrong data.**

| From | Field | To | What it decides |
|---|---|---|---|
| `wards` | `routeId` | `routes` | Which route serves the citizen's ward. The user app's **only** query scope |
| `routes` | `wardIds[]` | `wards` | The visiting order. The ETA walks it. The arrival alert walks it |
| `vans` | `routeId` | `routes` | Which route the van serves |
| `trips` | `vanId` | `vans` | The trip's van |
| `trips` | `driverId` | `drivers` | Who was on shift |
| `complaints` | `wardId` | `wards` | Which ward. The driver app's D4 scope and the admin's scope both use it |
| `complaints` | `deviceId` | the citizen's claim | Which complaint is the citizen's own |
| `wards` | `inspectorId` | `staff` | Who gets the missed-collection alert |

## 3. The three collections that hold personal data

| Collection | What is personal | Who may read it | How it is protected |
|---|---|---|---|
| `drivers` | The phone, the name, the allotted wards | The driver (own), the admin (scope) | **Field-restricted** read for the driver. The raw phone is not here |
| `staffPhones` | The raw phone | The admin (scope) | A separate collection. **This is the only way to keep it out of the driver's read path** |
| `complaints` | The location, the device id | The citizen (own), the driver (trip scope), the admin (staff scope) | The `deviceId` claim scopes the citizen's read |

**The rule that catches the whole class.** *A Firestore `get` returns the whole document. Rules do not redact fields.* So a field-level restriction needs a **separate collection**, not a field-level rule.

## 4. The write authority

| Who | Writes directly | Writes through a callable | Never writes |
|---|---|---|---|
| **Driver app** | `vans.lastLocation`, `vans.batteryPct`, `vans.status`, `vans.currentTripId`, `trips`, `trips/{id}/trail`, `complaints.status`, `complaints.resolvedAt`, `notices/{id}/receipts` | The shift calls: `bindDeviceToVan`, `startShift`, `endShift`, `markWardDone` | `drivers`, `staff`, `staffPhones`, `vanDevices`, `wards`, `routes` |
| **User app** | `complaints`, `ratings` | `bootstrapUserSession` | Everything else |
| **Admin panel** | **Nothing** | All five: `setComplaintStatus`, `publishNotice`, `upsertDriver`, `upsertStaff`, `setVanDepot` | Everything else |
| **Functions** | Everything, via the Admin SDK | n/a | n/a |

**The admin panel's every write is a callable.** That is Q5. A revoked staff member's token stays valid for up to an hour, and only a server-side read of the live `staff` doc can lock them out immediately.

## 5. The subcollections

| Parent | Subcollection | Why a subcollection and not an array |
|---|---|---|
| `trips/{id}` | `trail` | The trail is unbounded. An array hits the 1 MiB document cap |
| `notices/{id}` | `receipts` | A `targetType: all` notice is read by every driver. An array would grow without bound |

## 6. The rule about `additionalProperties`

**The raw schemas leave unknown properties permitted.** An app may add an **extension** field.

**The composed schema that a runtime validates against is strict.** `08-tools/build-schemas.ts` produces it by merging the core schema with every registered extension.

```
raw schema          permissive   core fields + any registered extension field
composed schema     strict       anything unregistered is rejected
```

**Why.** A strict raw schema would make every extension a MAJOR version bump, which defeats the extension model.
