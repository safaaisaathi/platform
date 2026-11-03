# CHG-0012: No raw phone number in a document a client can read

**Severity**: S0 (Emergency) | **Priority**: **P0** | **Version**: 1.0.0 → 2.0.0
**Date**: 2026-11-02 | **Author**: platform-owner | **Decides**: ADR-0005

## What changed

The user app's `Complaint` interface holds `phone`, `assignedPhone` and `escalatedToPhone`, and it writes them onto the complaint document. The user app's own rules file has `allow read: if isStaff()` on `complaints`, so every staff member who can read a complaint can read the complainant's phone and the staff member's phone. The complaint document is read by the user app, the driver app and the admin panel, and the admin panel's `Complaint` interface does not have those three fields, so only the user app writes them. The contract moves the raw phone to `complaintPhones/{complaintId}`, keeps `phoneMasked` on the complaint with the shape `98XXXXXX10`, and restricts the raw read to district staff, the DDO and the TDO. It also renames `staff.phone` to `staff.phoneMasked` and moves the raw value to `staffPhones/{staffId}`.

A field-level rule does not fix this. A Firestore `get` returns the whole document and the rules cannot redact a field, so the only way to keep a value out of a reader's hands is to put it in a collection the reader cannot read.

## Why

The phone is personal data on the busiest collection in the system, and it is readable by every staff member who can read a complaint. That includes inspectors who only need to see that a complaint exists. The complaint is read by all three apps, so the leak surface is every signed-in staff session. The same reasoning already applies to `drivers`, where ADR-0005 split the raw phone into `staffPhones`; the complaint is the same shape of leak and it was missed.

## What breaks

| App | What breaks |
|---|---|
| userapp | A complaint read no longer returns `phone`, `assignedPhone` or `escalatedToPhone`. The complaint card's phone line goes blank. The sync payload that still sends those three fields is rejected once the write rule tightens |
| adminpanel | Nothing at read time, because its `Complaint` type never had the three fields. It must switch `staff.phone` to `staff.phoneMasked` and read the raw phone from `complaintPhones` |
| driverapp | Nothing. It never read a phone from the complaint |

**The dangerous state is before the backfill.** Until step 6 runs, the raw phone still sits on the complaint document, and every staff member who can read the complaint can still read it. The read rule cannot hide a field that is still there.

## Who is affected

| App | Affected? | What they must do | Blocked release? |
|---|---|---|---|
| driverapp | NO | It reads complaints in the trip scope but never reads a phone | No |
| userapp | YES | Delete the three fields from the `Complaint` type and the sync payload. Write the raw phone to `complaintPhones/{complaintId}` and the mask to `complaints.phoneMasked` | Yes, by 2026-11-09 |
| adminpanel | YES | Delete the three fields from its `Complaint` type. Read the raw phone from `complaintPhones` and read `staff.phoneMasked` | Yes, by 2026-11-09 |

## Migration steps

1. The complaint's raw phone moves to complaintPhones/{complaintId}. Only district staff may read it
2. userapp: delete phone, assignedPhone and escalatedToPhone from the Complaint type and from the sync payload
3. userapp: write the raw phone to complaintPhones/{complaintId} and the masked one to complaints.phoneMasked
4. adminpanel: delete the same three fields from its Complaint type. Read the raw phone from complaintPhones
5. adminpanel: read staff.phoneMasked, not staff.phone
6. Backfill the existing documents before the rules tighten. A script moves the raw values out
7. Deploy the rules LAST. Until then the old rules keep the old clients working

**The order that works**: backfill first, clients second, rules last. Step 6 moves the raw value out while the old rules still allow the old clients to read it.

**The order that breaks**: deploy the rules first. The complaint is still holding the raw phone with no backfill, the read returns nothing for the phone line, and the office has no way to call the complainant.

## The deprecation window

| Field | Meaning | Value |
|---|---|---|
| `oldFieldReadableUntil` | The last date the old field can be read | 2026-11-09 |
| `oldFieldWritableUntil` | The last date the old field can be written. `null` means read-only | 2026-11-09 |

**Inside the window**, both the raw and the masked phone exist. The new writes put the raw in `complaintPhones` and the mask on the complaint. The backfill keeps the old documents readable until the rules tighten.

## Rollback

**Redeploy the old rules.** The `get` returns the raw phone again, and the old clients work.

**The reverse migration**: copy the raw values back from `complaintPhones` and `staffPhones` into `complaints.phone` and `staff.phone`.

**What breaks if you do**: the leak reopens. Every staff member who can read a complaint can read the complainant's raw phone again.

## The failure modes

| What you see | Why |
|---|---|
| The complaint's phone line is blank | The client still reads `complaints.phone`, which no longer exists |
| Every staff member can read the complainant's phone | The rules were not tightened and the raw value is still on the complaint document |
| The office cannot call the complainant | The rules tightened before the backfill moved the raw value to `complaintPhones` |
| A staff member with no district scope reads a raw phone | The `complaintPhones` read rule was written wider than DDO and TDO |

## Files changed

| File | What changed in it |
|---|---|
| `02-contracts/collections/complaint.schema.json` | `phoneMasked`; no phone field, per the `x-no-pii` note |
| `02-contracts/collections/complaintPhone.schema.json` | The new collection for the raw value |
| `02-contracts/collections/staff.schema.json` | `phone` → `phoneMasked` |
| `02-contracts/collections/staffPhone.schema.json` | The raw staff phone, read by DDO and TDO only |
| `03-rules/firestore.rules` | The `complaintPhones` read scope, deployed last |
| `VERSION` | 1.0.0 → 2.0.0 |
| `06-changes/manifest.json` | The `CHG-0012` entry |

## See also

- [ADR-0005, masked phone only](../05-decisions/0005-masked-phone-only.md)
- [CHG-0002, the driver phone, the closest sibling](CHG-0002-mask-the-raw-driver-phone.md)
- [The complaint phone schema](../02-contracts/collections/complaintPhone.schema.json)
- [The staff phone schema](../02-contracts/collections/staffPhone.schema.json)
- [The emergency change guide](../07-guides/emergency-changes.md)
