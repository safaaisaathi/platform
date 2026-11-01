# CHG-0007: Set the arrival alert radius to 100 m from the ward boundary

**Severity**: S2 (New capability) | **Priority**: P2 | **Version**: 1.0.0 → 1.1.0
**Date**: 2026-11-01 | **Author**: platform-owner | **Decides**: none

## What changed

`ARRIVAL_ALERT_RADIUS_M` goes from 500 to 100. **And the measurement changes** from the ward's centre to its boundary.

| Before | After |
|---|---|
| `distance(van, ward.center) <= 500` | `distance(van, ward.center) <= ward.radiusM + 100` |
| The alert fires 500 m from the middle of the ward | The alert fires 100 m from the edge of the ward |

**The constant lives in `02-contracts/constants.json`.** It is not hardcoded in the Function.

## Why

**The office asked for 100 m.** PRD section 0.6 says 500. That is a one-line change in one file, and that is the entire point of having the constants file.

**The centre-versus-boundary change is the more interesting half.** A ward is an **area**, not a point. It has a centre and a `radiusM`. A citizen at the far edge of a 300 m ward is 300 m from the centre.

**With the old check**, a citizen at the edge of a 300 m ward gets the alert when the van is 500 m from the centre, which is **200 m from where the citizen actually is**. The number in the PRD says "500 m" and the citizen experiences "200 m" or "800 m" depending on where they are in their own ward.

**With the new check**, the van is always 100 m from the ward's edge. That is what "the van is 100 m away" means to a person standing somewhere in their ward.

**The server cannot know the citizen's exact location.** That would be a privacy decision, not a technical one. The ward's boundary is the closest available proxy, and it is a much better proxy than the centre.

## What breaks

| App | What breaks |
|---|---|
| userapp | Nothing structural. The alert arrives earlier than the old 500 m rule would have delivered it. The copy does not change, because the copy never mentioned a distance |
| driverapp | Nothing |
| adminpanel | Nothing |

**The behavioural change is real even though nothing breaks structurally.** A citizen who is used to the alert coming from further away will now get it sooner. **That is the point, and it is worth telling the office before the release, not after.**

## Who is affected

| App | Affected? | What they must do | Blocked release? |
|---|---|---|---|
| driverapp | NO | Nothing | No |
| userapp | YES | Nothing to write. The radius is a server-side constant. Just be aware the alert arrives sooner | No |
| adminpanel | NO | Nothing | No |

## Migration steps

| # | Step | Why here |
|---|---|---|
| 1 | Change `ARRIVAL_ALERT_RADIUS_M` in `02-contracts/constants.json` to 100 | One file |
| 2 | Change the distance check in `arrivalAlert` to use `radiusM + ARRIVAL_ALERT_RADIUS_M` | The geometry change is separate from the number change |
| 3 | Export the new constant to the Dart apps | The generated file updates |
| 4 | Deploy the Function | |

**Why the number and the geometry are separate steps.** Step 1 alone gives 100 m from the centre, which is *narrower* than the old behaviour but still measured from the wrong place. **For a small ward it would make the alert far too late.** A 50 m ward with a 100 m centre check would alert only after the van is 50 m past the ward. **The geometry change is what makes the number change correct.**

## The deprecation window

Not applicable. No field changes.

## Rollback

**Set the constant back to 500.** The geometry change is harmless on its own, because `radiusM + 500` is just a larger radius.

## The failure modes

| Failure | What the user sees | What the log says |
|---|---|---|
| Only the number changed, not the geometry | The alert comes very late for small wards, and early for large ones | Nothing. The behaviour is just wrong |
| The constant was hardcoded in the Function instead of read from the file | The change does not take effect, or the apps and the server disagree | Nothing. This is the whole reason the constants file exists |
| The next ward is skipped because the route order was walked out of order | The citizen in a later ward gets the alert before the citizen in the next one | Nothing. The alert was sent to the wrong topic |

**The third row is not this change's fault**, but it is the failure this change makes visible. A 100 m radius means the alerts are close together in time, so a route-order bug shows up sooner.

## Files changed

| File | What changed in it |
|---|---|
| `02-contracts/constants.json` | `ARRIVAL_ALERT_RADIUS_M` from 500 to 100 |
| `04-functions/src/index.ts` | The distance check uses `radiusM + ARRIVAL_ALERT_RADIUS_M` |
| `VERSION` | 1.0.0 → 1.1.0 |
| `06-changes/manifest.json` | The `CHG-0007` entry |

## See also

- [The constants](../02-contracts/constants.json)
- [The arrival notification flow](../07-guides/arrival-notification-flow.md)
- [The topics](../02-contracts/topics.json)
