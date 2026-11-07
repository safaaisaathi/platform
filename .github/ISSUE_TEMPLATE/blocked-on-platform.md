---
name: Blocked on the platform
about: The platform is the reason you cannot move forward. The platform writes the resolution.
title: "Blocked: "
labels: blocked-on-platform
assignees: ''
---

<!--
Read 07-guides/blocked-on-platform.md in the platform repo first. It has the
three checks to run before you file this, and most blocks end at those checks.

Sections 1 to 9 are yours. Section 10 belongs to the platform owner. Leave it
empty. An issue closes only after section 10 is filled.

Never paste a token, a key, a password or a phone number. Name the secret, not
the value.

If you cannot use GitHub, say it to the platform owner. The platform owner opens
this issue anyway and writes the resolution here. The record does not move to
chat.
-->

## 1. Who and when

| Field | Value |
|---|---|
| App | `<driverapp / userapp / adminpanel>` |
| Reported by | `<name or handle>` |
| Date | `<YYYY-MM-DD>` |
| Blocks a release | `<yes / no>` |

## 2. What I am building

<One line.>

## 3. The block, in one line

<One line. "I cannot X because Y.">

## 4. The evidence

Paste the command and the first ten lines of its output. No secret value.

```
<command>
<output>
```

## 5. What I tried

<Three lines at most. What you ran, and what it said.>

## 6. The type of block

Tick one.

- [ ] The contract has no field, enum value, callable or reason code I need
- [ ] A callable returns something that disagrees with `02-contracts/callables.json`
- [ ] A rule denies a read or a write the contract allows
- [ ] I need a secret or a credential I do not have
- [ ] A deploy or a CI job fails on a platform file
- [ ] Two documents disagree with each other
- [ ] Not sure

## 7. What I need

<One line. A name, a decision, a fix, or the owner of a value. For a secret, write the NAME only.>

## 8. Workaround right now

<What you are doing to keep moving, or "none".>

## 9. Is this a counter to an earlier decision

<The issue number, or "no". If yes, name the line of that decision you think is wrong and paste your failing case.>

---

## 10. The resolution

**Platform owner only. The reporter leaves this empty.**

Fill every line. Do not split it across several comments. The issue closes after this comment exists.

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

<!--
A refusal is a decision. Put it on the DECISION line and name the cheaper path.
Silence is not a decision.

If the reporter disagrees, they open a counter issue. Do not argue here.
-->
