# Changelog

**The human-readable version of `manifest.json`.** If the two disagree, `manifest.json` wins, because the CI tools read that one.

**The format follows Keep a Changelog.** The version numbers follow SemVer.

## [Unreleased]

Nothing pending beyond 2.3.0.

## [2.3.0] - 2026-11-05

### Added

- `drivers.createdAt`, `drivers.createdBy`, `drivers.updatedAt` and `drivers.updatedBy`. `upsertDriver` sets them from the server clock and the live `staffId` claim, so a client cannot forge who changed a driver or when. ([CHG-0020](CHG-0020-the-driver-audit-fields.md))
- A staff alert on the first mock-location latch. `flagMockLocation` now pushes to the inspector of each of the trip's wards, on the existing `staff_{staffId}` topic. The send happens only on the call that flips the latch, so a retry cannot duplicate it. ([CHG-0022](CHG-0022-the-mock-location-staff-alert.md))

### Changed

- `startShift` clears a stale `vans.currentTripId` when the marker points at a missing trip or at a trip that is no longer `on_shift`, then starts the shift. It used to fail with `staleMarker` and wait for a manual write. `staleMarker` still fires for a live trip of another van. ([CHG-0021](CHG-0021-the-stale-van-marker-is-repaired-by-startshift.md))

## [2.2.0] - 2026-11-05

### Added

- `notices/{noticeId}/receipts/{driverCode}` is a published change. The schema and the strict rules already existed; this release adds the change entry, so the manifest, the app checklist and the adoption record can see it. ([CHG-0018](CHG-0018-the-notice-read-receipt.md))
- A `complaints` composite index on `category` ASC, `wardId` ASC, `createdAt` DESC. It serves the driver app's bounded Pending Reports query, which the existing ascending index cannot. ([CHG-0019](CHG-0019-the-complaints-index-for-the-driver-app.md))

### Changed

- `03-rules/firebase.json` and `03-rules/firebase.strict.json` now start the Storage emulator, on 9199 and 9198. Before this, `storage.rules` had no local test path. No change entry: the contract is unaffected.

## [2.1.0] - 2026-11-05

### Added

- `flagMockLocation({ tripId })`. The driver app's phone detects a mocked GPS fix, but the trip document is server-owned, so the latch is set by a callable. The field already existed; this adds the write path the schema and PRD-2 assumed. ([CHG-0017](CHG-0017-the-mock-location-latch-is-a-callable.md))

### Corrected, no change entry

- `x-writes` in `trip`, `van`, `route` and `ward` now agree with `03-rules/firestore.strict.rules`. `trip` no longer claims a direct driver write the rules deny, and `van` no longer claims `currentTripId` or a direct admin write. A new tool, `08-tools/check-x-writes.ts`, keeps them in step.
- CHG-0006 no longer says to delete the `cloud_functions` dependency. CHG-0003's callables need it. The step is now the app's own `functions/` deployment.
- `check-conflicts.ts` resolves a subcollection name (`trail`, `receipts`) to its schema file, so CHG-0005's mandated trail write is no longer reported as an unknown collection.

## [2.0.0] - 2026-11-03

**This is the breaking release.** It is the version where the rules stop trusting "someone is signed in" and start trusting a claim the server minted, and where the backend gets one home.

### Added

- `staffPhones` collection. The raw driver phone's new home, behind the staff wall. ([CHG-0002](CHG-0002-mask-the-raw-driver-phone.md))
- `trail` subcollection under `trips`. The GPS trail is sharded so it stops hitting the 1 MiB document cap. ([CHG-0005](CHG-0005-shard-the-gps-trail.md))
- `vanDevices` collection. The device-to-van binding. The authorization anchor. ([CHG-0003](CHG-0003-scope-the-rules-by-custom-claims.md))
- `wardDuty` collection. The duty board. **The server writes it, never a client.** ([CHG-0011](CHG-0011-the-server-writes-the-ward-duty-board.md))
- `complaintPhones` collection. The raw complainant phone's new home. District staff only. ([CHG-0012](CHG-0012-no-raw-phone-in-a-readable-document.md))
- `collectionFeedback` collection. The five cross-cutting fields. The five app-only fields are the user app's extension. ([EXT-0002](EXT-0002-userapp-collection-feedback.md))
- `rateLimit` collection. The bind-attempt counter. ([CHG-0003](CHG-0003-scope-the-rules-by-custom-claims.md))
- Fifteen callables: `bindDeviceToVan`, `bootstrapUserSession`, `mintStaffToken`, `startShift`, `endShift`, `markWardDone`, `setComplaintStatus`, `publishNotice`, `upsertDriver`, `upsertStaff`, `setVanDepot`, `citizenVerifyResolution`, `reopenComplaint`, `getWardDutyStatus`, `markWardDutyCompleted`.
- Seven server functions: `arrivalAlert`, `mergeDuplicates`, `missedCollectionAlert`, `escalateComplaints`, `autoResolvePendingComplaints`, `vanOfflineWatch`, `whatsappWebhook`.
- A `lifecycle` field on every callable. `planned` or `implemented`. An app may only call a callable whose lifecycle is `implemented`.
- The `invalidState` reason code. The complaint is already closed, the shift is already over, the ward is already done. ([CHG-0013](CHG-0013-one-admin-complaint-write.md))

### Changed

- `drivers.phone` renamed to `drivers.phoneMasked`. The masked form is `98XXXXXX10`. ([CHG-0002](CHG-0002-mask-the-raw-driver-phone.md))
- `staff.phone` renamed to `staff.phoneMasked`. ([CHG-0012](CHG-0012-no-raw-phone-in-a-readable-document.md))
- The complaint status enum went from four values to seven. `pending_verification`, `auto_resolved` and `reopened` are new. ([CHG-0010](CHG-0010-wider-complaint-statuses-and-categories.md))
- The complaint category enum went from four values to eight. `dead_animal`, `public_toilet`, `construction_debris` and `hazardous_waste` are new. ([CHG-0010](CHG-0010-wider-complaint-statuses-and-categories.md))
- `adminResolveComplaint` replaced by `setComplaintStatus`. The `workerId` and `workerName` client parameters are gone, because a client parameter is forgeable. ([CHG-0013](CHG-0013-one-admin-complaint-write.md))
- The Firestore rules scope by custom claim instead of by `request.auth != null`. The strict rules are a separate file, `firestore.strict.rules`, so the switch is one deploy on a day when every app is ready. ([CHG-0003](CHG-0003-scope-the-rules-by-custom-claims.md))
- Every admin panel write goes through a callable. The admin write rules become `if false`. ([CHG-0004](CHG-0004-admin-writes-go-through-callables.md))
- The `phoneMasked` pattern was wrong. It was eight characters with four X. It is ten characters with six X, which is `PHONE_MASK_FORMAT`.
- The `offline` reason code is marked `clientDetected`. The server's `ReasonCode` type excludes it, so a server path that tries to send it does not compile.

### Removed

- `verifyDriverPin` and `setDriverPin` callables, including the `DEMO_SEED_BYPASS` path. ([CHG-0006](CHG-0006-delete-the-pin-flow.md))
- The `vanSecrets` collection.
- The `cloud_functions` dependency from the driver app's `pubspec.yaml`.
- `trips.gpsTrail` as a single array. ([CHG-0005](CHG-0005-shard-the-gps-trail.md))
- `complaints.phone`, `complaints.assignedPhone` and `complaints.escalatedToPhone`. The raw number moved to `complaintPhones`. ([CHG-0012](CHG-0012-no-raw-phone-in-a-readable-document.md))
- The three backend copies in the app repos. There is one backend now, at `platform/04-functions`. ([CHG-0009](CHG-0009-the-backend-lives-in-the-platform-repo.md))

### Security

- A driver's raw phone number is no longer reachable from the driver app. ([CHG-0002](CHG-0002-mask-the-raw-driver-phone.md))
- A complainant's raw phone number is no longer reachable by any staff member who is not district staff. ([CHG-0012](CHG-0012-no-raw-phone-in-a-readable-document.md))
- A signed-in caller can no longer read another driver's phone, or rewrite another van's `status` and `currentTripId`. ([CHG-0003](CHG-0003-scope-the-rules-by-custom-claims.md))
- A citizen can no longer write the duty board. A citizen could mark any ward's collection as done, for any date. ([CHG-0011](CHG-0011-the-server-writes-the-ward-duty-board.md))
- A revoked staff member loses admin write access immediately, not after the token expires. ([CHG-0004](CHG-0004-admin-writes-go-through-callables.md))
- The client no longer names the staff member who did the work. The server reads it from the token and the live staff document. ([CHG-0013](CHG-0013-one-admin-complaint-write.md))
- The WhatsApp webhook verifies the provider's signature before it writes anything. An unverified payload is rejected with 401.

### Fixed

- All three apps are on one Firebase project, `safaaisaathi-63a87`. The user app was pointed at `safai-saathi-panchmahal`, which does not exist. ([CHG-0008](CHG-0008-one-firebase-project.md))
- The PRD pointers name real paths, and the source hashes are computed instead of saying `pending`. ([CHG-0015](CHG-0015-fix-the-prd-pointers.md))

## [1.1.0] - 2026-11-02

### Changed

- `ARRIVAL_ALERT_RADIUS_M` set to 100 m, measured from the ward BOUNDARY rather than the centre. ([CHG-0007](CHG-0007-arrival-alert-radius-100m.md))

## [1.0.0] - 2026-11-01

### Added

- The first published contract. Every collection, field, enum, constant, claim, topic and callable documented. ([CHG-0001](CHG-0001-freeze-the-collection-and-field-contract.md))
- The shared contract repo itself. One contract for three apps.

[Unreleased]: https://github.com/safaaisaathi/platform/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/safaaisaathi/platform/compare/v1.0.0...v2.0.0
[1.1.0]: https://github.com/safaaisaathi/platform/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/safaaisaathi/platform/releases/tag/v1.0.0
