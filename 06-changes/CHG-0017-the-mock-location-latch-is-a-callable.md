# CHG-0017: The mock-location latch is set by a callable, not a client trip write

**Severity**: S2 (New capability) | **Priority**: P2 | **Version**: 2.0.0 → 2.1.0
**Date**: 2026-11-05 | **Author**: platform-owner | **Decides**: none

## What changed

| Item | Before | After |
|---|---|---|
| `trips.mockLocationDetected` | The schema and PRD-2 say the driver app writes it, but the strict rules deny every client trip write, so the flag never leaves the phone | `flagMockLocation({ tripId })` sets it on the server |
| `trip.schema.json` `x-writes` | Lists `driverapp`, which the strict rules contradict | Lists the callables and functions that actually write the trip |

**No new field, no new collection, no new enum.** The field already exists and is unchanged. This change adds the write path the schema and the PRD already assumed.

## Why

**F-D9 detects a mocked GPS fix and leaves a durable record for the office.** Android reports whether a fix is mocked; the app shows a local banner and wants to set `trips.mockLocationDetected = true` so the office can review a faked trail later.

**The contradiction was live.** `02-contracts/collections/trip.schema.json` listed `driverapp` in `x-writes`, PRD-2 section 2 lists `trips.mockLocationDetected` as a driver-writable field, and `03-rules/firestore.strict.rules` on `match /trips/{tripId}` says `allow create, update, delete: if false`. The trip is server-owned because a direct client write would let two phones create two trips for one shift. So the flag never landed.

The driver app harness filed this as the contract request in issue #1.

**Why a callable and not a rule.** Mock detection is a device-side fact: only the phone's OS knows a fix is mocked, so the server cannot detect it on its own. But the client cannot write the trip directly either. A callable carries the client's decision across the trust boundary: the server checks that the trip is the caller's and open, writes the latch, and enforces the one-way rule. A callable also gives the write a server clock and keeps `trips` fully server-owned.

**Why a client-supplied flag is acceptable here.** CHG-0013 removed a client-supplied `workerId` because a forged value helped the caller. This input is the opposite: a forged flag only brands the caller's own trip as GPS-faked, so lying is against the caller's interest. The `driverId` still comes from the token, never from the input.

**The residual gap.** The flag is self-reported, so a driver who hides the mock is not caught. It is a review hint, not proof. A scheduled trail-anomaly sweep (impossible speed, teleport) is the planned backstop and is not part of this change.

## What breaks

| App | What breaks |
|---|---|
| driverapp | Nothing if it never wrote the field. A build that writes `trips.mockLocationDetected` directly must switch to the callable |
| userapp | Nothing. It does not read the field |
| adminpanel | Nothing. The read path is unchanged |

## Who is affected

| App | Affected? | What they must do | Blocked release? |
|---|---|---|---|
| driverapp | YES | Call `flagMockLocation` instead of the direct write | No. The direct write was already denied by the strict rules |
| userapp | NO | Nothing | No |
| adminpanel | NO | Nothing | No |

## Migration steps

| # | Step | Why here |
|---|---|---|
| 1 | Call `flagMockLocation({ tripId })` from the tracking engine where the direct write is today | The callable carries the trip ownership check |
| 2 | Latch locally after the call succeeds, as today | The banner must not wait for the network |
| 3 | Retry the call on reconnect if it failed offline | The callable is idempotent, so a retry writes nothing the second time |
| 4 | Never send `detected: false` and never try to clear the latch | The latch is one-way; the callable only ever sets `true` |

**Offline behaviour.** The banner is local and always works. A callable cannot run offline, so the app retries when the network returns. A retry after a dropped response is safe because the callable reads the current value first.

## The deprecation window

Not applicable. This is an addition, not a removal. The field is not going away.

## Rollback

**Stop calling the callable.** The app collects the mock signal locally again, exactly as it does today. Nothing else changes.

## The failure modes

| Failure | What the user sees | What the log says |
|---|---|---|
| The app keeps writing `trips.mockLocationDetected` directly | Nothing. The write is silently denied | A permission-denied on the trip write, once the strict rules are live |
| The app calls the callable on someone else's trip | An authorisation failure | The callable's `notAuthorised` |
| The app calls the callable on a closed trip | A state failure | The callable's `invalidState` |
| The driver hides the mock | Nothing. The flag is not set | Nothing. This is the residual gap, and the trail-anomaly sweep is the backstop |

## Files changed

| File | What changed in it |
|---|---|
| `02-contracts/callables.json` | The `flagMockLocation` entry, and a `tamperFlags` family group |
| `02-contracts/collections/trip.schema.json` | `x-writes` corrected: `driverapp` removed, the real writers named |
| `02-contracts/collections/van.schema.json` | `x-writes` corrected: `currentTripId` and the direct admin write removed |
| `02-contracts/collections/route.schema.json`, `ward.schema.json` | `x-writes` corrected to the district-staff direct write the rules allow |
| `04-functions/src/callables/tracking.ts` | Created. The `flagMockLocation` handler |
| `04-functions/src/index.ts` | The export |
| `08-tools/check-x-writes.ts` | Created. Checks `x-writes` against the strict rules |
| `VERSION` | 2.0.0 → 2.1.0 |
| `06-changes/manifest.json` | The `CHG-0017` entry |

## See also

- [The callable entry](../02-contracts/callables.json)
- [The trip schema](../02-contracts/collections/trip.schema.json)
- [The strict rules](../03-rules/firestore.strict.rules)
- [CHG-0011: the server writes the ward duty board](./CHG-0011-the-server-writes-the-ward-duty-board.md)
