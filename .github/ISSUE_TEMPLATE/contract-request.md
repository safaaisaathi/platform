---
name: Contract request
about: Ask the platform owner to change the shared contract
title: "Contract request: "
labels: contract-request
assignees: ''
---

<!--
This is the form. Fill every section. A partial form is a form the platform
owner has to interview you about, which is slower than asking the question
properly the first time.

The canonical form lives at 06-changes/templates/contract-request.md in the
platform repo. If it changed, copy it from there and use the newer one.

Do not edit the contract in your own repo. The contract is shared. Two apps
editing it is how `phone` and `phoneMasked` ended up as two different fields.

One app only means it is an EXTENSION and it never reaches the platform.
Check 02-contracts/extensions/README.md section 1 before you file this.
-->

## 1. The feature

<One line. What you want to build.>

## 2. The user journey

<Who does what, when, and what they see. Two or three sentences.>

## 3. Which collections change

<List the collection names, exactly as they appear in `02-contracts/collections/`. If a NEW collection is needed, write "NEW: <name>" and explain why it cannot be a field on an existing collection.>

## 4. The new or changed fields

| Field path | Type | Required? | Default | Why it is needed |
|---|---|---|---|---|
| `<collection>.<field>` | string / number / boolean / timestamp | yes / no | <value or null> | <what reads it and why> |

**If you do not know whether it should be required, write "not sure" and explain what breaks if it is missing.** The platform owner decides. A required field is a MAJOR version bump and every app has to adopt it.

## 5. Who writes it, who reads it

| | Who |
|---|---|
| **Written by** | <app name, or "the Functions"> |
| **Read by** | <every app and function that reads it> |

**If more than one app reads it, it is CORE and it goes through the request process.**

**If only your app reads it, it is an EXTENSION and you can add it yourself.** See `02-contracts/extensions/README.md`. Say so in this box.

## 6. Enums

<Does this need a new enum, or a new value in an existing one? Name the enum exactly as in `02-contracts/enums.json`. If it is a new value, say what it means and who else needs to understand it.>

**A new value in a shared enum means every app must handle it.** Say what the other apps should do when they see it.

## 7. The access scope

<Who may read this? Who may write it?>

**If the scope comes from a claim, name the claim.** If it comes from a live document, say which document and which field. If it is the staff member's ward scope, say so.

## 8. The rule or the callable

**State your NEED, not your mechanism.** The platform owner decides whether this is a rule or a callable.

- Why does this need to be restricted? <the thing that would go wrong if anyone could do it>
- Does the restriction depend on a claim the session already carries, or on a live document that can change?

**For reference, the decision rule is:** a write is a **rule** when the claim is the authority, and a **callable** when a live document is the authority. A revoked staff member's token stays valid for up to an hour, so anything that depends on "is this person still active" must be a callable.

## 9. Indexes

<What query will the app run? List the fields and their order.>

| Collection | Field 1 | Field 2 | Direction |
|---|---|---|---|
| `<collection>` | `<field>` | `<field>` | ASC / DESC |

**If there is no index, the query is a collection scan.** Check `03-rules/firestore.indexes.json` first.

**Remember:** the emulator does NOT enforce composite indexes. A green emulator run is not proof of index coverage.

## 10. Push notifications

<Does this need an FCM push? If yes, name the topic from `02-contracts/topics.json`. If you need a topic that does not exist, say so and explain why. If no, write "none".>

## 11. Is this breaking?

<Yes or no. If yes, what exactly breaks for an app that was correct?>

**An S1 change needs a migration plan and a deprecation window.** The platform owner writes those, but you need to tell them what breaks.

## 12. Offline behaviour

<Does this feature need to work with no network? If yes, what does the app show, and what happens to the action when the network comes back?>

**The rule of thumb:** the server decides what is true, the device decides how it behaves, and the device keeps working when the network does not. If the feature needs a server decision, it cannot be the only path.

---

## The reproduction

**A report without a reproduction is a story.** Paste the smallest failing case.

<!-- A failing test, the emulator output, the exact error, or the exact request and response. -->

```
<the smallest failing case>
```

## The declaration

**By opening this issue I confirm:**

- I have read `02-contracts/` and I did not find an existing field or enum that does this.
- I have not edited the contract in my own repo.
- If this is an extension, I understand the extension rules and that the platform owner registers it.

**Submitted by**: <name> | **App**: <driverapp / userapp / adminpanel> | **Date**: <YYYY-MM-DD>
