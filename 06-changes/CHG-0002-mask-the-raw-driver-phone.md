# CHG-0002: Mask the raw driver phone and move it behind the staff wall

**Severity**: S1 (Breaking) | **Priority**: P1 | **Version**: 1.0.0 → 2.0.0
**Date**: 2026-11-01 | **Author**: platform-owner | **Decides**: ADR-0005

## What changed

| Before | After |
|---|---|
| `drivers.phone` holds the raw phone | `drivers.phoneMasked` holds `98XXXXXX10` |
| Nothing else holds it | `staffPhones/{code}` holds the raw phone |
| The driver app's read rule is collection-scoped | The driver app's read rule is **field-restricted** |

The mask is applied **at the source**, by the `upsertDriver` callable, not by the reader. The admin panel sends the raw phone, the callable masks it, and the raw value goes to `staffPhones`.

## Why

**The phone number is the only secret the driver identity has.** The badge code is public by design. PRD section 0.16 says so explicitly. So the phone needs the tightest possible read scope, and the driver app does not need it at all. The driver app shows the mask to confirm *"this is my record"*.

**The leak is proven, not theoretical.** A 17-probe emulator test showed that a signed-in caller could read every driver's phone number. The current rules are `allow read: if request.auth != null` on the `drivers` collection.

**And the fix is not a field-level rule.** A Firestore `get` returns the **whole document**. Rules do not redact fields. So even a perfectly written field-restricted rule on `drivers` would return the raw phone, because it lives on the same document. **The only way to keep it out of the driver's read path is a separate collection with a separate rule.** That is why `staffPhones` exists.

## What breaks

| App | What breaks |
|---|---|
| driverapp | Any code reading `drivers.phone` gets nothing. The confirm card's phone line goes blank |
| adminpanel | Any code reading `drivers.phone` gets the **masked** value. The raw phone is now at `staffPhones/{code}` |
| userapp | Nothing. It never reads the driver phone |

**The visible symptom of a partial migration.** The driver app's confirm card shows an empty phone line, and the admin panel shows `98XXXXXX10` where it expected the full number. Neither is a crash. Both look like "the data is missing".

## Who is affected

| App | Affected? | What they must do | Blocked release? |
|---|---|---|---|
| driverapp | YES | Read `drivers.phoneMasked`. Show the mask on the confirm card | Yes, at the deadline |
| userapp | NO | Never reads the driver phone | No |
| adminpanel | YES | Read `drivers.phoneMasked` for display. Read `staffPhones/{code}` for the raw number | Yes, at the deadline |

## Migration steps

**The order is the design. Data first, rules second.**

| # | Step | Why here |
|---|---|---|
| 1 | Backfill. Copy `drivers.phone` into `drivers.phoneMasked` using the `PHONE_MASK_FORMAT` shape `98XXXXXX10` | The old field is still readable, so nothing breaks yet |
| 2 | Backfill. Copy the raw value into `staffPhones/{code}` with `updatedAt` and `updatedBy` | Same |
| 3 | Update the admin panel to read `drivers.phoneMasked` and `staffPhones.phone` | The admin panel is the only consumer of the raw value |
| 4 | Update the driver app to read `drivers.phoneMasked` | |
| 5 | Deploy the `upsertDriver` callable that masks on write | New writes are masked from now on |
| 6 | **Deploy the new rules LAST** | The old rules keep the old clients working until this exact moment |

**The order that breaks.** Deploy the rules first. Every driver app read of `drivers.phone` returns nothing, and the confirm card's phone line goes blank, and nobody knows whether the data was lost or the rule changed.

## The deprecation window

| Field | Meaning | Value |
|---|---|---|
| `oldFieldReadableUntil` | The last date `drivers.phone` can be read | 2026-11-15 |
| `oldFieldWritableUntil` | The last date `drivers.phone` can be written | 2026-11-15 |

**Inside the window**, both fields are present on the document. The callable writes the masked one. The backfill keeps the raw one fresh for the apps that have not migrated yet.

**The field is never removed in the same release that stops writing it.**

## Rollback

**The data rollback is easy.** The raw values are still in `staffPhones`. Copy them back into `drivers.phone`.

**The rules rollback is easy.** Redeploy the old rules.

**The client rollback is the real one.** If the driver app has shipped reading `phoneMasked` and you roll the rules back, the field-restricted read no longer applies, and the old clients reading `drivers.phone` work again. **The driver app does not break on a rules rollback, because it reads the masked field which is still there.** That is the payoff of the data-first order.

## The failure modes

| Failure | What the user sees | What the log says |
|---|---|---|
| The driver app was not migrated | The confirm card's phone line is blank | No error. The field simply is not there |
| The admin panel was not migrated | The driver list shows `98XXXXXX10` instead of the number | No error. The masked field is what it asked for |
| The rules deployed before the backfill | The confirm card's phone line is blank, and the admin panel cannot find `staffPhones` | `PERMISSION_DENIED` on the `staffPhones` read |
| The backfill ran but the mask format was wrong | The confirm card's phone line has an odd length, or wraps | The pattern check in `validate-contract.ts` fails on the sample document |

## Files changed

| File | What changed in it |
|---|---|
| `02-contracts/collections/driver.schema.json` | `phone` → `phoneMasked`, with the mask pattern |
| `02-contracts/collections/staffPhone.schema.json` | Created |
| `02-contracts/constants.json` | `PHONE_MASK_FORMAT` |
| `02-contracts/callables.json` | `upsertDriver` masks on write |
| `VERSION` | 1.0.0 → 2.0.0 |
| `06-changes/manifest.json` | The `CHG-0002` entry |

## See also

- [ADR-0005](../05-decisions/0005-masked-phone-only.md)
- [The driver schema](../02-contracts/collections/driver.schema.json)
- [The staff phone schema](../02-contracts/collections/staffPhone.schema.json)
- [Making a contract change](../07-guides/making-a-contract-change.md)
