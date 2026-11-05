---
id: wiring-an-app-to-the-contract
title: Wiring an App to the Shared Contract
status: active
owner: platform-owner
updated: 2026-11-02
contractVersion: "2.3.0"
audience: harness
see_also:
  - ./adopting-a-change.md
  - ./backend-split.md
  - ./firebase-getting-started.md
  - ../02-contracts/README.md
  - ../03-rules/README.md
  - ../06-changes/manifest.json
  - ../10-handoff/README.md
---

# Wiring an App to the Shared Contract

**You are an app repo harness (`driverapp`, `userapp` or `adminpanel`). Your app was built against its own copy of the backend, or against nothing at all. This guide takes it from there to running on the shared contract.**

**This guide runs in the APP repo.** The platform repo sits beside it. Set `PLATFORM=../platform` and adjust if your checkout differs.

**Read this before `./adopting-a-change.md`.** This guide is the first-time wiring. The other guide is what you do when a change lands later. If your app already has `.contract/vendor/` and a working custom-token sign-in, you want the other guide.

## 1. Authority order

1. The contract (`02-contracts/`) wins over every PRD and over every app repo. If your app's code disagrees with the schema, your app's code is wrong.
2. **Your app's own `.contract/vendor/` is the contract.** Read the schema from `.contract/vendor/02-contracts/collections/<x>.schema.json`, never from `$PLATFORM/02-contracts/`. The vendored copy plus `.contract/fingerprint.json` is what your app was built against. A sibling checkout can move under your feet.
3. `$PLATFORM/06-changes/manifest.json` is the machine list of what changed. The `CHG-*.md` file explains why. Read both.
4. Your app's `.contract/adopted.json` is the truth about YOUR adoption. `$PLATFORM/06-changes/adoption.json` is a report of it, not a source of truth.
5. `$PLATFORM/03-rules/` wins over anything that claims who may read or write.
6. `$PLATFORM/02-contracts/features/` says which app does what part of a cross-app journey. It tells you what is still missing. It never overrides the schema.

## 2. Hard constraints

| # | Constraint |
|---|---|
| 1 | NEVER implement a field name that is not in your app's vendored schema. `grep` against `.contract/vendor/02-contracts/` before you write code |
| 2 | NEVER invent a callable, a claim, a reason code, a topic or an enum value. If it is not in `02-contracts/`, it does not exist |
| 3 | NEVER write an English error message that the server should send. The server sends a reason code. Your app owns the words |
| 4 | NEVER send a client parameter that acts as an authorization scope. The scope comes from a claim |
| 5 | NEVER keep a copy of the backend in your app repo. One backend, in the platform repo |
| 6 | NEVER write a Firestore document directly where a callable exists. A callable re-reads the live authority |
| 7 | NEVER commit a Firebase service account key. A web config key is fine to commit. A service account key is not |
| 8 | NEVER mark a checklist item `done` without evidence. Evidence is a merged PR number |
| 9 | NEVER set a change to `adopted` while any checklist item is open. Partial adoption is `in_progress` |
| 10 | NEVER deploy. Deployment is a human action, and the order matters |
| 11 | NEVER edit the platform repo from an app repo. The platform does not depend on an app. An app depends on the platform |
| 12 | One app per run. Never wire two apps in the same pass |

## 3. Read budget

| Your task | Read exactly these | Do not read |
|---|---|---|
| Sync the pinned copy | This file, section 4.1 | The platform's schemas, the app has its own copy |
| Find what applies to you | `$PLATFORM/06-changes/manifest.json`, your app's block in `$PLATFORM/06-changes/adoption.json` | The `CHG-*.md` files for other apps' changes |
| Understand one change | Its `$PLATFORM/06-changes/CHG-<nnn>-<slug>.md` file | `$PLATFORM/09-reference/` |
| Get the exact field shape | The one schema in `.contract/vendor/02-contracts/collections/` | The other schemas |
| Know the callable's contract | The one entry in `.contract/vendor/02-contracts/callables.json` | The whole file, unless you are wiring every callable |
| Know what is still missing | `$PLATFORM/02-contracts/features/*.json`, your app's slices | The feature entries for journeys your app is not in |
| Add an app-only field | `.contract/vendor/02-contracts/extensions/README.md` | The core schemas |
| Run the gate | `$PLATFORM/08-tools/check-adoption.ts` | Nothing else |

**The read budget is not a speed trick.** The blueprint in `09-reference/` is thousands of lines. One enum change needs none of it.

## 4. Procedure

### 4.0 The loop

| Step | Do | Where |
|---|---|---|
| 1 | Sync the pinned contract into `.contract/vendor/` | App repo, `sync-contract.ts` |
| 2 | Point the app at the ONE Firebase project | App repo |
| 3 | Replace anonymous sign-in with a custom token | App repo |
| 4 | Move every privileged write to a callable | App repo |
| 5 | Delete the app's copy of the backend and the rules | App repo |
| 6 | Write the checklist into `.contract/adopted.json` | App repo |
| 7 | Run the gates, open the PR, report | App repo |

**Steps 1, 2, 3, 4 and 5 are in this guide.** Step 6 and 7 are in `./adopting-a-change.md` sections 4.4 to 4.8.

**The order is the order.** A custom token before the callable is deployed means the app cannot get a token. A callable before the client is ready means nobody calls it. The rules tighten last, and that step is not in your app repo at all.

### 4.1 Step 1: sync the pinned contract

```bash
node ../platform/08-tools/sync-contract.ts .
# expected: contract synced into <path>/.contract/vendor
```

**What it writes.** `.contract/vendor/02-contracts/`, `.contract/vendor/03-rules/`, `.contract/vendor/05-decisions/` and `.contract/fingerprint.json`. The fingerprint holds the sha256 of every copied file and the contract version.

**It removes the previous copy first.** A file deleted from the contract does not survive in your app. Never hand-edit the vendor folder. Delete it and re-sync.

**Check it.**

```bash
python3 - <<'PY'
import json, hashlib, pathlib
root = pathlib.Path(".contract")
fp = json.loads((root / "fingerprint.json").read_text())
bad = []
for rel, want in fp["files"].items():
    p = root / "vendor" / rel
    if not p.exists():
        bad.append(rel + " missing")
        continue
    got = "sha256:" + hashlib.sha256(p.read_bytes()).hexdigest()
    if got != want:
        bad.append(rel + " changed")
print(len(fp["files"]), "files,", len(bad), "mismatched")
for b in bad[:5]:
    print(" ", b)
PY
```

**One app at a time.** Each app syncs in its own pull request. A bulk sync across three repos is three pull requests, not one.

**If your app has no `.contract/` folder at all, create it by running the sync.** It creates the folder and the fingerprint.

### 4.2 Step 2: one Firebase project

**The project is `safaaisaathi-63a87`.** It is in `$PLATFORM/.firebaserc`. There is no second project.

| Stack | Where the config goes | How |
|---|---|---|
| Flutter | `lib/core/config/firebase_config.dart` or `firebase_options.dart` | The project id comes from the build, not from a hardcoded string |
| React + Vite | `.env` with `VITE_FIREBASE_*` | The project id is read from the environment. **There is no hardcoded fallback** |

**The rule that catches everyone.** A hardcoded project id fallback is a silent split. When the env var is missing, the app talks to the wrong project and every test passes.

```bash
# The check. Zero hits is the pass.
grep -rn "safai-saathi-panchmahal\|safaaisaathi-" src/ lib/ apps/ 2>/dev/null
```

**Never commit a service account key.** A web API key is not a secret. A service account key is. See `./firebase-access-and-keys.md`.

### 4.3 Step 3: the custom token

**Today every app signs in anonymously. Anonymous is not a scope.** The rules need claims, and claims come from a custom token minted by a callable.

**The shape is the same in all three apps.**

| Step | What | The claim that appears |
|---|---|---|
| 1 | Sign in anonymously | None |
| 2 | Call the app's minting callable with the app's own identifier | The token |
| 3 | `signInWithCustomToken(token)` | The claims are now on the session |
| 4 | Use the claims, never the identifier, as the scope | The scope is unforgeable |

**The three minting callables.**

| App | Callable | Input | Claims it mints |
|---|---|---|---|
| driverapp | `bindDeviceToVan` | `{ driverCode, installId }` | `vanId`, `driverId` |
| userapp | `bootstrapUserSession` | `{ deviceId, wardId }` | `deviceId`, `routeId` |
| adminpanel | `mintStaffToken` | `{ staffId }` | `staffId`, `role`, `wardIds` |

**The input is the app's own identifier. The scope comes back from the server.** The client never sends a `wardIds` array, a `vanId` or a `routeId` it chose.

**Check the callable's contract before you call it.** It is in `.contract/vendor/02-contracts/callables.json`, under `x-callables`. The `input` block is the request, the `output` block is the answer. The `lifecycle` field says whether it exists yet.

**Do not swallow the failure.** If the callable returns a reason code, map it to a localized string and show it. Do not fall back to anonymous sign-in. A silent fallback is how a broken auth path stays hidden for a month.

### 4.4 Step 4: privileged writes go through a callable

**The split is in one line.** *A write is a RULE when the claim is the authority, and a CALLABLE when a live document is the authority.*

| The write | The authority | The tool |
|---|---|---|
| The driver writes its own telemetry | The token's `vanId` claim | A direct Firestore write, scoped by the rule |
| The citizen files a complaint | The token's `deviceId` claim | A direct Firestore create, scoped by the rule |
| The office assigns a complaint | The live `staff/{id}.active` | `setComplaintStatus` |
| The office edits a driver | The live `staff/{id}.active` | `upsertDriver` |
| The office disables a staff member | The live `staff/{id}.active` | `upsertStaff` |
| The office sends a notice | The live `staff/{id}.active` | `publishNotice` |
| The office sets a depot | The live `staff/{id}.active` | `setVanDepot` |
| The server writes the duty board | The trip document | `markWardDone`, `markWardDutyCompleted` |

**A revoked staff member's token stays valid for up to an hour.** Only a callable, which re-reads the live staff document on every call, can lock them out immediately.

**The client-side staff id and staff name parameters are gone.** The server reads them from the token and from the live document. A parameter is forgeable, so a parameter is not an identity.

**The reason codes are the contract.** Read `.contract/vendor/02-contracts/errors.json`. Map each code to a localized string in your app. Never match on English text.

### 4.5 Step 5: delete the app's copy of the backend

**If your app repo contains a `backend/` folder, a `functions/` folder, a `firestore.rules` file or a committed build artifact, they go.**

| What | Why it goes |
|---|---|
| A second `functions/` source | Two backends drift. They already had drifted |
| A second `firestore.rules` | The rules have one owner, the platform owner |
| A committed `.zip` of the app | It contains a copy of itself. It is not source |
| A committed Pages build in `docs/` | Build output does not belong in git |

**Verify.**

```bash
# Zero hits outside the platform repo.
grep -rn "onCall\|onWrite\|onSchedule" . --include='*.ts' --include='*.js' --include='*.dart'
```

**Do not delete the app's own `AGENTS.md`, `docs/` guides or `README.md`.** Only the backend copies and the build artifacts.

### 4.6 Step 6: write the checklist

**In the app repo, edit `.contract/adopted.json`.** The checklist comes from the manifest entry's `migration.steps`, filtered to the steps your app owns. Progress is `done items / total items`, computed, never estimated.

**Full procedure in `./adopting-a-change.md` section 4.4.**

### 4.7 Step 7: the gates

```bash
node ../platform/08-tools/check-adoption.ts .
# expected: no S0/S1 change reported behind for your app
```

**Plus the app's own checks.**

| Stack | The checks |
|---|---|
| Flutter | `flutter analyze` then `flutter test` |
| React | `npm run lint`, `npx tsc --noEmit`, `npm test` |

**Then open the PR.** CI re-runs the gate from the platform tooling. The release of an app with an unadopted S1 stays blocked until the PR merges.

## 5. Do NOT

| Do NOT | Why |
|---|---|
| Do not start coding before reading the `CHG-*.md` file | The migration order is the content. Coding first is how rules get tightened before clients |
| Do not implement from the manifest alone | The manifest says what changed. Only the `CHG-*.md` file says why and what breaks |
| Do not send a client parameter as a scope | The client controls it. A claim is the only unforgeable scope |
| Do not fall back to anonymous sign-in when a callable fails | A silent fallback hides a broken auth path |
| Do not keep a hardcoded project id as a fallback | It is a silent split. The env var missing must fail loudly |
| Do not treat a passing build as adoption | The checklist and the gate are the record. A build proves nothing about scope |
| Do not edit the platform repo to make your app pass | The platform does not depend on an app. An app depends on the platform |
| Do not deploy | The order of the deploys is the migration. A human does it |
| Do not invent a field to make your app work | It is a contract request. The contract wins on shape |

## 6. Self-verification

**Every line must pass before you report done.**

```bash
# 1. The app's static check
flutter analyze    # or: npm run lint && npx tsc --noEmit

# 2. The app's tests
flutter test       # or: npm test

# 3. The adoption gate
node ../platform/08-tools/check-adoption.ts .
```

**Verify the app's adopted file parses and its numbers add up.**

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

**Verify the app's vendored contract is intact.**

```bash
python3 - <<'PY'
import json, hashlib, pathlib
root = pathlib.Path(".contract")
fp = json.loads((root / "fingerprint.json").read_text())
bad = [rel for rel, want in fp["files"].items()
       if not (root / "vendor" / rel).exists()
       or "sha256:" + hashlib.sha256((root / "vendor" / rel).read_bytes()).hexdigest() != want]
print(len(fp["files"]), "files,", len(bad), "mismatched")
PY
```

**Verify the app's code does not use a field the contract does not have.**

```bash
node ../platform/08-tools/check-conflicts.ts .
```

**The `.` is the app checkout itself, not a filter.** Run it from the app repo, or from a worktree, and the scanner reads that checkout. It identifies the app from `.contract/adopted.json`, `.contract/usage.json` or `.contract/extensions/`, so a worktree with any directory name works. `APP_REPO=<path>` does the same. `--app` only filters the report.

**Verify this guide's tables.**

```bash
python3 - <<'PY'
import re
doc="07-guides/wiring-an-app-to-the-contract.md"
lines=open(doc,encoding="utf-8").read().split("\n")
def n(l): return len(re.findall(r"(?<!\\)\|",l))-1
i=0;bad=0;t=0
while i<len(lines):
    if lines[i].strip().startswith("|") and i+1<len(lines) and re.match(r"^\s*\|[\s:|-]+\|\s*$",lines[i+1]):
        m=n(lines[i]);j=i+2
        while j<len(lines) and lines[j].strip().startswith("|"):
            if n(lines[j])!=m: print("BAD",doc,j+1);bad+=1
            j+=1
        t+=1;i=j
    else: i+=1
print(f"{doc}: TABLES={t} MALFORMED={bad}")
PY
```

Expected: `MALFORMED=0`. Any `BAD` line is a failure. Fix the table and re-run.

## 7. Report format

**This is an app-repo guide.** End with the app block:

```
CONTRACT VERSION: <version>
CONTRACT DRIFT: none | <field: old -> new>
FILES READ: <paths>
FILES CHANGED: <paths>
VERIFICATION: analyze <pass/fail> | test <pass/fail> | adoption <pass/fail> | conflicts <pass/fail>
CONTRACT CHANGE NEEDED: none | <proposed CHG id + one line>
OPEN QUESTION: <one line, or none>
```

`CONTRACT DRIFT` names any place your app's code still uses an old field name or value after this run. `analyze` means the app's static check (`flutter analyze`, or `npm run lint` plus `npx tsc --noEmit`). `adoption` means `check-adoption.ts` passed for your app. `conflicts` means `check-conflicts.ts` reports no P0.
