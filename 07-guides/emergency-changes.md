---
id: emergency-changes
title: Emergency Changes, the S0 Playbook
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: harness
see_also:
  - ../02-contracts/severity-policy.md
  - ../03-rules/firestore.rules
  - ../06-changes/README.md
---

# Emergency Changes, the S0 Playbook

**A security hole is open, or data is being lost. Deploy first, record in the same window. Everything else stops.**

The harness never deploys. The harness prepares the minimal fix, hands the deploy command to a human, and records the change. The human runs the deploy.

## 1. Authority order

1. The deployed fix wins over every record. A version number does not close a hole. `../02-contracts/severity-policy.md` section 2.1.
2. The contract (`02-contracts/`) wins over every PRD and over every app repo. Even in an emergency, the fix must match the contract, or the contract gets an S0 entry too.
3. The two-person rule: S0 needs the platform owner plus one other. A solo S0 is not authorized, even for a one-line rules change.
4. The record is not optional. An undocumented security fix is a vulnerability with extra steps.
5. `../AGENTS.md` constraint 8 stands: the harness never deploys. The human runs the command.

## 2. Hard constraints

| # | Constraint |
|---|---|
| 1 | Deploy the fix FIRST. Paperwork second. Both inside the same window, the same day |
| 2 | NEVER let the harness run `firebase deploy`. The human runs it. The harness hands over the command and the diff |
| 3 | An S0 entry carries `severity: "S0"` and `emergency: true` in `../06-changes/manifest.json`. The log must show it skipped the normal order |
| 4 | Version bump is PATCH or none. Never MAJOR mid-incident |
| 5 | Every app is BLOCKED until it confirms the fix. Record `urgency: "immediate"` |
| 6 | The fix diff touches one file if possible. `../03-rules/firestore.rules` or `../04-functions/src/index.ts`. Scope creep during an incident is how the second hole opens |
| 7 | ALWAYS write the rollback line: the exact previous state, and the command to restore it |
| 8 | NEVER ship the fix with English error text or a new reason code. The vocabulary of `../02-contracts/errors.json` still applies |
| 9 | NEVER wait for a request form before the deploy. The form is filled during the record phase |

## 3. Read budget

| Your task | Read exactly these | Do not read |
|---|---|---|
| Confirm the hole | The one rules block or Function at fault, `../02-contracts/claims.json` | The whole rules file history |
| Draft the fix | `../03-rules/firestore.rules` or `../04-functions/src/index.ts`, `../02-contracts/severity-policy.md` section 2.1 | `../09-reference/` |
| Record the change | `../06-changes/templates/CHANGE-template.md`, `../06-changes/manifest.json` | The PRD folders |
| Tell the apps | `../06-changes/adoption.json`, to name the owners | Anything else |

## 4. Procedure

### 4.0 The clock

| Minute | Do | Who |
|---|---|---|
| 0 | Confirm the hole is real. Screenshot or log line as evidence | Harness |
| 1 | Declare S0. Two people acknowledge | Platform owner + one other |
| 5 | Freeze all other work in all three repos | Everyone |
| 15 | Minimal fix drafted, diff posted | Harness |
| 30 | Fix deployed by a human, deployment output pasted into the incident thread | Human |
| 60 | Entry pair recorded, apps notified | Harness |
| Same day | Apps confirm, gates re-open or stay blocked per app | App owners |

### 4.1 Step 1: confirm and freeze

Name the hole in one line, with the exact rule or Function at fault. Example, the class this playbook exists for:

```text
/drivers/{code} allows read: if request.auth != null. Any signed-in caller
can read any driver's document. The raw phone must not be reachable.
```

Freeze means: no other PR merges, no other contract edit, no release. The freeze is announced in the issue thread, and it ends only when every app confirms.

### 4.2 Step 2: draft the minimal fix

For a rules hole, edit `../03-rules/firestore.rules`. The fix that matches the phone-leak example is the claim-scoped read:

```text
match /drivers/{code} {
  allow read: if request.auth != null
    && request.auth.token.driverId == code;
}
```

A claim-scoped rule depends on the claim being minted by `bindDeviceToVan`. If the claim is not yet minted for all drivers, sequence it: deploy the callable first, tighten the rules last. That is `../02-contracts/severity-policy.md` section 6, and it still applies mid-incident.

For a Functions hole, edit `../04-functions/src/index.ts`. Delete the vulnerable path whole. The known example is the `DEMO_SEED_BYPASS` branch inside `setDriverPin` and the whole `verifyDriverPin` flow, both scheduled for deletion by CHG-0006. If such a path is ever found live, the fix is deletion, not flagging.

### 4.3 Step 3: hand the deploy to a human

Post the diff and the exact command. Never run it:

```bash
# rules fix, run by the human from the platform repo root:
firebase deploy --only firestore:rules --project safaaisaathi-63a87
# functions fix, run by the human from 04-functions/:
cd 04-functions && npm run build && firebase deploy --only functions --project safaaisaathi-63a87
```

The human pastes the deployment output into the incident thread. `Deploy complete!` is the go signal for the record phase.

### 4.4 Step 4: verify the fix is live

```bash
# the human or the harness re-reads the deployed state:
cat 03-rules/firestore.rules | grep -n "driverId"
# expected: the claim-scoped line present
```

For a rules fix, the human spot-checks in the Firebase console: Rules tab shows the new content and the publish timestamp of this incident. For a Functions fix, the human runs the previously vulnerable call and records the new rejection.

### 4.5 Step 5: record, in the same window

| # | Do | Exact file |
|---|---|---|
| 1 | Manifest entry | `../06-changes/manifest.json`, next free id, `severity: "S0"`, `emergency: true`, `urgency: "immediate"`, `breaking: true` |
| 2 | Explanation file | `../06-changes/CHG-<nnn>-<slug>.md` from `../06-changes/templates/CHANGE-template.md`. Sections that cannot be skipped: What breaks, Rollback |
| 3 | Version | `../VERSION`, PATCH bump or none |
| 4 | Migration steps | One per app action. "Confirm the fix does not break the driver read flow", for example |
| 5 | Affected apps | All three when the hole was a general read hole. Otherwise the exact list |

The rollback line lives in the `CHG-*.md` file: the previous rules content in one sentence, and the restore command for the human.

### 4.6 Step 6: notify and track the block

Post one line per app owner, naming the change id and the confirmation they owe. Every app is blocked until it confirms. Update `../06-changes/adoption.json` only through each app's own adoption run, never by hand.

If the root cause is structural, open the ADR in `../05-decisions/` the same day. An incident that ends without a structural note repeats.

## 5. Do NOT

| Do NOT | Why |
|---|---|
| Do not wait for the request form before the deploy | The form is paperwork. The hole is open now |
| Do not "write it up after the weekend" | An undocumented security fix is a vulnerability with extra steps |
| Do not fix two things in one S0 | Scope creep opens the second hole. Second hole gets its own S0 |
| Do not bump MAJOR mid-incident | App repos pick up a MAJOR on their own schedule. The incident does not wait for them |
| Do not let the harness deploy | Deployment is a human action. Always |
| Do not close the incident before every app confirms | The client-side workaround is invisible from the platform. Only the app owner knows |
| Do not reuse an old CHG id | The log must stay append-only and traceable |

## 6. Self-verification

```bash
python3 - <<'PY'
import json
m=json.load(open("06-changes/manifest.json"))
s0=[c for c in m["changes"] if c["severity"]=="S0"]
assert s0, "no S0 entry recorded"
for c in s0:
    print(c["id"], c["emergency"], c["urgency"])
print("S0 record ok")
PY
# expected: CHG-000n True immediate then: S0 record ok
```

Verify the explanation file exists and carries a rollback section:

```bash
ls 06-changes/CHG-*.md | tail -1
grep -c "Rollback" 06-changes/CHG-000*.md
# expected: at least one hit in the S0 file
```

Verify the version is PATCH-or-none against the previous value:

```bash
cat VERSION
# expected: 1.0.1 or 1.0.0, never 2.0.0 mid-incident
```

Verify this guide's tables:

```bash
python3 - <<'PY'
import re
doc="07-guides/emergency-changes.md"
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

Expected: `07-guides/emergency-changes.md: TABLES=5 MALFORMED=0`. Any `BAD` line is a failure.

## 7. Report format

```
CONTRACT VERSION: <from VERSION, old -> new if changed>
FILES READ: <paths>
FILES CHANGED: <paths>
SEVERITY: S0
CHANGE ID: <CHG-nnn>
VALIDATION: <command> -> <pass/fail>
OPEN QUESTION: <one line, or none>
```

The `VALIDATION` line names the incident checks, for example `node 08-tools/validate-contract.ts -> pass | S0 record script -> pass`. The `OPEN QUESTION` line carries anything the two-person review must settle, for example `drivers read rule needs the bindDeviceToVan rollout finished before it can tighten further`.
