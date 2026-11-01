---
id: breaking-template
title: Breaking Change Template
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: harness
see_also:
  - ./CHANGE-template.md
  - ../README.md
  - ../02-contracts/severity-policy.md
---

# Breaking Change Template

**Copy this file to `CHG-<nnn>-<slug>.md` in this folder.** It is the normal template with four extra sections.

**Use this when the severity is S1.** An S1 change means an app that was correct becomes wrong. The extra sections exist because a breaking change has a cost that a non-breaking one does not.

**Delete this instruction block before you save the file.**

---

# CHG-<nnn>: <the breaking change, in one line>

**Severity**: S1 (Breaking) | **Priority**: P<n> | **Version**: <old> → <new>
**Date**: <YYYY-MM-DD> | **Author**: <name> | **Decides**: <ADR-nnn, or none>

## What changed

<One paragraph. The concrete technical change.>

## Why

<The problem. What breaks without it.>

## What breaks

<Exactly what an app that was correct will do wrong. Be specific. "The complaints screen will be empty" is useful. "Things may not work" is not.>

## Who is affected

| App | Affected? | What they must do | Blocked release? |
|---|---|---|---|
| driverapp | YES / NO | <action> | Yes / No |
| userapp | YES / NO | <action> | Yes / No |
| adminpanel | YES / NO | <action> | Yes / No |

## Migration steps

<The ordered steps. The order IS the design. Say why the order is what it is.>

1. <step>
2. <step>
3. <step>

**The order that works**: <describe it>

**The order that breaks**: <describe it, and what the failure looks like>

## The deprecation window

| Field | Meaning | Value |
|---|---|---|
| `oldFieldReadableUntil` | The last date the old field can be read | <date> |
| `oldFieldWritableUntil` | The last date the old field can be written. `null` means read-only | <date or null> |

**Inside the window**, both the old and the new field are present. The server writes the new one. The migration backfills the old one for the apps that have not migrated yet.

**The window is at least one release cycle of the slowest affected app.** In practice, one sprint.

**The field is never removed in the same release that stops writing it.**

## Rollback

<How to undo this. What breaks if you roll back. If the data migration has already run, say what the reverse migration is.>

## The failure modes

**What will actually go wrong, and what the app will show.**

| Failure | What the user sees | What the log says |
|---|---|---|
| <the app did not migrate> | <the visible symptom> | <the diagnostic> |
| <the deploy order was wrong> | <the visible symptom> | <the diagnostic> |

**Write this section before you ship.** It is the difference between "the screen is empty" and "the complaint screen is empty because the rules changed before the client did".

## Files changed

| File | What changed in it |
|---|---|
| `02-contracts/collections/<x>.schema.json` | <the field> |
| `VERSION` | <old> → <new> |
| `06-changes/manifest.json` | <the entry> |

## See also

- [ADR-<nnn>](<the ADR>)
- [The schema](../../02-contracts/collections/<x>.schema.json)
- [The guide](../../07-guides/making-a-contract-change.md)
