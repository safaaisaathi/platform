---
id: platform-changelog
title: Platform Changelog
status: active
owner: platform-owner
updated: 2026-11-05
contractVersion: "2.2.0"
audience: both
see_also:
  - ./VERSION
  - ./06-changes/CHANGELOG.md
  - ./README.md
---

# Changelog

**The platform repo's own changelog.** The contract's changelog is in [`06-changes/CHANGELOG.md`](06-changes/CHANGELOG.md).

**Two version numbers, and they mean different things.**

| File | What it versions | Owner |
|---|---|---|
| [`VERSION`](VERSION) | **The contract.** The schemas, the enums, the constants, the claims, the topics, the callables, the errors | The platform owner |
| This file | **The repo.** The docs, the tools, the workflows, the structure | The platform owner |

**A change to `06-changes/`, `07-guides/` or `09-reference/` does not bump `VERSION`.** A change to `02-contracts/` always does.

## [Unreleased]

### Contract 2.2.0, the receipt and the index

- `notices/{id}/receipts` is published as a change entry. The schema and the strict rules already existed, but nothing in the manifest named the capability, so no app checklist could track it. ([CHG-0018](06-changes/CHG-0018-the-notice-read-receipt.md))
- `03-rules/firestore.indexes.json` gains `complaints (category ASC, wardId ASC, createdAt DESC)`. The driver app's bounded Pending Reports query sorts newest first, and the existing ascending index cannot serve it. ([CHG-0019](06-changes/CHG-0019-the-complaints-index-for-the-driver-app.md))
- The Storage emulator is in both emulator configs, `03-rules/firebase.json` on 9199 and `03-rules/firebase.strict.json` on 9198. `storage.rules` now has a local test path.

### Contract 2.1.0, the mock-location callable

- `04-functions/src/callables/tracking.ts`. The `flagMockLocation` handler. The driver app detects a mocked GPS fix; the server sets `trips.mockLocationDetected`, because the strict rules keep the trip document server-owned. ([CHG-0017](06-changes/CHG-0017-the-mock-location-latch-is-a-callable.md))
- `08-tools/check-x-writes.ts`. Checks each collection's `x-writes` header against `03-rules/firestore.strict.rules`. Its absence is what let `trip`, `van`, `route` and `ward` drift.

### Fixed

- `04-functions` now targets the Node 22 runtime. Node 20 was decommissioned on 2026-10-30, so every `firebase deploy` failed with "Runtime Node.js 20 was decommissioned". `engines.node` is 22, which is also what CI already runs.
- `check-conflicts.ts` maps a subcollection name (`trail`, `receipts`) to its schema file, so a contract-correct trail write is no longer a false `UNKNOWN COLLECTION`. It also accepts a field that belongs to either side of a parent/subcollection tree, because the per-file scanner cannot tell the two apart.
- `x-writes` corrected in `trip`, `van`, `route` and `ward`.
- CHG-0006's migration step now deletes the app's own `functions/` deployment, not the `cloud_functions` dependency, which CHG-0003's callables need.

### Added

- `02-contracts/extensions/<app>.json`. The platform's registered mirror of each app-owned extension file. The contract tools read the mirror, so the contract validates, composes and releases without the three app repos being checked out beside it. Before this, the CI gate was red on every push, because it read `../driverapp/.contract/extensions/driverapp.json`, which a CI runner does not have.

### Changed

- `check-consistency.ts` verifies the mirror's hash and the mirror's `extensionVersion`, and it verifies the app's own file's hash whenever that repo is checked out beside the platform repo. A missing app repo is no longer an error. An app file that disagrees with the registered hash still is.
- `build-schemas.ts` reads the mirror too, and its miss message names both paths it tried.
- The version-bump gate exempts the whole `02-contracts/extensions/` folder, not only the registry. The mirrors are registration artefacts, not core contract.

### Added

- `check-adoption.ts --write`. It regenerates section 1 of the impact matrix from the manifest and the adoption records, between two markers. The matrix is now genuinely generated instead of claiming to be.
- `07-guides/firebase-getting-started.md`. Firebase from zero, for a teammate who has never used it. The tool install matrix per stack, the eight steps in order, the emulator, the first Firebase code per stack, the secret protocol, and the eight failures a newcomer will hit.
- `07-guides/publishing-a-contract-change.md`. The handoff between the platform repo and the three app repos. Compose, sync one app, let it adopt, refresh the matrix. One step per repo, and the reverse direction for when an app finds a problem.
- `.github/ISSUE_TEMPLATE/contract-request.md`. The contract request form as a GitHub issue template, so an app owner can file one without assembling the file by hand. A `contract-request` label now exists on the repo.

### Changed

- `check-consistency.ts` resolves an `EXT` entry's `affectedFields` against the registered extension, not only against the core schema. A field owned by an extension is a real field of the document.
- `check-consistency.ts` also checks that the registry's `extends` list matches the extension file's own `extends` keys.
- `check-adoption.ts` reads `extensionChanges` as well as `coreChanges`, so an `EXT-nnn` entry is tracked like any other change.
- The version-bump CI gate no longer treats `02-contracts/extensions/registry.json` or the generated `02-contracts/collections/.composed/` files as core contract changes. See `02-contracts/severity-policy.md` section 5.1.
- The driver app's adoption record is now a real file in its own repo, and the platform's report in `06-changes/adoption.json` was copied from it.
- `making-a-contract-change.md` now runs `build-schemas.ts` as step 7 and verifies the composed schemas are committed. CI enforced this and the guide did not, so a harness that followed the guide exactly got a red pull request.
- `adopting-a-change.md` now has eight steps. It syncs the app's pinned copy first, reads the schemas from `.contract/vendor/` instead of a sibling checkout, and bumps the version pin with `bump-contract.ts` after the adoption work rather than before it.
- `using-this-repo.md` has thirteen actions. A13 is the publish pipeline.
- `06-changes/impact-matrix.md` section 5 now shows the real command, `check-adoption.ts --write`, instead of saying a `--write` flag might be added later. It exists.

## [2.0.0] - 2026-11-03

**The breaking release. The contract now matches real code, and the backend has one home.**

**This is the release the three app teams adopt.** Every S1 change in it blocks an app's release until it is adopted.

### The headline

**The backend was in three repos and nowhere canonical. It is now one repo.**

| What | Before | After |
|---|---|---|
| Backend source | `userapp/backend/functions/`, `driverapp/functions/`, and a third copy in the admin panel | **One**, at `04-functions/` |
| Firestore rules | Three copies, already drifted | **Two phases**, one owner. `firestore.rules` is PHASE 1, `firestore.strict.rules` is PHASE 2 |
| Callables in the contract | 11, fictional, zero overlap with the code | **22, all built.** 15 callables and 7 server functions |
| The PIN flow | `verifyDriverPin`, `setDriverPin`, the `vanSecrets` collection, and a `DEMO_SEED_BYPASS` flag | **Gone.** CHG-0006 |

### Added

- `04-functions/src/`. The real backend, split by responsibility: `callables/identity.ts`, `callables/shift.ts`, `callables/admin.ts`, `callables/complaints.ts`, `callables/wardDuty.ts`, `triggers/`, `scheduled/`, `webhooks/`, and the shared `lib/`.
- `04-functions/src/lib/`. The shared helpers: `firebase.ts` is the only place the Admin SDK is initialised, `reasonCodes.ts` is the failure envelope, `auth.ts` is the claim checks, `phone.ts` is the mask, `time.ts` is the IST clock and the distance.
- `04-functions/src/generated/constants.ts`. The constants, generated from `constants.json`. Never hand-written.
- `04-functions/test/`. 44 tests. The pure helpers, the failure envelope, and the contract itself. The contract test proves every callable in `callables.json` is exported and every reason code resolves.
- `02-contracts/features/`. The feature layer. Five cross-app journeys, each with one slice per app and the real state of that slice. It answers "which app does what part of this journey, and what is still missing".
- `10-handoff/`. One ready-to-paste harness prompt per app. `PROMPT-driverapp.md`, `PROMPT-userapp.md`, `PROMPT-adminpanel.md`. This is the handoff.
- `07-guides/wiring-an-app-to-the-contract.md`. The first-time wiring guide. Sync, one project, custom token, callables, delete the backend copy.
- `03-rules/firestore.strict.rules`. PHASE 2. Claims-based, with every admin write denied and the PII collections district only.
- `03-rules/firebase.strict.json`. The emulator config for PHASE 2. Different ports, so both phases can run at once.
- `08-tools/scan-usage.ts`, `08-tools/check-conflicts.ts`, `08-tools/check-features.ts`. The usage scanner, the conflict checker and the feature validator.
- Four new collections: `wardDuty`, `rateLimit`, `collectionFeedback`, `complaintPhones`.
- `EXT-0002`. The user app owns the five app-only `collectionFeedback` fields.
- Ten change entries: CHG-0008 to CHG-0016, and EXT-0002.

### Changed

- The complaint status enum went from four values to seven. `pending_verification`, `auto_resolved` and `reopened` are new. The cross-verification loop needs them.
- The complaint category enum went from four values to eight. `dead_animal`, `public_toilet`, `construction_debris` and `hazardous_waste` are new.
- The complaint document carries `id`, `phoneMasked`, `assignedAt`, `escalatedAt`, `escalatedTo`, `autoResolveDeadline`, the `citizenVerified*` fields and the `reopened*` fields.
- `staff.phone` became `staff.phoneMasked`. The raw one lives in `staffPhones/{staffId}`.
- `adminResolveComplaint` became `setComplaintStatus`. The `workerId` and `workerName` client parameters are gone, because a client parameter is forgeable.
- Every callable and server function in `callables.json` now carries a `lifecycle` field. `planned` or `implemented`. An app may only call a callable whose lifecycle is `implemented`.
- The `phoneMasked` pattern was wrong. It was eight characters with four X. It is ten characters with six X, which is `PHONE_MASK_FORMAT`. A validator using the old pattern would have rejected every real mask.
- The `offline` reason code is marked `clientDetected`. The server's `ReasonCode` type excludes it, so a server path that tries to send it does not compile.
- `03-rules/README.md` has the two-phase table and the switch procedure in section 5.
- `06-changes/impact-matrix.md` has the new rows and a per-app table for all three apps.

### The three P0s

| Change | What | By when |
|---|---|---|
| CHG-0008 | One Firebase project. The user app is pointed at `safai-saathi-panchmahal`, which does not exist | 2026-11-09 |
| CHG-0011 | The server writes the ward duty board. A citizen can currently mark any ward's collection as done | 2026-11-09 |
| CHG-0012 | No raw phone in a readable document. Every staff member who can read a complaint can currently read the complainant's number | 2026-11-09 |

### Known gaps

**These are recorded, not hidden.**

| # | Gap | Tracked as |
|---|---|---|
| 1 | The strict rules are written but not deployed. PHASE 1 is live | CHG-0003, `03-rules/README.md` §5 |
| 2 | No app has adopted 2.0.0. All three are behind | `06-changes/impact-matrix.md` §1 |
| 3 | The user app and the admin panel have no `.contract/vendor/` and no fingerprint | The three handoff prompts |
| 4 | The admin panel has no PRD. The platform points at a file that does not exist | CHG-0015 |
| 5 | The user app's PRD says Flutter. The code is React | CHG-0016, the office decides |
| 6 | `vans(routeId,status)` and `complaints(wardId,createdAt)` composite indexes are missing | The app PRDs |
| 7 | The user app and the admin panel are not registered in the Firebase project | The onboarding checklist |
| 8 | The functions have unit tests but no emulator test suite | The next contract release |

[Unreleased]: https://github.com/safaaisaathi/platform/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/safaaisaathi/platform/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/safaaisaathi/platform/releases/tag/v1.0.0

**The first publication of the shared contract.**

### Added

- `00-context/`. The product overview, the platform boundaries, the glossary, the onboarding checklist, and the machine-readable agent manifest.
- `01-prds/`. The canonical platform PRD, plus three pointer files with machine-checkable `contractRefs`.
- `02-contracts/`. The machine layer. 14 collection schemas, 9 frozen enums, 35 shared constants, 8 custom claims, 4 FCM topics, 11 callable contracts, 9 reason codes, the design tokens, and the extension registry.
- `02-contracts/severity-policy.md`. The S0 to S4 severity levels, the P0 to P4 priority matrix, the version bump rules, and the deprecation window rules.
- `03-rules/`. The Firestore rules, the composite indexes, the storage rules, the emulator config, and the rules README.
- `04-functions/`. The Functions source, the package manifest, the TypeScript config, and the functions README.
- `05-decisions/`. Six ADRs. The backend choice, the claims model, the admin-write model, the van binding, the phone masking, and the device id.
- `06-changes/`. The change manifest, the adoption record, the changelog, the impact matrix, three templates, and seven seeded change entries.
- `07-guides/`. Eleven harness guides, each with the same seven sections in the same order.
- `08-tools/`. Eight scripts. Validate, check consistency, build schemas, check adoption, sync, bump, and two constant exporters.
- `09-reference/`. The background reading. The backend blueprint, the flow audit, the issue register.
- `AGENTS.md`. The harness contract for this repo.
- `.github/CODEOWNERS`, the contract gate workflow, the release workflow, and the pull request template.

### Known gaps

**These are recorded, not hidden.** They are the state of the platform on day one.

| # | Gap | Tracked as |
|---|---|---|
| 1 | The rules are still the old permissive ones. `request.auth != null` across the board | `CHG-0003`, P0 |
| 2 | None of the 11 callables are implemented | `CHG-0003`, `CHG-0004` |
| 3 | `verifyDriverPin` and `setDriverPin` still exist, including the `DEMO_SEED_BYPASS` path | `CHG-0006` |
| 4 | `drivers.phone` is not masked yet, and `staffPhones` does not exist | `CHG-0002` |
| 5 | The trail is still one array on the trip document | `CHG-0005` |
| 6 | `vans(routeId,status)` and `complaints(wardId,createdAt)` composite indexes are missing | `CHG-0007` and the app PRDs |
| 7 | The user app and the admin panel are not registered in the Firebase project | The onboarding checklist |
| 8 | No app repo has adopted the contract yet. All three are at 0% | `06-changes/adoption.json` |

[Unreleased]: https://github.com/safaaisaathi/platform/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/safaaisaathi/platform/releases/tag/v1.0.0
