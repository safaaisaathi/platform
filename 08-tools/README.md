---
id: tools-readme
title: The Tools Layer
status: active
owner: platform-owner
updated: 2026-11-02
contractVersion: "1.0.0"
audience: harness
see_also:
  - ../02-contracts/README.md
  - ../06-changes/README.md
  - ../02-contracts/extensions/README.md
  - ../AGENTS.md
---

# The Tools Layer

**This folder is the machine's own tooling.** Every claim in this repo ("who is affected", "is the contract broken", "who has not adopted") is checked here, by code, not by opinion.

The scripts are TypeScript run directly by Node's type stripping (Node 20+, tested on 26). No build step. They resolve the platform repo from their own file location, so they run from any working directory.

**Two of them are Python**, because they check markdown rather than data: `check-tables.py` and `check-links.py`. Python 3.10 or newer. No packages to install.

## 1. Install and run

```bash
cd 08-tools
npm install --no-audit --no-fund
node --experimental-strip-types validate-contract.ts
```

`npm run check` runs the two gate scripts (`validate` + `consistency`) in one go. The other scripts take the target app repo as `argv[2]`, or from the `APP_REPO` environment variable, or default to the current directory.

## 2. The tools

| Tool | What it does | When it runs | Prints on success |
|---|---|---|---|
| `validate-contract.ts` | Compiles every collection schema as JSON Schema draft 2020-12 (ajv + ajv-formats), checks every `$ref` resolves into `enums.json#/$defs`, checks every enum is referenced (by a schema, another contract file, or a catalog entry naming a non-collection consumer), pairs every enum with its `x-catalog` entry in both directions, and checks every constant's value type against its declared `type` | Before every commit that touches `02-contracts/`, and in CI. `AGENTS.md` section 6 gate 1 | `contract valid` |
| `check-consistency.ts` | Checks `06-changes/manifest.json` against the schemas: `affectedFields[].path` names a real field (a `renamed` or `removed` path names the old field and may be gone; a `renamed` target must exist), `affectedCollections[]` names a real schema file (plural names like `wards` resolve to singular schemas), `affectedApps[]` is a subset of the three apps, `severity` is S0..S4, `priority` is P0..P4, `explainedIn` is a real file under `06-changes/`. Also checks every `extensions/registry.json` entry: `source` shaped `<app>/.contract/extensions/<app>.json`, an `app` matching the key, and, when the app repo is visible, the registered sha256 hash. Also checks every PRD pointer's `contractRefs` block: each collection, field and enum a PRD names must still exist in the schemas and in `enums.json` | After every change to the manifest, the registry or a PRD pointer. `AGENTS.md` section 6 gate 2 | `manifest consistent`, or `manifest consistent (no manifest yet)` when the manifest does not exist yet |
| `build-schemas.ts` | Writes `02-contracts/collections/.composed/<name>.schema.json` (plain: core properties with enum refs inlined, registered extension properties merged, permissive) and `<name>.strict.schema.json` (strict: `allOf` + `unevaluatedProperties: false` with extensions, core + `additionalProperties: false` with zero extensions) | After any schema, enum or registry change, and before validating documents against the contract | `composed schemas built: <n> collections, <n> extension merge(s), <n> files in 02-contracts/collections/.composed` |
| `check-adoption.ts` | Reads the app repo's `.contract/adopted.json`, the registry and the manifest. Reports per app: pinned contractVersion vs the current `VERSION`, adopted vs pending manifest entries, progress as `adopted / (adopted + pending)` with the rule that an app with no checklist shows 0%, not 100%. Reads both `coreChanges` and `extensionChanges`. With `--write`, it regenerates section 1 of `06-changes/impact-matrix.md` from the manifest and the adoption records, between the `BEGIN GENERATED` and `END GENERATED` markers | In each app's CI and before any release of an affected app | `adoption check passed: no app is behind on an S0 or S1 change`. Exits 1 listing every gap when an affected app is behind on an S0 or S1 entry |
| `sync-contract.ts` | Copies `02-contracts/`, `03-rules/`, `05-decisions/` into the app repo's `.contract/vendor/` and writes `.contract/fingerprint.json` with a sha256 per copied file. It removes the previous vendor copy first and writes no timestamp, so the same contract always produces the same bytes | In the app repo after pulling a new contract version, and to prove what the app was built against | `contract synced into <path>`, one `synced <folder> (n files)` line per folder |
| `bump-contract.ts` | Rewrites the app repo's `.contract/adopted.json` with a new `contractVersion` and/or `extensionVersion`, preserving the per-change adoption records, and prints a diff-style summary | In the app's adoption PR, after adopting a contract change | `adoption record bumped` with `- / +` lines for every version that moved, or `no change: ...` when already at the requested versions |
| `export-dart-constants.ts` | Reads `constants.json` and writes `lib/generated/app_constants.dart` into the app repo: `class AppConstants` with `static const` members, SCREAMING_SNAKE keys as camelCase names, values that contain `$` or `\` as raw Dart strings | In the app repo after any constants change | `dart constants exported` |
| `export-ts-constants.ts` | Reads `constants.json` and writes `lib/generated/app_constants.ts` into the app repo: `export const GPS_INTERVAL_SEC = 10;` style, keys kept in SCREAMING_SNAKE, string arrays as `as const` | In the app repo after any constants change | `ts constants exported` |
| `lib.ts` | Shared helpers: repo paths from `import.meta.url`, JSON readers that never crash silently, the plural-to-singular collection resolver, the `$ref` collector, the constants flattener and type checker, the frontmatter reader and the `contractRefs` parser | Never run directly | Not applicable |
| `check-tables.py` | Checks every markdown table in the repository. A table is well formed when every row has the same number of pipe separators as its header. A malformed table renders as a broken grid, and a harness reading it gets the wrong column mapping | In CI, and after any batch of markdown edits | `check-tables: all markdown tables are well formed`. Prints `TABLES=<n> MALFORMED=<n>` |
| `check-links.py` | Checks every relative markdown link. A broken link in a harness-facing document is worse than no link, because the agent follows it, finds nothing, and either invents the file or concludes the contract does not exist. Targets containing an angle-bracket placeholder are templates and are skipped | In CI, and after any file move or rename | `check-links: every relative markdown link resolves`. Prints `LINKED=<n> BROKEN=<n>` |

Every generated file starts with `// GENERATED FILE. DO NOT EDIT.`

## 3. Exit codes

| Exit | Meaning |
|---|---|
| 0 | The check passed and the success line was printed |
| 1 | The check failed. The first stderr line names the tool and the error count, then one `- ` line per specific error |

## 4. Where the tools read and write

| Path | Read or written by | Notes |
|---|---|---|
| `02-contracts/**` | Read by all | `build-schemas.ts` also **writes** `02-contracts/collections/.composed/`, nothing else is written there |
| `03-rules/`, `05-decisions/` | Read by `sync-contract.ts` | Vendored into the app repos |
| `06-changes/manifest.json` | Read by `check-consistency.ts` and `check-adoption.ts` | Missing is fine: consistency reports `(no manifest yet)` and adoption has nothing to be behind on |
| `06-changes/adoption.json` | Read by `check-adoption.ts --write` | The platform's report of the three apps. An app's own file wins when the app repo is checked out next to this one |
| `01-prds/*.md` | Read by `check-consistency.ts` | The frontmatter's `contractRefs` block. Every collection, field and enum a PRD names must exist |
| `VERSION` | Read by `check-adoption.ts`, `sync-contract.ts`, the exporters | The contract version every tool reports |
| `<app repo>/.contract/adopted.json` | Read by `check-adoption.ts`, rewritten by `bump-contract.ts` | The app owns this file. Never edit it on the app's behalf |
| `<app repo>/.contract/vendor/`, `.contract/fingerprint.json` | Written by `sync-contract.ts` | Generated, safe to delete and re-sync |
| `<app repo>/lib/generated/app_constants.*` | Written by the exporters | Generated, safe to delete and re-export |
| `<app repo>/.contract/extensions/<app>.json` | Read by `check-consistency.ts` and `build-schemas.ts` | Lives in the app repo. The registry `source` paths resolve against the folder that holds the platform repo and the app repos side by side |

## 5. What belongs here and what does not

| Belongs | Does not belong |
|---|---|
| Checks over the contract, the manifest, the registry and adoption records | Firebase or gcloud scripts. Deployment is a human action |
| Code generators whose output starts with a DO NOT EDIT header | Anything that edits an app's extension file. The app owns it |
| Deterministic generators (same input, same bytes) | Anything with secrets. This repo holds none |
