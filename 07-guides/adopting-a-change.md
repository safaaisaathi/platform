---
id: adopting-a-change
title: Adopting a Change in an App Repo
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: harness
see_also:
  - ../06-changes/adoption.json
  - ../06-changes/manifest.json
  - ../02-contracts/extensions/README.md
---

# Adopting a Change in an App Repo

**You are an app repo harness (`driverapp`, `userapp` or `adminpanel`). A change was published in the platform repo. Implement it, prove it, and update `.contract/adopted.json` as you go.**

This guide runs in the APP repo. Its report block is the app block in section 7. The platform repo sits beside the app repo. Set `PLATFORM=../platform` (adjust if your checkout differs).

## 1. Authority order

1. The contract (`02-contracts/`) wins over every PRD and over every app repo. If your app's code disagrees with the schema, your app's code is wrong.
2. `$PLATFORM/06-changes/manifest.json` is the machine list of what changed. The `CHG-*.md` file explains why. Read both. The manifest is NOT vendored, so it comes from the sibling checkout.
3. **Your app's own `.contract/vendor/` is the contract.** Read the schema from `.contract/vendor/02-contracts/collections/<x>.schema.json`, never from `$PLATFORM/02-contracts/`. The vendored copy plus `.contract/fingerprint.json` is what your app was built against. A sibling checkout can move under your feet.
4. Your app's `.contract/adopted.json` is the truth about YOUR adoption. `$PLATFORM/06-changes/adoption.json` is a report of it, not a source of truth.
5. The `migration.steps` order in the manifest entry is law. Server first, clients second, rules tighten last.
6. `.contract/vendor/02-contracts/extensions/README.md` decides whether a field is yours to add freely (extension) or bound by the CHG (core).

## 2. Hard constraints

| # | Constraint |
|---|---|
| 1 | NEVER implement a field name that is not in your app's vendored schema. Check `grep` against `.contract/vendor/02-contracts/` before you write code |
| 2 | NEVER mark an item `done` without evidence. Evidence is a merged PR number |
| 3 | NEVER set a change to `adopted` while any checklist item is open. Partial adoption is `in_progress` |
| 4 | NEVER edit `$PLATFORM/06-changes/adoption.json` from the app repo. It is a generated report |
| 5 | NEVER mark another app's adoption. Adoption is that app's own CI, from its own PR |
| 6 | NEVER bump `.contract/adopted.json` `contractVersion` before the work is done. The version claims what you adopted |
| 7 | An app with no checklist shows 0 percent, not 100. Write the checklist first, from the manifest's `migration.steps` |
| 8 | NEVER extend a core field with a private rename. If the core name is wrong for your app, open a contract request |
| 9 | An S1 change blocks your release until adopted. It does not block unrelated PRs in your repo |

## 3. Read budget

| Your task | Read exactly these | Do not read |
|---|---|---|
| Sync the pinned copy | This file section 4.1 | The platform's schemas, the app has its own copy |
| Find what applies to you | `$PLATFORM/06-changes/manifest.json`, your app's block in `$PLATFORM/06-changes/adoption.json` | The `CHG-*.md` files for other apps' changes |
| Understand one change | Its `$PLATFORM/06-changes/CHG-<nnn>-<slug>.md` file | `../09-reference/` |
| Get the exact field shape | The one schema in `.contract/vendor/02-contracts/collections/` | The other 13 schemas |
| Add an app-only field | `.contract/vendor/02-contracts/extensions/README.md` sections 3, 6, 8 | The core schemas |
| Run the gate | `$PLATFORM/08-tools/check-adoption.ts` | Nothing else |
| Know the deadline | The manifest entry's `migration.deadline` and `urgency` | The severity policy, unless the urgency is unclear |

## 4. Procedure

### 4.0 The loop

| Step | Do | Where |
|---|---|---|
| 1 | Sync the pinned copy. Pull the new contract into `.contract/vendor/` | App repo, `sync-contract.ts` |
| 2 | List the changes that affect your app | Platform repo, `manifest.json` |
| 3 | Pick one change. Read its `CHG-*.md` | Platform repo, `06-changes/` |
| 4 | Write the checklist into your `.contract/adopted.json`, status `not_started` | App repo |
| 5 | Implement the steps in the manifest's order | App repo, plus platform deploys by a human |
| 6 | Mark items done with PR evidence as you merge them | App repo |
| 7 | Bump `contractVersion`, then set `adopted` | App repo, `bump-contract.ts` |
| 8 | Run the gate, open the PR, report | App repo |

**Step 1 before step 2.** Your app reads its own vendored copy, not the sibling checkout. If you skip the sync, you implement against a contract your app was never pinned to, and the fingerprint keeps claiming the old one.

### 4.1 Step 1: sync the pinned copy

```bash
node ../platform/08-tools/sync-contract.ts .
# expected: contract synced into <path>/.contract/vendor
```

**What it writes.** `.contract/vendor/02-contracts/`, `.contract/vendor/03-rules/`, `.contract/vendor/05-decisions/` and `.contract/fingerprint.json`. The fingerprint holds the sha256 of every copied file and the contract version.

**It removes the previous copy first.** A file deleted from the contract does not survive in your app. Never hand-edit the vendor folder. Delete it and re-sync.

**The fingerprint is deterministic.** Same contract content, same bytes, same fingerprint. No timestamp. So CI can diff it, and an empty diff is the proof that your app is on the contract it claims.

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
# expected: 68 files, 0 mismatched
```

**One app at a time.** Each app syncs in its own pull request. A bulk sync across three repos is three pull requests, not one.

### 4.2 Step 2: find what applies to you

```bash
python3 - <<'PY'
import json
m=json.load(open("../platform/06-changes/manifest.json"))
app="driverapp"
for c in m["changes"]:
    if app in c["affectedApps"]:
        print(c["id"], c["severity"], c["title"], "deadline:", c["migration"]["deadline"])
PY
```

Expected for `driverapp` today: `CHG-0001 S2`, `CHG-0002 S1`, `CHG-0003 S1`, `CHG-0005 S1`, `CHG-0006 S1`. Change `app=` to `userapp` or `adminpanel` as needed.

### 4.3 Step 3: read the change

Open the entry's `explainedIn` file, for example `$PLATFORM/06-changes/CHG-0002-mask-the-raw-driver-phone.md`. Extract three things: what breaks, the migration steps in order, the deadline. Do not skim. The steps are ordered because the order is the migration.

### 4.4 Step 4: write the checklist

In the app repo, edit `.contract/adopted.json`:

```json
{
  "contractVersion": "1.0.0",
  "extensionVersion": "0",
  "coreChanges": {
    "CHG-0002": {
      "status": "in_progress",
      "urgency": "before_release",
      "progress": 0,
      "checklist": [
        { "task": "Read drivers.phoneMasked instead of drivers.phone", "done": false },
        { "task": "Show the masked phone on the confirm card", "done": false },
        { "task": "Handle old documents that still have phone only", "done": false }
      ],
      "verifiedBy": "08-tools/check-adoption.ts"
    }
  }
}
```

The checklist comes from the manifest entry's `migration.steps`, filtered to the steps your app owns. Progress is `done items / total items`, computed, never estimated.

### 4.5 Step 5: implement

Work the steps in the manifest's order. Verify every field name against the schema before you use it:

```bash
grep -n "phoneMasked" .contract/vendor/02-contracts/collections/driver.schema.json
# expected: the property, with pattern ^[0-9]{2}X{4}[0-9]{2}$
```

For Flutter apps:

```bash
flutter analyze
flutter test
```

For `adminpanel`, run its lint and type-check scripts (`npm run lint`, `npx tsc --noEmit` or the repo's equivalent).

If the change touches a callable you call, check the signature in `.contract/vendor/02-contracts/callables.json` first, and the reason codes in `.contract/vendor/02-contracts/errors.json`. The client maps codes to copy keys. It never matches on English text.

### 4.6 Step 6: mark the items done

| Status | When |
|---|---|
| `not_started` | Before you touch anything |
| `in_progress` | Some checklist items done, with evidence per item |
| `adopted` | Every item done, every item has merged-PR evidence, tests pass |
| `blocked` | You cannot proceed. Write the reason in the note |
| `waived` | The office decided. The reason is required |

A `not_applicable` status needs a note saying why, like the existing entries in `$PLATFORM/06-changes/adoption.json`.

**The status and the version pin are two different acts.** The status says what you did. The pin says what contract you are on. Set the status to `adopted` only after every checklist item is done, and move the pin in the next step.

### 4.7 Step 7: bump the version pin

```bash
node ../platform/08-tools/bump-contract.ts . --contract-version=1.1.0
# expected: adoption record bumped
```

**What it writes.** The `contractVersion` field in your `.contract/adopted.json`. It preserves every per-change adoption record and prints a diff-style summary of exactly what moved.

**The target is the manifest entry's `contractVersion.to`.** Never a version you remember or one you type from memory. Read it out of `$PLATFORM/06-changes/manifest.json`.

**The pin moves after the work, never before it.** The pin is a claim. `1.1.0` in your file means the app has finished the work that `1.1.0` asks for. If it moves at step 1, the app claims an adoption it has not made, and the platform's matrix reports it as done while the code is still on the old contract.

**An extension version moves the same way.** `bump-contract.ts --extension-version=2` moves your `extensionVersion` without touching the core contract version. The extension model never bumps the core.

**Check it.**

```bash
python3 -c "import json;print(json.load(open('.contract/adopted.json'))['contractVersion'])"
cat ../platform/VERSION
# expected: the same version, once you have adopted it
```

### 4.8 Step 8: the gate and the PR

```bash
node ../platform/08-tools/check-adoption.ts
# expected: no S0/S1 change reported behind for your app
```

Open the PR. CI re-runs the gate from the platform tooling. The release of an app with an unadopted S1 stays blocked until the PR merges.

## 5. Do NOT

| Do NOT | Why |
|---|---|
| Do not start coding before reading the `CHG-*.md` file | The migration order is the content. Coding first is how rules get tightened before clients |
| Do not implement from the manifest alone | The manifest says what changed. Only the `CHG-*.md` file says why and what breaks |
| Do not treat a passing build as adoption | The checklist and the gate are the record. A build proves nothing about scope |
| Do not edit the platform repo to make your app pass | The platform does not depend on an app. An app depends on the platform |
| Do not guess a claim name or a reason code | They are in `claims.json` and `errors.json`. A misspelled claim silently denies every rule that uses it |
| Do not mark a change adopted on behalf of another app | Never, even if you wrote the code for it. Adoption is that app's own PR |

## 6. Self-verification

```bash
flutter analyze
# expected: No issues found!
flutter test
# expected: All tests passed!
node ../platform/08-tools/check-adoption.ts
# expected: no failing line for your app
```

Verify your adopted file parses and its numbers add up:

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
# expected: one line per change, then: adopted.json ok
```

Verify this guide's tables:

```bash
python3 - <<'PY'
import re
doc="07-guides/adopting-a-change.md"
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

Expected: `07-guides/adopting-a-change.md: TABLES=5 MALFORMED=0`. Any `BAD` line is a failure.

## 7. Report format

This is an app-repo guide. End with the app block:

```
CONTRACT VERSION: <version>
CONTRACT DRIFT: none | <field: old -> new>
FILES CHANGED: <paths>
VERIFICATION: analyze <pass/fail> | test <pass/fail> | adoption <pass/fail>
CONTRACT CHANGE NEEDED: none | <proposed CHG id + one line>
```

`CONTRACT DRIFT` names any place your app's code still uses an old field name or value after this run. `analyze` means the app's static check (`flutter analyze`, or the admin panel's `tsc --noEmit`). `adoption` means `check-adoption.ts` passed for your app.
