---
id: reading-the-contract
title: Reading the Contract
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: harness
see_also:
  - ../02-contracts/README.md
  - ../02-contracts/collections/README.md
  - ./using-this-repo.md
---

# Reading the Contract

**You are answering a question about the backend. Read the one contract file that owns the answer. Quote it. Edit nothing.**

This is a READ task. The report says `SEVERITY: S4` and `CHANGE ID: none`.

## 1. Authority order

1. The contract (`02-contracts/`) wins over every PRD and over every app repo.
2. `../02-contracts/enums.json` is the only place an enum value exists. A schema `$ref`s it, it never repeats it.
3. `../02-contracts/collections/*.schema.json` decides what a document looks like. `../03-rules/firestore.rules` decides who may touch it. A schema never carries a permission.
4. `../05-decisions/` explains why. It never overrides.
5. `../06-changes/CHANGELOG.md` tells you what changed recently. It never overrides the current files.
6. `../09-reference/` is background. Never quote it as law.

## 2. Hard constraints

| # | Constraint |
|---|---|
| 1 | NEVER invent a name. If the value is not in `../02-contracts/`, the answer is "not defined in the contract" |
| 2 | ALWAYS cite the file path that proves the answer. An answer without a path is a guess |
| 3 | ALWAYS copy values exactly. `98XXXXXX10`, not "98 then Xs then 10" |
| 4 | NEVER answer from a PRD, from memory, or from `../09-reference/` |
| 5 | NEVER edit while answering. READ mode. A question is not a change request |
| 6 | If the answer needs a new value, stop and route to `./making-a-contract-change.md` |
| 7 | When two files disagree, say so, name both, and name the winner per section 1. Do not average them |

## 3. Read budget

| Your task | Read exactly these | Do not read |
|---|---|---|
| A field's type, format or required-ness | `../02-contracts/collections/<x>.schema.json` | Other schemas |
| Which collections exist and who reads them | `../02-contracts/collections/README.md` | All 14 schemas |
| An enum value | `../02-contracts/enums.json` | Schemas, unless checking `$ref` usage |
| A threshold, radius, limit or pattern | `../02-contracts/constants.json` | The schemas |
| A custom claim | `../02-contracts/claims.json` | The rules file |
| A topic or a push payload | `../02-contracts/topics.json` | The Functions source |
| A callable's input, output or reason codes | `../02-contracts/callables.json` | `../04-functions/src/index.ts` |
| A reason code's meaning and copy key | `../02-contracts/errors.json` | The callables file |
| Who may read or write | `../03-rules/firestore.rules`, `../03-rules/storage.rules` | The schemas |
| A colour, spacing, radius or font | `../02-contracts/design-tokens.json` | The app repos |
| Why a decision was made | `../05-decisions/` (ADR index), then the change entry in `../06-changes/` | `../09-reference/` |
| What changed recently | `../06-changes/CHANGELOG.md`, `../06-changes/manifest.json` | `../09-reference/` |

## 4. Procedure

1. Classify the question with the table in section 3. Find the row, not a nearby row.
2. Read only that file. Use the line numbers from `grep` to jump straight to the answer:

```bash
grep -n "phoneMasked" ../02-contracts/collections/driver.schema.json
grep -n "ARRIVAL_ALERT_RADIUS_M" ../02-contracts/constants.json
grep -n "arrivalAlert" ../02-contracts/topics.json
```

3. Compose the answer in this shape:

```text
ANSWER: <the exact value or rule>
SOURCE: <repo-relative file path>, <the field or section name>
NOT DEFINED: <one line, only when the contract has no answer>
NEXT STEP: none | open a contract request via 06-changes/templates/contract-request.md
```

4. If the contract has no answer, write `NOT DEFINED` and stop. Do not propose a value in the answer itself.
5. If the question is really a change request ("can we add X"), say so and route to `./making-a-contract-change.md`. Do not start editing.

### 4.1 The vocabulary map

| A question about | The value lives in |
|---|---|
| Collections, doc ids, join keys | `../02-contracts/collections/README.md` |
| Fields, types, required lists | `../02-contracts/collections/*.schema.json` |
| Frozen enums and their catalog | `../02-contracts/enums.json` |
| Numbers that must match everywhere | `../02-contracts/constants.json` |
| Claims: what is in a token | `../02-contracts/claims.json` |
| Push topics and payloads | `../02-contracts/topics.json` |
| Callable signatures | `../02-contracts/callables.json` |
| Reason codes | `../02-contracts/errors.json` |
| Design tokens | `../02-contracts/design-tokens.json` |
| Permissions | `../03-rules/firestore.rules`, `../03-rules/storage.rules` |
| Who is behind on a change | `../06-changes/adoption.json`, `../06-changes/impact-matrix.md` |

### 4.2 The two questions that look like reading but are not

| The question | Why it is not READ |
|---|---|
| "Can the driver app also write `vans.depot`?" | It asks for a rules change. Route to `./making-a-contract-change.md`, A5 |
| "Why does `drivers` have `phoneMasked` and not `phone`?" | It is answered by `../06-changes/manifest.json` CHG-0002. Quote the entry, do not re-derive it |

## 5. Do NOT

| Do NOT | Why |
|---|---|
| Do not summarize a schema from memory | A wrong field name in an answer becomes a wrong field name in code |
| Do not read `../09-reference/` to "be thorough" | It is 2883 lines. The contract answers the question in one file |
| Do not propose values while answering | That mixes READ with DRAFT. Two modes, two reports |
| Do not quote a JSON file's line numbers as part of the value | Line numbers move. Field names do not |
| Do not answer "it depends" without naming the two branches | Name both branches and the file that decides each |

## 6. Self-verification

Verify every path you cited exists:

```bash
for f in 02-contracts/README.md 02-contracts/enums.json 02-contracts/constants.json 02-contracts/claims.json 02-contracts/topics.json 02-contracts/callables.json 02-contracts/errors.json 02-contracts/design-tokens.json 02-contracts/collections/README.md 03-rules/firestore.rules 03-rules/storage.rules; do test -f "$f" && echo "OK $f" || echo "MISSING $f"; done
```

Expected: eleven `OK` lines, zero `MISSING` lines.

Verify the table you read from is parseable:

```bash
python3 - <<'PY'
import re
doc="07-guides/reading-the-contract.md"
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

Expected: `07-guides/reading-the-contract.md: TABLES=5 MALFORMED=0`. Any `BAD` line is a failure.

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

For a pure READ task the block is:

```
CONTRACT VERSION: 1.0.0
FILES READ: 02-contracts/constants.json, 02-contracts/collections/trip.schema.json
FILES CHANGED: none
SEVERITY: S4
CHANGE ID: none
VALIDATION: table-check 07-guides/reading-the-contract.md -> pass
OPEN QUESTION: none
```
