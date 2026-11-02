---
id: extensions-readme
title: The Extension Model
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: harness
see_also:
  - ./registry.json
  - ../README.md
  - ../06-changes/README.md
---

# The Extension Model

**A contract has a core and it has extensions.** The core is shared and platform-owned. An extension is app-owned and touches only one app.

## 1. The rule that decides core vs extension

> **If two apps must agree on the meaning of a field or a value, it is CORE. If only one app uses it, it is an EXTENSION.**

One line. It decides every case.

| Field | Who uses it | Verdict |
|---|---|---|
| `complaints.status` | The user app creates it, the driver app changes it, the admin panel resolves it | **CORE.** All three must agree on the meaning |
| `complaints.assignedTo` | Only the admin panel reads it | **EXTENSION** (adminpanel) |
| `vans.lastLocation` | The driver writes it, the user app and the admin panel read it | **CORE** |
| `vans.internalNote` | Only the admin panel | **EXTENSION** (adminpanel) |
| `trips.gpsTrail` | The driver writes it, the functions read it | **CORE.** A function is a consumer |
| `trips.driverAppFlag` | Only the driver app | **EXTENSION** (driverapp) |

## 2. Where an extension file lives

**In the app's own repo.** Not in the platform repo.

```
driverapp/.contract/extensions/driverapp.json      ← the driver app OWNS this
adminpanel/.contract/extensions/adminpanel.json    ← the admin panel OWNS this
userapp/.contract/extensions/userapp.json          ← the user app OWNS this

platform/02-contracts/extensions/registry.json     ← the platform owns the REGISTRATION only
```

**The app edits its extension freely.** The platform owner registers it once, and from then on the app keeps editing it without asking.

## 3. The extension file format

```json
{
  "app": "driverapp",
  "extensionVersion": "4",
  "extends": {
    "trip": {
      "properties": {
        "driverAppFlag": { "type": "boolean" },
        "fuelTopUpLitres": { "type": "number", "minimum": 0 }
      }
    }
  }
}
```

| Field | Meaning |
|---|---|
| `app` | The owning app. Must match the file's path |
| `extensionVersion` | The app's own version of its extension. Bumped by the app, not by the platform |
| `extends` | The collection name to the extra properties. The key is the collection's singular name |

**The collection key is singular.** `trip`, not `trips`. It matches the schema file name without the `.schema.json`.

## 4. The registration

**The platform's `registry.json` records which app owns which extension, and at which hash.**

```json
{
  "apps": {
    "driverapp": {
      "app": "driverapp",
      "extensionVersion": "1",
      "source": "driverapp/.contract/extensions/driverapp.json",
      "hash": "sha256:a56cdec5...",
      "extends": ["trip"],
      "registeredAt": "2026-11-02"
    }
  }
}
```

| Field | Meaning |
|---|---|
| `apps` | The wrapper. Every app's registration is one key under it |
| The key | The owning app. It must match the `source` path |
| `app` | The owning app, again. Optional, but it is checked when present |
| `extensionVersion` | The app's extension version at the time of registration |
| `source` | The path to the app's file, relative to the folder that holds the platform repo and the app repos side by side |
| `hash` | `sha256:` plus the hex digest of the app's file, byte for byte |
| `extends` | The collection keys the app extends. It must match the file's own `extends` keys |
| `registeredAt` | The date the registration was made |

**The hash is the enforcement.** `08-tools/check-consistency.ts` recomputes the hash of the app's extension file and compares it. If they differ, the app changed its extension without re-registering, and CI fails.

**The `extends` list is checked too.** A registry that lists a collection the file does not extend is a summary that has drifted from the thing it summarizes, and a reader trusts the summary.

## 5. Two versions, not one

| Version | Owner | Bumped when | Who is affected |
|---|---|---|---|
| `platform/VERSION` | Platform owner | A **core** contract change | Every app listed in `affectedApps` |
| `registry.json` → `<app>.extensionVersion` | That app | **Its own** extension changed | **Only that app** |

**Why this matters.** If every app's extension change bumped the core version, all three apps would get a version bump PR for a change that affects none of them. The team would learn to ignore the bump PR, and then ignore the real one.

**The CI gate knows the difference.** A pull request that touches only `registry.json` and the generated composed schemas does NOT need a `VERSION` bump. See `../severity-policy.md` section 5.1.

**The change log has two kinds of entry.**

| Kind | Who writes it | Scope | Example |
|---|---|---|---|
| `CHG-nnn` | Platform owner | Core. May affect many apps | A new `complaint.status` value |
| `EXT-nnn` | The app owner | One app | `trip.fuelTopUpLitres` added |

## 6. What an extension may and may not do

| Allowed | Forbidden |
|---|---|
| Add a new optional field to a collection | Change an existing core field's type |
| Add a new field to a field the app owns | Add a field another app already has |
| Add a new enum value **in the app's own namespace** | Change the meaning of a core enum value |
| Use a core field's existing type | Add a **required** field. That is a core change |
| Be read and written only by the owning app | Change the core schema directly |

**The hard rule.** *An extension may only ADD. It may never change a core field. The moment it needs to change one, it is a core change and it goes through the request process.*

## 7. How a runtime validates against the composed schema

```
enums.json ──────────────┐
                         ├──> build-schemas.ts ──> composed schema (strict)
collections/*.schema.json┘                            │
extensions/<app>.json ────────────────────────────────┘
```

The composed schema uses `allOf` with `unevaluatedProperties: false`. A field that is in neither the core nor a registered extension is **rejected**.

**The practical effect.** If the driver app writes `trips.gpsTrail2` and nobody registered it, the app's own test fails. The app cannot ship an unregistered field.

## 8. The procedure for adding an extension field

| # | Who | What |
|---|---|---|
| 1 | The app owner | Add the field to the app's own extension file |
| 2 | The app owner | Bump the app's `extensionVersion` |
| 3 | The app owner | Open an issue in the platform repo: "register extension for `<app>`" |
| 4 | The platform owner | Update `registry.json` with the new hash and version |
| 5 | CI | `check-consistency.ts` verifies the hash matches |
| 6 | CI | `build-schemas.ts` regenerates the composed schema |
| 7 | The app owner | Update the app's `adopted.json` with the new extension version |

**No core version bump happens at any step.** The other two apps are not notified, because they are not affected.

## 9. When it is NOT an extension

| Situation | Why it is core |
|---|---|
| A second app needs the field | Two apps must agree on the meaning |
| A function needs the field | A function is a consumer |
| The field becomes required | A required field is a shape change, not an addition |
| The field is an enum value in a shared enum | The enum is shared |
| The field holds personal data | The PII boundary is a platform-wide concern. It goes in the core schema, where the rules can see it |
