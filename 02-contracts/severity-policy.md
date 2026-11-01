---
id: severity-policy
title: Change Severity and Version Bump Policy
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: harness
see_also:
  - ./README.md
  - ../06-changes/README.md
  - ../06-changes/templates/CHANGE-template.md
---

# Change Severity and Version Bump Policy

**Every change to the contract carries a severity.** The severity decides how urgent it is, who must approve it, whether the CI gate blocks, and how the version is bumped.

## 1. The five levels

| Code | Name | What it is | Example |
|---|---|---|---|
| **S0** | **Emergency / Security** | A security hole is open, or data is being lost. Fix now, everything else stops | `firestore.rules` is loosened by accident. A driver's phone number becomes readable by any signed-in caller |
| **S1** | **Breaking** | The existing shape changed. An app that was correct is now wrong | `drivers.phone` is renamed to `drivers.phoneMasked`. `vans.currentTripId` is removed from the driver's writable set |
| **S2** | **New capability** | New work, backward compatible, but a consumer must do something | `complaints.assignedTo` is added, and the admin panel must show it |
| **S3** | **Additive** | Purely additive. Nobody has to do anything | An optional field is added. A new enum value is added. A new index is added |
| **S4** | **Internal** | The contract is unaffected | Docs, scripts, a refactor, a test |

## 2. What each level forces

| Level | Version bump | Gate behaviour | Approval | Window |
|---|---|---|---|---|
| **S0** | **PATCH or none** | **Every app is blocked** until the fix is deployed | Platform owner + one other | **Now** |
| **S1** | **MAJOR** | **The affected apps cannot release** until they adopt | Platform owner + **every affected app owner** | This week |
| **S2** | **MINOR** | Tracked, not blocking. A deadline is set | Platform owner + the affected app owner | Next sprint |
| **S3** | **MINOR** | Tracked only. No action | Platform owner | Whenever |
| **S4** | **None** | Nothing | Anyone | Whenever |

### 2.1 The S0 special case

**A security fix does not wait for a version bump.** The contract may not even change. What changes is the rules or a Function.

| Rule | Why |
|---|---|
| Deploy the fix **first** | The hole is open now. A version number does not close a hole |
| Record the change **in the same window, not later** | "I will write it up after" is how a security fix becomes an undocumented one |
| `manifest.json` gets `severity: "S0"` and `emergency: true` | The log must show that this one skipped the normal order |
| Every app is blocked until it confirms the fix | A client-side workaround may be needed, and only the app owner knows |

**A version bump is not what makes a change safe. The deployment is.**

## 3. Severity plus impact gives priority

**Severity says how dangerous it is. Impact says how many people it lands on.**

|  | 1 app | 2 apps | 3 apps |
|---|---|---|---|
| **S0** | P0 | P0 | P0 |
| **S1** | P1 | P1 | **P0** |
| **S2** | P2 | P2 | P1 |
| **S3** | P3 | P3 | P3 |
| **S4** | P4 | P4 | P4 |

**Worked example.** `drivers.phone` becomes `drivers.phoneMasked`.

| Field | Value |
|---|---|
| Severity | **S1 Breaking** |
| Affected apps | `driverapp`, `adminpanel` = **2** |
| Affected collections | `drivers`, `staffPhones` |
| Priority | **P1** |
| Gate | The driver app and the admin panel cannot release until they adopt |

## 4. The two urgency levels

**Severity is how dangerous. Urgency is how soon.**

| Urgency | Meaning | Gate |
|---|---|---|
| `immediate` | Needed now. The app cannot operate without it | **Blocks immediately** |
| `before_release` | Needed before the next release | The **release** is blocked. The PR is not |
| `scheduled` | A deadline is set | Tracked only |
| `optional` | Can be skipped | Tracked only |

**Why the release and the PR are separated.** If every S1 change blocked the pull request immediately, the team would start bypassing the gate. **A gate that gets bypassed is worse than no gate**, because it teaches the team to ignore the signal.

**An S1 change blocks the release of the affected apps.** It does not block an unrelated PR in the same repo.

## 5. The version bump rules

| Change | Bump |
|---|---|
| A field is removed or renamed | **MAJOR** |
| A field's type changes | **MAJOR** |
| A field becomes required that was optional | **MAJOR** |
| An enum value is removed | **MAJOR** |
| A field is added as optional | **MINOR** |
| An enum value is added | **MINOR** |
| A callable is added | **MINOR** |
| A topic is added | **MINOR** |
| A constraint tightens without removing anything | **PATCH** |
| A description or a comment changes | **PATCH** |
| Anything outside `02-contracts/` | **None**, unless it changes a contract |

**An extension change is not a core version bump.** An app's extension version moves on its own. See `extensions/README.md`.

## 6. The migration requirement

**An S1 or S2 change must carry a migration plan.** No plan, no merge.

The plan is a list of steps in `manifest.json`, under `migration.steps`. Each step is one thing somebody does.

**The order matters, and it is not always obvious.**

| Change | The order that works | The order that breaks |
|---|---|---|
| A field is renamed | Migrate the data, then deploy the rules, then release the clients | Deploy the rules first. Every read of the old field fails |
| A claim is added | Deploy the server half, then the clients, then the rules | Deploy the rules first. Every write is denied, and the failure looks like "the screen is empty" |
| An admin write becomes a callable | Deploy the callable, then the panel, then tighten the rules | Tighten the rules first. The panel's save button silently stops working |

**Rule of thumb.** *The server goes first. The clients go second. The rules tighten last.* The loose old rules keep the old clients working while the new ones are deployed.

## 7. The deprecation window

**A field is never removed in the same release that stops writing it.**

| Field | Meaning |
|---|---|
| `oldFieldReadableUntil` | The last date the old field can be read |
| `oldFieldWritableUntil` | The last date the old field can be written. `null` means it is already read-only |

**The window is at least one release cycle of the slowest affected app.** In practice, one sprint.

**Inside the window**, both the old and the new field are present on the document. The server writes the new one. The migration backfills the old one for the apps that have not migrated yet. **At the end of the window**, the old field is dropped and the version bumps MAJOR.

## 8. The checklist before you open the change request

| # | Check | If it fails |
|---|---|---|
| 1 | You have classified the severity using section 1 | Stop. Ask the platform owner |
| 2 | You have listed the affected apps | Stop. An unlisted app is an app that breaks silently |
| 3 | You have written the migration steps, in order | An S1 or S2 change cannot merge without them |
| 4 | You have checked the deprecation window | Stop. Never remove and stop writing in one release |
| 5 | The change touches `02-contracts/` | If not, the severity is S4 and no version bump happens |
| 6 | You have checked whether it should be an **extension** instead of a core change | `extensions/README.md`. A field only one app uses does not belong in the core |
