---
id: onboarding
title: Onboarding
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: human
see_also:
  - ./product-overview.md
  - ../07-guides/firebase-access-and-keys.md
  - ../07-guides/firebase-getting-started.md
---

# Onboarding

**For a human teammate on day one.** If you are an AI harness, skip this file. Read `../AGENTS.md` instead.

**Never used Firebase before?** Read [`../07-guides/firebase-getting-started.md`](../07-guides/firebase-getting-started.md) first. It lists what to install for your stack, the order of the steps, and how secrets reach the project.

## The three rules before anything else

| # | Rule | Why |
|---|---|---|
| 1 | **The Firebase client config is not a secret.** Hand it over freely | It says "which project". The security is in the rules |
| 2 | **A service account key never leaves the backend owner.** Not to a teammate, not into a repo, not into an app | It uses the Admin SDK, which bypasses every rule |
| 3 | **Never edit the contract in your app repo.** Open a request | The contract has one home |

## Day one, all three roles

| # | Step | How |
|---|---|---|
| 1 | Get **Viewer** on the Firebase project | Firebase console → Project settings → Users and permissions |
| 2 | Install the CLI and log in | `npx -y firebase-tools@latest login`. Never install it globally. The npx form never drifts |
| 3 | Point the CLI at the project | `firebase use safaaisaathi-63a87`. It writes `.firebaserc` |
| 4 | Clone this repo | `git clone <the platform repo>` |
| 5 | Vendor the contract into your app repo | `node 08-tools/sync-contract.ts ../your-app-repo` |
| 6 | Add the `AGENTS.md` block to your app repo | See `../07-guides/reading-the-contract.md` |
| 7 | Verify | `node 08-tools/validate-contract.ts` must print `contract valid` |

## Day one, the user app developer

| # | Step | Note |
|---|---|---|
| 1 | Register a new **Android + iOS** app in the Firebase console | One project, a new registration. The driver app's is separate |
| 2 | Run `flutterfire configure` | It writes `lib/firebase_options.dart` and `google-services.json` |
| 3 | Get the web config | The console's "SDK setup and configuration" |
| 4 | Read `../07-guides/reading-the-contract.md` | Your read budget starts here |
| 5 | Read the `ward`, `route`, `van`, `trip` and `complaint` schemas | Five collections, that is your whole surface |
| 6 | Note the two indexes your queries need | `vans(routeId, status)` and `complaints(wardId, createdAt)`. **Neither exists yet** |

## Day one, the admin panel developer

| # | Step | Note |
|---|---|---|
| 1 | Register a new **Web** app in the Firebase console | One project, a new registration |
| 2 | Put the config in env vars | `NEXT_PUBLIC_FIREBASE_*` |
| 3 | Restrict the web key by HTTP referrer | Google Cloud → Credentials. Hygiene, not security |
| 4 | Read `../07-guides/reading-the-contract.md` | |
| 5 | Read the `complaint`, `notice`, `driver`, `staff` and `staffPhone` schemas | Five collections |
| 6 | Note that **every write is a callable** | There are five of them. There will be no direct write |

## The emulator

```bash
npx -y firebase-tools@latest emulators:start
```

**The emulator config is in `03-rules/firebase.json`.** It runs the auth and the Firestore emulators.

**Two caveats you must know.**

| Caveat | What it means |
|---|---|
| **The emulator does NOT enforce composite indexes** | A green emulator run is **not** proof that your query has an index. Deploy to staging and check |
| **The emulator does not have real FCM** | A push you see locally is a mock. Test the real push on staging |

## The Firebase config, in one table

| Thing | Who gets it | Secret? |
|---|---|---|
| The web config (apiKey, appId, projectId, authDomain, messagingSenderId) | **Everyone** | **No.** These are identifiers. Anyone can extract them from an APK in ten seconds |
| `google-services.json` / `GoogleService-Info.plist` | The mobile teammates | **No.** Same reason |
| The project id `safaaisaathi-63a87` | Everyone | No |
| `firestore.rules` | **Read:** everyone. **Write:** the platform owner only | The rules are the security boundary. The ability to edit them **is** full access |
| A service account JSON key | **Nobody but the platform owner.** Never in a repo, never in an app | **Yes.** It uses the Admin SDK, which bypasses the rules. A leaked one is a full database takeover |

**The sentence that settles it.** *A Firebase client API key is not a password. It says "which project". The security is enforced by the rules, not by the key.*

**Still restrict the key.** An unrestricted key can be used from a script anywhere, which burns your quota and can trip Google's abuse detection. **Restriction is hygiene, not security.**

## The one hard rule for the client apps

**A client app must never contain the Admin SDK.**

| In a Flutter app | Verdict |
|---|---|
| `cloud_functions` | **Fine.** It is the client SDK for calling a callable |
| `firebase-admin` | **Not fine.** It is the server SDK. It would bypass every rule |

| In the admin panel | Verdict |
|---|---|
| `firebase` (the web client SDK) | **Fine** |
| `firebase-admin` | **Not fine.** Same reason |

## What to read, in order

| # | Read | Time |
|---|---|---|
| 1 | `product-overview.md` | 2 minutes |
| 2 | `../07-guides/firebase-getting-started.md` | 15 minutes. Skip it if you already know Firebase |
| 3 | `../07-guides/reading-the-contract.md` | 5 minutes |
| 4 | The schemas for the five collections you touch | 20 minutes |
| 5 | `../07-guides/backend-split.md` | 10 minutes |
| 6 | `../05-decisions/index.md` | 15 minutes |

**Do not read `09-reference/` on day one.** It is 2883 lines of background. Read it when you need the history.
