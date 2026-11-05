---
id: firebase-getting-started
title: Firebase From Zero
status: frozen
owner: platform-owner
updated: 2026-11-02
contractVersion: "1.0.0"
audience: harness
see_also:
  - ./firebase-access-and-keys.md
  - ./backend-split.md
  - ../00-context/onboarding.md
  - ../02-contracts/README.md
  - ../03-rules/README.md
---

# Firebase From Zero

**For a teammate who has never used Firebase, and for the harness that is setting them up.**

**The harness runs this guide. The human answers the questions.** Every step says who acts.

**This guide is not the source of truth for the backend.** The contract is. This guide only teaches a person how to get Firebase running on their machine, and how to use it inside this project.

## 1. Authority order

1. `../02-contracts/` wins over anything. A field, an enum value, a claim, a topic, a callable or a reason code that is not in there does not exist.
2. `../03-rules/firestore.rules` wins over anything that claims who may read or write.
3. `./firebase-access-and-keys.md` wins over this guide on **access and secrets**. If the two disagree, that file is right and this guide gets a fix.
4. This guide wins over any generic Firebase advice, any tutorial, any course, and any model's memory of how Firebase works.
5. The Firebase console's defaults lose. Its default rules, its default indexes and its "test mode" are not this project's rules.
6. The platform owner wins over a teammate on anything that changes the shared project.

**On a conflict, report it. Never resolve it by editing the winner to match the loser.**

## 2. Hard constraints

| # | Constraint |
|---|---|
| 1 | NEVER install `firebase-admin` in a client app. It bypasses every rule. It belongs in `../04-functions/` only |
| 2 | NEVER type a secret value into the chat, into a tracked file, or into a command argument. Section 4.9 is the only way a secret enters this project |
| 3 | NEVER run `firebase functions:secrets:access`. It prints the value. Use `functions:secrets:get`, which prints metadata |
| 4 | NEVER create a Firebase project. The project is `safaaisaathi-63a87`. It already exists |
| 5 | NEVER deploy during an onboarding session. A deploy is a human action, and the order is load-bearing |
| 6 | ALWAYS use `npx -y firebase-tools@latest`. Never a bare `firebase`, never a globally installed copy that drifts out of date |
| 7 | NEVER edit a rule, an index, a schema or a Function in an app repo. The app consumes. The platform repo owns |
| 8 | NEVER trust the emulator as proof of index coverage. It does not enforce composite indexes |
| 9 | NEVER enable billing without asking the human first. It costs money |
| 10 | NEVER commit a file with a `private_key` field, a service account JSON, or an `.env` that holds real values |

## 3. Read budget

| Your task | Read exactly these | Do not read |
|---|---|---|
| Set a teammate up on a machine | This file, `./firebase-access-and-keys.md` | `../09-reference/` |
| Install the tools for one stack | This file, section 4.2 | The console |
| Wire an app's config files | This file, section 4.6 | `../09-reference/` |
| Get a secret into the project | This file, section 4.9 | The Functions source, first |
| Start the emulator | This file, section 4.7, `../03-rules/firebase.json` | The console |
| Write the first Firebase code | This file, section 4.8, the one schema you read | Every schema |
| Debug a permission error | `../03-rules/firestore.rules`, this file section 4.11 | The console's rules tab |

## 4. Procedure

### 4.1 The mental model, before any command

**A teammate who does not have these six ideas will get stuck in the first ten minutes.** Say them out loud, or check them one by one.

| # | Idea | Why they need it |
|---|---|---|
| 1 | Firebase is a backend you rent. It is not a file on your disk | It explains why there is a project id, an emulator, and a deploy step |
| 2 | The project is the unit of sharing. `safaaisaathi-63a87` holds all three apps | One project, one database, one rules file, one Functions deployment |
| 3 | The SDK talks to the project. The config is a public address, not a password | It settles the "is the apiKey a secret" question once, and for good |
| 4 | The security lives in the rules file, and the rules file lives in the platform repo | A client can only read what the rules allow it to read |
| 5 | A callable is a function the client calls over HTTPS. It runs with admin powers, so it checks the caller itself | It explains why `startShift` and `bindDeviceToVan` exist at all |
| 6 | The emulator runs the whole backend on the laptop. It is the default environment | They can work without touching shared data |

**What this project actually uses.** Not all of Firebase. These six, and nothing else.

| Firebase product | Where it is used here |
|---|---|
| Cloud Firestore | 18 collections. The entire data layer |
| Authentication | Anonymous sign-in for the driver app and the user app, email for the admin panel. Custom claims carry the scope |
| Cloud Functions | 23 functions in the contract. 16 callables and 7 server functions. All 23 are built in `../04-functions/` |
| Cloud Messaging | 4 topics. `van_`, `ward_`, `staff_`, and `all` |
| Hosting | The admin panel. Not deployed yet |
| Emulator Suite | Local development. Auth on 9099, Firestore on 8080, Functions on 5001, Storage on 9199 |

### 4.2 The tool install matrix, by stack

**A Flutter developer and a React developer install different things.** Find the row for the stack, then follow that row's steps.

| Stack | Which app | Install | Never install |
|---|---|---|---|
| **Flutter, Android** | driverapp | Flutter SDK with Dart 3.13 or newer, the driver app runs Flutter 3.47.7 and Dart 3.13.5. Android Studio and the Android SDK. `firebase-tools` via npx. The FlutterFire CLI. The Dart packages `firebase_core`, `firebase_auth`, `cloud_firestore`, `cloud_functions`, `firebase_messaging` | `firebase-admin` |
| **Flutter, Android and iOS** | userapp | The same, plus Xcode and CocoaPods | `firebase-admin` |
| **React or Next.js, web** | adminpanel | Node 22.6 or newer, `firebase-tools` via npx, and the npm package `firebase` | `firebase-admin` in client code |
| **Cloud Functions, TypeScript** | the platform's `04-functions/` | Node 22, plus the npm packages `firebase-admin` and `firebase-functions`. The deployed runtime is Node 22: Node 20 was decommissioned on 2026-10-30 | Nothing extra |
| **Only reading the contract** | any | Node 22.6 or newer. That is the whole list | Everything |

**Flutter steps.** Each command says what it does. Run them in this order.

| # | Command | What it does |
|---|---|---|
| 1 | `flutter doctor` | Checks the Flutter install and the Android toolchain. Fix everything it flags before continuing |
| 2 | `dart pub global activate flutterfire_cli` | Installs the FlutterFire CLI. It is the tool that writes the config files |
| 3 | `export PATH="$PATH:$HOME/.pub-cache/bin"` | Puts `flutterfire` on the PATH. Without it step 4 fails with "command not found" |
| 4 | `flutterfire --version` | Confirms the FlutterFire CLI is reachable |
| 5 | `npx -y firebase-tools@latest --version` | Checks the Firebase CLI. npx means it is never installed globally and never drifts |
| 6 | `npx -y firebase-tools@latest login` | Logs the human into Firebase. On a machine with no browser, add `--no-localhost` and open the printed URL |

**React and Next.js steps.**

| # | Command | What it does |
|---|---|---|
| 1 | `node --version` | Must print 20.x or newer |
| 2 | `npx -y firebase-tools@latest --version` | Checks the Firebase CLI |
| 3 | `npx -y firebase-tools@latest login` | Logs the human into Firebase |
| 4 | `npm i firebase` | Adds the client SDK to the app's `dependencies` |

**Functions steps.** Run inside `04-functions/`.

| # | Command | What it does |
|---|---|---|
| 1 | `npm install` | Installs the server SDK. **This is the only place `firebase-admin` is allowed** |
| 2 | `npm run build` | Compiles TypeScript into `lib/`. The deploy script builds first, and deploying without it uploads the previous build |

**The one thing every stack shares.** The Firebase CLI, through npx. And the login, which must be **the human's Google account**, not a service account.

### 4.3 The order of operations

**Eight steps. The order is load-bearing.** Config before emulator, emulator before code, code before deploy.

| # | Step | Who | What it proves |
|---|---|---|---|
| 1 | Install the stack's tools, section 4.2 | Harness runs, human watches | The machine can build the app |
| 2 | Get a console role, section 4.4 | Human | The human can see the project |
| 3 | `npx -y firebase-tools@latest login` | Human, in their own terminal | The CLI carries a human's identity |
| 4 | `firebase use safaaisaathi-63a87` | Harness | The CLI points at the right project |
| 5 | Register the app, if it is new. Section 4.5 | Harness, after asking | The app has an app id |
| 6 | Fetch the config files, section 4.6 | Harness | The app can initialise Firebase |
| 7 | Start the emulator, section 4.7 | Harness | The app can talk to a local backend |
| 8 | Prove one read and one callable, section 4.8 | Harness | The app can talk to Firebase for real |

**Never skip step 3 and run `firebase login` as part of an npx chain.** The browser handoff is a human action, and a harness cannot complete it.

### 4.4 Getting access

**Roles, in the Firebase console.** Project settings, Users and permissions, Add user.

| Role | Who gets it | What it can do |
|---|---|---|
| Viewer | Every teammate by default | Read the project settings, the rules, the data |
| Editor | The platform owner | Change the rules, change the indexes. **Not enough to deploy on its own** |
| Owner | The human who owns the billing. Nobody else | Everything, including deleting the project |

**Never give a teammate Owner.** It can delete the shared project.

**A deploy needs more roles than Editor.** The person who deploys needs all of these, and nothing more.

| Role | Why it is needed |
|---|---|
| Firebase Rules Admin | Deploy the rules and the indexes |
| Cloud Functions Developer | Deploy the Functions |
| Service Account User | Let the deploy attach the runtime service account |
| Cloud Datastore User | The Functions write to Firestore at runtime |
| Firebase Hosting Admin | Only if the admin panel is hosted on Firebase |

**The harness can check access without the console.**

| Command | What it shows |
|---|---|
| `npx -y firebase-tools@latest login:list` | Which human account the CLI is using |
| `npx -y firebase-tools@latest projects:list` | Every project that account can see. `safaaisaathi-63a87` must be in the list |

**If the project is not in the list, stop.** The account needs a role first. Do not create a new project, do not invite a different account, do not work around it.

### 4.5 Registering an app

**The driver app is already registered.** Its Android app id is `1:179594621556:android:8bdac1de2d29745aad1721`.

**The user app and the admin panel are not registered yet.** Their registration is a human decision, because it creates a console entry.

| Stack | Command | What it does |
|---|---|---|
| Flutter | `flutterfire configure --project=safaaisaathi-63a87` | Registers the app if it is new, then writes `lib/firebase_options.dart` and `android/app/google-services.json` |
| Fetch an Android config that already exists | `npx -y firebase-tools@latest apps:sdkconfig ANDROID 1:179594621556:android:8bdac1de2d29745aad1721 --project safaaisaathi-63a87` | Prints the config. Add `-o path` to write it to a file |
| Fetch a web config | `npx -y firebase-tools@latest apps:sdkconfig WEB APP_ID --project safaaisaathi-63a87` | The web config for the admin panel |
| See what is registered | `npx -y firebase-tools@latest apps:list --project safaaisaathi-63a87` | Every app id in the project, with its platform |

**The harness asks before it registers.** `flutterfire configure` can create console entries, and the office may want the app named a certain way. Ask, then run.

**After changing the Android application id or the iOS bundle id, run `flutterfire configure` again.** The config files carry the old id and the build fails in a confusing way.

### 4.6 Where the config files go

| File | Stack | Path | Secret? | Tracked in this project? |
|---|---|---|---|---|
| `firebase_options.dart` | Flutter | `lib/firebase_options.dart` | No | **No.** The driver app's `.gitignore` line 52 |
| `google-services.json` | Flutter, Android | `android/app/google-services.json` | No | **No.** The driver app's `.gitignore` line 53 |
| `GoogleService-Info.plist` | Flutter, iOS | `ios/Runner/GoogleService-Info.plist` | No | Check the app repo's `.gitignore` before adding |
| The web config | React, Next.js | `.env.local`, as `NEXT_PUBLIC_FIREBASE_*` | No | **No.** `.env.local` is gitignored by default in Next.js |
| `firebase.json` | All | Repo root | No | **Yes.** It holds the rules path, the emulator ports, the Functions source |
| `.firebaserc` | All | Repo root | No | **Yes.** It holds the project id |
| The rules and the indexes | All | `firestore.rules`, `firestore.indexes.json` | No | **Yes** in the platform repo. **Never** in an app repo |
| The build defines | Flutter | `.env`, read by `--dart-define-from-file` | The client config values are not secrets, but this file is private anyway | **No.** `.env` is gitignored. `.env.example` is tracked |

**Why the config is not a secret.** The `apiKey` identifies the project. It does not authorize anything. It ships inside every APK and inside every web bundle, so it was never hideable. The security is in `../03-rules/firestore.rules`, in the callable checks, and in App Check. Hiding the config would break every fresh clone and protect nothing.

**One inconsistency, and who settles it.** The driver app's `.gitignore` keeps the generated config files out of the repo, and PRD-2 section 0.10 says "no keys in the repo, `.env` and `google-services.json` are shared privately". `./firebase-access-and-keys.md` says to keep the web config in git. **Both are defensible, and they disagree.**

| Option | What it costs |
|---|---|
| Generate locally, keep it out of git. What the driver app does today | A fresh clone cannot build until someone runs `flutterfire configure`, which needs a Firebase login. It also matches PRD-2 0.10 |
| Commit the generated files | Every clone builds with zero setup. It diverges from PRD-2 0.10 and puts a generated file in every diff |

**Until it is decided, the guide follows what the repos actually do.** Generate locally. Do not commit. And flag the inconsistency to the platform owner rather than resolving it.

**The driver's own pattern, which is the model for any new Flutter app.** The real project values never sit in a tracked file. They sit in a gitignored `.env`, and the app reads them at compile time through `String.fromEnvironment`.

| File | Tracked? | What it holds |
|---|---|---|
| `.env.example` | **Yes** | The template. The four keys, with empty values |
| `.env` | **No.** The app's `.gitignore` line 54 | The real values. **The harness must never read it** |
| `scripts/run_device.sh` | **Yes** | One command. It builds `.env` from the generated `lib/firebase_options.dart` if the file is missing, then runs the app |

```
# the human fills .env from the flutterfire output
flutter run --dart-define-from-file=.env -d <deviceId>
# or, the wrapper
./scripts/run_device.sh <deviceId>
```

The emulator is a separate command, because a key defined in a defines file cannot also be passed as a flag.

```
flutter run --dart-define=DRIVERAPP_USE_EMULATOR=true \
  --dart-define=DRIVERAPP_EMULATOR_HOST=<dev-machine LAN IP> -d <deviceId>
```

### 4.7 The emulator

**The emulator is the default environment.** It runs Auth, Firestore, Functions and Storage on the laptop, with the real rules loaded. It needs no project credentials and no network.

**There are two `firebase.json` files, and this is the biggest practical trap.**

| Where you run it | Which `firebase.json` | What it serves |
|---|---|---|
| `driverapp/` | `driverapp/firebase.json` | The driver's rules, the driver's indexes, the driver's own `functions/` folder |
| `platform/03-rules/` | `platform/03-rules/firebase.json` | The platform's rules, the platform's indexes, the platform's `04-functions/` folder |

**The platform's emulator starts from `03-rules/`, because that is where its `firebase.json` lives.**

```
cd 03-rules
npx -y firebase-tools@latest emulators:start --only auth,firestore,functions,storage
```

**The ports.**

| Service | Port | Where the number comes from |
|---|---|---|
| Auth | 9099 | `../03-rules/firebase.json` |
| Firestore | 8080 | `../03-rules/firebase.json` |
| Functions | 5001 | The Firebase default |
| Storage | 9199 | `../03-rules/firebase.json` |
| Emulator UI | 4000 | Disabled in this project. `"ui": { "enabled": false }` |

**How the app points at it.** The driver app already does this in `lib/core/config/firebase_bootstrap.dart`.

```dart
FirebaseFirestore.instanceFor(app: app).useFirestoreEmulator(host, 8080);
FirebaseAuth.instanceFor(app: app).useAuthEmulator(host, 9099);
```

**Never point a device at `localhost`.** An Android emulator's `localhost` is the phone itself, not your laptop. The driver app solves this with a `--dart-define` flag.

| Situation | The host to use |
|---|---|
| The Android emulator on the same machine | `10.0.2.2`, the emulator's alias for the host |
| A physical phone on the same wifi | The laptop's LAN ip address |
| The driver app, any of the above | `--dart-define=DRIVERAPP_EMULATOR_HOST=10.0.2.2` |

**Two caveats the teammate must know on day one.**

| Caveat | What it means |
|---|---|
| The emulator does **not** enforce composite indexes | A green emulator run is not proof that a query has an index. Check the indexes file, and test on staging |
| The emulator does **not** deliver real push notifications | A push that arrives locally is a mock |

### 4.8 The first Firebase code, per stack

**Four things every app in this project does, in this order.** A teammate who has done these four has Firebase working.

| # | Step | What it looks like |
|---|---|---|
| 1 | Initialise the SDK | One call, before anything else touches Firebase |
| 2 | Sign in | Anonymous for the driver app and the user app, email for the admin panel |
| 3 | Exchange for a custom token | This project's twist. The claim is the authority, and only the server can mint it |
| 4 | Read one collection and call one callable | One read proves the rules allow it. One call proves the Functions are reachable |

**Step 1 and 2, Flutter.** The driver's pattern, from `lib/core/config/firebase_bootstrap.dart`.

```dart
await Firebase.initializeApp(
  name: defaultFirebaseAppName,
  options: firebaseOptions(backend),
);
await FirebaseAuth.instanceFor(app: app).signInAnonymously();
```

**Step 1 and 2, React and Next.js.**

```ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
await auth.signInAnonymously(); // the user app's pattern
```

**Step 3, the custom token exchange.** This is the part that is specific to this project, and the part a newcomer gets wrong.

```
1. Sign in anonymously. The client now has an identity, but no scope.
2. Call the session-minting callable with that identity.
3. The callable reads the document the client cannot edit.
4. The callable mints a custom token and returns it.
5. Sign in again with the custom token.
6. Now the claims are in the ID token, and the rules can read them.
```

| App | The callable | What it takes | What it returns |
|---|---|---|---|
| driverapp | `bindDeviceToVan` | `driverCode`, `installId` | `token`, `vanId`, `driverId`, `claimMode` |
| userapp | `bootstrapUserSession` | `deviceId`, `wardId` | `token`, `deviceId`, `routeId` |
| adminpanel | `mintStaffToken` | `staffId` | `token`, `role`, `staffId`, `wardIds`, `scopeRefreshedAt` |

**The exact contracts are in `../02-contracts/callables.json`.** Never guess a parameter name.

**Step 3, Flutter, calling the callable.**

```dart
final result = await FirebaseFunctions.instance
    .httpsCallable('bindDeviceToVan')
    .call({'driverCode': code, 'installId': installId});

final customToken = result.data['token'] as String;
await FirebaseAuth.instance.signInWithCustomToken(customToken);
```

**Step 3, React, calling the callable.**

```ts
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions(app);
const result = await httpsCallable(functions, 'mintStaffToken')({ staffId });
await auth.signInWithCustomToken(result.data.token);
```

**Step 4, one read and one call.** The read proves the rules allowed it. The call proves the Functions are wired.

| App | One read | One callable |
|---|---|---|
| driverapp | `vans/{vanId}` | `startShift` |
| userapp | `wards/{wardId}` | `bootstrapUserSession` |
| adminpanel | `complaints` scoped by the `wardIds` claim | `setComplaintStatus` |

**The server sends a reason code. The app owns the words.** A callable never returns English text. The vocabulary is in `../02-contracts/errors.json`, and each app maps the codes to its own arb file.

### 4.9 The secret protocol

**This is the section to follow exactly.** The rule is short.

> **The harness never handles a secret value. It handles a secret NAME.**

**Six steps.**

| # | Who | What |
|---|---|---|
| 1 | Harness | Works out that a secret is needed. Names it, and says where it will live |
| 2 | Harness | Asks the human one question, with the exact command to run. Template below |
| 3 | **Human** | Runs the command in their own terminal and types the value there |
| 4 | Harness | Verifies the secret **exists**, by name and metadata only |
| 5 | Harness | Writes only the **name** into the code |
| 6 | Harness | Reports the name and the target. Never the value |

**The four destinations, and the exact command for each.**

| Destination | The human runs | The harness verifies with | The harness may write |
|---|---|---|---|
| A deployed Functions secret | `npx -y firebase-tools@latest functions:secrets:set NAME` | `npx -y firebase-tools@latest functions:secrets:get NAME` | `defineSecret("NAME")` |
| The same, without the value in shell history | `printf '%s' "$VALUE" \| npx -y firebase-tools@latest functions:secrets:set NAME --data-file -` | Same as above | Same as above |
| A local-only value | The human creates `functions/.env`, or the app's `.env`, themselves | `test -f functions/.env`. **The harness never reads it** | Nothing. Never create it, never read it |
| A CI secret | The human adds it in the GitHub repo settings | `gh secret list`, which prints names only | Nothing |

**The commands the harness must and must not run.**

| Command | What it prints | Verdict |
|---|---|---|
| `firebase functions:secrets:get NAME` | The secret's metadata. Name, version, creation time | **Safe.** This is the one the harness uses |
| `firebase functions:secrets:access NAME` | **The secret's value** | **Never.** One run puts the value in the transcript, and the transcript is stored |
| `firebase functions:secrets:destroy NAME` | Nothing useful. It deletes the secret | Never, without the human |

**The exact question to ask the human.** Use this shape. One question, not a list.

```
I need one secret for this task: <NAME>.

What it is for: <one line>
Where it will live: <Functions secret | functions/.env locally | GitHub Actions secret>
You will enter it yourself. I will not see the value.

Please run this in your terminal:

  <the exact command>

Then tell me "done". I will verify it exists by name only.
```

**Why the harness must not read the value.**

| Reason | What happens if it is ignored |
|---|---|
| The value lands in the transcript, and transcripts are stored | The secret lives in the chat history forever, exactly like a key pasted into an issue |
| The harness may echo it in a debug line | A helpful-looking `print` leaks it |
| The harness may write it into a file it thinks is safe | An `.env` in the repo folder, a test fixture, a log file |
| The harness may put it in a command argument | It lands in the shell history and in the process list |

**What to do when the human pastes the value into the chat anyway.**

| # | What |
|---|---|
| 1 | Treat it as leaked. The same as a leak in a commit |
| 2 | Rotate it. `npx -y firebase-tools@latest functions:secrets:set NAME` with a new value |
| 3 | If it was a service account key, rotate the key in Google Cloud. Not just the secret |
| 4 | Record it as an S0, with `./emergency-changes.md` |
| 5 | Say plainly that the old value is dead |

**Never soften this.** A rotated secret that everyone still believes is live is worse than a leak that was handled.

### 4.10 Deploying

**A human deploys. The harness prepares and explains.**

| # | Step | Who | What |
|---|---|---|---|
| 1 | Confirm the build is fresh | Harness | `npm run build` in `04-functions`. **A deploy without a build uploads the previous build.** This is the stale artifact trap |
| 2 | Confirm the deploy order | Harness | The server goes first, the clients go second, the rules tighten last |
| 3 | Deploy the Functions | Human | `npx -y firebase-tools@latest deploy --only functions` |
| 4 | Confirm what landed | Harness | `npx -y firebase-tools@latest functions:list`. Names and metadata, no values |
| 5 | Deploy the rules | Human, **last** | `npx -y firebase-tools@latest deploy --only firestore:rules,firestore:indexes` |

**Why the rules go last.** The old rules are loose. They keep the old clients working. The moment the new rules land, every client that has not been updated is denied, and the failure looks like "the screen is empty" rather than "you are not authorised".

**A change that needs a rules deploy is `CHG-0003`.** It is S1 and P0. Its migration steps are in `../06-changes/manifest.json`.

### 4.11 The failures a newcomer will hit

| The symptom | What it really is | The fix |
|---|---|---|
| `FirebaseApp name [DEFAULT] already exists!` | Two Flutter engines in one process raced to initialise | The driver app adopts the winner. See `lib/core/config/firebase_bootstrap.dart` |
| `PERMISSION_DENIED` on a read that worked yesterday | The rules changed, or the client has no claim yet | Check `../03-rules/firestore.rules`, then check the claims in the ID token. A claim the token does not carry makes every rule deny |
| `The query requires an index` | A missing composite index | It is not a rules problem. Add it to `firestore.indexes.json`. **The emulator will not catch this** |
| `UNAVAILABLE` or a timeout on the emulator | The emulator is not running, or the host is wrong | Start it, then check the host. `localhost` does not work on an Android emulator |
| `PERMISSION_DENIED` on the emulator only | The emulator loads the real rules. The old ones are still loose, but not on this collection | That is the rule working. It is not a bug |
| `FirebaseException: no-app` | Something touched Firebase before `initializeApp` finished | Initialise, then wait. The driver app has a session gate for exactly this |
| The CLI says "not a Firebase project" | There is no `firebase.json` in the current directory | Start it from the folder that has one. Section 4.7 |
| A callable times out | The Functions emulator is not running, or the function has no build output | Start the Functions emulator. Run `npm run build` first |

## 5. Do NOT

| Do NOT | Why |
|---|---|
| Do not install the Admin SDK in a client app | It bypasses every rule. A leaked one is a full database takeover |
| Do not create a new Firebase project | The project exists. A second one means a second database and a second rules file |
| Do not deploy during onboarding | The order is load-bearing, and an onboarding session is not the place to find that out |
| Do not read the secret value, not even to check it | `functions:secrets:get` gives the metadata. That is enough |
| Do not edit a rule or an index in an app repo | The platform repo owns them. The app repo consumes them |
| Do not trust the emulator for index coverage | It does not enforce composite indexes. A green run proves nothing about them |
| Do not point a device at `localhost` | That is the device. Use `10.0.2.2` on an Android emulator, or the LAN ip on a phone |
| Do not copy a setup tutorial from the internet | The tutorials use the console's default rules and the default project layout. This project has neither |
| Do not give a teammate Owner | It can delete the shared project |
| Do not run the whole guide in one pass without reporting | Onboarding a person is a conversation. Do it in steps and check they are still with you |

## 6. Self-verification

**After an onboarding session, run these. Each one proves a different thing.**

The CLI is logged in as a human, and points at the right project.

```bash
npx -y firebase-tools@latest login:list
npx -y firebase-tools@latest projects:list | grep safaaisaathi-63a87
```

Expected: the human's account, and one line with `safaaisaathi-63a87`.

The tools the stack needs are on the PATH.

```bash
flutter doctor
flutterfire --version
npx -y firebase-tools@latest --version
```

Expected: no red in `flutter doctor`, and a version from each.

The emulator is up, and it loaded the rules.

```bash
curl -s http://localhost:8080 | head -5
```

Expected: the Firestore emulator's response. A connection refused means it is not running.

The app's own checks, for a Flutter app.

```bash
flutter analyze
flutter test
```

Expected: no issues, all tests pass.

**The project has not been polluted.**

```bash
git ls-files | grep -Ei "\.env$|serviceAccount|service-account|private_key"
```

Expected: no output.

**No secret value entered the transcript.** This one is a human check, and it is not optional.

| Check | How |
|---|---|
| The harness never printed a value | Read the transcript |
| The human was never asked to paste a value into the chat | Read the question that was asked |
| Every secret was verified with `get`, not `access` | Read the commands that were run |

**This guide's tables.**

```bash
python3 08-tools/check-tables.py 07-guides/firebase-getting-started.md
```

Expected: `MALFORMED=0`.

## 7. Report format

End every onboarding session with this block.

```
CONTRACT VERSION: 1.0.0
TEAMMATE: <the human's name and role>
STACK: <Flutter Android | Flutter Android+iOS | React web | Functions TypeScript>
TOOLS INSTALLED: <what was installed, and the versions>
FILES CHANGED: <paths, or none>
EMULATOR: <the ports that came up, or the failure>
VERIFIED: <the checks that passed>
SECRETS SET: <the names and their destinations, never the values>
BLOCKED ON: <what the human must do, or none>
OPEN QUESTION: <one line, or none>
```

**For a session where a secret was set, the line reads like this.**

```
SECRETS SET: FCM_SERVER_KEY, deployed Functions secret. Verified by name only.
```

**Never put a value in that line, and never in any line.**
