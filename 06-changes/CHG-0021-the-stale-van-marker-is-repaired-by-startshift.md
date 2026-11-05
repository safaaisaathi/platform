# CHG-0021: startShift clears a stale van marker instead of failing

**Severity**: S2 (New capability) | **Priority**: P2 | **Version**: 2.2.0 → 2.3.0
**Date**: 2026-11-05 | **Author**: platform-owner | **Decides**: issue #10

## What changed

| Item | Before | After |
|---|---|---|
| `vans.currentTripId` points at a missing trip | `startShift` failed with `staleMarker` | The marker is cleared inside the transaction, then the shift starts |
| `vans.currentTripId` points at a trip that is no longer `on_shift` | `startShift` failed with `staleMarker` | The same: clear, then start |
| `vans.currentTripId` points at a live trip of another van | `staleMarker` | Unchanged. Still `staleMarker` |
| Document shape | No change | No change |

**No field, enum or rule changes.** This is a behavior fix inside an existing callable.

## Why

**B-19: a shift that died blocked the next driver.** The app is killed, the phone dies, or `endShift` never runs. `vans.currentTripId` keeps pointing at a trip that is closed or gone, and `vans.status` stays `on_shift`. The next driver calls `startShift` and gets `staleMarker`, which is not retryable. The only fix was a manual write, and the office had to know to make it.

**The server can prove the marker is stale.** It reads the referenced trip inside the transaction. A missing document, or a status that is not `on_shift`, is proof that no live shift owns the van. Clearing the marker then is not a guess.

**The client cannot do this.** `vans` is server-owned in the strict rules, and the phone cannot prove the trip is closed. That is why the repair belongs in the callable.

**Why not a scheduled sweep.** A sweep would help a van that nobody is starting, but it adds a second write path and a new query. The reported failure happens exactly when a driver calls `startShift`, so repairing it there fixes the user journey with one transaction. A sweep stays as future work for dormant vans.

## What breaks

| App | What breaks |
|---|---|
| driverapp | Nothing. A path that used to fail now succeeds |
| adminpanel | Nothing. The van ends up `idle` or `on_shift` with a valid marker |
| userapp | Nothing |

## Who is affected

| App | Affected? | What they must do | Blocked release? |
|---|---|---|---|
| driverapp | YES | No code change. Keep the `staleMarker` copy for the live-trip-of-another-van case | No |
| adminpanel | NO | Nothing | No |
| userapp | NO | Nothing | No |

## Migration steps

| # | Step | Why here |
|---|---|---|
| 1 | Deploy the functions | The repair is in `startShift` |
| 2 | driverapp changes nothing | The app already treats success as success |
| 3 | Keep the `staleMarker` error copy | It still fires for a live trip of another van, which is a real conflict |

## The deprecation window

Not applicable. `staleMarker` stays in `errors.json`; it is narrower, not removed.

## Rollback

**Redeploy the previous `startShift`.** The marker repair is the only behavior that changes.

## The failure modes

| Failure | What the user sees | What the log says |
|---|---|---|
| The marker points at a closed trip | The shift starts | Nothing |
| The marker points at a missing trip | The shift starts | Nothing |
| The marker points at a live trip of another van | The stale conflict copy | Nothing, or the callable's error |
| Two drivers start at once | One wins the transaction, the other retries | Nothing |

## Files changed

| File | What changed in it |
|---|---|
| `04-functions/src/callables/shift.ts` | The stale branch clears the marker and falls through to create |
| `02-contracts/callables.json` | The `startShift` transaction description |
| `06-changes/manifest.json` | The `CHG-0021` entry |
| `09-reference/issue-register.md` | B-19 now points at this entry |

## See also

- [startShift](../04-functions/src/callables/shift.ts)
- [The van schema](../02-contracts/collections/van.schema.json)
- [CHG-0017](./CHG-0017-the-mock-location-latch-is-a-callable.md), the other change to an existing callable
