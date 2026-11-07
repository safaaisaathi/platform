---
id: blocked-on-platform
title: Blocked on the Platform
status: active
owner: platform-owner
updated: 2026-11-07
contractVersion: "2.3.0"
audience: harness
see_also:
  - ../AGENTS.md
  - ./README.md
  - ./firebase-access-and-keys.md
  - ../.github/ISSUE_TEMPLATE/blocked-on-platform.md
---

# Blocked on the Platform

**One issue carries a block from the moment it stops you to the moment it is gone. The platform writes the resolution, not the reporter.**

This guide is for the harness on both sides. The harness in an app repo opens the issue. The harness in this repo decides, fixes, and writes the resolution comment.

The issue is the record. A chat message is a shortcut, never the record.

## 1. Authority order

1. The contract (`../02-contracts/`) wins over everything.
2. `../03-rules/` wins over anything that claims who may read or write.
3. `../AGENTS.md` is repo law. It wins over this guide.
4. `./firebase-access-and-keys.md` wins on secrets and credentials.
5. This guide wins on how a block is reported, decided and recorded.
6. A closed issue with no resolution comment is not resolved. It is abandoned.

## 2. Hard constraints

| # | Constraint |
|---|---|
| 1 | An issue closes only after the platform writes the resolution comment |
| 2 | The reporter never writes the resolution. The decision is not the reporter's to record |
| 3 | The platform decides the approach. It may refuse the request, and it must say why |
| 4 | A refused request still gets a resolution comment. "No" is a decision, not silence |
| 5 | A secret VALUE never enters an issue, a chat, a commit or a command argument. Only the NAME |
| 6 | A disagreement becomes a new issue that cites the first one. It never becomes a comment fight |
| 7 | The app repo is never edited to work around a platform block before the platform answers in the issue |

## 3. Read budget

| Your task | Read exactly this |
|---|---|
| You are the app harness and you are blocked | This file, sections 4.1 to 4.3, and 4.10 if a secret is involved |
| You are the platform harness and an issue arrived | This file, sections 4.4 to 4.7 |
| You disagree with a decision | This file, section 4.9 |
| You need a key or a token | This file, section 4.10, then `./firebase-access-and-keys.md` |

## 4. Procedure

### 4.1 Which side are you on

| If | Then |
|---|---|
| You work in `driverapp`, `userapp` or `adminpanel` and you cannot move | Sections 4.2 and 4.3 |
| You work in this repo and a blocked issue is assigned to you | Sections 4.4 to 4.7 |
| You are the reporter and the issue is closed | Section 4.8 |
| You think a decision is wrong | Section 4.9 |
| You are missing a key or a token | Section 4.10 |

### 4.2 The app harness triages first

Five minutes, three checks. These remove most false blocks.

| # | Check | How |
|---|---|---|
| 1 | Is it your own code | Run the failing path on the emulator, not on the live project |
| 2 | Is the contract silent | Search `02-contracts/` for the field, the reason code, the callable. If it is there, the platform is not blocking you |
| 3 | Is it already answered | Search the closed issues in this repo for the same error line |

Still blocked after the three? Open the issue.

### 4.3 The app harness opens one issue

```
gh issue create --repo safaaisaathi/platform --template blocked-on-platform.md
```

Fill sections 1 to 9. Leave section 10 empty. Section 10 belongs to the platform.

The evidence line is the one that saves a day. Paste the command and the first ten lines of its output, with no secret value in it. A report without evidence costs a round trip.

If you cannot use GitHub, tell the platform owner directly. The platform owner still opens the issue and writes the resolution there. The record does not move to chat.

### 4.4 The platform harness triages the issue

Read the issue, then answer in one of four ways, in a comment, the same day.

| Answer | What it means |
|---|---|
| Not a platform block | The block is in the app repo. Say where, in one line, and close with a resolution comment that says so |
| Platform bug | The contract, the rules or the Functions are wrong. Fix it, then resolve |
| Contract request | The contract has no such field or callable. Hand it to `./adding-a-new-feature.md` and link the change ID |
| Not accepted | The request is wrong, or a cheaper path exists. Name the alternative, then resolve |

### 4.5 The platform decides, the reporter does not

The platform is not bound by the request. It picks the approach that fits the contract and the three apps, and it says what it did not do.

| Question | Rule |
|---|---|
| Does the contract already answer it | Follow the contract. Do not add a field for one app |
| Is it one app only | It is an extension. Point at `02-contracts/extensions/` |
| Does it change what the other apps read | It is a shared change. It goes through `./making-a-contract-change.md` |
| Is the asked fix more expensive than the need | Refuse, and name the cheaper path |

### 4.6 The platform writes the resolution comment

**This is the part the reporter came for.** One comment, in this shape, every line filled. The reporter reads this and nothing else.

```
RESOLUTION: <one line, what is true now>
DECISION: <what the platform chose, and what it did not do>
WHY: <one or two lines, the reason>
CHANGED: <commit or PR>, <files>
YOU DO: <numbered steps for the app team, or "nothing">
VERIFY: <one command, and the output that proves it>
STILL OPEN: <what remains, or none>
CONTRACT VERSION: <the version at resolution>
```

| Line | The failure it prevents |
|---|---|
| `RESOLUTION` | A reader who cannot tell whether the block is gone |
| `DECISION` | A refusal that looks like silence |
| `WHY` | The same question asked again next week |
| `CHANGED` | An app team waiting for a fix that already shipped |
| `YOU DO` | A fix that lands and nobody adopts it |
| `VERIFY` | "It works on my machine" |
| `STILL OPEN` | A half fix that closes as done |
| `CONTRACT VERSION` | A pin that drifts with nobody noticing |

Do not paraphrase the shape. Do not split it across three comments.

### 4.7 The platform closes

Close after the comment exists. If another app can hit the same block, add one line to the comment naming it, and open their issue if it does not exist.

### 4.8 The app harness reads the resolution

Read `YOU DO` and do it. Then run `VERIFY` and paste its output in the issue. A verification that nobody ran is a guess.

If `YOU DO` is empty and `VERIFY` passes, you are done. Move on.

### 4.9 Disagreement is a new issue, not an argument

If you think a decision is wrong, do not reply with a paragraph. Open one new issue with the same template, tick section 9, and write the counter in three lines: which line of the decision is wrong, what evidence you have, and what you would do instead.

| Rule | Why |
|---|---|
| One counter per decision | A thread of replies has no owner and no end |
| Cite the first issue number | The history stays readable |
| New evidence, or it waits | "I do not like it" is not a counter. A failing case is |
| The counter gets its own resolution comment | The same rule applies to the platform |

A counter that wins changes the decision in the new issue. The old issue stays closed with its resolution comment. That comment is history, not a mistake.

### 4.10 The secret block

You need a value you do not have. The rule is one line: **the harness handles the NAME, the human handles the VALUE.**

| Block | Who owns the value | Where it lives |
|---|---|---|
| `WHATSAPP_VERIFY_TOKEN` | The platform. It is a random string the platform generates | Functions secret |
| `WHATSAPP_APP_SECRET` | The team that owns the Meta app | Functions secret |
| `WHATSAPP_CLOUD_API_TOKEN` | The team that owns the Meta app | Functions secret |
| `WHATSAPP_PHONE_NUMBER_ID` | The team that owns the Meta app | Functions secret |
| `TWILIO_ACCOUNT_SID` | The team that owns the Twilio account | Functions secret |
| `TWILIO_AUTH_TOKEN` | The team that owns the Twilio account | Functions secret |
| `TWILIO_WHATSAPP_FROM` | The team that owns the Twilio account | Functions secret |

Open the issue with the secret NAME in section 7. Never the value. The platform answers with the owner and the exact command. The human runs the command and types the value there.

The harness verifies with `functions:secrets:get`, which prints metadata. It never runs `functions:secrets:access`, which prints the value.

## 5. Do NOT

| Do NOT | Why |
|---|---|
| Do not open an issue before the three checks in 4.2 | Most blocks are a stale emulator or a typo |
| Do not write the resolution as the reporter | The decision belongs to the platform |
| Do not accept a request because it is politely written | Accept it because it fits the contract |
| Do not close on a verbal yes | The next harness reads the issue, not the call |
| Do not paste a token, a key or a phone number into the issue | The issue is permanent and visible to the org |
| Do not argue in the comments | Open the counter issue |
| Do not edit the app repo to work around a block | The workaround becomes the next bug |

## 6. Self-verification

Check the two parts this guide depends on, before you report.

```bash
test -f .github/ISSUE_TEMPLATE/blocked-on-platform.md && echo "OK template" || echo "MISSING template"
gh label list --limit 50 | grep -q blocked-on-platform && echo "OK label" || echo "MISSING label"
```

Expected: `OK template` and `OK label`.

## 7. Report format

End every blocked-issue turn with this block.

```
ROLE: <app harness | platform harness>
ISSUE: <number, or none>
BLOCK TYPE: <contract | secret | callable | rule | deploy | docs | not a platform block>
DECISION: <one line, platform harness only>
RESOLUTION COMMENT: <written | pending | not mine to write>
CONTRACT VERSION: <from VERSION>
OPEN QUESTION: <one line, or none>
```
