# CHG-0008: Put all three apps on one Firebase project

**Severity**: S1 (Breaking) | **Priority**: **P0** | **Version**: 1.0.0 → 2.0.0
**Date**: 2026-11-02 | **Author**: platform-owner | **Decides**: ADR-0007

## What changed

One project, `safaaisaathi-63a87`, and it is already in the platform repo's `.firebaserc`. The driver app is already on it. The user app is not: `apps/citizen_app/src/services/firebaseService.ts` carries the fallback `projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'safai-saathi-panchmahal'` and the fallback `authDomain: 'safai-saathi-panchmahal.firebaseapp.com'`. The admin panel is not on it either, and it has no project id in code at all: `src/services/firebaseConfig.ts` reads six `VITE_FIREBASE_*` variables, falls back to empty strings, and the operator has to paste the config into the browser at runtime, where it is saved in localStorage under `safai_firebase_credentials`. The change deletes the user app's fallback and fixes the panel's target, so all three apps read and write one database.

## Why

Three apps, one Firestore, one rules file, one Functions deployment. That is the whole design, stated in ADR-0007. Two of the three apps can reach a different project today. The user app's fallback silently targets `safai-saathi-panchmahal` whenever `VITE_FIREBASE_PROJECT_ID` is unset, which is every build that does not set it. The admin panel has no fixed target at all, so the operator's paste decides which project the office panel reads and writes.

Both the user app and the admin panel are public GitHub repositories. A Firebase web API key is not a secret on its own, but the project id and the rules are what decide who can read what, and today neither is fixed. A build that talks to the wrong project writes real complaints into a database nobody administers, and nothing reports it.

## What breaks

| App | What breaks |
|---|---|
| userapp | A build whose `VITE_FIREBASE_PROJECT_ID` is unset writes to `safai-saathi-panchmahal`. The complaint lands in a project the office never reads, so the office panel does not show it. No error, because the write succeeded, just somewhere else |
| adminpanel | A browser that has never had the config pasted has an empty `safai_firebase_credentials` and an empty data layer. It shows the seed state, not the district's real data |
| driverapp | Nothing. It is already on `safaaisaathi-63a87` |

**The dangerous symptom is silence.** A wrong-project write is a successful write. The citizen sees a ticket id, and the office sees nothing.

## Who is affected

| App | Affected? | What they must do | Blocked release? |
|---|---|---|---|
| driverapp | NO | Already on `safaaisaathi-63a87`. Verify it, then nothing | No |
| userapp | YES | Delete the `safai-saathi-panchmahal` fallback in `apps/citizen_app/src/services/firebaseService.ts`. Read the project id from the environment only | Yes, by 2026-11-09 |
| adminpanel | YES | Point `src/services/firebaseConfig.ts` at `safaaisaathi-63a87`. Stop asking the operator to paste the config at runtime | Yes, by 2026-11-09 |

## Migration steps

1. Create the app config for each app from the ONE project safaaisaathi-63a87. Never commit a service account key
2. userapp: delete the hardcoded fallback project id safai-saathi-panchmahal from apps/citizen_app/src/services/firebaseService.ts. Read the project id from the environment only
3. adminpanel: point the runtime config at safaaisaathi-63a87. The panel currently asks the operator to paste the config into the browser
4. driverapp: verify it is on safaaisaathi-63a87. It already is
5. Deploy the rules LAST

**The order that works**: fix the two clients first, then deploy the rules. Between the client fix and the rules deploy, both projects answer, and neither client is blocked.

**The order that breaks**: deploy the rules first. Between that moment and step 2, the user app still points at `safai-saathi-panchmahal`, and every read and write against `safaaisaathi-63a87` is denied. The citizen sees an empty complaint list and a failed submit, with no error dialog.

## The deprecation window

| Field | Meaning | Value |
|---|---|---|
| `oldFieldReadableUntil` | The last date the old field can be read | null |
| `oldFieldWritableUntil` | The last date the old field can be written. `null` means read-only | 2026-11-09 |

**`oldFieldReadableUntil` is null because this is not a read window.** There is no old field to read out. **`oldFieldWritableUntil` is 2026-11-09**: after that date no build may target `safai-saathi-panchmahal`, and the rules on that project should deny the clients.

## Rollback

**Restore the fallback line in `firebaseService.ts` and redeploy the user app.** On the panel, keep pasting the config at runtime.

**What breaks if you do**: the user app writes to `safai-saathi-panchmahal` again, and the office silently loses those complaints. The rollback restores the exact bug this change removes.

## The failure modes

| What you see | Why |
|---|---|
| A complaint filed on a build whose env var is unset never reaches the office | The write landed in `safai-saathi-panchmahal`, not in `safaaisaathi-63a87` |
| The office panel shows seed data on a fresh browser | `safai_firebase_credentials` is empty in localStorage and the config was never pasted |
| Every read and write is denied right after the cutover | The rules were deployed before the two clients moved to the new project |
| A key file appears in a public repo's history | A service account key was committed. A web API key is not a secret; a service account key is |

## Files changed

| File | What changed in it |
|---|---|
| `.firebaserc` | The one project, `safaaisaathi-63a87` |
| `03-rules/firestore.rules` | Deployed last, after both clients move |
| `VERSION` | 1.0.0 → 2.0.0 |
| `06-changes/manifest.json` | The `CHG-0008` entry |

**The two client files are in the app repos**, not here: `apps/citizen_app/src/services/firebaseService.ts` (userapp) and `src/services/firebaseConfig.ts` (adminpanel).

## See also

- [ADR-0007, one shared contract repo](../05-decisions/0007-one-shared-contract-repo.md)
- [The Firebase access and keys guide](../07-guides/firebase-access-and-keys.md)
- [CHG-0003, the rules rewrite this deploy order shares](CHG-0003-scope-the-rules-by-custom-claims.md)
- [The impact matrix](impact-matrix.md)
