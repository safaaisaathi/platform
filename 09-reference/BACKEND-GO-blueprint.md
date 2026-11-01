# GO Backend Blueprint — Safai Saathi (Driver + User + Admin)

> **Reference copy.** This document moved from `safaaisaathi/driverapp` (`docs/BACKEND-GO-blueprint.md`) into the platform repo on 2026-11-02, because all three apps build against it and it must have one home.
>
> **Its companion links still point at the driver app's repo.** `docs/AUDIT2-flow-backend-ui.md` is now `./AUDIT2-flow-backend-ui.md` in this folder. `docs/PRD-2-driver-app.md` is still in the driver app's repo, and `../01-prds/PRD-2-driver-app.md` here is a pointer to it. `GLOSSARY.md` is in the driver app's repo.
>
> **This document is reference material, not a source of truth.** The contract is `../02-contracts/`. The rules are `../03-rules/`. Where this document and the contract disagree, the contract wins. See `./README.md`.

**Purpose**: The single authoritative document for the Firebase backend that all three apps share. The driver app exists today. The user app and the admin panel are being built on top of it. This document is the **contract between them**.

**Status**: Blueprint. Nothing in it is implemented except where a line says otherwise.
**Written**: 2026-11-01
**Identity decisions**: **Q1 to Q7 are ANSWERED.** Q1 by the office (first-claim). Q2 to Q7 by the agent's recommendation, **pending the office's sign-off**. See section 12.
**Companion**: `docs/AUDIT2-flow-backend-ui.md` (the audit this blueprint is built on), `docs/PRD-2-driver-app.md` (the frozen contract), `GLOSSARY.md` (the live project state).

---

## 0. How to read this document

| Section | What it covers | Read it if |
|---|---|---|
| **1** | The one-paragraph version | You have 2 minutes |
| **2** | The three apps and what each one owns | You need to know the boundaries |
| **2.4** | **The split: what lives in the backend, what stays on the device** | **You are a teammate on any of the three apps. Read this before writing anything** |
| **2.5** | **How each teammate connects.** Access, keys, folders, the exact calls | **You are the user app or the admin panel developer. Start here** |
| **3** | The data model, collection by collection | You are writing a repository or a type |
| **4** | The auth and identity model | You are writing a rule or a callable |
| **5** | The rules, collection by collection | You are writing `firestore.rules` |
| **6** | The Cloud Functions | You are writing `functions/src/` |
| **7** | The FCM topic map | You are wiring a notification |
| **7.4** | **A worked example:** the driver's location, and the citizen's 100 m arrival notification | **You want to see the whole system in one flow** |
| **8** | The indexes | Your query fails |
| **9** | The shared constants | You need a number that must match everywhere |
| **10** | The three-environment setup | You are deploying |
| **11** | The build order | You are planning the work |
| **12** | The identity questions, and their answers | You need to know what was decided and why |
| **13** | The glossary | You see a term you do not know |

### 0.1 The three decisions that shape everything else

**Read these three before anything else.** They are the spine of the document, and every other section depends on them.

| # | Decision | What it means | Where it is written out |
|---|---|---|---|
| **1** | **The rules scope by custom claims, not by "is someone signed in"** | The badge code is public, so it cannot be the boundary. The phone number is the secret, and the claim is what the rules can check | Section 5.2, Q7 |
| **2** | **The admin panel's writes go through callables, not direct Firestore writes** | A revoked staff member's token stays valid for up to an hour. Only a server-side check of the live `staff` doc can lock them out immediately | Section 4.6, Q5 |
| **3** | **The device binding is created by the first valid claim, inside a transaction** | The van is claimed by the first phone that presents a valid code. The transaction makes the race safe. Phase 11 upgrades it to match-only | Section 4.5, Q1 |

**The one-sentence version of the whole model.** *The client proves who it is with a claim that the server minted, the rules trust only the claim, and every decision that needs live state happens in a Function.*

### 0.2 The three rules of thumb

**Rule 1: a write is a rule when the claim is the authority, and a callable when a live document is the authority.**

| The write | The authority | The mechanism |
|---|---|---|
| The driver writes its own van's telemetry | The `vanId` claim | Rule |
| The citizen files their own complaint | The `deviceId` claim | Rule |
| The admin resolves a complaint | The live `staff` doc | Callable |

**Rule 2: the server sends a reason code, the client owns the words.** The Function returns `vanAlreadyClaimed`. The app maps it to `identityShiftConflictClaimed` in the arb files. **A server that sends English text to the app breaks localization the moment the copy is edited.**

**Rule 3: the rules decide who may, the Functions decide what is true, and the device decides how it behaves.**

| Where a thing goes | The question it answers |
|---|---|
| **The rules** | *"May this caller do this to this document, right now?"* |
| **The Functions** | *"What is actually true, given everything I can see?"* |
| **The device** | *"How should this phone behave, and does it still work with no network?"* |

**The full split, with the offline case spelled out, is in section 2.4.** Read that section before writing anything new. It is the contract for all three teams.

---

## 1. The one-paragraph version

There is **one** Firebase project, **one** Firestore database, and **one** set of Cloud Functions. Three apps (driver, user, admin) talk to it. Each app gets a **different slice** of the data, enforced by Firestore rules, not by convention. The driver app writes location and shift data. The user app reads location and writes complaints. The admin panel reads everything within a staff member's ward scope and manages complaints, notices, drivers and vans. The Functions are the only things that make **server-side decisions**: arrival alerts, complaint escalation, duplicate merging, offline-van detection, notice fan-out, and the stale-shift sweep. The current state of this project is that **the rules are authentication-only**, which means an anonymous caller can currently read every driver's phone number and rewrite any trip. That is the first thing to fix.

**Two things this document adds beyond the obvious.** First, the driver app needs **two** identity factors, not one, because the badge code is public by design (§0.16). Second, the app currently **subscribes to push topics but never receives a push**, so PRD `:237`'s "a notice arrives within 10 seconds" is only half met.

**And one thing it settles for the three teams.** *What lives in the backend and what stays on the device.* The backend is **Firebase**, not a custom server: the rules are the authorization layer, Cloud Functions are the decision layer, and the phone keeps everything that is the phone's own behaviour plus the offline buffer. **Section 2.4 is the contract for all three teams.**

**And the identity decisions are now made, so this is a buildable document, not a wish list.**

| The decision | The answer |
|---|---|
| **Who claims the van** | **The first phone with a valid code**, inside a transaction. The office's call, 2026-11-01 |
| **How the rules tell one driver from another** | **The `vanId` custom claim**, not the badge code. The code is public, so it cannot be the boundary |
| **What the driver app sees of the phone number** | **The masked form only** (`98XXXXXX10`). The raw phone moves behind the staff wall |
| **How fast a revoked staff member loses access** | **Immediately**, because the admin panel's writes go through callables that read the live `staff` doc |
| **What a citizen sees after a reinstall** | **Their complaint history is gone from the app.** The complaint still exists. The office still sees it. Accepted for this build |
| **How the server talks about a conflict** | **A reason code, not English text.** The app owns the words |

---

## 2. The three apps and what each one owns

### 2.1 The table

This is PRD-2 §0.5's data-ownership table, extended with what the current code actually does.

| | **Driver app** (Flutter, exists) | **User app** (Flutter, PRD-1) | **Admin panel** (React/Next, PRD-3) | **Backend** (Functions) |
|---|---|---|---|---|
| **Role** | Writes the van's position | Finds its ward's van and shows it | Watches all vans in the staff member's scope | Verifies drivers, sends alerts, detects silent vans |
| **Reads** | own `vans` doc, `routes`, `wards`, `drivers/{CODE}` | `wards`, `routes`, `vans` of its own route only, today's `trips` | `vans`, `trips`, `complaints`, `wards`, `notices`, `staff`, `staffPhones` | everything |
| **Writes** | `vans.lastLocation`, `vans.batteryPct`, `vans.status`, `vans.currentTripId`, `trips` | `complaints`, `ratings` | complaint status + assignment, `notices`, `drivers`, `staffPhones`, `vans.depot` | `trips.alertedWardIds`, `vans.status = offline`, `complaints.mergedInto`, `complaints.escalationLevel` |
| **Auth today** | Anonymous + remembered driver code | Anonymous | Should be real accounts with staff claims | n/a (service account) |
| **Auth proposed** | Anonymous → custom token with `vanId` + `driverId` | Anonymous, with a `deviceId` claim and a `routeId` claim on the session | Firebase Auth email + custom claims `role`, `staffId`, `wardIds` | n/a |
| **How the identity is settled** | A **callable** returns a custom token. The client signs in with it | The `deviceId` is a **claim**, set at session bootstrap | The claims are minted at sign-in. **Revocation is checked against the `staff` doc** (Q5) | The Functions are the only place a claim is minted |

**The three lines that changed from the naive table, and why.**

| Line | Naive answer | The settled answer | Why |
|---|---|---|---|
| **Auth proposed, driver app** | *"Custom token with `vanId`"* | **Plus `driverId`** | The badge code must be resolved **server-side** into a claim, or the driver app would have to keep sending the code as a client parameter, and a client parameter is forgeable (B-01's bug class) |
| **Auth proposed, user app** | *"Anonymous (device-scoped)"* | **Anonymous, with a `deviceId` claim** | Q6. The `deviceId` in the claim is what makes the complaint read rule work. If it stays client-side, any caller can read any complaint |
| **Writes, admin panel** | *"Complaint status, notices, drivers"* | **The same set, but through callables** | Q5. A revoked staff member with a live token must lose access **immediately**, and a rules-only check cannot do that. The callable reads `staff/{id}.active` before acting |

### 2.2 The three questions the identity model must answer

This is the core design idea. **Three different apps, three different questions.**

| App | The question | The answer mechanism |
|---|---|---|
| **User app** | *"Is this complaint mine?"* | The `deviceId`, a locally-generated UUID. Not an identity, just a key |
| **Driver app** | *"Is this shift mine, and is this phone the van's?"* | Two factors: the **device binding** (phone → van) and the **driver badge code** (shift → person). See section 4 |
| **Admin panel** | *"Which wards may this staff member see and act on?"* | Custom claims `role` and `staffId`, plus the `staff` document's `wardIds[]` |

**Why the driver app needs two factors and the user app needs one.** The user app is anonymous by design: a citizen should be able to complain without an account. Its only write is a complaint, and the complaint is scoped by `deviceId` so the citizen can read back their own. The driver app is different: it writes **location data and shift history**, and it acts **on behalf of a named person**. A single badge code cannot carry that, because the code is public (§0.16 `:193`).

### 2.3 The one-way street

A useful mental model for the whole backend:

```
   USER APP                DRIVER APP               ADMIN PANEL
   (citizen)               (worker)                 (office)
      │                        │                        │
      │ writes complaints      │ writes location        │ calls the admin
      │ reads own complaints   │ reads own van          │ callables
      │                        │ reads routes/wards      │
      └────────────────────────┴────────────────────────┘
                               │
                               ▼
                     ┌─────────────────────┐
                     │  FIRESTORE RULES     │  ← WHO MAY
                     │  "may this caller    │    checked on every read
                     │   do this to this    │    and every write
                     │   doc, right now?"   │
                     └─────────────────────┘
                               │
                               ▼
                     ┌─────────────────────┐
                     │      FIRESTORE       │  ← one database
                     │  wards routes vans   │
                     │  trips complaints    │
                     │  notices ratings     │
                     │  staff drivers       │
                     │  vanDevices          │
                     └─────────────────────┘
                               ▲
                               │  server-side DECISIONS
                     ┌─────────────────────┐
                     │    CLOUD FUNCTIONS   │  ← WHAT IS TRUE
                     │  arrivalAlert        │    transactions, alerts,
                     │  mergeDuplicates     │    escalation, merging
                     │  escalateComplaints  │
                     │  missedCollection... │
                     │  vanOfflineWatch     │
                     │  sendNotice          │
                     │  bindDeviceToVan     │
                     └─────────────────────┘
```

**The apps never write to each other's data.** The user app never writes a `vans` doc. The driver app never writes a `complaints` status except the two D4 buttons on its own route's wards. The admin panel never writes location data.

**Two questions, two layers. Never mix them up.**

| Layer | Answers | Runs on |
|---|---|---|
| **The rules** | *"May this caller do this to this document, right now?"* | Every read and every write, **before** it lands |
| **The Functions** | *"What is actually true, given everything I can see?"* | On demand (a callable) or on a trigger |

### 2.4 The split: what lives in the backend, what stays on the device

**This section is the contract for three teams.** It says which decisions belong to the server and which belong to the phone. **A teammate who asks "where does this go?" should be able to answer from this section alone, without asking anyone.**

#### 2.4.1 Why there is a backend at all

| If there is no backend | Then |
|---|---|
| **The driver app stands alone** | The citizen's complaint reaches nobody |
| **The office has nowhere to keep data** | Notices, escalation, assignment, nothing works |
| **Three apps, three truths** | The driver, the citizen and the office each see a different version of reality |

**The backend is not a convenience. It is the only place the three apps can meet.**

#### 2.4.2 Why the backend is Firebase, and not a custom server

**The decision: Firebase, with Cloud Functions as the custom logic layer.**

**What a custom server would make you build, and what Firebase already gives:**

| You would have to build | Firebase gives it | The cost of building it yourself |
|---|---|---|
| User accounts, sessions, token refresh, roles | Firebase Auth + custom claims | Months, and it is the most security-critical code you will write |
| An authorization layer in code | Firestore rules. One file, declarative, auditable | Every endpoint handler re-implements the checks. **One forgotten check is a breach.** This is exactly the bug class B-01 is |
| Realtime streams for three clients | `watch()` / `onSnapshot`, built in | WebSocket + reconnect + resync, per screen |
| Device token registry and push | FCM + topics | A push provider, plus the registry (which the blueprint already flags as a gap, B-23) |
| A database with its own schema story | Firestore | A second set of migrations, backups and restore drills |
| Deployment, monitoring, backups, secrets, on-call | Managed | A second thing to keep alive at 3 AM |

**The honest counter-arguments, and why none of them applies here.**

| The usual reason to go custom | Does it apply? | Why |
|---|---|---|
| **Firestore read costs at scale** | **No** | A municipal van fleet: tens of vans, thousands of trips, hundreds of complaints a day. Firestore cost at that volume is effectively zero |
| **Genuinely relational queries, 6+ joins** | **Not yet** | The model is one van → one route → wards. The complaints model is flat. **If it ever becomes relational, add Postgres later as a read replica.** Do not replace the core now |
| **Vendor lock-in** | **Real, but survivable** | The cost of leaving is a migration, not a rewrite. **The portable part is this document**, because it describes the data shape and the rules, not the SDK calls |
| **Business logic needs unit tests** | **No** | Functions are TypeScript. `firebase-functions-test` already exists in `functions/package.json` as a dev dependency |

**The distinction that keeps this from becoming a religion.** *"Custom"* here means **custom business logic**, not **custom platform**.

| Layer | Who writes it | Where it runs |
|---|---|---|
| Authorization | **You.** The rules | Firestore, declaratively |
| Business decisions | **You.** The Functions | Cloud Functions |
| Storage, auth, streaming, push, hosting | **Firebase** | Managed |

**The only thing you must not build is a custom platform.** Auth, sessions, the authorization runtime, the realtime transport, the push transport. Those are exactly the parts where a home-grown version is a security liability, and they are exactly the parts every teammate has to integrate against.

**The teammate argument, which is the real one:**

| Teammate | Stack | The SDK | Their whole contract |
|---|---|---|---|
| **Driver app** | Flutter | `firebase_core`, `firestore`, `auth`, `functions`, `messaging` | *"You may write telemetry on the van your `vanId` claim names, create and update trips for that van, and press D4 on your trip's wards."* |
| **User app** | Flutter | the same | *"You may file a complaint scoped to your `deviceId` claim, read your own complaints, read your route's vans and today's trips."* |
| **Admin panel** | React / Next | the Firebase JS SDK | *"You may read within your `wardIds` claim, and you may write through five named callables."* |

**Each contract is about five lines long.** With a custom server, every teammate would also need an API client, a token-refresh handler, a pagination convention, an error envelope, and a spec to read. **That is the real cost of custom, and it is paid by the people you are trying to help.**

#### 2.4.3 The three placement rules

| Rule | The test | Example |
|---|---|---|
| **Two honest clients can race and get it wrong → server** | Two devices, one van, one instant | Trip create, ward-done dedup, shift start and end |
| **It is the device's own behaviour → device** | Only this phone can observe it | GPS interval, battery threshold, permission flow, the local trail buffer |
| **It is a signal about the client's honesty → server** | The client is exactly the party you do not trust | The `flagged` tamper flag. The client reports the raw fact, the server judges it |

**The third rule is the one people forget.** A decision that is *about* the client's honesty must not be made by the client, however well-intentioned.

#### 2.4.4 The split table

| Decision | Lives on | Why |
|---|---|---|
| **Device binding (`vanDevices`) + claim minting** | **Server.** A callable | The binding is an authorization fact. A client-created binding would let a caller bind itself to any van |
| **`installId` generate and store** | **Device** | Pure local. The server just receives the value |
| **Shift start, shift end, ward-done, the transactions** | **Server** | Two honest clients can race. The transaction is the atomicity |
| **The offline trail buffer and its ordered flush** | **Device** | The network can vanish mid-shift. **A buffer that needs the server is not a buffer** |
| **The `flagged` computation** | **Server** | It is a signal about the client's honesty |
| **The raw `Position.isMocked` signal** | **Device** | The device is the only thing that can observe this |
| **Trip `date` and `startedAt`** | **Server clock** | A phone with a wrong clock writes the trip into the wrong day |
| **GPS cadence, battery threshold, foreground service** | **Device** | Device behaviour. The server should not second-guess it |
| **Complaint merge, escalation, missed-collection alert** | **Server** | Each is a decision about many documents at once. No single client holds the full picture |
| **Permission flow, UI state, the welcome-back card** | **Device** | Pure UX |
| **Arrival alert, van offline watch, notice fan-out** | **Server** | They have to reach somebody else's device |
| **Language preference, screen state** | **Device** | Pure local |
| **Admin writes** | **Server.** Callables + an audit log | Instant revocation needs the live `staff` doc |
| **The FCM token, topic subscribe and unsubscribe** | **Device** | The token belongs to the device. The server only registers it |
| **The device and topic registry, for targeted push** | **Server** | A topic cannot address one person. The mapping lives server-side |

#### 2.4.5 Reads and writes, in one line each

> **Read → the rules, scoped by a claim.** Cheap. It runs on every read for free.
>
> **Write → a callable** only when the decision needs **live state**, such as `staff.active` for revocation. Everything else writes through the rules.

**Why reads stay in the rules.** A read is a filter. The rules can filter on the token, they cost nothing extra, and there is no network hop. **Moving a read behind a Function would add latency to every screen for no gain.**

**Why a write moves to a callable only sometimes.** A rules write trusts the **token**. The token can be up to an hour stale. So:

| The write needs to know | The token is enough | A callable is needed |
|---|---|---|
| Which van this caller owns | **Yes.** The `vanId` claim | — |
| Which complaint this caller filed | **Yes.** The `deviceId` claim | — |
| Whether this staff member is **still** active | **No.** The token says yes for an hour | **Yes.** Read `staff/{id}.active` live |
| Which wards this staff member **currently** covers | **No.** The token's `wardIds` can be stale | **Yes.** Read the live doc |

**The safe direction.** Reads can be an hour stale and nobody cares, because a stale read scope is a display annoyance. **Writes get the stricter check**, because a stale write scope is a privilege escalation.

#### 2.4.6 The offline case, spelled out

**This is the concrete reason "everything on the server" is wrong.** The driver's network dies mid-shift, and the app must keep working.

| Moment | What the device does | What the server does |
|---|---|---|
| **Network up, shift starts** | Calls the `startShift` callable | A transaction creates the trip, marks the van, and returns a fresh token |
| **The network drops mid-shift** | Buffers trail points locally. Keeps tracking. Shows "offline" | Nothing. The trip is already open |
| **The network drops and the driver marks a ward done** | Buffers the ward event locally, queued behind the trail | Nothing yet |
| **The network returns** | Flushes the queue **in order**: trail points first, then the ward events | Each write lands. The server dedupes the ward by `wardId`, so a re-flush is harmless |
| **The network never returns** | The trip stays open server-side | `clearStaleVanMarkers` (every 15 min) or the depot auto-end closes it |

**The property that makes an offline buffer possible at all: the flush is safe to repeat.** The server's ward append is idempotent (it keys on `wardId`) and the trail chunks are immutable. **A client that flushes twice corrupts nothing.** If the server's writes were not idempotent, offline mode would be a corruption feature rather than a resilience feature.

**And one write path stays deliberately direct: the trail chunks.** The driver writes them straight to Firestore, not through a Function.

| Why | Detail |
|---|---|
| **A Function per trail write adds a network hop to every 30-second batch** | Chunking exists to *reduce* the number of writes. A Function per write would undo that |
| **The rule is enough to protect it** | The chunk create rule checks the parent trip's `vanId`, caps the size at 1000 points, and denies update and delete. **A chunk is immutable, so it cannot rewrite history** |

**This is the exception that proves the rule.** The trail is a direct write because the claim fully determines its scope and the write is append-only. **Everything that needs a decision, a transaction, or live state goes through a callable.**

#### 2.4.7 The test, for a teammate who does not know where a thing goes

**Three questions, in order. Stop at the first "yes".**

| # | Question | If yes |
|---|---|---|
| 1 | **Can two honest clients do this at the same time and get different answers?** | **Server.** Use a transaction |
| 2 | **Does it have to reach somebody else's device, or depend on many documents at once?** | **Server.** A trigger, a scheduler, or a callable |
| 3 | **Does it need to know the caller's CURRENT live status, not the token's copy?** | **Server.** A callable, because only the server can see the live doc |
| — | **None of the above** | **Device.** It is the phone's own behaviour, and it must keep working with no network |

**And two mirror-image smells, for the reviewers.**

| If you see this in a rule | Move it to a Function |
|---|---|
| A rule that `get()`s a second document on every read | The rule is doing a decision. A Function can do it once and cache the answer |

| If you see this in a Function | Move it to a rule |
|---|---|
| A Function that reads a document to decide **who is calling** | That is authorization. The rules do it, once, for every caller, and you cannot forget it in one of twelve handlers |

**The one sentence to remember.** *The rules decide who may. The Functions decide what is true. The device decides how it behaves, and it must keep working when the network does not.*

### 2.5 How each teammate connects

**This section is the onboarding document for the two other apps.** The user app and the admin panel are being built by two other people. This section says what they need, what they get, what they call, and what they must not touch.

#### 2.5.1 First, the precision: "the backend is Firestore" is 80% right

**Yes, the backend is Firebase.** But the backend is **six** services, not one, and each one has its own file. A teammate who thinks "I just need Firestore" will build the wrong thing.

| Service | What it does | Where it lives |
|---|---|---|
| **Firestore** | The data. Collections, documents, fields | The schema, section 3 |
| **Firestore Rules** | The **authorization**. Who may read and write what | `firestore.rules`. **One file, owned by the Backend Owner** |
| **Cloud Functions** | The **decisions** and the automation | `functions/src/` |
| **Firebase Auth** | Who is calling. Anonymous, email, and the **custom claims** | The SDK. Claims are minted by the Functions |
| **FCM** | The push | The topic map, section 7 |
| **Storage** | The complaint photos | `storage.rules` |

**The one-line map.** *Firestore holds the data, the rules hold the authorization, the Functions hold the decisions, Auth holds the identity, FCM holds the push, Storage holds the files.*

#### 2.5.2 The access model: what you share, and what you never share

**This is the "do I have to give you my key" question, answered.**

| Thing | Who gets it | Is it a secret? |
|---|---|---|
| **The Firebase web config** (apiKey, appId, projectId, authDomain, messagingSenderId) | **Everyone.** All three apps | **NO.** These are identifiers, not credentials. Anyone can extract them from an APK in ten seconds |
| **`google-services.json` / `GoogleService-Info.plist`** | The mobile teammates | **NO.** Same reason |
| **The project id** (`safaaisaathi-63a87`) | Everyone | No |
| **`firestore.rules`** | **Read:** everyone. **Write:** the Backend Owner only | The rules are the security boundary. The ability to edit them **is** full access |
| **A service account JSON key** | **Nobody but the Backend Owner.** Never in a repo, never in a client app | **YES.** It uses the Admin SDK, which **bypasses the rules entirely**. A leaked one is a full database takeover |
| **The Admin SDK** | **Nobody but the Backend Owner** | Same. It bypasses the rules |

**The sentence that settles it.** *A Firebase client API key is not a password. It says "which project". The security is enforced by the rules, not by the key.*

**So: handing your teammate the web config is safe and normal.** Handing over a service account key is not. **The web config goes in their app. The service account stays with you.**

**Still restrict the key.** Google Cloud Console → APIs & Services → Credentials:

| App | Restrict by |
|---|---|
| Android | The package name + the SHA-1 and SHA-256 fingerprints |
| Web (the admin panel) | The HTTP referrer, which is the panel's domain |

**Why restrict it if it is not a secret.** An unrestricted key can be used from a script anywhere, which burns your quota and can trip Google's abuse detection. **Restriction is hygiene, not security.** The security is still the rules.

**How to give a teammate access to the project itself**, so they can see the console, use the emulator, and read logs:

| What they need | Where | The role |
|---|---|---|
| See the console, read data, run the emulator | Firebase console → Project settings → **Users and permissions** | **Viewer** |
| Deploy rules, indexes, or Functions | the same | **Editor**, only if they will |
| Deploy from their machine | `npm i -g firebase-tools`, then `firebase login` | Their Google account needs the role above |
| Read logs and crash reports | Firebase console | Viewer |

**The one hard rule for the client apps.** *A client app must never contain the Admin SDK.* In Flutter, `cloud_functions` is **fine**, it is the client SDK for calling a callable. `firebase-admin` is **not**, it is the server SDK, and it would bypass every rule in section 5.

#### 2.5.3 One project, three Firebase apps

```
PROJECT: safaaisaathi-63a87
├── Firestore        one database, one rules file
├── Storage          one bucket, one rules file
├── Auth             one identity provider
├── Cloud Functions  one functions/ folder, one deploy
└── FCM              one sender id, three apps register against it
```

**One project, three registered Firebase apps.** Not three projects, because the whole point is one shared database. The three apps differ only in how they register.

| App | Platform | How it registers |
|---|---|---|
| **Driver app** | Android | **Already done.** `1:179594621556:android:8bdac1de2d29745aad1721`, in `firebase.json` and `lib/firebase_options.dart` |
| **User app** | Android + iOS | The user-app teammate registers a **new** app in the console, then runs `flutterfire configure` |
| **Admin panel** | Web | The admin teammate registers a **new Web app**, then puts the config in `NEXT_PUBLIC_FIREBASE_*` env vars |

**Why three registrations and not one.** FCM routes a push to a specific app registration, and App Check treats each app separately. **Same project, different app.** That is the normal Firebase shape.

#### 2.5.4 The folder structure each teammate should have

| Repo | Structure | The shared part |
|---|---|---|
| **Driver app** (this repo) | `lib/core/firebase/` (bootstrap), `lib/core/repositories/firestore/`, `lib/features/<feature>/data/` | — |
| **User app** | The **same three** folder names, the same repository class names | **Same names, so a mental model transfers** |
| **Admin panel** | `src/lib/firebase.ts` (init), `src/lib/api/` (the callables), `src/features/<feature>/data/` | — |
| **Backend** | `functions/src/index.ts`, one file per Function | — |

**What should actually be shared, and the honest limit on it.**

| Option | What it is | Verdict |
|---|---|---|
| **A. A monorepo with a `packages/shared` folder** | Dart code and a TS package in one repo | **Best, if the team wants it.** One PR, one CI, one place to change a field name |
| **B. A separate `shared-contract` repo** | Just the schema and the constants, published as a package | **Good.** Lighter. The contract lives in one place |
| **C. Copy-paste** | Each repo has its own copy of the field names | **Never.** This is exactly how the `phone` vs `phoneMasked` confusion and the 29-ward cliff happen |

| Share | Do not share |
|---|---|
| The collection names and field names | The screens |
| The claim names | The repositories. Each app has its own |
| The enum values (PRD §0.3) | The design tokens. Each app has its own theme, with the same names |
| The conflict reason codes | The arb files |
| The constants (section 9.1) | |

**The minimum version, if the team does not want a monorepo.** One file, `shared/contract.json`, listing every collection, field and enum value, plus the constants test from section 9.2. **One file, three repos. That is enough.**

#### 2.5.5 The exact calls each teammate makes

**The user app (Flutter).**

| When | What it calls | What it gets |
|---|---|---|
| **Launch** | `Firebase.initializeApp` then `signInAnonymously()` | A session |
| **Session bootstrap** | `bootstrapUserSession({ deviceId, wardId })` | A custom token with `deviceId` + `routeId`. Then `signInWithCustomToken` |
| **Ward known** | `subscribeToTopic('ward_{wardId}')` | The arrival alerts for that ward |
| **Ward changes** | `unsubscribeFromTopic(old)`, `subscribeToTopic(new)` | |
| **The live map** | `watchVansOnRoute(routeId)` | A direct query: `where('routeId', isEqualTo: routeId).where('status', isEqualTo: 'on_shift')` |
| **The ETA** | Computed **on the device** from `lastLocation` plus `routes.wardIds` | |
| **File a complaint** | A direct Firestore create, scoped by the `deviceId` claim | A `complaints` doc |
| **Read own complaints** | `watchMyComplaints()` | Scoped by the `deviceId` claim |
| **Rate a ward** | A direct Firestore create | A `ratings` doc |

**The admin panel (React / Next).**

| When | What it calls | What it gets |
|---|---|---|
| **Sign in** | `signInWithEmailAndPassword` | A session |
| **Claim minting** | `mintStaffToken({ staffId })` | A custom token with `role`, `staffId`, `wardIds`. Then `signInWithCustomToken` |
| **The complaint list** | `watchComplaints({ wardIds })` | A direct query, scoped by the claim |
| **Resolve a complaint** | `setComplaintStatus({ complaintId, status, note })` | **A callable, not a direct write** |
| **Publish a notice** | `publishNotice({ targetType, targetId, message })` | A callable |
| **Edit a driver** | `upsertDriver({ code, name, phone, vanId, routeId, wardIds, active })` | A callable. **It masks the phone** |
| **Manage staff** | `upsertStaff({...})` | A callable |
| **Set a depot** | `setVanDepot({ vanId, lat, lng })` | A callable |
| **The live map** | `watchVans()`, `watchTrips()` | Direct queries, scoped by the claim |

**The whole admin panel in one line: every read is a direct query, every write is a callable.** That is Q5's architecture, and it is why the rules in section 5.2 deny every admin write.

#### 2.5.6 The two callables these two apps need, and they do not exist yet

| Callable | Who calls it | What it does | Why a callable |
|---|---|---|---|
| **`bootstrapUserSession`** | The user app | Takes `{ deviceId, wardId }`, resolves the ward's `routeId`, mints a custom token with `deviceId` + `routeId` | The claims must be **server-issued**. If the client chose its own `routeId`, it could read any route's trips. Same bug class as B-01 |
| **`mintStaffToken`** | The admin panel | Takes `{ staffId }`, reads the `staff` doc, mints a custom token with `role`, `staffId`, `wardIds` | The staff scope must come from the **live doc**, not from a form field. Otherwise a client could mint itself an inspector's scope |

**Both have the same shape as `bindDeviceToVan`.** Check the caller, read the authoritative doc, mint the token, return it. **Three callables, one pattern.**

**And `deviceId` does not need to be provable.** The user app generates it once and stores it. The callable cannot verify it is a real device id, and it does not need to. **The claim's job is to make the client unable to *change* its scope after sign-in**, not to prove the device is genuine.

#### 2.5.7 The first-day checklist for a teammate

| # | Step | Where |
|---|---|---|
| 1 | Get access to the project | Ask the Backend Owner for **Viewer** on `safaaisaathi-63a87` |
| 2 | Install the CLI and log in | `npm i -g firebase-tools`, then `firebase login` |
| 3 | Point the CLI at the project | `firebase use safaaisaathi-63a87`. It writes `.firebaserc` |
| 4 | Register their Firebase app | Firebase console → Project settings → **Add app** |
| 5 | Put the config in their app | Mobile: `flutterfire configure`. Web: `NEXT_PUBLIC_FIREBASE_*` env vars |
| 6 | Get the emulator running | `firebase emulators:start`. **The config is in `firebase.json`, but it is gitignored today.** See section 10.3 |
| 7 | Get the rules and the indexes | `firestore.rules` and `firestore.indexes.json`. **The rules are the contract** |
| 8 | Read section 2.4 | The split. What is theirs and what is the server's |
| 9 | Read section 5.2 | The exact rules their app lives under |
| 10 | Write a rules test for their own flows | The rules suite (Part D.3 of the audit). **Their flows are the "positive" cases** |

**And the one thing they must not do.** *Do not deploy the rules.* A teammate who edits `firestore.rules` and deploys can open a hole for everyone. **One rules file, owned by the Backend Owner.** A change request goes through a PR.

---

## 3. The data model

### 3.1 The complete collection list

| Collection | Doc id | Fields | Owner of writes | Status |
|---|---|---|---|---|
| `wards` | `ward-1` | `name`, `nameGu`, `code`, `type`, `center{lat,lng}`, `radiusM`, `routeId`, `inspectorId`, `escalationTo` | Admin | Exists |
| `routes` | `route-01` | `name`, `wardIds[]` (visiting order), `scheduledStartTime` | Admin | Exists |
| `vans` | `van-01` | `plateNo`, `routeId`, `status`, `lastLocation{lat,lng,updatedAt,speedKmph}`, `currentTripId`, `batteryPct`, `depot{lat,lng}` | Driver (telemetry) + Admin (`depot`) + Functions (`status = offline`) | Exists |
| `trips` | auto | `vanId`, `routeId`, `driverId`, `wardIds[]`, `date`, `startedAt`, `endedAt`, `wardsDone[{wardId,doneAt,flagged}]`, `alertedWardIds[]`, `gpsTrail[{lat,lng,t}]`, `mockLocationDetected` | Driver + Functions (`alertedWardIds`) | Exists. **`gpsTrail` needs sharding** |
| `complaints` | auto | `ticketId`, `deviceId`, `category`, `photoUrl`, `location`, `wardId`, `createdAt`, `status`, `assignedTo`, `escalationLevel`, `resolvedPhotoUrl`, `resolvedAt`, `mergedInto`, `note` | User app (create) + Driver (2 D4 fields) + Admin (status/assignment) + Functions (`mergedInto`, `escalationLevel`) | Exists |
| `notices` | auto | `targetType`, `targetId`, `message`, `createdAt`, `createdBy` | Admin | Exists. **No read-state** |
| `ratings` | auto | `wardId`, `date`, `stars`, `deviceId` | User app | Exists. Unused by the driver app |
| `staff` | auto | `authUid`, `name`, `role`, `wardIds[]`, `talukaId`, `phone` | Admin | Exists. Unused by the driver app |
| `drivers` | `AB-1234` | `name`, **`phoneMasked`**, `vanId`, `routeId`, `wardIds[]`, `active` | Admin | Exists (added by §0.16). **The raw `phone` is being renamed to `phoneMasked`** |
| **`staffPhones`** | `AB-1234` | **`phone`** (raw), `updatedAt`, `updatedBy` | **Admin only** | **NEW. The raw phone's home, behind the staff wall (Q4)** |
| **`vanDevices`** | `van-01` | **`installId`**, **`boundAt`**, **`boundBy`**, **`claimMode`** | **Functions only** | **NEW. The authorization anchor** |
| **`trips/{id}/trail`** | `0`, `1`, `2`… | **`points[]`** (≤1000), **`from`**, **`to`** | **Driver app** | **NEW. Solves the 1 MiB cliff** |
| **`notices/{id}/receipts`** | `AB-1234` | **`readAt`** | **Driver app** | **NEW. Persistent read-state** |

### 3.2 The enums (PRD-2 §0.3)

These are **frozen**. Every app and every Function must use the exact same strings.

| Enum | Values | Where |
|---|---|---|
| `ward.type` | `urban`, `rural` | `wards` |
| `van.status` | `idle`, `on_shift`, `offline` | `vans` |
| `complaint.category` | `garbage_dump`, `open_gutter`, `missed_collection`, `other` | `complaints` |
| `complaint.status` | `received`, `assigned`, `resolved`, `escalated` | `complaints` |
| `complaint.escalationLevel` | `0` (inspector), `1` (chief officer/TDO), `2` (DDO) | `complaints` |
| `notice.targetType` | `van`, `ward`, `all` | `notices` |
| `staff.role` | `inspector`, `chief_officer`, `tdo`, `ddo` | `staff` |

**The rule from PRD §0.1**: *"do not add, rename or remove fields or enums without asking. If something is missing, ask first."* The admin panel, the user app and the Functions must all agree on these strings.

### 3.3 The collections in detail

#### `wards`

The citizen's geography. A ward has a centre and a radius. The user app resolves its own ward by "which ward's circle contains me", or by a manual picker.

| Field | Type | Notes |
|---|---|---|
| `name` | string | English name |
| `nameGu` | string | Gujarati name. The user app and the driver app both need it |
| `code` | string | The office's ward code |
| `type` | enum | `urban` / `rural` |
| `center` | `{lat, lng}` | The circle's centre |
| `radiusM` | number | The circle's radius in metres |
| `routeId` | string | **Which route serves this ward.** This is the join key for the user app |
| `inspectorId` | string | The `staff/{id}` who owns it. The target of `missedCollectionAlert` |
| `escalationTo` | string | The `staff/{id}` to escalate to (level 1) |

**The join key.** `wards.routeId` is what lets the user app listen to **only** the vans on its route. PRD §0.6 rule 3: *"It listens ONLY to vans where `routeId == ward.routeId` and `status == on_shift`. It never loads all vans."* This is a **performance law**, not a preference. The user app must never issue a full-collection query on `vans`.

**`routeId` vs `vans.routeId`.** The ward's route and the van's route should match. When they do not, the driver is on a route that does not serve the ward they are assigned. That is a real, observable condition. The admin panel should show it as a warning, not as an error.

#### `routes`

| Field | Type | Notes |
|---|---|---|
| `name` | string | Shown on the driver's welcome card (ruling #28) |
| `wardIds[]` | array | **The visiting order.** The ETA calculation walks this list in order |
| `scheduledStartTime` | string `"HH:mm"` | Shown to the user app when no van is on shift |

**`wardIds[]` order is load-bearing.** The ETA (PRD §0.6 rule 4) sums the straight-line distances from the van through the remaining wards **in this order**. Reordering the array silently changes every ETA.

#### `vans`

| Field | Type | Written by | Notes |
|---|---|---|---|
| `plateNo` | string | Admin | The human plate. The driver app shows it on the welcome card |
| `routeId` | string | Admin | The route this van serves |
| `status` | enum | Driver + Functions | `idle` / `on_shift` / `offline`. **Proposed: Functions only** |
| `lastLocation` | `{lat, lng, updatedAt, speedKmph}` | Driver | One small doc, overwritten. `updatedAt` is a **server timestamp** |
| `currentTripId` | string | Driver | The open trip's id, or null. **Proposed: Functions only** |
| `batteryPct` | number | Driver | The phone's battery |
| `depot` | `{lat, lng}` | Admin | The depot tag (ruling #29). **The driver never writes it** |

**The field-write map.** The rules must enforce it at the field level, not the collection level.

| Field | Driver app | Functions | Admin |
|---|---|---|---|
| `lastLocation`, `batteryPct` | ✅ | — | — |
| `status` | ✅ (proposed: ❌) | ✅ (`offline`) | ✅ |
| `currentTripId` | ✅ (proposed: ❌) | ✅ | ✅ |
| `depot` | ❌ | — | ✅ |
| `plateNo`, `routeId` | ❌ | — | ✅ |

#### `trips`

One work session. The record of what happened.

| Field | Type | Written by | Notes |
|---|---|---|---|
| `vanId` | string | Driver | The van |
| `routeId` | string | Driver | Snapshot of `vans.routeId` at start |
| `driverId` | string | Driver | **The confirmed driver code.** The office's accountability field (§0.16) |
| `wardIds[]` | array | Driver | **The snapshot** of the driver's allotment at start. See below |
| `date` | Timestamp | Driver | The **IST midnight instant** of the shift's day. Not a date string |
| `startedAt` | Timestamp | Driver | Client clock. A known weakness |
| `endedAt` | Timestamp | Driver | Null while the shift is live |
| `wardsDone[]` | array of `{wardId, doneAt, flagged}` | Driver | `flagged: true` when the driver marked a ward done from outside its radius |
| `alertedWardIds[]` | array | Functions | The arrival-alert bookkeeping |
| `gpsTrail[]` | array of `{lat, lng, t}` | Driver | **The 1 MiB cliff. Shard it** |
| `mockLocationDetected` | bool | Driver | A one-way latch. The office should be pushed (B-12) |

**The `wardIds[]` snapshot is a good decision. Keep it.** If the office changes a driver's wards mid-shift, today's shift keeps its scope and the historical record is not rewritten. This is the right contract.

**The `date` field.** It is the **IST midnight instant**, not a `YYYY-MM-DD` string. Both reads and writes build the window in the write frame (`istDayWindow`), and the fake repository mirrors it, which is why the bug could not show in tests (issue #15). The weakness: it depends on the **client's** clock. A phone with a wrong date writes a trip into the wrong day. The fix is a **server-computed** `date` field, added alongside, not replacing, the client's.

#### `complaints`

The citizen's report. The busiest collection and the one the admin panel cares about most.

| Field | Type | Written by | Notes |
|---|---|---|---|
| `ticketId` | string | User app / Functions | Format `PMH-YYYYMMDD-NNNN` (PRD §0.1) |
| `deviceId` | string | User app | The locally-generated UUID. **This is the citizen's only key** |
| `category` | enum | User app | `garbage_dump` / `open_gutter` / `missed_collection` / `other` |
| `photoUrl` | string | User app | Storage path `complaints/{complaintId}/photo.jpg`, compressed under 500 KB |
| `location` | `{lat, lng}` | User app | Where the citizen saw the problem |
| `wardId` | string | User app | Which ward |
| `createdAt` | Timestamp | Server | **Should be a server timestamp.** The complaint's age drives escalation |
| `status` | enum | User app (create) + Driver (2 D4 buttons) + Admin | `received` / `assigned` / `resolved` / `escalated` |
| `assignedTo` | string | Admin | The `staff/{id}` |
| `escalationLevel` | int | Functions | `0` / `1` / `2` |
| `resolvedPhotoUrl` | string | Admin | Storage path `complaints/{complaintId}/resolved.jpg` |
| `resolvedAt` | Timestamp | Admin | When it was closed |
| `mergedInto` | string | Functions | The ticket this one was merged into. Null normally |
| `note` | string | Admin | Free text |

**The complaint's lifecycle, and who owns each transition.**

```
   user app                driver app (D4)              admin panel              Functions
      │                        │                          │                       │
      │ create                 │                          │                       │
      │ (status=received,      │                          │                       │
      │  escalationLevel=0)    │                          │                       │
      │──────────────► mergeDuplicates ──► set mergedInto ─┤                       │
      │                        │                          │                       │
      │                        │ "Will Revisit"          │                       │
      │                        │ (status=assigned)       │                       │
      │                        ├─────────────────────────►│                       │
      │                        │                          │ "Done"                │
      │                        │                          │ (status=resolved,      │
      │                        │                          │  resolvedAt, photo)    │
      │                        │                          │                       │
      │◄───────────────────────┴──────────────────────────┤                       │
      │  reads own complaint by deviceId                  │                       │
      │                                                   │ escalateComplaints ──► │
      │◄──────────────────────────────────────────────────┴───────────────────────┘
                                     (status=escalated, escalationLevel 1/2)
```

**The D4 scope rule.** The driver app may update `status` and `resolvedAt` on a complaint **only if** the complaint's `wardId` is in the current trip's `wardIds`. That is PRD §0.8's rule, and it is not expressible with the current `allow update: if request.auth != null`.

#### `notices`

| Field | Type | Written by | Notes |
|---|---|---|---|
| `targetType` | enum | Admin | `van` / `ward` / `all` |
| `targetId` | string | Admin | The van id or the ward id. Null or empty for `all` |
| `message` | string | Admin | The text |
| `createdAt` | Timestamp | Admin | |
| `createdBy` | string | Admin | The staff member's id |

**The missing read-state.** The `notices` shape has **no** read field, so the driver's unread dot is **session-local** (`notices_flow.dart` keeps an in-memory set). It resets on every restart and every shift end. A notice that arrived while the app was closed looks new forever.

**The fix.** A `notices/{id}/receipts/{driverCode}` subcollection with a `readAt` field. A subcollection rather than an array on the notice, because a `targetType: all` notice is read by every driver and an array would grow without bound.

#### `drivers`

The **person**. Added by §0.16.

| Field | Type | Written by | Notes |
|---|---|---|---|
| `name` | string | Admin | |
| `phoneMasked` | string | Admin | **Q4's answer.** The masked phone (`98XXXXXX10`). **The raw phone is NOT in this doc** |
| `vanId` | string | Admin | The allotted van. **Checked by the bind callable** (Q1) |
| `routeId` | string | Admin | The allotted route |
| `wardIds[]` | array | Admin | The allotted wards |
| `active` | bool | Admin | False means the driver cannot log in |
| `updatedAt` | Timestamp | Admin | **NEW.** When the allotment changed |
| `updatedBy` | string | Admin | **NEW.** Who changed it |
| `pinHash` | string | Admin | **NEW, optional.** Absent by default. Enables the stronger identity option (section 4.4) |

**The doc id is the normalized code.** `^[A-Z]{2}-[0-9]{4}$` (AB-1234). `normalizeDriverCode` in `lib/core/models/driver.dart` handles the input shape; the admin panel must write the **normalized** form.

**The phone masking rule, settled by Q4.** The driver's phone is PII and the rules must never let one driver read another's.

**Q4's answer: masked only, and the mask is written at the source.**

| Storage option | How | The driver's read | Verdict |
|---|---|---|---|
| **(a) `drivers.phoneMasked` only** | The admin panel masks on write. `maskDriverPhone` already produces `98XXXXXX10` | `get drivers/{code}` returns `phoneMasked` and nothing sensitive | **CHOSEN** |
| (b) Both in the same doc | `phone` and `phoneMasked` side by side | **`get` leaks `phone`**, because a Firestore `get` returns the whole document | **Rejected** |
| (c) Both, in separate docs | `drivers/{code}` masked, `staffPhones/{code}` raw | Clean separation. The raw phone is behind the staff wall | **Chosen alongside (a)** |

**Why (b) is rejected even though it looks harmless.** A `get` has no field projection in Firestore. The rules can restrict **which document** a caller may read, but not **which fields** it gets back. So the raw phone cannot sit in the same doc as the masked one. **This is the same lesson as B-24's `flagged` field**: a collection-level rule is not enough, the field has to not be there.

**The raw phone's new home.** If the office wants the raw phone inside Firebase, it goes into its own collection:

#### `staffPhones` (NEW)

| Field | Type | Written by | Notes |
|---|---|---|---|
| `phone` | string | Admin | The raw phone. **Never in the driver's read path** |
| `updatedAt` | Timestamp | Admin | When the phone was last changed |
| `updatedBy` | string | Admin | Who changed it |

**The doc id is the driver code**, so the admin panel looks up the raw phone with the same key it uses for the driver.

**The migration is a hard prerequisite.** The live `drivers` docs have a raw `phone`. The migration is:

| Step | What | When |
|---|---|---|
| 1 | Read every `drivers` doc, compute `maskDriverPhone(phone)` | Before the rules deploy |
| 2 | Write `phoneMasked` into the doc | Before the rules deploy |
| 3 | Write the raw phone into `staffPhones/{code}` | Before the rules deploy |
| 4 | **Delete the raw `phone` field** from every `drivers` doc | **Before** the rules deploy |
| 5 | Deploy the new rules | Last |

**Why step 4 must come before step 5.** If the rules deploy first, the old raw `phone` is still in the doc and the `get` still leaks it. The rules do not redact, they only allow or deny. **So the order is data first, rules second.** This is a deploy trap worth putting in the runbook.

#### `vanDevices` (NEW)

**This is the authorization anchor.** It is the answer to *"what proves that the person holding this phone is the driver they claim to be?"*

| Field | Type | Written by | Notes |
|---|---|---|---|
| `installId` | string | Functions | The app's UUID, generated on first launch and stored in `SharedPreferences` |
| `boundAt` | Timestamp | Functions | When the binding happened |
| `boundBy` | string | Functions | The driver code that claimed it |
| `claimMode` | string | Functions | **`firstClaim` or `preProvisioned`.** Records how the binding was made (Q1) |
| `pairingCode` | string | Admin | An office-issued code. **Optional**, only if the office upgrades past first-claim |

**No client rule.** `vanDevices` is **server-only**. No client reads it, no client writes it. It is the source of truth for the custom claim.

**Under Q1's first-claim answer, the callable creates the doc.** So `claimMode` starts as `firstClaim`, and the Phase 11 hardening changes the callable to match-only. The field exists so the office can tell, later, which vans were claimed by accident.

#### `trips/{id}/trail` (NEW)

The sharded GPS trail. See section 6.4 for why.

| Field | Type | Notes |
|---|---|---|
| `points[]` | array of `{lat, lng, t}` | ≤ 1000 points per chunk |
| `from` | Timestamp | The first point's time |
| `to` | Timestamp | The last point's time |

The doc ids are `0`, `1`, `2`, … in order. A read is a subcollection query ordered by the doc id.

---

## 4. The auth and identity model

### 4.1 The current state, stated plainly

| Fact | Evidence |
|---|---|
| The driver app signs in **anonymously** | `lib/core/config/firebase_bootstrap.dart` |
| Every Firestore rule is `request.auth != null` | `firestore.rules`, all 7 collection matches |
| The driver code is a **badge, not a secret** | PRD-2 §0.16 `:193` |
| The user app (planned) will also be anonymous | PRD-2 §0.8: *"Anyone (anonymous auth) can create complaints and ratings"* |
| The admin panel (planned) should use real accounts with staff claims | PRD-2 §0.8 `:70-71` |

**The consequence, in one sentence.** An anonymous session is not an identity, so a rule that only asks *"is there a session?"* cannot tell driver AB-1001 from AB-1002, cannot tell the user app from the driver app, and cannot tell the admin panel from a random phone. **Every rule must be scoped to something the server knows about the caller.**

### 4.2 The three sessions

| Session | How it is created | What the token carries | What the rules can ask |
|---|---|---|---|
| **User app** | Anonymous sign-in | `uid` (an anonymous uid) | *"Is this a session at all?"* |
| **Driver app** | Anonymous sign-in → `signInWithCustomToken` from `bindDeviceToVan` | `uid`, `vanId`, `driverId`, `installId` | *"Is this the van's phone? Is this the driver's shift?"* |
| **Admin panel** | Firebase Auth (email/password or Google) → custom claims set by an admin | `uid`, `role`, `staffId` | *"Is this a staff member, and which wards?"* |

**All three are custom claims.** One mechanism, three payloads. The rules then read `request.auth.token.<claim>`.

### 4.3 The driver app's two-factor model

**The hardware reality** (`GLOSSARY.md:7-8`): *"One van serves one route and carries one tracked Android phone."* The **phone is the van's**. The driver is a person who borrows it.

That fact drives the design:

| Factor | What it proves | Where it lives | Strength |
|---|---|---|---|
| **Device binding** | *This phone is van-01's phone.* | `vanDevices/{vanId}` → a `vanId` custom claim | Van-level authorization |
| **Driver badge code** | *This shift is attributed to AB-1001.* | `drivers/{CODE}` → `trips.driverId` | Attribution, not authorization |

**With the device binding in place, the code is free to stay a public badge.** It no longer has to carry the whole burden of identity, and the rules finally have something to scope on.

**What this fixes immediately:**
- The rules can check `request.auth.token.vanId` (the P0 security hole, section 5.1)
- A trip write is scoped to the bound van
- `vans.status` and `currentTripId` can become server-only writes

**What it does not fix, stated honestly.** Two drivers allotted the **same** van can still attribute a shift to each other, because the code carries no secret. The seed data has exactly this shape: `AB-1001`, `AB-1002` and `AB-1004` all on `van-01`.

**The residual risk in full:** the impersonator must be physically holding the van's phone. That is a **physical-co-location constraint**, so it is low severity. But it is real, and it should be a **conscious acceptance**, not an oversight.

### 4.4 The four options, ranked

| Option | Mechanism | Server work | Strength | Cost |
|---|---|---|---|---|
| **A. Device binding only** | The model above | 1 callable + 1 rules rewrite | Van-level authorization. Driver attribution is self-reported | **Low. Recommended now** |
| **B. Device binding + per-driver PIN** | Add `drivers/{CODE}.pinHash`; the driver enters badge **and** PIN | 1 hash write + 1 check in the callable | Per-driver attribution. A PIN is a 10k space, rate-limitable, shareable, shoulder-surfable | Medium |
| **C. Device binding + per-driver OTP** | SMS/email OTP to the driver's registered phone | An SMS provider, a code table, an expiry | Strong per-driver attribution | High |
| **D. Admin-issued device credential** | The admin panel issues a pairing token; the app stores a signed credential | A signing key, a pairing flow, a revocation list | Strongest. The device is provisioned, not self-claimed | High, and PRD-3 is out of scope |

**Recommendation.** Ship **A** now. Design the schema so **B** can be added **without a migration**: put the optional credential in `drivers/{CODE}` from day one, defaulted to absent.

**Why A is enough for the office's stated goal.** The goal (`GLOSSARY.md`, PRD story 16) is *"every trip records which driver ran it"*. **A** satisfies accountability-by-code. **B** satisfies accountability-by-identity. Let the office choose when the admin panel exists.

**The office's decision, 2026-11-01: option A, with first-claim provisioning.** So the shipped model is:

| Part | Choice |
|---|---|
| **Identity mechanism** | **A. Device binding only.** One callable, one rules rewrite |
| **Provisioning** | **First-claim** (Q1's answer). The callable creates the binding |
| **The optional per-driver credential** | Still designed in from day one, defaulted to absent. So **B** can be added later with **no migration** |

**What that buys and what it costs.**

| Buys | Costs |
|---|---|
| Van-level authorization closes the P0 (B-01) | The first phone to present a valid code **owns the van**. That is a conscious acceptance |
| The claim race is settled by a transaction | A wrong claim needs a **console write** to undo. That must be a runbook step |
| The driver attribution is by code, which is the contract today (§0.16) | The driver can be impersonated by someone holding the van's phone and knowing the code. **Physical co-location** constraint, so low severity |
| One callable, not two | The schema carries an unused `pinHash` field. That is the **cost of the no-migration promise**, and it is one nullable field |

### 4.5 The device-binding lifecycle

**The office has answered Q1: first-claim.** The first phone to present a valid driver code claims the van. This is the lifecycle.

```
1. The app generates an installId (uuid) on first launch → SharedPreferences
2. The app signs in ANONYMOUSLY (today's behaviour, unchanged)
3. The app calls bindDeviceToVan({ installId, vanId, driverCode })
4. The server, INSIDE A TRANSACTION on vanDevices/{vanId}:
      a. reads drivers/{driverCode}; rejects if !active or the vanId mismatches
      b. reads vanDevices/{vanId}
         - if absent         → CREATE it with this installId   (first claim)
         - if present and the installId matches → OK            (re-login)
         - if present and the installId differs → REJECT        (wrong phone)
      c. mints a custom token { installId, vanId, driverId } and returns it
5. The app calls signInWithCustomToken(token) → the session now carries vanId
6. The rules can now scope by request.auth.token.vanId
```

**Step 4 must be a transaction.** Two phones presenting the same code at the same moment both try to create the binding. Without a transaction, both succeed and the van has **two** bound devices. With one, the second gets **"already claimed"**, which is the `vanAlreadyClaimed` conflict reason from Q2.

**The weak link is step 4b: the first device to present a valid driver code claims the van.** First-claim is now the **chosen** model, so the mitigations become requirements.

| # | Mitigation | Status under first-claim | Cost |
|---|---|---|---|
| 1 | Accept it for the demo. Record the binding visibly so the office can spot a wrong claim | **REQUIRED.** This is now the primary safety net | Zero |
| 2 | **Pre-provision** `vanDevices/{vanId}` from the admin panel with the expected install id, and let the callable only **match**, never **create** | **Recommended as the Phase 11 hardening.** It turns the callable into match-only, which removes the race entirely | Zero (a console write) |
| 3 | Require an office-issued `pairingCode` to create the binding | When PRD-3 exists | A pairing flow in the admin panel |

**What first-claim obligates the build to include.**

| Obligation | Why |
|---|---|
| **The transaction in step 4** | The claim race is real. Two phones, one van, one binding |
| **A `vanAlreadyClaimed` conflict reason** | The loser of the race needs a **clear message**, not a generic failure. This is Q2's third reason |
| **A documented recovery step** | A wrong claim is fixed by **deleting the `vanDevices/{vanId}` doc** in the console. There is no admin panel, so this must be a **runbook line**, not tribal knowledge |
| **A stable `installId`** | It must survive app restarts. A per-launch random value would create a **new** binding every launch |
| **A `drivers.vanId` check** | The claim must still verify the driver is **allotted** that van. Otherwise any valid code claims any van, and first-claim turns that into a takeover |

**The one thing first-claim does NOT fix.** It does not stop a driver with the **wrong** code from claiming the **wrong** van, if the codes happen to match. That is why the `drivers.vanId` check is in step 4a and is **not optional**.

**The net effect on the build.** The callable is a **create-or-match**, not a match-only. That is one extra branch in one Function, plus a transaction. **It is cheaper than it sounds, and it is the office's decision, so it is now settled.**

### 4.6 The admin panel's identity

The admin panel needs **scoped** access, not blanket access.

**The claim payload:**

| Claim | Value | Where it comes from |
|---|---|---|
| `role` | `inspector` / `chief_officer` / `tdo` / `ddo` | `staff/{id}.role` |
| `staffId` | the `staff` doc id | The staff document |
| `wardIds` | the staff member's ward list | `staff/{id}.wardIds[]` |

**The scope check.** A staff member may act on a complaint only if `complaint.wardId` is in their `wardIds[]`. The rule needs the ward list **in the token** (a claim), because a Firestore rule can read `get()` but doing so on every document read is expensive and easy to get wrong.

**The claim refresh problem.** Claims live in the token and do not refresh until the user re-signs in. If the office changes a staff member's wards, their token is stale until the next sign-in.

| Options | Trade-off |
|---|---|
| Accept the staleness. The staff member re-logs in after a ward change | Simplest. The claim is set at sign-in |
| A `staffSessionProvider` that re-mints the token when the staff doc changes | Correct, and it is a small Function. **Recommended** if the office changes scopes often |
| A short token lifetime (15 min) with a refresh | Firebase custom tokens are long-lived by default. Forcing a short life is fiddly |

**Recommendation:** accept the staleness for the demo, and note it in the admin panel's UI ("your scope was last refreshed at ..."). Implement the re-mint only if the office complains.

**Q5's answer: option 1 now, option 2 in Phase 11.** The claims are minted at sign-in, and the admin panel shows *"your scope was last refreshed at ..."*. The re-mint Function lands in Phase 11 as hardening.

**But the staleness is only acceptable for a scope change, not for a revocation.** A revoked staff member keeps their claims until the token expires. So the admin panel's writes go through **callables**, and every callable checks `staff/{id}.active` against the **doc**.

| What the admin panel does | How it reaches Firestore | Why |
|---|---|---|
| **Reads** (lists complaints, vans, trips) | Direct Firestore queries, scoped by the `wardIds` claim | Reads are cheap and the scope check in the rule is enough. A stale scope for a few hours is acceptable |
| **Writes** (resolve a complaint, assign, publish a notice, edit a driver) | **Through callables** | A revoked staff member must be locked out **immediately**, and only a server-side doc check can do that |
| **Staff management** (create a staff member, change a role, deactivate) | **Through callables** | Same reason. A staff member must not be able to promote themselves |

**Why this split is the industry answer.** The rule for the admin panel is the same rule every SaaS backend uses:

| Concern | Where it belongs | Why |
|---|---|---|
| **Who may see this row** | The rules, using the claims | It is a filter, and it runs on every read for free |
| **Who may do this action** | The server, using the doc | It is a decision, and it must see the **live** state, not a cached claim |
| **What changed** | An audit log on the server | The client cannot be trusted to write its own audit trail |

**The callables the admin panel needs.** Small, one per action class, each doing the same three steps:

| Callable | Does | Checks |
|---|---|---|
| `setComplaintStatus` | Set `status`, `assignedTo`, `escalationLevel`, `note` | `staff.active`, `staffCoversWard(wardId)`, role allowed for the action |
| `publishNotice` | Create a `notices` doc | `staff.active`, `staffCoversWard(targetId)` |
| `upsertDriver` | Create or update a `drivers` doc, masking the phone | `staff.active`, role in `tdo`/`ddo` |
| `upsertStaff` | Create or update a `staff` doc | `staff.active`, role in `tdo`/`ddo` |
| `setVanDepot` | Set `vans.depot` | `staff.active`, role in `tdo`/`ddo` |

**Every one of them follows the same shape**, which is what makes them cheap to write and cheap to audit:

```
1. Verify the caller's token has a staffId and a role.        (reject if not)
2. Read staff/{staffId}.active.                                 (reject if false)
3. Check the action's ward against the live staff/{staffId}.wardIds[].
4. Do the write with the Admin SDK.
5. Write an entry to an audit log.
```

**Step 2 is the whole reason for the callables.** It is one `get()` on one small doc, and it is what makes revocation instant. **Step 3 uses the live doc, not the claim**, so a scope narrowing also applies immediately for writes, even though reads stay stale until the next sign-in. **That asymmetry is fine, and it is the safe direction**: a write is the dangerous direction, so it gets the stricter check.

**The audit log is not optional.** The admin panel is the tool that holds the truth, so it needs to be able to answer *"who closed this complaint and when?"*. A client-written field is not evidence, because a client can lie. The server writes it.

**The claim refresh problem is now half-solved.** With the doc check, a revocation and a write-scope change are instant. The remaining staleness is only **read** scope, and it resolves at the next sign-in. **The admin panel must still show the refresh time**, because a stale read scope is still confusing to the office.

**One thing the callables must not become.** They must not become a general-purpose RPC layer. Each one is a **named business action**, not a generic "update document" endpoint. A generic endpoint would let a caller pass a field path and reintroduce the whole class of holes the rules were meant to close.

---

## 5. The Firestore rules

### 5.1 What exists today, and why it is a P0

```dart
// firestore.rules, every single collection
allow read:  if request.auth != null;
allow write: if request.auth != null;
```

**The gap, in one table.** The app signs in anonymously, so `request.auth != null` means *"some device, somewhere, has a session"*.

| What an anonymous caller can do today | Rule | Consequence |
|---|---|---|
| Read `drivers/{code}` → `name`, `phone` | `:29` | **PII leak.** Every driver's phone number is enumerable. The code is public by design, so the phone is the only secret here and it is fully exposed |
| Read every `trips` doc → `gpsTrail`, `wardsDone` | `:32` | The full location history of every driver, every day |
| Create **and** update any trip | `:35` | Rewrite a completed shift. Mark wards done that were never done. Forge `mockLocationDetected = false` to clear a tampering flag |
| Update any `vans` doc, including `status` and `currentTripId` | `:13-15` | **Van takeover.** Set another van's `currentTripId` to your own trip and `status = on_shift` |
| Update any `complaints` → `status`, `resolvedAt` | `:42` | Close a complaint against a citizen without ever visiting the ward |
| Read every `wards`, `routes`, `notices` doc | `:18, 21, 24` | Lower severity, the same class |
| Write 20 MB of any image anywhere under `/apps/{appId}/media/**` | `storage.rules:12-15` | Storage abuse. The `{appId}` path segment is never checked against anything |

**The stance in §0.16 is correct about the code and silent about everything the code unlocks.** The badge is public. The phone number, the trip history and the van are not.

#### This is not a reading of the rules file. It was probed.

A **17-probe harness** was run against a **real Firestore emulator** (port 8080) with a **real Auth emulator** (port 9099), using the repo's own `firestore.rules`. **17/17 probes matched the predicted result.** The probes ran in a throwaway `/tmp` copy, so nothing in the repo was touched.

| # | Probe | Predicted | Actual |
|---|---|---|---|
| 1 | `LIST drivers` (all driver docs, name + phone) | ALLOW | **ALLOWED 200** |
| 2 | `LIST vans` | ALLOW | **ALLOWED 200** |
| 3 | `LIST trips` | ALLOW | **ALLOWED 200** |
| 4 | `LIST complaints` | ALLOW | **ALLOWED 200** |
| 5 | `LIST notices` | ALLOW | **ALLOWED 200** |
| 6 | `GET vanSecrets/van-01` | DENY | **DENIED 403** |
| 7 | `LIST vans` with **no token** | DENY | **DENIED 403** |
| 8 | `GET drivers/{code}` with **no token** | DENY | **DENIED 403** |
| 9 | `PATCH vans/van-01` → `status` + `currentTripId` (**a foreign van**) | ALLOW | **ALLOWED 200.** After-state: `status=idle, currentTripId=trip-foreign` |
| 10 | `PATCH vans/van-02` → `batteryPct` (**a different van**) | ALLOW | **ALLOWED 200.** After-state: `batteryPct=1` |
| 11 | `PATCH vans/van-01` → `plateNo` (out of scope) | DENY | **DENIED 403** |
| 12 | `CREATE vans/van-99` | DENY | **DENIED 403** |
| 13 | `PATCH trips/trip-foreign` → `driverId`, `wardIds`, `alertedWardIds`, `endedAt` | ALLOW | **ALLOWED 200.** The write landed |
| 14 | `CREATE trips/trip-new` | ALLOW | **ALLOWED 200** |
| 15 | `PATCH complaints/foreign-complaint` → `status`, `escalationLevel`, `assignedTo` | ALLOW | **ALLOWED 200.** After-state: `status=resolved, escalationLevel=2, assignedTo=me` |
| 16 | `CREATE complaints/c-new` | ALLOW | **ALLOWED 200** |
| 17 | `CREATE drivers/AB-9999` | DENY | **DENIED 403** |

**What the probes prove beyond the reading.**

- **Probe 9 is the worst one.** An anonymous caller rewrote **another van's** `status` and `currentTripId`, and the write **landed**.
- **Probe 13** rewrote a foreign trip's `driverId` and `wardIds`. That is trip ownership theft, and it is what makes F-20 and the offline-trail gap exploitable.
- **Probe 15** closed a complaint and escalated it to level 2 **in a single write**. The citizen never called anyone.
- **Probes 1 to 5** confirm the PII leak is total. A phone number is a 10-digit enumeration, not a secret.

**Probe 6 is the good news.** `vanSecrets` has **no rule at all**, so it is denied by default. That one is already correct, and it matches PRD `:69`.

**The one caveat.** The emulator does not enforce composite indexes. A deliberately index-less control query (`routeId` + `vanId` + `driverId` + `date`) also returned **200**. So **a green emulator run is NOT proof of index coverage.** The index work (section 8) has to be reasoned from Firestore's documented rules and verified against the real project.

### 5.2 The proposed rules, collection by collection

This is the target. Every rule below is written to be implementable in Firestore rules.

**The decisions these rules encode.** All three are settled (section 12).

| Decision | What it changes in the rules |
|---|---|
| **Q3 + Q7: §0.8's model wins.** The rules scope on **custom claims** | Every write rule checks `request.auth.token.vanId` or `driverId`. **This is the P0 fix.** The PRD's `:193` sentence *"the rules carry no custom-claim checks"* is corrected, because the 17 emulator probes proved that reading it literally leaves the P0 open |
| **Q4: masked phone only** | The `drivers` read is **field-restricted**, so the raw phone cannot leak through the same doc. A collection-level rule is **not enough** |
| **Q6: the complaint is scoped by the `deviceId` claim** | The `deviceId` comes from `request.auth.token.deviceId`, **not** from a client query parameter. If the client names its own scope, it can read another device's complaints. Same class of bug as B-01 |

#### The helper functions

```
// A driver session bound to a van.
function driverVan() {
  return request.auth != null
      && request.auth.token.vanId is string
      && request.auth.token.vanId != '';
}

// The badge code, resolved server-side into a claim. The code NEVER
// appears in a rule. It is only an attribution label.
function isOwnDriver(code) {
  return request.auth != null
      && request.auth.token.driverId == code;
}

// A staff session. The claims come from the admin panel's sign-in.
function isStaff() {
  return request.auth != null
      && request.auth.token.role is string
      && request.auth.token.staffId is string;
}

// The staff member's ward scope, carried in the token so the rule does
// not need a get() on every document.
function staffWardIds() {
  return request.auth.token.wardIds is list
      ? request.auth.token.wardIds
      : [];
}

// True when the staff member's scope includes this ward.
function staffCoversWard(wardId) {
  return isStaff() && wardId in staffWardIds();
}

// True when the driver's own van is the one in the path.
function isOwnVan(vanId) {
  return driverVan() && request.auth.token.vanId == vanId;
}
```

#### The reference data (read-only to every app)

```
// Reference data. Every app may read it: the driver app needs its route
// and wards, the user app needs its ward and route, the admin panel needs
// the map. These documents contain no PII and no state.
match /wards/{wardId} {
  allow read: if request.auth != null;
  // The admin panel edits wards through a callable too, for the same
  // revocation reason (Q5).
  allow write: if false;
}
match /routes/{routeId} {
  allow read: if request.auth != null;
  allow write: if false;
}
```

**Why the admin writes need a scope check.** A chief officer should be able to edit their own taluka's wards, but not another taluka's. `staffCoversWard` gives that.

**Why every admin write is a callable, not a rule.** This is the one architectural decision in the rules file, and it is forced by Q5. A rule can check the **token**. A callable can check the **live doc**. Since a revoked staff member's token stays valid for up to an hour, **any admin write that matters must be server-side.**

**The rule of thumb for the whole file.**

| Write | Who | How |
|---|---|---|
| Reference data (`wards`, `routes`) | Admin | Callable |
| `vans` (telemetry) | Driver | **Rule.** The driver owns it via the `vanId` claim |
| `vans` (depot, plate, route, stale-marker fix) | Admin | Callable |
| `trips` | Driver | **Rule**, but Phase 5 moves the shift writes to callables |
| `trips` trail chunks | Driver | **Rule.** The parent trip's `vanId` is the scope |
| `complaints` (create) | User app | **Rule.** The `deviceId` claim is the scope |
| `complaints` (D4 buttons) | Driver | **Rule.** The trip's ward list is the scope |
| `complaints` (status, assignment) | Admin | Callable |
| `notices` | Admin | Callable |
| `drivers`, `staffPhones`, `staff` | Admin | Callable |
| `ratings` | User app | **Rule.** The `deviceId` claim is the scope |
| `vanDevices` | Nobody | **Nobody.** Server only, Admin SDK |

**The pattern.** A write is a **rule** when the claim is the authority (the driver's own van, the citizen's own complaint), and a **callable** when the authority is a **live document** (the staff member's current status and scope).

#### `vans`

```
match /vans/{vanId} {
  // Read: any signed-in app. The user app needs to see the vans on its
  // route, and the admin panel needs to see them all. The document has
  // no PII (plateNo, routeId, status, location).
  allow read: if request.auth != null;

  // Telemetry only. The driver writes its OWN van's location and battery.
  // status and currentTripId are deliberately NOT here: they are shift
  // ownership markers and belong to the server (see the startShift /
  // endShift callables).
  allow update: if isOwnVan(vanId)
    && request.resource.data.diff(resource.data).affectedKeys()
       .hasOnly(['lastLocation', 'batteryPct']);

  // The admin panel's writes (depot, plateNo, routeId, and the manual
  // "clear a stale marker" job) go through the `setVanDepot` callable,
  // so a revoked staff member loses access immediately (Q5).
  allow update: if false;
}
```

**The two-update-rule pattern.** Firestore ORs multiple `allow` rules, so two `update` rules with different field sets work: a driver matches the first, an admin matches the second. **They must not overlap on the same field**, or a driver could write `status`.

**The admin's `status` and `currentTripId` writes.** The admin panel may set a van's status manually (the "clear a stale marker" job from B-19). That is legitimate and admin-only, and it goes through the callable. **The callable is where the check happens**, so the rule does not need to duplicate it.

**Why the admin's rule is `if false` and not a scoped write.** A rules-based admin write would be checked against the **token's** claims, which can be an hour stale. A revoked staff member would keep the ability to clear a stale marker for up to an hour. **The callable reads `staff/{id}.active` live**, so revocation is instant. **Deny by default is what makes the callable the only path.**

#### `trips`

```
match /trips/{tripId} {
  // Read: a driver reads their own van's trips. The user app reads
  // today's trips of its route (for the "collected today" display). The
  // admin panel reads within scope.
  //
  // Three readers:
  // (1) The DRIVER reads their own van's trips. The `vanId` claim is
  //     the scope.
  // (2) The USER APP reads today's trips of ITS route, for the
  //     "collected today" display. The `routeId` claim is the scope.
  // (3) The ADMIN reads within scope.
  allow read: if request.auth != null
    && (resource.data.vanId == request.auth.token.vanId
        || resource.data.routeId == request.auth.token.routeId
        || isStaff());

  // Create: only the bound driver, only their own van, and only the
  // fields that belong at creation. driverId and wardIds are snapshotted
  // from the driver document, so they must match it.
  allow create: if driverVan()
    && request.resource.data.vanId == request.auth.token.vanId
    && request.resource.data.driverId == request.auth.token.driverId
    && request.resource.data.diff(resource.data).affectedKeys()
       .hasOnly(['vanId', 'routeId', 'driverId', 'wardIds', 'date',
                 'startedAt', 'endedAt', 'wardsDone', 'alertedWardIds',
                 'gpsTrail', 'mockLocationDetected'])
    && request.resource.data.wardsDone.size() == 0
    && request.resource.data.alertedWardIds.size() == 0
    && request.resource.data.gpsTrail.size() == 0
    && request.resource.data.mockLocationDetected == false;

  // Update: the driver may mark wards done, flag, and append trail
  // points. They may NOT rewrite driverId, wardIds, vanId or date.
  allow update: if driverVan()
    && resource.data.vanId == request.auth.token.vanId
    && request.resource.data.vanId == resource.data.vanId
    && request.resource.data.driverId == resource.data.driverId
    && request.resource.data.wardIds == resource.data.wardIds
    && request.resource.data.date == resource.data.date
    && request.resource.data.diff(resource.data).affectedKeys()
       .hasOnly(['endedAt', 'wardsDone', 'gpsTrail']);
}
```

**The `diff().affectedKeys().hasOnly()` idiom.** This is the single most important rule pattern. It says *"this write may touch these fields and no others"*. Every write rule in this file should use it.

**The "the new value must equal the old value" idiom.** For the fields that must not change, the rule checks `request.resource.data.X == resource.data.X`. Without it, a driver could put `wardsDone` in the allowed list and also rewrite `driverId`.

**Why `wardsDone.size() == 0` at create.** The trip starts with nothing done. A create that arrives with wards already done is either a bug or an attack.

#### `trips/{tripId}/trail` (the sharded trail)

```
match /trips/{tripId}/trail/{seq} {
  allow read: if request.auth != null
    && (get(/databases/$(database)/documents/trips/$(tripId)).data.vanId
        == request.auth.token.vanId
        || isStaff());
  allow create: if driverVan()
    && get(/databases/$(database)/documents/trips/$(tripId)).data.vanId
       == request.auth.token.vanId
    && request.resource.data.points.size() <= 1000;
  allow update, delete: if false;   // Chunks are immutable and ordered.
}
```

**Chunks are immutable.** A chunk that has been written is part of the trail's history. Making it append-only means a bug cannot rewrite the past, and it means the read is a simple ordered query.

**The `get()` cost.** A rule that reads the parent doc does one extra read per evaluation. Firestore caches these, so the cost is acceptable. The alternative (a denormalized `vanId` on each chunk) costs a bigger document, and the parent read is the standard pattern.

#### `drivers`

```
match /drivers/{code} {
  // Read by doc id only. The app never lists drivers, so `list` is denied
  // outright. This is what stops the phone-number enumeration.
  //
  // The first branch is the driver's OWN record. The second branch is
  // "same route", which lets a driver see a colleague's name and van
  // for the shift handover. The second branch CANNOT see the phone,
  // because the phone is not in this doc at all (Q4).
  allow get: if request.auth != null
    && (isOwnDriver(code)
        || (driverVan()
            && get(/databases/$(database)/documents/vans/$(request.auth.token.vanId)).data.routeId
               == resource.data.routeId));
  allow list: if false;

  // Writes go through the `upsertDriver` callable, which masks the phone
  // before storing it. Deny by default, so the callable is the only path.
  allow write: if false;
}
```

**The `list: if false` is the whole fix for the PII leak.** The driver app reads its driver by doc id (`_db.collection('drivers').doc(code).get()`). Nothing lists the collection. Denying `list` costs nothing and stops the enumeration.

**But `list: if false` is NOT enough on its own.** A `get` returns the **whole document**, including every field. If the raw phone is in the same doc, the `get` leaks it. **So the phone must not be in the driver's read path at all.** That is Q4's decision, and it forces the storage shape.

**Q4's answer, in the rules.** The driver app only ever needs the masked phone (`98XXXXXX10`) for the confirm card. So:

| Storage option | How | The driver's read | Cost |
|---|---|---|---|
| **(a) Store only the masked phone** | The admin panel masks on write. The raw phone lives in the admin's own system, or in a separate `staff`-only collection | `get drivers/{code}` returns only `phoneMasked` | **Simplest. Chosen (Q4)** |
| (b) Store both in the same doc | `phone` and `phoneMasked` on the driver doc | **`get` leaks `phone`**, because a get returns everything. **This needs a separate doc for the raw phone** | More moving parts |
| (c) Store both, separate docs | `drivers/{code}` has the masked one. `staffPhones/{code}` has the raw one | Clean, but two writes per driver | A second collection and a second admin screen |

**The chosen shape.** The `drivers` doc holds **`phoneMasked` only**. The raw phone, if the office needs it in Firebase, goes into a **separate collection** that only the staff rules can read.

#### `staffPhones`

```
match /staffPhones/{code} {
  // Q4: the raw phone is an office record. It lives behind the staff
  // wall, never in the driver's read path.
  allow read: if isStaff();

  // Writes do NOT go through the client. They go through the
  // `upsertDriver` callable, which masks the phone before it stores it
  // (Q5's shape). So the client never needs write access here.
  allow write: if false;
}
```

**Why the write is denied even to staff.** The admin panel writes a driver's phone through the **`upsertDriver` callable**, not directly. The callable is where the masking happens, so the raw phone is never sent to Firestore by a client. **If staff could write directly, a future admin-panel developer would write the raw phone into `drivers` by mistake, and the leak comes back.**

**The rule that enforces this is the absence of a write rule.** There is no "staff can write" line here. **Deny by default is the only way to make "go through the callable" true.**

**The migration note.** The current `drivers` docs have a raw `phone` field. **Renaming it to `phoneMasked` and masking the value is a data migration**, and it must happen **before** the new rules go live, not after. Otherwise the first deployment of the new rules still leaks the old raw values through the `get`.

**The check that proves it.** After the migration and the rules deploy, run the emulator probe: **`get drivers/{ownCode}` as a bound driver, and assert the response contains no `phone` key.** One probe, one assertion, and it closes the phone-number leak permanently. That probe is case 3 in the D.3 suite, with the field assertion added.

**Why the admin panel can still see the raw phone.** The staff rules read `staffPhones/{code}`, which is staff-scoped. So the office keeps what it needs, and the driver app never sees it. **That is the whole point of Q4.**

#### `complaints`

```
match /complaints/{complaintId} {
  // Read: the citizen reads their own (by deviceId). The driver reads
  // the complaints in their current trip's wards. The admin reads within
  // scope.
  //
  // Q6: the deviceId comes from the CLAIM, never from a client-sent
  // value. A client that names its own scope can read another device's
  // complaints. Same class of bug as B-01.
  allow read: if request.auth != null
    && (resource.data.deviceId == request.auth.token.deviceId
        || driverVan()
        || (isStaff() && staffCoversWard(resource.data.wardId)));

  // Create: the user app. Only the citizen's own fields. status and
  // escalationLevel are set by the server, not the client.
  allow create: if request.auth != null
    && request.resource.data.deviceId == request.auth.token.deviceId
    && request.resource.data.diff(resource.data).affectedKeys()
       .hasOnly(['ticketId', 'deviceId', 'category', 'photoUrl', 'location',
                 'wardId', 'createdAt']);

  // Update: TWO different update paths, and they must not overlap.
  //
  // (1) The DRIVER's D4 buttons: status and resolvedAt only, and only on
  //     a complaint whose ward is in the driver's CURRENT trip's wards.
  // (2) The ADMIN: goes through the `setComplaintStatus` callable, so
  //     there is NO client write rule here. A rules-based admin write
  //     would trust the token's claims, which can be an hour stale
  //     (Q5). The callable reads staff/{id}.active live.
  allow update: if driverVan()
    && request.resource.data.diff(resource.data).affectedKeys()
       .hasOnly(['status', 'resolvedAt'])
    && resource.data.wardId in
         get(/databases/$(database)/documents/trips/$(request.auth.token.currentTripId)).data.wardIds
    && request.resource.data.status in ['assigned', 'resolved'];
}
```

**Q6's claim, and why it is the load-bearing one.** `request.auth.token.deviceId` is set at the user app's session bootstrap and **cannot be changed by the client** after sign-in. If the rules instead read `resource.data.deviceId == request.query.deviceId` or took the `deviceId` from the request body, then **any caller could read any complaint** by changing the id. That is the **exact same bug class as B-01**, just in a different collection. **The claim is the whole protection.**

**The `create` rule also checks the claim.** Without `request.resource.data.deviceId == request.auth.token.deviceId`, a caller could file a complaint **on behalf of** another device. Then that other device would see a complaint it never made, and the real filer would see nothing.

**Q6's accepted limitation.** A reinstall loses the `deviceId`, so the citizen loses their complaint history **in the app**. The complaint still exists and the office still sees it. **This must be a handover note**, so nobody debugs it as a bug later.

**The `currentTripId` claim.** The driver's D4 rule needs to know the trip's wards. Two ways:

| Way | How | Recommendation |
|---|---|---|
| **(a) Put `currentTripId` in the token** | The `bindDeviceToVan` callable cannot know the trip (the trip does not exist yet). The `startShift` callable can mint a token with it | **Use this.** It makes the D4 rule a pure token check |
| (b) Read the van doc in the rule | `get(/vans/{token.vanId}).data.currentTripId`, then read the trip | Two `get()`s per rule evaluation. Works, but slower and more brittle |

**This means the `startShift` callable must return a fresh custom token** carrying `currentTripId`. The client signs in with it. That is a small addition to the callable's contract.

#### `notices`

```
match /notices/{noticeId} {
  allow read: if request.auth != null;

  // The admin panel publishes through the `publishNotice` callable, so
  // a revoked staff member loses access immediately (Q5).
  allow write: if false;
}
match /notices/{noticeId}/receipts/{driverCode} {
  allow read: if request.auth != null
    && request.auth.token.driverId == driverCode;
  allow create: if driverVan()
    && request.auth.token.driverId == driverCode;
  allow update, delete: if false;   // A read receipt is a fact, not an opinion.
}
```

**Why `notices` has no client write path.** The `sendNotice` Function fans a notice out to the topics, and the `publishNotice` callable creates the doc. Both are server-side. **A client-created notice would never reach the right devices**, because the fan-out listens for `firestore.onDocumentCreated`, which does fire for client creates, but then the creator could target any `targetId` and notify any van. **The callable checks the ward scope first.**

#### `ratings`

```
match /ratings/{ratingId} {
  allow create: if request.auth != null
    && request.resource.data.diff(resource.data).affectedKeys()
       .hasOnly(['wardId', 'date', 'stars', 'deviceId']);
  allow read: if request.auth != null
    && (resource.data.deviceId == request.auth.token.deviceId || isStaff());
  allow update, delete: if false;
}
```

#### `staff`

```
match /staff/{staffId} {
  // A staff member reads their own document. The admin panel reads the
  // staff in their scope (for assignment dropdowns).
  //
  // Q5: the token's wardIds can be up to one hour stale (the token
  // lifetime). A REVOKED account must lose access IMMEDIATELY, so the
  // `active` flag is checked against the DOC, not the token.
  allow read: if isStaff()
    && (request.auth.token.staffId == staffId
        || resource.data.wardIds hasAny staffWardIds());

  // Staff management goes through the `upsertStaff` callable. A
  // rules-based write would trust the token's role claim, which is
  // exactly the thing Q5 says must not be trusted.
  allow write: if false;
}
```

**Only a TDO or DDO manages staff.** An inspector cannot promote themselves. **That check lives in the `upsertStaff` callable**, not in a rule, because the callable can read the live `staff` doc.

**The read rule still uses the token's `wardIds`.** A stale read scope for up to an hour is acceptable, and the read is cheap. **The asymmetry is deliberate**: writes get the live check, reads get the token check.

**Q5's answer, and the one rule it forces.** Option A (scope refreshed at sign-in) has a known weakness: a **revoked** staff member keeps their scope until their token expires. So the rules must check the **doc**, not only the token:

| Action | Checked against | Latency |
|---|---|---|
| **Scope narrowing** (fewer wards) | The **token** | Up to the next sign-in (in practice, the 1-hour token lifetime). **Accepted** |
| **Revocation** (`active = false`) | The **staff doc**, on every privileged action | **Immediate.** The token is still valid, but the doc says no |

**The mechanism.** Every privileged admin action runs **server-side** (a callable, or a Function with the Admin SDK), and that server code reads `staff/{staffId}.active` before doing the work. **A rules-only check cannot do this**, because the rules would need a `get()` on every write, and the rules do not run for Admin SDK calls anyway.

**So the admin panel's writes are not direct Firestore writes.** They go through **callables**, and those callables check `staff/{id}.active`. That is the architecture, and it is why Q5's answer is safe.

**Why this is not over-engineering.** A revoked inspector with a live token and a broad scope can mark complaints resolved, assign work, and change notices. **That is a bigger hole than B-01**, because the admin panel is the tool that holds the truth.

**The one-hour token lifetime is the safety net, not the plan.** Firebase ID tokens expire after **1 hour**, and the client refreshes them. So option A's real refresh window is **1 hour, not forever**. But a token refresh does **not** change the claims, so the scope stays stale for the full hour. **Only the doc check closes revocation immediately.**

**The admin panel must show the refresh time.** One line: *"your scope was last refreshed at 2026-11-01 09:12"*. Without it, a stale scope is invisible and the office blames the app.

#### `vanDevices`

```
match /vanDevices/{vanId} {
  // Server only. No client rule at all. The Functions use the Admin SDK,
  // which bypasses rules entirely.
  allow read, write: if false;
}
```

**Q1's answer, in the rules.** Under **first-claim**, the binding is created by the `bindDeviceToVan` callable, **not** by the admin panel. The callable uses the Admin SDK, so it bypasses the rules, and `allow read, write: if false` is correct. **The client must never be able to write its own binding**, because that would let a caller bind itself to any van.

**The recovery path, since there is no admin panel.** A wrong claim is undone by **deleting the `vanDevices/{vanId}` doc** from the Firestore console. That is a **runbook step**, and it belongs in the handover notes.

**The one thing this collection must never have.** No client-readable field. The `installId` is a device identifier. It should not be listable, and it is not.

### 5.3 The Storage rules

```
service firebase.storage {
  match /b/{bucket}/o {
    // Complaint photos. The citizen writes their own; the office reads
    // them; the driver reads the ones in their wards.
    match /complaints/{complaintId}/{fileName} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && request.resource.size < 500 * 1024
        && request.resource.contentType.matches('image/.*');
    }

    // The admin panel's resolved photos and any driver media.
    match /media/{driverCode}/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && request.resource.size < 20 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');
    }
  }
}
```

**The 500 KB cap on complaint photos** is PRD §0.6's rule: *"Photos: compress under 500 KB."* The current `storage.rules` allows 20 MB for everything and checks the `{appId}` path segment against nothing.

**The `media` path should be scoped to the driver** once the feature lands: `media/{driverCode}` should match the caller's own code.

### 5.4 The rules test suite

**The rules are code and deserve the same treatment as the Dart.** The full case list is in `docs/AUDIT2-flow-backend-ui.md` Part D.3 (28 cases). The short version:

| Group | Cases | What it proves |
|---|---|---|
| **The P0 boundary** | 11 | An anonymous caller cannot read another driver's phone, cannot list drivers, cannot write another van, cannot rewrite a trip, cannot close a complaint. **This is the group that would have caught the current hole** |
| **The app's own flows** | 11 | The driver CAN do everything the app actually does. A denial-only suite breaks the app |
| **The contract edges** | 6 | Storage limits, the field-level restrictions |

**The setup:** `npm i -D @firebase/rules-unit-testing` in `functions/`, plus `"test": "mocha ..."` and a CI step that runs `firebase emulators:exec --only firestore "npm test"`.

**The emulator does not enforce composite indexes.** Section 8's index work needs a separate check against the real project.

---

## 6. The Cloud Functions

### 6.1 The complete function list

| Function | Trigger | Purpose | Auth | Status |
|---|---|---|---|---|
| `bindDeviceToVan` | `https.onCall` | Bind an install id to a van and mint a custom token | Anonymous for the first bind, then must match | **NEW. The identity anchor. Create-or-match under Q1** |
| `bootstrapUserSession` | `https.onCall` | The user app's session. Resolves the ward's route and mints a token with `deviceId` + `routeId` | Anonymous, then the token | **NEW. Section 2.5.6. The user app's identity anchor** |
| `mintStaffToken` | `https.onCall` | The admin panel's session. Reads the `staff` doc and mints a token with `role`, `staffId`, `wardIds` | Firebase Auth email sign-in | **NEW. Section 2.5.6. The admin's identity anchor** |
| `startShift` | `https.onCall` | Create the trip + mark the van, atomically | Must carry `token.vanId` | **NEW. Replaces the client write** |
| `endShift` | `https.onCall` | Close the trip + clear the van marker, atomically | Must own the trip | **NEW** |
| `markWardDone` | `https.onCall` | Append a ward idempotently | Must own the trip; the ward must be in its `wardIds` | **NEW** |
| `setComplaintStatus` | `https.onCall` | Set a complaint's status, assignment, escalation | Staff call. Checks `staff.active` **server-side** | **NEW. Q5's revocation wall** |
| `publishNotice` | `https.onCall` | Create a notice doc | Staff call. Checks `staff.active` | **NEW. Q5** |
| `upsertDriver` | `https.onCall` | Create or update a `drivers` doc, masking the phone | Staff call, `tdo`/`ddo` | **NEW. Q4 + Q5** |
| `upsertStaff` | `https.onCall` | Create or update a `staff` doc | Staff call, `tdo`/`ddo` | **NEW. Q5** |
| `setVanDepot` | `https.onCall` | Set `vans.depot` | Staff call, `tdo`/`ddo` | **NEW. Q5** |
| `arrivalAlert` | `firestore.onDocumentUpdated` on `vans/{id}` | Push to `ward_{id}` when the van nears the next ward | Server | **PRD §0.7. NOT IMPLEMENTED** |
| `mergeDuplicates` | `firestore.onDocumentCreated` on `complaints/{id}` | Set `mergedInto` when an open complaint of the same category is within 50 m | Server | **PRD §0.7. NOT IMPLEMENTED** |
| `missedCollectionAlert` | `firestore.onDocumentCreated` on `complaints/{id}` | Push to the ward inspector after 3 missed-collection reports in a ward today | Server | **PRD §0.7. NOT IMPLEMENTED** |
| `escalateComplaints` | `scheduler`, every 15 min | Escalate open complaints past 24 h / 48 h | Server | **PRD §0.7. NOT IMPLEMENTED** |
| `vanOfflineWatch` | `scheduler`, every 5 min | Mark a silent van `offline` and alert the admin | Server | **PRD §0.7. NOT IMPLEMENTED** |
| `sendNotice` | `firestore.onDocumentCreated` on `notices/{id}` | Fan a notice out to `all` / `ward_{id}` / `van_{id}` | Server | **PRD §0.7. NOT IMPLEMENTED** |
| `notifyMockLocation` | `firestore.onDocumentUpdated` on `trips/{id}` | Staff push when `mockLocationDetected` flips false → true | Server | **NEW** |
| `clearStaleVanMarkers` | `scheduler`, **every 15 min** | Clear `currentTripId` whose trip is closed and old. Also the **depot auto-end safety net** | Server | **NEW. Every 15 min, not daily** |
| `verifyDriverPin` | `https.onCall` | Compare a PIN against `vanSecrets` and mint a token | — | **DELETE (B-08). Deployed and live** |
| `setDriverPin` | `https.onCall` | Write the hashed PIN to `vanSecrets` | Admin only, **but has an unauthenticated bypass** | **DELETE (B-09). Deployed and live** |

**The headline: 6 of the 8 PRD §0.7 functions were never built.** The PRD has specified the backend's event layer since the start. It is written down, it is correct, and it is unimplemented.

**The five staff callables are one family, not five projects.** They share the same three-step shape (section 4.6): check the token, check `staff.active`, check the live ward scope, then write. **They exist for one reason: Q5's instant revocation.** A rules-only admin panel cannot lock out a revoked inspector, because the token still carries the old claims for up to an hour.

**And there are three session-minting callables, all one shape.** `bindDeviceToVan` (the driver), `bootstrapUserSession` (the user app), `mintStaffToken` (the admin panel). Each one does the same four things:

```
1. Check the caller is who they claim to be.
2. Read the authoritative document. The driver doc, the ward doc, the staff doc.
3. Mint a custom token with the claims that document says.
4. Return the token. The client calls signInWithCustomToken with it.
```

**This is why the claim model works at all.** The client never decides what it is allowed to see. **It asks, and the server answers from a document the client cannot edit.**

### 6.2 The two to delete first

`verifyDriverPin` and `setDriverPin` are the **only** Functions currently deployed, and the app **never calls them** (PRD §0.16 `:179`; `grep -rn "cloud_functions\|HttpsCallable" lib/` returns no hits).

| Function | Why it must go |
|---|---|
| `verifyDriverPin` (`functions/src/index.ts:34-147`) | It is a **public endpoint** that accepts `{vanId, pin}`, compares against `vanSecrets/{vanId}.driverPinHash`, and **mints a custom auth token with a `vanId` claim**. It is rate-limited to 5 tries per 10 minutes *per van*, so an attacker with the seeded demo PINs can authenticate as a van. **The app does not call it** |
| `setDriverPin` (`functions/src/index.ts:158-195`) | It has a `DEMO_SEED_BYPASS` path: if `process.env.DEMO_SEED_BYPASS === "true"`, **anyone can set the PIN hash for any van with no authentication at all** |

**The deletion checklist:**

1. Delete both Functions from `functions/src/index.ts`
2. Delete the `DEMO_SEED_BYPASS` branch
3. Delete the `vanSecrets` collection from the contract (PRD §0.2)
4. Delete the `cloud_functions: ^7.0.1` dependency from `pubspec.yaml` (nothing in `lib/` imports it)
5. Delete `vanSecrets` seeding from `scripts/seed_drivers.mjs`
6. **Confirm the office does not call `verifyDriverPin` from another app first.** The user app and admin panel are new. If the admin panel was going to use it, that changes
7. Deploy: `firebase deploy --only functions`

**Do this in the same change that introduces `bindDeviceToVan`,** so there is no window where both exist.

### 6.3 The function contracts

#### `bindDeviceToVan`

```
Input:  { installId: string, vanId: string, driverCode: string }
Output: { token: string, vanId: string, driverCode: string }
```

**Q1's answer makes this a create-or-match, inside a transaction.**

| Validation | Rule |
|---|---|
| `installId` | A UUID, 32-36 chars |
| `vanId` | Non-empty, exists in `vans` |
| `driverCode` | Matches `^[A-Z]{2}-[0-9]{4}$` |
| The driver | Must exist, `active == true`, and **`driver.vanId == vanId`** |
| The binding | **In a transaction:** `vanDevices/{vanId}` absent → **create**. Present with a matching `installId` → **OK, match**. Present with a different `installId` → **reject, already claimed** |

**Why the transaction is mandatory, not nice-to-have.** Under first-claim, two phones can present the same valid code in the same second. Without a transaction, both read "absent", both create, and the van ends up with **two** bound devices. With one, the second read sees the committed binding and is rejected. **The transaction is the only thing that makes first-claim safe.**

```
transaction on vanDevices/{vanId}:
  1. read drivers/{driverCode}
     if missing or !active        → reject 'driverNotActive'
     if driver.vanId != vanId     → reject 'driverNotOnThisVan'
  2. read vanDevices/{vanId}
     if missing                   → CREATE { installId, boundBy: driverCode,
                                          boundAt: serverTimestamp,
                                          claimMode: 'firstClaim' }
     else if installId matches    → UPDATE boundAt (re-login), return OK
     else                         → reject 'vanAlreadyClaimed'
  3. mint a custom token { vanId, driverId: driverCode, installId }
```

**The claim is bound to the CODE, not the person.** The token's `driverId` is the badge code. That is deliberate: §0.16 says the code is an attribution label, not a secret, and the phone is the secret. **The phone is what proves "this is the van's phone", and the code says "this is the driver who is on duty".**

**The rate limit.** 5 attempts per 10 minutes per van. Without it, the callable is a device-claim oracle.

**The error messages must be specific**, because the driver app shows them:

| Error code | The driver's copy | Which conflict reason |
|---|---|---|
| `driverNotActive` | "This driver code is not active. Check with the office." | Not a conflict. A plain failure |
| `driverNotOnThisVan` | "This driver is not allotted to this van." | Not a conflict. A plain failure |
| `vanAlreadyClaimed` | **"This van is already set up on another phone."** + *"Check with the office, or tap 'Different driver?'"* | **`vanAlreadyClaimed`** (Q2's third reason) |
| `vanHeldByAnotherDriver` | **"This van is on shift with another driver."** + *"Check with the office, or tap 'Different driver?'"* | **`vanHeldByAnotherDriver`** (Q2's first reason) |
| `staleMarker` | **"This van's shift record is out of date. Check with the office."** | **`staleMarker`** (Q2's third reason) |
| `rateLimited` | "Too many attempts. Try again in a few minutes." | Not a conflict. A plain failure |

**The two error kinds must not be mixed.** The first, third, and sixth are **plain failures** and belong in the generic error path. The middle three are **conflicts** and belong in Q2's typed conflict phase. **Reusing the generic copy for a conflict sends the driver to check their network when the network is fine.** That is the exact mistake Q2 exists to prevent.

**The `vanHeldByAnotherDriver` and `staleMarker` errors come from `startShift`, not from here.** This callable only knows about the binding. The shift-state conflicts belong to the `startShift` transaction below, but they share the **same enum** so the client has one conflict path.

**The recovery runbook.** Under first-claim, a wrong claim is fixed by **deleting `vanDevices/{vanId}`** in the Firestore console. There is no admin panel yet, so this is a **runbook line**, not tribal knowledge:

```
1. Open the Firestore console, production project.
2. vanDevices/{vanId}, the doc whose installId is wrong.
3. Delete it.
4. The correct phone's next sign-in re-claims the van.
```

**Step 4 is why the `installId` must be stable.** A per-launch random value would create a fresh binding every launch, and the delete would fix nothing.

#### `startShift`

```
Input:  { driverCode: string, date: Timestamp, startedAt: Timestamp }
Output: { token: string, tripId: string, vanId: string }
```

**Why this must be a Function and not a client write.** The duplicate-trip race is real: two clients on one van both read "no open trip", both create a trip, and both write `vans.currentTripId`. The last write wins and one shift is orphaned.

**The transaction, on the van document:**

```
transaction(vans/{vanId}):
  1. If van.currentTripId != null && van.status == on_shift:
       read trips/{currentTripId}
       if trip.driverId != driverCode → REJECT 'vanHeldByAnotherDriver'
       if trip.vanId != vanId       → REJECT 'staleMarker'
       else → RESUME. Return the existing trip. Write nothing.
  2. Else → CREATE a new trip with the driver's snapshot.
             Set van.status = on_shift, van.currentTripId = newTripId
```

**The resume branch writes nothing.** This preserves the invariant that a resume never creates a duplicate and never rewrites the trip. The existing client-side `_resumeSession` (`start_shift.dart:121-152`) already implements this logic correctly; the Function should mirror it exactly.

**The three conflict reasons, and where each one comes from.** This is Q2's shape, on the server side.

| Reason | Raised by | Condition | The client's copy |
|---|---|---|---|
| `vanHeldByAnotherDriver` | `startShift` | `trips/{currentTripId}.driverId != driverCode` | *"This van is on shift with another driver."* |
| `vanAlreadyClaimed` | `bindDeviceToVan` | `vanDevices/{vanId}.installId != installId` | *"This van is already set up on another phone."* |
| `staleMarker` | `startShift` | `trips/{currentTripId}.vanId != vanId` | *"This van's shift record is out of date."* |

**Why the reason must be a typed value, not a string.** The client has to map it to one of three arb keys (Q2). If the Function returned a free-text message, the client would have to string-match the server's English, and a copy edit on the server would silently break the client's Gujarati. **The server sends a reason code. The client owns the words.** That is the same rule every localized backend follows.

**The response includes a fresh custom token** carrying `currentTripId`, so the D4 rules can check the trip's wards without a `get()`.

#### `endShift`

```
Input:  { tripId: string }
Output: { ok: true }
```

Closes the trip (`endedAt` = server timestamp), sets `vans.status = idle`, `vans.currentTripId = null`. **Atomically**, in one transaction on the van doc.

**Why it matters.** The current client-side `EndShift` does these as separate writes. If the process dies between them, the van is left `on_shift` with a closed trip, and the stale marker blocks the van forever (B-19).

#### `markWardDone`

```
Input:  { tripId: string, wardId: string, doneAt: Timestamp, flagged: bool }
Output: { ok: true, wardsDone: [...] }
```

**Idempotent.** The client's `arrayUnion` is **not** idempotent: two taps produce two entries for the same ward. The Function checks for an existing `wardId` and replaces rather than appends.

**The ward must be in the trip's `wardIds`.** A ward outside the snapshot is a bug or an attack.

### 6.4 The trail sharding, and why it is a Function concern

**The cliff.** Firestore caps a document at **1 MiB**. `GLOSSARY.md:89` records the measurement: *"5 h at 1 Hz ≈ 18 k pts ≈ 1 MB, at the 1 MiB doc limit."*

**The consequence.** Every trail append after that **fails silently**. The shift stops recording location, the offline queue grows without bound, and nothing throws.

**The shape:**

```
trips/{tripId}                     ← the shift header (small)
trips/{tripId}/trail/{seq}         ← one chunk doc per flush, seq = 0,1,2...
  { points: [...], from: t, to: t }
```

Each chunk stays small. The shift doc stays small. A read is a subcollection query ordered by the doc id.

**The client's change.** `appendGpsTrail` becomes a `set` on `trail/{seq}` instead of an `arrayUnion` on the trip. That is also **cheaper**: no read-modify-write of a growing array.

**The office app's change.** Trip replay reads the chunks in order instead of one array.

**Why it is a contract change and not a client tweak.** The office app and the admin panel both read the trail. The change must land on both sides at once, or the replay breaks.

### 6.5 The scheduled functions

| Function | Schedule | What it does | The constant |
|---|---|---|---|
| `vanOfflineWatch` | Every **5 min** | A van `on_shift` with no `lastLocation.updatedAt` for `OFFLINE_THRESHOLD_MIN` gets `status = offline`, and the admin is alerted | `OFFLINE_THRESHOLD_MIN=10` |
| `escalateComplaints` | Every **15 min** | Open complaints older than 24 h → level 1, older than 48 h → level 2. Sets `status = escalated` and notifies the new level | `ESCALATION_L1_HOURS=24`, `ESCALATION_L2_HOURS=48` |
| `clearStaleVanMarkers` | Every **15 min** | A van whose `currentTripId` points at a closed trip older than N hours gets `currentTripId = null`. Also closes a shift the client was supposed to close (the depot auto-end's app-killed case) | New constant |

**`vanOfflineWatch` and the driver's revival.** PRD §0.6 Flow F: *"When the van writes again, the driver app sets `status = on_shift`."* The app already does this (`_reviveIfMarkedOffline`, `tracking_engine.dart:510`). So the Function marks it offline and the app revives it. **This means the `status` write rule must allow the driver to set `status = on_shift` even if the Function set it to `offline`.** This is a reason the client's `status` write cannot be removed entirely, or the revival path needs to go through a Function too.

**The cleanest resolution:** make the revival a Function call as well, so `status` is **entirely** server-written. Then the driver's rule touches only `lastLocation` and `batteryPct`. This is the cleaner model and it is what section 5.2 assumes. **It does mean one more Function call per revival**, which is rare (only after an offline period).

**`clearStaleVanMarkers` and the admin panel.** Today there is **no admin console**, so a stale marker is cleared by hand in the Firestore console. The scheduled Function is the automated version. **The admin panel can also expose a "clear this van's stale shift" button** later, which is the same write with a human in the loop.

**`clearStaleVanMarkers` is now also the depot auto-end's safety net.** Ruling #29 made the depot dwell rule a **client-side** decision, with a **5-minute in-memory retry** after a failed write. The PRD itself says: *"the app-killed case is the backend stale-shift sweep's job (later ticket)"*. So this Function has **two** jobs now:

| Job | What it closes |
|---|---|
| Clear a `currentTripId` that points at a closed trip | **B-19.** The stale marker |
| Close a shift that the client was supposed to close but could not (app killed mid-retry) | **Ruling #29's failure mode.** The auto-end that never happened |

**One Function, two holes.** That is worth stating explicitly, because it changes the priority: `clearStaleVanMarkers` moves from *"a nice-to-have for B-19"* to *"the safety net for a rule that is already live in production"*.

**One caveat about the schedule.** A **daily** sweep is too slow for the depot case. A van parked at the depot whose app died would sit open until the next day. **Run it every 15 minutes, next to `escalateComplaints`.** The cost is one query every 15 minutes, which is nothing.

---

## 7. The FCM topic map

### 7.0 The three gaps that make the push system incomplete

**Before the topic map, the three things that are missing today.** All three were verified by grep, not by reading.

| # | Gap | Evidence | The consequence |
|---|---|---|---|
| **1** | **There is no inbound FCM handler.** The app subscribes but never receives | `grep -rn "onMessage\|onBackgroundMessage\|getToken" lib/` → **0 hits** | A push lands in the system tray and **nothing else happens**. The unread badge updates only via the Firestore stream, so it is wrong until the app is opened |
| **2** | **The van topic is never unsubscribed** | `grep -rn "unsubscribeFromTopic" lib/` → **0 hits** | On a shared van, the previous driver's **personal phone keeps receiving** the van's notices forever |
| **3** | **There is no topic registry** | No collection tracks who is on which topic | The server cannot push to **one person**, only to a topic. And it cannot clean up gap 2 after a crash |

**Gap 1 breaks a PRD acceptance criterion.** PRD `:237` says *"a notice sent from the admin panel arrives as a push within 10 seconds"*. That is **half-met**: the notification does appear, but the app does not know about it, and tapping it does not open the right screen.

**The two handlers gap 1 needs.**

| Handler | When | What it does |
|---|---|---|
| `FirebaseMessaging.onBackgroundMessage` | The app is terminated | A **background isolate**. It cannot touch the UI, but it can write to Firestore or update a local store so the badge is right when the app opens |
| `FirebaseMessaging.onMessageOpenedApp` | The user taps the notification | Navigate to the right screen with the notice id as an argument |

**The payload shape.** The push must carry the notice id so the handler can navigate:

```json
{
  "notification": { "title": "Notice", "body": "..." },
  "data": {
    "type": "notice",
    "noticeId": "abc123",
    "targetType": "van",
    "targetId": "van-01"
  }
}
```

**The privacy note.** A `notification` payload is rendered by the OS **even when the app is closed**, so its body is visible on the lock screen. For a municipal garbage app the notice text is not sensitive, so the simple shape is fine. If it ever is, use a `data`-only payload and render it in-app.

**Gap 2's fix** is one line next to where the subscription happens:

```
start_shift.dart     → _subscribeVanTopic(vanId)
end_shift_flow.dart  → _unsubscribeVanTopic(vanId)
```

The caveat: a crash mid-shift leaves the subscription, which is what gap 3's registry would let the server clean up.

**Gap 3's registry** (only if targeted pushes are needed):

| Field | Type | Notes |
|---|---|---|
| `uid` | string | The Firebase uid. The doc id |
| `topics` | array of string | `['all', 'van_van-01']` |
| `vanId` | string? | Which van this device is working |
| `fcmTokens` | array of string | The device's tokens, for targeted pushes |
| `updatedAt` | Timestamp | |

The client writes it on every subscribe/unsubscribe, so it needs a rule: `allow write: if request.auth.uid == uid`. **That is a new collection and a new rule, and it must go into the rules rewrite, not after.**

**But there is a way to avoid the registry entirely.** Push to **staff topics** instead of device tokens: `staff_{staffId}` for the escalation and the missed-collection alerts. PRD `:58` already specifies `staff_{inspectorId}`. That covers the admin's needs with **no registry**. The registry is only needed for **driver-targeted** pushes, and the only one of those is the mock-location alert, which goes to the **office**, not to the driver.

**Recommendation: use staff topics for now. Add the registry only when a driver-targeted push is actually required.**

### 7.1 The three topics (PRD §0.6 rule 6)

| Topic | Subscribed by | Published by | Carries |
|---|---|---|---|
| `van_{vanId}` | The driver app, after the shift starts | `arrivalAlert` (no), `sendNotice` (yes) | Notices for one van. The driver app subscribes with `fcmTopicVanOf(vanId)` (`start_shift.dart:156`) |
| `ward_{wardId}` | The user app, after its ward is known | `arrivalAlert`, `sendNotice` | Arrival alerts and notices for one ward |
| `all` | Both apps, on first launch | `sendNotice` | Broadcast notices. **The `all` notice is the reason the read-state needs a subcollection** |

**The subscription lifecycle.** A topic subscription is a **device** subscription, not a user subscription. The FCM token is per device.

| App | When it subscribes | When it unsubscribes |
|---|---|---|
| **Driver app** | After the shift starts (`_subscribeVanTopic`) | When the shift ends. **Today the app never unsubscribes** — a driver who stops working keeps receiving the van's notices on a personal phone. **Worth fixing** |
| **User app** | After the ward is resolved | When the user changes the ward. **Never on ward change** today, because it does not exist yet |
| **Both** | `all`, on first launch | Never. This is fine, `all` is meant to be permanent |

### 7.2 The push inventory

| Push | From | To | Trigger | Priority |
|---|---|---|---|---|
| **Arrival alert** | `arrivalAlert` | `ward_{wardId}` | The van enters `ARRIVAL_ALERT_RADIUS_M` of the next un-alerted ward | HIGH. A citizen waiting for the van |
| **Notice (van)** | `sendNotice` | `van_{vanId}` | A `notices` doc with `targetType = van` | HIGH. The driver must act |
| **Notice (ward)** | `sendNotice` | `ward_{wardId}` | `targetType = ward` | MEDIUM |
| **Notice (all)** | `sendNotice` | `all` | `targetType = all` | MEDIUM |
| **Missed-collection threshold** | `missedCollectionAlert` | The inspector's device, or `staff_{inspectorId}` | 3 missed-collection reports in one ward today | HIGH. The office must act |
| **Escalation** | `escalateComplaints` | The new level's staff device | A complaint passes 24 h / 48 h | HIGH |
| **Van offline** | `vanOfflineWatch` | The admin panel's staff scope | A van goes silent for `OFFLINE_THRESHOLD_MIN` | HIGH |
| **Mock location** | `notifyMockLocation` | The admin panel's staff scope | `mockLocationDetected` flips false → true | HIGH. This is a tamper signal |
| **Shift auto-ended at depot** | Client (today) | The driver, on-screen | The van dwelled at the depot for 3 h | MEDIUM |

**The depot auto-end row is the one that needs a decision.** Ruling #29 built it as a **client-side** rule: the phone's GPS and the phone's clock decide that 3 continuous hours inside 500 m of the admin-set `vans.depot` has passed, and the phone writes `trips.endedAt` + `vans.status = idle` + `vans.currentTripId = null` itself.

| Why this is a problem for the backend | Detail |
|---|---|
| **The clock is the phone's** | `DepotDwellTracker` compares `at.difference(since) >= limit` with `at` from `DateTime.now()`. A wrong clock, or a driver who changes it, **ends the shift early** |
| **The retry is an in-memory timer** | A failed write retries after 5 minutes. If the app is killed in that window, the auto-end never happens, the trip stays open, and `vans.currentTripId` stays set. The PRD itself calls the app-killed case *"the backend stale-shift sweep's job (later ticket)"* |
| **The rules still allow anyone to write the same fields** | The rules allow `vans.status` and `vans.currentTripId` from any signed-in caller, on **any** van. The depot path is a **legitimate** writer to a field set that is **unprotected** |

**Two options.**

| Option | How | Cost |
|---|---|---|
| **A. Keep it client-side, add a server-side stale-shift sweep** | The sweep finds trips that are closed but still marked open (or shifts that are older than N hours with no `endedAt`) and closes them | One scheduled Function. The PRD already names it as a later ticket |
| **B. Move the dwell decision to the server** | A Function reads the van's `lastLocation` and its own clock, and writes the end-shift set | The Function only sees the **last written** location, up to 30 s stale. The client keeps the on-screen notice, but the **decision** moves |

**Recommendation: A now, B later.** The demo does not need a server-side dwell rule. But the **stale-shift sweep is not optional**, because the retry is a process-local timer and the app can die. That sweep is the same Function that closes **B-19** (a stale `vans.currentTripId`). **One Function closes both.**

**And note what option A does not fix.** It does not stop a driver with a wrong clock from ending their shift early. That is a **low-severity** problem (it costs the office a shift, not money, and the driver can always end the shift manually anyway). It is worth a note in the handover, not a redesign.

### 7.3 The `arrivalAlert` algorithm (PRD §0.6 rule 5)

This is the one Function with real logic, so it is worth writing out.

```
Trigger: vans/{vanId} updated
1. Read vans/{vanId}.lastLocation. If it is missing or stale
   (older than STALE_LOCATION_SEC), stop.
2. Read the van's open trip: van.currentTripId → trips/{tripId}
3. Read routes/{trip.routeId}.wardIds
4. Walk the route's ward list IN ORDER, skipping the wards already in
   trip.wardsDone and the wards already in trip.alertedWardIds.
   The first remaining ward is the NEXT WARD.
5. If the van's distance to that ward's centre is more than
   ARRIVAL_ALERT_RADIUS_M (500 m), stop.
6. Send an FCM push to ward_{nextWardId}.
7. Append nextWardId to trip.alertedWardIds.
```

**Step 7 is the idempotency guard.** Without it, every van location update inside the radius sends a push. The ward is added to `alertedWardIds` **once**, so the push fires once.

**The race.** Two concurrent van updates could both pass step 5 before either completes step 7. The fix is to do steps 6 and 7 in a **transaction** on the trip doc, or to use the trip doc's update as the trigger with a conditional check. **This is the one Function where a transaction matters.**

**Step 4's ordering is load-bearing.** `routes/{id}.wardIds` is the visiting order. The ETA uses the same order. Walking it out of order would alert the wrong ward.

### 7.4 A worked example: the driver's location, and the citizen's arrival notification

**The request:** *"I want to show the driver's location in the user app. And if the van comes within 100 m of the user, notify the user."*

**This is the whole system in miniature.** It touches the driver's write, the rules, a trigger, a transaction, FCM, topics, and the user's read. **If a teammate understands this one flow, they understand the contract.**

**First, a split that people get wrong.** There are **two different things** here, with **two different mechanisms**:

| Thing | How it reaches the user | Who decides | Radius |
|---|---|---|---|
| **The live pin on the map** | A **direct Firestore read**, live | The device draws what it read | n/a |
| **The arrival notification** | An **FCM push** | The **server** decides | **100 m** |

**The pin is a read. The notification is a decision.** A read is free and instant. A decision needs the server.

**And the radius is a constant, not a number in the code.**

```
shared/constants.json
{ "ARRIVAL_ALERT_RADIUS_M": 100 }
```

**The PRD's value today is 500 m** (section 9.1). Changing it to 100 m is a **one-line change in one file**, and the shared-constants test (section 9.2) makes sure the Dart side and the Function side agree. **Do not hardcode 100 in the Function.**

#### 7.4.1 The data that already exists

```
wards/{wardId}
  { name, nameGu, center: {lat, lng}, radiusM, routeId, inspectorId }

routes/{routeId}
  { wardIds: [w1, w2, w3, ...] }        ← the visiting order

vans/{vanId}
  { plateNo, routeId, status, currentTripId,
    lastLocation: { lat, lng, updatedAt, speedKmph },
    batteryPct }

trips/{tripId}
  { vanId, routeId, driverId, wardIds[], date, startedAt,
    wardsDone: [{wardId, doneAt, flagged}],
    alertedWardIds: [] }                 ← ← the idempotency guard
```

**Nothing needs to be added for this feature.** The shape is already in the contract.

#### 7.4.2 The full sequence

| # | Who | What | Why |
|---|---|---|---|
| 1 | **Driver app** | Writes `vans/{vanId}.lastLocation = {lat, lng, updatedAt}` every `GPS_INTERVAL_SEC` (10 s) | PRD §0.6 rule 1. **A direct Firestore write, not a Function.** The rule checks `token.vanId == vanId` and allows only `lastLocation` + `batteryPct` |
| 2 | **Firestore** | The `vans/{vanId}` doc changes | |
| 3 | **Cloud Function** | `arrivalAlert` fires on the `vans` update | PRD §0.6 rule 5 |
| 4 | **Cloud Function** | Reads `vans.lastLocation`. If it is missing or older than `STALE_LOCATION_SEC` (60 s), **stop** | A stale pin must not trigger an arrival alert |
| 5 | **Cloud Function** | Reads `van.currentTripId` → `trips/{tripId}` | No open trip means no shift, so no alert |
| 6 | **Cloud Function** | Reads `routes/{trip.routeId}.wardIds` | The visiting order |
| 7 | **Cloud Function** | Walks the ward list **in order**, skipping `wardsDone` and `alertedWardIds`. The first one left is the **next ward** | The order is load-bearing. Walking it out of order alerts the wrong ward |
| 8 | **Cloud Function** | Computes the distance from `lastLocation` to `wards/{nextWard}.center`. If it is **more than `ARRIVAL_ALERT_RADIUS_M` (100 m)**, **stop** | The radius |
| 9 | **Cloud Function** | Sends an FCM push to topic `ward_{nextWardId}` | The topic is per ward, so every citizen in that ward gets it |
| 10 | **Cloud Function** | Appends `nextWardId` to `trips/{tripId}.alertedWardIds`, **inside a transaction** | The idempotency guard. Without it, the 10-second cadence sends a push every 10 s |
| 11 | **User app** | The push arrives. `onBackgroundMessage` updates the badge | The app is closed. A background isolate writes to the local store |
| 12 | **User app** | The citizen taps. `onMessageOpenedApp` navigates to the ward screen | |
| 13 | **User app** | The map shows the live pin | A **direct Firestore query**, separate from the push |

#### 7.4.3 The diagram

```
  DRIVER APP         FIRESTORE         CLOUD FUNCTIONS         USER APP
      │                 │                    │                    │
      │ write           │                    │                    │
      │ lastLocation    │                    │                    │
      ├────────────────>│                    │                    │
      │                 │── trigger ────────>│                    │
      │                 │                    │                    │
      │                 │                    │ 1. lastLocation    │
      │                 │                    │    fresh? (< 60 s) │
      │                 │<── read trip ──────┤                    │
      │                 │<── read route ─────┤                    │
      │                 │<── read ward ──────┤                    │
      │                 │                    │                    │
      │                 │                    │ 2. next ward      │
      │                 │                    │    (route order)   │
      │                 │                    │ 3. distance?      │
      │                 │                    │    <= 100 m?      │
      │                 │                    │                    │
      │                 │                    │ 4. transaction:   │
      │                 │<── append ─────────┤    alertedWardIds │
      │                 │                    │                    │
      │                 │                    │──── FCM push ────>│
      │                 │                    │  ward_{wardId}    │
      │                 │                    │                    │ badge
      │                 │                    │                    │
      │                 │                    │                    │ tap → navigate
      │                 │                    │                    │
      │                 │<── watch vans ─────────────────────────┤
      │                 │───── van docs ───────────────────────>│ pin on the map
```

#### 7.4.4 The live pin: the direct query

```dart
// The user app. A direct query, scoped by the routeId claim.
final stream = _db.collection('vans')
    .where('routeId', isEqualTo: ward.routeId)
    .where('status', isEqualTo: 'on_shift')
    .snapshots();
```

**Why this is safe.** The `vans` doc has no PII: `plateNo`, `routeId`, `status`, `lastLocation`, `batteryPct`. PRD `:68` says any signed-in session may read the vans. **And the query is scoped to the route, so the user app never loads all the vans** (PRD §0.6 rule 3).

**The index this needs is missing today.** `vans(routeId, status)` is listed in section 8.3 as **NOT YET EXISTS**. **Without it, this query is a collection scan.** It is one of the two indexes the user app teammate will hit on day one.

#### 7.4.5 Why the push goes to a topic and not to a device

| Option | How | Verdict |
|---|---|---|
| **A. Topic `ward_{wardId}`** | The user app subscribes when its ward is known. The Function sends to the topic | **Use this.** PRD `:53`. Zero per-user state |
| B. A device registry, then a lookup of every citizen in that ward | The server finds every device on that ward and sends to each token | **Not now.** It needs the registry (B-23) and costs a query per push |

**The topic's shape is what makes A work.** The citizen's ward is known **before** the van arrives, so the subscription is already in place. **A push to a topic reaches every device subscribed to it, and the topic is exactly "the citizens in ward X".**

**And the number that decides the direction.**

| The count | Size | Anything that scales with it |
|---|---|---|
| **Vans** | Tens | Cheap either way |
| **Citizens** | Large | **Must be server-driven** |

**The user app must not poll.** It does not run a timer that checks the distance every 10 seconds. **The push comes because the server decided it.** If the user app polled, the database load would scale with the number of citizens instead of the number of vans. **This is the same reason B-23 exists: a topic cannot address one person.**

#### 7.4.6 The transaction in step 10, and why it is the one place a transaction matters

```
transaction(trips/{tripId}):
  1. Read trip.alertedWardIds
  2. If nextWardId is already in it → ABORT. Another update won the race.
  3. Append nextWardId
  4. Send the FCM push
```

**The race without it.** Two van updates arrive close together. Both pass the distance check in step 8. Both send the push. **The citizen gets two notifications for one arrival.** The transaction makes the append and the send atomic: only one wins, and only one push goes out.

**Why this Function and not the others needs one.** Every other Function either writes one document or is idempotent by construction. **This one has a read, a distance check, and a send**, and the send is not retractable. **Once the push is out, it is out.**

#### 7.4.7 The staleness check, in two places, for two different reasons

| Use | Where | What it decides |
|---|---|---|
| **The server's stale check** | `arrivalAlert`, step 4 | *"Is this pin fresh enough to trust for an alert?"* |
| **The device's stale display** | The user app | *"Should I tell the user how old this is?"* |

**Both use `STALE_LOCATION_SEC`.** That is exactly why it belongs in the shared constants file and not hardcoded in two places.

**The user app's display:**

```
if (now - lastLocation.updatedAt > STALE_LOCATION_SEC)
    show "last seen X min ago"
```

**The server's version has a different job.** It stops the server from telling a citizen *"the van is arriving"* based on a pin from three minutes ago.

#### 7.4.8 Two design decisions this example surfaces

**Decision 1: 100 m from the ward's centre, or from the ward's boundary?**

The ward is an **area**, not a point. `wards/{wardId}` has both a `center` and a `radiusM`. A citizen's actual location is anywhere in that area.

| Check | What it means | Verdict |
|---|---|---|
| **(a) `distance(center) <= 100 m`** | The van is within 100 m of the ward's **centre point** | Simple. But a citizen at the far edge of a 300 m ward gets the push 200 m before the van reaches them |
| **(b) `distance(center) <= radiusM + 100 m`** | The van is within 100 m of the ward's **boundary** | **Better.** "The van is 100 m away from where I am" is what the citizen means |

**Recommendation: (b).** It is one extra addition in the same expression, and it matches the words *"within 100 m of the user"*. **The citizen's own location is not known to the server**, so the ward's boundary is the closest available proxy. **If the office wants it exact, the user app would have to send its location to the server, which is a privacy decision, not a technical one.**

**Decision 2: only the next ward, or every ward the van is inside?**

The PRD's algorithm alerts only the **next** ward in the route order. That means a citizen in a ward the van has **already passed** gets nothing, even if the van is physically near them.

| Option | What | Trade-off |
|---|---|---|
| **A. The next ward only** (the PRD) | One distance check per update | No spam. But a citizen in an overlapping or out-of-order ward gets no alert |
| **B. Every ward in the trip's snapshot that is within the radius** | A loop over `trip.wardIds` | No misses. But if two wards are 50 m apart, the citizen gets two alerts as the van passes between them |

**Recommendation: A now, B if the office reports missed alerts.** A matches the PRD, and the route order is the product's mental model. **B is a small loop change** and the `alertedWardIds` guard already makes it safe from repeats.

#### 7.4.9 What the user app does not need to know

**This is the point of the whole design.** The user app's developer writes **none** of the alert logic.

| The user app does | The user app does not do |
|---|---|
| Subscribe to `ward_{wardId}` when its ward is known | Know the route order |
| Read `vans` for its route and draw the pin | Compute the distance to the ward |
| Handle the push and the badge | Know which ward is "next" |
| Send a `deviceId` claim | Know `alertedWardIds` exists |

**All of that is the server's.** If the user app's developer has to implement any of it, the split in section 2.4 has been broken.

---

## 8. The indexes

### 8.1 The current index file

`firestore.indexes.json` has **4** composite indexes.

### 8.2 The complete index plan

| Collection | Fields | Type | Needed by | Exists? |
|---|---|---|---|---|
| `trips` | `vanId` ASC, `date` ASC | composite | `watchTripByVanIdAndDate` | **YES** |
| `trips` | `vanId` ASC, `date` DESC | composite | `watchRecentTrips` | **YES** |
| `complaints` | `category` ASC, `wardId` ASC, `createdAt` ASC | composite | `watchMissedCollectionComplaints` | **YES** |
| `notices` | **multi-branch** over `(targetType, targetId)`, 3 branches | **multi-branch composite** | `watchNotices` | **NO. THE ONE THAT MATTERS** |
| `complaints` | `category`, `wardId`, `createdAt`, `pendingStatuses` ARRAY_CONTAINS_ANY | composite | Only if the denormalization option is chosen (B-05 option B) | NO (optional) |
| `vans` | `routeId` ASC, `status` ASC | composite | **The user app's query**: "vans on my route that are on shift" | **NO. NEEDED FOR THE USER APP** |
| `complaints` | `wardId` ASC, `createdAt` DESC | composite | **The admin panel's complaint list**, scoped by ward and sorted newest | **NO. NEEDED FOR THE ADMIN PANEL** |
| `complaints` | `status` ASC, `createdAt` ASC | composite | The escalation sweep's query | NO (optional) |
| `trips/{id}/trail` | none needed (doc-id reads) | — | The sharded trail | — |
| `notices/{id}/receipts` | none needed (doc-id reads) | — | The read receipts | — |
| `drivers` | none needed (doc-id reads) | — | The driver lookup | — |
| `staff` | `role` ASC, `wardIds` ARRAY_CONTAINS | composite | The admin panel's staff list | NO (optional) |

### 8.3 The two that are missing for the new apps

**These are the indexes the user app and the admin panel will need, and they are not in the file.**

| Index | The query it serves | Why it matters |
|---|---|---|
| **`vans`: `routeId` + `status`** | The user app: `.where('routeId', isEqualTo: wardRouteId).where('status', isEqualTo: 'on_shift')` | PRD §0.6 rule 3. The user app listens to **only** the vans on its route. This index is what makes that a cheap query instead of a full scan |
| **`complaints`: `wardId` + `createdAt`** | The admin panel: `.where('wardId', isEqualTo: wardId).orderBy('createdAt', descending: true)` | The admin's main list, scoped by ward and sorted newest |

**Neither is strictly required** (Firestore can auto-create single-field indexes and will prompt for a composite at runtime), but shipping the index file means **no one hits a `FAILED_PRECONDITION` in production**.

### 8.4 The notices multi-branch index, in detail

**The query** (`firestore_notices_repository.dart:37-39`):

```dart
final query = wardBranch == null
    ? _notices.where(Filter.or(allBranch, vanBranch))
    : _notices.where(Filter.or(allBranch, vanBranch, wardBranch));
```

Three OR branches, each an AND of two fields:

| Branch | Fields |
|---|---|
| `allBranch` | `targetType == 'all'` |
| `vanBranch` | `targetType == 'van' AND targetId == vanId` |
| `wardBranch` | `targetType == 'ward' AND targetId whereIn [...]` |

**Firestore resolves a disjunctive query with a multi-branch index**, one index per distinct field combination in the query. The repo declares a **single** composite on `(targetType ASC, targetId ASC)`, which is not the same thing.

**The symptom is silent.** `notices_flow.dart` maps a read failure to the **degraded/offline phase**, so the driver sees an **empty inbox** rather than an error. A citizen with a stale notice and a driver with no notices look identical.

**The wrong comment.** `firestore_notices_repository.dart:10-12` asserts *"no composite index is required beyond Firestore's automatic single-field indexes"*. **That is false** for an OR query with 2+ field-equality branches. It must be corrected when the index is deployed, or the next developer will trust it.

**The fix:**

```
1. Add the multi-branch index for notices in firestore.indexes.json
2. Deploy: firebase deploy --only firestore:indexes
3. Fix the repository comment
4. Verify against the REAL project (the emulator does not enforce indexes)
```

**This is the highest value-per-minute item in the entire backend plan.** One index, one deploy, and a silent production failure goes away.

### 8.5 The 29-ward cliff, and why the index alone does not save you

**The index is only half of the notices problem. There is a second failure that the index cannot fix, and it is sharper.**

Firestore caps an `OR` query at **30 disjunctions after normalization**. A `whereIn` with N values inside an OR branch **normalizes into N separate disjunctions**. So the notices query's branch count is:

```
disjunctions = 1 (allBranch) + 1 (vanBranch) + N (wardBranch, one per ward id)
```

| Wards on the route | Normalized disjunctions | Result |
|---|---|---|
| 28 | 30 | **HTTP 200. Works** |
| **29** | **31** | **HTTP 400.** `"Too many disjunctions after normalization. Result had 31 disjunctions which is more than the maximum of 30"` |
| 31 | 33 | HTTP 400 |

**Verified on a real Firestore emulator** with the repo's own `firestore.rules` and the exact query shape. The probe ran in a throwaway `/tmp` copy.

**So the D3 Notices screen dies at 29 wards on a route.** Not at 30. At **29**. And it dies with a hard HTTP 400, which `notices_flow.dart` maps to the degraded/offline phase, so the driver sees an **empty inbox**.

**Why this is worse than the `whereIn` cap.** A plain `whereIn` over 30 values is **latent**, because production uses `watchRouteWards` (`where('routeId', isEqualTo: ...)`), not `whereIn`. This one is **live**: `watchNotices` is the production query and it is called with the route's full ward list.

**Why it has never fired.** The seed data has 3 wards. But the PRD's model is **one van serves one route, and a route serves many wards**. A real municipal taluka route can easily have 29+ wards.

**Two fixes.**

| Fix | How | Cost |
|---|---|---|
| **A. Chunk the query** | Split the ward list into groups so each query's normalized disjunction count stays ≤ 30. With 3 fixed branches, each query can carry at most **27** ward ids. Run the chunks and merge | Zero schema change. But the query count grows with the ward count, and the merge is client-side |
| **B. Denormalize the notices query** | Do not query `notices` by a list of ward ids at all. Maintain a **per-van inbox**: `notices/{id}/targets/{vanId}` or a `vanNotices/{vanId}/{noticeId}` collection written when the notice is created | A contract change. But the query becomes a simple `where('vanId', isEqualTo: ...)` with **no OR at all**, and it scales to any number of wards |

**Recommendation: A now, B when the first 29-ward route appears.** Fix A is a repository change with no contract change. But fix B is the shape that scales, and it also **kills the multi-branch index problem** (8.4) at the same time, because a single-field query needs no composite index.

**What this means for the build order.**

| If you ship | You also need |
|---|---|
| Fix A (chunking) | The multi-branch index from 8.4 |
| Fix B (denormalized) | **No notices index at all** |

**That is a strong argument for B.** One contract change removes two failure modes.

**The emulator caveat, stated once and applied everywhere.** The Firestore emulator enforces rules but **NOT** composite indexes. A deliberately index-less control query returned **200**. So **a green emulator run is NOT proof of index coverage**. Index work must be reasoned from Firestore's documented rules and verified against the real project.

---

## 9. The shared constants

### 9.1 The list (PRD §0.4)

**"one config file per project, same names"** is the PRD's rule. Every app and every Function must use the same names and the same values.

| Constant | Value | Used by | Where it lives today |
|---|---|---|---|
| `GPS_INTERVAL_SEC` | 10 | The tracking engine's normal cadence | `tracking_engine.dart` |
| `GPS_INTERVAL_LOW_BATTERY_SEC` | 30 | The tracking engine's low-battery cadence | `tracking_engine.dart` |
| `LOW_BATTERY_PCT` | 20 | The threshold below which the slow cadence applies | `write_policy.dart` |
| `OFFLINE_THRESHOLD_MIN` | 10 | `vanOfflineWatch` | **Not implemented** |
| `STALE_LOCATION_SEC` | 60 | The user app's "last seen X min ago" | **Not implemented** |
| `ARRIVAL_ALERT_RADIUS_M` | 500 | `arrivalAlert` | **Not implemented** |
| `DUPLICATE_RADIUS_M` | 50 | `mergeDuplicates` | **Not implemented** |
| `MAX_COMPLAINTS_PER_DEVICE_PER_DAY` | 5 | The complaint rate limit | **Not implemented** |
| `MISSED_REPORT_THRESHOLD` | 3 | `missedCollectionAlert` | **Not implemented** |
| `ESCALATION_L1_HOURS` | 24 | `escalateComplaints` | **Not implemented** |
| `ESCALATION_L2_HOURS` | 48 | `escalateComplaints` | **Not implemented** |
| `AVG_VAN_SPEED_KMPH` | 15 | The ETA fallback speed | **Not implemented** |
| `MIN_MOVE_M` | 15 | The write policy's movement threshold | `write_policy.dart` |
| `HEARTBEAT_SEC` | 30 | The write policy's heartbeat | `write_policy.dart` |
| `DEPOT_RADIUS_M` | 500 | The depot auto-end rule | `depot_dwell.dart` |
| `DEPOT_DWELL_LIMIT_HOURS` | 3 | The depot auto-end rule | `depot_dwell.dart` |
| `DEPOT_DWELL_RESET_M` | 100 | The depot dwell reset | `depot_dwell.dart` |

**The split.** Six constants live in Dart. **Ten live in the PRD only**, because the Functions that use them were never built.

### 9.2 Where the constants should live

**The problem with a copy.** If the Dart app has `GPS_INTERVAL_SEC = 10` and the Function has `GPS_INTERVAL_SEC = 8`, nobody notices until the behaviour diverges.

**The industry's answer for a monorepo with mixed languages:** a single **JSON or env** file that both sides read.

```
shared/constants.json
{
  "GPS_INTERVAL_SEC": 10,
  "GPS_INTERVAL_LOW_BATTERY_SEC": 30,
  ...
}
```

| Consumer | How it reads it |
|---|---|
| **The Dart apps** | A generated Dart file (`build_runner`), or a `const` map in `core/config/constants.dart` checked by a test against the JSON |
| **The Functions** | `require('../../shared/constants.json')` at build time, or `functions.config()` |
| **The admin panel** | `import constants from '../shared/constants.json'` (Next.js supports JSON imports) |

**The recommendation for now.** The **admin panel and the Functions are the two consumers that do not exist yet**. When they are built, put the constants in one JSON file and have the Dart side **verify** it with a test:

```dart
test('the shared constants match shared/constants.json', () {
  // Read the JSON at test time and compare every key.
});
```

That test is the enforcement. It is 20 lines and it prevents a whole class of drift.

### 9.2.1 The identity constants, which the decisions added

**The Q1 to Q7 answers introduced a second layer of shared constants.** These are not tuning numbers, they are **contract values**. A mismatch between the server and the client on any of these is a security bug or a broken message.

| Constant | Value | Used by | Why it must be shared |
|---|---|---|---|
| `CLAIM_VAN_ID` | `vanId` | The callable, the rules, all three apps | The claim's **name**. If the Function writes `vanId` and the rule reads `van_id`, every write is denied and nothing says why |
| `CLAIM_DRIVER_ID` | `driverId` | The callable, the `drivers` rule | Same reason. This claim is the **phone-number wall** (Q7) |
| `CLAIM_DEVICE_ID` | `deviceId` | The user app's bootstrap, the `complaints` and `ratings` rules | Q6. The complaint scope key. It must be the **same claim name** on both sides |
| `CLAIM_ROUTE_ID` | `routeId` | The user app's bootstrap | The user app reads **today's trips of its route**. Without this claim, the "collected today" display has no scope |

**The `routeId` claim has a refresh rule the other claims do not.** The user app's route comes from its **current ward**, and the citizen can move. So:

| When | What happens |
|---|---|
| The user app starts | The session bootstrap sets `routeId` from the resolved ward's route |
| The citizen moves to a ward on a **different** route | The app re-runs the bootstrap and gets a **fresh token** with the new `routeId` |
| The citizen moves within the same route | Nothing. The claim is still correct |

**Why this is not the same as Q5's staff staleness.** The citizen's route claim is **not** a privilege. It decides which route's "collected today" tiles they see. **A stale value shows the wrong neighbourhood's collection status, which is a UX annoyance, not a data leak.** The complaint scope, which *is* a privacy boundary, uses the `deviceId` claim, and that never changes.

**Why the claim and not a query filter.** `where('routeId', isEqualTo: routeId)` with `request.auth != null` would let any caller read any route's trips. **The claim turns "which route" into something the server decided**, the same trick as the `vanId` claim on the driver side.
| `CLAIM_CURRENT_TRIP_ID` | `currentTripId` | `startShift`, the D4 rule | Lets the complaint rule be a pure token check, no `get()` |
| `CLAIM_STAFF_ID` | `staffId` | The staff sign-in, the staff rules | The scope key for the admin panel |
| `CLAIM_WARD_IDS` | `wardIds` | The staff sign-in, the staff rules | The ward scope. In the token so the rules do not `get()` on every read |
| `CLAIM_ROLE` | `role` | The staff sign-in, the staff rules | `inspector` / `chief_officer` / `tdo` / `ddo` |
| `PHONE_MASK_FORMAT` | `98XXXXXX10` | The admin panel, `maskDriverPhone` | Q4. The confirm card shows this exact shape. A different length breaks the card's layout |
| `DRIVER_CODE_PATTERN` | `^[A-Z]{2}-[0-9]{4}$` | The callable, `normalizeDriverCode`, the admin panel | The doc id format. The callable rejects what the admin panel normalizes |
| `SHIFT_CONFLICT_VAN_HELD` | `vanHeldByAnotherDriver` | `startShift`, the client | Q2's reason code |
| `SHIFT_CONFLICT_ALREADY_CLAIMED` | `vanAlreadyClaimed` | `bindDeviceToVan`, the client | Q2's reason code |
| `SHIFT_CONFLICT_STALE_MARKER` | `staleMarker` | `startShift`, the client | Q2's reason code |
| `BIND_RATE_LIMIT_MAX` | 5 | The callable | The device-claim oracle guard |
| `BIND_RATE_LIMIT_WINDOW_MIN` | 10 | The callable | Same |
| `VAN_DEVICE_CLAIM_MODE_FIRST` | `firstClaim` | The callable | Q1. Recorded on the binding so the office can spot a wrong claim later |
| `VAN_DEVICE_CLAIM_MODE_PREPROVISIONED` | `preProvisioned` | The callable | Phase 11 hardening |

**Why the reason codes are constants and not inline strings.** The Function sends `vanAlreadyClaimed`. The client maps it to `identityShiftConflictClaimed` in the arb files. **If the server wrote `van_already_claimed` instead, the client's switch falls through to the generic error**, and the driver gets *"Couldn't start the shift. Check the connection"* when the connection is fine. That is the whole bug Q2 exists to prevent.

**The one-line check that catches this class.** The shared constants test (section 9.2) should cover the claim names and the conflict codes, not just the tuning numbers. **Twenty more lines, one whole class of silent breakage gone.**

**Why these are not in the Dart `const` map.** The claim names are used in **rules** (a non-Dart language) and in **TypeScript**. So they belong in the JSON file that all three sides read, and the Dart side only **asserts** them. The arb keys stay in the Dart l10n files, because only the app renders them.

### 9.3 The design tokens

PRD §0.5 says the same token names must exist in the Flutter theme and the admin panel's CSS variables.

| Token | Value | Flutter | Admin panel |
|---|---|---|---|
| `color.primary` | `#1E8E5A` | `app_colors.dart` | A CSS variable |
| `color.onPrimary` | `#FFFFFF` | `app_colors.dart` | A CSS variable |
| `color.background` | `#F6F8F7` | `app_colors.dart` | A CSS variable |
| `color.surface` | `#FFFFFF` | `app_colors.dart` | A CSS variable |
| `color.textPrimary` | `#1B1F1D` | `app_colors.dart` | A CSS variable |
| `color.textMuted` | `#5F6B66` | `app_colors.dart` | A CSS variable |
| `color.statusReceived` | `#F2A100` | `app_colors.dart` | A CSS variable |
| `color.statusAssigned` | `#2F6FDE` | `app_colors.dart` | A CSS variable |
| `color.statusResolved` | `#1E8E5A` | `app_colors.dart` | A CSS variable |
| `color.statusEscalated` | `#D93025` | `app_colors.dart` | A CSS variable |
| `radius.md` | 12 | `AppRadius.md` | A CSS variable |
| `spacing.unit` | 8 | `AppSpace.unit` | A CSS variable |
| Font | Noto Sans (supports Gujarati) | `app_theme.dart` | A web font |

**The admin panel needs the Gujarati font.** Noto Sans covers both Latin and Gujarati. The admin panel is an office tool, so it may be English-only, but if any notice text is shown to a driver it must render in Gujarati.

---

## 10. The three-environment setup

### 10.1 Why three, not one

`GLOSSARY.md`'s production plan says it: *"Three projects, not one shared demo"*.

| Environment | Rules | App Check | Data | Purpose |
|---|---|---|---|---|
| **`dev`** | Loose | Off | Resettable seed data | Day-to-day development. Breakable |
| **`staging`** | **Identical to prod** | On | Resettable seed data | The rehearsal. Real FCM, real Play Integrity, real rules |
| **`prod`** | Tight | Enforced | Real data | The live system |

**Why staging matters more than it looks.** The emulator does not enforce composite indexes (B-17), it does not enforce App Check, and it does not have real FCM. **A staging project is the only place where the production behaviour can be observed.** The demo rehearsal should happen on staging, not on prod.

### 10.2 The current state

| Thing | Today | Target |
|---|---|---|
| Firebase project | **One**: `safaaisaathi-63a87` | Three |
| Android flavors | **None.** Only `debug` / `profile` / `main` | `dev` / `prod` (B-15) |
| `google-services.json` | One, gitignored, applied via `--dart-define-from-file` | One per flavor, gitignored, applied by the Gradle plugin |
| The dev runbook | `.env` + `scripts/run_device.sh` | **Keep it unchanged.** `GLOSSARY.md:166` says so |
| CI | **None** | A pipeline that builds the AAB |
| App Check | **None** | On staging and prod |

**The flavor work is sequenced AFTER ticket 14** (`GLOSSARY.md:118`). It restructures the Android build, and the live-device runbook depends on the current setup. **Do not do it during the demo.**

### 10.3 The deployment commands

| What | Command | When |
|---|---|---|
| The rules | `firebase deploy --only firestore:rules` | **After EVERY rules edit.** `GLOSSARY.md:166` is emphatic: the rules must be in the **RELEASED** rules, not just the file |
| The indexes | `firebase deploy --only firestore:indexes` | After every index change. **Verify against the real project** |
| The Functions | `npm run build && firebase deploy --only functions` | After every Function change. **The build is not optional.** See the trap below |
| Storage rules | `firebase deploy --only storage` | After every storage rules change |
| Everything | `firebase deploy` | The full release |
| The emulator | `firebase emulators:start` | Locally, for the rules tests |
| The Function logs | `firebase functions:log --only <name>` | To verify a Function is hitting |
| The seed | `FIREBASE_PROJECT=<explicit-id> node scripts/seed_drivers.mjs` | To reset the driver data. **The env var is mandatory.** See the trap below |

**The order matters.** Rules and indexes first (they are the authorization and the query layer), then the Functions (they run against the new rules).

#### Two deployment traps that are live in the repo today

**Trap 1. The `functions/lib/` artifact is stale, so `firebase deploy --only functions` can ship old code.**

`functions/package.json` declares `"main": "lib/index.js"`. **That is the file Firebase deploys.**

| File | Timestamp |
|---|---|
| `functions/src/index.ts` | **Oct 29, 04:50** |
| `functions/lib/index.js` | **Oct 28, 01:15** |

**The compiled artifact is 27 hours older than the source.** Run `firebase deploy --only functions` without a build first and **the old code goes live**, and the edit appears to have been ignored.

`functions/lib/` is gitignored, so a **fresh clone has no `lib/` at all** and the deploy fails with a missing `main`. That is the safer failure, but it means the first deploy from a fresh clone must include a build.

**The fix, three parts.**

| Where | How |
|---|---|
| **`package.json`** | Change `"deploy"` to `"npm run build && firebase deploy --only functions"` so the wrong command is impossible |
| **CI** | `npm ci` → `npm run build` → `firebase deploy --only functions`, as three explicit steps |
| **Locally** | Same. Never rely on remembering |

**The general lesson.** A `main` that points at a build artifact creates a two-step deploy where the first step is optional. Make the artifact's freshness a **precondition**, not a habit.

**Trap 2. The seed script writes to the LIVE project by default.**

`scripts/seed_drivers.mjs:14-16`:

```js
projectId: process.env.FIREBASE_PROJECT || 'safaaisaathi-63a87',
```

**The default is the live production project.** One stray `node scripts/seed_drivers.mjs` with no env var writes to production.

**It is also incomplete.** It seeds **4 driver docs only**. There is **no** seed script for `vans`, `routes`, `wards`, `notices`, or `staff`. PRD `:160` says *"Done when every app boots and reads `wards` from the emulator"* and `wards` has **no seed at all**.

**The composite problem.** A fresh Firebase project has **no vans, no routes, no wards**. The demo data was seeded by hand, once. `GLOSSARY.md:167` lists it as a live prerequisite, not as a script.

**The fix, three parts.**

| Part | How |
|---|---|
| **A separate emulator seed** | `emulator/seed.json` plus an import step, so `firebase emulators:start --import=./emulator/seed.json` gives a full dataset |
| **A guarded live seed** | The live script must **require** `FIREBASE_PROJECT` explicitly, with **no default**, and refuse to run against a project whose name contains `prod` |
| **A full reference-data seed** | One script that seeds `vans`, `routes`, `wards`, `notices`, `staff` and `drivers`, idempotently (`{merge: true}`) |

**And one more thing.** `firebase.json` is **gitignored** (`.gitignore:53`), so a fresh clone has **no emulator configuration at all**. That is why the emulator config must be committed. It contains **no secrets** (the project id is in `.firebaserc`), so there is no reason to ignore it.

### 10.4 The CI pipeline

```
1. flutter pub get                    → fails on a broken lockfile
2. flutter analyze                    → must be clean
3. flutter test                       → must be green
4. firebase emulators:exec --only firestore "npm test"   → the rules suite
5. flutter build apk --debug          → catches Gradle/manifest breakage
```

Steps 1-5 need **no secrets** and can run on every push today.

The release pipeline adds:

```
6. flutter build appbundle --release --flavor prod  → needs the keystore
7. Play App Signing → the Play Store holds the release key; the upload key guards the upload
```

**"Nobody builds prod releases from a laptop"** (`GLOSSARY.md`). The keystore and the `google-services.json` files are CI secrets, base64-encoded, written only during the build.

---

## 11. The build order

### 11.1 The phases

**This is the GO backend's order. It is different from the client order in `AUDIT2-flow-backend-ui.md` Part F.**

| Phase | Work | Depends on | Days |
|---|---|---|---|
| **0** | **The ADRs.** The 5 decisions in `AUDIT2-flow-backend-ui.md` E.4, plus the Q1-Q7 answers in section 12 | — | 0.5 |
| **1** | **The free wins.** Chunk the notices OR query under the 30-disjunction cap (8.5). Deploy the notices multi-branch index. Delete `verifyDriverPin` + `setDriverPin` + `vanSecrets` + the `cloud_functions` dependency. Delete `readVans`. Bound the complaints fetch | Confirm the office does not call `verifyDriverPin` | 1 |
| **2** | **The rules test suite.** 28 cases, CI-wired | Phase 1's rules | 1 |
| **3** | **The CI pipeline.** `pub get` → `analyze` → `test` → rules suite → `build apk` | Phase 2 | 0.5 |
| **4** | **`vanDevices` + `bindDeviceToVan` + the rules rewrite.** The P0 fix. **Create-or-match inside a transaction (Q1). Claim-scoped rules (Q7). The `phoneMasked` migration (Q4) runs BEFORE the rules deploy** | **Q1 is ANSWERED (first-claim).** The client change | 2-3 |
| **5** | **`startShift` / `endShift` / `markWardDone`.** The server-authoritative writes. **Return typed conflict reasons (Q2)** | Phase 4 | 3-5 |
| **6** | **The trail sharding.** The 1 MiB cliff | Phase 4 | 2 |
| **7** | **The PRD §0.7 event functions.** `arrivalAlert`, `mergeDuplicates`, `missedCollectionAlert`, `escalateComplaints`, `vanOfflineWatch`, `sendNotice` | Phase 1 (they need the rules) | 3-5 |
| **8** | **The contract additions.** Notices read receipts, the mock-location push, `drivers` audit fields, the stale-marker cleanup, **`staffPhones` + the admin's callables (Q4, Q5)** | — | 2 |
| **9** | **The user app's indexes + the user app's rules.** **The `deviceId` and `routeId` claims on the session (Q6)** | Phase 4 | 1 |
| **10** | **The admin panel's indexes + the admin panel's rules + the staff claims.** **The claims are minted at sign-in (Q5, option A). Writes go through callables** | Phase 4 | 2 |
| **11** | **The hardening.** App Check, flavors, CI with secrets, Storage scoping, the emulator suite, **the staff token re-mint (Q5, option B)**, **the match-only bind callable (Q1's hardening)** | After ticket 14 | 3-5 |

#### Three items that are not in the phase table but must not be forgotten

| Item | Where it belongs | Why it is not a phase |
|---|---|---|
| **The inbound FCM handler** + the van-topic unsubscribe | Phase 7, alongside `sendNotice` | Both are client-side, and both are small. But they are what make PRD `:237` actually met |
| **The `functions/lib` deploy trap** | Phase 3, the CI pipeline | It is a one-line `package.json` change plus a CI step. It is a **precondition**, not a phase |
| **The seed guard + the emulator seed + committing `firebase.json`** | Phase 1 | Until the seed is guarded, every developer runs the risk of writing to production by accident. That is a live hazard, not a backlog item |

#### The four decisions that moved work between phases

**Q1 turned a blocker into a task.** Phase 4 was gated on the provisioning answer. Now it is answered, so Phase 4 can start. **The answer added work to Phase 4** (the transaction, the `vanAlreadyClaimed` reason, the `claimMode` field) and **deferred a cheaper design to Phase 11** (match-only binding).

**Q4 split Phase 4 into two ordered halves.** The `phoneMasked` migration must complete **before** the new rules deploy. **Data first, rules second.** If they ship together in one commit, the order inside that commit matters.

**Q5 moved the admin panel's writes off direct Firestore.** That is Phase 8 and Phase 10 work (five callables plus the rules that let the admin panel read). **It is not a rules-only admin panel any more.**

**Q6 moved one line into Phase 9.** The `deviceId` claim has to be set at the user app's session bootstrap, before the complaint rules go live. **A rules change without the claim change denies every complaint read**, and the failure looks like "the complaints screen is empty".

**The `routeId` claim rides along with it.** The user app's "collected today" display reads the route's trips. **That read needs a scope too**, and the claim is what supplies it.

**Phases 4 and 5 are the expensive ones** because they change the client's auth flow. Everything else is additive.

### 11.2 The dependency that bites

```
Phase 4 (the rules rewrite) needs the client to sign in with a custom token.
Phase 5 (the server-authoritative writes) needs the client to call the Functions.
Both change the client's start path.
```

**They must land together, or the app breaks.** The client's half of Phase 4 is the `bindDeviceToVan` call in the identity flow. The client's half of Phase 5 is replacing the direct trip/van writes with the Function calls.

**And Phase 4 has an internal order that bites harder.**

```
1. Migrate the drivers docs: phone → phoneMasked + staffPhones.
2. Write the new rules. Do not deploy yet.
3. Deploy the client half: the bind call + signInWithCustomToken.
4. Deploy the callable.
5. Deploy the rules.
```

**Step 5 must be last.** Between step 4 and step 5, the old rules still allow `request.auth != null`, so the app keeps working. **Deploy the rules first and the app breaks**, because the client has no `vanId` claim yet and every write is denied.

### 11.3 The milestone view

| Milestone | What works | Which phase |
|---|---|---|
| **M1: The backend is not embarrassing** | The rules are tested, the index is deployed, the dead Functions are gone, CI runs | Phases 1-3 |
| **M2: The backend is secure** | Another driver cannot read this driver's phone. Another van cannot be written. The app still works | Phase 4 |
| **M3: The backend is correct** | No duplicate trips. No duplicate ward entries. No stale markers. The trail does not hit the 1 MiB cliff | Phases 5-6 |
| **M4: The backend is complete** | The PRD's event functions work. The user app can read the vans. The admin panel can act on a complaint, and a revoked staff member cannot | Phases 7-10 |
| **M5: The backend is production-grade** | App Check, flavors, CI with secrets, three environments | Phase 11 |

**M4 is the milestone the GO apps need.** M1-M3 are what they build on top of.

---

## 12. The identity questions, and their answers

**These were the questions that blocked work. All seven are answered.** Q1 was the office's call. Q2 to Q7 are the agent's recommendation, **pending the office's sign-off**.

**Read this section if you are about to write a rule, a callable, or a client message.** It is the shortest statement of *why* the model is what it is, and every answer is written with the exact change it forces.

### Q1 — The device-provisioning answer (blocks Phase 4)

> **Does the first phone to present a valid driver code claim the van, or must the van be pre-provisioned from the admin panel with its expected device?**

| Option | How | Production readiness |
|---|---|---|
| **A. First-claim** | The first phone to present a valid code creates the binding | Acceptable for a demo. A wrong claim is visible and fixable by a console write |
| **B. Pre-provisioned** | The admin panel writes `vanDevices/{vanId}` with the expected install id. The callable only **matches**, never creates | **The right answer.** It needs only a console write, no new app feature |
| **C. Pairing code** | The admin panel issues a pairing code the driver types once | The strongest, but it needs a pairing UI in the admin panel |

**Recommendation: B.** It costs a console write and it removes the "first to ask owns the van" race entirely.

**Who answers:** the office / the backend owner.

#### ANSWERED 2026-11-01: **A. First-claim**

**The office has chosen option A.** The first phone to present a valid driver code claims the van. **Phase 4 is unblocked.**

**What this changes in the design.**

| Thing | What first-claim means for it |
|---|---|
| **`vanDevices/{vanId}`** | Still created, still the binding record. But it is **created by the claim**, not by the admin. The callable is a **create-or-match**, not a match-only |
| **The claim race** | **Real.** Two phones presenting the same code at the same time both try to claim. **A Firestore transaction on the `vanDevices/{vanId}` doc settles it.** The second one gets "already claimed", not a silent double-bind |
| **A wrong claim** | Recoverable **by a console write**: delete the `vanDevices/{vanId}` doc. The next phone can claim it. **This must be a documented runbook step**, because there is no admin console |
| **The `drivers.vanId` check** | The claim must still verify that the **driver is allotted that van**. Otherwise any driver with a valid code claims any van |
| **The device id** | Must be a **stable install id**, not a random per-launch value. Otherwise a second launch creates a second binding. The app already has an install-id concept (the user app's `deviceId`) |

**The two risks first-claim accepts, stated plainly.**

| Risk | Severity | Mitigation |
|---|---|---|
| **A wrong person claims a van** | LOW for a demo. The claim is visible in the `vanDevices` doc and fixable by a console write | The runbook step. And the driver still has to be listed in `drivers.vanId` |
| **Two phones race for the same van** | MEDIUM. The loser must be told clearly, not silently | The transaction. **And this is the same typed-conflict copy as Q2** — one `startConflict` phase, two reasons: `vanHeldByAnotherDriver` and `vanAlreadyClaimed` |

**The mitigation that makes both cheap.** The "already claimed" case and the "another driver is on shift" case are **the same class of error** and should **share one copy and one phase**. So the Q2 decision is not only a copy decision, it is also a **design simplification**: one typed conflict with a reason enum, two or three reason values.

**What still needs a decision.** Q1 is answered. **Q2's copy** and **Q3's authority question** are still open.

### Q2 — The shared-van conflict copy (blocks the client, not the backend)

> **What does the app say when the van is already on shift with another driver?**

The current copy is *"Couldn't start the shift. Check the connection and try again."* (`app_en.arb:15`), which is wrong: the connection is fine.

**The recommendation** (from `AUDIT2-flow-backend-ui.md` A.2.2) is three separate messages: a title *"This van is on shift"*, a body for *"another driver"*, and a body for *"the shift record is out of date"*. Both in English and Gujarati.

**Who answers:** the product owner.

#### ANSWERED 2026-11-01 (agent recommendation, pending office sign-off): **one typed conflict, three reasons**

**The copy is derived, not chosen by hand.** There is one conflict phase and one copy per reason, so the same code path serves the start-shift conflict, the first-claim conflict (Q1's race), and the stale-marker conflict.

| Reason | When | English copy | Gujarati intent |
|---|---|---|---|
| `vanHeldByAnotherDriver` | `trips.driverId` is set and is not this driver | **"This van is on shift with another driver."** + *"Check with the office, or tap 'Different driver?'"* | **"Ye van doosre driver ke saath shift me hai."** |
| `vanAlreadyClaimed` | Q1's first-claim race. Another phone already holds the binding | **"This van is already set up on another phone."** + *"Check with the office, or tap 'Different driver?'"* | **"Ye van doosre phone pe set up hai."** |
| `staleMarker` | `vans.currentTripId` points at a trip of a different van | **"This van's shift record is out of date. Check with the office."** | **"Is van ka shift record purana hai."** |

**The CTA is the same in all three:** a pinned **Retry**, plus a visible **"Different driver?"** link, because the realistic resolution on a shared phone is *"that is not me, let me in as someone else"*.

**The one thing that must NOT happen:** reusing `shiftStartFailed`. That copy is *"Couldn't start the shift. Check the connection and try again."* It is about a **connection**. In all three conflict cases the connection is **fine**, and telling a driver to check their network when the van is occupied sends them to the wrong problem.

**The implementation shape.**

```dart
enum ShiftConflictReason { vanHeldByAnotherDriver, vanAlreadyClaimed, staleMarker }

class ShiftStartConflict implements Exception {
  const ShiftStartConflict(this.reason);
  final ShiftConflictReason reason;
}
```

Then in `identity_flow.dart`, **catch it before the generic `Exception`**:

```dart
} on ShiftStartConflict catch (conflict) {
  state = state.copyWith(
    phase: IdentityFlowPhase.startConflict,
    conflictReason: conflict.reason,
  );
} on Exception {
  state = state.copyWith(phase: IdentityFlowPhase.startFailed);
}
```

**The copy is looked up from the reason**, not hardcoded per call site. That is what keeps the three reasons from drifting.

**The arb keys, both locales.**

| Key | English | Gujarati intent |
|---|---|---|
| `identityShiftConflictTitle` | "This van is on shift" | Van par shift chal rahi hai |
| `identityShiftConflictOtherDriver` | "Another driver is on shift with this van. Check with the office, or tap Different driver." | Ye van doosre driver ke saath shift me hai |
| `identityShiftConflictClaimed` | "This van is already set up on another phone. Check with the office, or tap Different driver." | Ye van doosre phone pe set up hai |
| `identityShiftConflictStaleMarker` | "This van's shift record is out of date. Check with the office." | Is van ka shift record purana hai |

**Why this answer is the cheap one.** The three reasons share one phase, one error type, one CTA layout, and one set of three l10n keys. **A separate screen or a separate flow per reason would triple the work for no gain.**

**Why it is still worth the office's sign-off.** The words themselves are a **product** decision, not a technical one. The words above are the agent's recommendation. **If the office wants different words, only the three arb strings change. The code shape does not.**

**What Q1's answer changes here.** First-claim (Q1) introduces a **new** reason, `vanAlreadyClaimed`. That is why the answer is one phase with three reasons, not one copy. **The first-claim decision added a reason to the enum, and that is the whole coupling.**

### Q3 — The auth authority (blocks the whole build)

> **Is PRD §0.16 authoritative over the older PRD sections?**

PRD §0.16 `:179` says the app stopped calling `verifyDriverPin`. But PRD `:61`, `:126`, `:161`, `:217`, `:224`, `:242` and `:267` still describe it as the live auth path, and `:267` still lists *"Backend Owner deploys `verifyDriverPin` and seeds `vanSecrets`"* as a dependency.

**Without an answer, a builder will build the PIN flow and then delete it.** This is the one question that can waste days.

**Recommendation: §0.16 wins.** Strike the older sections. `vanSecrets` is removed.

**Who answers:** the backend owner.

#### ANSWERED 2026-11-01 (agent recommendation, pending backend-owner sign-off): **§0.16 wins**

**The PRD's own text decides it.** §0.16 `:179` says *"Supersedes the D1 half of `F-D1` (van picker + PIN) and the driver-app side of the `verifyDriverPin` callable."* It is not ambiguous, and it is the **newer** section. The older sections were simply **never struck**, which is a documentation bug, not a genuine ambiguity.

**What "§0.16 wins" means concretely.**

| Item | Decision |
|---|---|
| `verifyDriverPin` | **DELETE.** The app never calls it (`grep` → 0 hits in `lib/`) |
| `setDriverPin` | **DELETE.** It has an unauthenticated write path behind `DEMO_SEED_BYPASS` (B-09) |
| `vanSecrets` | **DELETE** the collection. The rules already deny it by default (probe 6), so this is a cleanup, not a fix |
| The `cloud_functions` dependency | **DELETE** from `pubspec.yaml`. Nothing in `lib/` imports it |
| The D1 PIN screen, the van picker, the `PinPad` | **Already gone from the code.** `docs/DESIGN.md` is the stale side |
| PRD `:61`, `:126`, `:161`, `:217`, `:224`, `:242`, `:267` | **Strike them** in the next PRD revision. Each one now names a deleted Function |
| The PRD's **build order** in §5 | **Rewrite it.** It currently lists "deploy `verifyDriverPin` and seed `vanSecrets`" as a dependency. That line would send the next builder to build the deleted thing |

**The one thing §0.16 does NOT decide.** §0.16's *stance* (the badge code is public, so the phone number is the only secret) is right. But §0.16's *wording* on the rules is wrong, and that is **Q7**. **The same "§0.16 wins" decision must not be used to also keep `:193`'s "the rules carry no custom-claim checks" sentence.** See Q7.

**The verification step.** After the deletions, run `grep -rn "verifyDriverPin\|setDriverPin\|vanSecrets\|DEMO_SEED_BYPASS" lib/ functions/src/ scripts/`. **Zero hits.** That is the proof the deletion is complete. It is also a one-line test that a future builder can re-run.

### Q4 — The phone masking (blocks the rules rewrite's final shape)

> **Should the raw driver phone number ever reach the driver app, or only a masked form?**

| Option | Cost |
|---|---|
| **A. Masked only.** The raw phone is an office record. The driver app sees `98XXXXXX10` | The admin panel must mask on write. **Recommended** |
| B. Raw, readable by the same-van driver | Simpler. Leaks to the route group |

**Who answers:** the office. **Recommendation: A.**

#### ANSWERED 2026-11-01 (agent recommendation, pending office sign-off): **A. Masked only**

**The raw phone never enters the driver app's read path.** The mask is written at the source, not applied by the reader.

| Where | What |
|---|---|
| **The `drivers` doc** | Stores `phoneMasked` (`98XXXXXX10`). **Optionally** stores `phone` in a **separate, admin-only** doc or field that the driver's rules cannot read |
| **The driver's read rule** | `allow read: if request.auth.token.driverId == driverId` and the field list is restricted to `name`, `vanId`, `routeId`, `wardIds`, `active`, `phoneMasked` |
| **The office / admin panel** | Reads the raw phone from the admin-only path, with staff claims scoping it |

**The masking format.** `98XXXXXX10` is the PRD's own format (§0.16's welcome card shows *"phone masked `98XXXXXX10`"*), so it is **already the contract**. Keep it.

**Why A over B, in one line.** The phone is the **only secret** the driver identity has (the code is public by design). So the phone should have the **tightest** possible read scope, and the driver app **does not need it**. The driver app shows the mask to confirm *"this is my record"*.

**What the admin panel must do.** The admin panel is the **only** consumer of the raw phone, and it is staff-scoped. So the raw phone lives behind the staff rules (section 5.2), and the driver rules simply cannot see it.

**The migration note.** The current `drivers` docs have a raw `phone`. **The driver app's read rule must be field-restricted**, not just collection-restricted, or the raw phone leaks through the same doc. **A collection-level rule is not enough.** That is the same lesson as B-24's `flagged`.

### Q5 — The admin's scope refresh (blocks the admin panel's auth)

> **How quickly must a staff member's ward scope take effect after the office changes it?**

| Option | Cost |
|---|---|
| A. On the next sign-in. The admin panel shows "your scope was last refreshed at ..." | Zero. The claim is set at sign-in |
| B. A Function re-mints the token when the staff doc changes | A small Function. Correct |

**Who answers:** the office. **Recommendation: A for the demo, B if the office changes scopes often.**

#### ANSWERED 2026-11-01 (agent recommendation, pending office sign-off): **A now, B in Phase 11**

**Phase 0 to Phase 10: option A.** The staff claims (`role`, `staffId`, `wardIds`) are minted **at sign-in**. The admin panel shows the refresh timestamp so the office knows the scope may be stale.

**Phase 11: option B.** A small Function re-mints the token when the `staff/{id}` doc changes. It is a **hardening** item, not a build item.

**Why A is enough for now.** The office changes a staff member's scope when that person is **transferred or leaves**. A transferred inspector needs the new scope at their **next sign-in**, which is the same thing as "when they next open the app". The only bad case is a scope that must be **revoked instantly**, and that case is handled by **disabling the account**, not by the scope.

**The instant-revocation rule, which is separate and must not be skipped.** Option A's weakness is that a **revoked** staff member keeps their scope until their token expires. So:

| Rule | How |
|---|---|
| **Revoke** | Set `staff/{id}.active = false`. The admin panel's auth check reads the `staff` doc **server-side** on every privileged action, not from the token alone. So a revoked account loses access **immediately**, even with a live token |
| **Scope change** | Takes effect at the next sign-in. **Acceptable** |

**The difference matters.** *Revocation* must be instant, and it is, because it is checked against the doc. *Scope narrowing* can wait for the next sign-in, because the staff member's own access is not at risk from a slightly-too-wide scope for a few hours.

**The admin panel must show the refresh time.** If a scope is stale, the office needs to see it. One line: *"your scope was last refreshed at 2026-11-01 09:12"*. Without it, a stale scope is invisible and the office blames the app.

**The token lifetime is what makes this safe.** Firebase ID tokens expire after **1 hour**. So option A's real refresh window is **1 hour, not forever**, as long as the client refreshes the token. That is the built-in mechanism, and it should be stated in the ADR.

### Q6 — The user's complaint visibility (blocks the user app's rules)

> **Can a citizen see a complaint made on a device after the app is reinstalled, or only from the same install?**

The `deviceId` is a locally-generated UUID stored on the device. A reinstall loses it.

| Option | How |
|---|---|
| A. Same install only | `deviceId` is the key. Simple. A reinstall loses the history |
| B. A phone-number or OTP link | The citizen proves ownership. Needs a verification step |

**Recommendation: A for the demo.** The citizen can always file a fresh complaint.

**Who answers:** the product owner.

#### ANSWERED 2026-11-01 (agent recommendation, pending product-owner sign-off): **A. Same install only**

**The `deviceId` stays the key.** A reinstall loses the complaint history, and that is accepted for this build.

**Why A is the right call here.**

| Reason | Detail |
|---|---|
| **The cost of the complaint is low** | A missed collection is not a fine. The citizen can file a fresh one, and the citizen's ward is not at risk |
| **B needs a whole verification subsystem** | A phone number or OTP means an **SMS flow**, a **verification collection**, a **rate limit**, and a **consent screen**. That is a second product |
| **The citizen has another path** | The complaint is also visible to the **office**, and the office can see it in the admin panel. The citizen losing the app-side history does not lose the complaint |
| **The user app's whole point is no signup** | PRD-1's user app is **anonymous by design**. Requiring a phone number to see your own complaint turns it into an account app, which is a product change, not a backend change |

**What the rules must do.** The `deviceId` is the **scope key**, and the rules must compare it:

```
allow read: if request.auth != null
  && resource.data.deviceId == request.auth.token.deviceId;
```

**The one thing that must be right.** The `deviceId` must be put in a **custom claim** on the session, not passed by the client as a query parameter. If the client sends the `deviceId` in the query, a caller can change it and read another device's complaints. **This is the same class of bug as B-01**: trusting the client to name its own scope.

**The honest limitation to tell the office.** *"If the citizen reinstalls the app, they lose the complaint history on their phone. The complaint is still in the system and the office can see it. For this build that is accepted."* That sentence should be in the handover notes, so nobody debugs it as a bug later.

### Q7 — The PRD contradicts itself about custom-claim checks in the rules

> **Does §0.8's `vanId` claim check override §0.16's "rules carry no custom-claim checks"?**

This one is not a business question. **It is a straight contradiction inside the frozen PRD**, and a builder who reads only one half will build the wrong rules.

| Where | What it says |
|---|---|
| **PRD `:68`** (in the §0.8 rules summary) | The rules must check a **`vanId` custom claim** on writes to `vans` and `trips` |
| **PRD `:193`** (§0.16, the newer ruling) | *"The rules carry no custom-claim checks"* |

**Both cannot be true.** They point at two different authorization models:

| Model | What it means | What the rules can check |
|---|---|---|
| **§0.8's model** | The token carries `vanId`. The rules compare it to the doc's `vanId` | Yes. `request.auth.token.vanId == resource.data.vanId` |
| **§0.16's model** | The rules trust the badge code alone. The server does the binding | No. The rules can only check `request.auth != null` |

**Why §0.16's model cannot work as written.** The whole point of the device-binding model (section 4) is that the badge code is a **public badge, not a secret** (§0.16 `:193`). If the rules carry no custom-claim checks, then the rules can only check *"is someone signed in"*, which is exactly the hole the 17 emulator probes proved (section 5.1). The P0 does not close.

**Recommendation: §0.16 wins, and `:193` should be corrected rather than read literally.** The §0.16 *intent* (the badge code is not a secret, the phone number is) is right. The §0.16 *wording* ("the rules carry no custom-claim checks") is wrong, because a claim is the only thing the rules can use to tell one driver from another.

**The corrected sentence should read something like:** *"The badge code is not a secret and is never used as an authorization token. The rules scope writes by the `vanId` custom claim on the session, which the server sets after the device binding. The badge code only attributes the shift."*

**Who answers:** the backend owner. **This is the same answer as Q3**, because both are *"is §0.16 authoritative?"*. **If §0.16 wins, treat `:193` as containing one wrong sentence and correct it in the next PRD revision.**

#### ANSWERED 2026-11-01 (agent recommendation, pending backend-owner sign-off): **§0.8's model wins. `:193`'s sentence is corrected.**

**This is a one-word fix to the PRD, and it is forced by the evidence, not by preference.**

**The reasoning, in order.**

1. **§0.16 wins overall** (Q3's answer). So §0.16 is the authority.
2. **But §0.16's *intent* is what wins, not its *letter*.** §0.16's intent is *"the badge code is public, so it cannot be the authorization boundary, so the phone number is the secret"*. The sentence *"the rules carry no custom-claim checks"* **contradicts that intent**, because without a claim the rules cannot tell one driver from another.
3. **The emulator proves it.** 17 probes. An anonymous caller rewrote **another van's** `status` and `currentTripId`, and the write **landed**. Under §0.16's literal model, **that write would still be allowed**, because the model only allows `request.auth != null`.
4. **Therefore the literal reading of `:193` leaves the P0 open.** A document that is known to be wrong cannot be the specification.

**The one-sentence PRD correction.** Replace *"0.8 rules carry no custom-claim checks"* with:

> *"The badge code is not a secret and is never used as an authorization token. The rules scope writes by the `vanId` custom claim on the session, which the server sets after the device binding. The badge code only attributes the shift."*

**The rule changes this forces, and nothing else.**

| Rule | Change |
|---|---|
| `vans/{id}` update | Add `request.auth.token.vanId == vanId` |
| `trips/{id}` update | Add `request.auth.token.vanId == resource.data.vanId` |
| `drivers/{code}` read | Add `request.auth.token.driverId == code`. **This is what stops the phone-number leak** (probe 1) |
| `vans` **list** | **DENIED.** The app only ever reads one van by id (B-18 deletes `readVans`, the only list call) |
| `drivers` **list** | **DENIED.** The app only ever reads one driver by id |

**The claims the token carries.** This is the whole model, and it is small.

| Claim | Set by | Used for |
|---|---|---|
| `vanId` | The device-binding callable | Scoping `vans` and `trips` writes |
| `driverId` | The same callable, from the badge code | Scoping the `drivers` read. **This is the phone-number wall** |
| `deviceId` | The user app's session bootstrap | Scoping the **user app's** complaint and rating reads (Q6) |
| `routeId` | The user app's session bootstrap | Scoping the **user app's** trip reads, for the "collected today" display |
| `currentTripId` | The `startShift` callable | Scoping the driver's D4 complaint updates |
| `role`, `staffId`, `wardIds` | The admin panel's sign-in | Scoping the admin's **reads** |

**The badge code's only job** is to become `driverId` inside the callable, **server-side**, where the binding is verified. It never appears in a rule.

**The correction to the PRD is one sentence.** The correction to the **rules** is the Phase 4 work, and it is the same work either way. **There is no version of this where §0.16 is read literally and the P0 closes.** That is the whole argument.

### The summary

| # | Question | Answer | Status | Blocks | Who signs off |
|---|---|---|---|---|---|
| **Q1** | First-claim or pre-provisioned? | **A. First-claim** | **ANSWERED** (office) | The rules rewrite (Phase 4) | ✅ Done |
| **Q2** | The shared-van conflict copy | One typed phase, three reasons | **ANSWERED** (agent rec) | One client change | Office |
| **Q3** | Is §0.16 authoritative? | **§0.16 wins** | **ANSWERED** (agent rec) | The whole build | Backend owner |
| **Q4** | Raw or masked phone? | **A. Masked only** | **ANSWERED** (agent rec) | The rules' final shape | Office |
| **Q5** | The scope refresh speed | **A now, B in Phase 11** | **ANSWERED** (agent rec) | The admin panel's auth | Office |
| **Q6** | The complaint visibility after a reinstall | **A. Same install only** | **ANSWERED** (agent rec) | The user app's rules | Product owner |
| **Q7** | §0.8's `vanId` claim check vs §0.16's "no custom-claim checks" | **§0.8's model wins, `:193` corrected** | **ANSWERED** (agent rec) | The rules' final shape. **Same answer as Q3** | Backend owner |

**Every answer above is the agent's recommendation except Q1, which the office gave.** The five pending ones (Q2 to Q7) are marked *"pending sign-off"* in their own sections. **If the office changes one, only that section's copy or design changes. The decisions are deliberately isolated so that a change to one does not cascade.**

**The three answers that, if changed, would cause the most rework.**

| # | If it flips | The rework |
|---|---|---|
| **Q3 / Q7** | If §0.16 is read literally, the rules stay `request.auth != null` | **The P0 does not close.** The 17 probes keep passing. This is the expensive one |
| **Q4** | If the raw phone reaches the driver app | The `drivers` read rule needs a second path, and the raw phone has already leaked once. **Cannot be un-leaked** |
| **Q6** | If the citizen needs to see their complaints after a reinstall | A whole verification subsystem. **The only answer that turns a no-login app into an account app** |

---

## 13. The glossary

### The domain

| Term | Meaning |
|---|---|
| **Ward** | A collection area the van serves. A centre point plus a radius. The citizen's geography |
| **Route** | An ordered list of wards a van visits in a shift. `routes/{id}.wardIds` is the visiting order, and it is load-bearing for the ETA |
| **Van** | The vehicle. Carries one tracked phone. Serves one route |
| **Driver** | The person borrowing the van's phone. **Not** the same thing as the van |
| **Driver code** | A badge like `AB-1001`. The doc id of `drivers/{CODE}`. **A public identifier, not a secret** |
| **Shift / Trip** | One work session. `trips/{id}` is the record |
| **Complaint** | The citizen's report. The busiest collection |
| **Ticket id** | The human id of a complaint. Format `PMH-YYYYMMDD-NNNN` |
| **Escalation level** | `0` inspector, `1` chief officer/TDO, `2` DDO |
| **Depot** | An admin-set tag on the van. 3 h of dwell auto-ends the shift |
| **Arrival alert** | The push to a citizen when the van nears their ward |
| **The merge** | Two complaints at the same spot become one. `mergedInto` points at the survivor |

### The technical

| Term | Meaning |
|---|---|
| **The rules** | `firestore.rules`. The server-side authorization. **The security boundary** |
| **Anonymous auth** | Signing in with no account. You get a session but no identity |
| **Custom claims** | Extra fields baked into a token by the server. `vanId`, `driverId`, `role`, `staffId` |
| **Custom token** | A token the server mints and the client signs in with. It carries custom claims |
| **The callable** | An HTTPS endpoint the client calls, which runs server-side code. `https.onCall` |
| **The trigger** | A Function that fires on a document write. `firestore.onDocumentUpdated` |
| **The scheduler** | A Function that runs on a timer |
| **The Admin SDK** | The server-side Firebase library. It **bypasses** the rules entirely |
| **App Check / Play Integrity** | Firebase's proof that the caller is the real signed app |
| **Composite index** | A Firestore index on multiple fields |
| **Multi-branch index** | The special index an `OR` query with 2+ field-equality branches needs |
| **Server timestamp** | `FieldValue.serverTimestamp()`. The server's clock |
| **The emulator** | A local Firebase. **Does not enforce composite indexes** |
| **A transaction** | A read-modify-write that is atomic. The only way to make "read then write" safe |
| **`arrayUnion`** | Adds items to an array without duplicating. **Not idempotent** for the same value |
| **A seam** | Where an interface lives. A point where behaviour can change without editing in that place |
| **A P0 / P1 / P2** | Priority. P0 = data loss or a security hole |

### The process

| Term | Meaning |
|---|---|
| **The contract** | PRD-2. The frozen agreement between the apps. §0.16 is the newest section and wins |
| **A ruling** | A product decision resolving a contract contradiction. Recorded in the PRD, not just the code |
| **An ADR** | An Architecture Decision Record. A short file in `docs/adr/`. **The directory exists and is empty** |
| **G1 / Q1** | The blocking questions. See section 12 |
| **The free wins** | Backend fixes that change no contract and no app |
| **Rule 0** | `GLOSSARY.md`: *"after a feature finishes building, verify it AS A USER WOULD"* |

---

## 14. The closing note

**Five things this blueprint is trying to prevent.**

| The trap | The prevention |
|---|---|
| **Building the PIN flow because the older PRD sections describe it** | Q3. §0.16 wins. `verifyDriverPin` and `vanSecrets` are deleted |
| **Shipping a rule that checks `request.auth != null` and calling it authorization** | Section 5. The rules must scope on a **claim**, and there must be a **rules test suite** proving it |
| **Copy-pasting a constant into three codebases** | Section 9. One JSON file, with a Dart test that verifies the Dart side matches |
| **Letting the admin panel write directly to Firestore** | Q5. The admin's writes go through callables, so a revoked staff member loses access **immediately** |
| **Sending English text from the server and matching it in the app** | Q2. The server sends a **reason code**. The app owns the words |

**Two more traps that are live right now.**

| The trap | The prevention |
|---|---|
| **Deploying the Functions and shipping yesterday's code** | Section 10.3. `functions/lib/index.js` is **27 hours older** than `functions/src/index.ts`. The build must be a **precondition** of the deploy, not a step someone remembers |
| **Running the seed script and writing to production** | Section 10.3. `scripts/seed_drivers.mjs` defaults to the **live** project `safaaisaathi-63a87`. The env var must be mandatory, with no default |

**One sentence.** *The backend is not a set of endpoints, it is a set of **boundaries**: what the driver app may write, what the user app may read, what the admin may act on, and what only the server may decide. Get the boundaries right and the three apps connect without ever talking to each other.*

---

**Verified at HEAD `a0cba52`. `flutter analyze` clean, `flutter test` 451/451, 17/17 emulator probes matched the prediction.** Read-only. Zero code changes, zero commits, zero branch switches.

**The seven questions in section 12 are ANSWERED.** Q1 was the office's call (first-claim). Q2 to Q7 are the agent's recommendation, pending the office's sign-off. **None of them blocks the build any more.** If the office flips one, only that one section changes, because the decisions were kept deliberately isolated.

**The one thing that is still worth asking the office, and it is not a question:** *when a phone is replaced, who runs the `vanDevices` recovery step?* That is a runbook line, not a design question. It goes in the handover notes (section 4.5).

---



