---
id: adding-a-new-feature
title: Adding a New Feature
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: harness
see_also:
  - ../06-changes/templates/contract-request.md
  - ./making-a-contract-change.md
  - ./adopting-a-change.md
---

# Adding a New Feature

**A feature that needs new data or a new server action starts in the contract, not in the app. Worked example: the admin panel's complaint assignment board. Follow it in order.**

The scenario: the office wants to assign each complaint to a staff member, see who is late, and filter the board by ward. One app (`adminpanel`), one existing core field, one new field, one new callable, one index. This guide walks every decision.

## 1. Authority order

1. The contract (`02-contracts/`) wins over every PRD and over every app repo. If the PRD asks for a field that conflicts with the schema, the schema wins and the PRD gets a change request.
2. The extension test in `../02-contracts/extensions/README.md` section 1 decides core versus app-owned: two apps must agree means CORE, one app only means EXTENSION.
3. `../02-contracts/severity-policy.md` decides severity and bump.
4. The migration order is law: server first, clients second, rules tighten last.
5. `../AGENTS.md` mode table applies: an app repo harness DRAFTS in its own repo only. The platform repo is edited by the platform owner's harness.

## 2. Hard constraints

| # | Constraint |
|---|---|
| 1 | ALWAYS check `../02-contracts/` first. The field may already exist. `complaints.assignedTo` already exists in `../02-contracts/collections/complaint.schema.json` |
| 2 | NEVER add a field to fix a UI bug. If the data exists and the screen is wrong, the fix is in the app |
| 3 | NEVER put per-user UI state (column layout, sort order, filters) in the contract. It lives in the app's local storage |
| 4 | NEVER add a field only one app reads to the core. Use that app's extension file |
| 5 | EVERY new admin write is a callable. The admin panel writes nothing directly. Q5 |
| 6 | EVERY admin write callable checks `staff/{staffId}.active` live inside the call |
| 7 | NEVER ship the feature against an unregistered field. The composed schema rejects it and the app's own test fails |
| 8 | One feature = one change entry. Do not bundle an unrelated enum change into the same CHG |
| 9 | The feature is not done when the app builds. It is done when `.contract/adopted.json` says adopted with PR evidence |

## 3. Read budget

| Your task | Read exactly these | Do not read |
|---|---|---|
| Check what exists | `../02-contracts/collections/complaint.schema.json`, `../02-contracts/collections/README.md` | The other 12 schemas |
| Decide core vs extension | `../02-contracts/extensions/README.md`, sections 1 and 9 | `../09-reference/` |
| Open the request | `../06-changes/templates/contract-request.md` | The whole `../06-changes/` folder |
| Make the edits | `./making-a-contract-change.md`, sections 4.1, 4.6 | `../09-reference/` |
| Build the app half | Your app's repo, `./adopting-a-change.md` | The other apps' repos |
| Check the gate | `../06-changes/manifest.json`, `../06-changes/adoption.json` | `../06-changes/impact-matrix.md` is generated, never edited |

## 4. Procedure

### 4.0 The pipeline

| Step | Who | What | Reads or writes |
|---|---|---|---|
| 1 | App owner harness | Write the one-line feature statement | Read |
| 2 | App owner harness | Design pass: which fields, which collections, core vs extension | Read |
| 3 | App owner harness | Fill `../06-changes/templates/contract-request.md`, all 12 sections, open an issue | Read |
| 4 | Platform owner harness | Classify severity, make the contract edits, bump VERSION, record the CHG pair | Write |
| 5 | Platform owner harness | Validate the contract | Read |
| 6 | App owner harness | Build the feature against the new contract, adopt, open a PR | Write, in the app repo |
| 7 | CI | Gates run | Read |
| 8 | Human | Merge and release | Write |

### 4.1 Step 1: the feature statement

One line, no jargon:

```text
The office assigns each complaint to a staff member and sees which assignments are late.
```

### 4.2 Step 2: the design pass, four decisions

**Decision 1: does the data exist?** Read `../02-contracts/collections/complaint.schema.json`. `assignedTo` exists, `status` has the `assigned` value in `../02-contracts/enums.json`. Reuse them. Do not add `complaint.assignee` or any synonym.

**Decision 2: is anything new needed at all?** The late view needs a timestamp. `complaints.assignedAt` does not exist. That is one new optional field.

**Decision 3: core or extension?** Apply the one-line rule:

| Question | Answer | Verdict |
|---|---|---|
| Does any app other than `adminpanel` read `complaints.assignedAt`? | No | It could be an EXTENSION |
| Does any Function read it? | Yes, the escalation clock stamps and the future reminder sweep | A Function is a consumer, so CORE |
| Is it required? | No | Additive, S2, MINOR |

**Decision 4: what about the assign action itself?** The admin panel writes nothing directly (`../02-contracts/collections/README.md` section 4). The write must be a callable: `assignComplaint`, in the `adminWrites` family, checking `staff/{staffId}.active` live. The board's filter query (`status` + `wardId` + `createdAt`) needs a composite index in `../03-rules/firestore.indexes.json`.

### 4.3 Step 3: the contract request

Fill `../06-changes/templates/contract-request.md`, all 12 sections. The sections that decide the outcome:

| Section | What you write for this feature |
|---|---|
| The feature | The one-line statement |
| Which collections change | `complaints` only. No new collection |
| New or changed fields | `complaints.assignedAt`, timestamp, not required, default null |
| Who writes it, who reads it | Written by the `assignComplaint` callable. Read by `adminpanel` and the escalation sweep |
| Enums | None. `complaint.status = assigned` already exists |
| Callables | NEW: `assignComplaint`. Input: `complaintId`, `staffId`. Output: `updatedAt`. Reason codes: `notAuthorised`, `notFound`, `invalidInput`, `internal` |

Open it as an issue in the platform repo. Do not edit the contract yourself as the app owner.

### 4.4 Step 4: the platform owner's edits

Follow `./making-a-contract-change.md` for each item, in this order:

| # | Action | Guide section | Files |
|---|---|---|---|
| 1 | A2 add `complaints.assignedAt` | 4.1 | `../02-contracts/collections/complaint.schema.json` |
| 2 | A7 add `assignComplaint` | 4.6 | `../02-contracts/callables.json`, family `adminWrites` |
| 3 | A6 implement the callable | 4.5 | `../04-functions/src/index.ts`, live `staff.active` check |
| 4 | Index for the board query | 4.4 step 8 | `../03-rules/firestore.indexes.json` |
| 5 | Bump VERSION | 4.0 step 5 | `../VERSION`, 1.0.0 -> 1.1.0 |
| 6 | Record the CHG pair | 4.0 step 6 | `../06-changes/manifest.json` + `../06-changes/CHG-0008-complaint-assignment-board.md` |

No rule change. The admin write path already runs through callables, and no client writes the new field.

### 4.5 Step 5: validate

```bash
node 08-tools/validate-contract.ts
node 08-tools/check-consistency.ts
cd 04-functions && npm run build && cd ..
```

Expected: `contract valid`, the consistency success line, and a clean TypeScript build.

### 4.6 Step 6: build the app half

Switch to the `adminpanel` repo and follow `./adopting-a-change.md`:

1. Write the CHG-0008 checklist into `adminpanel/.contract/adopted.json`, status `in_progress`.
2. Call `assignComplaint` from the board's assign action. Never a direct Firestore write.
3. Render the late view from `assignedAt` and the existing index.
4. Mark checklist items done with the PR number as evidence.
5. Set the entry to `adopted` and `contractVersion` to the new value only when every item is done.

The other two apps are untouched. `driverapp` and `userapp` are not in `affectedApps`, so no adoption is required from them.

### 4.7 What would have changed the path

| Variation | Different path |
|---|---|
| The field is read only by the panel, no Function | EXTENSION. Edit `adminpanel/.contract/extensions/adminpanel.json`, bump its `extensionVersion`, register via A8. No core bump, other apps not notified |
| The feature needs a new enum value | A3 in `./making-a-contract-change.md`, S3, every app in the enum's chain needs a default branch |
| The feature needs a new collection | A4, new schema file, new rules block, index review |
| The feature needs the driver to see the assignment | Two apps read it, so it stays CORE, and `driverapp` joins `affectedApps` |

## 5. Do NOT

| Do NOT | Why |
|---|---|
| Do not start with the UI | The UI against an unrecorded field is throwaway the moment the contract edit lands |
| Do not invent a synonym field | `assignee`, `assignedStaff`, `assignedStaffId` are all wrong. The name is `assignedTo` |
| Do not let the panel write Firestore directly | Every admin write is a callable. Q5, instant revocation |
| Do not skip the live `staff.active` check because the token has a role | The token is a snapshot up to an hour old |
| Do not mark the feature done without adoption evidence | A merged PR is the evidence. Nothing else counts |
| Do not notify the unaffected apps | They are not in `affectedApps`. Noise trains people to ignore the real signal |

## 6. Self-verification

```bash
node 08-tools/validate-contract.ts
# expected: contract valid
node 08-tools/check-consistency.ts
# expected: the consistency success line
grep -n "assignedAt" 02-contracts/collections/complaint.schema.json
# expected: one hit, the new property
grep -n "assignComplaint" 02-contracts/callables.json
# expected: hits in x-callables and in x-family.adminWrites
```

Verify the CHG pair and the manifest fields:

```bash
python3 - <<'PY'
import json,os
m=json.load(open("06-changes/manifest.json"))
e=[c for c in m["changes"] if c["id"]=="CHG-0008"]
assert e, "CHG-0008 missing"
c=e[0]
assert c["affectedApps"]==["adminpanel"], c["affectedApps"]
assert c["migration"]["required"] is True or c["migration"]["steps"], "migration steps missing"
assert os.path.exists(os.path.join("06-changes",c["explainedIn"])), "explainedIn missing"
print("CHG-0008 ok")
PY
# expected: CHG-0008 ok
```

Verify this guide's tables:

```bash
python3 - <<'PY'
import re
doc="07-guides/adding-a-new-feature.md"
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

Expected: `07-guides/adding-a-new-feature.md: TABLES=8 MALFORMED=0`. Any `BAD` line is a failure.

## 7. Report format

The platform-side run ends with:

```
CONTRACT VERSION: <from VERSION, old -> new if changed>
FILES READ: <paths>
FILES CHANGED: <paths>
SEVERITY: <S0-S4>
CHANGE ID: <CHG-nnn, or none>
VALIDATION: <command> -> <pass/fail>
OPEN QUESTION: <one line, or none>
```

The app-side build ends with the app block, defined in `./adopting-a-change.md` section 7. Do not mix the two blocks in one message. One run, one block.
