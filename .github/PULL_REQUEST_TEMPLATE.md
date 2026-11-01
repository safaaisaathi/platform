# Pull request template

**A contract change is a bigger thing than a code change.** It affects apps that are not in this repo. Fill this in properly.

**Delete the guidance in each section as you answer it.** Keep the section headings so the reviewer knows what you considered.

---

## What

<One paragraph. The concrete technical change. Name the files, the fields, the values.>

---

## Severity and priority

| | |
|---|---|
| **Severity** | S<n>. S0 emergency, S1 breaking, S2 new capability, S3 additive, S4 internal |
| **Priority** | P<n>. severity plus impact |
| **Urgency** | immediate / before_release / scheduled / optional |
| **Version** | <old> → <new> |

**See `02-contracts/severity-policy.md`.** If this touches `02-contracts/`, the version must be bumped in the same commit.

---

## Core or extension

<Is this a core contract change, or a field only ONE app uses?>

- [ ] **Core.** Two or more apps must agree on the meaning of this field or value.
- [ ] **Extension.** Only my app uses it. I added it in my own repo's `.contract/extensions/` and it is registered in `02-contracts/extensions/registry.json`.

---

## Who is affected

| App | Affected? | What they must do |
|---|---|---|
| driverapp | YES / NO | <the specific action, or the reason it is not affected> |
| userapp | YES / NO | <the specific action, or the reason it is not affected> |
| adminpanel | YES / NO | <the specific action, or the reason it is not affected> |

**An app with NO needs a one-line reason.** "Not affected" with no reason is not allowed.

---

## What breaks

<What will an app that was correct do wrong after this change? If nothing breaks, say "Nothing. This is purely additive.">

**For a breaking change, also fill this in:**

| Failure | What the user sees | What the log says |
|---|---|---|
| <the app did not migrate> | <the visible symptom> | <the diagnostic> |
| <the deploy order was wrong> | <the visible symptom> | <the diagnostic> |

---

## Migration steps

<The ordered steps. Each step is one thing somebody does. The order IS the design.>

1. <step>
2. <step>
3. <step>

**The order that works**: <describe it>

**The order that breaks**: <describe it, and what the failure looks like>

**The rule of thumb.** *The server goes first, the clients go second, the rules tighten last.*

---

## Deprecation window

| Field | Meaning | Value |
|---|---|---|
| `oldFieldReadableUntil` | The last date the old field can be read | <date or null> |
| `oldFieldWritableUntil` | The last date the old field can be written | <date or null> |

**A field is never removed in the same release that stops writing it.**

---

## Rollback

<How to undo this. What breaks if you roll back. If the rollback is impossible, say so and say why.>

---

## Files changed

| File | What changed in it |
|---|---|
| `02-contracts/...` | <the field or the enum> |
| `VERSION` | <old> → <new> |
| `06-changes/manifest.json` | <the entry> |
| `06-changes/CHG-*.md` | <the explanation> |

**The manifest entry and the explanation file change together.** Never one alone.

---

## Security

- [ ] This change does not widen any read scope.
- [ ] This change does not widen any write scope.
- [ ] If it touches `03-rules/firestore.rules`, the security note is in the change entry.
- [ ] No secret is in this repo. A Firebase client key is not a secret. A service account key is.

---

## Verification

```
node 08-tools/validate-contract.ts      -> contract valid
node 08-tools/check-consistency.ts       -> manifest consistent
```

- [ ] `validate-contract.ts` passes.
- [ ] `check-consistency.ts` passes.
- [ ] The composed schemas are rebuilt and committed.
- [ ] `VERSION` is bumped if `02-contracts/` changed.

---

## Checklist

- [ ] The severity is classified and the version is bumped accordingly.
- [ ] The migration steps are written and ordered.
- [ ] Every affected app is listed with a reason.
- [ ] The `manifest.json` entry and the `CHG-*.md` file are in this commit.
- [ ] The affected fields exist in the schema.
- [ ] The PR title starts with the change id, for example `CHG-0012: mask the driver phone`.
