---
id: prompt-driverapp
title: Driver App Harness Brief
status: active
owner: platform-owner
updated: 2026-11-02
contractVersion: "2.2.0"
audience: harness
see_also:
  - ./README.md
  - ../07-guides/wiring-an-app-to-the-contract.md
  - ../07-guides/adopting-a-change.md
  - ../03-rules/README.md
  - ../06-changes/manifest.json
---

# Driver App Harness Brief

**You are the harness for `safaaisaathi/driverapp`.** Flutter, Dart, Android. The repo is at `../driverapp`, the platform repo at `../platform`.

**Your job: take the driver app from "it writes to Firestore anonymously and ships its own copy of the backend" to "it runs on the shared contract with claim-scoped writes".**

**Read this whole brief before you touch a file.**

---

## 0. The state of the app, in facts

**These came from reading the code. Verify them, do not assume them.**

| Fact | Where |
|---|---|
| The app signs in **anonymously**. It never calls `signInWithCustomToken` | `lib/core/` |
| The app has its **own copy of the backend**, `functions/src/index.ts`, with `verifyDriverPin`, `setDriverPin` and the `vanSecrets` collection | `functions/` |
| The app's `functions/.env` is **committed to git** and holds `DEMO_SEED_BYPASS` | `functions/.env` |
| `pubspec.yaml` depends on `cloud_functions: ^7.0.1` | `pubspec.yaml` |
| The app writes telemetry directly to `vans`, `trips` and two complaint fields | `lib/core/repositories/firestore/*.dart` |
| The app reads `drivers.phone`. The contract has `drivers.phoneMasked` | `lib/core/repositories/firestore/firestore_drivers_repository.dart` |
| The app's `firebase_options.dart` names the project `driver-app-demo`. The platform project is `safaaisaathi-63a87` | `lib/core/config/firebase_options.dart` |
| A test config names `test-project` | `test/bootstrap/firebase_adopt_test.dart` |
| The app already has `.contract/vendor/` and `.contract/adopted.json` | `.contract/` |
| `check-conflicts.ts` reports **7 conflicts, worst P0** | Platform tooling |

**The app is not broken. It is unwired.** The writes work today because the deployed rules only ask "is somebody signed in".

**Two platform issues this app raised are now fixed.** The false `UNKNOWN COLLECTION "trail"` (issue #2) is gone: the scanner resolves a subcollection name to its schema file. The missing mock-location write path (issue #1) is a callable now, `flagMockLocation`, CHG-0017. After CHG-0005 and CHG-0017, `check-conflicts.ts --app driverapp` must reach zero conflicts.

---

## 1. Authority order

1. The contract (`02-contracts/`) wins over every PRD and over this brief. If your app's code disagrees with the schema, your app's code is wrong.
2. **Your app's own `.contract/vendor/` is the contract.** Read schemas from `.contract/vendor/02-contracts/collections/<x>.schema.json`, never from `../platform/02-contracts/`. The fingerprint is what your app was built against.
3. `../platform/06-changes/manifest.json` is the machine list of what changed. The `CHG-*.md` file explains why. Read both.
4. Your app's `.contract/adopted.json` is the truth about YOUR adoption. `../platform/06-changes/adoption.json` is a report of it.
5. `../platform/03-rules/` wins over anything that claims who may read or write.
6. `../platform/02-contracts/features/shift-operations.json` and `../platform/02-contracts/features/live-van-tracking.json` say what is still missing in your app. They never override the schema.

## 2. Hard constraints

| # | Constraint |
|---|---|
| 1 | NEVER implement a field name that is not in `.contract/vendor/02-contracts/`. Grep it before you write code |
| 2 | NEVER invent a callable, a claim, a reason code, a topic or an enum value |
| 3 | NEVER send the badge code, the `driverId` or the `wardIds` as an authorization scope. They come back from the server as claims |
| 4 | NEVER send an English error message that the server should send. The server sends a reason code. The app owns the words |
| 5 | NEVER keep a copy of the backend in this repo. One backend, in the platform repo |
| 6 | NEVER commit a `.env` that holds a secret or a bypass flag |
| 7 | NEVER deploy. Deployment is a human action, and the order matters |
| 8 | NEVER mark a checklist item `done` without evidence. Evidence is a merged PR number |
| 9 | NEVER set a change to `adopted` while any checklist item is open. Partial adoption is `in_progress` |
| 10 | NEVER edit the platform repo from this repo |
| 11 | **Do not change the app's UI, its localisation, or its design.** This brief is about the data path. The screens stay as they are |

## 3. Read budget

| Your task | Read exactly these | Do not read |
|---|---|---|
| Sync the contract | This brief, section 4.1 | The platform's schemas |
| Find what applies to you | `../platform/06-changes/manifest.json`, your app's block in `../platform/06-changes/adoption.json` | The `CHG-*.md` files for other apps' changes |
| Understand one change | Its `../platform/06-changes/CHG-<nnn>-<slug>.md` file | `../platform/09-reference/` |
| Get a field shape | The one schema in `.contract/vendor/02-contracts/collections/` | The other schemas |
| Get a callable's contract | The one entry in `.contract/vendor/02-contracts/callables.json` | The whole file |
| Know what is missing | `../platform/02-contracts/features/shift-operations.json`, `live-van-tracking.json` | The feature entries for the other apps' journeys |

**The read budget is not a speed trick.** One enum change needs none of `09-reference/`.

## 4. Procedure

### 4.1 Sync the pinned contract

```bash
node ../platform/08-tools/sync-contract.ts .
# expected: contract synced into .contract/vendor
```

**It removes the previous copy first.** Never hand-edit `.contract/vendor/`.

### 4.2 The checklist, in order

**Work these in this order.** The order is the migration.

| # | Change | What to do | The acceptance check |
|---|---|---|---|
| 1 | **CHG-0006** | Delete the app's own `functions/` deployment entirely. Delete `functions/.env` from the repo. **Keep the `cloud_functions` dependency in `pubspec.yaml`**: CHG-0003's callables need it to call anything | `grep -rn 'verifyDriverPin\|setDriverPin\|vanSecrets\|DEMO_SEED_BYPASS' lib/ functions/ scripts/ pubspec.yaml` gives zero hits. `functions/` does not exist |
| 2 | **CHG-0009** | Confirm no backend copy is left | `grep -rn 'onCall\|onWrite\|onSchedule' lib/` gives zero hits |
| 3 | **CHG-0008** | Point every Firebase config at `safaaisaathi-63a87`. Remove the `driver-app-demo` and `test-project` names. No hardcoded fallback | `grep -rn 'driver-app-demo\|test-project' lib/ test/` gives zero hits |
| 4 | **CHG-0003** | Call `bindDeviceToVan({ driverCode, installId })` at sign-in, then `signInWithCustomToken`. The token carries `vanId` and `driverId`. **No silent fallback to anonymous** | The session's claims contain `vanId` and `driverId`. A failed bind shows the localized reason code |
| 5 | **CHG-0003** | Call `startShift({ driverId, date })`. The fresh token carries `currentTripId`. Call `endShift({ tripId })` and `markWardDone({ tripId, wardId, flagged })` | The trip's `wardIds` snapshot exists. `markWardDone` creates the `wardDuty` row server-side |
| 6 | **CHG-0011** | The app must not write `wardDuty`. The server writes it through `markWardDone`. Delete any direct write | `grep -rn 'wardDuty' lib/` shows reads only, no writes |
| 7 | **CHG-0002** | Read `drivers.phoneMasked`. Show the mask on the confirm card. Never read `drivers.phone` | `grep -rn "drivers.*phone\b\|\.phone\b" lib/core/repositories/firestore/firestore_drivers_repository.dart` shows no raw phone read |
| 8 | **CHG-0010** | Widen the complaint status type to the seven contract values | The type matches `enums.json` `$defs/complaint.status` |
| 9 | **CHG-0005** | Write the trail to `trips/{id}/trail/{n}`, chunks of 1000. Stop writing `trips.gpsTrail` | No write to `gpsTrail` remains |
| 10 | **CHG-0012** | The app must not read `complaints.phone`, `complaints.assignedPhone` or `complaints.escalatedToPhone`. They no longer exist | `grep -rn 'assignedPhone\|escalatedToPhone' lib/` gives zero hits |
| 11 | **CHG-0017** | Call `flagMockLocation({ tripId })` where the tracking engine latches the mock flag. Do not write `trips.mockLocationDetected` directly. The strict rules deny every client trip write, so the server sets the latch | No direct `mockLocationDetected` write remains. The call is `httpsCallable('flagMockLocation')`. The banner stays local and works offline |
| 12 | **CHG-0018** | Write `notices/{noticeId}/receipts/{driverCode}` with `readAt` when a notice is opened, and read it back to drive the unread dot. The doc id is the `driverId` claim. Do not add a receipt array to the notice document | The unread dot survives a restart. The receipt write is the only notice write. The session-local set stays as the offline fallback |
| 13 | **CHG-0019** | Switch Pending Reports to `.orderBy('createdAt', descending: true).limit(200)` **only after** the platform has deployed the new index. Keep the ascending query until then | The query is bounded and descending. No Dart-side sort of the fetched window remains |

### 4.3 The reason codes the app must handle

**Read `.contract/vendor/02-contracts/errors.json`.** Map each code to a localized string. **The app owns the words.**

| The server sends | The app shows |
|---|---|
| `vanHeldByAnotherDriver` | `identityShiftConflictOtherDriver` |
| `vanAlreadyClaimed` | `identityShiftConflictClaimed` |
| `staleMarker` | `identityShiftConflictStaleMarker` |
| `notFound` | A "that driver code is not registered" message |
| `rateLimited` | A "too many attempts, wait" message |
| `notAuthorised` | A "sign in again" message |
| `invalidState` | A "that shift is already closed" message |

**Never match on English text.** Never show a raw code to the driver.

### 4.4 The scope rules, in code

| The write | The scope comes from |
|---|---|
| `vans/{vanId}` telemetry | The `vanId` claim. **Never from a form field** |
| `trips/{tripId}` | **Reads only. The server writes the trip.** `startShift`, `endShift`, `markWardDone` and `flagMockLocation` are the only writers |
| `trips/{tripId}/trail/{n}` | The `vanId` claim |
| `complaints/{id}` two fields | The trip scope. The `wardIds` snapshot on the trip |
| `notices/{id}/receipts/{driverCode}` | The `driverId` claim |

**The route id comes from the ward doc, never from the client.** The `wardIds` come from the live staff or driver doc, never from a parameter.

### 4.5 Update `.contract/adopted.json`

**One entry per change, with a checklist taken from the manifest's `migration.steps`, filtered to the steps this app owns.**

```json
{
  "contractVersion": "2.2.0",
  "extensionVersion": "1",
  "coreChanges": {
    "CHG-0006": {
      "status": "in_progress",
      "urgency": "before_release",
      "progress": 0,
      "checklist": [
        { "task": "Delete the functions/ folder, keeping the cloud_functions dependency", "done": false },
        { "task": "Delete functions/.env from the repo", "done": false }
      ],
      "verifiedBy": "08-tools/check-adoption.ts"
    }
  }
}
```

**Progress is `done items / total items`, computed, never estimated.**

**The status and the version pin are two different acts.** Set `adopted` only after every item is done. Move the pin in the next step.

### 4.6 Bump the version pin

```bash
node ../platform/08-tools/bump-contract.ts . --contract-version=2.2.0
```

**The target is the manifest entry's `contractVersion.to`.** Read it out of `../platform/06-changes/manifest.json`. Never one you remember.

**The pin moves after the work, never before it.** A pin that claims an adoption the code has not made makes the platform's matrix report the app as done while it is still on the old contract.

### 4.7 The gate, then the PR

```bash
node ../platform/08-tools/check-adoption.ts .
# expected: no S0/S1 change reported behind for driverapp
```

Open the PR. CI re-runs the gate.

## 5. Do NOT

| Do NOT | Why |
|---|---|
| Do not keep a fallback to anonymous sign-in | A silent fallback hides a broken auth path for a month. If the bind fails, show the reason code |
| Do not send the badge code on any write after sign-in | It is printed on the van. It is not a credential |
| Do not keep `functions/` around "just in case" | Two backends drift. They already had drifted |
| Do not change the app's screens or its wording | This brief is the data path. The UI is a separate task |
| Do not edit the platform repo to make the app pass | The platform does not depend on an app |
| Do not treat a passing `flutter analyze` as adoption | The checklist and the gate are the record |
| Do not deploy | The order of the deploys is the migration. A human does it |
| Do not implement a field to make the app work | It is a contract request. The contract wins on shape |

## 6. Self-verification

**Every line must pass before you report done.**

```bash
# 1. Static check
flutter analyze
# expected: No issues found!

# 2. Tests
flutter test
# expected: All tests passed!

# 3. The adoption gate
node ../platform/08-tools/check-adoption.ts .
# expected: no failing line for driverapp

# 4. The conflict scanner
node ../platform/08-tools/check-conflicts.ts --app driverapp
# expected: exit 0 and "no conflicts: driverapp agrees with the contract".
# The --app flag makes the exit code reflect driverapp alone. Without it the
# tool scans all three apps and fails on userapp's conflicts too.

# 5. The deleted backend
grep -rn 'verifyDriverPin\|setDriverPin\|vanSecrets\|DEMO_SEED_BYPASS' lib/ scripts/ pubspec.yaml
# expected: zero hits
```

**Verify the adopted file parses and its numbers add up.**

```bash
python3 - <<'PY'
import json
a=json.load(open(".contract/adopted.json"))
for cid,c in a["coreChanges"].items():
    items=c.get("checklist",[])
    done=sum(1 for i in items if i.get("done"))
    print(cid, c["status"], f"{done}/{len(items)}")
    if c["status"]=="adopted":
        assert done==len(items) and items, "adopted with open items"
    if c["status"]=="in_progress":
        assert items, "in_progress with no checklist"
print("adopted.json ok")
PY
```

**Verify the vendored contract is intact.**

```bash
python3 - <<'PY'
import json, hashlib, pathlib
root = pathlib.Path(".contract")
fp = json.loads((root / "fingerprint.json").read_text())
bad = [rel for rel, want in fp["files"].items()
       if not (root / "vendor" / rel).exists()
       or "sha256:" + hashlib.sha256((root / "vendor" / rel).read_bytes()).hexdigest() != want]
print(len(fp["files"]), "files,", len(bad), "mismatched")
assert not bad, bad[:5]
PY
```

## 7. Report format

**End your message with exactly this block.**

```
CONTRACT VERSION: <version>
CONTRACT DRIFT: none | <field: old -> new>
FILES READ: <paths>
FILES CHANGED: <paths>
VERIFICATION: analyze <pass/fail> | test <pass/fail> | adoption <pass/fail> | conflicts <pass/fail>
CONTRACT CHANGE NEEDED: none | <proposed CHG id + one line>
OPEN QUESTION: <one line, or none>
```

**`CONTRACT DRIFT`** names any place the app's code still uses an old field name or value after this run. **`CONTRACT CHANGE NEEDED`** is for the case where the contract, not your code, is wrong.

---

## The one thing the office must still decide

**Nothing in this brief is blocked on a decision.** The driver app's PRD is correct, its stack is settled, and every change above has a written answer.

**The one thing you may need to raise:** if the app's telemetry write needs a field that is not in `van.schema.json`, that is a contract request, not a field you add. Put it in `CONTRACT CHANGE NEEDED`.
