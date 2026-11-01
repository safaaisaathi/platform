---
id: product-overview
title: Safai Saathi Product Overview
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: both
see_also:
  - ./platform-boundaries.md
  - ./glossary.md
  - ../02-contracts/README.md
---

# Safai Saathi

**A citizen-centric garbage collection and sanitation monitoring system** for the Panchmahal Godhra district. Project PS000051.

## The problem

A municipal garbage van runs a fixed route through a fixed list of wards. Today, nobody outside the van knows where it is. The citizen waits. The office finds out about a missed collection only when a complaint arrives, days later.

**Three things have to be true for the system to work.**

| # | What | How the system does it |
|---|---|---|
| 1 | The citizen can see the van | The user app reads the van's live location from Firestore |
| 2 | The citizen gets told when it is close | An FCM push fires when the van reaches their ward's boundary |
| 3 | The office can act on complaints | The admin panel sees the complaints, assigns them, escalates them |

## The three apps

| App | Stack | Who uses it | What it does |
|---|---|---|---|
| **Driver app** | Flutter, Android | The driver, on the van's phone | Starts and ends shifts, records the route, marks wards done, sees notices, files the D4 complaint updates |
| **User app** | Flutter, Android + iOS | The citizen | Finds its own ward, watches the van on a map, gets the arrival alert, files complaints, rates the ward |
| **Admin panel** | React / Next.js, Web | The office | Watches the vans, manages complaints, sends notices, manages drivers and staff |

**All three are being built by three people.** The driver app exists. The other two are in progress.

## The one backend

**One Firebase project. `safaaisaathi-63a87`.** Not three.

| Service | What it does |
|---|---|
| Firestore | The data |
| Firestore Rules | The authorization. Who may read and write what |
| Cloud Functions | The decisions. Arrival alerts, escalation, duplicate merging, session minting |
| Firebase Auth | Who is calling, and what claims they carry |
| FCM | The push |
| Cloud Storage | The complaint photos |

**One project, three registered Firebase apps.** The driver app is registered. The user app and the admin panel need their own registration.

**Why one project.** The whole point is one shared database. Three projects would mean three sets of rules and three sets of functions, and the apps would have to call each other.

## The shape of a day

```
MORNING   The driver opens the app, types the badge code, starts the shift.
          The server claims the phone to the van and mints the token.

THROUGHOUT  The phone writes the van's location every 10 seconds.
          The server watches it and, when the van nears the next ward,
          pushes an alert to the citizens of that ward.

          A citizen sees the van on a map, files a complaint about a
          missed collection, and rates the ward.

AFTERNOON  The driver marks each ward done. The office sees the complaints
          come in, assigns them, and escalates the ones that sit.

EVENING    The driver ends the shift. The server closes the trip and clears
          the van's marker.
```

## The three ideas that hold it together

### 1. The rules decide who may. The Functions decide what is true.

A Firestore rule can check *"is this caller allowed to touch this document?"*. It cannot check *"is this complaint still within the inspector's ward, right now?"*, because a rule cannot read another document cheaply.

**So live-state decisions go in Functions.** A rule is for claims. A Function is for documents.

### 2. The client never names its own scope

The badge code is printed on the van. The citizen's `deviceId` is a value on their own phone. **Both are things the client controls, so neither can be an authorization boundary.**

The server mints a **custom claim** from an authoritative document the client cannot edit. The rules check the claim. **This is the whole identity model.**

### 3. The device decides how it behaves, and it keeps working with no network

The phone buffers. The server decides what is true. **A shift that starts without a signal is queued and sent when the signal comes back.**

## Where to go next

| You are | Read |
|---|---|
| A new teammate | `onboarding.md` |
| Deciding where something goes | `platform-boundaries.md` |
| Looking up a term | `glossary.md` |
| Building something | `../02-contracts/README.md` |
| An AI harness | `../AGENTS.md` |
