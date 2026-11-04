---
id: rules-readme
title: The Rules Folder
status: active
owner: platform-owner
updated: 2026-11-02
contractVersion: "2.1.0"
audience: harness
see_also:
  - ./firestore.rules
  - ./firestore.strict.rules
  - ../02-contracts/claims.json
  - ../06-changes/CHG-0003-scope-the-rules-by-custom-claims.md
  - ../07-guides/backend-split.md
---

# The Rules Folder

**The security boundary for all three apps.** One owner, one review path.

## 1. The files

| File | What it is |
|---|---|
| `firestore.rules` | **PHASE 1.** The loose rules. **This is what is deployed today** |
| `firestore.strict.rules` | **PHASE 2.** The claims-based rules. The CHG-0003 target |
| `storage.rules` | The Cloud Storage authorization. The complaint photos |
| `firestore.indexes.json` | The composite indexes. **Four exist. More are needed** |
| `firebase.json` | The emulator config for PHASE 1, and the deploy paths |
| `firebase.strict.json` | The emulator config for PHASE 2. Different ports, so both can run at once |

**The two rule files are not duplicates and not a rewrite in progress.** They are the two ends of one switch. See section 4.

## 2. The three rules of the rules

### 2.1 One file, one owner

**The platform owner writes the rules. Nobody else.** A teammate who edits `firestore.rules` and deploys can open a hole for everyone.

**A change request goes through a PR.** See `../06-changes/templates/contract-request.md`.

### 2.2 The rules scope by claim, not by "is signed in"

| Collection | The claim that scopes it |
|---|---|
| `vans` | `vanId` |
| `trips` | `vanId`, and `currentTripId` for the D4 scope |
| `drivers` | `driverId`. **And field-restricted** |
| `complaints` | `deviceId` for the citizen, the trip scope for the driver, the live staff scope for the admin |
| `ratings` | `deviceId` |
| `wardDuty` | The route scope. **Server writes only** |
| `complaintPhones` | The district role. **The PII collection** |
| `staffPhones` | The district role. **The PII collection** |

**`allow read: if request.auth != null` is not authorization.** It is a comment that says "the door is unlocked".

### 2.3 Every admin write is denied

```rules
allow write: if false;
```

**The admin panel writes through callables.** A revoked staff member's token stays valid for up to an hour, and only a server-side read of the live `staff` doc can lock them out immediately.

**Admin READS stay allowed**, scoped by the claim.

## 3. The field-level restriction

**A Firestore `get` returns the whole document. Rules do not redact.**

| Consequence | What it forces |
|---|---|
| A field-restricted read still returns every field | The PII field cannot live on the same doc as the reader |
| A collection-level rule is not enough for `drivers` | The rule must check the field set explicitly, AND the raw phone must live in `staffPhones` |

**This is the rule that most often gets written wrong**, because the collection-level version looks correct and passes a casual review.

**The same logic is why a raw phone cannot sit on a complaint.** A complaint is read by the user app, the driver app and the admin panel. A rule cannot hide one field of it. So the raw phone lives in `complaintPhones/{complaintId}`, a collection only district staff can read, and the complaint keeps a masked copy. That is CHG-0012.

## 4. The two phases

| | PHASE 1 | PHASE 2 |
|---|---|---|
| **File** | `firestore.rules` | `firestore.strict.rules` |
| **Status** | **Deployed today** | Not deployed. The target |
| **The rule** | "is somebody signed in" | "does this token's claim allow this" |
| **Identity** | Anonymous | Custom token with claims |
| **Who signs in** | Everybody, today | Driver, citizen, staff |
| **Admin writes** | Allowed | **Denied** |
| **Raw phone** | Reachable | **Not reachable** |
| **Emulator** | `firebase.json`, ports 9099 / 8080 / 5001 | `firebase.strict.json`, ports 9098 / 8081 / 5001 |
| **Reached by** | CHG-0008 | CHG-0003 |

**Why two files and not one file that changes.** The rules tighten LAST. If the strict rules were deployed while an app still signed in anonymously, every write would be denied, and the failure would look like **"the screen is empty"**, not "you are not authorised". That is a bad failure to debug in the field. A separate file means the switch is one deploy, on a day when every app is ready.

**The rule files are mutually exclusive in production.** Only one of them is ever deployed.

## 5. The switch procedure

**This is the day PHASE 1 becomes PHASE 2.** Do not start before every checkbox below is ticked. The rules tighten last, and this is the step that breaks an app if it runs early.

### 5.1 The preconditions

| # | Check | How it is checked | Who |
|---|---|---|---|
| 1 | The callables are deployed | `bindDeviceToVan`, `bootstrapUserSession`, `mintStaffToken` answer in the console | Platform owner |
| 2 | The driver app signs in with a custom token | The token has `vanId` and `driverId` claims | driverapp team |
| 3 | The user app signs in with a custom token | The token has `deviceId` and `routeId` claims | userapp team |
| 4 | The admin panel signs in with a custom token | The token has `staffId`, `role` and `wardIds` claims | adminpanel team |
| 5 | The backfill is done | No complaint has `phone`, `assignedPhone` or `escalatedToPhone` left on it | Platform owner |
| 6 | The raw phones are moved | `complaintPhones/{id}` and `staffPhones/{id}` hold the raw values | Platform owner |
| 7 | The `wardDuty` client write is gone | `grep -rn 'syncWardDutyToCloud' apps/` gives zero hits in userapp | userapp team |
| 8 | The admin panel writes go through callables | `grep -rn 'setDoc\\|updateDoc\\|addDoc' src/` gives zero writes outside the repository layer | adminpanel team |

**If any of the eight is unticked, stop.** The switch is not partial. Half a switch denies writes.

### 5.2 The switch itself

**Step 1. Copy the strict rules over the loose ones.**

```bash
# The platform owner does this. It is one file copy.
cp firestore.strict.rules firestore.rules
```

**Step 2. Deploy the rules.**

```bash
firebase deploy --only firestore:rules
```

**Step 3. Smoke test all three apps, in this order.**

| App | The test | The pass |
|---|---|---|
| driverapp | Sign in, start a shift, mark a ward done | The van moves on the office map |
| userapp | Open the map, file a complaint | The ticket id appears in the office panel |
| adminpanel | Log in, open complaints, assign one | The status changes in the citizen app |

**Step 4. Watch the logs for one hour.** The denied-read count is the signal. If any app's screen is empty, roll back.

### 5.3 The rollback

```bash
# The loose rules are in git history. This restores them.
git checkout 04ab3a1 -- 03-rules/firestore.rules
firebase deploy --only firestore:rules
```

**The rollback is one file and one deploy.** It is why the loose rules are kept in the repository instead of being deleted. Do not delete `firestore.rules` after the switch. It stays as the rollback path until PHASE 2 has been live for one release cycle.

### 5.4 After the switch

| Item | Action |
|---|---|
| `firebase.json` | Point it at `firestore.strict.rules`, or delete it and keep only `firebase.strict.json` |
| `firestore.rules` | Keep it in the repo as the rollback path. Do not edit it |
| `03-rules/README.md` section 4 | Change the PHASE 1 row to "Rollback path" and the PHASE 2 row to "Deployed" |
| CHG-0003 in each app's `adopted.json` | Set the state to `adopted` with the merged PR number |
| `06-changes/impact-matrix.md` | Run `node 08-tools/check-adoption.ts --write` |

## 6. The current state of the rules

**PHASE 1 is deployed.** The rules in `firestore.rules` are `request.auth != null` across the board, except `vanSecrets` which is denied by default.

**A 17-probe emulator test on these exact rules proved the holes.**

| # | The probe | The result |
|---|---|---|
| 1 | Read another driver's phone | **It succeeded.** The phone leaked |
| 2 | Read another driver's doc | It succeeded |
| 3 | Rewrite another van's `status` | **It succeeded.** The write landed |
| 4 | Rewrite another van's `currentTripId` | **It succeeded.** The write landed |
| 5 | Write a trip for a van the caller does not own | It succeeded |
| 6 | Read `vanSecrets` | It was denied. The one thing that worked |
| 7 | And 10 more | Each is documented in `../09-reference/` |

**The rewrite is `firestore.strict.rules`.** It is the CHG-0003 target.

## 7. The emulator caveat

**The Firestore emulator enforces the rules. It does NOT enforce composite indexes.**

**A green emulator run is not proof of index coverage.** The only place index coverage is proven is a staging project with the real indexes deployed.

**The emulator also does not enforce the storage rules the way production does.** The complaint photo path is the one to check by hand.

## 8. The deploy order

```bash
firebase deploy --only firestore:rules      # after EVERY rules edit
firebase deploy --only firestore:indexes    # after every index change
```

**The rules must be in the RELEASED rules, not just in the file.** A rule that is committed but not deployed does nothing.

**And the order between the rules and the clients matters.** See `../06-changes/CHG-0003-scope-the-rules-by-custom-claims.md` and section 5 above.
