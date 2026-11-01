---
id: functions-readme
title: The Functions Folder
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: harness
see_also:
  - ./src/index.ts
  - ../02-contracts/callables.json
  - ../02-contracts/errors.json
  - ../07-guides/backend-split.md
---

# The Functions Folder

**The server half of the backend.** Every decision that needs to read a live document lives here.

## 1. The files

| File | What it is |
|---|---|
| `src/index.ts` | The Functions source. **One file today, so every change is visible in one diff** |
| `package.json` | The dependencies and the deploy scripts |
| `tsconfig.json` | The TypeScript config |

## 2. The rule that decides what goes here

> **A write is a RULE when the claim is the authority, and a CALLABLE when a live document is the authority.**

**A token's claims are a snapshot.** They expire after an hour. So a rule can answer *"is this caller allowed to touch this document?"* but it cannot answer *"is this complaint still inside the inspector's ward right now?"*.

| If the decision needs | It goes |
|---|---|
| The `vanId` claim, the `driverId` claim, the `deviceId` claim | A Firestore rule. `03-rules/firestore.rules` |
| The live `staff/{id}.active` | A callable. Here |
| The live `vans.currentTripId` | A callable. Here |
| The live `trips/{id}.driverId` | A callable. Here |

## 3. The current state

**Only two Functions exist today, and both must be deleted.** They are the PIN flow.

| Function | Line | Status |
|---|---|---|
| `verifyDriverPin` | `src/index.ts:34` | **DELETE.** The app never calls it. A grep for `verifyDriverPin` in `lib/` returns zero hits |
| `setDriverPin` | `src/index.ts:158` | **DELETE.** It contains `DEMO_SEED_BYPASS` at `src/index.ts:173-188`, an unauthenticated write path |

**The deletion is `CHG-0006`.** The proof is one grep:

```bash
grep -rn "verifyDriverPin\|setDriverPin\|vanSecrets\|DEMO_SEED_BYPASS" lib/ functions/src/ scripts/
```

**Zero hits.** That is the whole acceptance criterion.

## 4. The eleven callables that must exist

**All eleven are `NEW. Not implemented.`** Their contracts are in `../02-contracts/callables.json`. That file is the specification. This folder is the implementation.

| Callable | Called by | The decision it makes |
|---|---|---|
| `bindDeviceToVan` | driverapp | Claims the phone to the van. Mints `vanId`, `driverId` |
| `bootstrapUserSession` | userapp | Resolves the citizen's ward to a route. Mints `deviceId`, `routeId` |
| `mintStaffToken` | adminpanel | Reads the staff doc. Mints `role`, `staffId`, `wardIds` |
| `startShift` | driverapp | Creates the trip and sets the open-trip marker, atomically |
| `endShift` | driverapp | Closes the trip and clears the marker |
| `markWardDone` | driverapp | Records a ward as collected, scoped to the trip's snapshot |
| `setComplaintStatus` | adminpanel | Resolves, assigns or escalates a complaint |
| `publishNotice` | adminpanel | Sends a notice to a van, a ward or everyone |
| `upsertDriver` | adminpanel | Creates or updates a driver. **Masks the phone on the way in** |
| `upsertStaff` | adminpanel | Creates or updates a staff member |
| `setVanDepot` | adminpanel | Sets the van's depot tag |

## 5. The three shapes

**The three session-minting callables are one shape.**

```
1. Check the caller is authenticated
2. Read the authoritative document the client cannot edit
3. Mint a custom token with the claims THAT DOCUMENT says
4. Return the token
```

**The client asks. The server answers.** A client parameter is never a claim. A client parameter is forgeable.

**The five admin-write callables are one shape.**

```
1. Check the caller is authenticated
2. Read the LIVE staff/{id} doc and check active is true
3. Check the target is inside the live ward scope
4. Do the write
5. Return a reason code on failure
```

**Step 2 is the whole reason these are callables.** A revoked staff member's token stays valid for up to an hour. Only a live read locks them out.

**The four shift callables are one shape.**

```
1. Check the claim that scopes the van
2. Read the live van and trip documents inside a TRANSACTION
3. Decide: resume, conflict, or create
4. Return the reason code, or the fresh token
```

## 6. The reason codes, not the words

**A Function never returns English text to a client.**

| What the Function returns | What the client shows |
|---|---|
| `vanAlreadyClaimed` | `identityShiftConflictClaimed` in the app's arb file |
| `vanHeldByAnotherDriver` | `identityShiftConflictOtherDriver` |
| `staleMarker` | `identityShiftConflictStaleMarker` |
| `notAuthorised` | `errorNotAuthorised` |
| `notFound` | `errorNotFound` |
| `invalidInput` | `errorInvalidInput` |
| `rateLimited` | `errorRateLimited` |
| `internal` | `errorInternal` |

**The vocabulary is in `../02-contracts/errors.json`.** The client owns the words. Three apps, three sets of arb files, one server.

## 7. The constants come from the contract

**No Function hardcodes a number that exists in `../02-contracts/constants.json`.**

```typescript
// Wrong. The Dart side has 10 and the Function has 12 and nobody notices.
const GPS_INTERVAL_SEC = 12;

// Right. One source.
import constants from "../../02-contracts/constants.json";
const GPS_INTERVAL_SEC = constants.tracking.GPS_INTERVAL_SEC.value;
```

**The alternative, when an import path is awkward.** Generate the file with `node 08-tools/export-ts-constants.ts <app-repo-path>` and import the generated file. **Never edit the generated file.**

## 8. The transaction rule

**Any "read then decide then write" MUST be a Firestore transaction.** A plain `get` followed by a `set` has a race window.

| Situation | What goes wrong without a transaction |
|---|---|
| `startShift` on a van with no open trip | Two clients both read "no trip", both create one, and the last write wins. One shift is orphaned |
| `bindDeviceToVan` on a fresh van | Two phones both read "no binding", both create one. Two phones, one van |
| `endShift` | The shift ends, and another shift starts, and the second one clears the first one's marker |

**The conflict codes exist because of these races.** `vanHeldByAnotherDriver` and `vanAlreadyClaimed` are not error handling. They are the outcome of the transaction.

## 9. The server clock

**Any timestamp the business logic depends on is the SERVER's clock.**

| Timestamp | Source | Why |
|---|---|---|
| `complaints.createdAt` | `FieldValue.serverTimestamp()` | The complaint's age drives escalation |
| `vans.lastLocation.updatedAt` | `FieldValue.serverTimestamp()` | The staleness check compares it against `STALE_LOCATION_SEC` |
| `trips.date` | The IST midnight instant, computed server-side | The day window is a business boundary |
| `trips.startedAt` | The client clock | **A known weakness.** The server-computed `date` sits alongside it, not replacing it |

**A client clock is a client clock.** It is 12 hours wrong in a wrong-timezone phone, and 5 minutes wrong in a slow phone, and the difference is invisible.

## 10. The deploy trap

**`package.json` says `"main": "lib/index.js"`.** That is the compiled output. If you deploy without building, Firebase uploads the **previous** build.

```bash
npm run build      # tsc
npm run deploy     # firebase deploy --only functions
```

**The `deploy` script in this repo builds first.** The driver app's copy does not. That mismatch is the "stale artifact trap" and it is why the deploy script here must be:

```json
"deploy": "npm run build && firebase deploy --only functions"
```

**Always confirm what was actually deployed.**

```bash
firebase functions:log --only startShift
```

## 11. The emulator caveat

**The Functions emulator is good for the happy path and the reason codes.** It is not good for:

| Not emulated | What it means |
|---|---|
| Real FCM delivery | A push you see locally is a mock |
| Real custom token refresh | A token that works locally may not refresh the same way |
| Composite indexes | The emulator does not enforce them |

## 12. The checklist before you deploy

| # | Check | Command |
|---|---|---|
| 1 | It builds | `npm run build` |
| 2 | Every reason code it returns is in `errors.json` | Read the diff |
| 3 | No hardcoded constant that exists in `constants.json` | Read the diff |
| 4 | Every "read then write" is a transaction | Read the diff |
| 5 | Every timestamp the business logic depends on is a server timestamp | Read the diff |
| 6 | It returns a reason code, never a message | Read the diff |
| 7 | The contract file and the changelog entry changed together | `git status` |

**And the deployment order.** The server goes first, the clients go second, the rules tighten last. See `../06-changes/CHG-0003-scope-the-rules-by-custom-claims.md`.

## 13. The read budget

| Your task | Read exactly these |
|---|---|
| Implement a callable | `../02-contracts/callables.json`, the one entry, `../02-contracts/errors.json` |
| Change a reason code | `../02-contracts/errors.json`, `../02-contracts/callables.json` |
| Add a scheduled Function | `../02-contracts/constants.json`, `../02-contracts/topics.json` |
| Fix a bug | The one Function, `../02-contracts/callables.json` |
| Deploy | This file, section 10 |

**Do not read `../09-reference/` to implement a callable.** It is 2883 lines of history and the answer is in `callables.json`.
