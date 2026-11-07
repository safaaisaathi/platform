---
id: prompt-userapp
title: User App Harness Brief
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

# User App Harness Brief

**You are the harness for `safaaisaathi/userapp`.** React 18, TypeScript, Vite, a PWA. The app lives in `apps/citizen_app/`. The repo is at `../userapp`, the platform repo at `../platform`.

**Your job: take the citizen app from "it writes directly to Firestore anonymously and ships its own copy of the backend" to "it runs on the shared contract with claim-scoped writes and no PII leak".**

**Read this whole brief before you touch a file.**

---

## 0. The state of the app, in facts

**These came from reading the code. Verify them, do not assume them.**

| Fact | Where |
|---|---|
| The app signs in **anonymously**. It never calls `signInWithCustomToken` | `apps/citizen_app/src/services/firebaseService.ts` |
| The app's project id is **hardcoded** to `safai-saathi-panchmahal`, with a fallback in the same expression | `apps/citizen_app/src/services/firebaseService.ts:23` |
| The app has its **own copy of the backend**, `backend/functions/src/index.ts`, 612 lines, 13 exported functions | `backend/` |
| The app has its **own copy of the rules**, `backend/firestore.rules`, already drifted | `backend/` |
| The app **writes `wardDuty` directly**. `syncWardDutyToCloud` lets a citizen mark any ward's duty as over | `apps/citizen_app/src/services/firebaseService.ts:211` |
| The citizen's own `checkWardDutyOver` then reports it back to the citizen | `apps/citizen_app/src/services/firebaseService.ts:182` |
| The `Complaint` type has `phone`, `assignedPhone` and `escalatedToPhone`, the **raw** phone | `apps/citizen_app/src/types/index.ts` |
| `ComplaintStatus` has the **original four** statuses, but the code already writes the new ones | `apps/citizen_app/src/types/index.ts` |
| `collectionFeedback` is written with a field the contract does not have, `serverReceivedAt` | `apps/citizen_app/src/services/firebaseService.ts:148` |
| A committed build artifact, `safai-saathi-web-app.zip`, 335 KB, contains a copy of itself. A second copy is in `apps/citizen_app/public/` | repo root and `apps/citizen_app/public/` |
| The PRD is at the repo root as `PRD-1-user-app (1).md`. The platform points at `docs/PRD-1-user-app.md` | repo root |
| The app has **no `.contract/vendor/`**. It has `.contract/extensions/userapp.json` and `.contract/usage.json` | `.contract/` |
| `check-conflicts.ts` reports **23 conflicts, worst P0** | Platform tooling |

**The app is not broken. It is unwired, and one of its writes is a hole.**

---

## 1. Authority order

1. The contract (`02-contracts/`) wins over every PRD and over this brief. If your app's code disagrees with the schema, your app's code is wrong.
2. **Your app's own `.contract/vendor/` is the contract, once you sync it.** Read schemas from `.contract/vendor/02-contracts/collections/<x>.schema.json`, never from `../platform/02-contracts/`.
3. `../platform/06-changes/manifest.json` is the machine list of what changed. The `CHG-*.md` file explains why. Read both.
4. **Your app's `.contract/extensions/userapp.json` is yours.** The platform owner created it and registered its hash. **Do not edit it.** If it must change, bump `extensionVersion` and ask the platform owner to re-register the hash.
5. Your app's `.contract/adopted.json` is the truth about YOUR adoption. `../platform/06-changes/adoption.json` is a report of it.
6. `../platform/03-rules/` wins over anything that claims who may read or write.
7. `../platform/02-contracts/features/citizen-complaint.json` and `arrival-notification.json` say what is still missing in your app. They never override the schema.

## 2. Hard constraints

| # | Constraint |
|---|---|
| 1 | NEVER implement a field name that is not in `.contract/vendor/02-contracts/`, unless it is in your own extension file |
| 2 | NEVER invent a callable, a claim, a reason code, a topic or an enum value |
| 3 | NEVER send the `deviceId` or the `wardId` as an authorization scope to a write. The `wardId` is an input to the minting callable, not a scope |
| 4 | **NEVER write a raw phone number into a document another app can read.** The raw phone goes to `complaintPhones/{complaintId}` |
| 5 | **NEVER write to `wardDuty`.** The server writes it |
| 6 | NEVER send an English error message that the server should send. The server sends a reason code. The app owns the words |
| 7 | NEVER keep a copy of the backend or the rules in this repo |
| 8 | NEVER commit the `.zip` build artifact. Delete it |
| 9 | NEVER deploy. Deployment is a human action, and the order matters |
| 10 | NEVER mark a checklist item `done` without evidence. Evidence is a merged PR number |
| 11 | NEVER edit the platform repo from this repo |
| 12 | **Do not change the app's UI, its design, or its bilingual copy structure.** This brief is about the data path |
| 13 | When the platform is what stops you, do not work around it. Open an issue with `gh issue create --repo safaaisaathi/platform --template blocked-on-platform.md`, then read `../platform/07-guides/blocked-on-platform.md`. You may open an issue there, never a commit. The platform decides and writes the resolution, and you do not close the issue before that comment exists |

## 3. Read budget

| Your task | Read exactly these | Do not read |
|---|---|---|
| Sync the contract | This brief, section 4.1 | The platform's schemas |
| Find what applies to you | `../platform/06-changes/manifest.json`, your app's block in `../platform/06-changes/adoption.json` | The `CHG-*.md` files for other apps' changes |
| Understand one change | Its `../platform/06-changes/CHG-<nnn>-<slug>.md` file | `../platform/09-reference/` |
| Get a field shape | The one schema in `.contract/vendor/02-contracts/collections/` | The other schemas |
| Get a callable's contract | The one entry in `.contract/vendor/02-contracts/callables.json` | The whole file |
| Know your app-only fields | `.contract/extensions/userapp.json` | The core schemas |
| Know what is missing | `../platform/02-contracts/features/citizen-complaint.json`, `arrival-notification.json` | The feature entries for the other apps' journeys |

**The read budget is not a speed trick.** One enum change needs none of `09-reference/`.

## 4. Procedure

### 4.1 Sync the pinned contract

```bash
node ../platform/08-tools/sync-contract.ts .
# expected: contract synced into .contract/vendor
```

**Your app has no vendored copy yet. This creates it.**

**It removes the previous copy first.** Never hand-edit `.contract/vendor/`.

**After the sync, check the extension is still registered.** The platform's `02-contracts/extensions/registry.json` holds the sha256 of your extension file. If your sync pulled a different extension, your `extensionVersion` is behind.

### 4.2 The checklist, in order

**Work these in this order.** The order is the migration.

| # | Change | What to do | The acceptance check |
|---|---|---|---|
| 1 | **CHG-0009** | Delete `backend/functions/`, `backend/firestore.rules` and `backend/seed/`. Delete `safai-saathi-web-app.zip` from the repo root and from `apps/citizen_app/public/`. Move the seed script into a tool, not the runtime path | `grep -rn 'onCall\|onWrite\|onSchedule' . --include='*.ts' --include='*.js'` gives zero hits outside `node_modules`. No `.zip` is tracked |
| 2 | **CHG-0008** | Delete the hardcoded `safai-saathi-panchmahal` fallback. The project id comes from `import.meta.env.VITE_FIREBASE_PROJECT_ID` only, and the app **fails loudly** when it is missing | `grep -rn 'safai-saathi-panchmahal' apps/` gives zero hits |
| 3 | **CHG-0003** | Call `bootstrapUserSession({ deviceId, wardId })` at launch, then `signInWithCustomToken`. The token carries `deviceId` and `routeId`. **No silent fallback to anonymous** | The session's claims contain `deviceId` and `routeId`. A failed call shows the localized reason code |
| 4 | **CHG-0011** | **Delete `syncWardDutyToCloud`.** Replace `checkWardDutyOver` with a call to `getWardDutyStatus({ wardId, date? })` | `grep -rn 'syncWardDutyToCloud' apps/` gives zero hits. `grep -rn "doc(this.db, 'wardDuty'" apps/` gives zero hits |
| 5 | **CHG-0012** | Delete `phone`, `assignedPhone` and `escalatedToPhone` from the `Complaint` type. Write the **raw** phone to `complaintPhones/{complaintId}`, and the **masked** phone to `complaints.phoneMasked` | `grep -rn 'assignedPhone\|escalatedToPhone' apps/` gives zero hits. The complaint create payload has `phoneMasked` and no `phone` |
| 6 | **CHG-0013** | Call `citizenVerifyResolution` and `reopenComplaint` from the complaint detail screen. Delete the direct complaint update | `grep -rn "updateDoc(this.db, 'complaints'\|updateDoc(doc(this.db, 'complaints'" apps/` gives zero hits |
| 7 | **CHG-0010** | Widen `ComplaintStatus` to the seven contract values. Add the four new category labels, `dead_animal`, `public_toilet`, `construction_debris`, `hazardous_waste`, to the localization file. The app already has a `categoryCustomTitle` field for a custom label | The type matches `enums.json` `$defs/complaint.status`. The localization file has the four new labels in both languages |
| 8 | **EXT-0002** | The `collectionFeedback` collection now has five core fields. Your extension owns `id`, `reason`, `note`, `timestamp` and `syncStatus`. **Do not edit the extension file.** Delete the `serverReceivedAt` field the contract does not have | `grep -rn 'serverReceivedAt' apps/` gives zero hits. The extension file's sha256 still matches the platform registry |
| 9 | **CHG-0007** | Nothing to write. The arrival radius is a server-side constant. The alert now fires earlier | The app does not hardcode a radius |
| 10 | **CHG-0015** | Move `PRD-1-user-app (1).md` to `docs/PRD-1-user-app.md`. The filename with a space and a `(1)` is a download artefact | `test -f docs/PRD-1-user-app.md` passes. The root file is gone |

### 4.3 The reason codes the app must handle

**Read `.contract/vendor/02-contracts/errors.json`.** Map each code to a localized string. **The app owns the words.**

| The server sends | The app shows |
|---|---|
| `notFound` | "we could not find that" |
| `notAuthorised` | "sign in again" |
| `invalidState` | "that request does not fit the complaint's state" |
| `invalidInput` | "please check the form" |
| `rateLimited` | "too many attempts, wait a moment" |
| `internal` | "something went wrong on our side" |

**Never match on English text. Never show a raw code to a citizen.**

### 4.4 The scope rules, in code

| The operation | The scope comes from |
|---|---|
| Creating a complaint | The `deviceId` claim. The payload carries the citizen's own `deviceId` |
| Reading own complaints | The `deviceId` claim. **Never a `where('deviceId', ...)` from a parameter** |
| Writing `complaintPhones/{id}` | The `deviceId` claim. **CREATE only.** The rule denies update and delete |
| Reading `vans` for the ETA | The `routeId` claim, which came from the ward doc the server read |
| Reading `trips` for "collected today" | The `routeId` claim |
| Writing `collectionFeedback` | The `deviceId` claim |

**The route id comes from the ward doc, never from the client.** The `wardIds` come from the route doc, never from a parameter.

### 4.5 Update `.contract/adopted.json`

**One entry per change, with a checklist taken from the manifest's `migration.steps`, filtered to the steps this app owns.**

```json
{
  "contractVersion": "2.3.0",
  "extensionVersion": "1",
  "coreChanges": {
    "CHG-0011": {
      "status": "in_progress",
      "urgency": "before_release",
      "progress": 0,
      "checklist": [
        { "task": "Delete syncWardDutyToCloud from firebaseService.ts", "done": false },
        { "task": "Call getWardDutyStatus instead of reading the document", "done": false }
      ],
      "verifiedBy": "08-tools/check-adoption.ts"
    }
  }
}
```

**Progress is `done items / total items`, computed, never estimated.**

**The status and the version pin are two different acts.** Set `adopted` only after every item is done. Move the pin in the next step.

**EXT-0002 goes in the same file**, under `extensionChanges` or as a `coreChanges` entry, whichever the platform's `check-adoption.ts` expects. **Run the gate and let it tell you.**

### 4.6 Bump the version pin

```bash
node ../platform/08-tools/bump-contract.ts . --contract-version=2.3.0
```

**The target is the manifest entry's `contractVersion.to`.** Read it out of `../platform/06-changes/manifest.json`. Never one you remember.

**The pin moves after the work, never before it.** A pin that claims an adoption the code has not made makes the platform's matrix report the app as done while it is still on the old contract.

**The extension version moves separately.** `--extension-version=2` moves the extension pin without touching the core pin. **You do not need it. Your extension file did not change.**

### 4.7 The gate, then the PR

```bash
node ../platform/08-tools/check-adoption.ts .
# expected: no S0/S1 change reported behind for userapp
```

Open the PR. CI re-runs the gate.

## 5. Do NOT

| Do NOT | Why |
|---|---|
| Do not keep a fallback to anonymous sign-in | A silent fallback hides a broken auth path for a month |
| Do not keep the hardcoded project id as a fallback | It is a silent split. The env var missing must fail loudly |
| Do not keep `syncWardDutyToCloud` "for offline use" | A citizen may not decide a ward's duty is over. Use `getWardDutyStatus` and cache the answer locally |
| Do not put the raw phone back on the complaint for any reason | A Firestore `get` returns the whole document and rules cannot redact a field. The collection split is the only fix |
| Do not edit `.contract/extensions/userapp.json` | The platform enforces it by hash. Bump the version and ask the platform owner to re-register |
| Do not delete `backend/seed/` without keeping the seed data somewhere | The seeds are useful. They belong in a script, not in the runtime path |
| Do not change the app's screens or its wording | This brief is the data path. The UI is a separate task |
| Do not edit the platform repo to make the app pass | The platform does not depend on an app |
| Do not deploy | The order of the deploys is the migration. A human does it |

## 6. Self-verification

**Every line must pass before you report done.**

```bash
# 1. Static check
npm run lint 2>/dev/null || npx tsc --noEmit
# expected: no errors

# 2. Tests, if the repo has them
npm test

# 3. The adoption gate
node ../platform/08-tools/check-adoption.ts .
# expected: no failing line for userapp

# 4. The conflict scanner
node ../platform/08-tools/check-conflicts.ts --app userapp
# expected: exit 0 and "no conflicts: userapp agrees with the contract".
# The --app flag makes the exit code reflect userapp alone. Without it the
# tool scans all three apps and fails on driverapp's conflicts too.

# 5. The deleted backend and the deleted write
grep -rn 'onCall\|onWrite\|onSchedule' . --include='*.ts' --include='*.js' | grep -v node_modules
grep -rn 'syncWardDutyToCloud\|safai-saathi-panchmahal\|assignedPhone\|escalatedToPhone\|serverReceivedAt' apps/
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
EXTENSION VERSION: <version>
FILES READ: <paths>
FILES CHANGED: <paths>
VERIFICATION: lint <pass/fail> | test <pass/fail> | adoption <pass/fail> | conflicts <pass/fail>
CONTRACT CHANGE NEEDED: none | <proposed CHG id + one line>
OPEN QUESTION: <one line, or none>
```

**`CONTRACT DRIFT`** names any place the app's code still uses an old field name or value after this run. **`CONTRACT CHANGE NEEDED`** is for the case where the contract, not your code, is wrong.

---

## The one thing the office must still decide

**CHG-0016 is not yours to settle.** The office decides whether the citizen app stays React or is rewritten in Flutter.

**What that means for you:** do the work above against the React code that exists. The contract does not care which language the app is written in, so **none of the checklist above changes if the office picks Flutter**. If it picks Flutter, the React code becomes the reference for the behaviour and the shape, not the implementation.

**Put the decision in your `OPEN QUESTION` line** so the office sees it from the code, not just from a document.
