# CHG-0022: Alert the ward inspector when a mock location is latched

**Severity**: S2 (New capability) | **Priority**: P2 | **Version**: 2.2.0 → 2.3.0
**Date**: 2026-11-05 | **Author**: platform-owner | **Decides**: issue #11

## What changed

| Item | Before | After |
|---|---|---|
| The first mock-location latch | Wrote `trips.mockLocationDetected` and told nobody | Writes the latch, then pushes to the staff members who own the trip's wards |
| `staff_{staffId}` topic | Published by `missedCollectionAlert` and `escalateComplaints` | Also published by `flagMockLocation` |
| Document shape | No change | No change |

**No new topic, no new field, no new collection.** The topic, the payload shape and the latch all existed.

## Why

**B-12: the latch was a record nobody read.** `flagMockLocation` set a durable flag, but staff learned about it only if someone opened the trip later. The point of the flag is to catch a mocked GPS fix while the shift is live, so an alert is what makes it useful.

**The recipient is the ward inspector.** A trip carries `vanId`, `routeId` and the `wardIds` snapshot, but no staff id, and a route has no staff field. The ward is the only staff linkage the trip carries: `wards/{wardId}.inspectorId` names the person responsible. A trip can span several wards and one inspector can cover several of them, so the server de-duplicates and sends one push per person.

**Only the first latch sends.** `flagMockLocation` already returns `flagged: true` only on the call that flips the bit. A retry after a dropped response returns `false` and sends nothing, so a phone that retries cannot spam the staff.

**A push failure does not fail the call.** The latch is committed before the send. If FCM is down, the driver still gets a success and the flag is still on the trip; the failure is logged.

## What breaks

| App | What breaks |
|---|---|
| adminpanel | Nothing. It receives a new `data.type`, which is additive |
| driverapp | Nothing. It does not subscribe to `staff_{staffId}` |
| userapp | Nothing |

## Who is affected

| App | Affected? | What they must do | Blocked release? |
|---|---|---|---|
| adminpanel | YES | Receive the `staff_{staffId}` topic after the staff token is minted and render `data.type = mock_location_alert` | No. The latch works without the push |
| driverapp | NO | Nothing | No |
| userapp | NO | Nothing | No |

## Migration steps

| # | Step | Why here |
|---|---|---|
| 1 | Deploy the functions | The send is inside `flagMockLocation` |
| 2 | adminpanel subscribes to `staff_{staffId}` after sign-in | That is the same subscription the other staff alerts already need |
| 3 | adminpanel routes `data.type = mock_location_alert` to the trip or van screen | The payload carries `tripId` and `vanId` |
| 4 | Do not add a per-ward topic | One push per inspector, not one per ward |

**The topic is contracted.** `02-contracts/topics.json` already lists `staff_{staffId}` and its subscription rule. This change only adds `flagMockLocation` to its `publishedBy` list and an `x-pushes` entry.

## The deprecation window

Not applicable. This is an addition.

## Rollback

**Stop sending.** The latch and the field stay; staff simply stop receiving the push.

## The failure modes

| Failure | What the user sees | What the log says |
|---|---|---|
| No ward has an inspector id | Nobody is pushed. The latch is still set | Nothing |
| FCM rejects the send | The driver sees success. The latch is set | `flagMockLocation: the staff push failed` |
| A retry after a dropped response | No second push | Nothing |
| A trip with 29 wards, one inspector | One push | Nothing |

## Files changed

| File | What changed in it |
|---|---|
| `04-functions/src/callables/tracking.ts` | The ward-inspector lookup and the send |
| `02-contracts/topics.json` | The publisher and the `x-pushes` entry |
| `02-contracts/callables.json` | The `flagMockLocation` authority reads and push note |
| `06-changes/manifest.json` | The `CHG-0022` entry |
| `09-reference/issue-register.md` | B-12 now points at this entry |

## See also

- [The topic map](../02-contracts/topics.json)
- [flagMockLocation](../04-functions/src/callables/tracking.ts)
- [CHG-0017](./CHG-0017-the-mock-location-latch-is-a-callable.md), the latch this alert reports
