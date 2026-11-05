---
id: platform-readme
title: Safai Saathi Platform
status: active
owner: platform-owner
updated: 2026-11-03
contractVersion: "2.3.0"
audience: both
see_also:
  - ./AGENTS.md
  - ./00-context/product-overview.md
  - ./02-contracts/README.md
  - ./07-guides/README.md
  - ./10-handoff/README.md
---

# Safai Saathi Platform

**The shared contract for three apps: `driverapp`, `userapp`, `adminpanel`.**

One Firebase project. One Firestore database. One rules file. One Functions deployment. **One contract that says exactly what every collection, field, enum, constant, claim, topic and callable is.**

## The problem this solves

**Three apps on one backend will invent three contracts.** Each app will name a field its own way, each will use its own enum value, each will hardcode its own copy of a threshold. The failure is not a crash. **The failure is two apps that both work, disagreeing about what the data means.**

This repo makes the contract machine-readable, so the disagreement is caught by CI instead of by a citizen.

| The human question | The human answer | The machine question | The machine answer |
|---|---|---|---|
| *"Who is affected by this change?"* | Read `06-changes/impact-matrix.md` | *"Did they implement it?"* | `08-tools/check-adoption.ts` |

## The reading order

**The folders are numbered on purpose.** A harness reads them in order and stops when it has the answer.

| # | Folder | What it is | Read it when |
|---|---|---|---|
| 00 | [`00-context/`](00-context/) | The "why". The product, the boundaries, the glossary, onboarding | You are orienting yourself |
| 01 | [`01-prds/`](01-prds/) | The product specs. One canonical platform PRD, three pointers | You need to know what the product should do |
| 02 | [`02-contracts/`](02-contracts/) | **THE MACHINE LAYER.** Schemas, enums, constants, claims, topics, callables, errors, tokens | **Always. This is the source of truth** |
| 03 | [`03-rules/`](03-rules/) | The security boundary. The rules, the indexes, the storage rules | You are changing who may do what |
| 04 | [`04-functions/`](04-functions/) | The server half. The decisions that need a live document | You are implementing a decision |
| 05 | [`05-decisions/`](05-decisions/) | The ADRs. Why it is this way, not another way | You want the reasoning |
| 06 | [`06-changes/`](06-changes/) | The change log. Who is affected, and have they caught up | You are shipping or adopting a change |
| 07 | [`07-guides/`](07-guides/) | **The harness guides.** How to do the thirteen actions | You are an AI harness doing a task |
| 08 | [`08-tools/`](08-tools/) | The scripts. Validate, check, build, sync, bump, export, scan | You need to verify something |
| 09 | [`09-reference/`](09-reference/) | The background. The audits, the blueprints, the issue register | You need the history |
| 10 | [`10-handoff/`](10-handoff/) | **The handoff.** One ready-to-paste prompt per app, for that app's harness | You are sending this repo to an app team |

## The three rules

### 1. The contract wins. The PRDs do not.

**If a PRD and the contract disagree, the contract wins for the shape and the PRD wins for the intent.** If the PRD names a field that does not exist, that is a contract request, not a licence to invent the field.

### 2. The client never names its own scope

**Every scope comes from a claim the server minted from a document the client cannot edit.** The badge code is printed on the van. The `deviceId` is on the citizen's own phone. Both are client-controlled, so neither can be the authorization boundary.

### 3. The server sends a reason code. The client owns the words

**Never English text from the server.** Three apps, three sets of arb files, one server. The reason-code vocabulary is in [`02-contracts/errors.json`](02-contracts/errors.json).

## The three apps

| App | Stack | Repo | Auth | What it touches |
|---|---|---|---|---|
| **driverapp** | Flutter, Android | `safaaisaathi/driverapp` | Anonymous, then `bindDeviceToVan` | 9 collections, 4 callables |
| **userapp** | React 18 + Vite PWA, Web + Android | `safaaisaathi/userapp` | Anonymous, then `bootstrapUserSession` | 9 collections, 4 callables |
| **adminpanel** | React 18 + Vite, Web | `safaaisaathi/adminpanel` | Email, then `mintStaffToken` | 12 collections, 7 callables |

**All three apps depend on this repo. This repo never depends on an app repo.** That one-way direction is what makes the contract authoritative.

**The stack column is the truth, not the PRD.** The user app's PRD says Flutter. The code is React. The office decides, and the change is CHG-0016. **The admin panel is React + Vite, not Next.js**, despite what its own README says.

## The handoff

**This repo is finished. The next step is three app harnesses.**

| File | What to do with it |
|---|---|
| [`10-handoff/PROMPT-driverapp.md`](10-handoff/PROMPT-driverapp.md) | Paste into the driver app's harness |
| [`10-handoff/PROMPT-userapp.md`](10-handoff/PROMPT-userapp.md) | Paste into the user app's harness |
| [`10-handoff/PROMPT-adminpanel.md`](10-handoff/PROMPT-adminpanel.md) | Paste into the admin panel's harness |

**Each prompt is a complete brief.** It has the authority order, the hard constraints, the read budget, the step-by-step procedure, the traps, the verification commands and the report block. It names the changes that app must adopt, in order, with the acceptance check for each one.

**The harness runs in the app repo.** The platform repo has to be a sibling of it.

**One app per run.** Do not paste two prompts into one session.

## Getting started

### For an AI harness

**Read [`AGENTS.md`](AGENTS.md) first.** It has the authority order, the hard constraints, the read budget, the modes, the change procedure, the self-verification commands and the report format.

Then read [`07-guides/README.md`](07-guides/README.md). It is a router: *"if your task is X, read Y, then do Z"*.

### For a human

**Read [`00-context/onboarding.md`](00-context/onboarding.md).** It has the day-one checklist per role, the Firebase access rules, and the emulator caveats.

## The commands

```bash
node 08-tools/validate-contract.ts      # every schema is valid, every enum resolves
node 08-tools/check-consistency.ts       # the schema and the changelog agree
node 08-tools/check-features.ts          # every feature entry is valid and every ref resolves
node 08-tools/build-schemas.ts           # compose the strict runtime schemas
node 08-tools/sync-contract.ts <app>    # vendor the contract into an app repo
node 08-tools/scan-usage.ts <app>       # what does this app actually touch
node 08-tools/check-conflicts.ts <app|path>  # where does it disagree with the contract
node 08-tools/check-adoption.ts <app>   # which app is behind on which change
node 08-tools/sync-adoption.ts          # regenerate 06-changes/adoption.json from the app files
node 08-tools/check-adoption.ts --write # regenerate the impact matrix
```

**The first two are the gate.** They must pass before a contract change merges. See [`.github/workflows/contract-gate.yml`](.github/workflows/contract-gate.yml).

**The backend has its own build.**

```bash
cd 04-functions && npm run build   # tsc, strict mode. The deploy script builds first
cd 04-functions && npm test        # the Node test runner
```

**Why the build is first in the deploy.** `main` points at `lib/index.js`, which is the compiled output. Deploying without building uploads the **previous** build. That is how a function gets renamed in the source and stays the old one in production.

## The versioning

**One SemVer version, in [`VERSION`](VERSION).**

| Bump | When | Effect |
|---|---|---|
| MAJOR | A field is removed or renamed, a type changes, an enum value is removed, a required field is added | Every affected app must adopt it |
| MINOR | A field is added, an enum value is added, a callable or topic is added | Apps that care should adopt it |
| PATCH | A description changes, a constraint tightens, a typo | No app action |

**The severity is a separate axis.** `S0` to `S4` says how dangerous. `P0` to `P4` says how many people it lands on. The full matrix is in [`02-contracts/severity-policy.md`](02-contracts/severity-policy.md).

## The extension model

**A field only one app uses is an extension, not a core change.** The app authors it in its own repo, the platform registers it with a hash, and **no other app gets a version-bump PR for a change that affects none of them.**

**If two apps must agree on the meaning, it is core.** See [`02-contracts/extensions/README.md`](02-contracts/extensions/README.md).

## The change process

| Step | Who | Where |
|---|---|---|
| Propose | Any app owner | [`06-changes/templates/contract-request.md`](06-changes/templates/contract-request.md) |
| Classify and decide | The platform owner | [`02-contracts/severity-policy.md`](02-contracts/severity-policy.md) |
| Implement | The platform owner | The contract file |
| Record | The platform owner | `manifest.json` AND a `CHG-*.md` file, together |
| Adopt | Each affected app owner | `.contract/adopted.json` in their own repo |
| Verify | CI | `08-tools/check-adoption.ts` |

**The rule that makes the log useful.** *An app with no checklist shows 0%, not 100%.* A change that nobody has written down what to do for has not been done.

## The current state

| What | State |
|---|---|
| Contract version | `2.1.0` |
| Next release | `2.2.0` when the next capability lands. `2.0.0` was the breaking one, the rules rewrite; `2.1.0` added the `flagMockLocation` callable |
| Collections documented | 18 |
| Frozen enums | 11 |
| Shared constants | 35 |
| Custom claims | 8 |
| FCM topics | 4 |
| Callables specified | **23. 16 callables and 7 server functions. All 23 are built** |
| Reason codes | 10 |
| Registered extensions | 2. `driverapp` owns `trips.id`. `userapp` owns the five app-only `collectionFeedback` fields |
| Feature entries | 5. The cross-app journeys, with each app's slice and what is still missing |
| Apps wired | 1 of 3. `driverapp` has a vendored copy, a fingerprint and a real adoption record. `userapp` and `adminpanel` have neither |
| Rules | **PHASE 1 is deployed, the loose one. PHASE 2, `firestore.strict.rules`, is written and waiting. The switch is `03-rules/README.md` section 5** |
| Backend copies | **One. It lives at `04-functions/`. The three copies in the app repos are deleted by CHG-0009** |
| Composite indexes | 4 exist. `vans(routeId,status)` and `complaints(wardId,createdAt)` are needed and missing |

**The one-page view is [`06-changes/impact-matrix.md`](06-changes/impact-matrix.md).** That is what you paste into a standup. Its section 1 is generated by `node 08-tools/check-adoption.ts --write`.

### The three P0s

| Change | What it is | By when |
|---|---|---|
| **CHG-0008** | One Firebase project. The user app is pointed at a project that does not exist | 2026-11-09 |
| **CHG-0011** | The server writes the ward duty board. A citizen can currently mark any ward as done | 2026-11-09 |
| **CHG-0012** | No raw phone in a readable document. Every staff member can currently read a complainant's number | 2026-11-09 |

## The repo rules

| Rule | Why |
|---|---|
| **Never merge.** A human merges | The contract is the boundary between three teams |
| **Never deploy.** Deployment is a human action | A rules deploy affects every app at once |
| **Never put a secret in this repo** | A Firebase client key is not a secret. A service account key is |
| **Never edit an app's extension file** | It lives in that app's repo. The platform registers it |
| **Never mark a change adopted for an app** | Adoption is that app's own CI, from its own PR |
| **Never edit `manifest.json` alone** | It and its `CHG-*.md` file change together |
| **Never bump `VERSION` with an unrelated edit** | The bump is a signal. Mixing it with noise teaches the team to ignore it |

## The ownership

| Path | Owner |
|---|---|
| `02-contracts/**` | Platform owner. **Locked** |
| `03-rules/**` | Platform owner. **Locked** |
| `04-functions/**` | Platform owner. **Locked** |
| `05-decisions/**` | Platform owner accepts. Anyone proposes |
| `06-changes/**` | Platform owner |
| `08-tools/**` | Platform owner |
| `09-reference/**` | Platform owner |
| `01-prds/PRD-*.md` pointers | Platform owner. **The canonical PRD is in the app's repo** |

**See [`.github/CODEOWNERS`](.github/CODEOWNERS).**

## One more thing

**This repo is for harnesses first.** Every guide has the same seven sections in the same order, every file has frontmatter, every path is real, and every command has an expected output. **An AI agent should be able to work in this repo without asking a human a question.**

That is the acceptance criterion: *a new developer, or a new agent, can build a feature from this repo alone.*
