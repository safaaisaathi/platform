---
id: context-readme
title: The Context Folder
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: both
see_also:
  - ./agent-manifest.json
  - ./platform-boundaries.md
  - ./glossary.md
---

# The Context Folder

**The "why" layer.** Everything here explains the shape of the platform. Nothing here is machine-checked, and nothing here overrides the contract.

## The files

| File | What it is | Read it if |
|---|---|---|
| `agent-manifest.json` | The machine-readable map of the repo. Paths, commands, owners | An AI harness is orienting itself |
| `product-overview.md` | What Safai Saathi is, the three apps, the one backend | You have two minutes |
| `platform-boundaries.md` | What the platform owns, what the apps own, the split rule | You are about to write something and want to know where it goes |
| `glossary.md` | The shared vocabulary. The words all three teams use | You see a term you do not know |
| `onboarding.md` | The day-one checklist, per role. Keys, access, the emulator | You just joined and need to get running |

## The one thing to read first

**`product-overview.md`.** It is two pages and it tells you the whole shape.

## The rule for this folder

| Belongs here | Does not belong here |
|---|---|
| The reasoning behind a shape | The shape itself. That is `02-contracts/` |
| The vocabulary | The field names |
| The onboarding steps | The contract rules |
| A pointer to the real thing | A copy of the real thing |

**A context file that duplicates a contract file will drift from it.** Context files point. They do not restate.
