# Feature entries

This folder holds one JSON entry per feature. A feature is a **journey** that
crosses app boundaries: what the citizen, the driver and the office do, in
order, and how one app hands over to the next.

## What a feature entry is, and what it is not

- A feature entry is the layer that says **which app does what and what is
  still missing**. It names the real screens, files and functions where each
  slice lives, and it records the slice state (missing / specified / built /
  wired / verified) with evidence.
- A feature entry is **not** a PRD. The PRD says what should be built; the
  feature entry says what *is* built and where the journey breaks.
- A feature entry is **not** a collection schema. The schemas live in
  `02-contracts/collections/`; this layer references them but does not
  duplicate them.

## The three layers

| Layer | What it means | Where it lives |
|-------|---------------|----------------|
| **Surface** | What the user sees: a screen, a file path, or a function name. Must be findable on disk. | Already in the contract (schemas, enums, callables) and in each app repo |
| **Feature** | The journey across apps: who acts, what they touch, how they hand over. | This folder |
| **Slice** | One app's part of one feature. The thing that is missing or built. | One entry in each feature's `slices` array |

The contract already has the surface (schemas, enums, constants, callables,
topics). The feature entry is the missing layer that says which app does what
and what is still missing.

## Slice states

| State | Meaning |
|-------|---------|
| `missing` | Nothing is specified for this app yet. The other apps are waiting on it. |
| `specified` | The contract says what this app must do, and this app has not written it. |
| `built` | The app has the code, but it is not connected to the real backend. It reads or writes mock data, or it writes to a field nobody reads. |
| `wired` | The app talks to the real backend with the contract's shape. The data flows. It has not been proven end to end. |
| `verified` | The scenario has been run and passed, at least in the simulator. |

The point of the states is that **`built` and `wired` are different**. Code
that writes a field nobody reads is `built`, not `wired`. A `built` slice with
no evidence is a guess; if you have no evidence, set state to `missing` and say
why in `blockedBy`.

## Verification tiers

| Tier | What it proves | Cost |
|------|----------------|------|
| `static` | A grep or a type check that the code, field name, callable or topic exists. | Cheap, offline |
| `simulated` | The Firestore emulator: the scenario runs against a local backend. | Medium, needs the emulator |
| `live` | Real phones against the shared project. | Expensive, needs devices |

## Feature status rule

A feature's `status` is the worst state implied by its slices, computed as:

- all slices `verified` → `working`
- all slices `wired` or `verified` → `connected`
- some slice `wired` or `verified` → `partial`
- otherwise → `designed`

A feature with one `missing` slice cannot be called `connected`: the journey
breaks at that slice, no matter how complete the others are. The checker
re-implements this rule and rejects any declared status that does not match
the slices.

## How to add a feature entry

1. Copy the shape of an existing entry in this folder.
2. Keep feature ids lowercase and dot-separated (`app.feature-part`).
3. Keep slice ids lowercase and dot-separated.
4. Every `step.n` must equal its 1-based position; every step `actor` and
   slice `app` must appear in `actors`.
5. Every `reads`/`writes` path must name a real collection with an id
   placeholder: `collection/{id}`.
6. Every `contractRefs` pointer must resolve: a collection schema exists, a
   callable is in `callables.json`, an enum is under `enums.json#/$defs`, a
   constant is `group.KEY` in `constants.json`.
7. Every `handoff.via` must resolve to a real collection path, callable, or
   FCM topic; a path handoff needs a producer step in the `from` app.
8. Every slice with state `built`, `wired` or `verified` needs `evidence`;
   a state without evidence is a guess.
9. Validate against `feature.schema.json` with the checker:
   `cd 08-tools && node --experimental-strip-types check-features.ts`

## Open questions

Each entry ends with `openQuestions`: one line per thing a human must settle.
An entry with open questions is not `designed` until they are answered.
