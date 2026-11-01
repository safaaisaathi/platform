# Changelog

**The human-readable version of `manifest.json`.** If the two disagree, `manifest.json` wins, because the CI tools read that one.

**The format follows Keep a Changelog.** The version numbers follow SemVer.

## [Unreleased]

Nothing pending.

## [2.0.0] - Unreleased

**This is the breaking release.** It is the version where the rules stop trusting "someone is signed in" and start trusting a claim the server minted.

### Added

- `staffPhones` collection. The raw driver phone's new home, behind the staff wall. ([CHG-0002](CHG-0002-mask-the-raw-driver-phone.md))
- `trail` subcollection under `trips`. The GPS trail is sharded so it stops hitting the 1 MiB document cap. ([CHG-0005](CHG-0005-shard-the-gps-trail.md))
- `vanDevices` collection. The device-to-van binding. The authorization anchor. ([CHG-0003](CHG-0003-scope-the-rules-by-custom-claims.md))
- Eleven callables: `bindDeviceToVan`, `bootstrapUserSession`, `mintStaffToken`, `startShift`, `endShift`, `markWardDone`, `setComplaintStatus`, `publishNotice`, `upsertDriver`, `upsertStaff`, `setVanDepot`. ([CHG-0003](CHG-0003-scope-the-rules-by-custom-claims.md), [CHG-0004](CHG-0004-admin-writes-go-through-callables.md))

### Changed

- `drivers.phone` renamed to `drivers.phoneMasked`. The masked form is `98XXXXXX10`. ([CHG-0002](CHG-0002-mask-the-raw-driver-phone.md))
- The Firestore rules scope by custom claim instead of by `request.auth != null`. ([CHG-0003](CHG-0003-scope-the-rules-by-custom-claims.md))
- Every admin panel write goes through a callable. The admin write rules become `if false`. ([CHG-0004](CHG-0004-admin-writes-go-through-callables.md))

### Removed

- `verifyDriverPin` and `setDriverPin` callables, including the `DEMO_SEED_BYPASS` path. ([CHG-0006](CHG-0006-delete-the-pin-flow.md))
- The `vanSecrets` collection.
- The `cloud_functions` dependency from the driver app's `pubspec.yaml`.
- `trips.gpsTrail` as a single array. ([CHG-0005](CHG-0005-shard-the-gps-trail.md))

### Security

- A driver's raw phone number is no longer reachable from the driver app. ([CHG-0002](CHG-0002-mask-the-raw-driver-phone.md))
- A signed-in caller can no longer read another driver's phone, or rewrite another van's `status` and `currentTripId`. ([CHG-0003](CHG-0003-scope-the-rules-by-custom-claims.md))
- A revoked staff member loses admin write access immediately, not after the token expires. ([CHG-0004](CHG-0004-admin-writes-go-through-callables.md))

## [1.1.0] - Unreleased

### Changed

- `ARRIVAL_ALERT_RADIUS_M` set to 100 m, measured from the ward BOUNDARY rather than the centre. ([CHG-0007](CHG-0007-arrival-alert-radius-100m.md))

## [1.0.0] - 2026-11-01

### Added

- The first published contract. Every collection, field, enum, constant, claim, topic and callable documented. ([CHG-0001](CHG-0001-freeze-the-collection-and-field-contract.md))
- The shared contract repo itself. One contract for three apps.

[Unreleased]: https://github.com/safaaisaathi/platform/compare/v1.0.0...HEAD
[2.0.0]: https://github.com/safaaisaathi/platform/compare/v1.0.0...v2.0.0
[1.1.0]: https://github.com/safaaisaathi/platform/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/safaaisaathi/platform/releases/tag/v1.0.0
