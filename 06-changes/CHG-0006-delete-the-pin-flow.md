# CHG-0006: Delete verifyDriverPin, setDriverPin and vanSecrets

**Severity**: S1 (Breaking) | **Priority**: P1 | **Version**: 1.0.0 → 2.0.0
**Date**: 2026-11-01 | **Author**: platform-owner | **Decides**: ADR-0002

## What changed

| Item | Before | After |
|---|---|---|
| `verifyDriverPin` | A callable the app never calls | **Deleted** |
| `setDriverPin` | A callable with an unauthenticated write path behind `DEMO_SEED_BYPASS` | **Deleted** |
| `vanSecrets` | A collection the rules deny by default | **Deleted** |
| `cloud_functions` | A dependency in `pubspec.yaml` that nothing imports | **Deleted** |
| PRD `:61`, `:126`, `:161`, `:217`, `:224`, `:242`, `:267` | Describe the PIN flow as the live auth path | **Struck** |

## Why

**The app stopped calling these a long time ago.** A grep for `verifyDriverPin` across `lib/` returns zero hits. The D1 PIN screen, the van picker and the `PinPad` widget are all gone from the code.

**But the functions are still deployed.** And `setDriverPin` has an unauthenticated write path behind `DEMO_SEED_BYPASS`. **That is the kind of thing that gets found by a pentest, and the fix is a five-minute deletion.**

**The PRD is the bigger problem.** Section 0.16 line `:179` says the app stopped calling `verifyDriverPin` and that the driver-app side of it is superseded. But lines `:61`, `:126`, `:161`, `:217`, `:224`, `:242` and `:267` still describe it as the live auth path, and `:267` still lists *"Backend Owner deploys `verifyDriverPin` and seeds `vanSecrets`"* as a build dependency.

**A builder who reads the older sections builds the PIN flow, and then a builder who reads section 0.16 deletes it.** That is days of work, and it is the one question the whole build was blocked on.

**Section 0.16 wins.** It is the newer section, and it says explicitly that it supersedes the older half.

## What breaks

| App | What breaks |
|---|---|
| driverapp | Nothing in the running app. The code was already gone. The `cloud_functions` dependency removal is the only visible change |
| userapp | Nothing |
| adminpanel | Nothing. It never used the PIN flow |

**The one thing to check first.** Confirm the office does not call `verifyDriverPin` from somewhere outside these three repos. A console script or a manual test would be the likely place.

## Who is affected

| App | Affected? | What they must do | Blocked release? |
|---|---|---|---|
| driverapp | YES | Remove the `cloud_functions` dependency. Verify the grep is clean | Yes, at the deadline |
| userapp | NO | Nothing | No |
| adminpanel | NO | Nothing | No |

## Migration steps

| # | Step | Why here |
|---|---|---|
| 1 | **Confirm the office does not call `verifyDriverPin`** | This is the only external dependency |
| 2 | Delete `verifyDriverPin` from `functions/src/index.ts` | |
| 3 | Delete `setDriverPin`, including the `DEMO_SEED_BYPASS` block | The unauthenticated write path is the reason this is S1 and not S3 |
| 4 | Delete the `cloud_functions` dependency from `pubspec.yaml` | Nothing in `lib/` imports it |
| 5 | Strike PRD `:61`, `:126`, `:161`, `:217`, `:224`, `:242`, `:267` | The PRD is what sends the next builder the wrong way |
| 6 | Rewrite the PRD's build order in section 5 | It currently lists the deleted Function as a dependency |
| 7 | Delete the `vanSecrets` collection from the console | The rules already deny it. This is cleanup, not a fix |
| 8 | Run the verification grep | The proof |

**The verification step.** After the deletions:

```bash
grep -rn "verifyDriverPin\|setDriverPin\|vanSecrets\|DEMO_SEED_BYPASS" lib/ functions/src/ scripts/
```

**Zero hits.** That is the proof the deletion is complete. **It is also a one-line check any future builder can re-run.**

## The deprecation window

Not applicable. These are functions and a collection, not a field. **A function is removed in one deploy, because nothing legitimate depends on it.**

**The check in step 1 is the whole deprecation plan.**

## Rollback

**Redeploy the old functions.** The app never called them, so nothing depends on the rollback working.

**Do not roll back the PRD strike.** A rolled-back PRD will send the next builder to rebuild the PIN flow.

## The failure modes

| Failure | What the user sees | What the log says |
|---|---|---|
| The office DID call `verifyDriverPin` | A console script fails with `NOT_FOUND` | The error names the missing function |
| `setDriverPin` was deployed with the bypass active | **An unauthenticated caller can write a PIN.** This is the finding | The rules and the function logs show the unauthenticated write |
| The `cloud_functions` dependency was left in `pubspec.yaml` | Nothing visible. It is just a dead dependency | Nothing. That is why the grep exists |
| The PRD was not struck | A new builder rebuilds the PIN flow | Nothing. This is the failure that costs days |

**The third row is why the grep is a required step.** A dead dependency is invisible. It survives every test.

## Files changed

| File | What changed in it |
|---|---|
| `04-functions/src/index.ts` | `verifyDriverPin` and `setDriverPin` deleted |
| `functions/package.json` | The `cloud_functions` dependency removed, and the `deploy` script fixed to build first |
| `01-prds/PRD-2-driver-app.md` | Lines `:61`, `:126`, `:161`, `:217`, `:224`, `:242`, `:267` struck |
| `VERSION` | 1.0.0 → 2.0.0 |
| `06-changes/manifest.json` | The `CHG-0006` entry |

## See also

- [ADR-0002](../05-decisions/0002-rules-scope-by-claims-not-by-signed-in.md)
- [The functions](../04-functions/README.md)
- [Making a contract change](../07-guides/making-a-contract-change.md)
