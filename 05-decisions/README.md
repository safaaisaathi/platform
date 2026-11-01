---
id: decisions-readme
title: Architecture Decision Records
status: frozen
owner: platform-owner
updated: 2026-11-01
audience: harness
see_also:
  - ./index.md
  - ../02-contracts/README.md
  - ../06-changes/README.md
  - ../AGENTS.md
---

# Architecture Decision Records (ADR)

**An ADR records ONE decision, its context, and its consequences.** Nothing else. This folder is the "why" layer of the repo: the contracts say what, the rules say who, the ADRs say why.

## 1. What an ADR is

| Property | Meaning |
|---|---|
| One decision per file | If a file argues two decisions, it is two ADRs |
| Immutable once accepted | The text is not edited after acceptance. A correction or a change of mind is a NEW ADR |
| Historical | It records what was known and believed on the decision date. It is not updated when reality drifts. Reality drifting is what a new ADR is for |
| Never authoritative | In the authority order (`../AGENTS.md` section 1) this folder ranks below `02-contracts/` and `03-rules/`. An ADR explains. It never overrides |

## 2. When to write one

Write an ADR when at least two of these are true:

| # | Check | Question to ask |
|---|---|---|
| 1 | Hard to reverse | Does undoing it cost a migration, a redeploy or a data change? |
| 2 | Cross-app | Does it touch two or more of `driverapp`, `userapp`, `adminpanel`? |
| 3 | Debatable | Could a reasonable engineer have chosen differently? |
| 4 | Recurring | Will "why is it like this?" be asked again in six months? |

Do NOT write an ADR for:

| Not an ADR | Where it goes instead |
|---|---|
| A field addition, an enum value, a rename | The change procedure, `../06-changes/`. The severity is already S1 to S4 there |
| A bug fix with an obvious fix | The app repo, the commit message |
| A how-to, a runbook, a setup guide | `../07-guides/` |
| Background reading, survey notes | `../09-reference/` |

The test: if the file would still be true if a single field name changed, it is a decision. If it would need editing, it is a contract detail and belongs in `02-contracts/`.

## 3. The naming convention

```
NNNN-kebab-case-title.md        zero-padded to four digits, sequential
```

| Rule | Why |
|---|---|
| Numbers are never reused | A number points at a moment in history, not at a topic |
| The frontmatter `id` is `adr-NNNN-<short-slug>` and matches the filename | One grep finds the file and the references to it |
| The title is a sentence, in the active voice | "Admin writes go through callables", not "Callable usage for admin writes" |
| No dates in the filename | The date lives in the frontmatter, and renumbering never happens |

## 4. The file anatomy

MADR format. These headings, in this order, with no extras between them:

```markdown
---
id: adr-NNNN-slug
title: <the decision, as a sentence>
status: accepted        # proposed | accepted | rejected | superseded
owner: platform-owner
updated: YYYY-MM-DD
deciders: [...]
consulted: [...]
informed: [...]
supersedes: null
supersededBy: null
see_also:
  - <relative paths>
---

# <the decision, as a sentence>

## Context
## Decision
## Consequences
### Good
### Bad
## Alternatives considered
## References
```

| Section | What goes in it |
|---|---|
| Context | The forces at play, the facts, the numbers. What was true when the decision was made |
| Decision | What was decided, stated plainly, in one place. If the reader stops here, they know the outcome |
| Consequences | What becomes easier and what becomes harder. Both, always. An ADR with no Bad section is marketing |
| Alternatives considered | The options that lost, and why. This is what stops the same debate from restarting |
| References | Links to the contracts, guides and sibling ADRs this decision stands on |

## 5. The lifecycle

| Status | Meaning | Who moves it |
|---|---|---|
| `proposed` | Written, under discussion. Not binding | The author |
| `accepted` | Decided and binding. The body is now immutable | Platform owner |
| `rejected` | Considered and declined. Kept, so the debate does not restart from zero | Platform owner |
| `superseded` | Replaced by a newer ADR. `supersededBy` points at it | Platform owner |

## 6. How to supersede

A change of mind is a NEW ADR, never an edit:

| Step | Action |
|---|---|
| 1 | Write the new ADR with the next free number, status `accepted` (or `proposed` while it is debated) |
| 2 | Set its `supersedes:` to the old ADR's `id` |
| 3 | In the OLD file, touch only the status block: `status: superseded` and `supersededBy: <new id>`. The body does not move |
| 4 | Update `./index.md`: add the new row, flip the old row's status and Superseded by column |
| 5 | If the decision also changes a field, a claim, a callable or a rule, the change procedure still applies. The ADR is the why, the `06-changes/` entry is the what and the version bump |

## 7. The index

`./index.md` is the table of record. Every ADR appears exactly once, with its number, title, status, date and supersession chain. Read the index first, the ADR second.

## 8. What does not belong here

| Does not belong | Lives in |
|---|---|
| Field names, types, enums, claims, callables | `../02-contracts/` |
| Who may read or write what | `../03-rules/` |
| Migration steps and severity ratings | `../06-changes/` and `../02-contracts/severity-policy.md` |
| How-to guides and runbooks | `../07-guides/` |
| Screens, copy, per-app UI choices | The app's own repo |
