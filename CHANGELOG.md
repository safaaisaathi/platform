---
id: platform-changelog
title: Platform Changelog
status: frozen
owner: platform-owner
updated: 2026-11-02
contractVersion: "1.0.0"
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

### Added

- `EXT-0001`. The driver app owns `trips.id`, registered as an extension with a sha256 hash. The core contract version did not move.
- `06-changes/EXT-0001-driverapp-trip-id.md`. The explanation, and the known debt on a redundant field.
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

## [1.0.0] - 2026-11-01

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
