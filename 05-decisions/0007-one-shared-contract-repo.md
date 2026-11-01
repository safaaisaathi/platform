---
id: adr-0007-one-shared-contract-repo
title: One shared contract repo for three apps
status: accepted
owner: platform-owner
updated: 2026-11-02
audience: harness
deciders: [platform-owner]
consulted: [driverapp-team, userapp-team, adminpanel-team]
informed: [office]
supersedes: null
supersededBy: null
see_also:
  - ../README.md
  - ../06-changes/README.md
  - ../02-contracts/README.md
  - ../09-reference/SHARED-REPO-blueprint.md
---

# One shared contract repo for three apps

## Context

Three apps are being built against one Firebase project, one Firestore database, one rules file and one Functions deployment. `driverapp` exists. `userapp` and `adminpanel` are being built on top of it.

**The failure mode is not a crash.** It is two apps that both work, disagreeing about what the data means.

| The failure | How it happened |
|---|---|
| `phone` versus `phoneMasked` | Two prose descriptions of the same field, no single source of truth |
| The 29-ward query cliff | A hardcoded `wardIds` list in one app, a different list in another |
| The `attachTrip` fix that "was done" | The code and the issue tracker disagreed, and nothing checked |

**All three are contract failures, not code failures.** A code review cannot catch them. A code review catches "this function is wrong". It does not catch "these two apps mean different things by the same word".

**The requirement is unusual in one specific way.** The deliverable is not shared code. It is shared **understanding**, made machine-checkable. Three teams, three AI harnesses, and a platform owner who is one person.

**Four shapes were considered.**

| Shape | What it means | The fatal problem |
|---|---|---|
| **Docs in a wiki** | One Notion or Confluence space with the contract | Nothing can check it. A field name cannot be validated by prose |
| **A monorepo** | One repo holding all three apps and the contract | Three apps, three tech stacks, three release cadences, one repo. The tool for "affected" in a monorepo is exactly the thing that does not work across repos, and here it would not even help |
| **A shared contract repo** | A fourth repo holding the contract, the rules, the Functions, the decisions and the change log | The platform owner becomes a bottleneck. The app repos and the platform can drift |
| **A published package** | The contract as an npm or pub package, versioned | A package carries CODE. A schema is data. And a published package needs a registry, a release process and a semver dance, for something that is 40 JSON files |

## Decision

**A fourth repo. `safaaisaathi/platform`.**

**The one-way dependency is the load-bearing part.**

```
driverapp ──┐
userapp ────┼──▶ platform ──▶ Firebase (one project)
adminpanel ─┘
```

**The platform never depends on an app repo.** If the platform imported anything from an app, a change in that app would silently change the contract for everyone.

### The two layers

| Layer | What it is | Enforceable? |
|---|---|---|
| **The machine layer** | JSON Schema 2020-12, `constants.json`, `enums.json`, `claims.json`, `topics.json`, `callables.json`, `errors.json`, `manifest.json` | **Yes. Checked in CI** |
| **The prose layer** | The PRDs, the ADRs, the guides, the explanations | No. Read by humans and by harnesses |

**The prose layer alone would not have prevented any of the three failures.** A schema says `"phoneMasked": { "type": "string", "pattern": "^[0-9]{2}X{4}[0-9]{2}$" }`. A PRD says *"the driver's phone is masked"*. Only the first can be checked by a machine.

### The four pieces, and why all four are needed

| # | Piece | What it answers | Where |
|---|---|---|---|
| 1 | **The contract** | What does a `complaints` document look like, exactly? | `../02-contracts/` |
| 2 | **The change record** | What changed, when, and what breaks? | `../06-changes/manifest.json` and the `CHG-*.md` files |
| 3 | **The adoption record** | Has each affected app caught up? | Each app's `.contract/adopted.json`, checked by `../08-tools/check-adoption.ts` |
| 4 | **The CI gate** | Stop a release that ships against an old contract | `../.github/workflows/contract-gate.yml` and each app's own CI |

**Drop any one and the system leaks.**

| Missing piece | What leaks |
|---|---|
| No contract | Two apps invent two field names. This already happened |
| No change record | A breaking change lands with no announcement. Nobody knows to look |
| No adoption record | "We told them" becomes "we hope they saw it". This is the F-20 class of bug, in team form |
| No CI gate | The adoption record is a spreadsheet that goes stale in two weeks |

### The split that makes it work

> **The human says "who is affected". The machine says "did they implement it". Never the reverse.**

| The human question | The human answer | The machine question | The machine answer |
|---|---|---|---|
| *"Who is affected by this change?"* | Read `../06-changes/impact-matrix.md` | *"Did they implement it?"* | `../08-tools/check-adoption.ts` |

**The first is a conversation. The second is a file diff. Only the second scales past three people.**

### The vendoring model

**The contract is copied into each app repo, not installed from it.**

| | Why |
|---|---|
| `.contract/vendor/02-contracts/` | The harness can read it locally, with no network and no setup |
| `.contract/fingerprint.json` | The sha256 of every vendored file. The app's CI proves its copy is current |
| `../08-tools/sync-contract.ts` | One command to refresh it |

**A git submodule was rejected.** It needs `git submodule update` before anything works, it breaks on a fresh clone without it, and an AI harness that forgets the command reads an empty directory and concludes the contract does not exist.

### The tool verdict

**No single open-source tool does cross-repo contract impact plus adoption for a Firestore contract.** The tools that come closest each solve one half.

| Tool | What it does | Why it is not the answer |
|---|---|---|
| **JSON Schema 2020-12** | Validates documents against a contract | It is the contract format. It says nothing about impact |
| **Renovate** | Opens a version-bump PR when a dependency changes | It bumps a version. It does not know that a version bump means "a field was renamed" |
| **Pact** | Consumer-driven contract testing | **The mental model is right and the transport is wrong.** Pact is HTTP-shaped. Firestore calls are not HTTP contracts |
| **Nx `affected`** | Computes which projects a change touches | **Single-repo only.** The whole problem here is cross-repo |
| **Turborepo `--affected`** | The same, for a JS monorepo | Same limitation. And it is a JS monorepo tool in a Flutter-plus-React project |
| **Firebase Data Connect** | A tool-enforced typed contract with generated SDKs | Attractive. See ADR 0001. It requires migrating off raw Firestore, which is far too big right now |
| **Backstage** | A service catalogue, ownership, a discovery API | An enterprise service catalogue for three apps and one person. Overkill |

**The chosen combination.**

| Part | Tool |
|---|---|
| The contract format | **JSON Schema 2020-12**, with `ajv` and `ajv-formats` |
| The impact computation | **A small CI script.** `../08-tools/check-consistency.ts` and `check-adoption.ts` |
| The cross-repo version bump | **Renovate**, pointed at the app repos |
| The mental framework | **Pact's consumer/provider model.** The app is the consumer, the platform is the provider, and the contract is the pact |
| The breaking-change detection | **Buf's pattern.** A machine diff of the old schema against the new one, so a field removal is a diff, not a judgement call |
| The rules testing | **`@firebase/rules-unit-testing`**, with the 17-probe approach the audit already proved |
| The decision records | **MADR** |
| The documentation shape | **Diátaxis** |

**The industry norm is that the contract testing is the hard part, and it is done with a small bespoke script, not a product.** That is what this repo does.

## Consequences

### Good

| Consequence | Why it matters |
|---|---|
| The field names have exactly one definition | `phone` versus `phoneMasked` cannot recur |
| The enum values have exactly one definition | A schema `$ref`s `enums.json`, so there is one copy of `"urban"` |
| The constants have exactly one definition | The Dart side and the Function side cannot drift on the tracking interval |
| "Who is affected" is a table | `../06-changes/impact-matrix.md` |
| "Did they implement it" is a file | Each app's `.contract/adopted.json`, checked by CI |
| A stale PRD is caught | The PRD pointer's `contractRefs` block names real fields. CI checks them |
| The reasoning survives the people | The ADRs and the change entries |
| The harness does not need a human | Every guide has seven sections, every path is real, every command has an expected output |
| The toolchain is five small scripts | No framework to learn, no build step, no daemon |

### Bad

| Cost | Why it hurts | The mitigation |
|---|---|---|
| **A fourth repo to clone** | Every teammate sets up one more thing | The onboarding checklist is one page |
| **The platform owner is a bottleneck** | Every core change needs one person | The extension model. A field only one app uses never needs the platform owner |
| **The app's copy and the platform's copy can drift** | Two copies of the same files | `.contract/fingerprint.json`. The app's CI recomputes the hash and fails |
| **The vendored copy is a copy** | It can go stale in a way a package cannot | Same answer. The fingerprint is the check |
| **The change log needs discipline** | A manifest entry without an explanation file is a leak | The CI gate pairs them. `manifest.json` and its `CHG-*.md` file must change together |
| **The severity classification is a judgement** | Someone has to decide S1 versus S2 | The policy is written down in `../02-contracts/severity-policy.md` with a matrix, so the judgement is at least consistent |
| **An extension registry is a bottleneck too** | Registering an extension needs the platform owner | One line. The hash is the enforcement, not the review |

**The honest summary.** *This repo makes the contract one place and the changes visible. It does not make anyone implement them. The adoption gate is what makes it stick, and the gate only works if each app runs it.*

## Alternatives considered

| Alternative | What it would have given | Why rejected |
|---|---|---|
| **A wiki** | A readable home for the contract | Nothing can check it. The whole failure class is unchecked prose |
| **A monorepo** | One clone, one CI, `affected` works | Three apps, three stacks, three release cadences. The cross-repo problem becomes a cross-team problem inside one git history, which is worse because it blocks unrelated PRs |
| **A published npm and pub package** | Versioned, dependency-managed, "npm install the contract" | A package carries code. A schema is data. And it needs a registry and a release process for 40 JSON files |
| **Firebase Data Connect** | A tool-enforced typed contract with generated SDKs | See ADR 0001. Attractive, too big right now |
| **Pact, properly** | Real consumer-driven contract testing | It is HTTP-shaped. Firestore rules and custom claims are not HTTP contracts. **The model was kept, the transport was not** |
| **Protobuf and Buf** | A machine-diffable schema with automatic breaking-change detection | A better schema format in one respect, the diffing. But protobuf needs code generation for a Dart and a React and a TypeScript consumer, and the claim and rules model is not part of a protobuf message anyway. **Buf's breaking-change pattern was kept. Its format was not** |
| **Do nothing. Three PRDs, three repos** | No new repo, no new process | This is what exists today, and it produced `phone` versus `phoneMasked`, the 29-ward cliff and the untested "fixed" label |

## References

| What | Where |
|---|---|
| The repo itself | `../README.md` |
| The harness contract | `../AGENTS.md` |
| The machine layer | `../02-contracts/README.md` |
| The change process | `../06-changes/README.md` |
| The extension model | `../02-contracts/extensions/README.md` |
| The vendoring tool | `../08-tools/sync-contract.ts` |
| The adoption gate | `../08-tools/check-adoption.ts` |
| The CI gate | `../.github/workflows/contract-gate.yml` |
| The original design record | `../09-reference/SHARED-REPO-blueprint.md` |
| The related decisions | ADR 0001 in `./index.md` |
