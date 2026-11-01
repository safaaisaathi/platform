---
id: issue-register
title: The Issue Register
status: frozen
owner: platform-owner
updated: 2026-11-02
contractVersion: "1.0.0"
audience: both
see_also:
  - ./AUDIT2-flow-backend-ui.md
  - ./BACKEND-GO-blueprint.md
  - ../06-changes/impact-matrix.md
---

# The Issue Register

**The live state of every outstanding item, and where each one now lives.**

**This file is a report, not a source of truth.** The truth for a GitHub item is the GitHub item. The truth for a contract item is `../02-contracts/`. The truth for a change is `../06-changes/manifest.json`.

**The snapshot date is 2026-11-02.** The GitHub state was read with `gh issue list --state all` and `gh pr list --state all` against `safaaisaathi/driverapp` at HEAD `b9a2375`.

## 1. The numbering trap

**GitHub issues and pull requests share one number space.** So there are gaps in the issue list that are not missing issues.

| Number | What it actually is | State |
|---|---|---|
| 23 | A **pull request**, not an issue. "Driver identity: XX-0000 code login, welcome-back card, auth-gated first lookup" | MERGED |
| 26 | A **pull request**, not an issue. "Bag sweep: IST day window, measured trail batching, two D2 device fixes" | MERGED |
| 30 | A **pull request**, not an issue. "Launch/identity audit + rulings #27/#28" | **OPEN** |

**So the highest ISSUE number is 29.** There is no issue #30. **The audit's line that says "the next free one is #31, since #30 is the audit-tracking issue" is describing PR #30, not an issue.** The conclusion still holds, but for a different reason.

## 2. The ruling-number collision

**This is the one thing to fix before anything else in the PRD.**

| Namespace | `#29` means |
|---|---|
| **GitHub issue #29** | **F-08.** The shared-van conflict shows the generic "Check the connection" copy. It is **OPEN** and genuinely open |
| **PRD "ruling #29"** | **The depot auto-end.** Parked 3 hours inside 500 m. Built in `a1c33c9` |

**Two different things share the number 29.** A builder who reads "ruling #29" in the PRD and then opens issue #29 finds a completely unrelated bug.

**The fix is one line in the PRD, not a comment.** The PRD is the frozen contract, so the correction belongs there.

| Option | What it does | Verdict |
|---|---|---|
| **Renumber the depot ruling to #31** | The next free ruling number. No collision, no ambiguity | **Recommended.** It is one edit in one place |
| Write "ruling #29 (depot), distinct from GitHub issue #29 (F-08)" | Keeps the number, adds the disambiguation | Acceptable, but every future reader has to parse it |
| Leave it | The collision survives | Not acceptable |

**The PRD is in the driver app's repo.** This is a one-line fix to `docs/PRD-2-driver-app.md` there, not a change to this repo.

## 3. The open GitHub items, and what each one really needs

| # | Title | State | The truth | The action |
|---|---|---|---|---|
| 27 | Ruling: launch-time open-shift resume | **OPEN** | **Built** in `7004d1f`. F-19 is closed | **Close it.** It has been open since the work landed |
| 28 | Ruling: welcome-back card shows Van + Route | **OPEN** | **Built** in `7004d1f`. F-06 is closed | **Close it.** Same reason |
| 29 | Shared-van conflict shows the generic "Check the connection" copy (F-08) | **OPEN** | **Genuinely open.** Needs a copy ruling | **Keep it open.** The copy is now decided, see below |
| PR 30 | Launch/identity audit + rulings #27/#28 | **OPEN** | **Its body claims something false.** It says "`attachTrip` never called → fixed: attached at start/resume". It is **still not called in production** | **Correct the body before merging** |

### 3.1 Why PR #30's body is false

**This is the F-20 lesson, and it is worth understanding because it is the exact failure this whole repo exists to prevent.**

| Fact | Where |
|---|---|
| `attachTrip` was added to `TrackingAutoStarter.startTrackingFor` | `lib/features/shift_start/data/shift_tracking_auto_start.dart:72` |
| The **production** start path never calls that method | `lib/features/shift_start/ui/code_start_screen.dart:84-137`, `_runPermissionFlowAndNavigate` |
| The unit test calls `TrackingAutoStarter` **directly** | `tracking_auto_start_test.dart` |
| The commit that added it marked it fixed | `3de805c`, and `GLOSSARY.md:106` records it as fixed |

**So the test is green, the tracker says fixed, the GLOSSARY says fixed, and the bug is live.** The test proves the seam works. It does not prove the path reaches the seam.

**The rule.** *Test the path, not the seam.* A test on an unreached method is a false green.

**This is why the platform repo needs the adoption gate.** "We fixed it" was a claim in three places and nothing checked it against the code. **The adoption record makes the claim a file, and the file is checked.**

### 3.2 F-08's copy is now decided. The issue can be actioned, not just discussed.

**The decision.** One typed `startConflict` phase, with three reason codes, and the server sends the code while the app owns the words.

| The server sends | The app shows |
|---|---|
| `vanHeldByAnotherDriver` | `identityShiftConflictOtherDriver` |
| `vanAlreadyClaimed` | `identityShiftConflictClaimed` |
| `staleMarker` | `identityShiftConflictStaleMarker` |

**The contract is in `../02-contracts/errors.json` and `../02-contracts/enums.json`.** The third reason comes from the first-claim race, where two phones present one valid code for one van.

**One phase, not three screens.** Three separate screens would triple the work for no gain.

## 4. The audit findings that are still open

**Source: `AUDIT2-flow-backend-ui.md`, sections A.2 and B.2.** The findings are the audit's. The column on the right says where each one now lives in this repo.

### 4.1 The flow and UI findings

| ID | What | Severity | Where it lives now |
|---|---|---|---|
| **F-20** | The production start path never attaches the trip to the offline drain. **P0, silent data loss** | **P0** | The driver app's code. The platform's role is the adoption gate |
| **F-09** | The permission flow runs twice for the start path. The same root cause as F-20 | P1 | The driver app's code |
| **F-08** | The shared-van conflict shows the generic copy | P1 | The copy is decided. `../02-contracts/errors.json` |
| **F-11** | The session gate is not app-wide. It lives only in `identity_flow.dart:171` | P1 | The driver app's code |
| **F-05** | "Different driver?" keeps the stored code | P2 | The driver app's code |
| **F-17 / F-18** | Doc drift between the PRD, the design file and the GLOSSARY | P2 | The PRD is in the driver app's repo |

### 4.2 The backend findings, mapped to their platform home

| ID | What | Severity | Where it lives now |
|---|---|---|---|
| **B-01** | The rules are authentication-only. `request.auth != null` everywhere. **Proven on a real emulator with 17 probes** | **P0** | **`CHG-0003`** and `../03-rules/firestore.rules` |
| **B-02** | `trips` create has no ownership check | P1 | `CHG-0003` |
| **B-03** | `vans` update scope includes the takeover fields | P1 | `CHG-0003` |
| **B-04** | The notices `OR` query has two hard failures. One is the 29-ward cliff | P1 | `../03-rules/firestore.indexes.json`, plus the client-side fix |
| **B-05** | Complaints over-fetch, then filter on the client | P1 | The client repos |
| **B-06** | `whereIn` is capped at 30 values | P2 | The client repos |
| **B-07** | `trips.gpsTrail` is one unbounded array | P1 | **`CHG-0005`**. The trail subcollection |
| **B-08** | `verifyDriverPin` is dead code that is still deployed | P1 | **`CHG-0006`** |
| **B-09** | `setDriverPin` has a live bypass flag | P1 | **`CHG-0006`**. `DEMO_SEED_BYPASS` at `04-functions/src/index.ts:173-188` |
| **B-10** | No App Check | P1 | The client repos. **After** the rules are tightened, not before |
| **B-11** | `notices` has no read-state | P2 | The contract defines `noticeReceipt`. It needs a change entry |
| **B-12** | No staff push on mock-location detection | P2 | The Functions. `../02-contracts/topics.json` |
| **B-13** | `drivers` has no audit fields | P2 | The contract |
| **B-14** | No CI | P1 | **`../.github/workflows/contract-gate.yml`** exists now |
| **B-15** | No Android flavors | P2 | The driver app |
| **B-16** | Storage rules are loose and the path is meaningless | P2 | `../03-rules/storage.rules` |
| **B-17** | The emulator suite cannot run the Functions or Storage | P2 | The driver app's CI |
| **B-18** | `readVans()` is a dead full-collection read | P2 | The client repos |
| **B-19** | Nothing clears a stale `vans.currentTripId` | P2 | `../02-contracts/callables.json`. `startShift` handles `staleMarker` |
| **B-20** | The `functions/lib/` build artifact is stale. **A deploy trap** | P1 | `../04-functions/README.md` section 10 |
| **B-21** | There is no inbound FCM handler | P1 | The client repos. `../02-contracts/topics.json` defines the payloads |
| **B-22** | The van topic is never unsubscribed | P1 | The client repos |
| **B-23** | There is no topic registry | P2 | **Optional.** `deviceTopic` is in the contract, marked optional |
| **B-24** | No scheduled Functions | P2 | The Functions |
| **B-25** | The seed script defaults to the live project | P1 | The driver app's `scripts/` |

## 5. The two silent cliffs

**These are the ones that do not announce themselves.** They are in the audit's section E.5.

| Cliff | What it looks like | Why it is silent |
|---|---|---|
| **The 29-ward `OR` query** | The notices inbox dies with a hard HTTP 400 on a route with 30 wards. It works on every smaller route | It only fires at scale. Every test route has fewer wards |
| **The `whereIn` 30-value cap** | A query with 31 values fails | It is latent. Production uses `watchRouteWards`, not `whereIn` |

**Neither shows up in the emulator.** A green emulator run is not proof of index coverage. **The only place either is proven is a staging project with the real indexes.**

## 6. The items this register cannot track

| Item | Why | Where it goes instead |
|---|---|---|
| A contract change | It is not an issue, it is a change | `../06-changes/manifest.json` and its `CHG-*.md` file |
| An app's adoption of a change | It belongs to that app | The app's own `.contract/adopted.json` |
| A design decision | It is not an issue | `../05-decisions/` |
| A PRD correction | The PRD is in the app's repo | The app's repo |

**The rule.** *An issue is a task with an owner and a due date. A contract change is a decision with a migration. Putting a contract change in an issue tracker is how it gets lost.* The platform repo moves contract changes out of the tracker and into the manifest, where CI can see them.

## 7. The recommended order of work

**This is the order that works. The order is load-bearing.**

| # | What | Why here |
|---|---|---|
| 1 | Close issues #27 and #28 | They are done. Leaving them open makes the tracker lie |
| 2 | Correct PR #30's body | It makes a false claim. Merging it would put a false claim in the history |
| 3 | Fix F-20 and F-09 together | Same root cause. One owner per side effect, one production path |
| 4 | Renumber the depot ruling in the PRD | One line. It removes the collision before anyone trips on it |
| 5 | Deploy the three session-minting callables | **CHG-0003**, step 1. The clients need a claim before the rules need one |
| 6 | Ship the three client halves | **CHG-0003**, steps 2 to 4 |
| 7 | Deploy the new rules | **CHG-0003**, step 5. **LAST.** The loose old rules keep the old clients working |
| 8 | Delete the PIN flow | **CHG-0006**. It is a five-minute deletion of a live unauthenticated write path |
| 9 | Migrate the phone to `phoneMasked` and `staffPhones` | **CHG-0002**. Data first, rules second |
| 10 | Shard the trail | **CHG-0005** |
| 11 | Add the missing indexes | `vans(routeId,status)`, `complaints(wardId,createdAt)`, the notices multi-branch |

**Steps 5, 6 and 7 are one change and must not be separated.** Separating them is what produces "the complaints screen is empty".

## 8. How to refresh this register

```bash
cd ../driverapp
gh issue list --state all --limit 100
gh pr list --state all --limit 100
git log --oneline -20
```

**Then update three things.** The GitHub state above, the open findings in section 4, and `../06-changes/adoption.json`.

**And re-run the audit.** A finding marked closed must be re-verified against the code, not against the tracker. **That is the F-20 lesson.**
