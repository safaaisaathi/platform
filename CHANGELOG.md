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

Nothing pending.

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
