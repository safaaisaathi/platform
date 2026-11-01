---
id: contracts-readme
title: The Contract Layer
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: harness
see_also:
  - ./collections/README.md
  - ./severity-policy.md
  - ./extensions/README.md
  - ../03-rules/README.md
  - ../07-guides/reading-the-contract.md
---

# The Contract Layer

**This folder is the machine layer.** It is the only folder an AI harness must read to know the exact shape of the data and the exact vocabulary. Everything here is JSON, except this file and `severity-policy.md`.

**If a field name, an enum value, a claim name, a constant, a topic or a reason code is not in this folder, it does not exist.** Do not invent one. Open a contract request instead.

## 1. The files

| File | What it is | Read it when |
|---|---|---|
| `collections/*.schema.json` | One JSON Schema per collection, draft 2020-12 | You are writing or reading a document of that collection |
| `collections/README.md` | The collection table: owner, who reads, who writes | You need the big picture |
| `enums.json` | Every frozen enum, plus the catalog | You need a value from a fixed set |
| `constants.json` | Every number that must match everywhere | You need a number, a threshold, a radius, a limit |
| `claims.json` | Every custom claim, who mints it, who reads it | You are reading or minting a token |
| `topics.json` | The FCM topic map | You are subscribing to or publishing a push |
| `callables.json` | Every callable: input, output, reason codes | You are calling a server function |
| `errors.json` | The reason-code vocabulary | You are handling a server error |
| `design-tokens.json` | The shared visual tokens | You are building a screen |
| `extensions/registry.json` | Which app owns which extension | You are adding a field only one app uses |
| `severity-policy.md` | The S0 to S4 severity rules and the version-bump policy | You are recording a change |

## 2. The three rules

### Rule 1: the enum lives in `enums.json`, never inline in a schema

Schemas `$ref` the enum definitions. There is exactly one copy of `"urban"`, `"rural"` in this repository.

```
collections/ward.schema.json  →  "$ref": "https://safaaisaathi.contracts/enums.json#/$defs/ward.type"
```

**Why.** If `ward.type` is written out in two schemas and one is edited, the app that reads the other one silently accepts a value the rest of the system rejects.

### Rule 2: a schema describes the document, not the permission

The schema says what fields exist and what they look like. **Who may write them is in `03-rules/firestore.rules`.** A schema never carries a permission.

**Why.** Permissions are enforced by the server and change on a different cadence than the data shape. A schema that carries permissions is a second place to get it wrong, with nothing enforcing agreement.

### Rule 3: `additionalProperties` is not `false` in the raw schemas

Raw collection schemas leave unknown properties permitted, because an app may add an **extension** field (see `extensions/README.md`). The **composed** schema that a validator uses is strict, and `08-tools/build-schemas.ts` produces it.

```
raw schema              →  permissive  →  accepts core fields + any registered extension field
composed schema         →  strict      →  rejects anything that is not registered
```

**Why.** A strict raw schema would make every extension a breaking change to the core schema, which defeats the purpose of the extension model.

## 3. How to read a collection schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://safaaisaathi.contracts/collections/ward.schema.json",
  "title": "Ward",
  "type": "object",
  "properties": {
    "name": { "type": "string", "minLength": 1 },
    "type": { "$ref": "https://safaaisaathi.contracts/enums.json#/$defs/ward.type" }
  },
  "required": ["name", "type"]
}
```

| Key | Meaning |
|---|---|
| `$id` | The absolute identity of this schema. Every `$ref` in the repository resolves against these `$id` values |
| `title` | The human name. Never a field name |
| `properties` | Every field the collection may hold. The **core** fields only |
| `required` | The fields a document must have to be valid |
| `$ref` | A pointer into `enums.json`. The only cross-file reference in this repository |

## 4. The composition

```
enums.json ──────────────┐
                         ├──> build-schemas.ts ──> composed schema (strict) ──> app validator
collections/*.schema.json┘
extensions/<app>.json ───┘
```

**The composed schema is what a runtime uses.** The raw files are what a human reads and what `git diff` shows.

## 5. What belongs here and what does not

| Belongs | Does not belong |
|---|---|
| Field names, types, required-ness | Permissions. That is `03-rules/` |
| Enum values | UI copy. That is the app's arb files |
| Constants and thresholds | Screens and widgets |
| Claim names | Token contents beyond the claim names. That is `claims.json` |
| Callable signatures | Callable implementations. That is `04-functions/` |
| Topic names | Push handlers. That is the app |

## 6. The contract version

`../VERSION` holds the version of this layer. It is **SemVer**.

| Bump | When | Effect on the apps |
|---|---|---|
| **MAJOR** | A field is removed or renamed, a type changes, an enum value is removed, a required field is added | Every app must read the change and adopt it |
| **MINOR** | A field is added, an enum value is added, a callable is added, a topic is added | Apps that care about the new thing should adopt it |
| **PATCH** | A description changes, a constraint tightens without removing anything, a typo | No app action |

**The bump policy and the severity levels are in `severity-policy.md`.** Read that file before you change anything in this folder.

## 7. The one-line check

```
node ../08-tools/validate-contract.ts
```

It must print `contract valid`. If it does not, the contract is broken and nothing downstream can be trusted.
