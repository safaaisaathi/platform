---
id: impact-matrix
title: The Impact Matrix
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
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

**Contract version**: `1.0.0`. The next release is `2.0.0`, which is the breaking one.

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

**Legend**: ✅ done. 🟡 in progress. ⬜ not started. n/a not affected.
<!-- END GENERATED: section-1 -->

## 2. The one that blocks everything

**CHG-0003 is P0 and urgent for all three apps.** It is the rules rewrite.

**The order that works, and the order that breaks.**

| Order | What happens |
|---|---|
| **1. Deploy the callables** | `bindDeviceToVan`, `bootstrapUserSession`, `mintStaffToken`. The clients can now get a claim |
| **2. Ship the client halves** | Each app signs in with the custom token instead of staying anonymous |
| **3. Deploy the new rules** | Now the claims exist, so the claim checks pass |

**The wrong order is deploying the rules first.** Between step 3 and step 2, every write is denied, and the failure looks like *"the screen is empty"* rather than *"you are not authorised"*. **The loose old rules keep the old clients working while the new ones roll out.**

## 3. Per app, what is outstanding

### driverapp

| Change | What to do | Blocked release? |
|---|---|---|
| CHG-0002 | Read `drivers.phoneMasked` instead of `drivers.phone`. Show the mask on the confirm card | Yes, at the deadline |
| CHG-0003 | Call `bindDeviceToVan` at sign-in. Sign in with the custom token. Stop sending the badge code as a client parameter | **Yes, immediately** |
| CHG-0005 | Write the trail to `trips/{id}/trail/{n}` in chunks of 1000. Stop writing `trips.gpsTrail` | Yes, at the deadline |
| CHG-0006 | Delete the PIN flow remnants. Delete the `cloud_functions` dependency | Yes, at the deadline |

### userapp

| Change | What to do | Blocked release? |
|---|---|---|
| CHG-0003 | Call `bootstrapUserSession` at launch. Sign in with the custom token. Use the `deviceId` and `routeId` claims | **Yes, immediately** |
| CHG-0007 | Nothing to write. The radius is a server-side constant. Just be aware the alert arrives earlier than before | No |

### adminpanel

| Change | What to do | Blocked release? |
|---|---|---|
| CHG-0002 | Read `drivers.phoneMasked`. Read the raw phone from `staffPhones/{code}` | Yes, at the deadline |
| CHG-0003 | Call `mintStaffToken` at sign-in. Scope every query by the `wardIds` claim | **Yes, immediately** |
| CHG-0004 | Route all five writes through the callables. Stop writing to Firestore directly | **Yes, immediately** |

## 4. The per-app checklist

**The checklist lives with the change, in `manifest.json` under `migration.steps`.** This is the summary.

**The rule that makes it meaningful.** *An app with no checklist shows 0%, not 100%.* Every app here is at 0% because nothing has been written down, not because the work is invisible.

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
