---
id: backend-split
title: Backend Split, Rules vs Functions vs Device
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: harness
see_also:
  - ../02-contracts/callables.json
  - ../03-rules/firestore.rules
  - ./making-a-contract-change.md
---

# Backend Split, Rules vs Functions vs Device

**Every write has exactly one home: a rule, a callable, or the device. Use the three placement rules. They are not preferences.**

## 1. Authority order

1. The contract (`02-contracts/`) wins over every PRD and over every app repo.
2. `../02-contracts/callables.json` `x-decision-rule` is the placement law: a write is a rule when the claim is the authority, and a callable when a live document is the authority.
3. `../02-contracts/collections/README.md` section 4 is the write authority table. It is the verdict list for the existing writes.
4. `../02-contracts/claims.json` `x-staleness` decides when a token is enough: a privilege claim is a snapshot, and anything acting on privilege re-checks the live document.
5. `../AGENTS.md` mode table applies while you decide. Deciding is reading. Editing follows `./making-a-contract-change.md`.

## 2. Hard constraints

| # | Constraint |
|---|---|
| 1 | NEVER put a live-document decision inside a rule. Rules see the token, not the current doc state of the caller's authority |
| 2 | NEVER wrap a claim-check write in a callable for safety theater. It costs a round trip and adds nothing. `vans.lastLocation` is a rule write, full stop |
| 3 | NEVER let a client send its own scope. `deviceId`, `driverId`, `role` come from claims, minted by the server. Q6 |
| 4 | EVERY admin panel write is a callable, and every one checks `staff/{staffId}.active` live. Q5 |
| 5 | NEVER expose a raw personal field through a shared document. A `get` returns the whole document, so PII lives in a separate collection (`staffPhones`), and masking happens at the source (`upsertDriver`) |
| 6 | The device owns sensing: GPS sampling, offline buffering, local clock-free display. The server never samples |
| 7 | NEVER send English text from the server. Reason codes from `../02-contracts/errors.json` only |
| 8 | NEVER write a per-launch value into `vanDevices`. The install id is stable per install, or the binding breaks on every reinstall-free relaunch |

## 3. Read budget

| Your task | Read exactly these | Do not read |
|---|---|---|
| Place a new write | `../02-contracts/callables.json` `x-decision-rule` and the family lists, `../02-contracts/collections/README.md` section 4 | `../09-reference/` |
| Check a rule write | `../03-rules/firestore.rules`, `../02-contracts/claims.json` | The callables file |
| Check a callable write | `../02-contracts/callables.json`, `../02-contracts/errors.json` | The rules file |
| Check a device write | The one schema in `../02-contracts/collections/` | The Functions source |
| Handle the offline case | `../02-contracts/errors.json` (`offline`), `../02-contracts/constants.json` (`tracking`, `arrival` groups) | The app repos |

## 4. Procedure

### 4.1 The three placement rules

| # | Rule | Decides |
|---|---|---|
| 1 | Authority: if a claim snapshot is enough, it is a RULE. If a live document must be read, it is a CALLABLE | The mechanism |
| 2 | Computation and side effects: Admin SDK powers, FCM sends, scheduled clocks, cross-document transactions, and anything the client must not compute go to a FUNCTION | The mechanism |
| 3 | Sensing and latency: GPS sampling, offline queues, copy and rendering stay on the DEVICE | The mechanism |

A claim is a snapshot that can be up to an hour old (`../02-contracts/claims.json` `x-staleness`). That is why it is trusted for scope (whose van, whose device) and never for privilege (is this staff member still active today).

### 4.2 The verdict table for the existing writes

| Write | Home | Why |
|---|---|---|
| Driver writes `vans.lastLocation`, `batteryPct`, `status`, `currentTripId` | Rule | The `vanId` claim scopes it. `../03-rules/firestore.rules` restricts the keys with `hasOnly` |
| Citizen creates a `complaints` doc | Rule | The `deviceId` claim scopes it. The doc carries the claim value, never a client parameter |
| Driver reads `drivers/{own code}` | Rule | The `driverId` claim, field-restricted read path, raw phone elsewhere |
| Driver appends `trips/{id}/trail` chunks | Device, direct write | The one deliberate exception. Chunking exists to cut write volume, a Function per point would add a hop. The parent trip, the size cap and the deny-update rule protect it |
| Admin resolves, assigns or escalates a complaint | Callable `setComplaintStatus` | Live `staff.active` check. A revoked token stays valid up to an hour |
| Admin publishes a notice | Callable `publishNotice` | Live check plus the FCM side effect |
| Admin upserts a driver | Callable `upsertDriver` | The mask is applied at the source, the raw phone goes to `staffPhones/{code}` |
| Admin sets the depot tag | Callable `setVanDepot` | The driver never writes `vans.depot`. It is absent from the rule's `hasOnly` list |
| Bind a phone to a van | Callable `bindDeviceToVan` | Race on `vanDevices/{vanId}`, settled in a transaction, rate-limited to `BIND_RATE_LIMIT_MAX` per `BIND_RATE_LIMIT_WINDOW_MIN` |
| Start a shift | Callable `startShift` | Race on `vans.currentTripId`. Two clients reading "no open trip" both create a trip, the last write wins, one shift is orphaned |
| Mark a ward done | Callable `markWardDone` | Scope comes from the trip's `wardIds` snapshot, which only the server compares correctly |
| Mark a van offline after silence | Function `vanOfflineWatch` | The server clock is the authority. `OFFLINE_THRESHOLD_MIN` |
| Send an arrival alert | Function `arrivalAlert` | Geometry plus freshness plus idempotency. See `./arrival-notification-flow.md` |
| Escalate complaints on a clock | Function `escalateComplaints` | Scheduled time, `ESCALATION_L1_HOURS`, `ESCALATION_L2_HOURS` |
| Sample GPS every `GPS_INTERVAL_SEC` | Device | Only the device has the sensor. The server never samples |
| Buffer actions with no network | Device | `offline` is a client-detected code, the server never sees it |
| Choose the words for a reason code | Device | The server sends codes, the client owns words |

### 4.3 Reads vs writes

Reads are rules-first. A read goes to a Function only when it needs something the client cannot do or must not see:

| Read need | Home |
|---|---|
| Scope-filtered documents the claim already covers | Rule. The client queries, the rule filters |
| A field some readers must not see | Not a rule. A separate collection, or a mask applied at the source |
| An aggregate or a computation (distance to the next ward, ETA sums) | Function computes, or the client computes from contract data. Decide per case in the change entry |
| The ETA fallback speed | `AVG_VAN_SPEED_KMPH` in `../02-contracts/constants.json`, read by both apps. Not a server call |

The PII rule, from `../02-contracts/collections/README.md` section 3: a Firestore `get` returns the whole document. Rules do not redact fields. So field-level privacy is a collection decision, made at design time, in the contract.

### 4.4 The offline case

| Situation | Behavior |
|---|---|
| A callable fires with no network | The client detects it locally, shows the `offline` copy (`errorOffline`), buffers the action, retries. The server never sees this code |
| `bindDeviceToVan` retries | Retryable, but the rate limit still applies: `BIND_RATE_LIMIT_MAX` per `BIND_RATE_LIMIT_WINDOW_MIN`. A retry storm is the oracle attack |
| Direct writes (`vans.lastLocation`, trail chunks) | Firestore's local cache queues them. They land when the network returns |
| A location older than `STALE_LOCATION_SEC` | Not trusted. The user app shows "last seen X min ago". The server does not alert from it |
| A van silent for `OFFLINE_THRESHOLD_MIN` | `vanOfflineWatch` marks it `offline`. The user app stops showing it, because `on_shift` is the only visible state |
| A shift stuck in the depot | The device runs the dwell rule: `DEPOT_RADIUS_M`, `DEPOT_DWELL_LIMIT_HOURS`, `DEPOT_DWELL_RESET_M`. The server-side sweep is a separate Function |

### 4.5 Deciding a NEW write

1. Ask rule 1: which document is the authority? If answering needs a document read at call time, it is a callable.
2. Ask rule 2: does it send a push, run on a clock, need Admin SDK, or settle a race? Any yes means a callable or a trigger Function.
3. Ask rule 3: does the device hold the sensor or the latency budget? Any yes means the device acts and the server verifies.
4. Record the verdict in the change entry, in the `authority` block of the callable entry or in the rule comment. The verdict is part of the contract, not a comment in one app's code.

## 5. Do NOT

| Do NOT | Why |
|---|---|
| Do not route telemetry through a callable | A write every `GPS_INTERVAL_SEC` through a Function is cost with no security gain |
| Do not let the client pass `deviceId` as a query parameter | It is forgeable. It is a claim. Q6 |
| Do not put the mask logic in the reader | The mask is applied at the source by `upsertDriver`. Readers receive `phoneMasked` shaped `98XXXXXX10` |
| Do not add a rule that `get()`s a privilege document on every read | Privilege checks belong in callables, where they run on write, not on every read |
| Do not trust the emulator for index coverage | It does not enforce composite indexes |
| Do not invent a fourth home (a "job queue", a "cron in the app") | The three homes are closed. A clock is a Function |

## 6. Self-verification

Verify the verdicts you relied on exist in the contract:

```bash
grep -n "x-decision-rule" 02-contracts/callables.json
# expected: the placement law block
grep -n "hasOnly" 03-rules/firestore.rules
# expected: the vans update key list
grep -n "instantRevocation" 02-contracts/claims.json
# expected: the live staff doc principle
```

For a verdict you just made, confirm the collection's `x-writes` agrees:

```bash
grep -n "x-writes" 02-contracts/collections/van.schema.json
# expected: driverapp keys, functions keys, adminpanel keys, and nothing else
```

Verify this guide's tables:

```bash
python3 - <<'PY'
import re
doc="07-guides/backend-split.md"
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

Expected: `07-guides/backend-split.md: TABLES=7 MALFORMED=0`. Any `BAD` line is a failure.

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

A placement decision with no code change reports `FILES CHANGED: none`, `SEVERITY: S4`, and the verdict inside `OPEN QUESTION` only if it needs the platform owner's confirmation.
