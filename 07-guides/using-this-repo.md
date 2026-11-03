---
id: using-this-repo
title: Using This Repo, the Thirteen Actions
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: harness
see_also:
  - ../AGENTS.md
  - ./making-a-contract-change.md
  - ../06-changes/README.md
---

# Using This Repo, the Thirteen Actions

**Every task in this repo is one of thirteen actions, A1 to A13. Find your action, read its row, do what its section says, and report with your action number.**

## 1. Authority order

1. The contract (`02-contracts/`) wins over every PRD and over every app repo.
2. `../AGENTS.md` is repo law. Its modes (READ, DRAFT, REVIEW) and its hard constraints bind all thirteen actions.
3. The severity policy in `../02-contracts/severity-policy.md` decides the bump, the gate and the approval for every action that changes anything.
4. The extension model in `../02-contracts/extensions/README.md` decides core versus app-owned before any core edit.
5. The action-specific guide wins over this file's summary. This file routes and summarizes. The guide is the detail.

## 2. Hard constraints

| # | Constraint |
|---|---|
| 1 | ALWAYS name your action number in the report. A report without an A-number is an unroutable task |
| 2 | NEVER run two actions in one pass. One action, one report, one report block |
| 3 | NEVER act outside your action's file set. Another agent may own those files |
| 4 | A1 and A12 are READ. They change nothing, ever |
| 5 | A2 to A9 are DRAFT in this repo only. They never touch an app repo |
| 6 | A10 runs in an app repo and never edits this one |
| 7 | A11 suspends every other action until it is recorded |
| 8 | A13 is one step per repo. Never edit the platform repo and an app repo in one pass |
| 9 | NEVER skip `../VERSION` in the report. Read it, state it, even when it did not move |

## 3. Read budget

| Your task | Read exactly these | Do not read |
|---|---|---|
| Find your action | This file's table in 4.0 | The whole file, before you know the action |
| Run your action | Its section here, then the guide it names | The other actions' sections |
| Check the law | `../AGENTS.md`, `../02-contracts/severity-policy.md` | `../09-reference/` |

## 4. Procedure

### 4.0 The action table

| Action | When | Who | Exact files | How CI verifies |
|---|---|---|---|---|
| A1 | Anyone asks what the backend does or means | Any harness, READ | None. Reads only | No gate. Cited paths must exist |
| A2 | A collection needs a new field | Platform owner harness | `02-contracts/collections/<x>.schema.json`, `VERSION`, `06-changes/manifest.json`, `06-changes/CHG-*.md` | `validate-contract.ts`, `check-consistency.ts` |
| A3 | A fixed value set needs a new value | Platform owner harness | `02-contracts/enums.json`, `VERSION`, the CHG pair | `validate-contract.ts` resolves every `$ref` |
| A4 | A new collection is needed | Platform owner harness | New `02-contracts/collections/<name>.schema.json`, `02-contracts/collections/README.md`, `03-rules/firestore.rules`, `03-rules/firestore.indexes.json`, `VERSION`, the CHG pair | `validate-contract.ts`, `check-consistency.ts`, `build-schemas.ts` |
| A5 | Who may read or write changes | Platform owner harness | `03-rules/firestore.rules` or `03-rules/storage.rules`, the CHG pair, `VERSION` when a contract shape moves | `check-consistency.ts`, plus the security note is checked by review |
| A6 | A Function's behavior or signature changes | Platform owner harness | `02-contracts/callables.json`, `04-functions/src/index.ts`, the CHG pair, `VERSION` when the signature moves | `validate-contract.ts`, `cd 04-functions && npm run build` |
| A7 | A new server action is needed | Platform owner harness | `02-contracts/callables.json` (+ `02-contracts/claims.json`, `02-contracts/topics.json` when relevant), `04-functions/src/index.ts`, the CHG pair, `VERSION` | `validate-contract.ts`, `check-consistency.ts`, `npm run build` |
| A8 | An app registered or updated its extension | Platform owner harness | `02-contracts/extensions/registry.json` | `check-consistency.ts` recomputes the app's extension hash |
| A9 | A field's deprecation window closed | Platform owner harness | The schema, `06-changes/manifest.json` deprecation block, the CHG pair, `VERSION` | `validate-contract.ts`, `check-consistency.ts` |
| A10 | An app implements a published change | App repo harness | The app's `.contract/adopted.json`, app source | `check-adoption.ts` in the app repo |
| A11 | A security hole or data loss | Platform owner harness + human | `03-rules/firestore.rules` or `04-functions/src/index.ts` first, then the CHG pair | `validate-contract.ts`, `check-consistency.ts`, every app blocked until confirm |
| A12 | Someone asks who is affected or who is behind | Any harness, READ | None. Reads `06-changes/` | `check-adoption.ts` output, `impact-matrix.md` regenerated |
| A13 | A finished contract change must reach the app repos | Platform owner harness, then one app harness at a time | `02-contracts/collections/.composed/`, `<app>/.contract/vendor/`, `<app>/.contract/fingerprint.json`, `<app>/.contract/adopted.json`, `06-changes/impact-matrix.md` | The composed schemas are committed, the fingerprint matches the vendored bytes, `check-adoption.ts --write` is idempotent |

### A1: Answer a question about the backend

| Item | Value |
|---|---|
| When | A harness or a human asks what a field, code, claim or rule means |
| Who | Any harness, READ mode |
| Files | None changed. Reads per the question's row in the vocabulary map |
| CI | None. The answer must cite paths that exist |

Follow `./reading-the-contract.md`. Do not propose values while answering.

### A2: Add a field

| Item | Value |
|---|---|
| When | A PRD or a feature needs a new field on an existing collection |
| Who | Platform owner harness, DRAFT |
| Files | The one schema, `../VERSION`, the CHG pair |
| CI | `validate-contract.ts` prints `contract valid`; `check-consistency.ts` agrees |

Full procedure: `./making-a-contract-change.md` section 4.1. Extension test first. Optional field = MINOR, required field = MAJOR with migration.

### A3: Add an enum value

| Item | Value |
|---|---|
| When | A fixed value set grows, for example a new complaint category |
| Who | Platform owner harness, DRAFT |
| Files | `02-contracts/enums.json`, the CHG pair, `../VERSION` |
| CI | `validate-contract.ts` resolves every schema `$ref` against the new value |

Full procedure: `./making-a-contract-change.md` section 4.2. Every app that switches on the enum needs a default branch. Removal is never part of A3.

### A4: Add a new collection

| Item | Value |
|---|---|
| When | A feature needs documents that fit no existing collection |
| Who | Platform owner harness, DRAFT |
| Files | New `02-contracts/collections/<name>.schema.json`, `02-contracts/collections/README.md`, `03-rules/firestore.rules`, `03-rules/firestore.indexes.json`, the CHG pair, `../VERSION` |
| CI | `validate-contract.ts`, `check-consistency.ts`, and `build-schemas.ts` regenerates the composed schema |

Full procedure: `./making-a-contract-change.md` section 4.3. Default deny in the rules. PII means a separate collection, decided now.

### A5: Change a rule

| Item | Value |
|---|---|
| When | Who may read or write must change, or a hole must close |
| Who | Platform owner harness, DRAFT. Deploy is a human |
| Files | `03-rules/firestore.rules` or `03-rules/storage.rules`, the CHG pair with the security note, `../VERSION` when a contract shape moves |
| CI | `check-consistency.ts`. The emulator cannot prove index coverage |

Full procedure: `./making-a-contract-change.md` section 4.4. Open hole means A11 instead.

### A6: Change a Function

| Item | Value |
|---|---|
| When | A callable's behavior changes, or a trigger or scheduled Function needs a new rule |
| Who | Platform owner harness, DRAFT. Deploy is a human |
| Files | `02-contracts/callables.json`, `04-functions/src/index.ts`, the CHG pair, `../VERSION` when the signature moves |
| CI | `validate-contract.ts`, and `cd 04-functions && npm run build` compiles clean |

Full procedure: `./making-a-contract-change.md` section 4.5. Constants come from `../02-contracts/constants.json`, never from private copies.

### A7: Add a new callable

| Item | Value |
|---|---|
| When | A write needs a live-document authority, a transaction, or a server side effect |
| Who | Platform owner harness, DRAFT |
| Files | `02-contracts/callables.json`, `04-functions/src/index.ts`, plus `02-contracts/claims.json` for a new claim and `02-contracts/topics.json` for a push, the CHG pair, `../VERSION` |
| CI | `validate-contract.ts`, `check-consistency.ts`, `npm run build` |

Full procedure: `./making-a-contract-change.md` section 4.6. Admin writes check `staff/{staffId}.active` live. Identity callables get the `BIND_RATE_LIMIT_MAX` pattern.

### A8: Register an app extension

| Item | Value |
|---|---|
| When | An app added or changed its own extension file and needs it recognized |
| Who | The app owner opens the issue. The platform owner harness mirrors and registers |
| Files | `02-contracts/extensions/<app>.json` (the registered mirror) and `02-contracts/extensions/registry.json` |
| CI | `check-consistency.ts` proves the mirror's hash and the app's file's hash both match the registry. `build-schemas.ts` recomposes |

**Two files move together.** Copy the app's own file over `02-contracts/extensions/<app>.json` with `cp`, so the mirror is byte identical. Then compute the hash of that mirror and put it in the registry with the new `extensionVersion`. If only one of the two moves, the hash check fails.

No core version bump. The other two apps are not notified. Full procedure: `../02-contracts/extensions/README.md` section 8.

### A9: Deprecate and remove a field

| Item | Value |
|---|---|
| When | The deprecation window from an earlier S1 change has closed |
| Who | Platform owner harness, DRAFT |
| Files | The schema (property removed), `06-changes/manifest.json` deprecation block updated, the CHG pair, `../VERSION` bumps MAJOR now |
| CI | `validate-contract.ts`, `check-consistency.ts` |

The window is at least one release cycle of the slowest affected app. Inside the window both fields exist and the server writes the new one. At the end the old field drops. Full policy: `../02-contracts/severity-policy.md` section 7.

### A10: Adopt a published change

| Item | Value |
|---|---|
| When | A change in `06-changes/manifest.json` lists your app in `affectedApps` |
| Who | App repo harness, in its own repo |
| Files | The app's `.contract/adopted.json`, the app source |
| CI | `check-adoption.ts` fails while an S0 or S1 change is behind |

Full procedure: `./adopting-a-change.md`. Report with the app block, not this repo's block.

### A11: Make an emergency S0 change

| Item | Value |
|---|---|
| When | A security hole is open or data is being lost |
| Who | Platform owner harness plus a human who deploys |
| Files | `03-rules/firestore.rules` or `04-functions/src/index.ts` first, then `06-changes/manifest.json` with `emergency: true`, the CHG file |
| CI | `validate-contract.ts`, `check-consistency.ts`, and every app blocked until it confirms |

Full procedure: `./emergency-changes.md`. Deploy first, record in the same window.

### A12: Check drift, who is affected and who is behind

| Item | Value |
|---|---|
| When | Before a release, at standup, or before starting an unrelated change |
| Who | Any harness, READ mode |
| Files | None changed. Reads `06-changes/manifest.json`, `06-changes/adoption.json`, `06-changes/impact-matrix.md` |
| CI | `check-adoption.ts` output is the answer. `impact-matrix.md` is regenerated from the manifest, never edited by hand |

Run:

```bash
node 08-tools/check-adoption.ts
# expected: one line per app, or the failing S0/S1 lines
```

The answer to "who is affected by CHG-nnnn" is the entry's `affectedApps`. The answer to "did they implement it" is the app's status and progress in `06-changes/adoption.json`, which reports each app's own `.contract/adopted.json`.

### A13: Publish a change to the app repos

| Item | Value |
|---|---|
| When | A contract change is merged on `main` and the app repos must catch up |
| Who | Platform owner harness for steps 1, 2 and 5. One app harness at a time for steps 3 and 4 |
| Files | `02-contracts/collections/.composed/`, `<app>/.contract/vendor/`, `<app>/.contract/fingerprint.json`, `<app>/.contract/adopted.json`, `06-changes/impact-matrix.md` |
| CI | The composed schemas must be committed. The fingerprint must match the vendored bytes. `check-adoption.ts --write` must be idempotent |

Full procedure: `./publishing-a-contract-change.md`. One step per repo, one pull request per step.

**The five steps, and who runs each.**

| Step | Repo | Command or action | Writes |
|---|---|---|---|
| 1. Make | Platform | `./making-a-contract-change.md` section 4.0 | files |
| 2. Compose | Platform | `node 08-tools/build-schemas.ts` | files |
| 3. Sync | App | `node <platform>/08-tools/sync-contract.ts .` | files |
| 4. Adopt | App | `./adopting-a-change.md`, then `bump-contract.ts` | files |
| 5. Matrix | Platform | `node 08-tools/check-adoption.ts --write` | files |

**Two rules that are not negotiable.** Compose before the sync, because the fingerprint covers the composed schemas. And bump the version pin after the adoption work, because the pin is a claim about what the app did.

## 5. Do NOT

| Do NOT | Why |
|---|---|
| Do not invent a fourteenth action | If a task fits no action, it is A1 plus an open question, or a new action needs the platform owner's decision |
| Do not treat this file as the procedure | It routes. The named guide is the procedure |
| Do not run A10 from this repo | Adoption edits the app's own files, from the app's own PR |
| Do not let A12 become an edit session | Reading the drift and fixing the drift are two actions with two reports |
| Do not bundle an A2 with an A3 in one CHG | One change, one entry, one severity. Bundling hides the affected apps |

## 6. Self-verification

Verify the file carries all thirteen actions:

```bash
grep -c "^### A" 07-guides/using-this-repo.md
# expected: 13
```

Verify the action table has one row per action:

```bash
grep -c "^| A" 07-guides/using-this-repo.md
# expected: at least 13
```

Verify every guide it names exists:

```bash
for f in reading-the-contract making-a-contract-change adopting-a-change emergency-changes; do test -f "07-guides/$f.md" && echo "OK $f" || echo "MISSING $f"; done
```

Expected: four `OK` lines.

Verify this guide's tables:

```bash
python3 - <<'PY'
import re
doc="07-guides/using-this-repo.md"
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

Expected: `07-guides/using-this-repo.md: TABLES=18 MALFORMED=0`. Any `BAD` line is a failure.

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

The action number goes on the first line of the report body, before the block, for example `ACTION: A2`. The block itself stays exactly as defined here.
