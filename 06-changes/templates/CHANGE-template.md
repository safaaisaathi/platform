---
id: change-template
title: Change Entry Template
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: harness
see_also:
  - ./breaking-template.md
  - ../README.md
  - ../02-contracts/severity-policy.md
---

# Change Entry Template

**Copy this file to `CHG-<nnn>-<slug>.md` in this folder.**

**Every section is required.** A change with a missing section cannot merge. "What breaks" and "Rollback" are the two that get skipped, and they are the two that matter most.

**Delete this instruction block before you save the file.**

---

# CHG-<nnn>: <the change, in one line>

**Severity**: S<n> (<new capability>) | **Priority**: P<n> | **Version**: <old> → <new>
**Date**: <YYYY-MM-DD> | **Author**: <name> | **Decides**: <ADR-nnn, or none>

## What changed

<One paragraph. The concrete technical change. Name the files, the fields, the values.>

## Why

<The problem this solves. What breaks without it. Why now.>

## What breaks

<What an app that was correct will do wrong after this change. If nothing breaks, say "Nothing. This is purely additive.">

**For each affected app, name the exact behaviour that changes.**

## Who is affected

| App | Affected? | What they must do |
|---|---|---|
| driverapp | YES / NO | <the specific action> |
| userapp | YES / NO | <the specific action> |
| adminpanel | YES / NO | <the specific action> |

**An app with NO needs a one-line reason. "Not affected" with no reason is not allowed.**

## Migration steps

<The ordered steps. Each step is one thing somebody does. The order is load-bearing.>

1. <step>
2. <step>
3. <step>

## Rollback

<How to undo this. What breaks if you roll back. If the rollback is impossible, say so and say why.>

## Files changed

| File | What changed in it |
|---|---|
| `02-contracts/collections/<x>.schema.json` | <the field or the enum> |
| `02-contracts/enums.json` | <the value> |
| `VERSION` | <old> → <new> |
| `06-changes/manifest.json` | <the entry> |

## See also

- [ADR-<nnn>](<the ADR, if any>)
- [The schema](../../02-contracts/collections/<x>.schema.json)
- [The guide](../../07-guides/<the guide>)
