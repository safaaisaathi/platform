---
id: changes-readme
title: The Change Log
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: harness
see_also:
  - ./manifest.json
  - ./adoption.json
  - ./CHANGELOG.md
  - ../02-contracts/severity-policy.md
  - ../07-guides/making-a-contract-change.md
---

# The Change Log

**This folder answers two questions that a prose document cannot.**

| Question | Who answers it | File |
|---|---|---|
| *"Who is affected by this change?"* | **A human**, by reading the change entry | `manifest.json`, and the `CHG-*.md` file |
| *"Did they implement it?"* | **A machine**, by comparing versions in CI | `adoption.json`, checked by `08-tools/check-adoption.ts` |

**The order never reverses.** A machine tells you a version is behind. A human tells you what that means.

## 1. The four files

| File | What it is | Who reads it | Who writes it |
|---|---|---|---|
| `manifest.json` | The **machine-readable** list of every change. One entry per change | The CI tools, an AI harness | The platform owner |
| `CHG-<nnn>-<slug>.md` | The **complete explanation** of one change. Why, what breaks, who must do what, how to roll back | Humans, and an AI harness that needs the reasoning | The platform owner |
| `adoption.json` | **Who has caught up.** Per app, per change | The CI gate, the office | Each app, via its own PR |
| `CHANGELOG.md` | The **human-readable** version of the manifest | Humans browsing the repo | The platform owner |

**The rule.** *`manifest.json` and the `CHG-*.md` file change together. Never one alone.* If a change exists in the machine log but has no explanation, an AI harness can see what broke and not why. If it has an explanation but no manifest entry, the CI gate cannot see it at all.

## 2. The two kinds of change

| Kind | Who writes it | Scope | Lives in | Affects the core version? |
|---|---|---|---|---|
| **`CHG-nnn`** | The platform owner | The core contract. May affect many apps | `manifest.json` | **Yes** |
| **`EXT-nnn`** | An app owner | One app's extension | The app's own repo, plus a line in `manifest.json` | **No** |

**Why two kinds.** If every app's extension change bumped the core version, all three apps would get a version-bump PR for a change that affects none of them. The team would learn to ignore the bump PR, and then ignore the real one.

## 3. The change entry

Every entry in `manifest.json` has this shape.

```json
{
  "id": "CHG-0012",
  "title": "Mask the raw driver phone",
  "severity": "S1",
  "priority": "P1",
  "breaking": true,
  "date": "2026-11-01",
  "author": "platform-owner",
  "contractVersion": { "from": "1.0.0", "to": "1.1.0" },
  "affectedApps": ["driverapp", "adminpanel"],
  "affectedCollections": ["drivers", "staffPhones"],
  "affectedFields": [
    { "path": "drivers.phone", "change": "renamed", "to": "drivers.phoneMasked" }
  ],
  "migration": {
    "required": true,
    "steps": [
      "Copy drivers.phone into drivers.phoneMasked using the mask format",
      "Move the raw value into staffPhones/{code}",
      "Update the admin panel to read phoneMasked",
      "Update the driver app to read phoneMasked"
    ],
    "deadline": "2026-11-15"
  },
  "deprecation": {
    "oldFieldReadableUntil": "2026-11-15",
    "oldFieldWritableUntil": null
  },
  "explainedIn": "CHG-0012-mask-driver-phone.md",
  "supersedes": null
}
```

| Field | Required | What it means |
|---|---|---|
| `id` | Yes | `CHG-<nnn>` or `EXT-<nnn>` |
| `title` | Yes | One line. What changed, in plain words |
| `severity` | Yes | `S0` to `S4`. See `../02-contracts/severity-policy.md` |
| `priority` | Yes | `P0` to `P4`. Severity plus impact |
| `breaking` | Yes | `true` if an app that was correct becomes wrong |
| `date` | Yes | ISO date |
| `author` | Yes | Who wrote it |
| `contractVersion` | For a `CHG` | The version it moved from and to |
| `affectedApps` | Yes | Which apps must act. **The list that makes the gate work** |
| `affectedCollections` | Yes | Which collections the change touches |
| `affectedFields` | If fields change | The exact paths. Checked against the schema by CI |
| `migration` | For S1 and S2 | The ordered steps. **Without steps, an S1 change cannot merge** |
| `deprecation` | If a field is removed | The window. See the severity policy section 7 |
| `explainedIn` | Yes | The `CHG-*.md` file. Checked for existence by CI |
| `supersedes` | No | The id of the change this replaces |

## 4. The adoption record

```json
{
  "contractVersion": "1.0.0",
  "extensionVersion": "1",
  "coreChanges": {
    "CHG-0012": {
      "status": "in_progress",
      "urgency": "before_release",
      "progress": 0.5,
      "checklist": [
        { "task": "Read phoneMasked instead of phone", "done": true, "evidence": "PR 145" },
        { "task": "Show the masked phone on the confirm card", "done": false },
        { "task": "Handle old documents that still have phone only", "done": false }
      ],
      "verifiedBy": "08-tools/check-adoption.ts",
      "verifiedAt": "2026-11-01T10:00:00Z"
    }
  },
  "extensionChanges": {
    "EXT-0001": { "status": "adopted" }
  }
}
```

### 4.1 The status values

| Status | Meaning |
|---|---|
| `not_started` | The app has not touched it |
| `in_progress` | Some of the checklist is done |
| `adopted` | Every checklist item is done, and the evidence is a merged PR |
| `blocked` | The app cannot proceed. The reason is in the note |
| `waived` | The office decided this app does not need it. The reason is required |
| `not_applicable` | The app is genuinely not affected by this change. The reason is required |

**Every status other than `in_progress` and `adopted` needs a note.** A "not affected" with no reason is an unlisted affected app, which is exactly the failure the gate exists to catch.

### 4.2 The progress number

**There are two progress numbers, at two levels. Do not mix them up.**

| Level | Who computes it | The formula | Where it lives |
|---|---|---|---|
| **Per change** | The app, in its own PR | `done checklist items / total checklist items` | The `progress` field inside one change's record in `adopted.json` |
| **Per app** | `08-tools/check-adoption.ts` | `adopted changes / (adopted changes + pending changes)` | The tool's output and `impact-matrix.md` |

**The rule that matters at the per-change level.** *An app with no checklist shows 0%, not 100%.* An app that has not written down what it needs to do has not done it. This is what stops "we will do it later" from reading as "done".

**The rule that matters at the per-app level.** *An app with no `.contract/adopted.json` at all shows 0%, not 100%.* The tool checks the file's presence separately from the counts, so a missing file is never read as a clean app.

### 4.3 The evidence

**A `done: true` item needs evidence.** Usually a PR number. The CI tool checks that the referenced PR exists and is merged.

**Without evidence, "done" is a wish.** This is the F-20 class of bug, in team form: the issue tracker and the code disagreed and nothing checked.

## 5. The urgency and the gate

| Urgency | What it blocks |
|---|---|
| `immediate` | The app's PR **and** its release |
| `before_release` | The app's **release**. Not the PR |
| `scheduled` | Nothing. It is tracked |
| `optional` | Nothing. It is tracked |

**The separation matters.** A gate that blocks everything gets bypassed. A gate that blocks the release of a genuinely broken app is precise enough to be trusted.

## 6. The impact matrix

**`impact-matrix.md` is the one-page human view.** It is regenerated from `manifest.json`. It is what you paste into a standup.

**Do not edit it by hand.** If you did, it would drift from the machine log, and the machine log is the one that counts.

## 7. The procedure for a change

| # | Who | What |
|---|---|---|
| 1 | Whoever has the need | Opens an issue with the filled `templates/contract-request.md` |
| 2 | The platform owner | Classifies the severity, decides core vs extension |
| 3 | The platform owner | Makes the contract edit |
| 4 | The platform owner | Bumps `VERSION` |
| 5 | The platform owner | Adds the `manifest.json` entry |
| 6 | The platform owner | Writes the `CHG-*.md` file |
| 7 | The platform owner | Runs `08-tools/validate-contract.ts` and `08-tools/check-consistency.ts` |
| 8 | Renovate | Opens a version-bump PR in each affected app repo |
| 9 | Each app owner | Implements the change, updates `.contract/adopted.json`, opens a PR |
| 10 | CI | `08-tools/check-adoption.ts` fails if an S0 or S1 change is behind |

**Steps 5 and 6 are one step.** They happen in the same commit.

## 8. The two templates

| Template | When |
|---|---|
| `templates/contract-request.md` | You want a change. You fill it in and open an issue |
| `templates/CHANGE-template.md` | You are the platform owner and you are writing the change entry |
| `templates/BREAKING-template.md` | Same, but for an S1. It forces the migration and rollback sections |

## 9. The emergency path

**An S0 does not wait for the paperwork.** Deploy the fix first, then record it in the same window.

The full playbook is in `../07-guides/emergency-changes.md`. The short version:

| Step | What |
|---|---|
| 1 | Fix and deploy |
| 2 | Add the manifest entry with `severity: "S0"` and `emergency: true` |
| 3 | Write the `CHG-*.md` file |
| 4 | Tell every app owner the fix changed something they might depend on |
