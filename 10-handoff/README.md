---
id: handoff-readme
title: The Handoff Folder
status: active
owner: platform-owner
updated: 2026-11-02
contractVersion: "2.3.0"
audience: both
see_also:
  - ../07-guides/wiring-an-app-to-the-contract.md
  - ../07-guides/adopting-a-change.md
  - ../06-changes/manifest.json
  - ../06-changes/impact-matrix.md
---

# The Handoff Folder

**One prompt per app. Paste it into that app's harness. It is the whole brief.**

## The files

| File | The app | The repo |
|---|---|---|
| `PROMPT-driverapp.md` | The driver app | `safaaisaathi/driverapp` |
| `PROMPT-userapp.md` | The citizen app | `safaaisaathi/userapp` |
| `PROMPT-adminpanel.md` | The office panel | `safaaisaathi/adminpanel` |

## What a prompt is

**A prompt is not a document to read. It is a brief to execute.** It tells the app's harness what to do, in what order, and what "done" means.

**Every prompt has the same seven sections, in the same order.** The harness knows the shape before it reads the content.

| # | Section | What it is for |
|---|---|---|
| 1 | Authority order | What wins when two files disagree |
| 2 | Hard constraints | The rules that are never broken |
| 3 | Read budget | What to read, and what not to read |
| 4 | Procedure | The steps, in order |
| 5 | Do NOT | The traps, and why they are traps |
| 6 | Self-verification | The commands that prove it worked |
| 7 | Report format | The block the harness ends with |

## How to use one

1. Open the app's harness in the app's repo.
2. Paste the prompt file, top to bottom.
3. Let it run. It will ask for the platform repo path if it cannot find it.
4. The harness reports with the block in section 7. That block is the record.

**The platform repo must be a sibling of the app repo.** The prompts assume it, and they say `../platform`.

**One app per run.** Do not paste two prompts into one session.

## The order between the apps

**The prompts can run in parallel. The deploys cannot.**

| Phase | What | Who |
|---|---|---|
| 1 | The three harnesses run their app's work | The three app teams |
| 2 | The platform owner deploys the callables and the rules | A human |
| 3 | The strict rules go live, one switch | A human |

**The rules tighten last.** The switch procedure is `../03-rules/README.md` section 5.

## What changed for the office

**The backend moved.** There were three copies. There is now one, in the platform repo.

**The user app's stack is React, not Flutter.** The PRD says Flutter. The code is React. The office decides. See CHG-0016.

**The admin panel is a demo.** Twenty five screens, zero Firebase. It shows seeded data from the browser's own storage. CHG-0014 is the biggest job in the set.
