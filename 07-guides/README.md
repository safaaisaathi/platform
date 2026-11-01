---
id: guides-readme
title: The Guides Router
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: harness
see_also:
  - ../AGENTS.md
  - ../02-contracts/README.md
  - ./making-a-contract-change.md
---

# The Guides Router

**Find your task in the table. Read the one file it names. Follow that file's section 4. End your message with that file's section 7 block.**

This folder is procedure. The data lives in `../02-contracts/`. The permissions live in `../03-rules/`. A guide never overrides the contract.

## 1. Authority order

1. The contract (`02-contracts/`) wins over every PRD and over every app repo.
2. `../03-rules/` wins over anything that claims who may read or write.
3. `../AGENTS.md` is repo law. It wins over a guide.
4. The guide for your task wins over every other guide. Never merge two procedures into one run.
5. `../05-decisions/` explains why. It never overrides.
6. `../09-reference/` is background reading. It is never a source of truth.

On a conflict between a guide and `../02-contracts/`, the contract wins and the guide gets a change request. Never resolve a conflict by editing the winner to match the loser.

## 2. Hard constraints

| # | Constraint |
|---|---|
| 1 | ALWAYS find your task row before you read anything else. The row names exactly one guide |
| 2 | NEVER read `../09-reference/` to start a task. Guides name the small file set you need |
| 3 | NEVER run two guides in one pass. Finish one, report, then start the next |
| 4 | NEVER edit a file your guide does not name |
| 5 | ALWAYS check `../VERSION` before and after a change task. Report it even when it did not move |
| 6 | ALWAYS end with the section 7 block of the guide you followed. A report without the block is an unfinished task |
| 7 | NEVER invent a field, enum value, claim, topic, callable or reason code. If it is not in `../02-contracts/`, it does not exist |
| 8 | NEVER merge, NEVER deploy. Both are human actions |

## 3. Read budget

| Your task | Read exactly these | Do not read |
|---|---|---|
| Route yourself | This file, section 4 only | Any other guide, before you know your task |
| Follow a guide | That guide, all 7 sections | The other 10 guides |
| Check the law behind a guide | `../AGENTS.md`, `../02-contracts/README.md` | `../09-reference/` |

## 4. Procedure

| If your task is | Read | Then |
|---|---|---|
| Answer a question about the data, the permissions or the vocabulary | `./reading-the-contract.md` | Answer with file paths and exact values. Edit nothing |
| Add, change or remove a field, an enum value, a collection, a rule, a Function or a callable | `./making-a-contract-change.md` | Find your A-number in its section 4. Follow it end to end |
| Build a new feature that needs new data or a new server action | `./adding-a-new-feature.md` | Open the contract request first. Build after the contract edit lands |
| Implement a published change inside an app repo | `./adopting-a-change.md` | Update `.contract/adopted.json` as you go. Report with the app block |
| A security hole is open, or data is being lost | `./emergency-changes.md` | Deploy first, record in the same window. Everything else stops |
| Give a teammate Firebase access, or react to a leaked key | `./firebase-access-and-keys.md` | Share web config freely. Never share a service account key |
| Decide where a write belongs: rule, Function or device | `./backend-split.md` | Apply the three placement rules. Record the verdict in the change entry |
| Build or debug the arrival alert | `./arrival-notification-flow.md` | Walk the nine steps. Check every guard before you trust a result |
| Build a screen, a widget or a push handler | `./common-ui-patterns.md` | Use the shared token names. Keep copy inside the app |
| You do not know which action your task is | `./using-this-repo.md` | Find your A-number there, then come back to this table |

If your task is not in this table, read `../02-contracts/README.md` first. Do not guess.

## 5. Do NOT

| Do NOT | Why |
|---|---|
| Do not start editing because the task "sounds like" a known type | The router exists because guessing routes work to the wrong files |
| Do not read the whole repo to feel safe | Read budgets exist. The blueprint is 2883 lines and one enum change needs none of it |
| Do not answer a question from memory of a PRD | The contract is the memory. Quote it |
| Do not copy a procedure from another guide into yours | Procedures differ on purpose. A2 and A7 differ in their gates |
| Do not skip section 6 of a guide | Its checks are cheap and they catch the common failures |

## 6. Self-verification

```bash
python3 - <<'PY'
import re
doc="07-guides/README.md"
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

Expected output: `07-guides/README.md: TABLES=4 MALFORMED=0`. Any `BAD` line is a failure. Fix the table and re-run.

Also verify every guide named in the table exists:

```bash
for f in reading-the-contract making-a-contract-change adding-a-new-feature adopting-a-change emergency-changes firebase-access-and-keys backend-split arrival-notification-flow common-ui-patterns using-this-repo; do test -f "07-guides/$f.md" && echo "OK $f" || echo "MISSING $f"; done
```

Expected: ten `OK` lines, zero `MISSING` lines.

## 7. Report format

End your message with exactly this block:

```
CONTRACT VERSION: <from VERSION, old -> new if changed>
FILES READ: <paths>
FILES CHANGED: <paths>
SEVERITY: <S0-S4>
CHANGE ID: <CHG-nnn, or none>
VALIDATION: <command> -> <pass/fail>
OPEN QUESTION: <one line, or none>
```
