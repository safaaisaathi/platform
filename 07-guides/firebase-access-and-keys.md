---
id: firebase-access-and-keys
title: Firebase Access and Keys
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: harness
see_also:
  - ../AGENTS.md
  - ../03-rules/firestore.rules
  - ./emergency-changes.md
---

# Firebase Access and Keys

**What you share with a teammate, and what you never share. The web config is NOT a secret. The service account key IS.**

One Firebase project serves all three apps: `safaaisaathi-63a87`. It is in `../.firebaserc`.

## 1. Authority order

1. The contract (`02-contracts/`) wins over every PRD and over every app repo. Security comes from `../03-rules/` and App Check, never from hiding client identifiers.
2. `../AGENTS.md` constraint 9 is the law: no secret in this repo. A Firebase client API key is not a secret. A service account key is.
3. Least privilege decides roles. A teammate gets the lowest role that lets them work.
4. The emulator is the default environment for local work. Production access is for deploys, and deploys are human actions.
5. On a suspected leak, `./emergency-changes.md` takes over immediately.

## 2. Hard constraints

| # | Constraint |
|---|---|
| 1 | NEVER commit, paste, or attach a service account JSON. Not in this repo, not in an issue, not in chat, not in a screenshot |
| 2 | NEVER commit a CI token (`FIREBASE_TOKEN`), a refresh token, or a password |
| 3 | ALWAYS keep the web config in git. It is public by design. Removing it breaks every build and protects nothing |
| 4 | ALWAYS use the emulator for local development: `firebase emulators:start` |
| 5 | NEVER give a teammate Owner. Editor for deploy duty, Viewer otherwise |
| 6 | On any suspected leak: rotate first, then record an S0 via `./emergency-changes.md` |
| 7 | NEVER put a secret in Functions source. Use Functions secret params or env config, set by a human |
| 8 | ALWAYS keep service account files out of every repo: never inside `driverapp/`, `userapp/`, `adminpanel/` or here |

## 3. Read budget

| Your task | Read exactly these | Do not read |
|---|---|---|
| Onboard a teammate | This file, `../.firebaserc`, `../AGENTS.md` | `../09-reference/` |
| Check what is safe to share | This file, section 4 tables | Nothing else |
| React to a leak | This file section 4.3, `./emergency-changes.md` | Nothing else |
| Work locally without production access | This file, `../03-rules/firestore.rules` | The console |

## 4. Procedure

### 4.1 The share table

| Item | Secret? | Share how |
|---|---|---|
| Project id `safaaisaathi-63a87` | No | Freely. It is in `../.firebaserc` |
| Web config: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId` | No | In git, in the app repos |
| `google-services.json` / `GoogleService-Info.plist` | No | In git. They carry the same public identifiers |
| Driver app Android app id `1:179594621556:android:8bdac1de2d29745aad1721` | No | In git, in `driverapp` |
| `.firebaserc`, `firebase.json`, rules files | No | In git |
| Callable names, topic names, reason codes | No | In `../02-contracts/` |
| Service account JSON (Firebase Admin SDK private key) | **YES** | Never. A human stores it in the CI secret store or uses Application Default Credentials |
| `FIREBASE_TOKEN`, CI refresh tokens | **YES** | Never. CI secrets only |
| Functions secret params and env config values | **YES** | Never. Set by a human with the CLI, never in source |
| Console passwords and personal OAuth tokens | **YES** | Never |

### 4.2 Onboarding a teammate

| # | Do | Command or file |
|---|---|---|
| 1 | Add them to the app repo, not the console first | Git access in `driverapp`, `userapp` or `adminpanel` |
| 2 | Give console Viewer, or Editor only if they will deploy | Firebase console, project `safaaisaathi-63a87` |
| 3 | They clone the app repo and the platform repo | `git clone`, both repos |
| 4 | They take the config files from git | `google-services.json` etc., already committed |
| 5 | They work against the emulator | `firebase emulators:start --only firestore,auth,functions` |
| 6 | They never need a service account key | Emulators need none. CI holds its own |

The emulator needs no project credentials for local runs. A teammate who asks for a service account key to "run the app locally" is blocked by design: point them at the emulator.

### 4.3 If a key leaks

| # | Do | Who |
|---|---|---|
| 1 | Rotate the service account key in the Google Cloud console, IAM and admin, service accounts | Human, immediately |
| 2 | Remove the leaked material from the repo history if it was committed | Human |
| 3 | Check for misuse: Firestore usage, Auth users, Functions logs | Human |
| 4 | Record the S0 | Harness, via `./emergency-changes.md` |
| 5 | Close the incident when rotation is confirmed and no misuse is found | Platform owner + one other |

Rotation comes before the paperwork. A leaked Admin SDK key is full database access, bypassing every rule.

### 4.4 Why the web config is not a secret

The `apiKey` identifies the project, it does not authorize anything. It ships in every client bundle and appears in every network request, so it was never hideable. Access control lives in `../03-rules/firestore.rules`, `../03-rules/storage.rules`, the callable checks, and App Check. Hiding the config would be security theater, and it would break every fresh clone.

## 5. Do NOT

| Do NOT | Why |
|---|---|
| Do not scrub the web config from git | It is not a secret. Scrubbing breaks onboarding and protects nothing |
| Do not paste a service account JSON "just to debug" | One paste is a permanent leak. Chat logs and issue history do not expire |
| Do not give a teammate your account | Accounts are named. Audit trails die with shared logins |
| Do not store a key in a dotfile in the repo folder | `functions/.env` with real values gets committed eventually. Use the secret store |
| Do not trust the emulator as proof of index coverage | It does not enforce composite indexes |
| Do not email config as a zip "for convenience" | The repo is the distribution channel |

## 6. Self-verification

Verify no private key material is inside this repo:

```bash
grep -rn "private_key" . --include="*.json" --include="*.ts" --include="*.js" --include="*.md"
# expected: no output, exit code 1
```

Verify the project id is the one in the contract:

```bash
cat .firebaserc
# expected: {"projects":{"default":"safaaisaathi-63a87"}}
```

Verify no secret-shaped env file is tracked:

```bash
git ls-files | grep -Ei "\.env$|serviceAccount|service-account"
# expected: no output, exit code 1
```

Verify this guide's tables:

```bash
python3 - <<'PY'
import re
doc="07-guides/firebase-access-and-keys.md"
lines=open(doc,encoding="utf-8").read().split("\n")
def n(l): return len(re.findall(r"(?<!\\)\|",l))-1
i=0;bad=0;t=0
while i<len(lines):
    if lines[i].strip().startswith("|") and i+1<len(lines) and re.match(r"^\s*\|[\s:|-]+\|\s*$",lines[i+1]):
        m=n(lines[i]);j=i+2
        while j<len(lines) and lines[j].strip().startswith("|"):
            if n(lines[j])!=m: print("BAD",doc,j+1);bad+=1
            j+=1
        t+=1;i=j
    else: i+=1
print(f"{doc}: TABLES={t} MALFORMED={bad}")
PY
```

Expected: `07-guides/firebase-access-and-keys.md: TABLES=6 MALFORMED=0`. Any `BAD` line is a failure.

## 7. Report format

```
CONTRACT VERSION: <from VERSION, old -> new if changed>
FILES READ: <paths>
FILES CHANGED: <paths>
SEVERITY: <S0-S4>
CHANGE ID: <CHG-nnn, or none>
VALIDATION: <command> -> <pass/fail>
OPEN QUESTION: <one line, or none>
```

For an onboarding run the block is:

```
CONTRACT VERSION: 1.0.0
FILES READ: .firebaserc, AGENTS.md, 07-guides/firebase-access-and-keys.md
FILES CHANGED: none
SEVERITY: S4
CHANGE ID: none
VALIDATION: grep -rn private_key . -> pass (no hits)
OPEN QUESTION: none
```

For a leak run, `SEVERITY: S0`, the change id is the incident entry, and `OPEN QUESTION` carries the rotation confirmation status.
