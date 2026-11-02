---
id: making-a-contract-change
title: Making a Contract Change
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: harness
see_also:
  - ../02-contracts/severity-policy.md
  - ../06-changes/README.md
  - ../06-changes/templates/contract-request.md
  - ./using-this-repo.md
---

# Making a Contract Change

**You are changing the shared contract. Find your A-number, follow it end to end, and never skip the common path in 4.0.**

| A-number | Change type | Section |
|---|---|---|
| A2 | Add a field | 4.1 |
| A3 | Add an enum value | 4.2 |
| A4 | Add a new collection | 4.3 |
| A5 | Change a rule | 4.4 |
| A6 | Change a Function | 4.5 |
| A7 | Add a new callable | 4.6 |

A1 (answer a question), A8 (register an extension), A9 (deprecate a field), A10 (adopt), A11 (emergency) and A12 (drift report) are in `./using-this-repo.md`, `./emergency-changes.md` and `./adopting-a-change.md`.

## 1. Authority order

1. The contract (`02-contracts/`) wins over every PRD and over every app repo. If a PRD disagrees, the PRD gets fixed, not the contract.
2. `../02-contracts/severity-policy.md` decides the severity and the version bump. Your opinion about urgency does not.
3. `../02-contracts/extensions/README.md` section 1 decides core versus extension: if two apps must agree on the meaning, it is CORE. If only one app uses it, it is an EXTENSION in that app's own repo.
4. The migration order is law: server first, clients second, rules tighten last. See `../02-contracts/severity-policy.md` section 6.
5. `../AGENTS.md` hard constraints bind every step. In particular: never merge, never deploy, never edit `../06-changes/manifest.json` without its `CHG-*.md` file.
6. An existing `CHG-*.md` entry explains a past change. It never re-authorizes a new edit.

## 2. Hard constraints

| # | Constraint |
|---|---|
| 1 | NEVER edit `02-contracts/` without a filled request form at `../06-changes/templates/contract-request.md`, all 12 sections |
| 2 | ALWAYS classify the severity first. The severity decides the bump, the gate and the approval |
| 3 | ALWAYS run the extension test before touching the core. A field only one app reads does not belong here |
| 4 | NEVER write `../06-changes/manifest.json` without its `CHG-<nnn>-<slug>.md` file. Both in the same commit |
| 5 | NEVER bump `../VERSION` in the same commit as an unrelated edit |
| 6 | An S1 or S2 change without `migration.steps` cannot merge. No plan, no merge |
| 7 | NEVER add a `required` field without a MAJOR bump and a migration plan |
| 8 | NEVER remove or rename anything in the same release that stops writing it. Use the deprecation window, `severity-policy.md` section 7 |
| 9 | NEVER write a rule that depends on a claim the callables do not mint yet |
| 10 | NEVER send or define an error message string. Reason codes come from `../02-contracts/errors.json`, and only from there |
| 11 | NEVER mark a change adopted on behalf of an app. Adoption is that app's own PR |
| 12 | ALWAYS list `affectedApps` explicitly. An unlisted app is an app that breaks silently |
| 13 | ALWAYS end with `node 08-tools/validate-contract.ts` printing `contract valid` |

## 3. Read budget

| Your task | Read exactly these | Do not read |
|---|---|---|
| A2 add a field | The one schema, `../02-contracts/enums.json`, `../06-changes/templates/contract-request.md` | `../09-reference/`, other schemas |
| A3 add an enum value | `../02-contracts/enums.json`, the schemas that `$ref` it, `../02-contracts/severity-policy.md` | `../09-reference/` |
| A4 new collection | `../02-contracts/collections/README.md`, one existing schema as a pattern, `../03-rules/firestore.rules`, `../03-rules/firestore.indexes.json` | `../09-reference/` |
| A5 change a rule | `../03-rules/firestore.rules`, `../02-contracts/claims.json`, `../05-decisions/` | The PRDs |
| A6 change a Function | `../02-contracts/callables.json`, `../02-contracts/errors.json`, `../04-functions/src/index.ts` | `../09-reference/` |
| A7 new callable | `../02-contracts/callables.json`, `../02-contracts/errors.json`, `../02-contracts/claims.json`, `../02-contracts/topics.json` | `../09-reference/` |
| Every type | `../06-changes/templates/CHANGE-template.md`, `../06-changes/manifest.json` | `../09-reference/`, `../01-prds/` |

## 4. Procedure

### 4.0 The common path, every type

| Step | Do | Exact file or command |
|---|---|---|
| 1 | Classify the severity | `../02-contracts/severity-policy.md` section 1. S0 goes to `./emergency-changes.md` instead |
| 2 | Run the extension test | `../02-contracts/extensions/README.md` section 1. One app only means you stop here and use the extension path |
| 3 | Fill the request form | `../06-changes/templates/contract-request.md`, all 12 sections, opened as an issue |
| 4 | Make the contract edit | Sections 4.1 to 4.6 below |
| 5 | Bump `../VERSION` | S1 = MAJOR, S2 = MINOR, S3 = MINOR, description or doc fix = PATCH, S4 = none |
| 6 | Write the entry pair | `../06-changes/manifest.json` AND `../06-changes/CHG-<nnn>-<slug>.md`, same commit. The next free id is CHG-0008 |
| 7 | Recompose the schemas | `node 08-tools/build-schemas.ts`. **CI enforces this.** The composed schemas under `../02-contracts/collections/.composed/` must be committed, and the fingerprint in every app repo covers them |
| 8 | Validate | `node 08-tools/validate-contract.ts` and `node 08-tools/check-consistency.ts` |
| 9 | Report | The block in section 7 |

The `CHG-*.md` file is written from `../06-changes/templates/CHANGE-template.md`. An S1 uses `../06-changes/templates/BREAKING-template.md`, which forces the migration and rollback sections.

**Step 7 is not optional.** The strict runtime schemas the apps validate against are generated from the raw schemas plus the registered extensions. If they are not rebuilt and committed, the contract gate fails with "The composed schemas are out of date", and every app that syncs before the rebuild gets a fingerprint that records a strict schema that never shipped.

**The handoff to the apps is a separate action.** Making the change is A2 to A7. Getting it into the three app repos is A13, in `./publishing-a-contract-change.md`.

### 4.1 A2: add a field

1. Open the one schema that owns the field, for example `../02-contracts/collections/complaint.schema.json`.
2. Add the property. Use the JSON Schema draft 2020-12 vocabulary the other properties use: `type`, `minLength`, `minimum`, `format`, and a `description` that names who reads it and why.
3. If the field takes a fixed value set, do NOT write `"enum"` inline. That is A3. Schemas `$ref` `../02-contracts/enums.json` and never carry their own value list.
4. Decide `required`. Optional field = S2 or S3, MINOR bump. Required field = S1, MAJOR bump, migration steps, and a reason why existing documents cannot exist without it.
5. Check the write path. If a client writes the field, confirm the rule permits it. `../03-rules/firestore.rules` restricts `vans` updates with `.hasOnly(['lastLocation', 'status', 'batteryPct', 'currentTripId'])`. A new driver-writable van field means an A5 rule change too.
6. Record it in `../06-changes/manifest.json` under `affectedFields` as `{ "path": "complaints.assignedAt", "change": "added" }`.
7. Update the app side only after the contract edit lands. Apps that do not read the field do nothing. That is the point of an optional additive field.

Worked micro-example. `complaints.assignedAt`, a timestamp set by the assign callable:

| Item | Value |
|---|---|
| Schema | `../02-contracts/collections/complaint.schema.json`, `"assignedAt": { "type": ["string", "null"], "format": "date-time" }` |
| Required | No |
| Severity | S2 |
| Bump | 1.0.0 -> 1.1.0 |
| affectedApps | `["adminpanel"]` |
| Migration | Deploy the assign callable, then the panel. No rule change |

### 4.2 A3: add an enum value

1. Open `../02-contracts/enums.json`. Find the `$defs` entry, for example `complaint.status`.
2. Append the new value to the `"enum"` array. Never reorder or reword existing values.
3. Update the same value's `x-catalog` entry: its `usedBy` list and its `meaning`. The catalog is where a reader learns what the value means.
4. Find every schema that uses it: `grep -rn "enums.json#/\\$defs/complaint.status" ../02-contracts/collections/`. Every hit now accepts the new value. Read each hit and confirm that is intended.
5. Severity is S3, bump is MINOR, `affectedApps` is every app in the enum's `usedBy` chain.
6. Every app that switches on the enum must handle the new value with a default branch, not a crash. Write that expectation into the `CHG-*.md` file's migration steps.
7. NEVER remove a value. A removal is MAJOR and needs the deprecation window of `severity-policy.md` section 7.

### 4.3 A4: add a new collection

1. Create `../02-contracts/collections/<name>.schema.json`. Copy the file skeleton from an existing schema: `$schema` draft 2020-12, `$id` `https://safaaisaathi.contracts/collections/<name>.schema.json`, `title`, `description`, `type: object`.
2. Add the `x-` metadata the other schemas carry: `x-docId`, `x-writes`, `x-reads`, and `x-no-pii` or `x-pii`.
3. Add `properties` and `required`. `$ref` enums from `../02-contracts/enums.json`. Never inline an enum.
4. If the collection holds personal data, it follows the separate-collection rule in `../02-contracts/collections/README.md` section 3. A Firestore `get` returns the whole document, so a field-level restriction needs a separate collection, not a field-level rule. `staffPhones` exists for exactly this reason.
5. Add the row to the table in `../02-contracts/collections/README.md` section 1, with doc id pattern, writes, reads and status `NEW`.
6. Add the join keys to that same file's section 2 if the collection joins to wards, routes, vans, trips, complaints or staff.
7. Add a `match` block to `../03-rules/firestore.rules`. No rule means Firestore denies everything, which is the correct default for a Functions-only collection such as `vanDevices`. Add a permissive rule only when a client must write directly.
8. Add an entry to `../03-rules/firestore.indexes.json` only if a client query needs a composite index. The emulator does not enforce indexes, so a green emulator run proves nothing here.
9. Severity is S3 for a purely additive collection, S2 when a callable must write it. Bump is MINOR. Record `affectedCollections` with the new collection name.

### 4.4 A5: change a rule

1. Read `../03-rules/firestore.rules` whole. It is 48 lines. Also read `../03-rules/storage.rules` if the change touches media.
2. Identify the claim each new check relies on, from `../02-contracts/claims.json`. A rule may trust only a claim the server minted. Never a client parameter.
3. Make the smallest edit that closes the gap. Rules are the last thing you tighten, after the server half and the clients are deployed, per `../02-contracts/severity-policy.md` section 6.
4. If the rule change depends on new claims, the callable that mints them is a prerequisite. Sequence it in `migration.steps`.
5. Write the security note. `../AGENTS.md` constraint 2: a rules change without a security note in the `CHG-*.md` file cannot merge. The note states what the change allows, what it denies, and what it closes.
6. Verify in the emulator with `firebase emulators:start --only firestore`, and remember: the emulator does not enforce composite indexes. A green emulator run is not proof of index coverage.
7. Severity is typically S1. If the change closes an open hole, it is S0 and you follow `./emergency-changes.md` instead.

### 4.5 A6: change a Function

1. Open `../02-contracts/callables.json`. Find the callable under `x-callables`. Change `input`, `output` or `reasonCodes` THERE first, then implement. The contract is the spec, the code follows it.
2. Reason codes only from `../02-contracts/errors.json`. `errors.json` section `x-rules`: never send English text, never reuse a code for a new meaning, never show raw exceptions.
3. Implement in `../04-functions/src/index.ts`. Keep the file's existing style: `functions.https.onCall`, input type checks up front, `logger` calls for observability, `HttpsError` for transport-level failures.
4. Scheduled and trigger-driven Functions (`arrivalAlert`, `vanOfflineWatch`, `escalateComplaints`, `missedCollectionAlert`, `mergeDuplicates`, `checkComplaintRate`, `clearStaleVanMarkers`, `sendNotice`) are Function changes too. Their tuning knobs live in `../02-contracts/constants.json`. Change the constant, never a private copy in the code.
5. Severity: additive input or output = S2, MINOR. Removed or renamed input, output or reason code = S1, MAJOR. A refactor with no signature change = S4, no bump.
6. Build it: `cd 04-functions && npm run build`. Expected: no TypeScript errors, `lib/index.js` produced.
7. Deployment is a human action. You prepare the diff, a human runs `firebase deploy --only functions` from `04-functions/`.

### 4.6 A7: add a new callable

1. Add the entry to `../02-contracts/callables.json` under `x-callables`, with the same keys the others carry: `type: https.onCall`, `status: "NEW. Not implemented."`, `calledBy`, `purpose`, `input`, `output`, `reasonCodes`, `authority` with `reads` and `writes`.
2. Every `reasonCodes` entry must exist in `../02-contracts/errors.json`. If you need a new code, add it there first as its own recorded change.
3. Add the callable to `x-family`: `minting` for the session minters (`bindDeviceToVan`, `bootstrapUserSession`, `mintStaffToken`), `adminWrites` for the admin five (`setComplaintStatus`, `publishNotice`, `upsertDriver`, `upsertStaff`, `setVanDepot`).
4. New claim? Add it to `../02-contracts/claims.json` under `x-claims` and `x-minting.callables`, with the authoritative document named. `claims.json` `x-minting.never` is absolute: a client parameter is never a claim. The user app's `deviceId` is a claim, never a client parameter.
5. Push side effect? Add the push to `../02-contracts/topics.json` under `x-pushes`, and subscribe the receiving app in `x-topics`.
6. Identity-adjacent callables get a rate limit. Copy the `BIND_RATE_LIMIT_MAX` / `BIND_RATE_LIMIT_WINDOW_MIN` pattern from `../02-contracts/constants.json` group `binding`. A claim-minting callable without a rate limit is an oracle.
7. Every admin write callable MUST read `staff/{staffId}.active` live inside the call. That is Q5 instant revocation, the reason admin writes are callables at all. A token check alone is not enough, because a revoked token stays valid up to an hour.
8. Implement in `../04-functions/src/index.ts`. Transactions for race-prone writes, following the `bindDeviceToVan` and `startShift` authority blocks in `callables.json`.
9. Severity S2, bump MINOR, `affectedApps` = the callable's `calledBy`.

## 5. Do NOT

| Do NOT | Why |
|---|---|
| Do not edit the contract to match an app's existing bug | The app adopts the contract, never the reverse |
| Do not skip the request form because the change looks small | A description change is still a PATCH entry. Smallness is not an exemption |
| Do not add a field "just in case" | Every field is a permanent obligation for three apps |
| Do not put a permission inside a schema | `../02-contracts/README.md` rule 2. Permissions live in `../03-rules/` |
| Do not inline an enum in a schema | `../02-contracts/README.md` rule 1. Two copies of `"urban"` is how apps silently disagree |
| Do not create a new reason code for a UI wording | The server sends codes. The client owns words. `errors.json` `x-rules` |
| Do not tighten a rule before the clients that break are deployed | The loose old rules keep the old clients working. `severity-policy.md` section 6 |
| Do not deploy anything, ever | Deployment is a human action, `../AGENTS.md` constraint 8 |
| Do not merge, ever | A human merges, `../AGENTS.md` constraint 7 |

## 6. Self-verification

```bash
node 08-tools/validate-contract.ts
# expected: contract valid
node 08-tools/check-consistency.ts
# expected: its success line, no drift between schema and changelog
```

If either fails, the contract is broken and nothing downstream can be trusted. Fix and re-run.

Verify the composed schemas are current. CI fails the pull request otherwise, and every app that syncs before the rebuild gets a fingerprint that records a strict schema that never shipped.

```bash
cd 08-tools && node --experimental-strip-types build-schemas.ts && cd ..
git status --porcelain 02-contracts/collections/.composed/
# expected: no output
```

Verify the entry pair exists and agrees:

```bash
python3 - <<'PY'
import json,os
m=json.load(open("06-changes/manifest.json"))
last=m["changes"][-1]
print(last["id"], last["severity"], last["explainedIn"])
assert os.path.exists(os.path.join("06-changes", last["explainedIn"])), "explainedIn file missing"
print("pair ok")
PY
# expected: CHG-000n <severity> CHG-000n-<slug>.md then: pair ok
```

Verify the version bump matches the severity:

```bash
cat VERSION
grep -A1 '"contractVersion"' 06-changes/manifest.json | tail -4
```

Expected: `VERSION` holds the new value, and the last manifest entry's `to` equals it.

Verify this guide's own tables:

```bash
python3 - <<'PY'
import re
doc="07-guides/making-a-contract-change.md"
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

Expected: `07-guides/making-a-contract-change.md: TABLES=6 MALFORMED=0`. Any `BAD` line is a failure.

## 7. Report format

```
CONTRACT VERSION: <from VERSION, old -> new if changed>
FILES READ: <paths>
FILES CHANGED: <paths>
SEVERITY: <S0-S4>
CHANGE ID: <CHG-nnn, or none>
VALIDATION: <command> -> <pass/fail>
OPEN QUESTION: <one line, or none>
```

For an A2 run the block looks like:

```
CONTRACT VERSION: 1.0.0 -> 1.1.0
FILES READ: 02-contracts/collections/complaint.schema.json, 02-contracts/severity-policy.md, 06-changes/manifest.json
FILES CHANGED: 02-contracts/collections/complaint.schema.json, VERSION, 06-changes/manifest.json, 06-changes/CHG-0008-complaint-assigned-at.md
SEVERITY: S2
CHANGE ID: CHG-0008
VALIDATION: node 08-tools/validate-contract.ts -> pass | node 08-tools/check-consistency.ts -> pass
OPEN QUESTION: none
```
