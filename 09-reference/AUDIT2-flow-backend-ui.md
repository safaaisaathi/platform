# AUDIT 2 — Driver App: Launch/Identity Flow, Backend Blueprint, UI Refactor Map

> **Reference copy.** This document moved from `safaaisaathi/driverapp` (`docs/AUDIT2-flow-backend-ui.md`) into the platform repo on 2026-11-02, because its backend half describes the shared backend and all three apps need it.
>
> **Its HEAD references are the driver app's.** The branch and the commit below are the driver app's. Since this audit was written the driver app's HEAD moved to `b9a2375`, and the live issue state moved on. See `./issue-register.md` for the refreshed state.
>
> **Its companion links still point at the driver app's repo.** `docs/AUDIT-launch-identity-flow.md` is still in the driver app's repo. `docs/PRD-2-driver-app.md` is still in the driver app's repo, and `../01-prds/PRD-2-driver-app.md` here is a pointer to it. `GLOSSARY.md` is in the driver app's repo.
>
> **This document is reference material, not a source of truth.** The contract is `../02-contracts/`. The rules are `../03-rules/`. Where this document and the contract disagree, the contract wins. See `./README.md`.

**Branch**: `fix/tracking-audit-p0` (HEAD `a0cba52`)
**Report date**: 2026-11-01
**Supersedes**: `docs/AUDIT-launch-identity-flow.md` (the 2026-10-31 audit). This document re-verifies every finding from that audit against the code as it stands now, adds the Firebase/backend blueprint, and adds the UI-duplication map.
**Mode**: Read-only. Zero code changes, zero branch switches, zero git state mutation.

> **Note on HEAD.** The first pass of this report was written against `6d1d628`. The branch then moved twice:
>
> | Commit | What it built | Effect on this report |
> |---|---|---|
> | `7004d1f` | Rulings #27/#28: launch-time resume + the five-row welcome card | **F-19 and F-06 closed.** F-20 discovered while re-verifying |
> | `a1c33c9` | **Ruling #29: depot auto-end** (parked 3 h inside 500 m) | **F-08 still open.** A new **client-side end-shift path** appeared, and it is covered in A.6 |
> | `a0cba52` | `scripts/read_trip.mjs` (a read-only trip inspector) | No finding changes. The script is a dev tool, not a production path |
>
> Parts A through G are re-verified against **`a0cba52`**. The `flutter analyze` / `flutter test` run below is against `a0cba52`.

---

## 0. How to read this document

| Part | What it answers | Audience |
|---|---|---|
| **Part A** | What got fixed since the last audit, what is still open, and what the three open product rulings should be | Product owner + builder |
| **Part B** | What Firebase structure the backend needs, what is missing or weak today, and the target architecture | Backend Owner |
| **Part C** | Which UI patterns are duplicated, where they should live, and the refactor order | Builder (UI) |
| **Part D** | Test-coverage map, including what is unpinned | Builder |
| **Part E** | Carried-over items that did not change | Everyone |
| **Part F** | One merged execution sequence | Builder |
| **Part G** | Handoff checklist and the terminology glossary | Builder |

> **Note on the identity decisions.** The three gates from the first pass (G1, G2, G3) are **now answered**, and four more decisions were made on top of them (Q4 to Q7). **The full reasoning, with the exact rules and the exact wording each answer forces, is in `docs/BACKEND-GO-blueprint.md` section 12.** This document carries the short version in Part F.1 and Part G.1, so the two do not drift.
>
> | # | The answer, in one line |
> |---|---|
> | **Q1** | **First-claim.** The first phone with a valid code claims the van, inside a transaction |
> | **Q2** | **One typed conflict phase, three reason codes.** The server sends the code, the app owns the words |
> | **Q3 + Q7** | **§0.16 wins**, and **§0.8's claim model wins**. PRD `:193` gets a one-sentence correction |
> | **Q4** | **Masked phone only.** The raw phone moves behind the staff wall |
> | **Q5** | **Scope at sign-in, revocation immediately.** The admin's writes go through callables |
> | **Q6** | **Same install only.** The `deviceId` is a claim, never a client parameter |

### Verification performed

| Tool | Where | Result |
|---|---|---|
| `flutter analyze` | `/tmp/opencode/audit4` (`git archive a0cba52 \| tar -x`) | **No issues found** (20.1 s) |
| `flutter test` | `/tmp/opencode/audit4` | **451/451 pass** |
| Firestore rules probes | `/tmp/opencode/backend-audit-2` (real Auth + Firestore emulators) | **17/17 matched the prediction.** See **B-01** |
| Repo state | `git status --short --branch` | Clean except the two untracked docs, `docs/AUDIT2-flow-backend-ui.md` (this file) and `docs/BACKEND-GO-blueprint.md` |

No `flutter` command was run inside the repo. No `git checkout/switch/stash/reset/clean/worktree` was run at any point.

### The emulator caveat, stated once

The Firestore emulator enforces **rules**. It does **not** enforce **composite indexes**. A deliberately index-less control query returned **200**. So **a green emulator run is NOT proof of index coverage.** Every index claim in this report is reasoned from Firestore's documented rules and must be verified against the real project.

---

## 1. Executive summary

The previous audit landed 19 findings. The user has since implemented the fixes that were unambiguous, and has **ruled and built** two of the three open items. **Ten are now closed. Five remain open, one of them needs a product ruling, and one NEW finding appeared while re-verifying.**

**And the three product gates are now answered** (Q1 to Q7, section 0's note). **Nothing blocks the build any more.** The open findings below are still open; the answers say what to do about them, not that they are done.

| Area | State now |
|---|---|
| Cold-launch race ("Couldn't check the code") | **CLOSED** (`f0c60c7` + `b051183`, session gate + welcome-card surface) |
| FGS never stops at End Shift | **CLOSED** (`tracking_engine.dart:393`) |
| `OfflineSyncService.attachTrip()` never called | **STILL OPEN — reclassified as F-20.** The fix landed in a method production never calls. See A.2.2 |
| `complaints` missing `allow update` | **CLOSED** (`firestore.rules:44`) |
| `offlineStatusProvider` always empty | **CLOSED** (`live_route_providers.dart`) |
| GLOSSARY false claims (F-14/15/16) | **CLOSED** (`GLOSSARY.md:115, 121, 170`) |
| "Different driver?" vs "Change code" (F-07) | **CLOSED** by ruling. The design file is the stale side |
| **Launch-time open-shift resume (F-19)** | **CLOSED**. Ruled #27 and built in `7004d1f`. See A.2.1 |
| **Welcome card missing Van/Route (F-06)** | **CLOSED**. Ruled #28 and built in `7004d1f`. See A.2.1 |
| **Depot auto-end (ruling #29)** | **BUILT** in `a1c33c9`. It closed the **end**-shift duplication and added a **third** client-side writer to `vans.status` / `currentTripId`. It did **not** close B-02. See A.4.1 |
| **Shared-van conflict wrong copy (F-08)** | **OPEN**, but **the copy is now decided** (Q2: one typed phase, three reason codes). Issue #29 is still open. Says "check the connection" for a van clash. **Careful:** the PRD's "ruling #29" is the depot auto-end, a different thing. See A.4.1 |
| **"Different driver?" keeps the stored code (F-05)** | **OPEN by ruling** — GLOSSARY `:109` calls it "NOT A BUG", but the stale-code consequence needs a look |
| **Permission flow runs twice (F-09)** | **OPEN for the start path.** Ruling #29 closed the **end**-shift duplication. See A.2.3 and A.4.1 |
| **Session gate not app-wide (F-11)** | **OPEN**. Gate lives only in `identity_flow.dart:171` |
| Backend / Firebase | **Not started**. Rules are authentication-only, one OR query has **two** hard failures, two Functions are dead, no inbound FCM handler, no App Check, no CI, no flavors |
| UI duplication | **11 patterns identified**, ~700 duplicated lines. Three separate language-toggle implementations exist |

### The three most important things in this document

**1. Part B, section B-01.** Every Firestore rule in this repo is `request.auth != null`. The app signs in **anonymously**. That means *every* signed-in anonymous user can read every driver's phone number, rewrite any trip, and write any van. The code is a badge number, not a secret, so this was a deliberate stance (§0.16 `:193`) — but the stance covers the *code*, not the *phone number*, not *trips*, and not *vans*. Those three need scoping before production.

**2. Part A, section A.2.2 (F-20).** The offline trail catch-up drain **still does not work in production**, even though commit `3de805c` marked it fixed and `GLOSSARY.md:106` records it as fixed. The `attachTrip` call was added to `TrackingAutoStarter.startTrackingFor`, but the production start path (`CodeStartScreen._runPermissionFlowAndNavigate`) never calls that method. This is a **P0 data-loss bug** wearing a "fixed" label, and the unit test that pins it tests the wrong entry point.

**3. Part B, section B-04, failure 2.** The notices inbox query **dies at 29 wards on a route**, with a hard HTTP 400. Firestore caps an `OR` query at 30 disjunctions after normalization, and a `whereIn` with N values inside an `OR` branch becomes N disjunctions. So the branch count is `1 + 1 + N`, and N = 29 gives 31. **Verified on a real emulator.** The driver sees an **empty inbox**, not an error. The multi-branch index (B-04 failure 1) is the known problem; **this one is not recorded anywhere in the repo**, and it fires **today** because `watchNotices` is the production query.

---

# Part A — Launch and identity flow

## A.1 Findings closed since the last audit

| ID | Finding | Evidence (current HEAD `a0cba52`) | Regression test |
|---|---|---|---|
| FGS-stop | The Android foreground service never stopped, so the "Tracking active" notification outlived the shift | `tracking_engine.dart:393` — `await _service.stop();` inside `_applyStop()` | `test/tracking/tracking_engine_test.dart` (stop calls the service once; a second stop stays one) |
| complaints-rules | `complaints` had no `allow update`, so both D4 buttons failed in production | `firestore.rules:44` — `allow update: if request.auth != null;` | Rules have no test suite. See Part D |
| offline-badge | `offlineStatusProvider` returned `Stream.empty()`, so the offline badge was permanently hidden | `live_route_providers.dart` — now `ref.watch(connectivitySourceProvider).status.map((online) => !online)` | D2 pump harnesses override it per test |
| F-14 | `GLOSSARY.md:152` falsely claimed a Hive session restore re-enters D2 on relaunch | `GLOSSARY.md:170` now says "SUPERSEDED 2026-10-31 ... there is NO Hive session→D2 path" | N/A (doc) |
| F-15 | `GLOSSARY.md:135` described a D1 PIN flow with a "Verify PIN" button | `GLOSSARY.md:153` marked as a pre-identity record; `:166` carries the correction | N/A (doc) |
| F-16 | The dev-entrypoint deletion list was missing two files | `GLOSSARY.md:121` now lists all seven: `dev_tracking`, `dev_pending_reports`, `dev_live_route`, `dev_notices`, `dev_min`, `dev_flow_preview`, `dev_identity_start` | N/A (doc) |
| F-07 | Link text "Different driver?" vs the design's "Change code" | `GLOSSARY.md:111` — "the identity-review ruling chose 'Different driver?'; the design file is the stale side" | N/A (ruling) |
| **F-19** | **Launch-time open-shift resume.** A relaunch did not resume tracking without a tap | Ruled #27, built in `7004d1f`. `identity_flow.dart:262` `resumeIfActive()`; `code_start_screen.dart:285` `_maybeAutoResume()`; `:346` the post-frame trigger. The flow flips to `onShift`, which is the same phase a manual start produces, so the normal permission + tracking hand-over runs | `test/features/shift_start/identity_flow_test.dart` (3 new: resume with no write, no-shift keeps one tap, another driver's shift never taken over) + `code_start_screen_test.dart` (direct vs one-tap paths) |
| **F-06** | **Welcome card missing Van/Route.** The returning driver could not see which van or route before starting | Ruled #28, built in `7004d1f`. `identity_flow.dart` gains `routeName` on the state, resolved at lookup time with a safe fallback to the raw route id; `code_start_screen.dart:866-890` renders the five rows | `identity_flow_test.dart` (route name resolved) + `code_start_screen_test.dart` (five-row card) |

### How F-19 was implemented (for the record)

The build is **zero-tap**, which is the third option, not the "prefetch + one tap" this report's earlier draft recommended. The implementation:

| Step | Where | What |
|---|---|---|
| 1 | `code_start_screen.dart:264` `_maybeAutoLookup()` | The remembered code is auto-looked-up on launch (this predates the ruling) |
| 2 | `code_start_screen.dart:346` | On `confirmReady`, a post-frame callback fires `_maybeAutoResume()` |
| 3 | `code_start_screen.dart:285` | Guarded by `_changeMode` and `_resumeChecked` — **one attempt per screen lifetime**, so popping back from D2 never bounces the driver out |
| 4 | `identity_flow.dart:262` `resumeIfActive()` | Reads the van, checks `isResumable(van)` (marker present AND `status == on_shift`), then calls the **same** `StartShift.execute` the manual path uses, so the ownership wall (`start_shift.dart:133-144`) applies unchanged |
| 5 | `identity_flow.dart:272-278` | On success: `shiftController.activate(session)` and the phase flips to `onShift` |
| 6 | `identity_flow.dart:279-283` | On any exception: **stay on the welcome card**, return null. Another driver's shift and an offline read both fall back to the one-tap card |

**Why this implementation is sound.** It reuses `StartShift.execute` rather than reimplementing the resume, so there is exactly one place that decides "resume or create" and exactly one place that enforces "the open trip must belong to this driver". The test `another driver's shift is never taken over at launch` pins the no-takeover property directly.

**The two residual risks it accepts.**

1. **The shared-phone hazard.** My earlier draft recommended keeping one tap, precisely because a colleague opening a phone with an open shift would otherwise be dropped into someone else's trip. Ruling #27 chose zero-tap. **The ownership check does not protect against this case**, because the phone holds the *remembered* code, and the remembered code *is* the other driver's code. The trip belongs to the remembered driver, so the check passes and the resume proceeds. This is a **conscious acceptance** of ruling #27, not a bug in the implementation. It should be listed in the office's handover notes: *a van phone must be handed over only after the shift ends.*
2. **The launch is now network-dependent for the resume path.** The splash still has a 1.6 s hard cap and still routes to the start-shift screen, so the app is usable offline. But reaching D2 now needs the van read + the trip read to succeed. Offline, the card renders and one tap still works. Acceptable.

### How F-06 was implemented (for the record)

Ruling #28 chose **five rows**: Name, Code, Van plate, Route name, Ward count.

The implementation detail worth knowing: `drivers/{CODE}.vanId` is an **id** (`van-01`), not the human plate (`GJ-01-V-2201`). The card shows `flow.vanPlate ?? driver.vanId`, where `vanPlate` comes from the existing van read (`identity_flow.dart:185`) and falls back to the raw id if the van doc is missing. The route name needed a **new** read: `routes/{driver.routeId}.name`, resolved inside a `try/catch` (`identity_flow.dart:191-198`) so a missing or unreadable route doc **never fails the lookup**. That is the right call: admin data must not be able to lock a driver out.

One deviation from this report's earlier recommendation: it suggested **dropping the Code row** ("the driver is not being asked to type it"). Ruling #28 kept it. That is a product call that has been made, so it is not a finding. It is defensible: the Code row is the one thing that tells a colleague *whose* phone this is, which matters on a shared device.

## A.2 Findings still open

### A.2.1 F-20 — The offline trail catch-up drain still never runs in production (P0, NEW)

**This is the most important open finding.** It is marked "fixed" in `GLOSSARY.md:103` and in commit `3de805c`, but the fix does not work.

**What the fix did.** Commit `3de805c` added the missing call to the F-D7 auto-start seam:

```dart
// lib/features/shift_start/data/shift_tracking_auto_start.dart:72
_ref.read(offlineSyncServiceProvider).attachTrip(session.tripId);
```

That is inside `TrackingAutoStarter.startTrackingFor`.

**Why it still does not work.** `TrackingAutoStarter.startTrackingFor` has exactly **two** callers in `lib/`, and neither is the production start path:

| Caller | When it runs | Is it the normal path? |
|---|---|---|
| `lib/features/shift_start/ui/basic_route_placeholder.dart:86` | A retry button on `BasicRoutePlaceholder` | **No. `BasicRoutePlaceholder` is never routed to.** `grep -rn "BasicRoutePlaceholder" lib/ test/` returns only its own declaration. It is dead code |
| `lib/features/live_route/live_route_screen.dart:467` | The **"Retry"** button in the D2 tracking-state banner | **Only when tracking failed.** The banner renders only when `outcome.kind != started` (`live_route_screen.dart:410`) |

**The actual production start path** is `CodeStartScreen._runPermissionFlowAndNavigate` (`code_start_screen.dart:84-137`). It runs after `identity_flow` reaches the `onShift` phase, and it does this:

```dart
final report = await UIPermissionFlowController(gateway, context).requestAll();
final started = report.allGranted
    ? await ref.read(trackingEngineProvider).start(...)   // the engine, directly
    : false;
ref.read(shiftTrackingAutoStartStatusProvider.notifier).set(outcome);
```

It calls the **tracking engine directly**. It never touches `TrackingAutoStarter`, and therefore **never calls `attachTrip`**.

**The consequence, traced through the code.**

| Step | What happens |
|---|---|
| 1 | A shift starts. `OfflineSyncService._tripId` stays **`null`** (`offline_sync_service.dart:70`) |
| 2 | The driver goes into a dead zone. The engine's `finally` block buffers the accepted point into the trail buffer (`tracking_engine.dart:558`) — the point is not lost, it sits in the Hive buffer |
| 3 | The engine's own flush timer also tries to append (`tracking_engine.dart:653`). If the network is down, the batch goes **back to the front** of the buffer (`tracking_engine.dart:687`) — still not lost |
| 4 | The driver drives out of the dead zone. The engine's next flush tick succeeds and the points land. **The happy path works** |
| 5 | But the **catch-up drain** never fires. `OfflineSyncService._flushTrailBatch()` returns `false` immediately (`offline_sync_service.dart:201-202`: `if (tripId == null) return false;`) |
| 6 | And the **pending count** is wrong. `_computePendingCount()` (`:251-262`) adds the trail buffer's `pendingCount` **only when `_tripId != null`**. So the driver's unsynced-points badge (`unsyncedPointsCountProvider`, `offline_providers.dart:43`) **under-counts by the entire trail backlog** |

**So the real bug is narrower than "the trail is lost", and it is still a real bug:**

| Symptom | Severity | Why |
|---|---|---|
| The **badge under-counts** the unsynced trail points, so the driver sees "0 unsynced" while a backlog is sitting on the device | **P1** | The driver has no signal that data is pending |
| **Points left over from a shift that ended inside a dead zone are never drained by the offline service.** They are only drained if the tracking engine is still running for that trip. If the app was killed (or the shift ended) with a backlog, `attachTrip` was never called for that trip, so the service never drains it | **P0** | Silent data loss. The points stay in the Hive buffer forever, and the trip doc is missing them |
| The class doc says *"leftover trail points of a shift ended inside a dead zone must still sync"* (`offline_sync_service.dart:68-69`) — that promise is **not kept**, because the shift-end path never attaches either | **P0** | The documented contract is broken |

**Why the existing test did not catch it.** `test/features/shift_start/tracking_auto_start_test.dart` calls `TrackingAutoStarter.startTrackingFor` **directly** and asserts `service.attachedTripId == 'trip-1'`. The test is correct, and the code it tests is correct. The problem is that **the test exercises a method the production flow never calls**. This is the classic failure mode of unit-testing a seam instead of the path that uses it.

**How senior engineers solve this class of problem.**

| Principle | Application here |
|---|---|
| **Test the path, not the seam.** A test that calls the implementation directly proves the implementation works, not that it is reached | The regression test must drive the **production start path** (the `onShift` phase in `CodeStartScreen`) and assert `offlineSyncService.attachedTripId` afterwards |
| **One owner per side effect.** The permission flow, the engine start, the outcome banner and the offline attach are four effects of "a shift started". They currently live in **two** places, and the one production uses is missing one of them | Move all four into `TrackingAutoStarter.startTrackingFor` and have `CodeStartScreen` call **that** instead of re-implementing it. One owner, one path |
| **A "fixed" label needs a path-level check.** | Re-open the GLOSSARY item and mark it fixed only when a test drives the real path |

**The fix, in one sentence:** make `CodeStartScreen._runPermissionFlowAndNavigate` call `shiftTrackingAutoStarterProvider.startTrackingFor(session, ...)` instead of duplicating the permission flow, the engine start and the outcome write.

**Why that is the right fix and not just "add one more `attachTrip` call".** Adding the call would close the symptom and leave the duplication: two permission-flow controllers (F-09), two engine-start call sites, two outcome writers. If the next feature changes the start sequence, one path gets it and the other does not. **This is the same root cause as F-09.** Fixing it properly closes F-09 and F-20 together.

**The one thing to check before doing it.** `TrackingAutoStarter.startTrackingFor` uses the **domain** `PermissionFlowController` (no rationale screens), while the production path uses the **UI** `UIPermissionFlowController` (with the four rationale screens the PRD requires). So the fix is not a one-line swap. The correct shape is: `UIPermissionFlowController` produces the `PermissionFlowReport`, and the **starter** owns the attach + the engine start + the outcome write. The rationale screens stay in the UI layer; the side effects move into the starter.

### A.2.2 F-08 — Shared-van conflict shows the wrong copy (issue #29, open)

`start_shift.dart:22-29` defines a typed `ShiftStartConflict` with **two distinct causes**:

| Line | Cause | Meaning |
|---|---|---|
| `:131` | `trip "$tripId" does not match this van` | The `vans.currentTripId` marker is stale |
| `:140` | `trip "$tripId" belongs to driver "X", not "Y"` | Another driver owns the van's open shift |

Both are thrown as an `Exception`, and `identity_flow.dart:245` catches `on Exception` and collapses them into `IdentityFlowPhase.startFailed`. The UI then renders `shiftStartFailed` = *"Couldn't start the shift. Check the connection and try again."* (`app_en.arb:15`).

A connection error and a busy shared van are different worlds. The driver is told to check their network when the network is fine and the van is occupied.

**What changed with ruling #27.** The new `resumeIfActive()` path (`identity_flow.dart:279-283`) catches the exception and returns `null`, so the driver stays on the welcome card and the **one-tap** Start then surfaces the same generic copy. So ruling #27 did not fix F-08, and it slightly widened the exposure: the conflict is now detected **twice** (once silently at launch, once on the tap), and both detections throw the information away.

**Recommendation (unchanged from the previous audit): split the failure into typed reasons.**

```dart
} on ShiftStartConflict catch (conflict) {
  state = state.copyWith(
    phase: IdentityFlowPhase.startConflict,
    conflictReason: conflict.reason,   // enum: staleMarker | vanHeldByAnotherDriver
  );
} on Exception {
  state = state.copyWith(phase: IdentityFlowPhase.startFailed);
}
```

Copy to add (both arb files, en + gu):

| Key | English | Gujarati intent |
|---|---|---|
| `identityShiftConflictTitle` | "This van is on shift" | Van par shift chal rahi hai |
| `identityShiftConflictOtherDriver` | "Another driver is on shift with this van. Check with the office, or tap Different driver." | Ye van doosre driver ke saath shift me hai |
| `identityShiftConflictStaleMarker` | "This van's shift record is out of date. Check with the office." | Is van ka shift record purana hai |

The CTA in the conflict state should be **Retry** plus a visible **"Different driver?"** link, because the realistic resolution on a shared phone is "that is not me, let me in as someone else".

**Do not** reuse `shiftStartFailed` for this. Its copy is about a connection, and the connection is fine.

**The copy is now decided. Q2, answered 2026-11-01 (agent recommendation, pending sign-off).**

| Change | What |
|---|---|
| **The enum grows a third reason** | `vanHeldByAnotherDriver`, `vanAlreadyClaimed`, `staleMarker`. The third comes from **Q1's first-claim race**: two phones, one valid code, one van. The loser gets "already claimed" |
| **The phase stays one** | One `startConflict` phase, one CTA layout, one set of arb keys. **Three separate screens would triple the work for no gain** |
| **A fourth key is added** | `identityShiftConflictClaimed` = *"This van is already set up on another phone. Check with the office, or tap Different driver."* |
| **The server sends the code, not the words** | The Functions return `vanAlreadyClaimed` / `vanHeldByAnotherDriver` / `staleMarker`. The app maps them to the arb keys. **A server that sends English text breaks localization the moment the copy is edited** |

**The full shape is in `docs/BACKEND-GO-blueprint.md` section 12, Q2.** The client's half is one `catch` block and four arb strings.

### A.2.3 F-09 — The permission flow runs twice (the previous description was wrong)

**What the previous audit said:** *"Permission flow runs twice after shift start: once in `code_start_screen.dart:62-93`, once in `shift_tracking_auto_start.dart:66-68`."*

**What is actually true at HEAD.** The two call sites exist, but **they are not both on the production path**:

| Location | Controller | When it runs |
|---|---|---|
| `code_start_screen.dart:93` | `UIPermissionFlowController` (UI, with rationale screens) | **Every** shift start. This is the production path |
| `shift_tracking_auto_start.dart:74` | `PermissionFlowController` (domain, no rationale) | **Only** from the D2 banner's Retry button, and only from `BasicRoutePlaceholder` (dead) |

So the driver does **not** see the four-stage rationales twice. The previous audit was wrong about that.

**What is actually wrong.** The problem is worse in a different way, and it is the same root cause as F-20:

> **The production start path re-implemented the F-D2 auto-start seam instead of calling it.**

`CodeStartScreen._runPermissionFlowAndNavigate` (`code_start_screen.dart:84-137`) duplicates the body of `TrackingAutoStarter.startTrackingFor` (`shift_tracking_auto_start.dart:62-108`):

| Effect of "a shift started" | `TrackingAutoStarter` (the seam) | `CodeStartScreen` (production) |
|---|---|---|
| Attach the trip to the offline drain | **Yes** (`:72`) | **No** ← F-20 |
| Run the permission flow | Yes (`:74`, domain) | Yes (`:93`, UI) |
| Start the tracking engine | Yes (`:79`) | Yes (`:98`) |
| Write the outcome banner state | Yes (`:104`) | Yes (`:118`) |

Three of four effects are duplicated; **the one that is missing is the data-integrity one**.

**There is also a real UX consequence.** The Retry button on the D2 banner (`live_route_screen.dart:467`) calls `starter.startTrackingFor(...)`, which uses the **domain** `PermissionFlowController` — **no rationale screens**. So a driver who denied a permission sees the four nice explanation screens the first time, and on Retry the app jumps straight at the raw OS dialog with no explanation. The two paths are not just duplicated, they behave **differently**.

**The fix.** Make the production path call the seam. Concretely:

1. `TrackingAutoStarter.startTrackingFor` should accept an optional pre-computed `PermissionFlowReport`, so the UI layer can run `UIPermissionFlowController` (with the rationales) and hand the result in. The seam then owns the attach + the engine start + the outcome write.
2. `CodeStartScreen._runPermissionFlowAndNavigate` then becomes: run the UI permission flow → hand the report to the starter → navigate.
3. `BasicRoutePlaceholder` is dead code and should be deleted (it is one of the two callers of the seam).

That closes **F-09 and F-20 together**, and it removes a duplicated block rather than adding one.

### A.2.4 F-05 — "Different driver?" keeps the stored code

`code_start_screen.dart:298-305` (`_enterChangeMode`) sets `_changeMode = true` and calls `resetToEntry()`. It never touches `DriverIdentityController.clearDriver()`. Verified: `grep -rn "clearDriver" lib/` returns only the definition at `driver_identity_controller.dart:121` — **no production caller**.

`GLOSSARY.md:109` records this as *"NOT A BUG: `resetToEntry` deliberately keeps the code ('only a new confirm overwrites it'), and the verified back-arrow seam depends on it."*

**The dependency is real**: `_exitChangeMode` (`code_start_screen.dart:312-320`) resets `_attemptedRememberedCode = null` so the auto-lookup re-runs for the remembered code. If the code were cleared on entry, that back arrow would have nothing to return to.

**The consequence is also real**: if the driver taps "Different driver?", types a *wrong* code, and backs out, the old code survives. The next launch auto-lookups the old code. That is correct for the "same driver, wrong entry" case and wrong for the "different colleague took the phone" case. The two intents need different behaviour, which the current single stored-code field cannot express.

**What changed with ruling #27.** This finding got **worse**, not better. Before, a colleague opening the phone landed on the welcome card and saw the **Name** and **Wards** rows before deciding. Now, with the auto-resume, if the previous driver's shift is still open, the app goes **straight to D2** with no card at all. The colleague is dropped into another driver's shift.

**The narrowing already in the code.** The zero-tap resume only fires for the **remembered** code, and `resumeIfActive` checks `trip.driverId != driver.id` (`start_shift.dart:133-144`). So a colleague is only dropped in if the phone's remembered code **is** the previous driver's code, which is exactly the shared-phone case. This is inherent to ruling #27, and the mitigation is procedural: **the shift must be ended before the phone is handed over.** That line should be in the office's handover script.

### A.2.5 F-11 — The session gate is not app-wide

`sessionGateProvider` (`firebase_bootstrap.dart:106-113`) is awaited in exactly one place: `identity_flow.dart:171`. The D2 providers (`openTripProvider`, `vanDocProvider`, `tripHistoryProvider` in `live_route_providers.dart`) read Firestore on their first frame without it. Since `b051183` hardened the gate so that only a **real** session releases it (a degraded boot does not), a D2 screen entered on a degraded boot still races.

**What changed with ruling #27.** The auto-resume path adds a **second** Firestore read (`_vans.readVan`) inside `resumeIfActive()`, plus the trip read inside `StartShift._resumeSession`. These run **after** the gate has already been released by the lookup, so they are safe. But the volume of reads on the launch path went up, and the 8 s gate cap (`sessionGateCap`) now covers a longer chain: gate → driver read → van read → route read → van read (resume) → trip read. On a slow connection that is six sequential round trips before D2. **This is worth measuring on the device** (the launch-time budget), because ruling #27 made the launch path network-bound.

### A.2.6 F-17 / F-18 — Doc drift (unchanged)

| File | Lines | Stale content |
|---|---|---|
| `docs/PRD-2-driver-app.md` | `:61`, `:126`, `:161`, `:201`, `:215`, `:222`, `:240`, `:265` | `verifyDriverPin`, "4-digit PIN", "van picker", "sign in with the returned token" — all superseded by §0.16 `:179` |
| `docs/DESIGN.md` | `:42`, `:65`, `:335`, `:356`, `:431`, `:433`, `:548`, `:558`, `:567`, `:569-589`, `:626`, `:681`, `:691` | Binny the mascot (§4.20), `PinPad`, "4 separate 56 × 64 boxes", "D1 Shift Start: Van picker + PIN" |

`docs/DESIGN.md` still describes an app that no longer exists. The code follows `docs/DESIGN-driver-app.md` (§9.1/§9.2/§9.6/§9.27). One of the two files is wrong, and the wrong one is 72 KB of wireframe prose.

---

## A.3 Corrected flow traces

### A.3.1 Fresh device, never opened the app

```
Splash (brand hold 1.0 s, hard cap 1.6 s, auto-advance; no buttons, no mascot)
  → WelcomeScreen
      "Welcome" / "Safaai Saathi is ready for today's shift." / [Get started]
  → 4-stage permission setup, contract order (PRD §0.13):
      locationWhileInUse → locationBackground → notifications → batteryOptimization
      (stops at the first non-grant; setupDone is written regardless)
  → setupDone = true   (SharedPreferences 'driverapp.identity.setupDone')
  → CodeStartScreen (entry form, no welcome card)
      6 OTP boxes (2 letters + dash as plain text + 4 digits), hint "XX-0000"
      [Continue] → await sessionGateProvider → read drivers/{CODE}
        SUCCESS  → _ConfirmCard: Name / Van / Wards count / masked Phone
                    [Start Shift] → create trip, vans.on_shift, FCM topic
                  → UI permission flow (run #1)
                  → trackingEngine.start(...)  ← the ENGINE, called directly
                  → set shiftTrackingAutoStartStatusProvider
                  → LiveRouteScreen
                    ⚠ attachTrip NEVER CALLED → F-20
        NOT FOUND → _NotFoundState   "Driver not found"
        FAILED    → _LookupFailedState "Couldn't check the code"
```

### A.3.2 Returning device, code remembered, no open shift

```
Splash
  → CodeStartScreen
      → _WelcomeCard renders from the FIRST FRAME
         "Welcome back" / "This phone remembers you."
         Name: Ramesh Patel
         Code: AB-1001
         Van: GJ-01-V-2201         ← ruling #28
         Route: West Loop          ← ruling #28
         Wards: 3 wards allotted
         [ Start my Shift ]    (pinned CTA)
         [ Different driver? ] (text link)
      → post-frame auto-lookup of the remembered code (gated, 8 s cap)
         → reads drivers/{CODE}, vans/{vanId}, routes/{routeId}
         SUCCESS → card keeps the five rows, CTA becomes live
         FAILURE → _WelcomeErrorBlock renders INSIDE the card
                    (title + body in the shared error tint), CTA = Retry
      → post-frame _maybeAutoResume() (ruling #27)
         → reads vans/{vanId} again → isResumable? NO → returns null
         → the card keeps its one tap
      → [ Start my Shift ] → start() → read vans/{vanId}
           currentTripId == null → create trip → van.on_shift → D2
             ⚠ attachTrip NEVER CALLED → F-20
```

### A.3.3 Returning device with an OPEN shift (ruling #27, zero-tap)

```
Splash
  → CodeStartScreen → _WelcomeCard renders (5 rows)
  → post-frame auto-lookup of the remembered code
       → reads drivers/{CODE}, vans/{vanId}, routes/{routeId} → confirmReady
  → post-frame _maybeAutoResume()      ← ruling #27
       → resumeIfActive()
          → reads vans/{vanId} again
          → isResumable? currentTripId != null && status == on_shift
          → StartShift.execute(van, driver, now)   ← THE SAME seam as a manual start
               → _resumeSession: read trips/{currentTripId}
                    trip.vanId != van.id    → ShiftStartConflict (stale marker)
                    trip.driverId != code   → ShiftStartConflict (other driver's van)
                    else                    → reattach, NO duplicate trip
          → shiftController.activate(session)
          → phase = onShift
       → on exception → return null, stay on the card (one tap still works)
  → CodeStartScreen sees phase == onShift → _runPermissionFlowAndNavigate()
       → UI permission flow → trackingEngine.start(existing tripId) → D2
         ⚠ attachTrip NEVER CALLED → F-20
```

### A.3.4 The two paths that are broken today (side by side)

```
                        TrackingAutoStarter.startTrackingFor()   CodeStartScreen (PRODUCTION)
                        (shift_tracking_auto_start.dart:62)      (code_start_screen.dart:84)
                        ───────────────────────────────────────  ────────────────────────────────
attachTrip(tripId)      ✅ :72                                     ❌ MISSING          → F-20
permission flow         ✅ :74 (domain, no rationale)             ✅ :93 (UI, rationale)
engine start            ✅ :79                                     ✅ :98
outcome banner write    ✅ :104                                    ✅ :118
reachable in prod?      ❌ only via the D2 Retry button            ✅ every shift start
```

---

## A.4 The rulings: two of the three this report asked for are taken, one is still open

**Plus one ruling this report did not ask for** (the depot auto-end, landed in `a1c33c9`). It is covered in **A.4.1**.

### Ruling 1 — F-19: launch-time resume. **TAKEN (#27). Zero-tap.**

The implementation, the risks it accepts, and the verification are in **A.1** above. Summary of the ruling: a returning device whose van still holds **this** driver's open shift resumes **without a tap**, reusing the existing `StartShift.execute` seam so the ownership wall is unchanged. Another driver's shift and an offline read both fall back to the one-tap card.

**The residual risk to carry into the handover notes:** on a shared phone, a colleague opening the device with the previous driver's shift still open is dropped into that shift. The ownership check cannot catch it, because the phone *holds* the previous driver's code. **The procedural mitigation is: end the shift before handing over the phone.**

### Ruling 2 — F-06: the welcome card. **TAKEN (#28). Five rows.**

Name, Code, Van plate, Route name, Ward count. The implementation, and the one deviation from this report's earlier recommendation (keeping the Code row), are in **A.1** above.

### Ruling 3 — F-08: shared-van conflict copy. **STILL OPEN (issue #29).**

The recommendation is unchanged and is written out in **A.2.2** above: catch `ShiftStartConflict` before the generic `Exception`, give the flow a typed `startConflict` phase with a reason enum, and add three arb keys in both locales. **Do not** reuse `shiftStartFailed` for it.

**What changed with ruling #27:** the conflict is now detected twice (once silently at launch by `resumeIfActive`, once on the tap by `start`), and both detections discard the reason. So F-08's exposure grew slightly while it waited.

### A.4.1 Ruling #29 (depot auto-end) — what it did to the findings

Ruling #29 landed in `a1c33c9`, **after** the first pass of this report. It is **not** one of the three rulings this report asked for. It is a **new client-side end-shift path**, and it moves two findings.

**What was built.** `vans.depot = {lat, lng}` is an admin-set tag. While a shift is live, the tracking engine feeds every fix to a pure `DepotDwellTracker`. After **3 continuous hours inside 500 m** of the depot, the shift ends by itself with the exact D5 write set (`trips.endedAt`, `vans.status = idle`, `vans.currentTripId = null`, tracking stopped, session cleared). D2 shows a notice and returns to D1.

| Piece | Where |
|---|---|
| The pure tracker | `lib/features/tracking/domain/depot_dwell.dart` |
| The shared write set | `lib/core/domain/end_shift_writes.dart` — `writeEndShift()`, now used by **both** D5 and the auto-end |
| The engine hook | `tracking_engine.dart` — `onShiftAutoEnded`, a 5-minute retry on a failed write |
| The UI notice | `live_route_screen.dart` — `_announceAutoEnd()` on `depotAutoEndProvider` |
| The rules | `firestore.rules:11-16` — `depot` is deliberately **absent** from the driver's `hasOnly` list, so it stays admin-only |

#### The good news: this partly closes the F-09 duplication problem

`writeEndShift()` is now **one** owner for the end-shift write set, and **both** entry points call it. That is exactly the "one owner per side effect" pattern this report asked for in A.5. The manual D5 flow and the auto-end **cannot drift**, because they share the function.

#### The bad news: it adds a THIRD client-side path to the same writes

| Path | Trigger | Who decides |
|---|---|---|
| **D5 manual** | The driver taps End Shift | The driver |
| **Depot auto-end** | 3 h parked inside 500 m | **The phone's own clock and GPS** |
| **The rules hole (B-01/B-02)** | Any signed-in anonymous caller | **Anyone** |

The third path is still the worst one, and it is still open. **The depot auto-end did not close B-02. It added a fourth legitimate writer to a field set that any anonymous caller can also write.**

#### Two concrete new consequences

**1. The auto-end is a client-side time decision, and the client clock is not trusted.**

`DepotDwellTracker.update(position, at)` compares `at.difference(since) >= limit` where `at` comes from the engine's injected clock (production: `DateTime.now()`). A phone with a wrong clock, or a driver who changes the clock, **ends the shift early**. The PRD itself calls out the app-killed case as *"the backend stale-shift sweep's job (later ticket)"*, so the server-side sweep is now an **acknowledged** need, not just my recommendation. It is **B-19** with a name on it.

**2. The retry is a 5-minute in-memory timer, and it dies with the process.**

`depotAutoEndRetryDelay = Duration(minutes: 5)`. If the app is killed between the failed write and the retry, the auto-end never happens, the trip stays open, and `vans.currentTripId` stays set. That is **exactly B-19** again, and it is now a **reachable production path** rather than a theoretical one.

#### What ruling #29 did NOT change

| Finding | Status after ruling #29 |
|---|---|
| **F-08** shared-van conflict copy | **STILL OPEN.** Ruling #29 is about parking, not about conflicts. Issue #29 is still open |
| **F-20** `attachTrip` never called in production | **STILL OPEN.** Re-verified at `a0cba52`. See A.2.2 |
| **F-09** permission flow duplication | **STILL OPEN** for the start path. Ruling #29 closed the **end**-shift duplication, not the start one |
| **B-01 / B-02** the rules hole | **STILL OPEN.** The depot rule does not touch the rules |
| **B-19** nothing clears a stale `vans.currentTripId` | **STILL OPEN, and now reachable.** The PRD names the fix as a "later ticket" |

#### The numbering collision, and why it matters

**The PRD's "ruling #29" and GitHub issue #29 are two different things.**

| Where | What #29 means |
|---|---|
| **PRD-2 §0.16 `:197`** and `GLOSSARY.md:27` | **Ruling #29 = depot auto-end.** Built in `a1c33c9` |
| **GitHub issue #29** | **F-08 shared-van conflict copy.** Still open, still needs a product call |

Rulings #27 and #28 happen to line up with GitHub issues #27 and #28, so the two numbering schemes looked like one. Ruling #29 breaks that alignment. **A future reader who sees "ruling #29" in the PRD and then opens GitHub issue #29 will read the wrong thing.**

**The fix is one line in the PRD.** Either the depot ruling gets a number that does not collide (the next free one is #31, since #30 is the audit-tracking issue), or the PRD says *"ruling #29 (depot), distinct from GitHub issue #29 (F-08)"*. **Recommendation: renumber the depot ruling to #31.** The PRD is the frozen contract, so the correction belongs there, not in a comment.

### A.5 How senior engineers solve this class of problem (the launch/identity class)

The user asked for the technical approach and the industry practice for each class of problem. Here it is for the launch and identity work.

| Problem class | The industry approach | Where this repo is |
|---|---|---|
| **A cold launch that races the auth session** | Never fire the first read before the credential exists. Gate on a **named future** that resolves on "session ready", with a **cap** so a dead backend cannot hang the screen | Done. `sessionGateProvider`, `identity_flow.dart:171`. The gap is that the gate is not app-wide (F-11) |
| **A relaunch that loses the in-memory session** | Persist the **minimum** that identifies the active work (here: the driver code and the van's open-trip marker), and re-derive the rest from the server | Done in two layers: the code in `SharedPreferences` (`driver_identity_controller`), the open trip in `vans.currentTripId`. The session itself is still in-memory (`shift_session.dart:58`) |
| **An idempotent "resume or create" decision** | **One** function owns the decision. Everyone else calls it. Never re-implement the branch | Correct: `StartShift.execute` owns it, and ruling #27 reused it rather than adding a second path. This is why #27 was a small, safe commit |
| **A shared resource with two legitimate users** | Model the conflict as a **typed error**, never as a generic failure. The caller decides the copy | Not done. `ShiftStartConflict` exists but is caught as `Exception` (F-08) |
| **A "fix" that lands in a method nobody calls** | Test the **path**, not the seam. A unit test on an unreached method is a false green | Not done, and this is exactly F-20. The `attachTrip` test calls `TrackingAutoStarter` directly; production calls something else |
| **A flow with four side effects in two places** | One owner per side effect. The UI layer owns **presentation**; the domain layer owns **effects** | Not done, and it is the shared root cause of F-09 and F-20 |
| **A shared device with several legitimate identities** | Two separate questions: *whose* device is this (the van), and *whose* shift is this (the driver). Answering both needs a device anchor | Half done: the **shift** side exists (§0.16), the **device** side does not. See B.4 |
| **A contract that is frozen but a requirement contradicts it** | Write the ruling into the contract, not just the code. The code change is the last step | Done correctly: rulings #27 and #28 are recorded in PRD-2 §0.16, DESIGN §9.27 and GLOSSARY, not only in the diff |

**The pattern to notice.** Four of the eight rows are the same lesson in different clothes: **one owner, one path, tested at the path.** F-09, F-20, F-08 and F-11 are all instances of a decision that lives in more than one place, or in a place nobody reaches.

---

# Part B — Backend / Firebase blueprint

This part answers the question *"I am planning to build the backend. What is missing, what is weak, and what should the target look like?"*

It is written for the Backend Owner. Everything here is verified against the current HEAD (`a0cba52`), not against the PRD's intentions.

## B.1 What exists today

| Firebase surface | Current state | Evidence |
|---|---|---|
| **Collections** | `wards`, `vans`, `vanSecrets`, `routes`, `trips`, `complaints`, `ratings`, `notices`, `staff`, `drivers` | PRD `:15-24` (§0.2). `drivers` added by §0.16 `:181`. `depot` added to `vans` by ruling #29 (PRD `:20`) |
| **Rules** | 7 collection matches. **Every single one is `request.auth != null`** | `firestore.rules:9-46` |
| **Storage rules** | 1 match. Any signed-in user, any path, any image, up to 20 MB | `storage.rules:10-15` |
| **Composite indexes** | 4 | `firestore.indexes.json` |
| **Cloud Functions** | 2: `verifyDriverPin`, `setDriverPin` | `functions/src/index.ts:34`, `:158` |
| **FCM (inbound)** | **None.** The app subscribes to topics but has no `onMessage` / `onBackgroundMessage` handler | `grep -rn "onMessage\|onBackgroundMessage\|getToken" lib/` → **0 hits**. See B-21 |
| **FCM (outbound)** | **None.** No Function sends a push | PRD `:55-63` lists 6 unimplemented Functions |
| **Emulators** | `auth` (9099), `firestore` (8080), `ui` (disabled). **No functions emulator, no storage emulator** | `firebase.json` `emulators` block. **Note: `firebase.json` is gitignored** (B-25) |
| **Auth** | Anonymous sign-in. No custom claims in use. No `signInWithCustomToken` call left in the app | `firebase_bootstrap.dart`; `grep -rn "cloud_functions\|HttpsCallable" lib/` → **no hits** |
| **App Check** | **Absent**. Not a dependency, not configured | `grep -rn "app_check\|AppCheck\|play_integrity" pubspec.yaml lib/ android/` → no hits |
| **CI** | **Absent**. No `.github/workflows/` | directory does not exist |
| **Android flavors** | **Absent**. Only `debug`, `profile`, `main` | `android/app/src/` |
| **Seed tooling** | 2 scripts: `seed_drivers.mjs` (drivers only, **defaults to the live project**), `read_trip.mjs` (read-only) | `scripts/`. See B-25 |
| **Dead dependencies** | `cloud_functions: ^7.0.1` is in `pubspec.yaml` but **nothing in `lib/` imports it** | `pubspec.yaml`; grep confirms |

## B.2 Gap register

### B-01 — The rules are authentication-only (P0)

**The finding.** Every collection match is `request.auth != null`. The app authenticates **anonymously** (`firebase_bootstrap.dart`, anonymous sign-in). An anonymous session is not an identity. Therefore:

> **Any anonymous user can read every driver's name and phone number, read and rewrite any trip, write any van, and update any complaint.**

| What an anonymous attacker can do today | Rule | Why it matters |
|---|---|---|
| Read `drivers/{code}` → `name`, `phone` | `firestore.rules:31` | **PII leak.** Every driver's phone number is enumerable. The code is a badge (public by design, §0.16 `:193`), so the phone is the only secret here and it is fully exposed |
| Read every `trips` doc → `gpsTrail`, `wardsDone` | `firestore.rules:34` | Full location history of every driver for every day |
| `create` **and** `update` any trip | `firestore.rules:37` | Rewrite a completed shift's history. Mark wards done that were never done. Forge `mockLocationDetected = false` to clear a tampering flag |
| Update any `vans` doc, including `status` and `currentTripId` | `firestore.rules:15-17` | **Van takeover.** Set another van's `currentTripId` to your own trip and `status = on_shift`. The dashboard then shows your van at their location |
| Update any `complaints` → `status`, `resolvedAt` | `firestore.rules:44` | Close a complaint against a citizen without ever visiting the ward |
| Read every `wards`, `routes`, `notices` doc | `firestore.rules:20, 23, 26` | Lower severity, but the same class |
| Write 20 MB of any image anywhere under `/apps/{appId}/media/**` | `storage.rules:12-15` | Storage abuse. The `{appId}` path segment is **never checked against anything** |

**Why the current stance does not cover this.** §0.16 `:193` says the code is a badge number, not a secret, and that *"the production wall is rules tightening + App Check per the production plan"*. That stance is **correct about the code** and **silent about everything the code unlocks**. The badge is public; the phone number, the trip history and the van are not.

**The fix, in one sentence:** bind the driver to the session so the rules can answer *"is this caller the driver whose van is this?"* — see **B.4** for the mechanism.

#### B-01 has been proven on a real emulator

This is not a reading of the rules file. A **17-probe harness** was run against a **real Firestore emulator** (port 8080) with a **real Auth emulator** (port 9099), using the repo's own `firestore.rules`. **17/17 probes matched the predicted result.**

| # | Probe | Predicted | Actual |
|---|---|---|---|
| 1 | `LIST drivers` (all driver docs, name + phone) | ALLOW | **ALLOWED 200** |
| 2 | `LIST vans` | ALLOW | **ALLOWED 200** |
| 3 | `LIST trips` | ALLOW | **ALLOWED 200** |
| 4 | `LIST complaints` | ALLOW | **ALLOWED 200** |
| 5 | `LIST notices` | ALLOW | **ALLOWED 200** |
| 6 | `GET vanSecrets/van-01` | DENY | **DENIED 403** |
| 7 | `LIST vans` with **no token** | DENY | **DENIED 403** |
| 8 | `GET drivers/{code}` with **no token** | DENY | **DENIED 403** |
| 9 | `PATCH vans/van-01` → `status` + `currentTripId` (**a foreign van**) | ALLOW | **ALLOWED 200.** After-state: `status=idle, currentTripId=trip-foreign` |
| 10 | `PATCH vans/van-02` → `batteryPct` (**a different van**) | ALLOW | **ALLOWED 200.** After-state: `batteryPct=1` |
| 11 | `PATCH vans/van-01` → `plateNo` (out of scope) | DENY | **DENIED 403** |
| 12 | `CREATE vans/van-99` | DENY | **DENIED 403** |
| 13 | `PATCH trips/trip-foreign` → `driverId`, `wardIds`, `alertedWardIds`, `endedAt` | ALLOW | **ALLOWED 200.** The write landed |
| 14 | `CREATE trips/trip-new` | ALLOW | **ALLOWED 200** |
| 15 | `PATCH complaints/foreign-complaint` → `status`, `escalationLevel`, `assignedTo` | ALLOW | **ALLOWED 200.** After-state: `status=resolved, escalationLevel=2, assignedTo=me` |
| 16 | `CREATE complaints/c-new` | ALLOW | **ALLOWED 200** |
| 17 | `CREATE drivers/AB-9999` | DENY | **DENIED 403** |

**What the probe proves beyond the reading.** Probe 9 is the worst one: an anonymous caller rewrote **another van's** `status` and `currentTripId`, and the write **landed**. Probe 13 rewrote a foreign trip's `driverId` and `wardIds`. Probe 15 closed a complaint and escalated it to level 2 in a single write.

**Probe 6 is the good news.** `vanSecrets` has **no rule at all**, so it is denied by default. That one is already correct, which matches PRD `:69`.

**The one caveat.** The emulator does not enforce composite indexes. A deliberately index-less control query (`routeId` + `vanId` + `driverId` + `date`) also returned **200**, so **a green emulator run is NOT proof of index coverage.** The index work (B-04) has to be reasoned from Firestore's documented rules and verified against the real project.

### B-02 — `trips` create has no ownership check (P1)

`firestore.rules:37` — `allow create, update: if request.auth != null;`

A `create` allows the caller to write **any** field of a **new** trip document, including `driverId`, `wardIds`, `vanId`, `date`, `startedAt`, `endedAt`, `wardsDone`, `gpsTrail`, `mockLocationDetected`. The client-side `StartShift` (`start_shift.dart:78-113`) builds a correct trip, but the rules do not enforce it.

**Minimum fix:** restrict `create` to the field set the app is allowed to set at creation, and forbid `driverId`/`wardsDone`/`gpsTrail`/`mockLocationDetected` from ever being set by anyone except the owning driver.

### B-03 — `vans` update scope includes the takeover fields (P1)

`firestore.rules:15-17` allows an update to `['lastLocation', 'status', 'batteryPct', 'currentTripId']`.

`lastLocation` and `batteryPct` are telemetry from the driver's own phone — fine in principle. `status` and `currentTripId` are **shift-ownership markers**. A client that can write them can claim a van. They should be writable only by a server-side transaction that verified the driver owns the open trip.

### B-04 — The notices OR query has TWO hard failures (P1, one is a cliff)

`firestore_notices_repository.dart:37-39`:

```dart
final query = wardBranch == null
    ? _notices.where(Filter.or(allBranch, vanBranch))
    : _notices.where(Filter.or(allBranch, vanBranch, wardBranch));
```

Three OR branches, each an AND of two fields:

| Branch | Fields |
|---|---|
| `allBranch` | `targetType == 'all'` |
| `vanBranch` | `targetType == 'van' AND targetId == vanId` |
| `wardBranch` | `targetType == 'ward' AND targetId whereIn [...]` |

#### Failure 1 — the missing multi-branch index

Firestore resolves a disjunctive query with a **multi-branch index**, one index per distinct field combination in the query. The repo currently declares a **single** composite on `(targetType ASC, targetId ASC)` (`firestore.indexes.json:19-26`), and the repository's own doc comment (`:10-12`) asserts *"no composite index is required beyond Firestore's automatic single-field indexes"* — that claim is wrong for an OR query with two or more field-equality branches.

**The practical symptom:** the query fails at runtime with `FAILED_PRECONDITION: The query requires an index`, and because `notices_flow.dart` maps a read failure to the degraded/offline phase, the driver sees an **empty or offline inbox** rather than an error. That is a silent failure, which is the worst kind.

`GLOSSARY.md:122` already lists this as an outstanding index seed for the Backend Owner: *"notices OR-branch sort"*.

#### Failure 2 — the 30-disjunction cap (THE CLIFF, verified on a real emulator)

**This one is sharper and it is not recorded anywhere in the repo.**

Firestore caps an `OR` query at **30 disjunctions after normalization**. A `whereIn` with N values inside an OR branch **normalizes into N separate disjunctions**. So the notices query's branch count is:

```
disjunctions = 1 (allBranch) + 1 (vanBranch) + N (wardBranch, one per ward id)
```

| Wards on the route | Normalized disjunctions | Result |
|---|---|---|
| 28 | 30 | **HTTP 200. Works** |
| **29** | **31** | **HTTP 400.** `"Too many disjunctions after normalization. Result had 31 disjunctions which is more than the maximum of 30"` |
| 31 | 33 | HTTP 400 |

**Verified on a real Firestore emulator** with the repo's own `firestore.rules` and the exact query shape. The probe was run in a throwaway `/tmp` copy.

**So the D3 Notices screen dies at 29 wards on a route.** Not at 30. At **29**. And it dies with a hard HTTP 400, which `notices_flow.dart` maps to the degraded/offline phase, so the driver sees an **empty inbox**.

**Why this is worse than B-06.** B-06 (`whereIn` over 30) is **latent**: production uses `watchRouteWards` (`where('routeId', isEqualTo: ...)`), not `whereIn`, so it has not fired. This one is **live**: `watchNotices` is the production query and it is called with the route's full ward list. A route with 29+ wards breaks the inbox today.

**The compounding factor.** The seed data has 3 wards, so this has never fired. But the PRD's model is **one van serves one route, and a route serves many wards**. A municipal route in a real taluka can easily have 29+ wards.

**Two fixes, and the second one is the real answer.**

| Fix | How | Cost |
|---|---|---|
| **A. Chunk the query** | Split the ward list into groups such that each query's normalized disjunction count stays ≤ 30. With 3 fixed branches, each query can carry at most **27** ward ids. Run the chunks and merge | Zero schema change. But the number of queries grows with the ward count, and the merge is client-side |
| **B. Denormalize the notices query** | Do not query `notices` by a list of ward ids at all. Instead maintain a **per-van inbox** collection: `notices/{id}/targets/{vanId}` or a `vanNotices/{vanId}/{noticeId}` collection written when the notice is created | A contract change. But the query becomes a simple `where('vanId', isEqualTo: ...)` with **no OR at all**, and it scales to any number of wards |

**Recommendation: A now, B when the first 29-ward route appears.** Fix A is a repository change with no contract change, and it makes the cliff go away. But fix B is the shape that scales, and it also fixes the multi-branch index problem (B-04 failure 1) at the same time, because a single-field query needs no composite index.

**What to do about the index.** If you ship fix A, you still need the multi-branch index for the chunked queries. If you ship fix B, you need **no notices index at all**. That is a strong argument for B.

#### Failure 3 — the false comment

`firestore_notices_repository.dart:10-12` asserts *"no composite index is required beyond Firestore's automatic single-field indexes"*. **That is false** on two counts: the OR query needs a multi-branch index, and the query can exceed the disjunction cap entirely. Correct it whichever way you go, or the next developer will trust it.

### B-05 — Complaints over-fetch, then filter on the client (P1)

`firestore_complaints_repository.dart:35-48` fetches every complaint in the day window for the route's wards and then filters the status in Dart:

```dart
.where('category', isEqualTo: 'missed_collection')
.where('wardId', whereIn: wardIds)
.where('createdAt', isGreaterThanOrEqualTo: dayStart)
.where('createdAt', isLessThan: dayEnd)
.snapshots()
.map(... .where((complaint) => statuses.contains(complaint.status)) ...)
```

The class comment explains why: *"Firestore does not allow two `whereIn` clauses in one query"* (`:12-13`), which is **true** — Firestore rejects a query with more than one `in`/`not-in` clause.

**Consequence.** Every resolved complaint for the day is downloaded and thrown away. The `status` field is not in any index. On a busy route this is waste, and it will grow linearly with complaint volume.

**Two honest fixes:**

| Option | How | Cost |
|---|---|---|
| **A. Keep it client-side, bound it** | Keep as is, but add `orderBy('createdAt', descending: true).limit(200)` so the fetch is bounded | Zero schema change. Still over-fetches |
| **B. Denormalize the open set** | Add a `pendingStatuses` array field to each complaint; query `.where('pendingStatuses', arrayContainsAny: statuses)` | Needs a contract field (Backend Owner) and a 4-field composite index `(category, wardId, createdAt, pendingStatuses)`. Firestore supports **one** `array-contains-any` alongside a `whereIn`, so this removes the conflict |

Recommendation: **A now** (it is a one-line change and removes the unbounded read), **B when the complaint volume actually hurts**. Do not change the contract for this before it is measured.

### B-06 — `whereIn` is capped at 30 values (P2)

`firestore_wards_repository.dart:22` — `.where(FieldPath.documentId, whereIn: ids)`. Firestore caps an `in`/`not-in` clause at **30 values**. The route's ward list is the input, so a route with more than 30 wards breaks the read.

`GLOSSARY.md:120` tracks this: *"whereIn >30-ward chunking (ruling 12) — build when demo routes exceed 30 wards"*. The seed data tops out at 3 wards, so it has not fired yet.

**Fix:** chunk the id list into groups of 30 and merge the results. The repository is the right place — one implementation, every caller benefits.

**Note:** `readWardsByIds` currently has **no production caller** (only `dev/desktop_demo_seed.dart:329`), so production uses `watchRouteWards` (`where('routeId', isEqualTo: routeId)`), which has no `whereIn` cap. This gap is therefore latent, not live.

### B-07 — `trips.gpsTrail` is one unbounded array (P1)

`firestore_trips_repository.dart:35-38` appends with `FieldValue.arrayUnion`. Firestore caps a document at **1 MiB**. The measured numbers are in `GLOSSARY.md:89`:

> *"5 h at 1 Hz ≈ 18 k pts ≈ 1 MB, at the 1 MiB doc limit (backend admin write of 5000 pts took 3.3 s)."*

A long shift on a slow route will hit the ceiling, and then **every trail append fails** — the shift silently stops recording location, and the offline queue grows without bound. The write-latency side is already bounded (`maxTrailBatchPoints = 1000`, `maxTrailBufferPoints = 5000`), but the **document size** is not.

**Fix: shard the trail.** The standard shape is a subcollection:

```
trips/{tripId}                     <- the shift header
trips/{tripId}/trail/{seq}         <- one chunk doc per flush, seq = 0,1,2...
  { points: [...], from: t, to: t }
```

Each chunk doc stays small; the shift doc stays small; reads of the trail become a subcollection query ordered by `seq`. The office app reads the chunks in order. The client's `appendGpsTrail` becomes a `set` on `trail/{seq}` instead of an `arrayUnion`, which is also **cheaper** (no read-modify-write of a growing array).

This is a **contract change** and therefore a Backend Owner decision. It should happen before the demo, not after a real shift loses its trail.

### B-08 — `verifyDriverPin` is dead code that is still deployed (P1)

| Evidence | Finding |
|---|---|
| `grep -rn "cloud_functions\|FirebaseFunctions\|HttpsCallable" lib/` → **no hits** | The app never calls it. §0.16 `:179` says so explicitly |
| `pubspec.yaml` still declares `cloud_functions: ^7.0.1` | A dead dependency on every build and every APK |
| `functions/src/index.ts:34-147` | 114 lines of live, reachable, rate-limited-but-attackable code |
| `GLOSSARY.md:131` | *"deployed and live on `safaaisaathi-63a87` ... `firebase functions:log --only verifyDriverPin` shows PIN-verified hits"* |

**Why it matters even though nothing calls it.** A deployed callable is a public endpoint. `verifyDriverPin` accepts `{vanId, pin}`, compares against `vanSecrets/{vanId}.driverPinHash`, and **mints a custom auth token with a `vanId` claim** (`functions/src/index.ts:137-139`). It is rate-limited to 5 tries per 10 minutes *per van*, which means an attacker with the seeded demo PINs can authenticate as a van — and a custom token with a `vanId` claim is exactly the kind of thing a tightened rules model would want to trust.

**Fix:** delete the Function, delete `vanSecrets` seeding, delete the `cloud_functions` dependency, and delete the `vanSecrets` collection from the contract. The `drivers` collection already replaced it. Do this in the same change that introduces the new auth model, so there is no window where both exist.

### B-09 — `setDriverPin` has a live bypass flag (P1)

`functions/src/index.ts:173-188`:

```dart
const demoBypass = process.env.DEMO_SEED_BYPASS === "true";
if (!demoBypass && !request.auth) { throw ... }
if (!request.auth && demoBypass) { logger.warn(...); }
```

If `DEMO_SEED_BYPASS=true` is set in the Functions environment, **anyone can set the PIN hash for any van with no authentication at all**. `GLOSSARY.md:180` names the fix: *"Before prod: kill `DEMO_SEED_BYPASS` in `setDriverPin`"*.

**Fix:** delete the function and the flag together. Both exist only to seed the old PIN flow, which is dead (B-08). There is no reason to keep an unauthenticated write path to `vanSecrets` for a flow the app no longer uses.

### B-10 — No App Check (P1)

`grep` over `pubspec.yaml`, `lib/`, `android/` returns nothing. `GLOSSARY.md:175` names it as one of the three real walls:

> *"(2) **App Check + Play Integrity** (rejects any client that isn't the real signed app — kills scripted key abuse)"*

Without it, the API key in the APK is the only thing standing between the internet and the anonymous-auth surface that B-01 describes. App Check does not replace the rules; it reduces the population of callers that can reach them.

**Order matters:** App Check without tightened rules is theatre. Tighten the rules first (B-01), then add App Check as the second wall.

### B-11 — `notices` has no read-state (P2)

`GLOSSARY.md:128`: *"the 0.2 `notices` shape has NO read field, so unread markers reset on restart/shift end"*.

The unread dot is **session-local** today (`notices_flow.dart` keeps an in-memory `unread` set). For a driver who gets a notice while the app is closed, the notice arrives with no indication it is new, and the same notice looks new every launch until it is opened.

**Fix:** add a per-driver read receipt. Two shapes:

| Shape | Write cost | Read cost |
|---|---|---|
| `notices/{id}/receipts/{driverCode}` subcollection | One doc per read | One extra read per notice shown |
| `notices/{id}.readBy: [driverCode]` array | `arrayUnion` on the notice | The notice doc grows with the driver count — fine for a van-scoped notice, wrong for an `all` notice |

Recommendation: the **subcollection**, because `targetType = 'all'` notices are read by every driver and an array on the notice doc would grow without bound. This is a contract change, so it needs a Backend Owner ruling.

### B-12 — No staff push on mock-location detection (P2)

`GLOSSARY.md:129`: *"no contract Cloud Function exists (ruling 7)"*.

The app latches `trips.mockLocationDetected = true` (`tracking_engine.dart:359-371`) and never clears it, but nobody is told. The office finds out by opening the dashboard.

**Fix:** a Firestore-triggered Function on `trips/{id}` where `mockLocationDetected` transitions `false → true`, sending an FCM push to the staff topic. The latch is already a one-way transition, which makes it a clean trigger condition.

### B-13 — `drivers` has no audit fields (P2)

`drivers/{CODE}` carries `name`, `phone`, `vanId`, `routeId`, `wardIds`, `active` (§0.16 `:181`). Nothing records **when** an allotment changed or **who** changed it. When a driver complains that their ward list is wrong, there is no way to answer when it changed.

**Fix:** add `updatedAt` (server timestamp) and `updatedBy` (admin uid). Writes are admin-only today (Firestore console), so `updatedBy` is a human name for now and a uid once PRD-3 exists.

### B-14 — No CI (P1)

There is no `.github/workflows/` directory. Every check is manual, on one machine, by one agent. `GLOSSARY.md:178` specifies the target pipeline:

> *"test → `flutter build appbundle --release --flavor prod` → signed AAB → Play Store"*

**Minimum viable CI, in order:**

| Step | Command | Gate |
|---|---|---|
| 1 | `flutter pub get` | fails on a broken lockfile |
| 2 | `flutter analyze` | must be clean |
| 3 | `flutter test` | must be green |
| 4 | `flutter build apk --debug` | catches Gradle/manifest breakage |

Steps 1-3 need no secrets and can run on every push today. Step 4 needs the Android SDK on the runner. The release AAB needs the keystore and `google-services.json` as CI secrets, which is a later step because the flavors do not exist yet (B-15).

**The rules tests should also live here.** See Part D.

### B-15 — No Android flavors (P2)

`android/app/src/` has only `debug`, `profile`, `main`. `GLOSSARY.md:177` wants `productFlavors { dev / prod }` with one `google-services.json` per flavor, so that the Dart code calls plain `Firebase.initializeApp()` instead of the current `--dart-define` dance.

Today the dev workflow is: `.env` (gitignored) → `scripts/run_device.sh` → `--dart-define-from-file`. It works, and `GLOSSARY.md:166` says to keep it unchanged for dev. Flavors are the **prod** mechanism, and `GLOSSARY.md:118` sequences them *after ticket 14*.

**Do not do this during the demo.** It restructures the Android build, and the runbook at `GLOSSARY.md:166-170` is load-bearing for every device rehearsal.

### B-16 — Storage rules are loose and the path is meaningless (P2)

`storage.rules:10-15`:

```
match /apps/{appId}/media/{allPaths=**} {
  allow read: if request.auth != null;
  allow write: if request.auth != null
    && request.resource.size < 20 * 1024 * 1024
    && request.resource.contentType.matches('image/.*');
}
```

Issues:

1. `{appId}` is a **path segment that is never checked**. Any caller can pick any `appId`.
2. `read: if request.auth != null` means **every driver can read every other driver's uploaded photos**.
3. `allow write` has **no `delete` and no `read` symmetry** — actually there is no `delete` rule at all, so deletes are denied by default. Fine, but worth being explicit.
4. Nothing in `lib/` uses Firebase Storage today (no `firebase_storage` dependency), so these rules guard a future feature.

**Fix, when the feature lands:** scope the path to the driver (`media/{driverCode}/...`), check `{driverCode}` against the caller's session, and set the size limit to what the app actually uploads (20 MB for a phone photo is generous).

### B-17 — The emulator suite cannot run the Functions or Storage (P2)

`firebase.json` `emulators` block declares `auth`, `firestore`, `ui` only. So:

- A local run of `functions/` is impossible without deploying.
- Storage rules cannot be tested locally.
- **The Firestore emulator does not enforce composite indexes.** This is the important one: B-04's missing notices index will pass every emulator test and fail in production. Any index change must be verified against the real project.

**Fix:** add `"functions"` and `"storage"` to the emulators block. `functions` needs the Functions runtime installed (Node 18+). This is a small change with a large effect on how confidently the backend can be tested.

### B-18 — `readVans()` is a dead full-collection read (P2)

`firestore_vans_repository.dart:17-20`:

```dart
Future<List<Van>> readVans() async {
  final snapshot = await _vans.get();      // reads EVERY van
  ...
}
```

Verified: **no production caller.** The only implementors are `dev/desktop_demo_seed.dart:95` and the test fakes. The old D1 van picker that needed it was deleted in `3cc1148`, but the interface method (`vans_repository.dart:12`), the Firestore implementation and the fake all survived.

**Why it still matters:** the method is live code that the rules permit. `firestore.rules:10` allows reading the whole `vans` collection to any signed-in user, so the method is a ready-made enumeration helper for anyone who adds a call. And it reads a collection that has no `where` filter at all.

**Fix:** delete `readVans` from the interface, the Firestore adapter and the fakes. One adapter means a hypothetical seam; three copies of a dead method mean three places to forget.

### B-19 — Nothing clears a stale `vans.currentTripId` (P2)

`start_shift.dart:139` says: *"The trip is NEVER rewritten here; the admin console clears the marker instead."*

**There is no admin console.** It is PRD-3, out of scope. So today, if a trip's `driverId` does not match the van's current driver, the conflict is permanent and the only human remedy is opening the Firestore console by hand.

**Fix, in the absence of an admin console:** a scheduled Function that clears markers whose trip is closed and older than N hours, or a nightly reconciliation job. At minimum, document the manual procedure so the demo is not blocked by a stale marker.

### B-20 — The `functions/lib/` build artifact is stale (P1, a deploy trap)

`functions/package.json` declares `"main": "lib/index.js"`. That is the file **Firebase deploys**.

| File | Timestamp |
|---|---|
| `functions/src/index.ts` | **Oct 29, 04:50** |
| `functions/lib/index.js` | **Oct 28, 01:15** |

**The compiled artifact is 27 hours older than the source.** If someone runs `firebase deploy --only functions` without `npm run build` first, **the old code goes live** and the edit appears to have been ignored.

`functions/lib/` is gitignored, so **a fresh clone has no `lib/` at all** and the deploy would fail with a missing `main`. That is the safer failure, but it means **the first deploy from a fresh clone must include a build step.**

**Fix:** make the build part of the deploy, not a step someone remembers.

| Where | How |
|---|---|
| **CI** | `npm ci && npm run build && firebase deploy --only functions` as three explicit steps, never `npm run deploy` alone |
| **`package.json`** | Change `"deploy"` to `"npm run build && firebase deploy --only functions"` so the wrong command is impossible |
| **Locally** | The same. The current `"deploy": "firebase deploy --only functions"` is the trap |

**The general lesson.** A `main` that points at a build artifact creates a two-step deploy where the first step is optional. Make the artifact's freshness a **precondition**, not a habit.

### B-21 — There is no inbound FCM handler (P1)

Verified: `grep -rn "onMessage\|onBackgroundMessage\|getToken" lib/` returns **zero hits**.

**What this means.** The app **subscribes** to FCM topics but never **receives**. A push lands in the system tray and nothing else happens.

| What should happen | What happens today |
|---|---|
| The notification appears in the tray | **Yes.** The FCM SDK handles this |
| The app's unread badge updates | **Only via the Firestore stream.** `notices_flow.dart:94-96` watches the collection |
| Tapping the notification opens the right screen | **No handler.** The default opens the launcher |
| A notice arrives while the app is closed | The badge is **wrong** until the app is opened and the stream runs |

**PRD `:237`'s acceptance criterion** is *"a notice sent from the admin panel arrives as a push within 10 seconds"*. That is **half-met**: the notification does appear, but the app does not know about it.

**The fix.** Two handlers.

| Handler | When | What it does |
|---|---|---|
| `FirebaseMessaging.onBackgroundMessage` | The app is terminated | A **background** isolate. It cannot touch the UI, but it can write to Firestore or update a local store so the badge is right when the app opens |
| `FirebaseMessaging.onMessageOpenedApp` | The user taps the notification | Navigate to the right screen with the notice id as an argument |

**The payload shape.** The push must carry the notice id, so the handler can navigate:

```json
{
  "notification": { "title": "...", "body": "..." },
  "data": {
    "type": "notice",
    "noticeId": "abc123",
    "targetType": "van",
    "targetId": "van-01"
  }
}
```

**The privacy note.** A `notification` payload is rendered by the OS **even when the app is closed**, so its body is visible on the lock screen. If the notice text is sensitive, use a `data`-only payload and render it in-app. For a municipal garbage app the notice text is not sensitive, so the simple shape is fine.

### B-22 — The van topic is never unsubscribed (P1)

Verified: `grep -rn "unsubscribeFromTopic" lib/` returns **zero hits**.

`start_shift.dart:156-162` subscribes to `van_{vanId}` at shift start. **Nothing ever unsubscribes.**

**The consequence on a shared van.** Driver AB-1001 works the morning shift on `van-01` and subscribes to `van_van-01`. He goes home. AB-1002 takes the evening shift on the same van. **AB-1001's personal phone now receives `van_van-01`'s notices** for the rest of his life, because the subscription is a **device** subscription that outlives the shift.

**The fix.** Unsubscribe at End Shift, next to where the subscription happens:

```
start_shift.dart  → _subscribeVanTopic(vanId)
end_shift_flow.dart → _unsubscribeVanTopic(vanId)
```

**The one caveat.** A crash mid-shift leaves the subscription. That is why a **scheduled cleanup** is also worth having: a Function that clears a device's topic subscriptions when the trip is closed. That needs a **topic registry** (B-23).

### B-23 — There is no topic registry (P2, and it blocks B-21 and B-22)

FCM topics are **device-local**. The server cannot know which device is on which topic without being told.

| What needs a registry | Why |
|---|---|
| **B-22's cleanup** | The server must know which device to unsubscribe |
| **Targeted pushes** | To push to **one driver's phone** (the mock-location alert, the escalation alert), the server needs that driver's FCM token. A topic cannot address one person on a shared van |
| **The admin panel's "notify this driver"** | Same |

**The registry.** A `topicSubscriptions/{uid}` collection:

| Field | Type | Notes |
|---|---|---|
| `uid` | string | The Firebase uid. The doc id |
| `topics` | array of string | `['all', 'van_van-01']` |
| `vanId` | string? | Which van this device is currently working |
| `fcmTokens` | array of string | The device's tokens, for targeted pushes |
| `updatedAt` | Timestamp | |

**Who writes it.** The client, on every subscribe/unsubscribe. **But** the client writing to its own doc needs a rule: `allow write: if request.auth.uid == uid`. That is a **new collection and a new rule**, and it must be added to the rules rewrite (B.6), not after.

**The alternative that avoids a registry.** Push to **staff topics** instead of device tokens: `staff_{staffId}` for the escalation and the missed-collection alerts. PRD `:58` already specifies `staff_{inspectorId}`. That covers the admin's needs without a registry. The registry is only needed for **driver-targeted** pushes, and the only one of those is the mock-location alert (B-12), which goes to the **office**, not to the driver.

**Recommendation:** use **staff topics** for now (no registry needed), and add the registry only when a driver-targeted push is actually required.

### B-24 — `flagged` is decided by the client (P1)

`mark_ward_done_flow.dart:166-187` computes `flagged` **on the phone**:

```dart
// vs the ward centre/radius. A null fix cannot prove "inside" → flagged
? (withinRadius: false, flagged: true)
...
flagged: decision.flagged,
```

**What `flagged` means.** PRD `:229`: *"If the van is outside that ward's `radiusM`, still allow it but set `flagged = true` on that `wardsDone` entry for admin review."* It is the **tamper signal** for the office: *"this driver marked a ward done without being there."*

**Why the client deciding it is a hole.** The rules cannot check it, because the client is the one asserting it. A client that computes `flagged: false` writes `flagged: false`, and the office sees a clean record. The current rules do not restrict the `trips` update fields at all (`firestore.rules:37`), so **any field of any trip can be set to anything**.

**The honest severity.** This is **not** a data-integrity bug in the app (the app computes it correctly). It is a **missing authorization boundary**. The fix is the same as B-02: make the trip update field-restricted and move the `flagged` computation server-side, where the server knows the van's **last written** location.

**The server-side rule.** The server compares the van's `lastLocation` against the ward's `center` + `radiusM`. The subtlety: the **last written** location may be up to `HEARTBEAT_SEC` (30 s) old, and it is only written when the van moved 15 m or 30 s passed. So the server's answer is "as of the last write, the van was inside", not "the van was there at the exact tap". That is **good enough** for an admin-review flag, and it is **honest**, which the client version is not.

**A note on `wardsDone` duplicates.** `firestore_trips_repository.dart:29-31` uses `arrayUnion` on the **whole entry** (`{wardId, doneAt, flagged}`). `arrayUnion` matches on **value equality**, so the same ward with a **different** `doneAt` is a **different** value and gets **appended**. Two taps on the same ward produce **two entries**. The client dedupes locally (`mark_ward_done_flow.dart:138-141`), but the server does not. This is another argument for the `markWardDone` callable (B.3, row 5).

### B-25 — The seed script writes to the LIVE project (P1)

`scripts/seed_drivers.mjs:14-16`:

```js
projectId: process.env.FIREBASE_PROJECT || 'safaaisaathi-63a87',
```

**The default is the live production project.** One stray `node scripts/seed_drivers.mjs` with no env var writes to production.

**It is also incomplete.** It seeds **4 driver docs only**. There is **no** seed script for `vans`, `routes`, `wards`, `notices`, or `staff`. PRD `:160` says *"Done when every app boots and reads `wards` from the emulator"* — and `wards` has **no seed at all**.

**The composite problem:** a fresh Firebase project has **no vans, no routes, no wards**. The demo data was seeded by hand, once. `GLOSSARY.md:167` lists it as a live prerequisite, not as a script.

**The fix, three parts.**

| Part | How |
|---|---|
| **A separate emulator seed** | `emulator/seed.json` + an import step, so `firebase emulators:start --import=./emulator/seed.json` gives a full dataset |
| **A guarded live seed** | The live script must **require** `FIREBASE_PROJECT` explicitly, with **no default**, and refuse to run against a project whose name contains `prod` |
| **A full reference-data seed** | One script that seeds `vans`, `routes`, `wards`, `notices`, `staff` and `drivers`, idempotently (`{merge: true}`) |

**And one more thing.** `firebase.json` is **gitignored** (`.gitignore:53`), so a fresh clone has **no emulator configuration at all**. That is why the emulator config must be committed. It contains **no secrets** (the project id is in `.firebaserc`), so there is no reason to ignore it.

## B.3 Which decisions belong on the server

**The short version is here. The long version, with the offline case spelled out and the Firebase-versus-custom decision, is `docs/BACKEND-GO-blueprint.md` section 2.4.** Read that section if you are writing anything new. The one-line version:

> **The rules decide who may, the Functions decide what is true, the device decides how it behaves. And the device must keep working when the network does not.**

| Decision | Owner today | Should move to the server? | Why |
|---|---|---|---|
| **Trip creation vs duplicate prevention** | Client (`start_shift.dart:64-74`) | **Yes** | The client decides "resume or create" by reading a `vans` doc. Two clients on one van can both read "no open trip" and both create a trip. A transaction on the van doc makes it atomic |
| **Van ownership / shared-van conflict** | Client (`start_shift.dart:121-152`) | **Yes** | The check reads `trips/{id}.driverId` and compares. It is correct logic in the wrong place: the rules do not enforce it, so any client can skip it |
| **Trip day-window (IST)** | Client (`ist_clock.dart`) | **Yes, partially** | The client computes the IST frame and writes `trips.date` as the IST midnight instant. That is consistent, but the *day key* should be a server-computed field so history queries do not depend on any client's clock. The current fix (issue #15) made the client self-consistent, not correct against a bad clock |
| **Mock-location flag** | Client (`tracking_engine.dart:359`) | **Yes, for the notification** | The app may set the latch (the trip is the driver's own), but the **staff push** must be server-side (B-12) |
| **Ward completion / out-of-order marking** | Client (`mark_ward_done_flow.dart`) | **Yes** | `wardsDone` is appended with `arrayUnion`, which is not idempotent. Two taps produce two entries for the same ward. A server-side append that checks for an existing `wardId` makes it idempotent |
| **Complaint status transitions** | Client (`firestore_complaints_repository.dart:52-62`) | **Yes** | `status` and `resolvedAt` are written directly. A transition table (only `open → assigned` or `open → resolved`) cannot be expressed in a client write |
| **Driver active/inactive** | Admin write (§0.16 `:181`) | **Already correct** | The app only reads it. `identity_flow.dart:163` treats `active == false` as not-found |
| **Driver code normalization** | Client (`driver.dart:8-17`) | **No** | Pure input validation, no server state involved. The regex `^[A-Z]{2}-[0-9]{4}$` is the contract; enforcing it server-side too is cheap defence-in-depth but not load-bearing |
| **Van status transitions** | Client (`start_shift.dart:104-105`) | **Yes** | Same duplicate-trip problem. `vans.status` and `vans.currentTripId` must move together, atomically |
| **Location write policy** | Client (`write_policy.dart`) | **No** | A battery-throttling decision, not a data-integrity one. The server should not second-guess it |
| **Trail chunking / sharding** | Client writes `arrayUnion` today | **Yes** | See B-07. The document shape is a server contract |
| **The `flagged` tamper flag** | Client (`mark_ward_done_flow.dart:166-187`) | **Yes** | B-24. It is an admin-review signal, so it must be computed by something the client cannot lie to. The server's "as of the last write" answer is honest; the client's is not |
| **`wardsDone` de-duplication** | Client dedupes locally, `arrayUnion` on the whole entry | **Yes** | B-24. `arrayUnion` matches on value equality, so a different `doneAt` is a different value and gets appended. The server must key on `wardId` |
| **The trip's `date` / `startedAt`** | Client clock (`start_shift.dart:85,88`) | **Yes** | A phone with a wrong clock writes the trip into the wrong day. The server's clock is the only one that can be trusted |
| **The driver's `active` flag** | Client filter only (`identity_flow.dart:174-179`) | **Yes** | An inactive driver can currently create a trip, because the rules ignore the flag entirely |
| **Which topics a device is on** | Nowhere | **Yes, if targeted pushes are needed** | B-23. A topic cannot address one person on a shared van |

**The general rule.** If a decision can be made wrong by two honest clients racing, it belongs on the server. If it is a device-behaviour decision (battery, cadence, permission), it belongs on the client. **A third rule, learned from B-24:** if the decision is a **signal about the client's honesty** (the `flagged` tamper flag), it belongs on the server, because the client is exactly the party you do not trust.

**And the reason "everything on the server" is wrong.** The driver's network dies mid-shift. **The trail buffer and the offline queue have to stay on the device**, or the app stops working in a dead zone. **The server's writes must be idempotent**, or a repeated flush corrupts the trip. That constraint is why the server's ward append keys on `wardId` and the trail chunks are immutable. **See GO blueprint section 2.4.6.**

## B.4 The identity question — answer this before anything else

Every other backend decision depends on one question: **what proves that the person holding this phone is the driver they claim to be?**

Today the answer is **nothing**. The driver code is a badge number (§0.16 `:193`), it is the document id of `drivers/{CODE}`, and `firestore.rules:31` lets any signed-in user read any driver document. So driver AB-1001 can read AB-1002's record and start a shift under AB-1002's name, and `trips.driverId` becomes self-reported.

**The hardware reality, from `GLOSSARY.md:7-8`:** *"One van serves one route and carries one tracked Android phone."* The **phone is the van's**. The driver is a person who borrows it. That fact should drive the design.

### The model I recommend: two factors, different jobs

| Factor | What it proves | Where it lives |
|---|---|---|
| **Device binding** | *This phone is van-01's phone.* | `vanDevices/{vanId}` + an auth claim |
| **Driver code** | *This shift is attributed to AB-1001.* | `drivers/{CODE}` + `trips.driverId` |

With device binding in place, the code is free to stay a **public badge** (it no longer has to carry the whole burden of identity), and the rules finally have something to scope on.

**What it fixes immediately:** B-01 (rules can check `request.auth.token.vanId`), B-02 (a trip write is scoped to the bound van's device), B-03 (`vans.status` / `currentTripId` become server-only writes).

**What it does NOT fix, and must be stated honestly:** two drivers allotted the *same* van can still attribute a shift to each other, because the code carries no secret. The seed data has exactly this shape (`AB-1001`, `AB-1002`, `AB-1004` all on `van-01`). This is a **physical-co-location constraint** — the impersonator must be holding the van's phone — so it is a low-severity residual, but it is real and it should be a conscious acceptance, not an oversight.

### The ladder if stronger accountability is wanted later

| Option | Mechanism | Server work | Strength | Cost |
|---|---|---|---|---|
| **A. Device binding only** | The model above | 1 callable + 1 rules rewrite | Van-level authorization. Driver attribution is self-reported | Low |
| **B. Device binding + per-driver PIN** | Add `drivers/{CODE}.pinHash`; the driver enters badge **and** PIN | 1 hash write + 1 check in the callable | Per-driver attribution. A PIN is a 10k space, rate-limitable, shareable, shoulder-surfable | Medium |
| **C. Device binding + per-driver OTP** | SMS/email OTP to the driver's registered phone | An SMS provider, a code table, an expiry | Strong per-driver attribution | High |
| **D. Admin-issued device credential** | The admin panel (PRD-3) issues a pairing token; the app stores a signed credential | A signing key, a pairing flow, a revocation list | Strongest. The device itself is provisioned, not self-claimed | High, and PRD-3 is out of scope |

**Recommendation:** ship **A** now (it closes the P0 rules hole), and design the schema so **B** can be added without a migration — i.e. put the optional credential in `drivers/{CODE}` from day one, defaulted to absent. The office's stated goal (`GLOSSARY.md`, PRD story 16) is *"every trip records which driver ran it"* — A satisfies the operational need for accountability-by-code, B satisfies accountability-by-identity. Let the office choose when the admin panel exists.

**The office has chosen. 2026-11-01: option A, with first-claim provisioning.** So the model above is settled. The `pinHash` field is still designed in, defaulted to absent, so **B** can land later with **no migration**.

### The device-binding lifecycle, concretely

```
1. App generates installId (uuid) on first launch → SharedPreferences
2. App signs in ANONYMOUSLY (today's behaviour, unchanged)
3. App calls bindDeviceToVan({ installId, vanId, driverCode })
4. Server, INSIDE A TRANSACTION on vanDevices/{vanId}:
     a. reads drivers/{driverCode}; rejects if !active or vanId mismatch
     b. reads vanDevices/{vanId}
        - if absent  → CREATE it with this installId  (first claim)
        - if present and installId matches → OK (re-login)
        - if present and installId differs → REJECT (wrong phone)
     c. mints a custom token { installId, vanId, driverId } and returns it
5. App calls signInWithCustomToken(token) → the session now carries vanId
6. Rules can now scope by request.auth.token.vanId
```

**The weak link is step 4b:** the first device to present a valid driver code claims the van. Mitigations, cheapest first:

1. **Accept it for the demo** and record the binding visibly so the office can spot a wrong claim.
2. **Pre-provision** `vanDevices/{vanId}` from the admin console/PRD-3 with the expected install id, and let the callable only *match*, never *create*.
3. **Require an office-issued pairing code** in `vanDevices/{vanId}.pairingCode` to create the binding.

Option 2 is the right production answer and it needs nothing but a console write — no new app feature, no new Function beyond the callable.

**Q1's answer, 2026-11-01: the office chose option 1 (first-claim).** So mitigations 2 and 3 move to the hardening phase, and the build must include four things that first-claim makes mandatory:

| What | Why |
|---|---|
| **The transaction on step 4** | Two phones, one code, one van. Without a transaction, both create a binding and the van has two phones |
| **A `vanAlreadyClaimed` conflict reason** | The loser of the race needs a **clear message**, not a generic failure. This is why Q2's enum has **three** reasons, not two |
| **A runbook line** | A wrong claim is undone by **deleting `vanDevices/{vanId}`** in the console. There is no admin panel, so this must be written down |
| **A stable `installId`** | It must survive restarts. A per-launch random value would create a **new** binding every launch |

**The one thing first-claim does NOT fix.** It does not stop a driver with the **wrong** code from claiming the **wrong** van, if the codes happen to match. That is why the `drivers.vanId` check in step 4a is **not optional**.

**The full design is in `docs/BACKEND-GO-blueprint.md` section 4.5.**

## B.5 Proposed target schema

Changes from the current contract are marked **NEW**. Removals are marked **REMOVE**.

| Collection | Doc id | Fields | Change |
|---|---|---|---|
| `drivers` | `AB-1234` | `name`, **`phoneMasked`** (was `phone`), `vanId`, `routeId`, `wardIds[]`, `active`, **`updatedAt`**, **`updatedBy`**, **`pinHash` (optional, absent by default)** | +3 fields (B-13, B-option-B). **The phone rename is Q4** |
| **`staffPhones`** | `AB-1234` | **`phone`** (raw), `updatedAt`, `updatedBy` | **NEW collection. The raw phone's home, behind the staff wall (Q4)** |
| `vans` | `van-01` | `plateNo`, `routeId`, `status`, `lastLocation{lat,lng,updatedAt,speedKmph}`, `currentTripId`, `batteryPct` | unchanged |
| **`vanDevices`** | `van-01` | **`installId`**, **`boundAt`**, **`boundBy`**, **`claimMode`** | **NEW collection** — the authorization anchor |
| `trips` | auto | `vanId`, `routeId`, `driverId`, `wardIds[]`, `date`, `startedAt`, `endedAt`, `wardsDone[{wardId,doneAt,flagged}]`, `alertedWardIds[]`, `mockLocationDetected`, **`trailChunks` (count, optional)** | +1 optional field; `gpsTrail[]` → **REMOVE** in favour of the subcollection (B-07) |
| **`trips/{id}/trail`** | `0`, `1`, `2`… | **`points[]`** (≤1000), **`from`**, **`to`** | **NEW subcollection** (B-07) |
| `wards` | `ward-1` | `name`, `nameGu`, `code`, `type`, `center{lat,lng}`, `radiusM`, `routeId`, `inspectorId`, `escalationTo` | unchanged |
| `routes` | `route-01` | `name`, `wardIds[]`, `scheduledStartTime` | unchanged |
| `complaints` | auto | `ticketId`, `deviceId`, `category`, `photoUrl`, `location`, `wardId`, `createdAt`, `status`, `assignedTo`, `escalationLevel`, `resolvedPhotoUrl`, `resolvedAt`, `mergedInto`, `note` | unchanged for now; optional `pendingStatuses[]` (B-05 option B) |
| `notices` | auto | `targetType`, `targetId`, `message`, `createdAt`, `createdBy` | unchanged |
| **`notices/{id}/receipts`** | `AB-1234` | **`readAt`** | **NEW subcollection** (B-11) |
| `ratings` | auto | `wardId`, `date`, `stars`, `deviceId` | unchanged, not used by the driver app |
| `staff` | auto | `authUid`, `name`, `role`, `wardIds[]`, `talukaId`, `phone` | unchanged, not used by the driver app |
| `vanSecrets` | — | — | **REMOVE entirely** (B-08, B-09) |

**A note on `trips.wardIds`.** The app snapshots the driver's allotment into the trip at start time (`start_shift.dart:89-102`). That is **correct** and should stay: if the office changes a driver's wards mid-shift, today's shift keeps its scope, and the historical record is not rewritten. This is a good contract decision.

## B.6 Proposed rules model

The rules stop being "is there a session" and become "is this session the bound device for this van".

```
// The driver app: every write is scoped to the van the device is bound to.
function boundVan() {
  return request.auth != null
      && request.auth.token.vanId is string
      && request.auth.token.vanId != '';
}

// The badge code, resolved server-side into a claim. The code NEVER
// appears in a rule. It is only an attribution label.
function isOwnDriver(code) {
  return request.auth != null
      && request.auth.token.driverId == code;
}

// READS: public-ish reference data any signed-in driver may read.
match /wards/{wardId}     { allow read: if request.auth != null; }
match /routes/{routeId}   { allow read: if request.auth != null; }
match /vans/{vanId}       { allow read: if request.auth != null; }
match /notices/{noticeId} { allow read: if request.auth != null; }

// DRIVER IDENTITY: the code is a badge, so the READ stays open to a
// signed-in session, but `list` is denied and the raw phone is not in
// the document at all (Q4).
match /drivers/{code} {
  // A driver reads their own record, or a colleague's on the same route.
  allow get: if request.auth != null
             && (isOwnDriver(code)
                 || request.auth.token.vanId == resource.data.vanId);
  allow list: if false;
}
```

**A hard truth about `list`.** Firestore rules cannot filter a `list` query by a field the caller does not present. `drivers` is read by **doc id** (`_db.collection('drivers').doc(code).get()`), so a `get` rule is enough and `list` can simply be **denied**. That single change stops the phone-number enumeration in B-01. Verify no code path lists `drivers` — `firestore_drivers_repository.dart:17-25` only does `.doc(code).get()`. Good.

**And the rule cannot redact.** A `get` returns the whole doc, so the raw phone must **not be in the `drivers` doc at all**. That is Q4, and it is why `staffPhones` exists.

Proposed rules, concretely:

| Collection | Read | Write |
|---|---|---|
| `drivers/{code}` | `get` only, own record or same-route record, **the raw phone is not in this doc at all** (Q4); **`list` denied** | **denied.** The admin panel writes through the `upsertDriver` callable (Q5) |
| `staffPhones/{code}` | staff only | **denied.** The admin panel writes through the `upsertDriver` callable |
| `vans/{vanId}` | any signed-in driver | `update` only if `boundVan() && vanId == request.auth.token.vanId`, and only `lastLocation` / `batteryPct`. **`status` / `currentTripId` are server-only** (B-03). The admin's writes go through a callable |
| `trips/{tripId}` | own van's trips only, **plus the user app's route's trips** via a `routeId` claim | `create` only if `boundVan()` and `vanId == token.vanId`, restricted field set; `update` only if the trip's `vanId == token.vanId` |
| `trips/{tripId}/trail/{seq}` | own van's trips | `create` only, own van, bounded size |
| `complaints/{id}` | the citizen's own (**`deviceId` claim**), the driver's trip wards, or staff in scope | `create` by signed-in, scoped to the `deviceId` claim; `update` only `status` / `resolvedAt` and only by a driver whose **current trip's wardIds include the complaint's wardId**. The admin goes through a callable |
| `notices/{id}` | signed-in | **denied.** The admin panel writes through the `publishNotice` callable |
| `notices/{id}/receipts/{driverCode}` | own receipt | `create` by the same driver |
| `ward` / `routes` | signed-in | **denied.** The admin panel writes through callables |
| `vanDevices/{vanId}` | **server only** (no client rule) | **server only** |
| `ratings` / `staff` | driver app: **deny** | **server/admin only** |

**The phone-number problem is now decided. Q4's answer: masked only, and the mask is written at the source.**

| Where the raw phone lives | Who can read it |
|---|---|
| `staffPhones/{code}` | Staff only. The admin panel's callables |
| **Nowhere else.** The `drivers` doc holds `phoneMasked` only | The driver app sees `98XXXXXX10`, which is what the confirm card needs |

**Why a collection-level rule is not enough.** A Firestore `get` returns the **whole document**. The rules can restrict which document a caller may read, but not which fields it gets back. **So if the raw phone sits in the same doc as the masked one, the `get` leaks it.** The field has to not be there.

**The migration order, which is a deploy trap.**

```
1. Compute phoneMasked for every driver.        (before the rules deploy)
2. Write phoneMasked into the drivers doc.       (before the rules deploy)
3. Write the raw phone into staffPhones/{code}.  (before the rules deploy)
4. DELETE the raw phone field from every driver. (before the rules deploy)
5. Deploy the new rules.                        (last)
```

**Step 4 must come before step 5.** The rules allow or deny, they do not redact. **Data first, rules second.**

**And the second architectural change: the admin panel's writes go through callables (Q5).** A rules-based admin write trusts the **token**, and a revoked staff member's token stays valid for up to an hour. Only a server-side check of the live `staff` doc locks them out immediately. **So every admin write rule is `if false`, and the callable is the only path.**

**The rule of thumb.**

| The write | The authority | The mechanism |
|---|---|---|
| The driver writes its own van's telemetry | The `vanId` claim | Rule |
| The citizen files their own complaint | The `deviceId` claim | Rule |
| The admin resolves a complaint | The live `staff` doc | Callable |

**A write is a rule when the claim is the authority, and a callable when a live document is the authority.**

## B.7 Proposed Cloud Functions

| Function | Trigger | Purpose | Validation | Auth |
|---|---|---|---|---|
| **`bindDeviceToVan`** | `https.onCall` | Bind an install id to a van and mint a custom token (B.4). **Create-or-match inside a transaction** (Q1) | `installId` uuid, `vanId` non-empty, `driverCode` matches `^[A-Z]{2}-[0-9]{4}$` | Anonymous is fine **for the first bind**; afterwards it must match the existing binding |
| **`startShift`** | `https.onCall` | Create the trip + mark the van, **atomically** (B-3, server-authoritative list). **Returns a typed conflict reason** (Q2) | `driverCode`, `tripId` (client-generated), field allow-list | Must carry `token.vanId`; must verify the driver is allotted that van; must reject if the van already has an open trip owned by someone else |
| **`endShift`** | `https.onCall` | Close the trip + clear the van marker atomically | `tripId` | Must own the trip |
| **`markWardDone`** | `https.onCall` | Append a ward idempotently (server-authoritative list) | `tripId`, `wardId`, `doneAt`, `flagged` | Must own the trip; the ward must be in the trip's `wardIds` |
| **`setComplaintStatus`**, **`publishNotice`**, **`upsertDriver`**, **`upsertStaff`**, **`setVanDepot`** | `https.onCall` | The admin panel's writes. **One named business action each** (Q5) | The action's own fields | Staff call. Each one checks `staff/{id}.active` **against the live doc**, so a revoked staff member is locked out immediately |
| **`notifyMockLocation`** | `firestore.onDocumentUpdated` on `trips/{id}` | Staff push when `mockLocationDetected` flips false → true (B-12) | — | Server |
| **`clearStaleVanMarkers`** | `scheduler` (**every 15 min**, not daily) | Clear `currentTripId` whose trip is closed and older than N hours (B-19). Also the depot auto-end safety net | — | Server |
| **`sendNotice`** | `https.onCall` | Fan a notice out to the target's topic | `targetType`, `targetId`, `message` | Admin only |

**Why `startShift` must be a Function and not a client write.** The duplicate-trip race is real: two clients on one van both read "no open trip", both create a trip, and both write `vans.currentTripId`. The last write wins and one shift is orphaned. A Function with a Firestore **transaction** on the van doc makes it atomic, and it is the natural place to enforce the shared-van conflict rule that `start_shift.dart:121-152` implements today.

**Cost note.** Moving writes behind Functions costs latency and adds a failure mode (the Function must be reachable). For a demo on one phone per van, the client-side path works. For production with shared vans, the Function is required. **Recommendation: keep the client path for the demo, but design the contract so `startShift` can move behind the Function without changing the trip shape.**

## B.8 Index plan

| Collection | Fields | Type | Needed by | Exists? |
|---|---|---|---|---|
| `trips` | `vanId` ASC, `date` ASC | composite | `watchTripByVanIdAndDate` (`firestore_trips_repository.dart:73-75`) | **YES** |
| `trips` | `vanId` ASC, `date` DESC | composite | `watchRecentTrips` (`:107-110`) | **YES** |
| `notices` | **multi-branch** over `(targetType, targetId)` for the 3 OR branches | **multi-branch composite** | `watchNotices` (`firestore_notices_repository.dart:37-39`) | **NO — B-04** |
| `complaints` | `category` ASC, `wardId` ASC, `createdAt` ASC | composite | `watchMissedCollectionComplaints` (`:36-39`) | **YES** |
| `complaints` | `category` ASC, `wardId` ASC, `createdAt` ASC, `pendingStatuses` ARRAY_CONTAINS_ANY | composite | only if B-05 option B is adopted | **NO — optional** |
| `notices/{id}/receipts` | none needed (doc-id reads) | — | B-11 | — |
| `trips/{id}/trail` | `seq` implicit (doc ids `0`,`1`,`2`…) | — | B-07 | — |

**The one that matters now is the notices multi-branch index (B-04).** The Firestore emulator does **not** enforce indexes, so this failure cannot be caught locally. It must be deployed and verified against the real project.

## B.9 Data safety and operations

| Risk | Today | Mitigation |
|---|---|---|
| **A driver document is deleted while a trip is open** | The trip keeps `driverId` and `wardIds` as a snapshot, so D2 still renders. The van stays `on_shift` until End Shift. The driver can no longer log in again | Acceptable. The snapshot is the right behaviour. Add an admin "reassign driver" flow later |
| **A stale `vans.currentTripId` blocks a van forever** | No admin console exists (B-19) | The scheduled `clearStaleVanMarkers` Function, or a documented console procedure |
| **The `drivers` collection is written only by hand** | `scripts/seed_drivers.mjs` uses `{merge: true}` — safe to re-run | Fine. When PRD-3 lands, the panel writes go through the same shape |
| **Seed data lives only in the seed script** | `scripts/seed_drivers.mjs` seeds 4 drivers. `vans`, `routes`, `wards`, `notices` were seeded once by hand (GLOSSARY `:163`) | **Add a seed script for the reference data** so a fresh clone or a new environment can be rebuilt in one command. Right now a new Firebase project has no `vans` at all |
| **`verifyDriverPin` and `setDriverPin` stay deployed** | B-08, B-09 | Delete both, and delete `vanSecrets` |
| **The Firestore emulator does not enforce rules the same way as production** | It does enforce rules, but not indexes, and not TTL | Test the rules against the emulator AND run the rules unit-test suite (Part D) |
| **No backup** | Firestore automatic backups are a console setting | Enable scheduled backups on the production project. Cheap insurance for a trip log |
| **Prod data reset** | GLOSSARY `:150` documents a REST-based reset recipe | Fine for the demo. Document it so the demo can be reset without a Firebase Owner |

## B.10 Backend work plan

Ordered by dependency, cheapest first. Phases 1-2 are safe to do now; phase 3 needs a product ruling; phase 4 is PRD-3 territory.

| Phase | Work | Why now | Risk |
|---|---|---|---|
| **1. Free wins** (1 day) | Deploy the notices multi-branch index (B-04). **Chunk the notices OR query to stay under the 30-disjunction cap (B-04 failure 2)**. Bound the complaints fetch (B-05 option A). Delete `readVans` (B-18). Delete the `cloud_functions` dependency (B-08, client side only) | No contract change, no app change, fixes a silent production failure | Low |
| **2. Dead surface** (1 day) | Delete `verifyDriverPin` + `setDriverPin` + the `DEMO_SEED_BYPASS` path + the `vanSecrets` collection (B-08, B-09). **Fix the `functions/lib` deploy trap (B-20)**. Add a full reference-data seed + an emulator seed + guard the live seed (B-25) | Removes an unauthenticated write path and a public token-minting endpoint | Low. Confirm nobody else calls `verifyDriverPin` first (the user app is a separate app — **ask the Backend Owner**) |
| **3. The rules rewrite** (2-3 days) | Introduce `vanDevices` + `bindDeviceToVan` + custom claims. Rewrite `firestore.rules` to scope by `token.vanId`. Deny `drivers.list`. Server-only `vans.status` / `currentTripId`. Restrict the `trips` update fields (B-02, B-24). **Create-or-match inside a transaction (Q1). The `phoneMasked` migration runs BEFORE the rules deploy (Q4)** | Closes the P0 (B-01) and B-02/B-03 | **Medium.** Needs an app change (sign in with the custom token). **The provisioning answer is in: first-claim** |
| **4. Server-authoritative writes** (3-5 days) | `startShift` / `endShift` / `markWardDone` callables with transactions. Move the `flagged` computation server-side (B-24). **Return typed conflict reason codes (Q2)** | Removes the duplicate-trip race, the idempotency hole and the client-trust hole | Medium. Latency, and the offline queue has to be reworked to buffer Function calls |
| **5. Trail sharding** (2 days) | `trips/{id}/trail/{seq}` subcollection | The 1 MiB doc ceiling is a **silent data-loss** cliff (B-07) | Medium. Contract change, the office app must read the new shape |
| **6. Production hardening** | App Check + Play Integrity (B-10), Android flavors (B-15), CI with secrets (B-14), Storage rules scoping (B-16), emulator completeness (B-17) | The three real walls from `GLOSSARY.md:175` | High. Sequenced after ticket 14 per `GLOSSARY.md:118` |
| **7. Contract additions** | `notices` read receipts (B-11), mock-location staff push (B-12), `drivers` audit fields (B-13), stale-marker cleanup (B-19), **`staffPhones` + the admin's five callables (Q4, Q5)** | Each needs a Backend Owner ruling | Low individually |
| **8. Notifications** (1-2 days) | The inbound FCM handler (B-21). Unsubscribe the van topic at End Shift (B-22). The topic registry (B-23), **only if** driver-targeted pushes are needed | Makes the PRD `:237` acceptance criterion actually met | Low. B-21 is the one that matters |

### The order inside Phase 1

**Phase 1 has a dependency the phases list hides.** The notices **chunking** (B-04 failure 2) and the notices **index** (B-04 failure 1) are two halves of the same problem, and the order matters:

| Step | What | Why this order |
|---|---|---|
| 1 | **Chunk the OR query** so the disjunction count stays ≤ 30 | The cap failure is a **hard HTTP 400**. The index failure is a `FAILED_PRECONDITION`. The cap is the sharper edge, so fix it first |
| 2 | **Deploy the multi-branch index** for the chunked queries | The chunked queries still need it |
| 3 | **Verify against the real project** | The emulator enforces **neither** |
| 4 | **Fix the repository comment** | Or the next developer trusts the false claim |

**Or ship the denormalized fix (B-04 option B) instead.** That removes the OR query entirely, needs **no index**, and scales to any number of wards. It is a contract change, so it needs a Backend Owner ruling, but it is the shape that does not come back.

**Do not start phase 3 until the office answers the device-provisioning question in B.4.** The rules rewrite is the one piece of backend work that cannot be redone cheaply, and its shape depends on whether the phone is self-claiming or office-provisioned.

**It is answered. Q1, 2026-11-01: first-claim.** So phase 3 starts, and it starts with **four extra obligations** that first-claim creates:

| The obligation | Why |
|---|---|
| **A transaction on the `vanDevices` doc** | Two phones, one code, one van. Without it, both bind |
| **A `vanAlreadyClaimed` conflict reason** | The loser of the race needs a clear message. This is why Q2's enum has three reasons, not two |
| **A `drivers.vanId` check in the callable** | Otherwise any valid code claims any van |
| **A console-delete runbook line** | A wrong claim is fixed by deleting `vanDevices/{vanId}`. There is no admin panel |

**And phase 3 has an internal order that bites.**

```
1. Migrate the drivers docs: phone → phoneMasked + staffPhones.
2. Write the new rules. Do not deploy yet.
3. Deploy the client half: the bind call + signInWithCustomToken.
4. Deploy the callable.
5. Deploy the rules.                                    ← LAST
```

**Step 5 must be last.** Between steps 4 and 5, the old rules still allow `request.auth != null`, so the app keeps working. **Deploy the rules first and the app breaks**, because the client has no `vanId` claim yet and every write is denied.

**The full phase table, with the GO backend's own numbering, is in `docs/BACKEND-GO-blueprint.md` section 11.1.**

---

# Part C — UI duplication map

**The brief:** find what is repeated, decide where it should live, and do it without changing the look or the behaviour.

**Vocabulary** (used consistently throughout):

| Term | Meaning |
|---|---|
| **Module** | Anything with an interface and an implementation. Scale-agnostic: a function, a class, a package, or a tier-spanning slice |
| **Interface** | Everything a caller must know to use it correctly: the type signature, plus the invariants, ordering constraints, error modes and required configuration |
| **Implementation** | The body of the module. Distinct from an **Adapter**, which is a concrete thing that satisfies an interface at a seam |
| **Seam** | The location at which a module's interface lives. A place where behaviour can be altered without editing in that place |
| **Depth** | Leverage at the interface. A module is **deep** when a lot of behaviour sits behind a small interface, **shallow** when the interface is nearly as complex as the implementation |
| **Leverage** | What callers get from depth: more capability per unit of interface they have to learn |
| **Locality** | What maintainers get from depth: change, bugs and verification concentrate in one place instead of spreading across callers |
| **The deletion test** | Imagine deleting the module. If the complexity vanishes, it was a pass-through. If the complexity reappears across N callers, it was earning its keep |
| **The interface is the test surface** | Callers and tests cross the same seam. If you must test *past* the interface, the module is the wrong shape |
| **One adapter means a hypothetical seam. Two adapters means a real one.** | Do not introduce a seam unless something actually varies across it |

## C.1 What is already shared (follow this convention)

| Shared widget | File | Interface | Used by |
|---|---|---|---|
| `AppIconButton` | `lib/core/widgets/app_icon_button.dart:7` | `onPressed, icon, size, isGlass, semanticsLabel, tooltip, fillColor` | 11 call sites across 8 files |
| `ContourCard` | `lib/core/widgets/contour_card.dart:15` | `child, seed, lines, minHeight, borderRadius` | `ward_list_panel.dart:131`, `end_shift_screen.dart:123` |
| `DraggableSheet` | `lib/core/widgets/draggable_sheet.dart:31` | `builder, controller, initialSize, snapPoints, navHeight` | the D2 sheet |
| `GlassBar` | `lib/core/widgets/glass_bar.dart:13` | `leadingIcon, title, subtitle, subtitleBadge, actions, showLanguageToggle, currentLocale, onLanguageToggle` | `live_route_screen.dart:121` |
| `PillNav` | `lib/core/widgets/pill_nav.dart:17` | `PillNav.driver(...)` / `PillNav.user(...)` | D2 + the user app |
| `SkeletonBox` | `lib/core/widgets/skeleton.dart:14` | `width, height, radius` | `state_views.dart` only |
| `TrackingBadge` | `lib/core/widgets/glass_bar.dart:222` | `label, isActive` | inside `GlassBar` |
| `LanguageToggleButton` | `lib/features/shift_start/ui/language_toggle.dart:20` | none (reads the provider itself) | 3 call sites — **but it lives in the wrong folder and has the wrong shape** (U-02) |

**Two things are already right and should be the model:** `AppIconButton` (one widget, 11 call sites, `isGlass` covers both the glass and the plain surface) and `ContourCard` (one widget, two call sites, `seed` makes the contour deterministic per entity).

**One dead shared widget:** `SkeletonVanCard` (`skeleton.dart:73`) has **no caller anywhere** in `lib/` or `test/`. It is the leftover of the deleted van picker. Delete it.

## C.2 The duplication register

| ID | Pattern | Copies | Duplicated lines | Risk | Progression |
|---|---|---|---|---|---|
| **U-01** | Back-arrow + title page header | **9** | ~130 | MED | 1 |
| **U-02** | Language toggle | **3** | ~90 | HIGH | 1 |
| **U-03** | Screen-state switch (loading/empty/error/offline/ready) + its 4 widgets | **2** | ~100 | LOW | 2 |
| **U-04** | Degraded/error block with a retry button | **4** | ~110 | LOW | 2 |
| **U-05** | Empty state (neutral icon in a `brandSoft` circle) | **2 correct + 2 violating** | ~90 | MED | 2 |
| **U-06** | Bottom CTA bar (one full-width 64 dp ink pill) | **2** | ~45 | MED | 2 |
| **U-07** | Icon + label + value row | **1 shared + 4 near-copies** | ~40 | LOW | 3 |
| **U-08** | Two spacing systems + 13 hardcoded paddings | 13 sites | — | MED | 3 |
| **U-09** | Card container style | 4 styles | — | MED | 3 |
| **U-10** | List container padding | **2** | 4 | LOW | 3 |
| **U-11** | "Label + control" settings row | 3 (one file) | ~25 | LOW | 3 |

**Total duplicated lines: roughly 700.**

---

### U-01 — Back-arrow + title page header (9 copies)

| # | File | Lines | Button size | Gap after button | Title style | Page padding |
|---|---|---|---|---|---|---|
| 1 | `settings_screen.dart` | `:40-58` | `AppIconButton` 48 | `SizedBox(8)` | `displayMedium` | `horizontal: 24` |
| 2 | `trip_history_screen.dart` | `:47-66` | `AppIconButton` 48 | `SizedBox(8)` | `displayMedium` | `horizontal: 24` |
| 3 | `help_about_screen.dart` | `:20-40` | `AppIconButton` 48 | — | — | `horizontal: 24` |
| 4 | `notice_detail_screen.dart` | `:30-50` | `AppIconButton` 48 | `spacingUnit` | `headlineSmall` | `horizontal: 24` |
| 5 | `report_detail_screen.dart` | `:45-65` | `AppIconButton` 48 | `spacingUnit` | — | `horizontal: 24` |
| 6 | `end_shift_screen.dart` | `:58-80` | `AppIconButton` 48 | — | — | — |
| 7 | `on_break_screen.dart` | `:27-45` | `AppIconButton` 48 | `spacingUnit` | — | `horizontal: 24` |
| 8 | `code_start_screen.dart` | `:344-355` | **raw `IconButton`, `AppSize.iconButtonDriver` (56)** | — | — | `AppSpace.page` |
| 9 | `permission_prompt_screen.dart` | `:65-85` | `AppIconButton` | — | — | — |

**The divergences that matter.**

- **Button size 48 vs 56.** Copy 8 uses the driver touch size (56) because it is the primary driver screen; the rest use 48. DESIGN §2.3 says the driver icon-button size is 56 (`AppSize.iconButtonDriver`). A 48 dp back button is *below* the driver's 56 dp driver-icon size, and `AppSize.touchMin` is 48 while `touchDriver` is 56. The app has both and mixes them.
- **Title style.** `displayMedium` (copies 1-2) is the splash-scale display type; `headlineSmall` (copy 4) is body scale. Same role, three different scales.
- **Padding 24 vs `AppSpace.page` (20).** `AppSpace.page` is 20 (`app_tokens.dart:7`, and DESIGN §0 META: *"page padding 20 dp"*). Nine screens use the hardcoded 24.

**Why this is a real bug and not a style preference.** A driver moving between Settings, Notices, Trip history and End Shift gets a back button that changes size, and a title that changes scale, between screens. That is the "the app is boring and predictable on every screen" promise (`state_views.dart:3-4`) broken at every transition.

**Recommended home:** `lib/core/widgets/driver_page_header.dart` → `DriverPageHeader`.

### U-02 — The language toggle exists in three different implementations (HIGH)

| # | Where | File:lines | Shape | Labels |
|---|---|---|---|---|
| 1 | The shared one | `lib/features/shift_start/ui/language_toggle.dart:20-43` | `OutlinedButton` showing the **next** language's full name | `languageNameGu` / `languageNameEn` from arb |
| 2 | Inside the glass bar | `lib/core/widgets/glass_bar.dart:140-215` | a **36 dp segmented pill**, `_LanguageToggle` + `_LangSegment`, **private** | **hardcoded** `'ગુ'` / `'EN'` (`:163`, `:168`) |
| 3 | In Settings | `lib/features/settings/ui/settings_screen.dart:72-87` | `SegmentedButton<String>`, inline | **hardcoded** `'ગુ'` / `'EN'` (`:75`, `:79`) |

**The design is unambiguous.**

| Source | Says |
|---|---|
| DESIGN §4.17 `:408` | *"48 dp pill-shaped segmented control: two segments 'ગુ' and 'EN', selected segment = `primary` fill with `onPrimary` text. Visible on glass bar (D2), first-run, Settings"* |
| DESIGN §4.18 `:412` | *"the app's shared `LanguageToggleButton` (**reuse, no new component**)"* |
| CL-D22 `:449` | *"Language toggle reachable in at most 1 tap from D2 glass bar, and always present in Settings"* |

**So the design asks for ONE widget, in the segmented-pill shape, in three places.** The code has three widgets, in three shapes, in three places.

**Which one is wrong?** Implementation 1 (the `OutlinedButton`) does **not** match §4.17's segmented-pill shape at all. Implementations 2 and 3 match the shape but duplicate it and hardcode the labels.

**Why the labels matter.** The arb already carries `languageNameEn` = "English" and `languageNameGu` = "ગુજરાતી" (`app_en.arb:60-61`, `app_gu.arb:60-61`). The hardcoded `'ગુ'` / `'EN'` in two places means the string is outside the l10n system, so a future third language needs a code change in two files, not an arb addition. The fix is not to use the *full* names (the design wants the short forms) but to add **short** arb keys: `languageShortGu` = "ગુ", `languageShortEn` = "EN".

**Recommended home:** `lib/core/widgets/language_toggle.dart` → `LanguageToggleButton`, **moved** out of `features/shift_start/ui/` (it is used by tracking and launching too, so it does not belong to one feature), reshaped to §4.17, with the labels from arb.

### U-03 — The screen-state switch and its four widgets (2 identical copies)

`notices_screen.dart:41-48` and `pending_reports_screen.dart:44-58` are the **same switch, character for character apart from the class names**:

```dart
body: switch (flow.phase) {
  loading => const _XListLoading(),
  empty  => const _XListEmpty(),
  error  => _XListDegraded(message: l10n.error,   icon: Icons.error_outline),
  offline=> _XListDegraded(message: l10n.offline, icon: Icons.cloud_off),
  ready  => _XList(flow: flow),
},
```

And the widgets behind it are duplicated too:

| notices | pending_reports | Identical? |
|---|---|---|
| `_NoticesListLoading` `:49-67` | `_PendingListLoading` `:58-76` | **Yes** |
| `_NoticesListEmpty` `:68-84` | `_PendingListEmpty` `:77-93` | **Yes** |
| `_NoticesListDegraded` `:85-113` | `_PendingListDegraded` `:94-123` | **Yes**, except the `ValueKey` and the retry callback |

**This is the cleanest duplication in the app.** Two screens, two independent flows, and the same four widgets copied verbatim.

**Recommended home:** `lib/core/widgets/screen_state_views.dart` → `ScreenLoadingView`, `ScreenEmptyView`, `ScreenDegradedView`. The flow-specific bits (which provider to retry, which key to use) become **parameters**, so the widget stays a widget and the flow stays in the flow.

### U-04 — The degraded/error block with a retry (4 copies, 2 shapes)

| Copy | File:lines | Button | Colour |
|---|---|---|---|
| Notices | `notices_screen.dart:85-113` | `OutlinedButton` | default |
| Pending reports | `pending_reports_screen.dart:94-123` | `OutlinedButton` | default |
| Live route | `state_views.dart` `LiveRouteErrorView` | `FilledButton` | `c.statusEscalated.fill` |
| Identity | `code_start_screen.dart:962-1048` (`_NotFoundState`, `_LookupFailedState`, `_IdentityErrorState`) | varies | error tint |

The Live Route copy is **better**: it uses the escalated-status colour for the icon, which carries meaning ("this is a problem", not "nothing here"). The notices/pending copies use a plain icon.

### U-05 — The empty state, and two screens that break the rule

DESIGN §4.16 (`:404`) and the neutral-icon rule (CL-D15) require: **a neutral icon in a 96 dp `brandSoft` circle, a title, a body, and an optional action.**

| Copy | File:lines | Has the icon circle? |
|---|---|---|
| Live route | `state_views.dart` `LiveRouteEmptyView` | **Yes** |
| Trip history | `trip_history_screen.dart:197-236` `_HistoryEmpty` | **Yes** |
| Notices | `notices_screen.dart:68-84` `_NoticesListEmpty` | **NO — plain `Text` only** |
| Pending reports | `pending_reports_screen.dart:77-93` `_PendingListEmpty` | **NO — plain `Text` only** |

**So two screens are non-compliant with the empty-state rule, and they are the two that use the duplicated widget from U-03.** Fixing U-03 with the correct `ScreenEmptyView` fixes the conformance gap for free.

**Recommended home:** `lib/core/widgets/neutral_empty_state.dart` → `NeutralEmptyState`, with the icon, title, body and an optional action as four parameters.

### U-06 — The bottom CTA bar (2 copies)

| Copy | File:lines | Padding | Content |
|---|---|---|---|
| Shift start | `code_start_screen.dart:1050-1200` `_CtaBar` | `AppSpace.page / sm / page / md` | `Row(label + Icons.arrow_forward)` or a spinner |
| End shift | `end_shift_screen.dart:155-172` | `only(bottom: AppSpace.lg)` | `Text(label)` |

Both are: a padding wrapper, a `SizedBox(height: AppSize.buttonDriver)`, a full-width `FilledButton`.

**The divergence that shows:** the shift-start pill carries an **arrow icon** after the label, the end-shift pill does not. DESIGN §7.2 `:529` says buttons are *"verb + noun, max 3 words"* and the arrow is a directional affordance. One has it, one does not.

### U-07 — Icon + label + value row

`code_start_screen.dart:741` `_ConfirmRow` is a **good** primitive: leading icon 20 + label `titleSmall` + value `body`, exactly as DESIGN §4.20 specifies for the confirm card. But it is **private to one file**, so the next screen that needs it will copy it.

The other row-shaped widgets are **not** the same thing and should not be merged with it:

| Widget | File | Why it is different |
|---|---|---|
| `_TripRow` | `trip_history_screen.dart:84` | list row with a trailing status |
| `_ReportRow` | `pending_reports_screen.dart:147` | list row with two action buttons |
| `_NoticeRow` | `notices_screen.dart:135` | list row with an unread dot |
| `_VanRowLabel` | `settings_screen.dart:189` | a label inside a settings card |

**Recommendation:** promote `_ConfirmRow` to `lib/core/widgets/info_row.dart` → `InfoRow`. Leave the four list rows alone, but note that they are a **second** family of row widgets. If a fifth appears, that is when a `DriverListRow` earns its seam.

### U-08 — Two spacing systems, and 13 hardcoded paddings

| System | Uses | Values |
|---|---|---|
| `AppTheme.spacingUnit` (Material 3, 4 dp base) | **33** | `spacingUnit` = 4, `* 2` = 8, `* 3` = 12 |
| `AppSpace` (the driver's own tokens) | **138** | `unit` 8, `xs` 4, `sm` 8, `md` 12, `lg` 16, `xl` 20, `xxl` 24, `page` 20, `cardPad` 20, `sectionGap` 24 |

The two systems **overlap**: `spacingUnit * 2` (8) is `AppSpace.sm`, `spacingUnit * 3` (12) is `AppSpace.md`. So the same visual gap has two names, and which one a screen uses is down to the file's history.

**Plus 13 hardcoded paddings** that bypass both: `EdgeInsets.symmetric(horizontal: 24)` in `help_about_screen.dart:22`, `settings_screen.dart:39`, `trip_history_screen.dart:49`, `on_break_screen.dart:44, 87`, `more_options_sheet.dart:65, 149`, `report_detail_screen.dart:62, 159`, `notice_detail_screen.dart:47`, and others. 24 is `AppSpace.xxl`; the page padding token is `AppSpace.page` = **20**.

**The DESIGN §2.3 rule** (`:141` "driver overrides") and the token law (CL-01 to CL-05) say: one token system. `AppSpace` is the driver's system, and `AppSpace` is the one to keep, because every new driver screen already uses it.

### U-09 — Four different card container styles

| Style | File:lines | Radius | Padding | Matches DESIGN? |
|---|---|---|---|---|
| Driver card | `code_start_screen.dart` `_WelcomeCard` / `_ConfirmCard` | `AppRadius.card` (28) | `AppSpace.cardPad` (20) | **Yes** |
| Contour card | `end_shift_screen.dart:123`, `ward_list_panel.dart:131` | `AppRadius.card` | — | **Yes** |
| Settings card | `settings_screen.dart:239-256` `_SettingsCard` | **`BorderRadius.circular(12)`** | `20 / 16` | **NO — should be 28** |
| Map bubble / tag | `AppRadius.md` (12) | 12 | — | Correct, different role |

`AppRadius.card` is 28 and `AppRadius.md` is 12 (`app_tokens.dart:13, 15`). The settings card picked `md` where the design says cards are 28. It is the **only** card in the app with a 12 dp radius.

### U-10 — List container padding

`notices_screen.dart:117` and `pending_reports_screen.dart:127` both use `EdgeInsets.all(AppTheme.spacingUnit * 2)` — the same 8 dp, in the older spacing system, in two files. A one-token change.

### U-11 — "Label + control" settings row

`settings_screen.dart` has three of them: the language card (`:64-88`), the theme card (`:94+`), and the van row. Each is `_SettingsCard(child: Row(children: [Expanded(Text(label)), control]))`. One file, so the duplication cost is low, but it is the exact shape of the design's §4.x "settings row" and it should be a shared widget the moment a second settings surface exists.

## C.3 Design-system conformance gaps

The consistency law lives in `docs/DESIGN-driver-app.md` §5 (`:428-456`). These are the laws the duplication actually violates.

| Law | Rule | Violations found | Where |
|---|---|---|---|
| **CL-D02** | *"Spacing ONLY via `AppSpace`. No numeric margin/padding literals except `0`"* | **46 sites** | 33 uses of `AppTheme.spacingUnit` (not `AppSpace`) + 13 hardcoded `EdgeInsets.symmetric(horizontal: 24)`. `AppSpace.page` is **20** (`app_tokens.dart:7`), DESIGN META says *"page padding 20 dp"* — so 24 is wrong on both counts |
| **CL-D06 / CL-D26 / D-107** | *"Every tappable at least 56 x 56 dp (driver app minimum)"* / *"Driver app uses driver sizes everywhere (56/64/72/80); never mixed with user sizes"* | **8 back buttons at 48 dp** | `settings_screen.dart:43`, `trip_history_screen.dart:53`, `help_about_screen.dart:26`, `notice_detail_screen.dart:36`, `report_detail_screen.dart:51`, `end_shift_screen.dart:64`, `on_break_screen.dart:33`, `more_options_sheet.dart:70`. `AppSize.touchDriver` = 56 (`app_tokens.dart:22`) |
| **CL-D15** | *"Empty states use a neutral icon in a `brandSoft` circle"* | **2 screens** | `notices_screen.dart:68-84` and `pending_reports_screen.dart:77-93` are plain `Text`. `state_views.dart` and `trip_history_screen.dart:197` do it right |
| **CL-D16** | *"Cards: radius 28, no border"* | **1 card** | `settings_screen.dart:239-256` `_SettingsCard` uses `BorderRadius.circular(12)` (`AppRadius.md`) instead of `AppRadius.card` (28) |
| **CL-D21** | *"All strings from localization (`gu`, `en`)"* | **4 literals** | `glass_bar.dart:163` (`'ગુ'`), `glass_bar.dart:168` (`'EN'`), `settings_screen.dart:75` (`'ગુ'`), `settings_screen.dart:79` (`'EN'`) |
| **CL-D03** | *"Radius ONLY via `AppRadius`"* | 1 | `settings_screen.dart:245` |
| **CL-D04** | *"Text ONLY via `context.text` styles"* | 4+ | `settings_screen.dart:56` and `trip_history_screen.dart:61` use `Theme.of(context).textTheme.displayMedium`; `notice_detail_screen.dart:52` uses `headlineSmall`; `trip_history_screen.dart:217` uses `titleMedium` |
| **CL-D07** | *"Exactly ONE `primary` (filled ink) button per screen"* | 0 | Compliant |
| **CL-D08** | *"The primary CTA is a full-width pill: pinned at the bottom in M3"* | 2 divergent | `code_start_screen.dart:1186-1197` and `end_shift_screen.dart:155-172` — both correct in shape, divergent in padding and in whether the arrow icon is present |
| **CL-D23** | *"Every screen implements loading, empty, error and offline states"* | **3 screens** | `settings_screen.dart` (no offline), `trip_history_screen.dart` (no offline), `end_shift_screen.dart` (no offline, no empty) |
| **CL-D24** | *"Every tappable has a `Semantics` label in the active language"* | Mostly compliant | `AppIconButton` takes a `semanticsLabel` and every call site passes `MaterialLocalizations.of(context).backButtonTooltip` — which is the **framework's** string, not the app's arb. A Gujarati driver gets the English "Back" tooltip |
| **CL-D29** | *"Every tappable defines the pressed state from 4.0"* | Compliant | `AppIconButton` handles it |

**The two cheapest high-value fixes:** the 48 → 56 dp back button (CL-D06, one shared widget) and the hardcoded language labels (CL-D21, four literals).

**A note on CL-D24.** `MaterialLocalizations.of(context).backButtonTooltip` is what all 8 back buttons use. It resolves in the **framework's** locale, not the app's. Since the app's default locale is Gujarati (`locale_controller.dart:26`), a Gujarati driver with TalkBack hears an English "Back". The fix is one arb key (`commonBack`) and one parameter change across 8 sites, which the shared header absorbs for free.

## C.4 Recommended module structure

### The principle

A shared widget earns its place when it has a **small interface** and **absorbs a lot of behaviour**. The test is the deletion test: if deleting the widget makes the complexity reappear in N callers, it was earning its keep; if the complexity vanishes, it was a pass-through.

Five of the six proposals below pass that test clearly. One (`InfoRow`) is marginal and is marked as such.

### C.4.1 `DriverPageHeader` (U-01) — the highest value

**Home:** `lib/core/widgets/driver_page_header.dart`

```dart
/// The one back-arrow + title header for every driver screen.
///
/// Absorbs: the 56 dp back button, its semantics label (from l10n, not
/// the framework), the gap after it, the title text style, and the page
/// padding. Callers supply only the words and an optional trailing
/// action. Every screen therefore gets the SAME back button size, the
/// SAME title scale and the SAME margins, which is what CL-D02 / CL-D04
/// / CL-D06 / CL-D26 ask for.
///
/// The trailing action slot is what the permission screen uses for its
/// LanguageToggleButton (DESIGN §4.18: "beside the round close button").
class DriverPageHeader extends StatelessWidget {
  const DriverPageHeader({
    super.key,
    required this.title,
    this.onBack,
    this.trailing,
    this.showBack = true,
  });

  final String title;

  /// null hides the back button (a root screen with no history).
  final VoidCallback? onBack;

  /// Optional top-end action, e.g. the LanguageToggleButton.
  final Widget? trailing;

  final bool showBack;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpace.page, AppSpace.xs, AppSpace.page, 0,
      ),
      child: Row(
        children: [
          if (showBack && onBack != null)
            AppIconButton(
              onPressed: onBack,
              icon: Icons.arrow_back,
              size: AppSize.touchDriver,     // 56, CL-D06
              semanticsLabel: l10n.commonBack, // the app's arb, CL-D24
            ),
          const SizedBox(width: AppSpace.md),
          Expanded(
            child: Text(title, style: context.text.headline),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}
```

**Interface: 4 parameters.** It absorbs the button, the semantics string, three spacing values, the text style and the page padding.

**Callers that collapse into it:** all 9 copies in U-01. `code_start_screen.dart:344-355` gets its 56 dp size and its `d1-change-back` key for free (the key can be a parameter, or the caller can wrap it in a `KeyedSubtree`).

**Risk:** MEDIUM. The current copies differ in title style and padding, so "not changing the look" is not literally true here — this refactor **changes** the back button from 48 to 56 and the page padding from 24 to 20. That is the point (CL-D02/CL-D06), but it is a visual change and needs a device look.

### C.4.2 `LanguageToggleButton` (U-02) — move + reshape

**Home:** `lib/core/widgets/language_toggle.dart` (moved from `lib/features/shift_start/ui/language_toggle.dart`)

The widget is used by **tracking** (`permission_prompt_screen.dart:79`) and **launching** (`welcome_screen.dart:96`) as well as shift-start. A shared control does not belong to one feature. That is the same reasoning that put `AppIconButton` and `ContourCard` in `core/widgets/`.

**The shape must change** to §4.17's segmented pill, so that the glass bar, the first-run screens and Settings all show the same control:

```dart
/// The one language switcher (DESIGN §4.17): a 48 dp pill-shaped
/// segmented control with two segments, the active one filled with
/// `primary` and labelled in `onPrimary`.
///
/// One widget, three call sites: the D2 glass bar, the first-run screens,
/// and Settings (CL-D22). The segment labels come from l10n
/// (CL-D21) so a third language is an arb addition, not a code change.
class LanguageToggleButton extends ConsumerWidget {
  const LanguageToggleButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = ref.watch(localeControllerProvider);
    final l10n = AppLocalizations.of(context)!;
    final isGu = (current?.languageCode ?? defaultLocaleCode) == 'gu';

    Widget segment(String label, bool selected) => Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: selected
                ? null
                : () => ref.read(localeControllerProvider.notifier)
                    .setLocale(Locale(selected ? 'gu' : 'en')),
            borderRadius: BorderRadius.circular(AppRadius.pill),
            child: Container(
              height: AppSize.touchMin,
              padding: const EdgeInsets.symmetric(horizontal: AppSpace.md),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: selected ? context.colors.primary : Colors.transparent,
                borderRadius: BorderRadius.circular(AppRadius.pill),
              ),
              child: Text(
                label,
                style: context.text.label.copyWith(
                  color: selected
                      ? context.colors.onPrimary
                      : context.colors.textPrimary,
                ),
              ),
            ),
          ),
        );

    return Semantics(
      label: l10n.languageChangeHint,
      button: true,
      child: Container(
        height: AppSize.touchMin,
        decoration: BoxDecoration(
          color: context.colors.surfaceMuted,
          borderRadius: BorderRadius.circular(AppRadius.pill),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            segment(l10n.languageShortGu, isGu),
            segment(l10n.languageShortEn, !isGu),
          ],
        ),
      ),
    );
  }
}
```

**New arb keys needed (both locales):** `languageShortGu` = "ગુ", `languageShortEn` = "EN", `commonBack` = "Back" / "પાછળ".

**Interface: none.** It reads the provider itself, exactly as the current one does.

**The blocker to know about:** `test/features/shift_start/language_toggle_test.dart` pins the toggle **by its full-name text**:

```dart
const String guToggleName = 'ગુજરાતી';   // :33
const String enToggleName = 'English';     // :34
...
await tester.tap(find.text(guToggleName));  // :118, :143, :145, :156
expect(find.text(enToggleName), findsOneWidget);  // :103
```

Reshaping to the short segmented form **breaks that test**. The test must be rewritten to find by the short keys or by a widget key. This is the single highest-risk item in the UI refactor and it should be done first, in its own commit, so the break is isolated.

### C.4.3 `ScreenStateViews` (U-03 + U-04 + U-05) — the biggest line saving

**Home:** `lib/core/widgets/screen_state_views.dart`

Three widgets, one file, and they absorb the four private widgets in each of the notices and pending-reports screens.

```dart
/// The three non-data states every list screen needs (CL-D23:
/// "Every screen implements loading, empty, error and offline states").
///
/// One implementation, shared by every screen. The flow-specific bits
/// (which provider to retry, which key the test finds) are parameters,
/// so the widget stays a widget and the flow stays in the flow.
library;

class ScreenLoadingView extends StatelessWidget {
  const ScreenLoadingView({super.key, this.label});

  final String? label;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        spacing: AppSpace.lg,
        children: [
          const SizedBox(
            width: AppSize.icon,
            height: AppSize.icon,
            child: CircularProgressIndicator(strokeWidth: 3),
          ),
          if (label != null) Text(label!),
        ],
      ),
    );
  }
}

class ScreenEmptyView extends StatelessWidget {
  const ScreenEmptyView({
    super.key,
    required this.icon,
    required this.title,
    this.body,
    this.action,
  });

  final IconData icon;
  final String title;
  final String? body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpace.page),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          spacing: AppSpace.lg,
          children: [
            // CL-D15: a neutral icon in a brandSoft circle. No mascot.
            Container(
              width: AppSize.permissionIconCircle,
              height: AppSize.permissionIconCircle,
              decoration: BoxDecoration(color: c.brandSoft, shape: BoxShape.circle),
              child: Icon(icon, size: AppSize.icon * 2, color: c.brand),
            ),
            Text(title, textAlign: TextAlign.center, style: context.text.body),
            if (body != null)
              Text(body!, textAlign: TextAlign.center,
                   style: context.text.bodySmall.copyWith(color: c.textMuted)),
            if (action != null) action!,
          ],
        ),
      ),
    );
  }
}

class ScreenDegradedView extends StatelessWidget {
  const ScreenDegradedView({
    super.key,
    required this.icon,
    required this.message,
    required this.onRetry,
    this.retryKey,
  });

  final IconData icon;
  final String message;
  final VoidCallback onRetry;
  final Key? retryKey;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final c = context.colors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpace.page),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          spacing: AppSpace.lg,
          children: [
            Icon(icon, size: AppSize.icon * 2, color: c.statusEscalated.fill),
            Text(message, textAlign: TextAlign.center, style: context.text.body),
            OutlinedButton(
              key: retryKey,
              onPressed: onRetry,
              child: Text(l10n.retry),
            ),
          ],
        ),
      ),
    );
  }
}
```

**Interfaces:** 1-5 parameters each. The retry callback and the retry key are parameters, so the notices screen passes `() => ref.read(noticesFlowProvider.notifier).retry()` and `const ValueKey('d3-retry-button')`, and the pending screen passes its own. **One widget, two callers, zero behaviour change** — except that the two empty states now get the icon circle they were missing (CL-D15), which is a visual change.

**One caution on the loading spinner.** `notices_screen.dart:53` and `pending_reports_screen.dart:62` use a bare `CircularProgressIndicator()` with **no size cap and no `strokeWidth`**, while `state_views.dart` explicitly caps it at 32 dp with `strokeWidth: 3`. A `CircularProgressIndicator` inside a `Center` + `Column` with `mainAxisSize: MainAxisSize.min` receives **loose** cross-axis constraints, and in current Flutter it expands to the available width. That should be checked on a 360 dp device before the refactor, because it may be an existing visual defect rather than a refactor regression.

### C.4.4 `InfoRow` (U-07) — marginal, promote it anyway

**Home:** `lib/core/widgets/info_row.dart`

Promote `code_start_screen.dart:741` `_ConfirmRow` unchanged. It is already the design's §4.20 confirm-card row (leading icon 20 + label `titleSmall` + value `body`). The interface is 3 parameters and the implementation is 30 lines, so it is a **shallow** module in the codebase-design sense — but it is a design-system primitive, and the alternative is that the next screen copies it. **Promote it, but do not build a generic row family.** The four list rows are a different family and should stay separate.

### C.4.5 `DriverCtaBar` (U-06)

**Home:** `lib/core/widgets/driver_cta_bar.dart`

Absorbs the padding, the 64 dp pill height (`AppSize.buttonDriver`), the full-width rule (CL-D08), the arrow icon, and the busy-spinner state.

```dart
/// The pinned bottom CTA (CL-D08: "full-width pill, pinned at the
/// bottom in M3"). One implementation so the gap under the pill and the
/// arrow affordance are the same on every screen.
class DriverCtaBar extends StatelessWidget {
  const DriverCtaBar({
    super.key,
    required this.label,
    required this.onPressed,
    this.busy = false,
    this.showArrow = true,
    this.buttonKey,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool busy;
  final bool showArrow;
  final Key? buttonKey;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpace.page, AppSpace.sm, AppSpace.page, AppSpace.md,
      ),
      child: SizedBox(
        height: AppSize.buttonDriver,
        width: double.infinity,
        child: FilledButton(
          key: buttonKey,
          onPressed: busy ? null : onPressed,
          child: busy
              ? const SizedBox(
                  width: AppSize.iconSmall,
                  height: AppSize.iconSmall,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(label),
                    const SizedBox(width: AppSpace.sm),
                    const Icon(Icons.arrow_forward, size: AppSize.iconSmall),
                  ],
                ),
        ),
      ),
    );
  }
}
```

**Note:** `_CtaBar` in `code_start_screen.dart` has a large phase-machine switch inside it. **That switch stays in the flow, not in the widget.** Extract only the *chrome* (padding + pill + arrow + spinner). The widget's interface should be `label + onPressed + busy`, not a phase enum — otherwise the shared widget becomes a shallow pass-through that knows about the identity flow, which is exactly the coupling that made `_CtaBar` hard to reuse in the first place.

## C.5 Refactor order, risk, and what the tests pin

### The order

| # | Change | New/changed files | Risk | Why this position |
|---|---|---|---|---|
| **R1** | **Fix the language-toggle test first.** Rewrite `language_toggle_test.dart` to find by a widget key instead of by full-name text, so the reshape is possible | `test/features/shift_start/language_toggle_test.dart` | LOW | Isolates the known break. A test-only commit that changes no behaviour |
| **R2** | Move `LanguageToggleButton` to `core/widgets/`, reshape to §4.17, add the 3 arb keys, update the 3 call sites (glass bar, welcome, settings) | `core/widgets/language_toggle.dart` (new), `features/shift_start/ui/language_toggle.dart` (deleted), `core/widgets/glass_bar.dart`, `features/launching/welcome_screen.dart`, `features/settings/ui/settings_screen.dart`, both arb files + generated l10n | **HIGH** | The only change that breaks a test. Do it alone. Also fixes CL-D21 |
| **R3** | Add `ScreenLoadingView` / `ScreenEmptyView` / `ScreenDegradedView`; point the notices and pending-reports screens at them; delete their 8 private widgets | `core/widgets/screen_state_views.dart` (new), `notices_screen.dart`, `pending_reports_screen.dart` | LOW | The cleanest win: ~100 duplicated lines deleted, two CL-D15 violations fixed, and **no test pins `d3-retry-button`, `d4-retry-button`, `noticesEmpty` or `pendingReportsEmpty`** |
| **R4** | Add `DriverPageHeader`; point the 8 screens at it; add `commonBack` to both arb files | `core/widgets/driver_page_header.dart` (new), 8 screen files, both arb files | MEDIUM | Changes the back button from 48 to 56 and the page padding from 24 to 20. **This is a deliberate visual change** (CL-D02, CL-D06) and needs a device look |
| **R5** | Add `DriverCtaBar`; use it in `code_start_screen` and `end_shift_screen`; keep the phase switch in the flow | `core/widgets/driver_cta_bar.dart` (new), `code_start_screen.dart`, `end_shift_screen.dart` | MEDIUM | The end-shift pill gains the arrow icon. Check `end_shift_screen_test.dart` first |
| **R6** | Promote `_ConfirmRow` → `InfoRow` in `core/widgets/` | `core/widgets/info_row.dart` (new), `code_start_screen.dart` | LOW | Pure move |
| **R7** | Replace the 33 `AppTheme.spacingUnit` uses and the 13 hardcoded `horizontal: 24` with `AppSpace` | 13 files | MEDIUM | Mechanical but broad. **Do it last**, after the widgets above have absorbed most of the sites, so the diff is smaller |
| **R8** | Fix the `_SettingsCard` radius to `AppRadius.card` (CL-D16) | `settings_screen.dart` | LOW | One-line, but a visible change. Needs a device look |
| **R9** | Delete `SkeletonVanCard` (dead) and `readVans` (dead) | `core/widgets/skeleton.dart`, `vans_repository.dart`, `firestore_vans_repository.dart`, the fakes | LOW | Pure deletion, no behaviour change |

### What the tests already pin

| Key / text | Pinned by | Effect of the refactor |
|---|---|---|
| `d1-language-toggle` | `test/features/tracking/permission_prompt_screen_test.dart:91, 109, 123` | Keep the key on the new widget or the test breaks |
| `'ગુજરાતી'` / `'English'` text | `test/features/shift_start/language_toggle_test.dart:33-34, 103-104, 118, 128, 132, 143-149, 156` | **Breaks on R2.** Must be rewritten first (R1) |
| `reportDetail.back` | `test/features/pending_reports/report_detail_screen_test.dart:228`, `pending_reports_screen_test.dart:713, 715` | Keep the key on the header's back button |
| `liveRoute.error` | `test/live_route/live_route_widget_test.dart:586, 593`, `mark_ward_done_test.dart:433` | `LiveRouteErrorView` should delegate to `ScreenDegradedView` but keep its key |
| `liveRoute.empty` | `test/live_route/live_route_widget_test.dart:547, 567`, `mark_ward_done_test.dart:533` | Same |
| `d3-retry-button`, `d4-retry-button` | **Nothing** | Free to refactor |
| `noticesEmpty`, `pendingReportsEmpty` | **Nothing** (no key) | Free to refactor |
| `tripHistory.back`, `settings.back`, `noticeDetail.back` | **Nothing** | Free to refactor — but **add** a key so R4 is covered |

### The risks to avoid

| Risk | Why it bites | Guard |
|---|---|---|
| **A shared widget that knows about a flow** | `_CtaBar` already shows the shape of this mistake: it has a 6-arm phase switch, so it is a shallow wrapper around the identity flow rather than a deep widget. Extract the chrome, not the logic | R5's interface is `label + onPressed + busy` |
| **A "one widget fits all" mega-widget** | A widget with 12 optional parameters has a large interface, which is the opposite of depth. Prefer three small widgets over one flexible one | R3 ships three small widgets |
| **Changing the look while claiming to refactor** | R2, R4, R5 and R8 all change pixels. Either label them as visual fixes (and get a device look) or freeze the current values and defer | Be explicit per commit |
| **Refactoring the tokens before the widgets** | R7 touches 46 sites. If the widgets are not extracted first, R7 becomes a 46-site diff mixed with a structural change, and neither is reviewable | R7 is last |
| **Breaking the D2 sheet's occlusion geometry** | `GLOSSARY.md:159-162` records the bottom-most-snap law: the sheet's collapsed height is computed from `safeBottom + lg + navHeight + grabStrip + headPad`. Changing `AppSpace` values in the live-route files can silently move the sheet under the pill | R7 must not touch the live-route sheet files without a device check |
| **The `Semantics` label change** | Swapping `MaterialLocalizations.backButtonTooltip` for `l10n.commonBack` changes what TalkBack says. That is a **fix** (CL-D24), but it is a change a reviewer should see deliberately | Do it in R4, with the arb addition in the same commit |

---

# Part D — Test-coverage map

**The question this part answers:** what is actually protected by a test, what is protected by nothing, and what would a Firestore-rules test suite need to cover.

**The current shape.**

| Metric | Value |
|---|---|
| Test files | **49** |
| Total assertions (tests + testWidgets) | **451** |
| Widget test files (`testWidgets`) | **19** |
| Pure-domain / unit test files | **30** |
| **Firestore rules test files** | **0** |
| **Cloud Functions test files** | **0** (`functions/package.json` has `firebase-functions-test` as a devDependency but **no test script and no test file**) |
| **Storage rules test files** | **0** |
| **Integration test files** (`integration_test/`) | **0** |
| **CI that runs any of this** | **None** (no `.github/workflows/`) |

The suite is **strong on the client and completely absent on the server**. That asymmetry is the single most important thing about this repo's test posture.

## D.1 What the tests actually pin (the good part)

| Area | File | Tests | What it protects |
|---|---|---|---|
| Identity flow (the biggest suite) | `test/features/shift_start/code_start_screen_test.dart` | 32 | Every phase of the code entry: invalid shape → no lookup, confirm card contents, start writes the trip, not-found + retry, lookup-failed + retry, start-failure, the edit cycle, change-code, back-arrow rules, the welcome card, offline lookup, and the two new ruling tests |
| Identity domain | `test/features/shift_start/identity_flow_test.dart` | 17 | The controller: lookup, remember, phase transitions, the three new ruling #27 tests |
| Model round-trips | `test/models/models_round_trip_test.dart` | 28 | Every model's `fromMap`/`toMap` — the contract shape in both directions |
| IST clock | `test/domain/ist_clock_test.dart` | 27 | The day-window semantics, including every midnight boundary. This is the fix for issue #15, and it is pinned hard |
| Code keyboard | `test/features/shift_start/code_keyboard_test.dart` | 25 | The 6-box OTP entry, auto-dash, paste handling, the letters-to-digits flip |
| Tracking engine | `test/tracking/tracking_engine_test.dart` | 23 | The write policy, the mock-location latch, the FGS stop, the trail flush, the offline queue, and the depot auto-end hook |
| Depot dwell | `test/tracking/depot_dwell_test.dart` | 5 | The pure dwell tracker: inside the radius, the 100 m reset, the single latch. **It pins the rule, not the path that runs it.** See F-20's lesson |
| Fake repositories | `test/repositories/fake_repositories_test.dart` | 21 | That the fakes match the seams, and that the fakes mirror the real semantics (including the IST day frame) |
| Live-route state | `test/live_route/live_route_state_test.dart` | 17 | The D2 state machine |
| Ward order | `test/domain/ward_order.dart` | 16 | The next-undone-ward rule and the route order |
| Mark-ward-done | `test/live_route/mark_ward_done_test.dart` | 15 | The D2 write flow, including the nav-occlusion lesson |
| Geo | `test/domain/geo_test.dart` | 13 | Haversine against analytic cases |
| Notices screen | `test/features/notices/notices_screen_test.dart` | 13 | The list, the unread dot, the error states |
| Identity persistence | `test/core/identity/driver_identity_controller_test.dart` | 14 | The stored code, the setup flag, the corrupt-value degradation |
| Write policy | `test/domain/write_policy.dart` | 12 | The battery + movement cadence decision |
| Locale controller | `test/core/l10n/locale_controller_test.dart` | 8 | The Gujarati default, the restore race |

**The pattern worth copying.** Every one of these tests asserts an **outcome**, not an implementation. `ist_clock_test.dart` asserts "18:30 UTC is already the next IST day", not "the code calls `toUtc`". That is why these suites survive refactoring, and it is the standard the new rules tests should meet.

## D.2 What is NOT pinned (the gap part)

| Behaviour | Why it matters | Currently pinned by |
|---|---|---|
| **Firestore rules (all 7 collection matches)** | B-01. The rules are the authorization boundary and they are `request.auth != null` everywhere | **Nothing.** `complaints` gained `allow update` and the only verification was a manual `firebase deploy` |
| **Storage rules** | B-16. Any signed-in user can write 20 MB anywhere | **Nothing** |
| **The `attachTrip` call on the production start path** | **F-20.** A P0 data-loss bug marked "fixed" | `tracking_auto_start_test.dart` calls `TrackingAutoStarter.startTrackingFor` **directly**. The production path never calls that method, so the test passes while the bug is live |
| **The Cloud Functions** (`verifyDriverPin`, `setDriverPin`) | B-08, B-09. `setDriverPin` has an unauthenticated write path behind `DEMO_SEED_BYPASS` | **Nothing.** `functions/package.json` declares `firebase-functions-test` but there is no test file and no `test` script |
| **The notices OR query's index requirement** | B-04. A missing index fails in production and the app shows an empty inbox | **Nothing.** The emulator does not enforce indexes |
| **The notices OR query's 30-disjunction cap** | B-04 failure 2. A route with 29+ wards gets a hard HTTP 400 and the driver sees an empty inbox | **Nothing.** The seed tops out at 3 wards |
| **The depot auto-end's production path** | Ruling #29. The rule is pinned as a **pure function** (`depot_dwell_test.dart`, 5 tests), but nothing pins that the engine actually feeds it, that the auto-end fires the write set, or that the 5-minute retry survives | **Partially.** `tracking_engine_test.dart` covers the engine hook. **The retry and the D2 notice are not pinned** |
| **`whereIn` over 30 wards** | B-06 | **Nothing.** The seed tops out at 3 wards |
| **The `gpsTrail` 1 MiB cliff** | B-07. A long shift silently stops recording location | **Nothing.** `GLOSSARY.md:89` has the measurement, but no test |
| **The shared-van conflict copy** | F-08 | **Nothing.** The flow collapses it to a generic failure, so there is nothing to assert yet |
| **The notices / pending-reports retry buttons** | U-04 | **Nothing.** The keys `d3-retry-button` and `d4-retry-button` are free to refactor |
| **The notices / pending-reports empty states** | U-05, and they are the two CL-D15 violations | **Nothing.** No key at all |
| **The trip-history / settings / notice-detail back buttons** | U-01 | **Nothing.** No key at all |
| **The language toggle's *label* text** | U-02 | Yes, but by **full name** (`'ગુજરાતી'`), which pins the wrong shape. This is what makes R2 a breaking change |

## D.3 The test the repo is missing: a Firestore rules suite

This is the highest-value addition to the project's test posture, and it is cheap.

**What it needs.**

| Piece | What to do | Why |
|---|---|---|
| Dependency | `npm i -D @firebase/rules-unit-testing` in `functions/` | The official rules test harness. It runs the rules in a real Firestore emulator and asserts allow/deny per operation |
| Emulator | `firebase emulators:exec --only firestore "npm test"` | The rules unit test library drives the emulator itself; `emulators:exec` boots and tears it down |
| Script | `"test": "mocha --require ts-node/register 'test/**/*.spec.ts'"` in `functions/package.json` | So it runs in CI (B-14) with one command |
| CI step | A `firebase emulators:exec` step after `flutter test` | The rules suite is worthless if nobody runs it |

**The cases it must cover.** Every one of these is a real behaviour in this app, and every one is currently unprotected.

### The P0 group: the anonymous-user boundary

The app signs in **anonymously** (`firebase_bootstrap.dart`). The rules must therefore distinguish *"has a session"* from *"is the right session"*. These are the tests that would have caught B-01.

| # | Setup | Attempt | Expect |
|---|---|---|---|
| 1 | Anonymous signed-in | `get drivers/{otherCode}` | **DENIED** (B-01: today it is ALLOWED, leaking the phone number) |
| 2 | Anonymous signed-in | `list drivers` | **DENIED** (the app only ever reads by doc id, so this is free) |
| 3 | Anonymous signed-in | `get drivers/{ownCode}` | ALLOWED (own record) |
| 4 | Anonymous signed-in | `update vans/{otherVan}` | **DENIED** (B-01: today it is ALLOWED, van takeover) |
| 5 | Anonymous signed-in | `update vans/{ownVan}` with `currentTripId` | **DENIED** (B-03: the marker is server-only) |
| 6 | Anonymous signed-in | `update vans/{ownVan}` with only `lastLocation` | ALLOWED (telemetry is fine) |
| 7 | Anonymous signed-in | `create trips/{id}` with `driverId` = someone else | **DENIED** (B-02) |
| 8 | Anonymous signed-in | `update trips/{otherTrip}` | **DENIED** (today it is ALLOWED: rewrite any trip) |
| 9 | Anonymous signed-in | `update complaints/{id}` | ALLOWED only for the fields the app sets (`status`, `resolvedAt`) |
| 10 | Anonymous signed-in | `update complaints/{id}` with `wardId` | **DENIED** (the complaint's identity is not the driver's to change) |
| 11 | **Not signed in at all** | any write | **DENIED** (the one case the current rules DO cover) |

### The P1 group: the app's own legitimate flows

These are the **positive** tests. A rules suite that only tests denial will happily block the app. For each, the setup must be "an authenticated session for the right driver", and the expectation is ALLOWED.

| # | Attempt | Expect |
|---|---|---|
| 12 | The bound driver creates a trip with the allowed field set | ALLOWED |
| 13 | The bound driver creates a trip with `gpsTrail` set at creation | **DENIED** (B-02: the trail is written by the flush, not the create) |
| 14 | The bound driver updates their own trip's `wardsDone` | ALLOWED |
| 15 | The bound driver updates a trip belonging to another van | **DENIED** |
| 16 | The bound driver reads `wards/{id}` | ALLOWED |
| 17 | The bound driver reads `routes/{id}` | ALLOWED |
| 18 | The bound driver reads `notices/{id}` | ALLOWED |
| 19 | The bound driver updates their own van's `batteryPct` | ALLOWED |
| 20 | The bound driver updates their own van's `status` | **DENIED** (B-03: server-only) |
| 21 | The bound driver writes a trail chunk `trips/{id}/trail/0` | ALLOWED (B-07's new shape) |
| 22 | The bound driver writes a trail chunk on another trip | **DENIED** |

### The P2 group: the contract edges

| # | Attempt | Expect |
|---|---|---|
| 23 | `readVans()`-style full-collection `list vans` | Decide: ALLOWED (it is reference data) but note it is a full read |
| 24 | `whereIn` with 31 ward ids | **This is a client-side limit, not a rules one.** The rules suite cannot catch it; the fix is chunking (B-06) |
| 25 | A `drivers` document with `active: false` | Still readable by its owner (the app reads it and then decides) |
| 26 | Storage: write 21 MB | **DENIED** (the 20 MB cap) |
| 27 | Storage: write a non-image `contentType` | **DENIED** |
| 28 | Storage: read another driver's `media/` path | **DENIED** (B-16: today it is ALLOWED) |

**The rules suite's own design rules.**

| Rule | Why |
|---|---|
| **Every test names the persona** | `"anonymous user cannot read another driver's phone"` reads better than `test('case 3')`, and it survives re-ordering |
| **Every test states the expectation as a phrase** | `assertFails` / `assertSucceeds` with a reason string. A failing rules test must say *what wall was breached* |
| **Test the field-level restrictions, not just the collection** | The `vans.status` case and the `trips.create` field set are the actual bugs. A collection-level test passes while the field hole is open |
| **Keep the emulator-only caveat in mind** | The emulator does **not** enforce composite indexes. Indexes need a separate check against the real project (B-04) |

#### The 17 probes that already exist, in throwaway form

**This suite does not need to be written from scratch. It has already been written once, as a probe harness, and it proved B-01.**

A **17-probe harness** was run against a **real Firestore emulator** with a **real Auth emulator**, using the repo's own `firestore.rules`. **17/17 probes matched the predicted result.** The full table is in **B-01**. The probes ran in a throwaway `/tmp` copy, so nothing in the repo was touched.

**What that means for this section.** The probe harness is a **working prototype of the rules suite**. The difference between a probe and a suite:

| | Probe harness | The rules suite |
|---|---|---|
| Lives in | `/tmp`, thrown away | `functions/test/*.spec.ts`, in the repo |
| Runs in | Once, by hand | **On every push**, via CI |
| Asserts | "the hole is real" | "the wall holds" |
| Fails the build | No | **Yes** |

**So the work is not "write 28 tests from nothing". It is "promote the 17 probes into a repo-resident suite, add the 11 positive cases, and wire it into CI".** That is a day of work, not a week, and the probes have already proven the harness approach works.

**The one gap the probe harness cannot cover.** The emulator does **not** enforce composite indexes, and the 30-disjunction cap is a **query-shape** limit, not a rules limit. Both need a **staging-project** check. See D.4 row 4.

## D.4 The other test gaps, ranked

| # | Gap | The test that would close it | Cost | Priority |
|---|---|---|---|---|
| 1 | **F-20: the production start path never attaches the trip** | A widget test that drives `CodeStartScreen` to the `onShift` phase with a recording `OfflineSyncService`, then asserts `attachedTripId == tripId`. It must go through the **screen**, not the starter | 1 test | **P0** |
| 2 | **The rules suite** | 28 cases as above | 1 day + CI | **P0** |
| 3 | **The Functions** | `firebase-functions-test` for `verifyDriverPin` (rate limit, wrong PIN, right PIN) and `setDriverPin` (the `DEMO_SEED_BYPASS` path). Even though both are slated for deletion (B-08, B-09), a **deletion test** should exist: a test that asserts the function is gone | 0.5 day | **P1** |
| 4 | **The notices multi-branch index** | Not a unit test. A **staging-project smoke query** in CI that runs the exact OR query and fails on `FAILED_PRECONDITION` | 0.5 day | **P1** |
| 4b | **The notices 30-disjunction cap** | Not a unit test either, and the emulator **does** enforce it. A staging smoke query with 29 ward ids that must not return HTTP 400 | 1 hour | **P1** |
| 4c | **The depot auto-end's retry and D2 notice** | A widget test that forces the auto-end write to fail, advances the clock past the 5-minute retry, and asserts the write is attempted again. Plus a test that the D2 notice fires and the app returns to D1 | 2 hours | **P1** |
| 4d | **The depot dwell against a wrong phone clock** | A test that moves the clock backwards and asserts the dwell tracker does not fire early. If it does, the rule must use a server timestamp instead | 1 hour | **P1** |
| 5 | **The `gpsTrail` 1 MiB cliff** | A test that appends enough points to cross the limit and asserts the write fails loudly rather than silently | 2 hours | **P1** |
| 6 | **The shared-van conflict copy (F-08)** | Once the flow has a typed `startConflict` phase, a widget test that seeds another driver's open trip and asserts the **conflict** copy appears, not `shiftStartFailed` | 1 hour | **P1** |
| 7 | **The language toggle's new key** | Rewrite `language_toggle_test.dart` to find by a `ValueKey` instead of by full-name text. This is R1 in Part C | 30 min | **P1** (blocks R2) |
| 8 | **The back buttons (U-01)** | Add a `ValueKey` to each back button and assert it exists on each screen | 1 hour | **P2** |
| 9 | **The empty states (U-05)** | Add a key to each empty state and assert the `brandSoft` circle is present. This pins CL-D15 so the fix cannot regress | 1 hour | **P2** |
| 10 | **The D2 sheet's occlusion geometry** | Cannot be tested in a widget test (the GLOSSARY records this: *"widget tests CANNOT catch nav occlusion"*). It needs a device check | N/A | **P2** (a runbook step, not a test) |

## D.5 How senior engineers approach a test-coverage gap

| Situation | The industry move |
|---|---|
| **"The bug is fixed but the test does not prove it"** | Ask: *which function does production call?* Then test **that**. A test on an unreached method is a false green. This is F-20 exactly |
| **"The rules are the security boundary"** | Rules get their own test suite, in the language the rules are written in, run against the emulator, in CI on every PR. The rules are code and deserve the same treatment as the Dart |
| **"There are no rules tests and there are 9 rule matches"** | Start with the **denial** cases for the P0 group only. 11 cases cover the P0 boundary. Add the positive cases as the flows get locked down. A rules suite that is 100% denial will break the app |
| **"A widget test cannot see the real layout"** | Say so explicitly in the test file's header, and put the check in the device runbook instead. The repo already does this correctly in `GLOSSARY.md:159-162` and `GLOSSARY.md:140`. That is a mature practice, not a gap |
| **"The suite is green but the demo failed"** | The gap is always **at a seam**: a path the tests do not drive, a platform channel the fake does not model, a server the emulator does not match. F-20, B-04 and B-17 are all the same shape |
| **"We cannot test the server yet"** | Then the server behaviour is **documented as untested** and the deployment is gated on a manual check. `GLOSSARY.md:166-170` already does this for the rules deploy. Do the same for the functions |

**The one-line summary of this part.** The Dart suite is in good shape and tests outcomes, not implementations. The server has **zero** tests, and the one place a Dart test was written for a server-adjacent behaviour (F-20), it tested the wrong entry point. **Before adding more Dart tests, add the rules suite.**

---

# Part E — Carried-over items that did not change

These were open before this audit and are still open. Nothing here regressed, and nothing here was fixed.

## E.1 The open GitHub issues

`gh issue list --state open` at HEAD `a0cba52`:

| # | Title | Type | What it needs |
|---|---|---|---|
| **27** | Ruling: launch-time open-shift resume (splash straight to D2) vs the one-tap welcome card | question, ready-for-agent | **DONE.** Ruled and built in `7004d1f`. The issue is still open and should be closed |
| **28** | Ruling: welcome-back card shows Van + Route (DESIGN-driver-app 9.27) instead of Name/Code/Wards | question | **DONE.** Ruled and built in `7004d1f`. Close it |
| **29** | Shared-van conflict shows the generic "Check the connection" copy (F-08) | bug, question | **STILL OPEN.** Needs a copy ruling. Recommendation in A.2.2 |
| **30** | Launch/identity audit + rulings #27/#28: FGS stop, offline attach + badge, launch resume, five-row card | — | **MOSTLY DONE, but the issue body claims something false.** It says *"`attachTrip` never called → fixed: attached at start/resume"*. It is **still not called in production** (F-20). The issue body needs correcting before it is closed |

All the other issues (**#1** through **#26**) are **CLOSED**. Nothing is silently open.

**Two kinds of housekeeping worth doing:**

1. **Issues #27 and #28** are implemented and tested but still marked open. A stale open issue is how a builder ends up re-implementing something that already exists.
2. **Issue #30's body carries a false claim.** It lists `attachTrip` as fixed. It is not. That body is the handoff document for the next builder, so it should be corrected, not just closed.

### E.1.1 The ruling numbering has collided

**PRD-2 §0.16 `:197` calls the depot auto-end "ruling #29". GitHub issue #29 is F-08, the shared-van conflict copy.** Rulings #27 and #28 lined up with GitHub issues #27 and #28, so the two schemes looked like one scheme. They are not.

**Recommendation: renumber the depot ruling to #31** in PRD-2 §0.16 and `GLOSSARY.md:27`, or add *"ruling #29 (depot), distinct from GitHub issue #29 (F-08)"*. The PRD is the frozen contract, so the fix belongs there. See A.4.1.

## E.2 The GLOSSARY items that did not change

| GLOSSARY line | Item | State | Note |
|---|---|---|---|
| `:122` | **Index seeds for the Backend Owner**: notices OR-branch sort, pending-reports `(wardId, createdAt)`, trip `(vanId, date)` (rulings 10/11/16) | **OPEN** | Two of the three already exist in `firestore.indexes.json`. The **notices OR-branch multi-branch index is the one that does not** (B-04). This is the only one that matters now |
| `:120` | **`whereIn` >30-ward chunking** (ruling 12) | **OPEN** | Latent, not live. `readWardsByIds` has no production caller (B-06) |
| `:121` | **Delete the 7 dev entrypoints** at integration: `dev_tracking`, `dev_pending_reports`, `dev_live_route`, `dev_notices`, `dev_min`, `dev_flow_preview`, `dev_identity_start` | **OPEN** | All 7 files exist. `lib/features/live_route/dev/desktop_demo_seed.dart` is an 8th dev-only file with a test (`desktop_demo_seed_test.dart`), so it is **not** in the deletion list but is also not production |
| `:128` | **Notices read-state is session-local** — the 0.2 `notices` shape has no read field, so unread markers reset on restart/shift end | **OPEN** | B-11. Needs a contract field |
| `:129` | **Staff push on mock-location detection** — no contract Cloud Function exists (ruling 7) | **OPEN** | B-12 |
| `:130` | **Notices push parity** — driver-device topic-only for now | **OPEN** | Needs the `sendNotice` function (B.7) |
| `:132` | **`connectivity_plus` sits outside the 0.6 package list** — record sign-off | **OPEN** | A PRD amendment, one line |
| `:133` | **`shared_preferences` sits outside the 0.6 package list** — record sign-off | **OPEN** | A PRD amendment, one line |
| `:118` | **Productionize the build config** (Android flavors, App Check, key restrictions, CI secrets, AAB pipeline, kill `DEMO_SEED_BYPASS`) | **OPEN**, sequenced AFTER ticket 14 | B-10, B-14, B-15. The `DEMO_SEED_BYPASS` part is now urgent because it is an unauthenticated write path (B-09) |
| `:106` | **"OfflineSyncService.attachTrip() had no production caller"** — marked FIXED | **WRONG.** It still has no production caller | **F-20.** This GLOSSARY line needs to be re-opened |

## E.3 The doc drift (F-17 / F-18)

Unchanged, and worth fixing because it will mislead the GO backend builder.

| File | Lines | Stale content |
|---|---|---|
| `docs/PRD-2-driver-app.md` | `:61`, `:126`, `:161`, `:179`, `:217`, `:224`, `:242`, `:267` | `verifyDriverPin` as the live auth path, "4-digit PIN", "van picker", "sign in with the returned token", "Backend deploys `verifyDriverPin` and seeds `vanSecrets`" — all superseded by §0.16 `:179` and `:181` |
| `docs/DESIGN.md` | 38 hits for `Binny` / `PinPad` across 1276 lines | The mascot, the PIN pad, "4 separate 56 × 64 boxes", "D1 Shift Start: Van picker + PIN". The code follows `docs/DESIGN-driver-app.md` |

**The one that matters for the backend:** PRD `:61` and `:242` still describe `verifyDriverPin` as **the** auth mechanism, and PRD `:267` still lists "Backend Owner deploys `verifyDriverPin` and seeds `vanSecrets`" as a **dependency**. Anyone building the backend from the PRD will build the PIN flow that Part B says to delete. **PRD §0.16 `:179` does say the app stops calling it, but the older sections were never struck.** The GO backend document must state clearly which of the two is authoritative.

## E.4 The `docs/adr/` directory is empty

`ls docs/adr/` returns nothing. The `AGENTS.md` points to `docs/adr/` as the place where architectural decisions live, and `docs/agents/domain.md` presumably says the same.

**Why this matters now.** This report contains at least **five** decisions that belong in ADRs, and they are exactly the decisions a backend builder must not re-litigate:

| Decision | Where it is recorded now | Should be an ADR |
|---|---|---|
| The driver code is a **badge, not a secret** (§0.16) | PRD §0.16 | Yes. It is the root of B-01 and B.4 |
| Device binding + driver badge as **two separate factors** | This report, B.4 | Yes. It is the whole identity model |
| Which writes are **server-authoritative** | This report, B.3 | Yes |
| The **trail sharding** shape (`trips/{id}/trail/{seq}`) | This report, B-05 | Yes. It changes the contract the office app reads |
| The **`drivers.phone` masking** decision | This report, B.6 | Yes. It is a privacy decision |

**Recommendation:** when the GO backend starts, write these five as ADRs **before** any code. An ADR is cheap to write and expensive to get wrong. The repo already has the convention (`docs/adr/` exists and `AGENTS.md` names it), it is just empty.

## E.5 The two silent cliffs

Both are silent. Neither throws. Neither is caught by a test. Both are in Part B.

| Cliff | The number | The consequence |
|---|---|---|
| **`trips.gpsTrail` hits the Firestore 1 MiB document limit** | `GLOSSARY.md:89`: *"5 h at 1 Hz ≈ 18 k pts ≈ 1 MB, at the 1 MiB doc limit"* | Every trail append after that **fails silently**. The shift stops recording location. The offline queue grows unbounded. This is the sharpest data-loss cliff in the system (B-07) |
| **`whereIn` caps at 30 values** | Firestore hard limit | A route with more than 30 wards breaks the read entirely (B-06). Latent today because the seed tops out at 3 wards |

**The pattern.** Both are **document-size and query-shape limits that Firestore enforces at runtime, not at write time**. The industry's answer is the same for both: **design the shape so the limit is never reached** (shard the trail, chunk the `whereIn`), rather than catching the error.

## E.6 The `notices` OR-query index (repeated because it is the only missing index)

`GLOSSARY.md:121` lists it as an index seed for the Backend Owner. It is the **only** one of the three that is actually missing, and it is the only one that **fails in production**.

| | |
|---|---|
| The query | `firestore_notices_repository.dart:37-39`, three OR branches over `(targetType, targetId)` |
| The index | **MISSING.** `firestore.indexes.json` has one composite on `(targetType, targetId)`, which is not a multi-branch index |
| The symptom | `FAILED_PRECONDITION: The query requires an index` |
| **Why it is silent** | `notices_flow.dart` maps a read failure to the **degraded/offline phase**, so the driver sees an **empty inbox**, not an error |
| The wrong comment | `firestore_notices_repository.dart:10-12` asserts *"no composite index is required beyond Firestore's automatic single-field indexes"*. That claim is **false** for an OR query with 2+ field-equality branches |
| **Why the emulator will not catch it** | The Firestore emulator does **not** enforce composite indexes (B-17). It must be verified against the real project |

**This is a one-line fix with a one-line verification, and it is the highest value-per-minute item in the whole backend plan.**

## E.7 What did NOT change, and is fine

For completeness, so the builder does not re-open them:

| Item | Why it is fine |
|---|---|
| `connectivity_plus` reports **interface presence, not internet reachability** | Closed by design (`GLOSSARY.md:98`). No reachability probe: battery cost on a driver phone, zero correctness gain. Failed writes re-queue with order preserved |
| `MaterialLocalizations.backButtonTooltip` for the back button | A **real** issue, but it is CL-D24 and it is part of R4 in Part C, not a carried-over backend item |
| The `trips.date` being the **IST midnight instant** rather than a `YYYY-MM-DD` string | Consistent and tested (`ist_clock_test.dart`, 27 tests). The only weakness is that it depends on the client's clock, which B.3 flags as a server-authoritative candidate |
| The `trips.wardIds` **snapshot** at shift start | Correct. If the office changes a driver's wards mid-shift, today's shift keeps its scope and history is not rewritten. Keep this |
| The FGS stop being **best-effort** | Correct. A platform failure must never block the final trail flush |
| The `Firebase` **bootstrap adoption** fix (double-engine race) | Fixed and pinned (`firebase_adopt_test.dart`) |
| The **D2 sheet occlusion geometry** | Handled by device verification, not widget tests. `GLOSSARY.md:159-162` records the law. Do not "fix" it from a screenshot |

---

# Part F — One merged execution sequence

Parts A, B and C each had their own plan. This is the **one ordered list** that a builder session should actually work through, with the dependencies made explicit.

## F.1 The gates

Three gates control the order. Nothing after a gate starts before the gate is cleared.

| Gate | What it clears | Who clears it | Blocks | **Status** |
|---|---|---|---|---|
| **G1** | The **device-provisioning answer** (B.4 step 4b): does the first phone to present a valid driver code **claim** the van, or must the van be **pre-provisioned** from the admin panel? | **The office** | The entire rules rewrite. This is the one piece of backend work that cannot be redone cheaply | ✅ **ANSWERED 2026-11-01: A. First-claim** (the office). F24 is unblocked |
| **G2** | The **F-08 copy** (A.2.2): what does a shared-van conflict say? | **The product owner** | One small client change. Can run in parallel with everything else | 📋 **ANSWERED 2026-11-01 (agent rec, pending sign-off): one typed conflict phase, three reasons** |
| **G3** | **PRD §0.16 vs the older PRD sections** (E.3): which is authoritative? | **The backend owner**, once, in writing | The GO backend build. Otherwise the PIN flow gets built and then deleted | 📋 **ANSWERED 2026-11-01 (agent rec, pending sign-off): §0.16 wins.** Seven PRD lines get struck |

**Everything else can start today without a gate.**

**All three gates are now answered, so nothing blocks the build.** The full answers, with the reasoning and the exact rules they force, are in `docs/BACKEND-GO-blueprint.md` section 12. **The summary is:**

| # | The answer, in one line |
|---|---|
| **G1 / Q1** | **First-claim.** The first phone with a valid code claims the van, inside a transaction. The transaction is what makes the race safe |
| **G2 / Q2** | **One typed conflict phase, three reason codes.** `vanHeldByAnotherDriver`, `vanAlreadyClaimed`, `staleMarker`. The server sends the code, the app owns the words |
| **G3 / Q3 + Q7** | **§0.16 wins.** The badge code is not a secret, the phone number is. **And §0.8's claim model wins**, so PRD `:193`'s *"the rules carry no custom-claim checks"* sentence is corrected |

**And the answers added four more decisions that were not gates**, because they do not block anyone. They are recorded so the two documents do not drift.

| # | The answer | What it forces |
|---|---|---|
| **Q4** | **Masked phone only.** `drivers.phoneMasked`, the raw phone moves to `staffPhones` | A **data migration before the rules deploy**. Section 3.3 of the GO blueprint |
| **Q5** | **A now, B in Phase 11.** The claims are minted at sign-in | **The admin panel's writes go through callables**, so a revoked staff member is locked out immediately |
| **Q6** | **Same install only.** A reinstall loses the app-side complaint history | The `deviceId` must be a **claim**, never a client parameter |
| **Q7** | **§0.8's model wins.** PRD `:193` gets a one-sentence correction | Every write rule checks a claim. **This is the P0 fix** |

## F.2 The sequence

### Track 1 — Client correctness (no gate, no backend dependency)

These are pure client work. They can start immediately and in parallel.

| # | Work | Files | Fixes | Risk | Test |
|---|---|---|---|---|---|
| **F1** | Make the production start path call the F-D2 seam, so the offline attach happens | `code_start_screen.dart`, `shift_tracking_auto_start.dart`, delete `basic_route_placeholder.dart` | **F-20 (P0) + F-09** | MED | New: a widget test that drives `CodeStartScreen` to `onShift` and asserts `attachedTripId`. Existing: `tracking_auto_start_test.dart` |
| **F2** | Type the shared-van conflict and give it its own copy. **One phase, three reason codes** (Q2's answer) | `identity_flow.dart`, `start_shift.dart`, both arb files | **F-08** | LOW | New: seed another driver's open trip, assert the conflict copy |
| **F3** | Fix the language-toggle test to find by key, not by text | `test/features/shift_start/language_toggle_test.dart` | Unblocks R2 | LOW | The test itself |
| **F4** | Move + reshape the language toggle | new `core/widgets/language_toggle.dart`, `glass_bar.dart`, `welcome_screen.dart`, `settings_screen.dart`, both arb files | **R2** | HIGH | F3's rewritten test |
| **F5** | Extract `ScreenLoadingView` / `ScreenEmptyView` / `ScreenDegradedView` | new `core/widgets/screen_state_views.dart`, `notices_screen.dart`, `pending_reports_screen.dart` | **R3** + 2 CL-D15 violations | LOW | Existing suites; no key pins these |
| **F6** | Extract `DriverPageHeader` and point the 8 screens at it | new `core/widgets/driver_page_header.dart`, 8 screen files, both arb files | **R4** + CL-D06 + CL-D24 | MED | Add a key per back button first |
| **F7** | Extract `DriverCtaBar` (chrome only, keep the phase switch in the flow) | new `core/widgets/driver_cta_bar.dart`, `code_start_screen.dart`, `end_shift_screen.dart` | **R5** | MED | `end_shift_screen_test.dart` |
| **F8** | Promote `_ConfirmRow` → `InfoRow` | new `core/widgets/info_row.dart`, `code_start_screen.dart` | **R6** | LOW | Existing suites |
| **F9** | Fix the `_SettingsCard` radius to `AppRadius.card` | `settings_screen.dart` | **R8** + CL-D16 | LOW | Device look |
| **F10** | Delete `SkeletonVanCard` and `readVans` | `core/widgets/skeleton.dart`, `vans_repository.dart`, `firestore_vans_repository.dart`, the fakes | **R9** | LOW | Existing suites |
| **F11** | Replace the 33 `AppTheme.spacingUnit` uses and the 13 hardcoded `horizontal: 24` with `AppSpace` | 13 files | **R7** + CL-D02 | MED | **Do not touch the live-route sheet files without a device check** (`GLOSSARY.md:159-162`) |
| **F12** | Close issues #27 and #28; re-open the GLOSSARY "attachTrip" line as F-20 | `GLOSSARY.md` | Housekeeping | NONE | — |
| **F12b** | Close issue #30 only **after** correcting its body: it claims `attachTrip` is fixed, which is false | GitHub issue body | Housekeeping | NONE | — |
| **F12c** | Renumber the depot auto-end ruling from #29 to #31 in PRD-2 §0.16 and GLOSSARY, so it stops colliding with GitHub issue #29 (F-08) | `docs/PRD-2-driver-app.md`, `GLOSSARY.md` | Housekeeping | NONE | — |

**F11 is last in Track 1 on purpose.** It touches 46 sites. If the widgets are not extracted first, it becomes a 46-site diff mixed with a structural change, and neither is reviewable.

### Track 2 — Backend free wins (no gate)

Pure backend work, no contract change, no app change. **These can be done today.**

| # | Work | Owner | Fixes | Risk |
|---|---|---|---|---|
| **F13** | Deploy the notices multi-branch index | Backend | **B-04** (E.6) | LOW. Verify against the **real project**, not the emulator |
| **F13b** | Chunk the notices OR query to stay under the 30-disjunction cap | Backend | **B-04 failure 2** | LOW. A repository change, no contract change. **Do this before the index**, because the cap failure is a hard HTTP 400 and the index failure is only a `FAILED_PRECONDITION` |
| **F14** | Fix the false comment in `firestore_notices_repository.dart:10-12` | Backend | E.6 | NONE |
| **F15** | Bound the complaints fetch (`orderBy` + `limit(200)`) | Backend | **B-05 option A** | LOW |
| **F16** | Delete `readVans` (the client side; F10 covers it) | Client | **B-18** | LOW |
| **F17** | Delete the `cloud_functions` dependency from `pubspec.yaml` | Client | **B-08** (client half) | LOW. Nothing in `lib/` imports it |
| **F18** | Delete `verifyDriverPin`, `setDriverPin`, the `DEMO_SEED_BYPASS` path, and `vanSecrets` | Backend | **B-08 + B-09** | LOW. **Confirm the office does not call `verifyDriverPin` from another app first** |
| **F19** | Add a reference-data seed script (`vans`, `routes`, `wards`, `notices`) **+ an emulator seed + a guard on the live seed** | Backend | B.9, **B-25** | LOW. Today a fresh Firebase project has **no vans at all**, and `scripts/seed_drivers.mjs` defaults to the **live** project |
| **F20** | Add the `functions` and `storage` emulators to `firebase.json`, and **commit `firebase.json`** | Backend | **B-17**, B-25 | LOW. Big effect on how confidently the backend can be tested. `firebase.json` is gitignored today, so a fresh clone has no emulator config at all |
| **F21** | Add the **Firestore rules test suite**. Promote the **17 existing probes** into it, then add the 11 positive cases | Backend | **D.3** (28 cases) | LOW. This is the highest-value test addition in the project. The probes already exist as a working prototype |
| **F22** | Add the CI pipeline: `pub get` → `analyze` → `test` → `build apk --debug`, then the rules suite | Backend | **B-14** | LOW |
| **F22b** | Fix the `functions/lib` deploy trap: make `"deploy"` run `npm run build` first, and make CI build explicitly | Backend | **B-20** | LOW. **Do this before any Functions deploy.** The compiled artifact is currently 27 hours older than the source |
| **F23** | Write the 5 ADRs from E.4 | Backend | E.4 | NONE. **Do this before the GO backend starts** |
| **F23b** | Add the inbound FCM handler + unsubscribe the van topic at End Shift | Client | **B-21, B-22** | LOW. PRD `:237`'s acceptance criterion is half-met without this |

### Track 3 — Backend structural work (gated)

| # | Work | Gate | Fixes | Risk |
|---|---|---|---|---|
| **F24** | Introduce `vanDevices` + `bindDeviceToVan` + custom claims. Rewrite `firestore.rules` to scope by `token.vanId`. Deny `drivers.list`. Make `vans.status` / `currentTripId` server-only. **Create-or-match inside a transaction (Q1). The `phoneMasked` migration runs BEFORE the rules deploy (Q4)** | ✅ **G1 answered** | **B-01 (P0) + B-02 + B-03** | **MEDIUM.** Needs an app change (sign in with the custom token). **The migration must land before the rules** |
| **F24b** | **The admin panel's write path.** Five callables (`setComplaintStatus`, `publishNotice`, `upsertDriver`, `upsertStaff`, `setVanDepot`), each checking `staff/{id}.active` server-side. **Every admin write rule becomes `if false`** | Q5 | The revoked-staff hole | MEDIUM. **The admin panel is a new product, so this is GO-backend work, not driver-app work** |
| **F25** | `startShift` / `endShift` / `markWardDone` callables with Firestore transactions. **Return typed conflict reason codes (Q2)** | G1 ✅ done | The duplicate-trip race, the idempotency hole | MEDIUM. Latency, and the offline queue must buffer Function calls |
| **F26** | Trail sharding: `trips/{id}/trail/{seq}` | G1 ✅ done | **B-07 (the 1 MiB cliff)** | MEDIUM. A contract change; the office app must read the new shape |
| **F27** | `sendNotice` + notices read receipts + the mock-location staff push + `drivers` audit fields + the stale-marker cleanup | — | **B-11, B-12, B-13, B-19** | LOW individually |
| **F28** | App Check + Play Integrity, Android flavors, CI with secrets, Storage rules scoping | After ticket 14 | **B-10, B-14, B-15, B-16** | HIGH. It restructures the Android build; the dev runbook depends on the current setup |

### Track 4 — GO backend (the new work)

**See the dedicated document: `docs/BACKEND-GO-blueprint.md`.** It is the bridge between the three apps (driver, user, admin) and owns the shared database, the rules, the Functions, the FCM topics and the shared constants.

The one thing that must happen **before** Track 4 starts: **G3**. PRD §0.16 and the older PRD sections describe **two different auth systems**. The GO backend builder must be told which one is authoritative, or they will build the PIN flow that F18 just deleted.

**The gate that was in front of Track 4 is cleared.** G3 was the only thing that had to happen before it started, and **G3 is answered: §0.16 wins.** The PIN flow is not built. The GO backend builder starts with the identity model already settled.

**And the answers are propagated, so the two documents do not drift.**

| The decision | What it changed in the GO blueprint |
|---|---|
| **Q1: first-claim** | Section 4.5's lifecycle is create-or-match inside a transaction. `vanDevices` gained a `claimMode` field. A runbook line for the console-delete recovery |
| **Q2: one conflict, three reasons** | The `bindDeviceToVan` and `startShift` contracts return **reason codes**, not English. The `enum ShiftConflictReason` and three arb keys are specified |
| **Q3 + Q7: §0.16 and §0.8 win** | Every write rule in section 5.2 checks a claim. The PRD `:193` correction is written out word for word |
| **Q4: masked phone only** | `drivers.phoneMasked`, plus the new `staffPhones` collection. The **five-step migration** is specified, with the order that makes it safe |
| **Q5: A now, B in Phase 11** | Section 4.6: the admin panel's writes go through **five callables**. Every admin write rule becomes `if false` |
| **Q6: same install only** | The complaint rules check `request.auth.token.deviceId`. The claim is set at the user app's session bootstrap |

## F.3 What runs in parallel, and what does not

```
  NOW  ┌─ Track 1 (client)          F1 ── F2 ── F3 ── F4 ── F5 ── F6 ── F7 ── F8 ── F9 ── F10 ── F11
        │                                    (F2's copy is ANSWERED: Q2)
        │
        ├─ Track 2 (backend)         F13 F13b F14 F15 F16 F17 F18 F19 F20 F21 F22 F22b F23 F23b
        │                            (all no gate, all parallel with Track 1)
        │
        └─ Track 4 (GO backend)      G3 is ANSWERED. Starts after F23 (the ADRs)
                                        │
                                        ├── F24  (the rules rewrite, the P0)
                                        ├── F25  (the shift callables)
                                        ├── F26  (the trail sharding)
                                        ├── F27  (the contract additions)
                                        ├── F24b (the admin's callables)
                                        ├── GO   (the user app + the admin panel)
                                        └── F28  (the hardening)
```

**The critical path is F1 → F24 → F25 → F26.** F1 is the client half of the identity change (sign in with the custom token). F24 is the server half. They must land together or the app breaks.

**What changed from the gated version.** G1, G2 and G3 were the three places the plan used to stop. **All three are answered.** The plan now has no gate. The only remaining ordering constraint is the one inside F24: **the `phoneMasked` migration lands before the new rules deploy**, because a `get` returns the whole document and the rules do not redact.

## F.4 The file ownership map

For a builder session with subagents. **One agent per file set.** Shared files run in sequence.

| Slice | Files | Agent profile | Depends on |
|---|---|---|---|
| **S1: the start-path fix** | `code_start_screen.dart`, `shift_tracking_auto_start.dart`, `basic_route_placeholder.dart` (delete) | builder | nothing |
| **S2: the conflict typing** | `identity_flow.dart`, `start_shift.dart`, `app_en.arb`, `app_gu.arb` | builder | ✅ G2 answered. **Shares `identity_flow.dart` with S1** → run after S1 |
| **S3: the rules + tests** | `firestore.rules`, `functions/test/**`, `functions/package.json`, `firebase.json` | builder | nothing |
| **S4: the Functions cleanup** | `functions/src/index.ts`, `scripts/seed_drivers.mjs` | builder | nothing. **Shares `functions/package.json` with S3** → run after S3, or split the package.json edit |
| **S5: the state widgets** | new `core/widgets/screen_state_views.dart`, `notices_screen.dart`, `pending_reports_screen.dart` | builder | nothing |
| **S6: the page header** | new `core/widgets/driver_page_header.dart`, 8 screen files, both arb files | builder | S2 (shares the arb files) |
| **S7: the language toggle** | new `core/widgets/language_toggle.dart`, delete `features/shift_start/ui/language_toggle.dart`, `glass_bar.dart`, `welcome_screen.dart`, `settings_screen.dart`, both arb files, `language_toggle_test.dart` | builder | F3 first. **Shares the arb files with S2 and S6** → run last of the arb-touching slices |
| **S8: the token sweep** | 13 files | builder | S5, S6, S7 (it is the last sweep) |

**The arb files are the contention point.** `app_en.arb` and `app_gu.arb` are touched by S2, S6 and S7. Serialize those three, or have one agent own the arb files and take the key requests from the others.

## F.5 The verification ladder

Run this after every slice, before the commit.

| Tier | What | When |
|---|---|---|
| **1. Mechanical** | `flutter analyze` clean, `flutter test` green, the diff touches **only** the assigned files | Every slice |
| **2. Device look** | The F4, F6, F7, F9, F11 slices change pixels. Open the app and look at it | Those slices |
| **3. Adversarial review** | A read-only reviewer checks the diff against the acceptance criteria | F1 (the P0 fix), F24 (the rules rewrite) |

**Two project-specific rules for the ladder.**

| Rule | Why |
|---|---|
| **Never run `flutter analyze` or `flutter test` inside the repo.** Copy it out first: `git archive HEAD \| tar -x -C /tmp/opencode/check` | The repo has concurrent sessions. A `pub get` or a `.dart_tool` write can collide |
| **Never run two `flutter run` sessions at once** (`GLOSSARY.md:140`) | A second run's Gradle force-stops and reinstalls mid-flow, killing the live session. Use `flutter build apk --debug` + `flutter install` |

## F.6 The definition of done, per item

| Item | Done means |
|---|---|
| **F1** | A widget test drives the **screen** to `onShift` and asserts `offlineSyncService.attachedTripId == tripId`. The old test that calls the starter directly is kept as a unit test of the starter, but the **path** test is the one that gates the fix |
| **F13** | The notices query runs against the **real** project and returns rows. The emulator is not proof |
| **F13b** | The same query with **29 ward ids** runs against the real project and does **not** return HTTP 400. The emulator **does** enforce this cap, so it is one of the few things that can be checked locally |
| **F21** | `firebase emulators:exec --only firestore "npm test"` passes, and the suite contains at least the 11 P0 denial cases from D.3 |
| **F22b** | `npm run deploy` runs `npm run build` first. A deploy with a stale `functions/lib/` is impossible |
| **F23b** | A push arrives while the app is closed, the badge is right when the app opens, and tapping the notification opens the notice. The van topic is unsubscribed at End Shift |
| **F24** | `drivers.list` is denied. Another driver's phone number is not readable. Another van is not writable. The suite proves it |
| **F26** | A trip with 20 000 points works, because the points live in 20 chunk docs, not one |

---

# Part G — Handoff checklist and glossary

## G.1 The handoff checklist

A builder session picking this up should read the parts in this order.

| # | Read | Why |
|---|---|---|
| 1 | **Part A** (the launch/identity findings) | It is the current truth about the client. Three rulings have landed since the last audit (two this report asked for, one it did not) and one P0 bug is still live behind a "fixed" label |
| 2 | **Part B** (the backend blueprint) | It is the backend owner's brief. B-01 is the P0 |
| 3 | **Part C** (the UI duplication map) | It is the UI builder's brief, with the exact refactor order |
| 4 | **Part D** (the test map) | Before writing a test, read what is already pinned |
| 5 | **Part E** (the carried-over items) | Do not re-open these |
| 6 | **Part F** (the merged sequence) | This is the work order |
| 7 | **`docs/BACKEND-GO-blueprint.md`** | The GO backend brief |

### The three questions to answer before starting

**All three are answered. Nothing blocks the build.**

| Question | Who answers it | Why it blocks | **The answer** |
|---|---|---|---|
| **G1. Does the first phone to present a valid driver code claim the van, or must the van be pre-provisioned from the admin panel?** | **The office** | The rules rewrite (F24). It is the one piece that is expensive to redo | ✅ **ANSWERED 2026-11-01: A. First-claim** (the office). The callable is create-or-match inside a transaction |
| **G2. What does a shared-van conflict say?** | **The product owner** | The copy (F2). Small, but it needs a human | 📋 **ANSWERED (agent rec, pending sign-off): one typed conflict phase, three reason codes.** `vanHeldByAnotherDriver`, `vanAlreadyClaimed`, `staleMarker` |
| **G3. Is PRD §0.16 authoritative over the older PRD sections on the auth flow?** | **The backend owner** | The GO backend. Otherwise the PIN flow gets built and deleted | 📋 **ANSWERED (agent rec, pending sign-off): §0.16 wins.** The badge code is not a secret, the phone number is. Seven PRD lines get struck |

**And four more decisions were made that nobody was blocked on**, so the two documents do not drift:

| # | The decision | The answer |
|---|---|---|
| **Q4** | Raw phone or masked phone in the driver app? | **Masked only.** `drivers.phoneMasked`. The raw phone moves to a separate `staffPhones` collection |
| **Q5** | How fast does a staff member's scope or access change? | **Scope at sign-in, revocation immediately.** The admin's writes go through callables that read the live `staff` doc |
| **Q6** | Can a citizen see their complaint after a reinstall? | **No.** Same install only. The `deviceId` is a claim, not a client parameter |
| **Q7** | §0.8's `vanId` claim check vs §0.16's "no custom-claim checks"? | **§0.8's model wins.** PRD `:193` gets a one-sentence correction |

**The full reasoning, with the exact rules each answer forces, is in `docs/BACKEND-GO-blueprint.md` section 12.**

### The first five things to do

| # | What | Why first |
|---|---|---|
| 1 | **F13b + F13**: chunk the notices OR query, then deploy the multi-branch index | Two lines of code and one index. Fixes **two** silent production failures (an empty inbox). The chunking comes first because the cap failure is a hard HTTP 400 |
| 2 | **F1**: make the production start path call the F-D2 seam | The P0. Fixes the offline attach and F-09 together |
| 3 | **F21**: the Firestore rules test suite | The rules are the security boundary and have zero tests. This is what would have caught B-01. **The 17 probes already exist as a prototype** |
| 4 | **F23**: write the 5 ADRs | Cheap now, expensive later. The GO backend builder must not re-litigate them |
| 5 | **F3 + F4**: fix the language toggle test, then reshape the toggle | The one refactor that breaks a test. Doing it first isolates the break |
| 6 | **F22b + F19**: fix the deploy trap and guard the seed script | Two live hazards. One can ship stale Functions, the other can write to production |

### The things not to do

| Do not | Why |
|---|---|
| **Do not** auto-jump to D2 on a relaunch **without** reading A.2.1's shared-phone note | Ruling #27 did this. It is a conscious acceptance. If the office disagrees, that is a new ruling, not a bug fix |
| **Do not** touch the live-route sheet files in F11 | The bottom-most-snap law (`GLOSSARY.md:159-162`). Widget tests cannot catch nav occlusion |
| **Do not** run two `flutter run` sessions | `GLOSSARY.md:140`. It kills the live session |
| **Do not** run `flutter analyze` / `flutter test` inside the repo | Concurrent sessions. Copy out first |
| **Do not** rebuild the PIN flow because the old PRD sections describe it | §0.16 supersedes. F18 deletes it |
| **Do not** assume the emulator proves the indexes work | It does not enforce them (B-17) |
| **Do not** change `AppSpace` values in the live-route files | The sheet geometry is derived from them |
| **Do not** build the admin console as part of the backend work | PRD-3 is a separate product. B.4's "pre-provision from the admin panel" needs only **a console write**, not a panel |
| **Do not** run `node scripts/seed_drivers.mjs` without `FIREBASE_PROJECT` | The script defaults to the **live** project `safaaisaathi-63a87`. B-25 |
| **Do not** run `firebase deploy --only functions` without `npm run build` first | `functions/lib/index.js` is currently **27 hours older** than the source. B-20 |
| **Do not** cite "ruling #29" without saying which one | The PRD's #29 is the depot auto-end. GitHub issue #29 is the F-08 conflict copy. A.4.1 |
| **Do not** deploy the new rules before the `phoneMasked` migration | A Firestore `get` returns the **whole document**. The rules allow or deny, they do not redact. **Data first, rules second** (Q4) |
| **Do not** let the admin panel write directly to Firestore | A rules check trusts the token, and a revoked staff member's token stays valid for up to an hour. **Writes go through callables** (Q5) |
| **Do not** take the `deviceId` from a client parameter | Then any caller can name any device's scope and read its complaints. **It must be a claim** (Q6) |
| **Do not** make the server send English error text to the app | The server sends a **reason code**. The app owns the words, in both locales (Q2) |
| **Do not** build the PIN flow "just in case" | §0.16 wins. The PIN flow is deleted, not parked (Q3) |
| **Do not** read PRD `:193` literally | One sentence in it is wrong. §0.8's claim model wins, and `:193` gets corrected (Q7) |

## G.2 The glossary

Terms used across this document, in plain language.

### Domain terms

| Term | Meaning in this project |
|---|---|
| **Ward** | A collection area the van serves. Has a centre point and a radius. The citizen's unit of geography |
| **Route** | An ordered list of wards a van visits in a shift. `routes/{id}.wardIds` is the visiting order |
| **Van** | The vehicle. Carries **one** tracked phone. **One van serves one route and carries one tracked Android phone** (`GLOSSARY.md:7`) |
| **Driver** | The person borrowing the van's phone. **Not** the same thing as the van. This distinction is the whole identity model (B.4) |
| **Driver code** | A badge like `AB-1001`. The doc id of `drivers/{CODE}`. **A public identifier, not a secret** (§0.16 `:193`) |
| **Shift / Trip** | One work session. `trips/{id}` is the record. It snapshots the driver's ward allotment at start |
| **D2** | The Live Route screen. The driver's working screen |
| **D1** | The Start Shift screen. The driver's entry screen |
| **D3** | The Notices screen |
| **D4** | The Pending Reports screen. Where the driver resolves a complaint |
| **Depot** | An admin-set tag on the van. A van that sits at its depot for 3 h auto-ends its shift (ruling #29) |
| **Assigned** | A complaint status. The driver tapped "Will Revisit". The office sees it |
| **Escalation** | A complaint moving up the staff hierarchy: level 0 inspector → 1 chief officer/TDO → 2 DDO |

### Technical terms

| Term | Meaning |
|---|---|
| **Firestore rules** | The server-side authorization. They decide who can read and write each document. **The security boundary** |
| **Anonymous auth** | Signing in with no account. You get a session but no identity. The current app does this, which is why the rules cannot tell one driver from another (B-01) |
| **Custom claims** | Extra fields baked into an auth token by the server. The proposed anchor: `request.auth.token.vanId` |
| **Custom token** | A token the server mints and the client signs in with. It can carry custom claims |
| **App Check / Play Integrity** | Firebase's proof that the caller is the real signed app. **Reduces** the population of callers that reach the rules. It does not replace the rules |
| **Composite index** | A Firestore index on multiple fields. Needed for queries that filter on 2+ fields |
| **Multi-branch index** | A special composite index needed for an `OR` query with 2+ field-equality branches. **The notices query needs one and does not have it** (B-04) |
| **`whereIn` 30-value cap** | Firestore's hard limit on an `in` clause. A longer list must be chunked |
| **The 1 MiB document limit** | Firestore's hard limit on one document. `trips.gpsTrail` hits it at about 5 h of 1 Hz tracking (B-07) |
| **`arrayUnion`** | A Firestore write that adds items to an array without duplicating existing ones. It is a read-modify-write, so it costs more on a large array |
| **FCM topic** | A named channel. `van_{vanId}`, `ward_{wardId}`, `all`. The apps subscribe; the server publishes |
| **Server timestamp** | `FieldValue.serverTimestamp()`. The server's clock, not the phone's. Safer than the client clock |
| **The emulator** | A local Firebase. **It does not enforce composite indexes**, which is why B-04 cannot be caught locally |
| **The seam** | The place where an interface lives. A point where behaviour can change without editing in that place |
| **A fake / a stub** | A test double. `FakeTripsRepository` stands in for the real one so tests never touch the network |
| **A rules unit test** | A test that drives the rules in an emulator and asserts allow/deny per operation. The missing safety net (D.3) |
| **A P0 / P1 / P2** | Priority. P0 = data loss or a security hole. P1 = broken for the user. P2 = wrong or wasteful |

### Process terms

| Term | Meaning |
|---|---|
| **A ruling** | A product decision that resolves a contradiction in the contract. Recorded in the PRD, not just in the code. #27 and #28 are examples |
| **An ADR** | An Architecture Decision Record. A short file in `docs/adr/` recording a decision and its reason. **The directory exists and is empty** (E.4) |
| **Rule 0 / user verification** | `GLOSSARY.md`: *"after a feature finishes building, verify it AS A USER WOULD. Green tests/analyze are necessary but NOT verification."* |
| **The gate** | A dependency that blocks work. G1, G2, G3 in Part F. **All three are answered** |
| **The issue tracker** | GitHub Issues via `gh`. `docs/agents/issue-tracker.md` has the workflow |
| **The bag** | The GLOSSARY's triaged work list. The "Improvement Bag", the "Feature Bag" |
| **The build steps / PRD §5** | The PRD's own ordered build plan (F-D1, F-D2, ...). The demo follows it |
| **AC#1..AC#n** | The PRD's acceptance criteria. AC#3 is the relaunch-resumes-tracking one |

## G.3 The closing summary

| Part | The one thing to take from it |
|---|---|
| **A** | The launch/identity flow is in good shape. Three rulings landed. But **F-20** is a P0 behind a "fixed" label, **F-08** still needs a copy ruling, and ruling #29's numbering collides with GitHub issue #29 |
| **B** | Every Firestore rule is `request.auth != null` and the app is anonymous. **B-01 is the security hole.** The backend needs a device anchor, and **the office has answered: first-claim** (Q1). And the notices inbox **dies at 29 wards** |
| **C** | 11 duplicated patterns, ~700 lines. The language toggle exists in three shapes; the back button changes size between screens. The order R1→R9 is fixed for a reason |
| **D** | The Dart suite tests outcomes well (451 tests). The server has **zero** tests, but the **17 emulator probes already exist as a prototype**. The rules suite is the highest-value addition |
| **E** | The open issues, the GLOSSARY bags, the doc drift, the empty `docs/adr/`, and the two silent cliffs |
| **F** | The one ordered work list, with the gates, the file ownership map and the verification ladder |
| **G** | The handoff checklist and the glossary |

**The one sentence.** *Close the security hole (B-01), fix the offline attach that is labelled fixed but is not (F-20), and get the rules a test suite (D.3) before anything else is built on top of them.*

**The second sentence.** *And chunk the notices query before the index, because the 29-ward cliff is a hard HTTP 400 and the index is only a `FAILED_PRECONDITION`.*

---

**Verified at HEAD `a0cba52`. `flutter analyze` clean, `flutter test` 451/451, 17/17 emulator probes matched.** Read-only. Zero code changes, zero commits, zero branch switches.
