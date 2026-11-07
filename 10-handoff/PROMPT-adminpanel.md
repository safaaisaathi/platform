---
id: prompt-adminpanel
title: Admin Panel Harness Brief
status: active
owner: platform-owner
updated: 2026-11-03
contractVersion: "2.3.0"
audience: harness
see_also:
  - ./README.md
  - ../07-guides/wiring-an-app-to-the-contract.md
  - ../07-guides/adopting-a-change.md
  - ../03-rules/README.md
  - ../06-changes/manifest.json
---

# Admin Panel Harness Brief

**You are the harness for `safaaisaathi/adminpanel`.** React 18, TypeScript, Vite. **Not Next.js**, despite what the README says. Web only. The repo is at `../adminpanel`, the platform repo at `../platform`.

**Your job: take the office panel from "a localStorage demo with 25 screens" to "a real tool that reads and writes the shared contract".**

**This is the biggest job in the set.** Read this whole brief before you touch a file.

---

## 0. The state of the app, in facts

**These came from reading the code. Verify them, do not assume them.**

| Fact | Where |
|---|---|
| The panel has **zero Firebase calls**. `src/services/firebaseConfig.ts` initialises `db`, `auth` and `storage`, and **nothing uses them** | `src/services/firebaseConfig.ts` |
| The data layer is `src/services/dataService.ts`. It reads and writes **localStorage** under the prefix `safai_v3_` | `src/services/dataService.ts` |
| The seed data is `src/services/seedData.ts` | `src/services/seedData.ts` |
| There are **25 screens** under `src/screens/` | `src/screens/` |
| **Two lineages of several screens exist.** `A1_Login` and `A01_Login`, `A2_Overview` and `A02_DdoOverview`, `A3_LiveMap` and `A15_LiveMap`, `A4_Complaints` and `A17_Complaints`, `A5_Wards` and `A05_Wards`, `A7_Notices` and `A21_Notices`, `A8_Reports` and `A23_Reports`, `A9_Staff` and `A03_Staff` | `src/screens/` |
| `App.tsx` routes the **second** lineage. The first lineage is dead code | `src/App.tsx` |
| The panel asks the operator to **paste the Firebase config into the browser**, saved in localStorage under `safai_firebase_credentials` | `src/services/firebaseConfig.ts` |
| The panel has **no project id** in code. It reads six `VITE_FIREBASE_*` variables and falls back to empty strings | `src/services/firebaseConfig.ts` |
| `ComplaintStatus` has the **original four** values. `ComplaintCategory` has the **original four** | `src/types/index.ts:6-7` |
| `NoticeTargetType` is `'van' \| 'ward' \| 'all' \| 'citizens'`. The contract has **no** `'citizens'` | `src/types/index.ts:9` |
| The `Complaint` interface has **no** `phone`, `assignedPhone` or `escalatedToPhone`. It was already clean | `src/types/index.ts:204` |
| A committed **GitHub Pages build** sits in `docs/`, 12 files of built HTML and hashed assets | `docs/` |
| The panel has **no PRD at all**. The platform points at `docs/PRD-3-admin-panel.md` and that file does not exist | `../platform/01-prds/PRD-3-admin-panel.md` |
| `check-conflicts.ts` reports **zero conflicts for adminpanel**. That is not a compliment. It is because the scanner found no Firestore calls at all | Platform tooling |

**The panel works. It is showing you the browser's own memory.**

---

## 1. Authority order

1. The contract (`02-contracts/`) wins over every PRD and over this brief. If the panel's code disagrees with the schema, the panel's code is wrong.
2. **Your app's own `.contract/vendor/` is the contract, once you sync it.** Read schemas from `.contract/vendor/02-contracts/collections/<x>.schema.json`, never from `../platform/02-contracts/`.
3. `../platform/06-changes/manifest.json` is the machine list of what changed. The `CHG-*.md` file explains why. Read both.
4. Your app's `.contract/adopted.json` is the truth about YOUR adoption. `../platform/06-changes/adoption.json` is a report of it.
5. `../platform/03-rules/` wins over anything that claims who may read or write.
6. `../platform/02-contracts/features/admin-dispatch.json` says what is still missing in the panel. It never overrides the schema.

## 2. Hard constraints

| # | Constraint |
|---|---|
| 1 | NEVER implement a field name that is not in `.contract/vendor/02-contracts/` |
| 2 | NEVER invent a callable, a claim, a reason code, a topic or an enum value |
| 3 | **NEVER write to Firestore directly.** Every write goes through a callable. The rules deny admin writes |
| 4 | **NEVER read a raw phone except from `complaintPhones` and `staffPhones`, and only for district staff** |
| 5 | NEVER send an English error message that the server should send. The server sends a reason code. The panel owns the words |
| 6 | NEVER send the staff member's id or name as a parameter. The server reads them from the token and the live staff document |
| 7 | NEVER keep localStorage as the source of truth. It may hold a cache. It may not hold the record |
| 8 | NEVER deploy. Deployment is a human action, and the order matters |
| 9 | NEVER mark a checklist item `done` without evidence. Evidence is a merged PR number |
| 10 | NEVER edit the platform repo from this repo |
| 11 | **Do not redesign the screens.** The panel's layout, its look and its 25 screens stay. This brief replaces the data layer under them |
| 12 | **Do not delete a screen until the live one replaces it.** Delete the dead lineage last, and only after the routed one works |
| 13 | When the platform is what stops you, do not work around it. Open an issue with `gh issue create --repo safaaisaathi/platform --template blocked-on-platform.md`, then read `../platform/07-guides/blocked-on-platform.md`. You may open an issue there, never a commit. The platform decides and writes the resolution, and you do not close the issue before that comment exists |

## 3. Read budget

| Your task | Read exactly these | Do not read |
|---|---|---|
| Sync the contract | This brief, section 4.1 | The platform's schemas |
| Find what applies to you | `../platform/06-changes/manifest.json`, your app's block in `../platform/06-changes/adoption.json` | The `CHG-*.md` files for other apps' changes |
| Understand one change | Its `../platform/06-changes/CHG-<nnn>-<slug>.md` file | `../platform/09-reference/` |
| Get a field shape | The one schema in `.contract/vendor/02-contracts/collections/` | The other schemas |
| Get a callable's contract | The one entry in `.contract/vendor/02-contracts/callables.json` | The whole file |
| Know what is missing | `../platform/02-contracts/features/admin-dispatch.json` | The feature entries for the other apps' journeys |

**The read budget is not a speed trick.** One enum change needs none of `09-reference/`.

## 4. Procedure

### 4.1 Sync the pinned contract

```bash
node ../platform/08-tools/sync-contract.ts .
# expected: contract synced into .contract/vendor
```

**Your app has no vendored copy yet. This creates it.**

**It removes the previous copy first.** Never hand-edit `.contract/vendor/`.

### 4.2 The checklist, in order

**Work these in this order.** The order is the migration.

| # | Change | What to do | The acceptance check |
|---|---|---|---|
| 1 | **CHG-0009** | Delete the committed Pages build in `docs/`. It is build output, not source. Add it to `.gitignore` | `git ls-files docs/` gives zero files |
| 2 | **CHG-0015** | Write `docs/PRD-3-admin-panel.md`. The platform points at it and it does not exist. Write what the panel does today, in the shape the other two PRDs use | `test -f docs/PRD-3-admin-panel.md` passes |
| 3 | **CHG-0008** | Point the runtime config at `safaaisaathi-63a87`. Read the six `VITE_FIREBASE_*` variables from the environment. **Remove the "paste the config into the browser" flow.** The web API key is not a secret and belongs in the build | `grep -rn 'safai_firebase_credentials' src/` gives zero hits, or the path is only a migration helper with a clear comment |
| 4 | **CHG-0003** | Call `mintStaffToken({ staffId })` at sign-in, then `signInWithCustomToken`. The token carries `staffId`, `role` and `wardIds`. **Scope every query by the `wardIds` claim** | The session's claims contain the three. A query for complaints is scoped to the claim's wards |
| 5 | **CHG-0004 + CHG-0013** | Replace `adminResolveComplaint` with `setComplaintStatus({ complaintId, status, note?, resolvedPhotoUrl? })`. **Stop sending `workerId` and `workerName`.** The server reads the staff member from the token | `grep -rn 'workerId\|workerName\|adminResolveComplaint' src/` gives zero hits |
| 6 | **CHG-0004** | Route the other writes through `publishNotice`, `upsertDriver`, `upsertStaff` and `setVanDepot`. **Zero direct writes** | `grep -rn 'setDoc\|updateDoc\|addDoc\|deleteDoc' src/` gives zero hits outside the repository layer, and the repository layer has no write calls |
| 7 | **CHG-0011** | Call `markWardDutyCompleted({ wardId, date? })`. The server writes the duty board | No direct `wardDuty` write |
| 8 | **CHG-0010** | Widen `ComplaintStatus` to seven values and `ComplaintCategory` to eight. **Map the local notice target `'citizens'` onto the contract's `'all'`. Do not add a new enum value** | The types match `enums.json`. The `NoticeTargetType` in the panel has three values, not four |
| 9 | **CHG-0002** | Read `drivers.phoneMasked` for display. Read the raw phone from `staffPhones/{code}`, and only for district staff | `grep -rn 'drivers.*\.phone\b' src/` shows no raw phone read |
| 10 | **CHG-0012** | Read the raw complainant phone from `complaintPhones/{complaintId}`, and only for district staff. An inspector sees `complaints.phoneMasked` | The raw phone read is behind a district-role check |
| 11 | **CHG-0014** | **The big one.** Replace `src/services/dataService.ts` with a Firestore repository. Move `src/services/seedData.ts` out of the runtime path into a seed script. Every screen reads through the repository | The panel loads live data after a sign-in. The localStorage prefix `safai_v3_` holds no record of truth |
| 12 | **CHG-0014** | Delete the dead screen lineage. `A1_Login`, `A2_Overview`, `A3_LiveMap`, `A4_Complaints`, `A5_Wards`, `A6_VansRoutes`, `A7_Notices`, `A8_Reports`, `A9_Staff` are not routed by `App.tsx` | `grep -rn "from './screens/A1_\|from './screens/A2_\|from './screens/A3_\|from './screens/A4_\|from './screens/A5_\|from './screens/A6_\|from './screens/A7_\|from './screens/A8_\|from './screens/A9_" src/` gives zero hits |
| 13 | **CHG-0020** | `upsertDriver` now writes `createdAt`, `createdBy`, `updatedAt` and `updatedBy`. Show them on the driver screen if you want; do not send them in the input | The fields are server-set. A client-sent value is ignored |
| 14 | **CHG-0022** | Subscribe to `staff_{staffId}` after the staff token is minted, and route `data.type = mock_location_alert` to the trip or van screen. The payload carries `tripId` and `vanId` | A mock-location latch reaches the ward inspector while the trip is open |

### 4.3 The reason codes the panel must handle

**Read `.contract/vendor/02-contracts/errors.json`.** Map each code to a localized string. **The panel owns the words.**

| The server sends | The panel shows |
|---|---|
| `notFound` | "that record does not exist" |
| `notAuthorised` | "your account is not active" |
| `invalidInput` | "please check the form" |
| `invalidState` | "that action does not fit the record's current state" |
| `rateLimited` | "too many attempts, wait a moment" |
| `internal` | "something went wrong on our side" |

**Never match on English text. Never show a raw code to an operator.**

### 4.4 The scope rules, in code

| The operation | The scope comes from |
|---|---|
| Reading complaints, vans, trips, wards, routes | The `wardIds` claim. An inspector sees their wards. A DDO sees the district |
| Reading `complaints` for the live map | The same `wardIds` claim |
| Reading a raw phone | The `role` claim, and only `ddo` or `tdo` |
| Every write | The callable, which re-reads the live `staff/{staffId}.active` |

**The panel must show when the scope was last refreshed.** The claims are minted at sign-in, so a scope change lands at the next sign-in, within an hour. One line on the panel: *"your scope was last refreshed at 2026-11-01 09:12"*. **Without it, a stale scope is invisible and the office blames the app.**

### 4.5 The repository layer

**The screens keep talking to one service. The service changes its guts, not its name.**

```
src/services/dataService.ts   -> the same public surface, backed by Firestore
src/services/firebaseConfig.ts -> reads the env, no paste-into-browser flow
src/services/seedData.ts      -> moves to scripts/seed.ts, not imported by the app
```

**Keep the public method names.** The screens call them. Renaming them means touching 25 screens for no reason.

**Reads become live queries scoped by the claim. Writes become callable calls.**

### 4.6 Update `.contract/adopted.json`

**One entry per change, with a checklist taken from the manifest's `migration.steps`, filtered to the steps this app owns.**

```json
{
  "contractVersion": "2.3.0",
  "extensionVersion": "0",
  "coreChanges": {
    "CHG-0014": {
      "status": "in_progress",
      "urgency": "before_release",
      "progress": 0,
      "checklist": [
        { "task": "Replace the localStorage data layer with a Firestore repository", "done": false },
        { "task": "Scope every query by the wardIds claim", "done": false },
        { "task": "Move seedData.ts out of the runtime path", "done": false }
      ],
      "verifiedBy": "08-tools/check-adoption.ts"
    }
  }
}
```

**Progress is `done items / total items`, computed, never estimated.**

**The status and the version pin are two different acts.** Set `adopted` only after every item is done. Move the pin in the next step.

### 4.7 Bump the version pin

```bash
node ../platform/08-tools/bump-contract.ts . --contract-version=2.3.0
```

**The target is the manifest entry's `contractVersion.to`.** Read it out of `../platform/06-changes/manifest.json`. Never one you remember.

**The pin moves after the work, never before it.**

### 4.8 The gate, then the PR

```bash
node ../platform/08-tools/check-adoption.ts .
# expected: no S0/S1 change reported behind for adminpanel
```

Open the PR. CI re-runs the gate.

## 5. Do NOT

| Do NOT | Why |
|---|---|
| Do not write to Firestore directly, even for one field | The rules deny admin writes. A direct write is a bug, and the office loses instant revocation |
| Do not keep `localStorage` as the source of truth | The panel would show two different truths. A cache is fine. A record is not |
| Do not keep the "paste the Firebase config into the browser" flow | The web API key is not a secret. The build owns it. The paste flow is how the panel ends up on the wrong project |
| Do not send `workerId` or `workerName` | A client parameter is forgeable. The server reads the staff member from the token |
| Do not add a `'citizens'` value to the contract's notice target | Map it onto `'all'`. A new enum value is a contract change |
| Do not redesign the screens while you replace the data layer | Two big changes at once means two kinds of bugs. The data layer first, the screens stay |
| Do not delete a screen until the live one replaces it | The dead lineage goes last |
| Do not edit the platform repo to make the panel pass | The platform does not depend on an app |
| Do not deploy | The order of the deploys is the migration. A human does it |

## 6. Self-verification

**Every line must pass before you report done.**

```bash
# 1. Static check
npx tsc --noEmit
# expected: no errors

# 2. Build
npm run build
# expected: the build succeeds

# 3. The adoption gate
node ../platform/08-tools/check-adoption.ts .
# expected: no failing line for adminpanel

# 4. The conflict scanner
node ../platform/08-tools/check-conflicts.ts --app adminpanel
# expected: exit 0 and "no conflicts: adminpanel agrees with the contract".
# The --app flag makes the exit code reflect adminpanel alone. Without it the
# tool scans all three apps and fails on the other two apps' conflicts too.

# 5. No direct writes, no dead screens
grep -rn 'setDoc\|updateDoc\|addDoc\|deleteDoc' src/
grep -rn 'workerId\|workerName\|adminResolveComplaint\|safai_v3_' src/
# expected: zero hits from both
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
FILES READ: <paths>
FILES CHANGED: <paths>
VERIFICATION: tsc <pass/fail> | build <pass/fail> | adoption <pass/fail> | conflicts <pass/fail>
CONTRACT CHANGE NEEDED: none | <proposed CHG id + one line>
OPEN QUESTION: <one line, or none>
```

**`CONTRACT DRIFT`** names any place the panel's code still uses an old field name or value after this run. **`CONTRACT CHANGE NEEDED`** is for the case where the contract, not your code, is wrong.

---

## The one thing the office must still decide

**CHG-0014 is the whole job.** The panel is a demo. It has never spoken to Firebase.

**That means the panel's release date is not a technical fact, it is an office fact.** How long the panel stays on seeded data is a decision about when the office can trust what it sees.

**Say so in your `OPEN QUESTION` line.** Give the office a number: how many screens are live, how many still read localStorage. A decision needs a count.
