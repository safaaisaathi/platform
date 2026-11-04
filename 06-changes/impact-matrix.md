---
id: impact-matrix
title: The Impact Matrix
status: active
owner: platform-owner
updated: 2026-11-05
contractVersion: "2.1.0"
audience: both
see_also:
  - ./manifest.json
  - ./adoption.json
  - ./README.md
---

# The Impact Matrix

**One page. Who is affected by what, and have they done it.**

**Section 1 is generated.** `node 08-tools/check-adoption.ts --write` rewrites the block between the markers, from `manifest.json` and the adoption records. **Do not edit it by hand.** If you did, it would drift from the machine log, and the machine log is the one CI reads.

**Sections 2 to 6 are written by hand.** They are the reasoning, and a machine cannot write them.

## 1. The current state

**Contract version**: `2.1.0`. `2.0.0` was the breaking release and it is published. `2.1.0` adds the `flagMockLocation` callable, an addition that blocks no app. No app has adopted `2.0.0` yet.

<!-- BEGIN GENERATED: section-1 -->
| Change | Sev | Pri | Driver | User | Admin | Deadline |
|---|---|---|---|---|---|---|
| [CHG-0001](CHG-0001-freeze-the-collection-and-field-contract.md) Freeze the collection and field contract | S2 | P2 | ✅ 100% | ✅ 100% | ✅ 100% | none |
| [CHG-0002](CHG-0002-mask-the-raw-driver-phone.md) Move the raw driver phone to staffPhones and mask it at the source | S1 | **P1** | ⬜ 0% | n/a | ⬜ 0% | 2026-11-15 |
| [CHG-0003](CHG-0003-scope-the-rules-by-custom-claims.md) Scope the Firestore rules by custom claims instead of by signed-in | S1 | **P0** | ⬜ 0% | ⬜ 0% | ⬜ 0% | **Immediate** |
| [CHG-0004](CHG-0004-admin-writes-go-through-callables.md) Route every admin panel write through a callable | S1 | **P1** | n/a | n/a | ⬜ 0% | **Immediate** |
| [CHG-0005](CHG-0005-shard-the-gps-trail.md) Shard the GPS trail into a trail subcollection | S1 | **P1** | ⬜ 0% | n/a | n/a | 2026-11-15 |
| [CHG-0006](CHG-0006-delete-the-pin-flow.md) Delete verifyDriverPin, setDriverPin and the vanSecrets collection | S1 | **P1** | ⬜ 0% | n/a | n/a | 2026-11-15 |
| [CHG-0007](CHG-0007-arrival-alert-radius-100m.md) Set the arrival alert radius to 100 m from the ward boundary | S2 | P2 | n/a | ⬜ 0% | n/a | Scheduled |
| [EXT-0001](EXT-0001-driverapp-trip-id.md) The driver app owns trips.id | S3 | P4 | ✅ 100% | n/a | n/a | none |
| [CHG-0008](CHG-0008-one-firebase-project.md) Put all three apps on one Firebase project | S1 | **P0** | ⬜ 0% | ⬜ 0% | ⬜ 0% | 2026-11-09 |
| [CHG-0009](CHG-0009-the-backend-lives-in-the-platform-repo.md) Move the backend source into the platform repo and delete the copies | S1 | **P1** | ⬜ 0% | ⬜ 0% | ⬜ 0% | 2026-11-15 |
| [CHG-0010](CHG-0010-wider-complaint-statuses-and-categories.md) Adopt the wider complaint statuses and categories | S1 | **P1** | ⬜ 0% | ⬜ 0% | ⬜ 0% | 2026-11-15 |
| [CHG-0011](CHG-0011-the-server-writes-the-ward-duty-board.md) The server writes the ward duty board, not the citizen | S0 | **P0** | ⬜ 0% | ⬜ 0% | ⬜ 0% | 2026-11-09 |
| [CHG-0012](CHG-0012-no-raw-phone-in-a-readable-document.md) No raw phone number in a document a client can read | S0 | **P0** | n/a | ⬜ 0% | ⬜ 0% | 2026-11-09 |
| [CHG-0013](CHG-0013-one-admin-complaint-write.md) One callable for the admin complaint write, and no client named staff member | S1 | **P1** | n/a | ⬜ 0% | ⬜ 0% | 2026-11-15 |
| [CHG-0014](CHG-0014-the-admin-panel-must-talk-to-firebase.md) The admin panel must talk to Firebase, not to localStorage | S2 | P2 | n/a | n/a | ⬜ 0% | none |
| [CHG-0015](CHG-0015-fix-the-prd-pointers.md) Fix the PRD pointers and compute the source hash | S2 | P3 | ⬜ 0% | ⬜ 0% | ⬜ 0% | none |
| [CHG-0016](CHG-0016-the-user-app-stack-is-react.md) The user app's stack is React, not Flutter | S2 | P2 | n/a | ⬜ 0% | n/a | none |
| [EXT-0002](EXT-0002-userapp-collection-feedback.md) The user app owns collectionFeedback | S3 | P4 | n/a | ⬜ 0% | n/a | none |
| [CHG-0017](CHG-0017-the-mock-location-latch-is-a-callable.md) The mock-location latch is set by a callable, not a client trip write | S2 | P2 | ⬜ 0% | n/a | n/a | none |

**Legend**: ✅ done. 🟡 in progress. ⬜ not started. n/a not affected.
<!-- END GENERATED: section-1 -->

## 2. The three that block everything

**Three changes are P0. They are not the same kind of work.**

| Change | What it is | Who owns it | By when |
|---|---|---|---|
| **CHG-0008** | One Firebase project | All three apps | 2026-11-09 |
| **CHG-0011** | The server writes the ward duty board | userapp, driverapp, adminpanel | 2026-11-09 |
| **CHG-0012** | No raw phone in a readable document | userapp, adminpanel | 2026-11-09 |

**CHG-0003 is the rules rewrite and it blocks the release of all three apps.** It is the switch in `03-rules/README.md` section 5.

**The order that works, and the order that breaks.**

| Order | What happens |
|---|---|
| **1. Deploy the callables** | `bindDeviceToVan`, `bootstrapUserSession`, `mintStaffToken`. The clients can now get a claim |
| **2. Ship the client halves** | Each app signs in with the custom token instead of staying anonymous |
| **3. Deploy the new rules** | Now the claims exist, so the claim checks pass |

**The wrong order is deploying the rules first.** Between step 3 and step 2, every write is denied, and the failure looks like *"the screen is empty"* rather than *"you are not authorised"*. **The loose old rules keep the old clients working while the new ones roll out.**

**And the rules must never be deployed before the backfill.** CHG-0012 moves the raw phones out of the complaint documents. If the strict rules land before the backfill script has run, the district staff lose the numbers and the citizens lose the ability to file a complaint with a phone.

## 3. Per app, what is outstanding

### driverapp

| Change | What to do | Blocked release? |
|---|---|---|
| CHG-0002 | Read `drivers.phoneMasked` instead of `drivers.phone`. Show the mask on the confirm card | Yes, at the deadline |
| CHG-0003 | Call `bindDeviceToVan` at sign-in. Sign in with the custom token. Stop sending the badge code as a client parameter | **Yes, immediately** |
| CHG-0005 | Write the trail to `trips/{id}/trail/{n}` in chunks of 1000. Stop writing `trips.gpsTrail` | Yes, at the deadline |
| CHG-0006 | Delete the PIN flow remnants. Delete the `cloud_functions` dependency | Yes, at the deadline |
| CHG-0008 | Point every project id at `safaaisaathi-63a87`. `lib/core/config/firebase_options.dart:75` still says `driver-app-demo`, and the bootstrap test says `test-project` | **Yes, at the deadline** |
| CHG-0009 | Nothing to write. The driver app had no backend copy. Confirm `grep -rn 'onCall\|onWrite\|onSchedule' lib/` gives zero hits | No |
| CHG-0010 | Widen the complaint status type to the seven contract values | Yes, at the deadline |
| CHG-0011 | Call `markWardDone`. The server writes `wardDuty`. Stop writing the document directly | Yes, at the deadline |
| CHG-0012 | Nothing to write. The driver app never had the raw phone. But it must stop reading `complaints.phone` | No |

### userapp

| Change | What to do | Blocked release? |
|---|---|---|
| CHG-0003 | Call `bootstrapUserSession` at launch. Sign in with the custom token. Use the `deviceId` and `routeId` claims | **Yes, immediately** |
| CHG-0007 | Nothing to write. The radius is a server-side constant. Just be aware the alert arrives earlier than before | No |
| CHG-0008 | Delete the hardcoded fallback `safai-saathi-panchmahal` from `apps/citizen_app/src/services/firebaseService.ts`. Read the project id from the environment only | **Yes, at the deadline** |
| CHG-0009 | Delete `backend/functions` and `backend/firestore.rules`. Delete the committed `safai-saathi-web-app.zip` | Yes, at the deadline |
| CHG-0010 | Widen `ComplaintStatus` to seven values. Add the four new category labels to the `gu` and `en` localization files | Yes, at the deadline |
| CHG-0011 | **Delete the `wardDuty` write** in `syncWardDutyToCloud`. Call `getWardDutyStatus` instead | **Yes, at the deadline** |
| CHG-0012 | Delete `phone`, `assignedPhone` and `escalatedToPhone` from the `Complaint` type. Write the raw phone to `complaintPhones/{id}` and the masked one to `complaints.phoneMasked` | **Yes, at the deadline** |
| CHG-0013 | Call `citizenVerifyResolution` and `reopenComplaint`. Delete the direct complaint update | Yes, at the deadline |
| CHG-0015 | Move `PRD-1-user-app (1).md` to `docs/PRD-1-user-app.md` | No |
| CHG-0016 | The office decides React or Flutter. See section 6 | No |

### adminpanel

| Change | What to do | Blocked release? |
|---|---|---|
| CHG-0002 | Read `drivers.phoneMasked`. Read the raw phone from `staffPhones/{code}` | Yes, at the deadline |
| CHG-0003 | Call `mintStaffToken` at sign-in. Scope every query by the `wardIds` claim | **Yes, immediately** |
| CHG-0004 | Route all five writes through the callables. Stop writing to Firestore directly | **Yes, immediately** |
| CHG-0008 | Point the runtime config at `safaaisaathi-63a87`. Stop asking the operator to paste the config into the browser | **Yes, at the deadline** |
| CHG-0009 | Delete the committed Pages build in `docs/` | No |
| CHG-0010 | Widen `ComplaintStatus` to seven values and `ComplaintCategory` to eight. Map the local notice target `citizens` onto the contract's `all` | Yes, at the deadline |
| CHG-0011 | Call `markWardDutyCompleted` | Yes, at the deadline |
| CHG-0012 | Delete the three phone fields from the `Complaint` type. Read the raw phone from `complaintPhones`. Read `staff.phoneMasked` | **Yes, at the deadline** |
| CHG-0013 | Stop sending `workerId` and `workerName`. Call `setComplaintStatus` with `{ complaintId, status, note?, resolvedPhotoUrl? }` | Yes, at the deadline |
| CHG-0014 | Replace the localStorage data layer with a Firestore repository. Scope every query by the `wardIds` claim. Delete the duplicate screens | No, but the panel is a mock until this is done |
| CHG-0015 | Write `docs/PRD-3-admin-panel.md`. The platform points at it and it does not exist | No |

## 4. The per-app checklist

**The checklist lives with the change, in `manifest.json` under `migration.steps`.** This is the summary.

**The rule that makes it meaningful.** *An app with no checklist shows 0%, not 100%.* Every app here is at 0% because nothing has been written down, not because the work is invisible.

**The per-app prompt lives in `10-handoff/`.** One file per app, written for that app's harness, listing the changes that app must adopt, in order, with the acceptance check for each one.

| File | The app |
|---|---|
| `10-handoff/PROMPT-driverapp.md` | The driver app harness |
| `10-handoff/PROMPT-userapp.md` | The user app harness |
| `10-handoff/PROMPT-adminpanel.md` | The admin panel harness |

## 5. How to regenerate this file

```bash
node 08-tools/check-adoption.ts --write
```

It rewrites section 1 from the manifest and the adoption records. **Sections 2 to 6 are hand written and are never touched.**

Without `--write` it prints the same table to the terminal and changes nothing.

## 6. What the office should read

**One sentence per row.**

| Change | The office's takeaway |
|---|---|
| CHG-0002 | A driver's phone number is no longer visible in the driver app. The office still sees it. |
| CHG-0003 | The badge code no longer works as a security key. It never did. Now the rules actually enforce the binding. |
| CHG-0004 | When you disable a staff member, they lose access immediately. Not in an hour. |
| CHG-0005 | A long shift no longer risks the trail write being rejected for being too big. |
| CHG-0006 | The old PIN login path is gone. It was a demo path with an unauthenticated bypass. |
| CHG-0007 | The citizen's arrival alert now fires 100 m from their ward's edge, not 500 m from its centre. |
| CHG-0008 | There was one Firebase project. Now there is one, for all three apps. The user app was pointed at a different project that does not exist. |
| CHG-0009 | There were three copies of the backend. There is now one, in the platform repo. The copies had already drifted apart. |
| CHG-0010 | A complaint can now be pending verification, auto resolved or reopened. A citizen can report a dead animal, a public toilet, construction debris or hazardous waste. |
| CHG-0011 | A citizen could mark any ward's collection as done. Now only the server writes that board. |
| CHG-0012 | A complainant's phone number was readable by every staff member who could see the complaint. Now only the district can read it. |
| CHG-0013 | The admin panel used to say who did the work. The client could be edited, so it now takes the staff member from the token instead. |
| CHG-0014 | The admin panel was a demo. Twenty five screens, zero Firebase. It shows seeded data from the browser's own storage. |
| CHG-0015 | The PRD pointers pointed at files that had moved or did not exist. Drift detection was switched off because every hash said `pending`. |
| CHG-0016 | The user app's PRD says Flutter. The code is React. The office picks one. The contract does not care. |
