---
id: adr-0005-masked-phone-only
title: Masked phone only
status: accepted        # proposed | accepted | rejected | superseded
owner: platform-owner
updated: 2026-11-01
audience: harness
deciders: [platform-owner, office]
consulted: [driverapp-team, adminpanel-team]
informed: [userapp-team]
supersedes: null
supersededBy: null
see_also:
  - ../02-contracts/collections/driver.schema.json
  - ../02-contracts/collections/staffPhone.schema.json
---

# Masked phone only

## Context

Should the raw driver phone number ever reach the driver app? The driver app reads `drivers/{code}` at shift start to greet the driver and confirm identity. The office needs the raw number to call a driver. The driver does not need to see it again, and no one else should see it at all.

The question looks like a display preference. It is not. It decides where a piece of PII lives, and where it lives decides who can read it.

## Decision

Masked only.

| Field | Collection | Who reads it |
|---|---|---|
| `phoneMasked`, shape `98XXXXXX10` | `drivers/{code}` | The driver app, the admin panel |
| raw `phone` | `staffPhones/{code}` (a NEW collection) | The office only, behind the staff wall |

The mask is applied AT THE SOURCE by the `upsertDriver` callable, not by the reader. The callable takes the raw phone as input, writes the mask to `drivers.phoneMasked`, and writes the raw value to `staffPhones/{code}`. A reader never sees the raw value, because it is not on the doc the reader reads.

## Consequences

### Good

| Consequence | Why it matters |
|---|---|
| The driver app cannot leak what it never receives | A client-side redaction can be bypassed. A field that is absent cannot be |
| The mask shape is already the contract | PRD section 0.16's welcome card shows `98XXXXXX10`, so no client copy needs to change to adopt this |
| The raw phone keeps one home | `staffPhones/{code}`, one collection, one rule, one audit story |

### Bad

| Cost | Why it is accepted |
|---|---|
| Rules do not redact, so a collection-scoped rule is not enough | A Firestore `get` returns the WHOLE document. So the driver's rule on `drivers` must be FIELD-RESTRICTED, not just collection-scoped: the write path is pinned to an explicit key list, and the read path denies any doc that still carries a raw `phone` field |
| And even then, the raw phone cannot live on the same doc | The driver's own read of that doc returns every field it holds. No read rule can hide one. Hence the separate collection, which is the only mechanism that actually keeps the raw value out of the driver's read path |
| Two collections to keep in sync | `upsertDriver` and `upsertStaff` write both sides. If one write fails after the other lands, the docs disagree. The callable owns both writes so the window is as short as the platform can make it |

## Migration order: data first, rules second

| Step | Action | Why this order |
|---|---|---|
| 1 | Copy `phone` to `phoneMasked` on every `drivers` doc | The new field exists before anything depends on it |
| 2 | Move the raw value into `staffPhones/{code}` and remove it from `drivers` | The raw value leaves the driver-readable doc BEFORE any rule depends on its absence |
| 3 | Deploy the new rules | The rules can now assume the split is complete |

If both ship in one commit, the order inside that commit matters. Deploying the rules first makes the read depend on a state the data does not have yet, and every driver read fails in a way that looks like "the screen is empty". This is the same ordering principle as `../02-contracts/severity-policy.md` section 6: migrate the data, then deploy the rules, then release the clients.

This change is the worked S1 example in the severity policy: `drivers.phone` becomes `drivers.phoneMasked`, two affected apps, P1.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Send the raw phone and mask it in the driver app's UI | The raw value crosses the wire and sits in the client's memory and logs. Any proxy or console read defeats a UI mask |
| Field-restrict the read and keep the raw phone on `drivers` | Rules cannot redact a `get`. The driver's own read returns every field on the doc, so the field-restriction alone cannot protect a field that stays there |
| Drop the phone from the platform entirely | The office needs to call drivers. Removing the data removes a capability, it does not solve a leak |

## References

| What | Where |
|---|---|
| The masked field and the PII warning | `../02-contracts/collections/driver.schema.json` |
| The raw phone's collection, with the why-separate note | `../02-contracts/collections/staffPhone.schema.json` |
| The callable that applies the mask | `../02-contracts/callables.json`, `upsertDriver` |
| The severity and migration policy this follows | `../02-contracts/severity-policy.md` |
| Why rules cannot redact | ADR 0002 in `./index.md` |
