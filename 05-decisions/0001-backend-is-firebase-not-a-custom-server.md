---
id: adr-0001-backend-is-firebase
title: Backend is Firebase, not a custom server
status: accepted        # proposed | accepted | rejected | superseded
owner: platform-owner
updated: 2026-11-01
audience: harness
deciders: [platform-owner, office]
consulted: [driverapp-team, userapp-team, adminpanel-team]
informed: [office]
supersedes: null
supersededBy: null
see_also:
  - ../02-contracts/README.md
  - ../07-guides/backend-split.md
---

# Backend is Firebase, not a custom server

## Context

Three apps share one dataset: `driverapp` (Flutter), `userapp` (Flutter) and `adminpanel` (React/Next). One Firebase project, `safaaisaathi-63a87`. One Firestore database. All three read and write the same data, and the rules must scope every read and write by identity, not by "is signed in".

Two shapes were on the table.

| Shape | What it means |
|---|---|
| Firebase | The apps talk to Firestore, Auth, Functions and FCM directly. Rules are the authorization layer |
| Custom Node server | The apps talk to one Node API. That API owns sessions, talks to Firestore with admin rights, and enforces everything itself |

A custom Node backend was seriously considered. At one-app scale it is a reasonable choice. At three-app scale it buys three things nobody wants to build:

| What the custom server adds | Why it hurts |
|---|---|
| A session layer | Each app needs login, token refresh and revocation. Three implementations of the same idea |
| A sync protocol | Realtime updates have to be re-invented over websockets or polling, per app |
| An auth implementation | Roles, scopes and identity checks move from a battle-tested service into our own code |

None of these add a feature a citizen, a driver or the office can see.

## Decision

Firebase. One project, `safaaisaathi-63a87`, three registered apps. The backend is not "Firebase" as one blob. It is SIX services, each with its own file in this repo, each with its own job:

| # | Service | Job | Where it lives |
|---|---|---|---|
| 1 | Firestore | The data | `../02-contracts/collections/`, `../03-rules/firestore.indexes.json` |
| 2 | Firestore Rules | The authorization | `../03-rules/firestore.rules` |
| 3 | Cloud Functions | The decisions that need live state | `../04-functions/src/` |
| 4 | Firebase Auth | The identity, via custom claims | `../02-contracts/claims.json` |
| 5 | FCM | The push | `../02-contracts/topics.json` |
| 6 | Cloud Storage | The photos | `../03-rules/storage.rules` |

The split rule between service 2 and service 3 is in `../02-contracts/callables.json` under `x-decision-rule`: a write is a rule when a claim is the authority, and a callable when a live document is the authority. ADR 0003 applies it to the admin panel.

## Consequences

### Good

| Consequence | Why it matters |
|---|---|
| No session layer to build | Firebase Auth issues and refreshes the token. Three apps, one identity service |
| No sync protocol | Firestore listeners push changes. The driver map and the admin panel subscribe, they do not poll |
| Realtime listeners are free | On the Spark plan this is the feature a custom server cannot match at zero cost |
| The emulator enforces rules locally | `firebase emulators:start` runs the real rules engine. Rule bugs surface in a test run, not in production |
| One project, three registered apps | One set of rules, one deploy, one console. Adding an app is registering it, not opening a port |

### Bad

These are accepted costs, and each one shapes a later decision:

| Cost | What it forces | Where it lands |
|---|---|---|
| The rules language is limited | A rule cannot consult a live document cheaply or make complex decisions, so live-document checks move into Functions. This is exactly why admin writes are callables | ADR 0003 |
| Firestore's 30-disjunction limit | A large `in` block, or a long chain of disjunctions, in a rule or a query fails past 30 terms. Big rule blocks must be split by collection or by claim | `../03-rules/firestore.rules` |
| Firestore's 1 MiB document cap | The GPS trail cannot be one array on the trip document. It is sharded into chunks | `../02-contracts/collections/trailChunk.schema.json` |
| The emulator does NOT enforce composite indexes | A green emulator run is not proof of index coverage. Index gaps surface only against production | `../03-rules/firestore.indexes.json` must be reviewed by hand, every time a query changes |

## Alternatives considered

| Alternative | What it would have given | Why rejected |
|---|---|---|
| Custom Node server (Express or Fastify) | Full control over auth and one place for business logic | A session layer, a sync protocol and a custom auth implementation, for no user-visible gain. Three apps triple the session surface we would have to secure |
| Firebase Data Connect | A tool-enforced typed contract: a SQL schema, generated SDKs, queries checked at build time | Attractive, and it came closest to being accepted. But it means migrating off raw Firestore across three apps and all existing data. Far too big right now. Revisit once the schema stabilizes and untyped reads hurt in practice |
| AWS DynamoDB + Lambda | Fine-grained IAM, cheap at high write volume | No equivalent free realtime listener. Streams are not a listener a Flutter widget can subscribe to. Three separate SDK configurations to maintain |

## References

| What | Where |
|---|---|
| The contract layer this decision stands on | `../02-contracts/README.md` |
| The rules-versus-callables split rule | `../02-contracts/callables.json`, `x-decision-rule` |
| How the six services map to files | `../07-guides/backend-split.md` |
| The rules file itself | `../03-rules/firestore.rules` |
| The identity vocabulary | `../02-contracts/claims.json` |
| The follow-on decisions | ADR 0002, ADR 0003 in `./index.md` |
