---
id: arrival-notification-flow
title: The Arrival Notification Flow, Worked Example
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: harness
see_also:
  - ../02-contracts/constants.json
  - ../02-contracts/topics.json
  - ./backend-split.md
---

# The Arrival Notification Flow, Worked Example

**The van nears the next ward. The citizen's phone buzzes once. Nine steps connect them. Walk them in order, and check every guard.**

This is the reference flow for reading the platform. It touches a device write, a trigger Function, a route-order read, a geometry check, a transaction, a topic push and a client handler.

## 1. Authority order

1. The contract (`02-contracts/`) wins over every PRD and over every app repo. PRD-2 section 0.6 says 500 m for the alert radius. The contract says `ARRIVAL_ALERT_RADIUS_M = 100`. The contract wins, and CHG-0007 records the office's decision.
2. `../02-contracts/constants.json` group `arrival` owns the numbers: `ARRIVAL_ALERT_RADIUS_M = 100`, `STALE_LOCATION_SEC = 60`. No private copy in any codebase.
3. `../02-contracts/topics.json` owns the push: topic `ward_{wardId}`, priority HIGH, idempotency in `trips/{tripId}.alertedWardIds`.
4. `../02-contracts/collections/route.schema.json` owns the visiting order: `routes.wardIds` is THE ORDER. Reordering it silently alerts the wrong ward.
5. `../02-contracts/errors.json` and `../02-contracts/topics.json` `x-payload` own the payload shape.

## 2. Hard constraints

| # | Constraint |
|---|---|
| 1 | NEVER alert from a stale position. `now - lastLocation.updatedAt` must be at most `STALE_LOCATION_SEC` (60 s) |
| 2 | NEVER alert for a van that is not `on_shift`. `van.status` is the gate |
| 3 | NEVER send the same ward twice in one trip. `trips.alertedWardIds` is the idempotency guard, appended inside the same transaction as the send |
| 4 | ALWAYS measure from the ward BOUNDARY: `distance(van, ward.center) <= ward.radiusM + ARRIVAL_ALERT_RADIUS_M`. Measuring from the center with a flat 100 m is the classic bug |
| 5 | ALWAYS walk `routes.wardIds` in array order. Out-of-order ward-done marks are allowed, but the alert always targets the next UN-ALERTED ward in route order |
| 6 | NEVER push to a device token. The platform has no device registry. It pushes to the topic `ward_{wardId}` |
| 7 | The `data` payload MUST carry the ids. The app navigates using them (`../02-contracts/topics.json` `x-payload` rule) |
| 8 | The user app MUST re-subscribe when the citizen's ward changes, and unsubscribe the old ward topic |
| 9 | `lastLocation.updatedAt` is a SERVER timestamp. Never the client clock |

## 3. Read budget

| Your task | Read exactly these | Do not read |
|---|---|---|
| Understand the flow | This file, `../02-contracts/constants.json` group `arrival`, `../02-contracts/topics.json` | `../09-reference/` |
| Verify a document shape | `../02-contracts/collections/van.schema.json`, `../02-contracts/collections/trip.schema.json`, `../02-contracts/collections/ward.schema.json`, `../02-contracts/collections/route.schema.json` | The other 10 schemas |
| Change a number here | `../02-contracts/constants.json`, via `./making-a-contract-change.md` | The Function source first |
| Debug a missed alert | This file section 4.2, the failure table | The whole Functions source |

## 4. Procedure

### 4.1 The nine steps

| # | Actor | What happens | Exact data |
|---|---|---|---|
| 1 | driverapp | Samples GPS every `GPS_INTERVAL_SEC` = 10 s. Below `LOW_BATTERY_PCT` = 20 the cadence drops to `GPS_INTERVAL_LOW_BATTERY_SEC` = 30 s. A move under `MIN_MOVE_M` = 15 m is skipped unless the `HEARTBEAT_SEC` = 30 s heartbeat forces a write | Sensor fix |
| 2 | driverapp | Overwrites `vans/{vanId}.lastLocation` with `{lat, lng, updatedAt, speedKmph}`. One small doc, never an array. `updatedAt` is a server timestamp. The rule allows this because the `vanId` claim scopes the van and the key list allows `lastLocation` | `vans.lastLocation` |
| 3 | platform | `arrivalAlert` fires on the `vans/{vanId}` update trigger | Trigger |
| 4 | platform | Freshness gate: `now - lastLocation.updatedAt <= STALE_LOCATION_SEC` (60 s) and `vans.status == on_shift`. Fail either, exit silently | Guard 1 |
| 5 | platform | Read the trip from `vans.currentTripId`, then the route from `trip.routeId`. `trip.routeId` is the shift-start snapshot, so a mid-shift van reassignment cannot alert the wrong route | `trips/{tripId}`, `routes/{routeId}.wardIds` |
| 6 | platform | Find the next ward: walk `routes.wardIds` in order, take the first `wardId` that is NOT in `trips.alertedWardIds`. Skip `trips.wardsDone` entries only when they are already alerted. No un-alerted ward left, exit | Route order |
| 7 | platform | Distance gate: haversine from `vans.lastLocation` to `wards/{wardId}.center`, alert when `distance <= wards.radiusM + ARRIVAL_ALERT_RADIUS_M` (100 m). Outside, exit. The next write re-checks | Guard 2 |
| 8 | platform | Transaction on `trips/{tripId}`: re-read `alertedWardIds`, append `wardId` once if absent, and inside the same transaction send the FCM push to topic `ward_{wardId}`, priority HIGH | Idempotent send |
| 9 | userapp | The device is subscribed to `ward_{wardId}` since `bootstrapUserSession` resolved the ward. The OS renders the notification. The app reads the `data` ids and navigates to the trip view | Topic push |

The 10-second cadence makes step 8 run every 10 seconds while the van sits inside the radius. The transaction in step 8 is what turns that into exactly one push.

### 4.2 The failure table

| Failure | Effect | Guard that catches it |
|---|---|---|
| The driver's phone dies at the ward edge | `updatedAt` ages past 60 s | Guard 1, no alert from a stale position |
| The van idles inside the radius for 10 minutes | One push, not sixty | Step 8's `alertedWardIds` transaction |
| The office reorders `routes.wardIds` mid-shift | Alerts follow the new order for un-alerted wards | Step 6 reads the live route; `trip.routeId` keeps the route identity stable |
| The office reassigns the van mid-shift | The trip keeps its start-of-shift route snapshot | Step 5 reads `trip.routeId`, not `vans.routeId` |
| The citizen moves to a ward on another route | The app re-runs `bootstrapUserSession`, gets a fresh token and re-subscribes | `routeId` claim refresh rule in `../02-contracts/claims.json` |
| Two Function instances race the same update | One appends, the other sees the append and exits | The transaction |
| The ward boundary check uses the center only | Alerts fire too late, at the center | Guard 2, `radiusM + ARRIVAL_ALERT_RADIUS_M` |
| The van crosses two wards between writes | Step 6 walks route order again on the next write and alerts the next un-alerted ward | Route order walk |

### 4.3 What each participant owns

| Participant | Owns | Never owns |
|---|---|---|
| driverapp | Sampling cadence, `lastLocation` write, trail chunks | The alert decision, the radius, the topic |
| platform `arrivalAlert` | Freshness, route order, geometry, idempotency, the push | Sampling, the words in the notification beyond the payload shape |
| userapp | Ward topic subscription, rendering, navigation | The decision to alert, the route order |
| `../02-contracts/` | Every number, the payload shape, the topic names | Nothing. It owns all of it |

## 5. Do NOT

| Do NOT | Why |
|---|---|
| Do not alert from the trip's `startedAt` position | Only `lastLocation.updatedAt` carries freshness |
| Do not append `alertedWardIds` outside the transaction with the send | The send and the bookkeeping must succeed or fail together |
| Do not use a flat radius from the center | The check is `radiusM + ARRIVAL_ALERT_RADIUS_M`, ward boundary to van |
| Do not subscribe the user app to `van_{vanId}` | That topic is the driver app's, with a shift-end unsubscribe duty. The citizen listens to the ward |
| Do not hardcode 100, 60 or 10 in code | They live in `../02-contracts/constants.json`. A private copy is a bug waiting for a drift |
| Do not send the alert with priority MEDIUM | `../02-contracts/topics.json` `x-pushes` sets HIGH for `arrivalAlert` |

## 6. Self-verification

Verify the numbers you are using match the contract:

```bash
grep -n -A2 "ARRIVAL_ALERT_RADIUS_M" 02-contracts/constants.json | grep "value"
# expected: "value": 100,
grep -n -A2 "STALE_LOCATION_SEC" 02-contracts/constants.json | grep "value"
# expected: "value": 60,
grep -n -A2 "GPS_INTERVAL_SEC" 02-contracts/constants.json | grep "value"
# expected: "value": 10,
```

Verify the idempotency field exists and the topic is wired:

```bash
grep -n "alertedWardIds" 02-contracts/collections/trip.schema.json
# expected: the property, described as THE IDEMPOTENCY GUARD
grep -n "ward_{wardId}" 02-contracts/topics.json
# expected: the topic and the arrivalAlert push entry
```

Verify this guide's tables:

```bash
python3 - <<'PY'
import re
doc="07-guides/arrival-notification-flow.md"
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

Expected: `07-guides/arrival-notification-flow.md: TABLES=6 MALFORMED=0`. Any `BAD` line is a failure.

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

A debugging run reports `FILES CHANGED: none` unless the fix is a contract edit, and names the failing step number from section 4.1 in `OPEN QUESTION`, for example `step 7 fires but step 8 exits, transaction contention on trips/{tripId}`.
