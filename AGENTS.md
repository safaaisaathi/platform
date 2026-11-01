---
id: platform-agents
title: Safai Saathi Platform AGENTS
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: harness
see_also:
  - ../07-guides/README.md
  - ../00-context/agent-manifest.json
---

# AGENTS.md

**You are working in the SHARED contract repo for three apps:** `driverapp`, `userapp`, `adminpanel`.

## 1. Authority order

**On a conflict, the higher number wins. Never resolve a conflict by editing the winner to match the loser.**

| # | Source | What it decides | Absolute? |
|---|---|---|---|
| 1 | `02-contracts/**` | The field names, enums, constants, claims, topics, callables | **Yes** |
| 2 | `03-rules/firestore.rules` | Who may read and write what | **Yes** |
| 3 | `05-decisions/index.md` | Why. Explains, never overrides | No |
| 4 | `01-prds/**` | What the product should do | No |
| 5 | `06-changes/**` | What changed, and who must catch up | No |
| 6 | `09-reference/**` | Background reading. Never a source of truth | No |

**If 1 and 4 disagree, 1 wins and you open a change request.** Never "fix" the contract to match a PRD.

## 2. Hard constraints

| # | Constraint |
|---|---|
| 1 | **NEVER** add, rename or remove a field or an enum value without a change request. PRD-2 §0.1 |
| 2 | **NEVER** change `03-rules/firestore.rules` without a security note in the change entry |
| 3 | **NEVER** bump `VERSION` in the same commit as an unrelated edit |
| 4 | **NEVER** edit `06-changes/manifest.json` alone. It and its `CHG-*.md` file change together |
| 5 | **NEVER** mark a change as adopted on behalf of an app. Adoption is that app's own CI, from its own PR |
| 6 | **NEVER** edit an app's extension file. It lives in that app's repo. The platform registers it, the app owns it |
| 7 | **NEVER** merge. A human merges. You draft |
| 8 | **NEVER** deploy. Deployment is a human action |
| 9 | **NEVER** put a secret in this repo. A Firebase client API key is not a secret. A service account key is |

## 3. Read budget

**Read only what your task needs.** The blueprint in `09-reference/` is 2883 lines. Reading it all to change one enum value is waste.

| Your task | Read exactly these | Do NOT read |
|---|---|---|
| Add a field | `02-contracts/collections/<x>.schema.json`, `02-contracts/enums.json`, `06-changes/templates/contract-request.md` | `09-reference/` |
| Add an enum value | `02-contracts/enums.json`, the schemas that use it, `02-contracts/severity-policy.md` | `09-reference/` |
| Change a rule | `03-rules/firestore.rules`, `02-contracts/claims.json`, `05-decisions/index.md` | The PRDs |
| Change a Function | `02-contracts/callables.json`, `02-contracts/errors.json`, `04-functions/src/` | `09-reference/` |
| Write a change entry | `06-changes/templates/CHANGE-template.md`, `02-contracts/severity-policy.md` | Everything else |
| Answer a question about the backend | `02-contracts/README.md`, then the one file it points to | The whole `09-reference/` |

## 4. Modes

| Mode | You may | You may not |
|---|---|---|
| **READ** | Read anything, answer questions | Edit anything |
| **DRAFT** (the default when asked to make a change) | Edit `02-contracts/`, `05-decisions/`, `06-changes/`, `08-tools/`, `VERSION` | Merge, deploy, close issues, mark adoption |
| **REVIEW** | Read the diff, report findings | Edit anything |

## 5. The change procedure, in short

| Step | What |
|---|---|
| 1 | Classify the severity. `02-contracts/severity-policy.md` §1 |
| 2 | Check whether it should be an **extension** instead. `02-contracts/extensions/README.md` §1 |
| 3 | Fill `06-changes/templates/contract-request.md`. All 12 sections |
| 4 | Edit the contract file |
| 5 | Bump `VERSION` per the severity policy |
| 6 | Write `06-changes/manifest.json` entry AND the `06-changes/CHG-<nnn>-<slug>.md` file |
| 7 | Run the verification commands |
| 8 | Report |

**The full procedure, with the exact steps per change type, is in `07-guides/making-a-contract-change.md`.**

## 6. Self-verification

**Before you report done, run these. If any fails, you are not done.**

```bash
node 08-tools/validate-contract.ts      # every schema is valid, every enum resolves
node 08-tools/check-consistency.ts       # the schema and the changelog agree
```

Both must print their success line. A failure means the contract is broken, and nothing downstream can be trusted.

**If you edited markdown, run these two as well.**

```bash
python3 08-tools/check-tables.py         # every markdown table is well formed
python3 08-tools/check-links.py          # every relative markdown link resolves
```

## 7. Report format

**Your final message MUST end with this block. A human reads it to decide whether your work is real.**

```
CONTRACT VERSION: <from VERSION, old -> new if changed>
FILES READ: <paths>
FILES CHANGED: <paths>
SEVERITY: <S0-S4>
CHANGE ID: <CHG-nnn, or none>
VALIDATION: validate-contract -> <pass/fail> | check-consistency -> <pass/fail>
OPEN QUESTION: <one line, or none>
```

## 8. What not to do

| Do NOT | Why |
|---|---|
| Do not guess a field name | If it is not in the schema, it does not exist. Guessing is how the `phone` vs `phoneMasked` split happened |
| Do not "improve" a description | A description change is a PATCH, and it still needs a changelog entry |
| Do not add a field "just in case" | Every field is a permanent obligation |
| Do not touch the app repos from here | The platform does not depend on an app. An app depends on the platform |
| Do not skip the migration steps | An S1 change with no migration plan cannot merge |
| Do not trust the emulator | It does not enforce composite indexes. A green emulator run is not proof of index coverage |
