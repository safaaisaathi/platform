# CHG-0014: The admin panel must talk to Firebase, not to localStorage

**Severity**: S2 (New capability) | **Priority**: P2 | **Version**: 1.0.0 → 1.1.0
**Date**: 2026-11-02 | **Author**: platform-owner | **Decides**: none

## What changed

The admin panel is React 18 with Vite. It is not Next.js, even though its README says PRD 3. Its data layer is `src/services/dataService.ts`, which reads and writes localStorage under the key prefix `safai_v3_`, and its seed data is `src/services/seedData.ts`. There are 25 screens under `src/screens/` and two lineages of several of them, for example `A1_Login.tsx` and `A01_Login.tsx`, `A3_LiveMap.tsx` and `A15_LiveMap.tsx`, `A4_Complaints.tsx` and `A17_Complaints.tsx`. `src/services/firebaseConfig.ts` initialises `db`, `auth` and `storage`, and then nothing uses them. The panel has no PRD at all, and the platform's pointer at `01-prds/PRD-3-admin-panel.md` names `docs/PRD-3-admin-panel.md`, which does not exist.

## Why

The panel looks finished and shows data, but the data is in one browser's localStorage. The office and the field do not share a database. A complaint resolved in the panel is still open in the driver app and the user app, because the two never meet. The seed data makes the panel look full while the real Firestore is empty. This is the change that connects the panel to the same project the other two apps use, per CHG-0008.

## What breaks

| App | What breaks |
|---|---|
| adminpanel | Nothing breaks today, because the panel is a local demo. A panel that keeps localStorage keeps showing data no other app can see. The symptom is a resolution in the panel that the driver app and the user app never see |
| userapp | Nothing. The user app has its own data layer and does not read the panel's localStorage |
| driverapp | Nothing. The change is inside the panel's own data layer |

**The confusing symptom is a panel that looks correct.** The seed data is plausible, so a demo reads as a working integration until someone checks the driver app.

## Who is affected

| App | Affected? | What they must do | Blocked release? |
|---|---|---|---|
| driverapp | NO | The change is inside the admin panel's own data layer | No |
| userapp | NO | It has its own data layer and never reads `safai_v3_` | No |
| adminpanel | YES | Replace `dataService.ts` with a Firestore repository, sign in through `mintStaffToken`, and write the missing PRD | No, this is scheduled; the deadline is null |

## Migration steps

1. Replace the localStorage data layer in src/services/dataService.ts with a Firestore repository
2. Sign in and call mintStaffToken. Sign in with the custom token
3. Scope every query by the wardIds claim. An inspector sees their wards, the DDO sees the district
4. Move src/services/seedData.ts out of the runtime path into a seed script
5. Delete the duplicate screens. There are two lineages, for example A3_LiveMap and A15_LiveMap
6. Write the PRD the platform points at, docs/PRD-3-admin-panel.md. It does not exist

**The order that works**: sign in through `mintStaffToken` and build the Firestore repository first, then delete the seed path and the duplicate screens. The panel must be able to read real data before the local one is removed.

## Rollback

**Restore `dataService.ts` and `seedData.ts` from git.** The panel goes back to localStorage and the seed data.

**What breaks if you do**: the panel stops showing real data, and a resolution in it is invisible to the other two apps again.

## Files changed

| File | What changed in it |
|---|---|
| `01-prds/PRD-3-admin-panel.md` | The pointer records the panel as a Firebase client, not a localStorage demo |
| `VERSION` | 1.0.0 → 1.1.0 |
| `06-changes/manifest.json` | The `CHG-0014` entry |

**The panel changes are in the adminpanel repo**, not here: `src/services/dataService.ts`, `src/services/seedData.ts`, and `src/screens/`.

## See also

- [The admin panel PRD pointer](../01-prds/PRD-3-admin-panel.md)
- [CHG-0008, the one Firebase project](CHG-0008-one-firebase-project.md)
- [CHG-0004, the admin writes that go through callables](CHG-0004-admin-writes-go-through-callables.md)
- [The impact matrix](impact-matrix.md)
