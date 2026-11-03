---
id: publishing-a-contract-change
title: Publishing a Contract Change
status: frozen
owner: platform-owner
updated: 2026-11-02
contractVersion: "1.0.0"
audience: harness
see_also:
  - ./making-a-contract-change.md
  - ./adopting-a-change.md
  - ./using-this-repo.md
  - ../06-changes/README.md
  - ../08-tools/README.md
---

# Publishing a Contract Change

**You are moving a contract change from the platform repo out to three app repos, and closing the loop when it comes back.**

**This guide is a map, not a run.** Each step below is a separate run, in a separate repo, with its own pull request and its own merge. The handoff between two repos is a merge, never a shared working tree.

**Two guides own the ends of this map. This guide owns the middle.**

| Who | Owns | Guide |
|---|---|---|
| Platform owner | The contract edit, the CHG pair, the VERSION bump | `./making-a-contract-change.md` |
| App owner | The app's code and the app's adoption record | `./adopting-a-change.md` |
| This guide | The handoff. The sync, the version pin, the matrix refresh, and the way back | This file |

## 1. Authority order

1. The contract (`../02-contracts/`) wins over every PRD and over every app repo.
2. `./making-a-contract-change.md` owns the platform-side edit. **This guide does not repeat it.** Read that guide and follow its section 4.
3. `./adopting-a-change.md` owns the app-side adoption. **This guide does not repeat it.**
4. This guide owns the middle: the composed schemas, the sync, the app's version pin, and the matrix refresh. Nobody else owns them.
5. `../06-changes/manifest.json` is the machine list of who must catch up. `affectedApps` on an entry is the only authority on who gets a sync.
6. The app's own `.contract/vendor/` plus `.contract/fingerprint.json` is the app's pinned copy. **The app reads that copy, not a sibling checkout.** The fingerprint is what proves the app was built against this exact contract.
7. `../08-tools/README.md` is the authority on what each script does. If this guide and that file disagree, that file is right.
8. The platform owner decides severity, scope and priority. An app does not.

**On a conflict, report it. Never resolve it by editing the winner to match the loser.**

## 2. Hard constraints

| # | Constraint |
|---|---|
| 1 | NEVER edit files in two repos in one run. The platform repo and an app repo have different CI and different owners |
| 2 | NEVER sync an app from a dirty platform working tree. Commit and merge the platform change first, then sync |
| 3 | NEVER sync all three apps in one step. One app, one pull request, one merge. A bulk sync hides which app broke |
| 4 | NEVER hand-edit `.contract/vendor/` or `.contract/fingerprint.json`. They are generated. Delete and re-sync instead |
| 5 | NEVER edit an app's `.contract/adopted.json` from the platform repo. Adoption is that app's own pull request |
| 6 | NEVER mark a change adopted on behalf of an app. Not even when you wrote the code for it |
| 7 | NEVER bump an app's `contractVersion` before its adoption work is done. The pin claims what the app adopted, not what it received |
| 8 | NEVER run `build-schemas.ts` after the sync. The fingerprint must record the composed schemas that shipped. Compose first, sync second |
| 9 | NEVER run `check-adoption.ts --write` before the app's pull request has merged. It reports what the app's own file says, and an unmerged file is not a fact yet |
| 10 | NEVER deploy. The server goes first, the clients go second, the rules tighten last |
| 11 | NEVER edit the contract to fix an app's bug. The app adopts the contract. A shape change needs a request |
| 12 | ALWAYS run the composed-schema build before every sync. CI enforces it, and a stale composed schema is a wrong fingerprint |
| 13 | ALWAYS say what a step wrote. "Reads only" and "writes files" are different claims, and a report that cannot tell them apart is not a report |

**What "writes" means in this guide.**

| Value | Meaning |
|---|---|
| `reads only` | Nothing on disk changes. The step only looks |
| `writes files` | Files change in a git repo. The change is reviewable and revertible |
| `writes data` | Something outside a git repo changes. A Firestore document, a GitHub issue, a deployment. **No step in this guide writes Firestore data. Deploys are human actions** |

## 3. Read budget

| Your task | Read exactly these | Do not read |
|---|---|---|
| Publish a change to the apps | This file, `./making-a-contract-change.md` section 4.0 | `../09-reference/` |
| Compose the schemas | This file section 4.2, `../08-tools/README.md` | The other 13 schemas |
| Sync one app | This file section 4.3 | The other two app repos |
| Adopt in an app | This file section 4.4, then `./adopting-a-change.md` | The other app repos |
| Refresh the matrix | This file section 4.5 | `../09-reference/` |
| Report a bug from an app | This file section 4.6, `../06-changes/templates/contract-request.md` | The platform's schemas, unless the bug is a shape bug |
| Triage a report | This file section 4.7, `../02-contracts/severity-policy.md` | The app's source, unless the report is unclear |

## 4. Procedure

### 4.0 The pipeline at a glance

**Six steps. Each one is a separate run in a separate repo.**

| # | Step | Repo | Who | Writes | What it proves |
|---|---|---|---|---|---|
| 1 | Make the contract change | Platform | Platform owner harness | writes files | The new shape exists and is explained |
| 2 | Compose the schemas | Platform | Platform owner harness | writes files | The strict runtime schemas match the raw ones |
| 3 | Sync one app | App | App owner harness | writes files | The app's pinned copy is the new one |
| 4 | Adopt the change | App | App owner harness | writes files | The app's code matches the new contract |
| 5 | Refresh the matrix | Platform | Platform owner harness | writes files | The report matches the machine log |
| 6 | Deploy | Firebase | **Human** | writes data | The live backend moved |

**Steps 1 to 4 are the rule. Step 5 is the receipt. Step 6 is not yours.**

**The one thing that breaks the pipeline.** Step 2 after step 3. The fingerprint is a sha256 of the copied bytes, and the copied bytes include `02-contracts/collections/.composed/`. Sync first, compose second, and the app's fingerprint records a strict schema that never existed in the release.

### 4.1 Forward, step 1: the platform change lands

**The edit itself is `./making-a-contract-change.md` section 4.0. Do not repeat that procedure here.**

What belongs to this guide is the handoff condition. Before anything is synced, all five of these must be true.

| # | Condition | Why it is load-bearing |
|---|---|---|
| 1 | The platform working tree is clean | `sync-contract.ts` copies whatever is on disk. A dirty tree gives the app a contract that exists nowhere else |
| 2 | The change is merged on `main` | The apps sync from `main`. An unmerged branch is not a contract version |
| 3 | The CHG pair exists | `../06-changes/manifest.json` plus its `CHG-*.md` file, same commit. CI pairs them |
| 4 | `../VERSION` is bumped | S1 is MAJOR, S2 and S3 are MINOR. `../02-contracts/severity-policy.md` section 5 |
| 5 | `affectedApps` is filled in | An unlisted app is an app that breaks silently. It is also an app that never gets synced |

**A release is a separate thing from a publish.** The release tag is `v<VERSION>` and it drives `.github/workflows/release.yml`, which packages a tarball and creates a GitHub release. **The apps do not sync from the tarball and they do not sync from a tag.** They sync from `main`. The tag marks the release, the pull request carries the change.

**A change that is not ready to sync.** An S0 security hole does not wait for this pipeline. It goes to `./emergency-changes.md`, deploy first, record in the same window.

### 4.2 Forward, step 2: compose the schemas

**One command. It writes the strict runtime schemas the apps validate against.**

```bash
cd 08-tools
node --experimental-strip-types build-schemas.ts
# expected: composed schemas built: <n> collections, <n> extension merge(s), <n> files
```

**What it writes.** `02-contracts/collections/.composed/<name>.schema.json` and `<name>.strict.schema.json`, one pair per collection. The plain file has the enum refs inlined and the registered extension properties merged. The strict file has `unevaluatedProperties: false`, so an unknown field is rejected instead of ignored.

**Never edit these by hand.** They carry a `DO NOT EDIT` header and CI regenerates them to prove they are current.

```bash
cd 08-tools && node --experimental-strip-types build-schemas.ts && cd ..
git status --porcelain 02-contracts/collections/.composed/
# expected: no output
```

**The order rule, one more time.** Compose, then commit, then sync. The fingerprint covers the composed files, because `sync-contract.ts` copies `02-contracts/` recursively.

**An extension changes the composed schemas too.** If the app's extension file moved, this command produces a different strict schema for that collection. That is why an extension registration is a two-repo event: the app changes its own file, the platform mirrors it and registers it, and the platform recomposes.

**The platform's mirror is what the tools read.** `build-schemas.ts` and `check-consistency.ts` read `02-contracts/extensions/<app>.json`, the platform's registered copy. Copy the app's file there with `cp` before you recompose, or the composed schemas will not pick up the change. The hash in the registry proves the copy is byte identical to the app's file.

### 4.3 Forward, step 3: sync one app

**This step runs in the APP repo. It pulls the platform's contract into the app's pinned copy.**

```bash
cd ../driverapp
node ../platform/08-tools/sync-contract.ts .
# expected: contract synced into <path>/.contract/vendor
```

**What it writes.**

| Path | What | Tracked? |
|---|---|---|
| `.contract/vendor/02-contracts/` | The machine layer, including the composed schemas | Yes |
| `.contract/vendor/03-rules/` | The rules, the indexes, the emulator config | Yes |
| `.contract/vendor/05-decisions/` | The ADRs | Yes |
| `.contract/fingerprint.json` | The sha256 of every copied file, plus the contract version | Yes |

**It removes the previous vendor copy first.** A file deleted from the contract does not survive in the app. That is the point of the copy, and it is why a stale vendor folder can never be fixed by hand.

**The fingerprint is deterministic.** Same contract content, same bytes, same fingerprint. No timestamp. So CI can diff it, and a diff that is not empty means the app is out of date.

**The app reads its own vendored copy.** Never `../platform/02-contracts/...` at runtime or in a code path. The vendored copy plus the fingerprint is what the app was built against. A sibling checkout can move under the app's feet.

**After the sync, the app's version pin is still behind.** `sync-contract.ts` copies the contract. It does not touch `.contract/adopted.json`, because receiving a contract and adopting it are different acts. The pin moves in step 4.

**One app at a time.** The driver app, the user app and the admin panel each get their own pull request. A bulk sync across three repos is three pull requests, not one, and a failure in the third one does not roll back the first two.

### 4.4 Forward, step 4: the app adopts

**The adoption itself is `./adopting-a-change.md`. Do not repeat that procedure here.**

What belongs to this guide is the version pin.

**The pin moves after the implementation work, not before it.**

```bash
node ../platform/08-tools/bump-contract.ts . --contract-version=1.1.0
# expected: adoption record bumped
```

**What it writes.** The `contractVersion` field in the app's `.contract/adopted.json`. It preserves every per-change adoption record and prints a diff-style summary of exactly what moved.

**The order inside the app repo.**

| # | Step | Writes |
|---|---|---|
| 1 | Sync the vendor copy, section 4.3 | writes files |
| 2 | Write the checklist into `.contract/adopted.json`, status `not_started` | writes files |
| 3 | Implement the migration steps in the manifest's order | writes files |
| 4 | Mark each checklist item done with merged pull request evidence | writes files |
| 5 | Bump the version pin, this section | writes files |
| 6 | Set the status to `adopted` | writes files |
| 7 | Run the gate, open the pull request | reads only |

**Why the pin is step 5 and not step 1.** The pin is a claim. `1.1.0` in the app's file means the app has finished the work that `1.1.0` asks for. If the pin moved at step 1, the app would be claiming an adoption it has not made, and `check-adoption.ts` would report it as done while the code is still on the old contract.

**An extension version moves the same way.** `bump-contract.ts --extension-version=2` moves the app's `extensionVersion` without touching the core contract version. The extension model never bumps the core.

### 4.5 Forward, step 5: refresh the matrix

**This step runs in the PLATFORM repo, after the app's pull request has merged.**

```bash
node 08-tools/check-adoption.ts --write
# expected: impact matrix regenerated
```

**What it writes.** The block between `<!-- BEGIN GENERATED: section-1 -->` and `<!-- END GENERATED: section-1 -->` in `../06-changes/impact-matrix.md`. Sections 2 to 6 are hand written and are never touched.

**The matrix is a report, not a source of truth.** The truth is each app's own `.contract/adopted.json`. The matrix is generated from the manifest and those files, so it cannot drift.

**Why it runs after the merge.** The generator reads the app's file on disk. An unmerged branch is not a fact about the app. Running it earlier writes a number the app has not earned.

**Check that it is idempotent.**

```bash
node 08-tools/check-adoption.ts --write
git status --porcelain 06-changes/impact-matrix.md
# expected: no output
```

**`--write` is a writer, not a gate.** It exits 0 even when an app is behind. The gate is the plain command, which exits 1 and lists every gap.

```bash
node 08-tools/check-adoption.ts
# expected: adoption check passed, or the list of apps behind on an S0 or S1 change
```

**A gate failure is not a matrix problem.** If the plain check exits 1, an app is behind on an S0 or S1 change. That is the gate working. Do not paper over it by regenerating the matrix. Fix the app, or accept the deadline.

### 4.6 Reverse: an app found a problem

**An app harness found something that does not fit. This is the most common thing that happens in this system, and the most common way it goes wrong is that someone edits the platform repo to make it fit.**

**Never edit the platform repo from an app repo.** The platform does not depend on an app. An app depends on the platform. The dependency runs one way, and that is what keeps the contract authoritative.

**First, decide where the problem belongs.**

| What the app found | Where it goes | Guide |
|---|---|---|
| Only THIS app uses the field or the value | **EXTENSION.** The app adds it to its own `.contract/extensions/<app>.json`. The platform registers it | `./using-this-repo.md` A8 |
| Two or more apps must agree on it | **CORE.** A contract request. Never an edit | This section |
| The app's code is wrong and the contract is right | **The app fixes its code.** No request. The app adopts the contract, never the reverse | `./adopting-a-change.md` |
| A rule denies a read that should be allowed | **CORE.** The rules belong to the platform. A request, with the emulator reproduction | This section |
| A callable behaves differently from its contract | **CORE.** The contract or the Function belongs to the platform. A request | This section |
| The code is right and only the version pin is stale | **Not a request.** A sync, section 4.3 | This section |

**Then, file it. Five steps.**

| # | Step | Who | Writes |
|---|---|---|---|
| 1 | Reproduce it. The smallest failing case. A report without a reproduction is a story | App harness | writes files, in the app's test folder |
| 2 | Run the extension test. One app only means it is an extension and it never reaches the platform | App harness | reads only |
| 3 | Fill the request form, all 12 sections | App harness | writes files, in a scratch file outside the repo |
| 4 | Open it as an issue in the platform repo | App harness | writes data, GitHub |
| 5 | Report it in the app's block, section 7 of `./adopting-a-change.md` | App harness | reads only |

**Step 3, the form.** `../06-changes/templates/contract-request.md`. All 12 sections. A partial form is a form the platform owner has to interview you about, which is slower than asking the question properly the first time.

**Step 4, the command.** The issue goes to the platform repo, which is a different repository from the app.

```bash
gh issue create --repo safaaisaathi/platform \
  --title "Contract request: <one line>" \
  --label contract-request \
  --body-file <path to the filled form>
```

`--body-file`, never `--body`. A long form on the command line lands in the shell history and gets mangled by quoting.

**The issue template.** The platform repo carries `.github/ISSUE_TEMPLATE/contract-request.md`. Opening an issue from the GitHub UI gives the form already laid out. Opening it with `gh` means writing the same 12 sections into a file first. Either way the form is the same file, `../06-changes/templates/contract-request.md`.

**Step 5, the report line.** The app's block already has the line for this.

```
CONTRACT CHANGE NEEDED: CHG-0008, complaint.assignedAt is missing from the contract
```

**Never mark the app's own change as adopted while the request is open.** The app's record stays where it is. The platform owner's answer comes back as a change, and then the app adopts it the normal way.

**An S0 does not wait for a form.** A security hole is open right now. It goes to `./emergency-changes.md`: deploy first, record in the same window, and the request form follows as the record.

### 4.7 Reverse: the platform owner triages the report

**An issue arrived. Four steps, and only one of them changes anything.**

| # | Step | Who | Writes |
|---|---|---|---|
| 1 | Classify the severity. `../02-contracts/severity-policy.md` section 1 | Platform owner | reads only |
| 2 | Run the extension test. `../02-contracts/extensions/README.md` section 1 | Platform owner | reads only |
| 3 | Decide: approve, defer, or reject with a reason | Platform owner | reads only |
| 4 | If approved, turn it into a CHG and start the forward pipeline at section 4.1 | Platform owner | writes files |

**Step 2 decides the route.** One app only means it is an extension and the app can add it itself today. Two apps must agree means it is core and it needs a CHG with a severity and a migration plan.

**Step 3, the three answers.**

| Answer | What it means | What happens |
|---|---|---|
| Approve | It is a real gap in the contract | It becomes a CHG. Section 4.1 |
| Defer | It is real, but not now | The issue says why and when. The app records the drift in its own `CONTRACT DRIFT` line |
| Reject | The contract is right and the app is wrong | The issue says which file proves it. The app fixes its code |

**A rejection is not a failure.** A rejected request means the contract was right. Say so plainly and point at the file that proves it.

**Step 4, closing the loop.** The issue is the request. The CHG is the record. When the change lands, close the issue with the CHG id in the comment, so the next person can trace the request to the change.

```
Implemented as CHG-0008. The field is in 02-contracts/collections/complaint.schema.json.
The driver app adopts it in <app repo> pull request <number>.
```

## 5. Do NOT

| Do NOT | Why |
|---|---|
| Do not edit the platform repo from an app repo | The platform does not depend on an app. An app depends on the platform |
| Do not copy the edit procedure out of `./making-a-contract-change.md` into this file | Procedures differ on purpose. Two copies drift, and the drift is invisible |
| Do not sync from a dirty tree | The app gets a contract that exists nowhere else, and the fingerprint proves it |
| Do not sync all three apps at once | Three pull requests, three reviews, three rollbacks |
| Do not bump the version pin before the work is done | The pin is a claim. An early bump is a false claim the gate cannot detect |
| Do not run `build-schemas.ts` after the sync | The fingerprint must record the composed schemas that shipped |
| Do not edit `.contract/vendor/` or the fingerprint by hand | They are generated. Delete and re-sync |
| Do not regenerate the matrix before the app's pull request merges | It would publish a number the app has not earned |
| Do not file a request without a reproduction | A story gets a question back, and the question costs more than the bug |
| Do not skip the extension test | A one-app field belongs in the app's own repo. It never reaches the platform |
| Do not deploy | Deployment is a human action, and the order is load-bearing |

## 6. Self-verification

**The platform side, after step 2.**

```bash
cd 08-tools && node --experimental-strip-types build-schemas.ts && cd ..
git status --porcelain 02-contracts/collections/.composed/
# expected: no output
```

**The app side, after step 3.** The fingerprint must match the bytes on disk.

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

**The app side, after step 4.** The pin must be where the app says it is.

```bash
python3 -c "import json;print(json.load(open('.contract/adopted.json'))['contractVersion'])"
cat ../platform/VERSION
# expected: the same version, once the app has adopted it
```

**The platform side, after step 5.** The matrix must be idempotent.

```bash
node 08-tools/check-adoption.ts --write
git status --porcelain 06-changes/impact-matrix.md
# expected: no output
```

**The gate, on every run in the platform repo.**

```bash
node 08-tools/validate-contract.ts
# expected: contract valid
node 08-tools/check-consistency.ts
# expected: manifest consistent
```

**This guide's tables.**

```bash
python3 08-tools/check-tables.py 07-guides/publishing-a-contract-change.md
# expected: 07-guides/publishing-a-contract-change.md: 13 tables, 0 malformed
```

## 7. Report format

**A forward run ends with this block.**

```
CONTRACT VERSION: <from VERSION, old -> new if changed>
REPO: <platform | driverapp | userapp | adminpanel>
STEP: <1 make | 2 compose | 3 sync | 4 adopt | 5 matrix>
FILES CHANGED: <paths>
WROTE: <what changed, one line>
APP REPOS SYNCED: <app names, or none>
MATRIX: regenerated | unchanged | not this step
VALIDATION: <command> -> <pass/fail>
BLOCKED ON: <the human's action, or none>
OPEN QUESTION: <one line, or none>
```

**For example, after syncing the driver app.**

```
CONTRACT VERSION: 1.0.0 -> 1.1.0
REPO: driverapp
STEP: 3 sync
FILES CHANGED: .contract/vendor/, .contract/fingerprint.json
WROTE: the vendor copy and its fingerprint. The pin did not move, that is step 4
APP REPOS SYNCED: driverapp
MATRIX: not this step
VALIDATION: fingerprint check -> 68 files, 0 mismatched
BLOCKED ON: none
OPEN QUESTION: none
```

**A reverse run ends with the app block**, the one in `./adopting-a-change.md` section 7. It carries the `CONTRACT CHANGE NEEDED` line.

```
CONTRACT VERSION: 1.0.0
CONTRACT DRIFT: none | <field: old -> new>
FILES CHANGED: <paths>
VERIFICATION: analyze <pass/fail> | test <pass/fail> | adoption <pass/fail>
CONTRACT CHANGE NEEDED: none | <proposed CHG id + one line>
```

**Never put a secret value in any line of any block.**
