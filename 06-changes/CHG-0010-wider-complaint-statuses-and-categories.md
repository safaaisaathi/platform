# CHG-0010: Adopt the wider complaint statuses and categories

**Severity**: S1 (Breaking) | **Priority**: **P1** | **Version**: 1.0.0 → 2.0.0
**Date**: 2026-11-02 | **Author**: platform-owner | **Decides**: none

## What changed

The contract now has seven complaint statuses, `received`, `assigned`, `resolved`, `escalated`, `pending_verification`, `auto_resolved`, `reopened`, and eight categories, `garbage_dump`, `open_gutter`, `missed_collection`, `other`, `dead_animal`, `public_toilet`, `construction_debris`, `hazardous_waste`. The user app's `ComplaintStatus` type in `apps/citizen_app/src/types/index.ts` still has the original four, but its code already writes the new ones, so the type is behind the code. The admin panel's `src/types/index.ts` has the original four for both the status and the category. The admin panel's `NoticeTargetType` is `'van' | 'ward' | 'all' | 'citizens'` and the contract has only `'van' | 'ward' | 'all'`, so the panel's `'citizens'` maps onto the contract's `'all'`. The new four categories need labels in the user app's Gujarati and English localization files, and the user app has a `categoryCustomTitle` field for a custom label.

## Why

The user app already shipped the wider picker. Its `ComplaintStatus` type is the original four, so the compiler is being told a value the code writes does not exist. The admin panel cannot render a status or a category it has no type for, and it can send a `'citizens'` notice target the server rejects. Without this change the three apps disagree about the set of legal values, which is the exact failure class the contract exists to prevent.

## What breaks

| App | What breaks |
|---|---|
| userapp | Nothing at runtime. The type is narrow, so a status the code writes is a compile-time error, not a runtime break. A new category shows the raw key instead of a label until the gu and en files are updated |
| adminpanel | A complaint with a new status or category shows a blank chip where the label should be. A notice with `targetType: 'citizens'` is rejected by `publishNotice` with `invalidInput` |
| driverapp | Nothing. It reads `complaints.status` in the trip scope and never switches on the new values |

**The blank chip is the visible symptom.** The complaint reads fine, the data is right, the label is just missing, and it looks like the panel lost the record.

## Who is affected

| App | Affected? | What they must do | Blocked release? |
|---|---|---|---|
| driverapp | YES | Confirm its `complaints.status` display tolerates the three new values. Nothing to write today | No |
| userapp | YES | Widen `ComplaintStatus` to the seven values. Add the four category labels to the gu and en files | Yes, by 2026-11-15 |
| adminpanel | YES | Widen `ComplaintStatus` to seven and `ComplaintCategory` to eight. Map `'citizens'` onto `'all'` | Yes, by 2026-11-15 |

## Migration steps

1. userapp: widen the ComplaintStatus type to the seven contract values
2. adminpanel: widen the ComplaintStatus type to the seven contract values
3. adminpanel: widen the ComplaintCategory type to the eight contract values
4. Add the four new category labels to the user app's gu and en localization files
5. Map the admin panel's local notice target 'citizens' onto the contract's 'all'. Do not add a new enum value
6. Do NOT migrate the stored data. The original four statuses and four categories are still valid

**The order that works**: widen the types and add the labels first, then ship. The new enum values are additive, so the old data keeps working while the apps catch up.

**The order that breaks**: ship the wider picker before the labels. The four new categories render as raw keys, and the office reads `hazardous_waste` where a Gujarati label should be.

## The deprecation window

| Field | Meaning | Value |
|---|---|---|
| `oldFieldReadableUntil` | The last date the old field can be read | null |
| `oldFieldWritableUntil` | The last date the old field can be written. `null` means read-only | null |

**Both values are null because nothing is removed.** The original four statuses and four categories stay valid, so there is no deprecation window. Step 6 is the reason: the stored data is never migrated.

## Rollback

**Revert the type and label changes.** The new enum values are additive, so a client that does not know them simply cannot render them, and the stored data is untouched.

**What breaks if you do**: the panel goes back to blank chips for the new values, and the user app's compiler argues with code it already ships.

## The failure modes

| What you see | Why |
|---|---|
| A complaint shows a blank chip where the status should be | The panel's `ComplaintStatus` type excludes the value, so the label lookup returns nothing |
| A notice fails with `invalidInput` | The panel sent `targetType: 'citizens'`, which is not a contract value |
| A new category shows the raw key `hazardous_waste` | The gu and en localization files were not updated |
| The user app fails to compile on a status it writes | Its type has the original four and the code writes seven |

## Files changed

| File | What changed in it |
|---|---|
| `02-contracts/enums.json` | `complaint.status` to seven values, `complaint.category` to eight |
| `02-contracts/collections/complaint.schema.json` | The `status` and `category` `$ref`s resolve to the wider enums |
| `VERSION` | 1.0.0 → 2.0.0 |
| `06-changes/manifest.json` | The `CHG-0010` entry |

## See also

- [The frozen enums](../02-contracts/enums.json)
- [The complaint schema](../02-contracts/collections/complaint.schema.json)
- [CHG-0013, which uses the seven statuses](CHG-0013-one-admin-complaint-write.md)
- [The impact matrix](impact-matrix.md)
