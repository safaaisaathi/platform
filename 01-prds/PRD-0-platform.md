---
id: prd-0-platform
title: Platform PRD
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: both
see_also:
  - ./README.md
  - ../00-context/product-overview.md
  - ../00-context/platform-boundaries.md
  - ../02-contracts/README.md
---

# PRD-0: The Platform

**The cross-cutting spec.** The three app PRDs say what each app does. This one says what they all share.

## 1. The purpose

**Three apps on one backend must not become three backends.** This document defines the shared surface they all build on, and the rules for changing it.

## 2. The shared surface

| What | The definition | Where it lives |
|---|---|---|
| **The data** | 18 collections, their fields and their shapes | `02-contracts/collections/` |
| **The vocabulary** | 11 frozen enums, 35 constants, 8 claims, 4 topics, 10 reason codes | `02-contracts/` |
| **The authorization** | Two rules files. The loose PHASE 1 one, and the claims-based PHASE 2 one | `03-rules/` |
| **The decisions** | 15 callables and 7 server functions | `04-functions/`, `02-contracts/callables.json` |
| **The journeys** | The feature layer. Which app does what part of a cross-app journey | `02-contracts/features/` |
| **The change process** | How a change is proposed, recorded and adopted | `06-changes/` |

## 3. The three non-negotiable rules

### 3.1 The rules decide who may. The Functions decide what is true.

**The split, in one line.** *A write is a RULE when the claim is the authority, and a CALLABLE when a live document is the authority.*

**Why it is not negotiable.** A token's claims are a snapshot, up to an hour old. If the authority is a document that can change, only the server can see the current value.

### 3.2 The client never names its own scope

**Every scope comes from a claim the server minted from a document the client cannot edit.**

| Forbidden | Why |
|---|---|
| The badge code as an auth token | It is printed on the van |
| The `deviceId` as a query parameter | The client controls it |
| The `wardIds` from a form field | The client controls it |

### 3.3 The server sends a reason code, the client owns the words

**Never English text from the server.** Three apps, three sets of arb files, one server.

## 4. The identity model

| App | How it signs in | What it carries |
|---|---|---|
| **Driver** | Anonymous, then `bindDeviceToVan` | `vanId`, `driverId`. Later `currentTripId` |
| **User** | Anonymous, then `bootstrapUserSession` | `deviceId`, `routeId` |
| **Admin** | Email, then `mintStaffToken` | `role`, `staffId`, `wardIds` |

**All three minting callables have the same shape.** Check the caller, read the authoritative document, mint the token with the claims that document says, return it.

**The client asks. The server answers.**

## 5. The write matrix

| Collection | Driver | User | Admin | Functions |
|---|---|---|---|---|
| `wards` | read | read | write | read |
| `routes` | read | read | write | read |
| `vans` | write telemetry | read | write depot | write status |
| `trips` | write | read | read | write alerted |
| `trips/{id}/trail` | write | none | read | none |
| `complaints` | write 2 fields | create | via callable | write merged |
| `complaintPhones` | none | create, once | read district only | none |
| `notices` | read | read | via callable | none |
| `notices/{id}/receipts` | write | none | none | none |
| `ratings` | none | write | read | none |
| `collectionFeedback` | none | write | none | none |
| `staff` | none | none | via callable | read |
| `staffPhones` | none | none | via callable | none |
| `drivers` | read own | none | via callable | read |
| `wardDuty` | none | read via callable | write via callable | write |
| `vanDevices` | none | none | none | write |
| `rateLimit` | none | none | none | write |

**The admin column is entirely "via callable".** That is Q5. A revoked staff member loses access immediately.

**The user app writes no duty board.** The citizen may not decide a ward's collection is done. CHG-0011.

## 6. The data rules

| Rule | Why |
|---|---|
| **A Firestore `get` returns the whole document. Rules do not redact.** | So a PII field cannot be kept out of a read path by a field-level rule. It needs its own collection |
| **The mask is applied at the source** | So the reader cannot be trusted to mask it |
| **A snapshot is taken at shift start** | So a mid-shift scope change does not rewrite history |
| **The trail is sharded at 1000 points** | So the trail write never hits the 1 MiB document cap |
| **`alertedWardIds` is appended in a transaction with the send** | So the citizen gets one alert, not one every 10 seconds |

## 7. The visual rules

| Rule | Why |
|---|---|
| **Same token names in the Flutter theme and the panel's CSS variables** | So the three apps look like one system |
| **Status is always colour plus icon plus label** | So it works for a colour-blind user and in greyscale |
| **Every screen has loading, empty, error and offline states** | Because every one of those will happen |
| **Every string is localized** | Because the user app and the driver app are bilingual |

## 8. The change process

| Step | Who |
|---|---|
| Propose | Any app owner, with `06-changes/templates/contract-request.md` |
| Classify and decide | The platform owner |
| Implement | The platform owner |
| Record | The platform owner, in `manifest.json` and a `CHG-*.md` file |
| Adopt | Each affected app owner, in their own repo |
| Verify | CI, with `08-tools/check-adoption.ts` |

**The full process is in `06-changes/README.md`.**

## 9. What is explicitly out of scope

| Out of scope | Why |
|---|---|
| A custom backend server | See ADR-0001 |
| Firebase Data Connect | It would give a tool-enforced typed contract, which is attractive, but it requires migrating off raw Firestore. Too big right now |
| A shared UI component library across Flutter and React | A shared widget across two frameworks is not shared, it is duplicated with extra steps |
| A device registry for targeted pushes | Staff topics cover the admin's needs without one |
| Multi-repo CI orchestration (Nx, Turborepo) | Their `affected` computation works inside ONE repo. This is three repos |

## 10. The acceptance criteria

**The platform is done when:**

| # | Criterion | How it is checked |
|---|---|---|
| 1 | Every collection has a schema, and every schema validates | `08-tools/validate-contract.ts` |
| 2 | Every field a PRD names exists in the schema | `08-tools/check-consistency.ts`, against the PRD `contractRefs` |
| 3 | Every change has a manifest entry and an explanation file | `08-tools/check-consistency.ts` |
| 4 | Every affected app's adoption state is visible | `08-tools/check-adoption.ts` |
| 5 | The rules have a test suite covering the negative cases | `03-rules/` |
| 6 | Every app's `AGENTS.md` points at a pinned contract version | The app's own CI |

**And the one that is not machine-checkable:** *a new developer can read the contract and build a feature without asking anyone a question.* That is the real test of this repo.
