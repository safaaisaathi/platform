# CHG-0001: Freeze the collection and field contract

**Severity**: S2 (New capability) | **Priority**: P2 | **Version**: 0.0.0 → 1.0.0
**Date**: 2026-11-01 | **Author**: platform-owner | **Decides**: ADR-0001

## What changed

The first published contract. Every collection, field, enum, constant, claim, topic and callable is now documented in `02-contracts/`, in machine-readable form.

| What | Where | Count |
|---|---|---|
| Collection schemas | `02-contracts/collections/*.schema.json` | 14 |
| Frozen enums | `02-contracts/enums.json` | 9 |
| Shared constants | `02-contracts/constants.json` | 35 across 9 groups |
| Custom claims | `02-contracts/claims.json` | 8 |
| FCM topics | `02-contracts/topics.json` | 4 |
| Callables | `02-contracts/callables.json` | 11 |
| Reason codes | `02-contracts/errors.json` | 9 |

## Why

**Three apps are being built against one Firestore database.** The driver app exists. The user app and the admin panel are being built on top of it. Each of them will invent field names, enum values and claim names unless there is one place that says what they are.

**The existing failure is not hypothetical.** The driver app already had `phone` meaning two things, a hardcoded 28-ward list that broke at 29 wards, and a `attachTrip` fix that was marked done but was still unreachable in production. Each of those is a contract that nobody wrote down.

**And the docs alone would not have prevented them.** A prose PRD says *"the driver's phone is masked"*. A schema says `"phoneMasked": { "type": "string", "pattern": "^[0-9]{2}X{4}[0-9]{2}$" }`. **The second one can be checked by a machine.** That is the difference this repo makes.

## What breaks

Nothing. This is the first publication. There is nothing to migrate from.

## Who is affected

| App | Affected? | What they must do |
|---|---|---|
| driverapp | YES | Vendor the contract into `.contract/vendor/` and point the `AGENTS.md` at it |
| userapp | YES | Same. The schemas and the constants become the source of truth |
| adminpanel | YES | Same. The callables and the reason codes become the source of truth |

## Migration steps

1. Run `node 08-tools/sync-contract.ts <app-repo-path>` in each app repo. It copies `02-contracts/`, `03-rules/` and `05-decisions/` into `.contract/vendor/` and writes the fingerprint.
2. Add the `AGENTS.md` block from `../07-guides/reading-the-contract.md` to each app repo.
3. Add `.contract/adopted.json` with `contractVersion: "1.0.0"`.
4. Add the CI gate that runs `08-tools/check-adoption.ts`.

## Rollback

Delete the `.contract/` folder and the `AGENTS.md` block. The app keeps working. The contract was additive.

## Files changed

| File | What changed in it |
|---|---|
| `02-contracts/**` | All of it. The first publication |
| `VERSION` | Created. `1.0.0` |
| `06-changes/manifest.json` | The `CHG-0001` entry |
| `06-changes/CHANGELOG.md` | The `1.0.0` section |

## See also

- [ADR-0001](../05-decisions/0001-backend-is-firebase-not-a-custom-server.md)
- [The contract layer](../02-contracts/README.md)
- [Reading the contract](../07-guides/reading-the-contract.md)
