# EXT-0002: The user app owns collectionFeedback

**Severity**: S3 (Additive) | **Priority**: P4
**Version**: extensionVersion 1
**Date**: 2026-11-02 | **Author**: platform-owner | **Decides**: none

## What changed

The `collectionFeedback` collection is now in the core contract with the five fields every app must agree on: `wardId`, `date`, `deviceId`, `hadGarbage` and `collectionStatus`. The five app-only fields, `id`, `reason`, `note`, `timestamp` and `syncStatus`, live in the user app's extension file, `userapp/.contract/extensions/userapp.json`, which the platform owner has already created and registered with its sha256 in `02-contracts/extensions/registry.json`. The user app does not change that file. If it ever does, it bumps `extensionVersion` and asks the platform owner to re-register the hash.

## Why

The collection was created by the user app and was not in the contract. The user app is the only app that writes it and the only app that reads it, so no other app can disagree about what it means. The five shared fields are in the core so the shape is written down and the rules can cover it. The five app-only fields are the user app's own bookkeeping, so they belong in an extension and not in the core, where they would force a version bump on the other two apps for a change that affects neither.

## What breaks

| App | What breaks |
|---|---|
| userapp | Nothing. This is purely additive. The collection and the extension are as the app already writes them |
| driverapp | Nothing. It never reads or writes `collectionFeedback` |
| adminpanel | Nothing. It never reads or writes `collectionFeedback` |

**Nothing breaks.** The registry hash is the only enforcement, and it matches the app's file.

## Who is affected

| App | Affected? | What they must do | Blocked release? |
|---|---|---|---|
| driverapp | NO | It never touches `collectionFeedback` | No |
| userapp | YES | Keep `.contract/extensions/userapp.json` exactly as it is. Do not change it without a version bump | No, the deadline is null |
| adminpanel | NO | It never touches `collectionFeedback` | No |

## Migration steps

1. The collectionFeedback collection is now in the core contract with the five fields every app must agree on
2. The user app owns the five app-only fields in .contract/extensions/userapp.json. The platform owner has already created that file and registered its hash
3. The user app keeps the extension file exactly as it is. If it changes, bump extensionVersion and ask the platform owner to re-register the hash

**The order that works**: register the extension first, then leave the app's file unchanged. The hash in `registry.json` is the proof that the two agree.

## Rollback

**Nothing to roll back.** The user app's file does not change, so there is no code change to undo. If the app edits the extension file without re-registering, CI fails on the hash mismatch, which is the intended behaviour and not a rollback case.

## Files changed

| File | What changed in it |
|---|---|
| `02-contracts/collections/collectionFeedback.schema.json` | The five core fields |
| `02-contracts/extensions/registry.json` | The `userapp` entry and its sha256 |
| `06-changes/manifest.json` | The `EXT-0002` entry |

**The core version does not move.** An extension change does not bump `VERSION`, and the other two apps are not notified.

## See also

- [The collection feedback schema](../02-contracts/collections/collectionFeedback.schema.json)
- [The extension registry](../02-contracts/extensions/registry.json)
- [EXT-0001, the driver app's extension, the same shape](EXT-0001-driverapp-trip-id.md)
- [The change log README](README.md)
