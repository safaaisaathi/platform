# SHARED REPO Blueprint — The Contract Repo for Driver + User + Admin

> **Reference copy. The design record for the repo you are reading.**
>
> This document was written as a blueprint for the shared contract repo, and then the repo was built. **This folder structure it describes (`contracts/`, `changes/`, `scripts/`, `rules/`) was replaced by the numbered folders (`00-context/` to `09-reference/`) that exist now.**
>
> **What is still true and worth reading:** the design thesis in section 0.2, the four pieces in section 0.3, the prose-versus-machine-layer split in section 1.2, the tool verdict in section 1.3, and the folder rationale in section 3.2.
>
> **What is superseded:** the folder tree, the script names, the file paths, and anything about the repo's structure. **The repo is the answer. This document is why it is shaped that way.**
>
> **The canonical record of the shape is the repo itself.** Start at `../README.md` and `../AGENTS.md`.

**Purpose**: The design of one common repository that all three Safai Saathi apps work against. It holds the PRDs, the machine-readable data contract, the Firestore rules, the decisions, and the change log that says **who is affected** by a change and **whether they actually implemented it**.

**Status**: Blueprint. Nothing in it is implemented except where a line says otherwise.

**Written**: 2026-11-01

**Companions**: `docs/BACKEND-GO-blueprint.md` (the authoritative backend contract), `docs/AUDIT2-flow-backend-ui.md` (the audit), `docs/PRD-2-driver-app.md` (the frozen driver PRD), `GLOSSARY.md` (the live project state).

**Audience**: the three app developers, and the AI harness each of them uses. If a teammate's AI harness can read this repo's machine-readable files, the harness works against the same contract you do.

---

## 0. What this document is, and who reads it

| Reader | Read this | Why |
|---|---|---|
| **You, the platform owner** | All of it | You own the contract and the change log |
| **A teammate starting a feature** | Section 4 (the contract files), then their app's `AGENTS.md` | They need the exact field names, not the prose |
| **A teammate's AI harness** | `AGENTS.md` at the root of this repo, then `contracts/` | The harness needs a deterministic file to read, not a doc it has to interpret |
| **The office / product** | Sections 1 and 5 | "What changed and who needs to do something about it" |
| **You, six months from now** | Section 12 (risks) and section 5.3 (the change record) | The change log is the institutional memory |

### 0.1 The one-line version

*One repo holds the contract. The contract is machine-readable. Every change to the contract is recorded once, in a format that says who it breaks. Each app proves, in CI, that it has caught up.*

### 0.2 The design thesis

**The human says "who is affected". The machine says "did they implement it". Never the reverse.**

This split is the whole design. It comes from one observation about how cross-team work actually fails:

| Failure mode | Who catches it | When |
|---|---|---|
| "We changed the `trips` document, does anyone read `gpsTrail`?" | **A human**, by reading code | At review time, if someone remembers to ask |
| "We renamed `complaints.phone` to `phoneMasked`. Did the admin panel update?" | **A machine**, by comparing the contract version in each repo | In CI, on every PR |

The first is a conversation. The second is a file diff. **Only the second scales past three people.**

### 0.3 The four pieces, and why all four are needed

| # | Piece | What it answers | Where |
|---|---|---|---|
| **1** | **The contract** | What does a `complaints` document look like, exactly? | `contracts/` |
| **2** | **The change record** | What changed, when, and what breaks? | `changes/` |
| **3** | **The adoption matrix** | Has each affected app caught up? | `changes/adoption.json` |
| **4** | **The CI gate** | Stop a PR that ships against an old contract | Each app repo's workflow |

**Drop any one and the system leaks.**

| Missing piece | What leaks |
|---|---|
| No contract | Two apps invent two field names. This already happened: `phone` vs `phoneMasked` |
| No change record | A breaking change lands with no announcement. Nobody knows to look |
| No adoption matrix | "We told them" becomes "we hope they saw it". This is the F-20 class of bug, in team form |
| No CI gate | The adoption matrix is a spreadsheet that goes stale in two weeks |

---

## 1. The verdict

### 1.1 Is a common repo the right shape?

**Yes.** For three apps on one Firebase project with one Firestore database, one shared contract repo is the correct shape. This is the same shape the industry's own Firebase guidance settles on.

### 1.2 Is sharing docs enough?

**No, and this is the important correction.** A teammate's AI harness can read a Markdown PRD and write code that mostly matches. But "mostly matches" is exactly the failure mode that produced the audit findings:

| Symptom | Root cause |
|---|---|
| The 29-ward query cliff | A hardcoded `wardIds` list in one app, a different list in another |
| `phone` vs `phoneMasked` | Two prose descriptions, no single source of truth |
| The `attachTrip` fix that "was done" | The code and the issue tracker disagreed, and nothing checked |

**A prose document cannot be enforced. A schema can.** So the common repo has two layers:

| Layer | What it is | Enforceable? |
|---|---|---|
| **The prose layer** | PRDs, blueprints, ADRs, explanations | No. Read by humans and by AI harnesses |
| **The machine layer** | JSON Schema, `constants.json`, `enums.json`, `claims.json`, `changes/manifest.json` | **Yes. Checked in CI** |

**The prose layer is what your teammate's AI harness reads. The machine layer is what stops the build.** Both are needed. The prose alone is a suggestion.

### 1.3 Is there an open-source tool that does this whole thing?

**No single tool does it.** But every part has a good tool, and the parts fit together. The full verdicts with reasons are in section 10.

**The short version:**

| Need | Tool | Verdict |
|---|---|---|
| The contract format | **JSON Schema draft 2020-12** | **Use.** Cross-language, one standard, validators for Dart and TS |
| Cross-repo version bumps | **Renovate** | **Use.** Opens the "bump the contract" PR in each app repo |
| Adoption checking | **A small CI script** (about 150 lines) | **Write it.** No tool does it for a Firestore contract |
| The mental model | **Pact's** consumer-provider model | **Adopt the idea.** Its tool is HTTP-only, so it cannot verify a Firestore contract directly |
| ADR format | **MADR** | **Use.** The format for `decisions/` |
| Rules testing | **`@firebase/rules-unit-testing`** | **Use.** Already the plan in the audit |

### 1.4 The one thing that makes this work

**The contract must be versioned, and each app must pin a version.**

Without a pinned version, "did they implement it" has no answer. There is nothing to compare against.

---

## 2. The four repos

### 2.1 The shape

```
safaaisaathi/
├── platform/        ← THE COMMON REPO. The contract, the rules, the change log.
├── driverapp/       ← exists today. Flutter. Android.
├── userapp/         ← teammate 1. Flutter. Android + iOS.
└── adminpanel/      ← teammate 2. React / Next.js. Web.
```

### 2.2 What each one owns

| Repo | Owns | Never owns |
|---|---|---|
| **`platform`** | The contract, the rules, the indexes, the constants, the decisions, the change log, the CI gate definition | Application code. No screen, no widget, no repository |
| **`driverapp`** | The driver screens, the tracking engine, the offline buffer, the driver app's arb files | The schema. It consumes the contract |
| **`userapp`** | The citizen screens, the ward resolution, the FCM subscription, the complaint flow | The schema |
| **`adminpanel`** | The staff screens, the call list, the notice composer, the staff management | The schema |

**The one-way dependency.** `platform` never depends on an app repo. **Apps depend on `platform`.** That direction is what makes the contract authoritative.

```
driverapp ──┐
userapp ────┼──▶ platform (contract v1.2.0) ──▶ Firebase (one project)
adminpanel ─┘
```

### 2.3 One Firebase project, three registered apps

**This does not change.** The common repo is about **source code and contracts**, not about the backend. The backend stays one project.

| Thing | Value | Where it lives |
|---|---|---|
| Firebase project | `safaaisaathi-63a87` | `.firebaserc` in `platform` (and in each app, if they deploy) |
| Driver app registration | `1:179594621556:android:8bdac1de2d29745aad1721` | `lib/firebase_options.dart` |
| User app registration | **To be created** by the user-app teammate | `lib/firebase_options.dart` in `userapp` |
| Admin panel registration | **To be created** by the admin teammate | `NEXT_PUBLIC_FIREBASE_*` env vars |

**What moves to `platform` and what stays in the app repos.**

| Artifact | Home | Why |
|---|---|---|
| `firestore.rules` | **`platform`** | One rules file. If it lives in three repos, it is three rules files |
| `firestore.indexes.json` | **`platform`** | Same reason. A missing index in one app breaks another app's query |
| `firebase.json` | **`platform`** | The emulator config. **Today it is gitignored** (`.gitignore:53`), which is why a fresh clone has no emulator |
| `functions/` | **`platform`** | One Functions deployment. The three apps call the same callables |
| `contracts/` | **`platform`** | The contract |
| `firebase_options.dart` | **Stays in each app** | It is per-app. The config values differ per registration |
| `.env` / `.env.example` | **Stays in each app** | Per-app build defines |

**The rules decision matters more than it looks.** *The rules are the security boundary for all three apps.* If the driver app's rules live in `driverapp` and the admin panel's rules live in `adminpanel`, then "the rules" is not one artifact and there is no single security review. **One rules file, one owner, one PR.**

### 2.4 What the user and admin teammates get on day one

**They do not need to be given a backend. They need to be given a contract.**

| They need | Where it comes from |
|---|---|
| The collection and field names | `platform/contracts/schema/*.schema.json` |
| The enum values | `platform/contracts/enums.json` |
| The constants | `platform/contracts/constants.json` |
| The claim names | `platform/contracts/claims.json` |
| The exact rules their app lives under | `platform/rules/firestore.rules` |
| The callables they may call, with input and output | `platform/contracts/callables.json` |
| The FCM topics they subscribe to | `platform/contracts/topics.json` |
| The indexes their queries need | `platform/rules/firestore.indexes.json` |
| The "why", for their AI harness | `platform/prds/` and `platform/decisions/` |
| The project id and the web config | The project console. **The config is not a secret** |

**The full onboarding walkthrough, with the key-sharing rules, is in `BACKEND-GO-blueprint.md` section 2.5.** This document does not repeat it. Read section 2.5 there if you are the user-app or admin-panel developer.

---

## 3. The folder-by-folder contents of the common repo

### 3.1 The tree

```
platform/
├── AGENTS.md                    ← what every AI harness reads first
├── README.md                    ← the human entry point
├── CHANGELOG.md                 ← the human-readable change log
│
├── prds/                        ← the three product specs, plus the cross-cutting one
│   ├── PRD-0-platform.md         ← what "the platform" is, the shared rules
│   ├── PRD-1-user-app.md
│   ├── PRD-2-driver-app.md
│   └── PRD-3-admin-panel.md
│
├── contracts/                   ← THE MACHINE LAYER. This is the important folder.
│   ├── schema/                  ← one JSON Schema per collection
│   │   ├── ward.schema.json
│   │   ├── route.schema.json
│   │   ├── van.schema.json
│   │   ├── trip.schema.json
│   │   ├── complaint.schema.json
│   │   ├── notice.schema.json
│   │   ├── rating.schema.json
│   │   ├── staff.schema.json
│   │   ├── staffPhone.schema.json
│   │   ├── driver.schema.json
│   │   ├── vanDevice.schema.json
│   │   └── trailChunk.schema.json
│   ├── constants.json           ← every number that must match everywhere
│   ├── enums.json               ← every frozen enum, and where it is used
│   ├── claims.json              ← the custom claim names, and who mints them
│   ├── topics.json              ← the FCM topic map
│   ├── callables.json           ← every callable, its input, its output, its reason codes
│   └── errors.json              ← the reason-code vocabulary
│
├── rules/                       ← the security boundary. One owner.
│   ├── firestore.rules
│   ├── firestore.indexes.json
│   ├── storage.rules
│   └── firebase.json
│
├── functions/                   ← the Cloud Functions source
│   └── src/
│
├── decisions/                   ← the ADRs. Why it is the way it is.
│   ├── 0001-backend-is-firebase-not-a-custom-server.md
│   ├── 0002-rules-scope-by-claims-not-by-signed-in.md
│   ├── ...
│   └── index.md
│
├── changes/                     ← THE CHANGE LOG. Section 5.
│   ├── manifest.json            ← the machine-readable list of every change
│   ├── adoption.json            ← who has caught up
│   ├── CHANGELOG.md             ← the human-readable version
│   └── templates/
│       ├── change.md            ← the explanation template
│       └── breaking.md
│
├── scripts/                     ← the tools. Small, readable, boring.
│   ├── validate-contract.ts     ← every schema is valid, every doc matches
│   ├── check-adoption.ts        ← the CI gate
│   ├── bump-contract.ts         ← pin a new contract version in an app repo
│   └── export-dart-constants.ts ← generate the Dart constants file
│
└── .github/workflows/
    ├── contract-gate.yml        ← runs on the contract repo itself
    └── release.yml              ← tags a version when the contract changes
```

### 3.2 Why these folders and not others

| Folder | The test it passes | Why not somewhere else |
|---|---|---|
| **`prds/`** | A teammate's AI harness needs to know *what the product is* before it writes code | In each app repo, the three PRDs drift apart. The PRD is a **cross-team artifact** |
| **`contracts/`** | The field names must have exactly one definition | In app repos, each app redefines them. This is how `phone` vs `phoneMasked` happened |
| **`rules/`** | The security boundary must have one owner and one review path | In three repos, there are three boundaries, and only one of them is tested |
| **`decisions/`** | "Why did we do it this way" survives the people who did it | In a chat log, it does not survive one week |
| **`changes/`** | "Who is affected and did they do it" must be queryable | In a spreadsheet, it is not in the same repo as the thing it describes |
| **`scripts/`** | The enforcement must be code, not a policy statement | If the gate is a person remembering to run it, it is not a gate |

**The rule about what does NOT go in the common repo.** *No application code. No screens. No widgets. No arb files. No repositories.* If a teammate asks "should this button be in the common repo", the answer is no, because a shared UI component across a Flutter app and a React app is not shared, it is duplicated with extra steps. **The contract is shared. The code is not.**

### 3.3 The `prds/` folder

| File | What it is | Source |
|---|---|---|
| `PRD-0-platform.md` | **New.** The cross-cutting spec. The shared rules, the shared vocabulary, the definition of the platform's boundaries | New. Does not exist today |
| `PRD-1-user-app.md` | The citizen app spec | From the user-app teammate |
| `PRD-2-driver-app.md` | The driver app spec. **Frozen** | **Already exists** in `driverapp/docs/` |
| `PRD-3-admin-panel.md` | The admin panel spec | From the admin teammate |

**The PRD move, and its one risk.** Moving `PRD-2-driver-app.md` into `platform/prds/` means the driver repo no longer owns its own spec. **The risk is that the spec becomes a shared file nobody updates.** The mitigation is in section 7: the contract gate checks that every app's `AGENTS.md` points at a pinned contract version, and a PRD change triggers a contract review if it touches the schema.

**The pragmatic option.** If moving the PRD feels disruptive, keep `PRD-2-driver-app.md` in `driverapp/docs/` and put a **pointer** in `platform/prds/`:

```
platform/prds/PRD-2-driver-app.md
---
title: Driver App PRD
canonical: true
source: https://github.com/safaaisaathi/driverapp/blob/main/docs/PRD-2-driver-app.md
pin: v1.4.0
---
```

**This is the recommended version for week one.** A pointer file costs nothing, it does not break anyone's muscle memory, and it gives the contract repo a single index of every PRD. Move the files later if the team wants one physical location.

### 3.4 The `decisions/` folder, and the ADR format

**An ADR (Architecture Decision Record) records one decision, its context, and its consequences.** It is immutable once accepted. A change of mind is a new ADR that supersedes the old one.

**Use MADR** (Markdown Architectural Decision Records). It is the most widely used format, it is plain Markdown, and an AI harness reads it without a parser.

```
decisions/
├── index.md              ← a table of every ADR, with its status
├── 0001-backend-is-firebase-not-a-custom-server.md
├── 0002-rules-scope-by-claims-not-by-signed-in.md
├── 0003-admin-writes-go-through-callables.md
├── 0004-first-claim-van-binding.md
├── 0005-masked-phone-only.md
├── 0006-device-id-is-a-claim.md
└── ...
```

**The MADR template, filled in.**

```markdown
# Backend is Firebase, not a custom server

## Status
Accepted. 2026-11-01. Supersedes nothing.

## Context
Three apps need to share one Firestore database, with rules that scope
reads and writes by identity. The team considered a custom Node backend
with its own session layer.

## Decision
Use Firebase. Firestore for data, Firestore Rules for authorization,
Cloud Functions for decisions, Auth for identity, FCM for push.

## Consequences
Good: no session layer to build, no sync protocol to design, realtime
listeners are free, the emulator enforces the rules locally.
Bad: the rules language is limited, which is why live-document checks
must live in Functions (ADR-0003). Firestore's 30-disjunction limit
constrains large rule blocks (see the 29-ward cliff).

## Alternatives considered
Custom Node server: rejected. It adds a session layer, a sync protocol
and an auth implementation, for no gain at three-app scale.
```

**The six ADRs that already exist as decisions** in the Q1 to Q7 answers and the blueprint. **Write them before the code**, not after. Six files, one afternoon.

**The `index.md` is the point.** One table, so a teammate's AI harness can read the whole decision set in one file:

| ADR | Title | Status | Date |
|---|---|---|---|
| [0001](../05-decisions/0001-backend-is-firebase-not-a-custom-server.md) | Backend is Firebase, not a custom server | Accepted | 2026-11-01 |
| [0002](../05-decisions/0002-rules-scope-by-claims-not-by-signed-in.md) | Rules scope by claims, not by "is signed in" | Accepted | 2026-11-01 |
| [0003](../05-decisions/0003-admin-writes-go-through-callables.md) | Admin writes go through callables | Accepted | 2026-11-01 |
| [0004](../05-decisions/0004-first-claim-van-binding.md) | First-claim van binding | Accepted | 2026-11-01 |
| [0005](../05-decisions/0005-masked-phone-only.md) | Masked phone only | Accepted | 2026-11-01 |
| [0006](../05-decisions/0006-device-id-is-a-custom-claim.md) | `deviceId` is a custom claim | Accepted | 2026-11-01 |

### 3.5 The `scripts/` folder

**Four scripts. Small, readable, boring.** Each one has one job and prints one clear pass or fail line.

| Script | What it does | When it runs |
|---|---|---|
| `validate-contract.ts` | Every schema file is valid JSON Schema. Every enum value in `enums.json` appears in the right schema. Every claim in `claims.json` is minted by exactly one callable | CI, on every PR to `platform` |
| `check-adoption.ts` | Reads the app's pinned contract version. Reads `changes/manifest.json` for the changes between that version and the latest. Checks the app's `adopted.json` file says it has caught up | CI, on every PR in each **app** repo |
| `bump-contract.ts` | Rewrites the app's `adopted.json` with the new version and opens a PR | Run by Renovate, or by hand |
| `export-dart-constants.ts` | Generates `lib/core/config/constants.g.dart` from `contracts/constants.json` | Run when the constants change |

**The `export-dart-constants.ts` script removes the need for the constants test in section 9.2 of the blueprint.** A generated file cannot drift from its source. A test that compares two hand-maintained files can, because someone will forget to run it.

<!-- APPEND-POINT-2 -->
