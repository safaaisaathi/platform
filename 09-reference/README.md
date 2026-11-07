---
id: reference-readme
title: The Reference Folder
status: frozen
owner: platform-owner
updated: 2026-11-02
contractVersion: "1.0.0"
audience: both
see_also:
  - ./issue-register.md
  - ../02-contracts/README.md
  - ../AGENTS.md
---

# The Reference Folder

**Background reading. Never a source of truth.**

Everything in this folder explains HOW the platform got here. None of it overrides `02-contracts/` or `03-rules/`.

## The files

| File | What it is | Read it when |
|---|---|---|
| `issue-register.md` | The live state of every issue across the three repos. What is open, what is a false close, what is a numbering collision | You need to know what is actually outstanding |
| `feature-change-map.md` | The tree: every feature, its slices and their state, the changes that touch it, which are shared and which are contract-wide, and what is blocked. Generated, so it does not drift | You want the shape of the whole product at once, not one file at a time |
| `BACKEND-GO-blueprint.md` | The authoritative backend contract. 14 sections, the rules-vs-Functions split, the FCM topic map, the arrival flow, the worked example, and the Q1 to Q7 rulings | You need the reasoning behind the backend design |
| `AUDIT2-flow-backend-ui.md` | The full audit. 25 backend findings, 20 flow findings, 11 UI findings, with the gates | You are chasing a specific defect |
| `SHARED-REPO-blueprint.md` | The design record for THIS repo. Why the shared repo exists, what it replaces, and the tool verdict | You want to know why the repo is shaped this way |

## The rule for this folder

| Belongs here | Does not belong here |
|---|---|
| The history | The contract |
| The reasoning behind a decision | The decision itself. That is `05-decisions/` |
| A finding that is not yet a change | A change entry. That is `06-changes/` |
| A long document that is still the best record of something | A short document that should be a machine file |

**If a fact in this folder contradicts a contract file, the contract file wins.** The reference folder will be wrong eventually. That is why it is not a source of truth.

## The read budget

**Do not read this folder to answer a contract question.** The answer is in `../02-contracts/`.

| Your task | Read |
|---|---|
| What does this field mean | `../02-contracts/collections/<x>.schema.json` |
| Why is it like this | `../05-decisions/index.md` |
| What is outstanding | `./issue-register.md` |
| Why does the arrival alert work that way | `./BACKEND-GO-blueprint.md` section 7 |
| What did the audit find | `./AUDIT2-flow-backend-ui.md` |
| Why does this repo exist | `./SHARED-REPO-blueprint.md` |

**The blueprint is 2883 lines. The audit is 2609 lines. The design record is 400 lines.** Reading all three to answer one question is waste. Use the table above.

## The three documents, and why they stayed long

**They were written as working documents, not as reference material.** They are long because they were the thinking, and the thinking is what a new team member needs.

**They are not edited when the contract changes.** If a blueprint says something the contract no longer says, the blueprint is stale and the contract is right. **A stale reference document is not a bug. A stale contract is.**

## The one caveat that applies to all of it

**The Firestore emulator enforces the rules but NOT composite indexes.** A green emulator run is not proof of index coverage. This caveat is repeated in `../03-rules/README.md`, `../00-context/onboarding.md` and `../04-functions/README.md` because it is the one that gets forgotten.
