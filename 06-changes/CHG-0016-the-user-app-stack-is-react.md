# CHG-0016: The user app's stack is React, not Flutter

**Severity**: S2 (New capability) | **Priority**: P2 | **Version**: 1.0.0 → 1.1.0
**Date**: 2026-11-02 | **Author**: platform-owner | **Decides**: none

## What changed

PRD-1 section 6 says "Flutter stable", and the platform's contract was written for Flutter, but the code is React 18 with Vite, a PWA, Leaflet for the map and Capacitor for Android, and the package is in `apps/citizen_app/`. The contract does not care which language an app is written in, so no schema changes. The decision belongs to the office. The same PRD also calls the app a "monorepo" with `/apps/user_app /apps/driver_app /apps/admin_panel /backend/functions`, and that split is what left three copies of the backend behind, which CHG-0009 removes.

## Why

A builder who trusts PRD-1 writes Flutter. The repo is React. That is days of work against the wrong stack, and the contract was written for Flutter too, so the mismatch reaches the tooling. The decision is the office's, and this entry records that the decision is open and that the contract does not depend on it.

## What breaks

| App | What breaks |
|---|---|
| userapp | Nothing at runtime. What breaks is the next builder's reading: PRD-1 section 6 and the code disagree, and a builder who trusts the PRD writes Flutter in a React repo |
| driverapp | Nothing |
| adminpanel | Nothing |

**The cost is the reading, not the runtime.** No app breaks. A wrong PRD costs the days it takes a builder to notice.

## Who is affected

| App | Affected? | What they must do | Blocked release? |
|---|---|---|---|
| driverapp | NO | Its stack is not in question | No |
| userapp | YES | The office decides React or Flutter. Then the PRD and the platform's pointer are corrected to match | No, the deadline is null |
| adminpanel | NO | The change is about the user app's stack | No |

## Migration steps

1. The office decides one thing: keep the React PWA, or rewrite it in Flutter
2. If React stays, PRD-1 section 0 is corrected to describe the React stack and the platform's PRD pointer records the decision
3. If Flutter wins, the React code is the reference for the behaviour and the schema, not the implementation
4. No schema changes. The contract does not care which language an app is written in

**The order that works**: the office decides first, then the PRD and the pointer are corrected to match the code. Until then, the React code is the reference for behaviour.

## Rollback

**Revert the PRD correction.** The PRD and the code disagree again.

**What breaks if you do**: a builder reads "Flutter stable" and writes Flutter against a React repository.

## Files changed

| File | What changed in it |
|---|---|
| `01-prds/PRD-1-user-app.md` | The stack description and the pointer record the office's decision |
| `VERSION` | 1.0.0 → 1.1.0 |
| `06-changes/manifest.json` | The `CHG-0016` entry |

## See also

- [The user app PRD pointer](../01-prds/PRD-1-user-app.md)
- [CHG-0015, the PRD pointer fix](CHG-0015-fix-the-prd-pointers.md)
- [CHG-0009, which removes the backend copies the monorepo left behind](CHG-0009-the-backend-lives-in-the-platform-repo.md)
