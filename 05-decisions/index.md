---
id: decisions-index
title: ADR Index
status: frozen
owner: platform-owner
updated: 2026-11-02
audience: harness
see_also:
  - ./README.md
  - ../AGENTS.md
---

# ADR Index

| Number | Title | Status | Date | Supersedes | Superseded by |
|---|---|---|---|---|---|
| [0001](./0001-backend-is-firebase-not-a-custom-server.md) | Backend is Firebase, not a custom server | accepted | 2026-11-01 | none | none |
| [0002](./0002-rules-scope-by-claims-not-by-signed-in.md) | Rules scope by claims, not by "is signed in" | accepted | 2026-11-01 | none | none |
| [0003](./0003-admin-writes-go-through-callables.md) | Admin writes go through callables | accepted | 2026-11-01 | none | none |
| [0004](./0004-first-claim-van-binding.md) | First-claim van binding | accepted | 2026-11-01 | none | none |
| [0005](./0005-masked-phone-only.md) | Masked phone only | accepted | 2026-11-01 | none | none |
| [0006](./0006-device-id-is-a-custom-claim.md) | deviceId is a custom claim | accepted | 2026-11-01 | none | none |
| [0007](./0007-one-shared-contract-repo.md) | One shared contract repo for three apps | accepted | 2026-11-02 | none | none |

## The reading order

**If you are new, read them in number order.** Each one builds on the ones before it.

| # | What it settles | Read it when |
|---|---|---|
| 0007 | Why there is a shared repo at all, and why the contract is vendored rather than packaged | You want to know the shape of this repo |
| 0001 | Why the backend is Firebase and not a custom server | You are questioning the platform choice |
| 0002 | Why the rules scope by claim and not by "is signed in" | You are writing a rule |
| 0003 | Why every admin write is a callable | You are writing an admin action |
| 0004 | Why the van binding is first-claim | You are writing the sign-in flow |
| 0005 | Why the phone is masked and split across two collections | You are touching `drivers` or `staffPhones` |
| 0006 | Why the `deviceId` is a claim and not a parameter | You are writing the user app's session |

## How to read this index

- One row per ADR. The Number column links to the file. Numbers are never reused.
- **Status** is where the ADR stands today: `proposed`, `accepted`, `rejected` or `superseded`. Only `accepted` rows are binding.
- **Supersedes** and **Superseded by** form the chain. An `accepted` ADR whose supersedes column is `none` is a first decision. When a decision changes, the old row flips to `superseded` and points at the new one, and the new row points back.
- The **Date** is the date of acceptance. It is not the date of the last edit, which lives in the file's `updated` field.
- The table says `none`; the ADR frontmatter says `null`. Same meaning, different shape.
- This index explains why. It never overrides. In the authority order (`../AGENTS.md` section 1), `02-contracts/` and `03-rules/` outrank this folder. If an ADR and a contract disagree, the contract wins and the ADR gets superseded.
- Read the index first, the ADR second. Each ADR body is 80 to 200 lines and is written to be read once, not memorized.
