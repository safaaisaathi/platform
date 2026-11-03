# CHG-0009: Move the backend source into the platform repo and delete the copies

**Severity**: S1 (Breaking) | **Priority**: **P1** | **Version**: 1.0.0 → 2.0.0
**Date**: 2026-11-02 | **Author**: platform-owner | **Decides**: ADR-0007

## What changed

The real backend lived in `userapp/backend/functions/src/index.ts`, 612 lines and 13 exported functions, plus `whatsappService.ts` at 253 lines. It now lives in the platform repo at `04-functions/`, which holds 15 callables and 7 server functions. The old copies are still in the app repos and must go: `userapp/backend/functions`, the third copy of the rules at `userapp/backend/firestore.rules`, the 335 KB committed build artifact `userapp/safai-saathi-web-app.zip` (it contains a copy of itself), and the committed GitHub Pages build output in `adminpanel/docs/`. The platform's `04-functions/package.json` deploy script builds first, because `main` points at `lib/index.js`, which is the compiled output.

## Why

Three copies of the backend is three sources of truth. They have already drifted: the platform has the new callables, the user app has the old ones, and the driver app has a `functions/` copy whose deploy script does not build first. Deploying from `04-functions` without building uploads the PREVIOUS build, because Firebase reads `main`, not the TypeScript source. A fix deployed from the platform can be overwritten the next time an app repo deploys its stale copy. Two of the copies are dead PIN code too: `verifyDriverPin` and `setDriverPin` are deleted by CHG-0006, and `setDriverPin` carried a `DEMO_SEED_BYPASS` flag that allowed an unauthenticated write.

## What breaks

| App | What breaks |
|---|---|
| driverapp | Its `functions/` copy still deploys a second, older backend under the same function names. The last deploy wins, so a platform fix disappears |
| userapp | Its `backend/functions` and `backend/firestore.rules` are stale copies. A deploy from them reintroduces the old callables and a drifted rule set |
| adminpanel | Its committed `docs/` build is a source of confusion, not a runtime break. Someone reads a stale build as the live panel |

**The symptom is a fix that "does not take effect".** No error. The deploy succeeds. It just deployed the wrong source.

## Who is affected

| App | Affected? | What they must do | Blocked release? |
|---|---|---|---|
| driverapp | YES | Delete any local `functions/` copy and `firestore.rules`. Deploy nothing from the app repo. Verify the grep is clean | Yes, by 2026-11-15 |
| userapp | YES | Delete `backend/functions`, `backend/firestore.rules` and `safai-saathi-web-app.zip` | Yes, by 2026-11-15 |
| adminpanel | YES | Delete the committed Pages build in `docs/`. Do not commit build output | Yes, by 2026-11-15 |

## Migration steps

1. The backend now lives at platform/04-functions. It has 15 callables and 7 server functions
2. userapp: delete backend/functions and backend/firestore.rules. They are copies that have already drifted
3. userapp: delete the committed build artifact safai-saathi-web-app.zip. It contains a copy of itself
4. adminpanel: delete the committed Pages build in docs/. The build output does not belong in git
5. Deploy the functions from the platform repo only
6. Verify: grep -rn 'onCall\|onWrite\|onSchedule' in each app repo. Zero hits outside 04-functions

**The order that works**: copy the source into `04-functions`, confirm it deploys, then delete the copies. Every function name has one source before the old one goes.

**The order that breaks**: delete the copies before the platform source is confirmed. Between those moments the only deployed backend is whatever was last uploaded, and a routine fix has no source to rebuild from.

## The deprecation window

| Field | Meaning | Value |
|---|---|---|
| `oldFieldReadableUntil` | The last date the old field can be read | null |
| `oldFieldWritableUntil` | The last date the old field can be written. `null` means read-only | null |

**Both values are null because no field is deprecated.** This change moves files and deletes copies, so the only window is the time between the platform deploy and the old copy deletion. That window is measured in the deploy, not in dates.

## Rollback

**Restore the copy from git history and redeploy from the app repo.** The functions are the same source, so the runtime behaviour returns.

**What breaks if you do**: the drift returns. Two app repos and the platform can hold different versions of the same function, and the next deploy silently picks one.

## The failure modes

| What you see | Why |
|---|---|
| A fix deployed from the platform is reverted after an app repo deploys | A stale `functions/` copy in an app repo deployed over it |
| `npm run deploy` uploads the previous build | `main` points at `lib/index.js` and the deploy ran without `npm run build` |
| A third rules file disagrees with the platform | `userapp/backend/firestore.rules` or `driverapp/firestore.rules` was left in place |
| The user app serves an old bundle someone found | `safai-saathi-web-app.zip` in git is stale and was unzipped |

## Files changed

| File | What changed in it |
|---|---|
| `04-functions/src/index.ts` | The backend's new home in the platform |
| `04-functions/package.json` | The deploy script builds first, because `main` is the compiled output |
| `03-rules/firebase.json` | `functions.source` points at `../04-functions` |
| `03-rules/firestore.rules` | The one rules file, deployed from here |
| `VERSION` | 1.0.0 → 2.0.0 |
| `06-changes/manifest.json` | The `CHG-0009` entry |

**The deletions are in the app repos**, not here: `userapp/backend/`, `userapp/safai-saathi-web-app.zip`, `adminpanel/docs/`.

## See also

- [ADR-0007, one shared contract repo](../05-decisions/0007-one-shared-contract-repo.md)
- [The backend split guide](../07-guides/backend-split.md)
- [The functions folder](../04-functions/README.md)
- [CHG-0006, which deletes the PIN functions from the copy](CHG-0006-delete-the-pin-flow.md)
