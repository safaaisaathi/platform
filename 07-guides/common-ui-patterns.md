---
id: common-ui-patterns
title: Common UI Patterns and Where They Live
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: harness
see_also:
  - ../02-contracts/design-tokens.json
  - ../02-contracts/errors.json
  - ./adopting-a-change.md
---

# Common UI Patterns and Where They Live

**Repeated UI patterns, and the one place each belongs. Shared things come from the contract by name. App things stay in the app.**

This guide runs in an app repo (`driverapp`, `userapp` or `adminpanel`). Its report block is the app block in section 7.

## 1. Authority order

1. The contract (`02-contracts/`) wins over every PRD and over every app repo. Token NAMES are contract. Token VALUES are defaults the app may theme, but never rename.
2. `../02-contracts/design-tokens.json` `x-rule` is the law: colors ONLY via the token, spacing ONLY via the token, radius ONLY via the token. A raw hex or a numeric padding literal in a screen is a bug.
3. `../02-contracts/errors.json` owns the code-to-copy mapping. The server sends a code. The app owns the words.
4. `../02-contracts/design-tokens.json` `x-app-accessibility` splits the sizes: the driver app uses driver sizes everywhere, the user app uses user sizes. Never mix them.
5. Layout, navigation and screen composition are app decisions. The contract never specifies a screen.

## 2. Hard constraints

| # | Constraint |
|---|---|
| 1 | ALWAYS show status as colour PLUS icon PLUS label. Never colour alone. `statusReceived`, `statusAssigned`, `statusResolved`, `statusEscalated` carry notes to this effect |
| 2 | NEVER write a raw hex, a raw spacing number or a raw radius in a screen. Use the token name from `../02-contracts/design-tokens.json` |
| 3 | NEVER reuse a status colour for a different status. `statusEscalated` (`#D93025`) is also the error family. Validation failures use it, success never does |
| 4 | ALWAYS map reason codes to copy keys, never to English strings. The keys are the `appCopyKey` values in `../02-contracts/errors.json` |
| 5 | NEVER show a raw exception, a stack trace or a raw error code to a user. `errors.json` `x-rules` |
| 6 | ALWAYS use `Noto Sans` with the `Noto Sans Gujarati` fallback. The admin panel needs the Gujarati face if it renders notice text a driver will read |
| 7 | Tap targets: user app at least `minTapTargetDp` = 56, driver app at least `minTapTargetDriverDp` = 64. Body text at least `minBodyTextSp` = 14 |
| 8 | Display a masked phone exactly in the `PHONE_MASK_FORMAT` shape `98XXXXXX10`. A different length breaks the confirm card's layout |
| 9 | Display a ticket id in the `TICKET_ID_PATTERN` shape `PMH-YYYYMMDD-NNNN`. It is the citizen's reference in every support conversation |
| 10 | NEVER put UI state (filters, sort, column layout) in the contract or in Firestore. It is local to the app |

## 3. Read budget

| Your task | Read exactly these | Do not read |
|---|---|---|
| Build or restyle a screen | `../02-contracts/design-tokens.json`, this file's pattern table | `../09-reference/` |
| Show a server error | `../02-contracts/errors.json` | `../02-contracts/callables.json` |
| Show a status pill | `../02-contracts/enums.json` (`complaint.status`), `../02-contracts/design-tokens.json` (color group) | The schemas |
| Show a driver's phone | `../02-contracts/collections/driver.schema.json` (`phoneMasked`), `../02-contracts/constants.json` (`PHONE_MASK_FORMAT`) | `staffPhones` schema, the app must never read it |
| Show "last seen" | `../02-contracts/constants.json` (`STALE_LOCATION_SEC`) | The Functions source |
| Show a notice with a read dot | `../02-contracts/collections/noticeReceipt.schema.json` | The notice schemas for other apps |

## 4. Procedure

### 4.1 The pattern catalog

| Pattern | Lives where | Shared or per-app | Source of truth |
|---|---|---|---|
| Status pill (received, assigned, resolved, escalated) | Each app's widget library | Shared tokens, per-app implementation | `enums.json` values, `design-tokens.json` `status*` colours |
| Reason-code error card | Each app's error surface | Shared vocabulary, per-app copy | `errors.json` `appCopyKey` values |
| Offline banner | Each app | Per-app | `errors.json` `offline` code, `appPhase: offline` |
| Masked phone confirm card | driverapp only | Per-app | `PHONE_MASK_FORMAT` `98XXXXXX10` |
| Ticket id chip | userapp, adminpanel | Shared format | `TICKET_ID_PATTERN` |
| Ward name in English and Gujarati | driverapp, userapp, adminpanel | Shared data, per-app layout | `wards.name`, `wards.nameGu` |
| Map pin with "last seen X min ago" | userapp, adminpanel | Shared threshold, per-app rendering | `STALE_LOCATION_SEC` |
| Notice card with unread dot | driverapp | Per-app | `notices/{id}/receipts` `readAt` |
| Empty / loading / error triad | Every list screen | Per-app | App pattern, no contract entry |
| Shift conflict resolution card | driverapp | Per-app, distinct phase | `errors.json` `appPhase: startConflict`, never the generic error path |
| Live van list | adminpanel | Per-app | `vans.status` enum, `OFFLINE_THRESHOLD_MIN` |
| Rate-limit notice | userapp, driverapp | Shared code, per-app copy | `errors.json` `rateLimited`, `retryAfterSec: 600` |

### 4.2 Where shared things live, concretely

| What | Flutter apps | Admin panel |
|---|---|---|
| Colour tokens | `ThemeData` color scheme entries named after the token | CSS variables named after the token |
| Spacing and radius | Theme constants derived from `spacing.unit` = 8 dp and `radius.md` = 12 dp | CSS variables |
| Font | `fontFamily: Noto Sans`, `fontFamilyFallback: [Noto Sans Gujarati]` | `font-family: "Noto Sans", "Noto Sans Gujarati"` |
| Reason-code copy | One map file, keys = `appCopyKey`, values = arb entries | One module, keys = `appCopyKey` |
| Localized strings | Arb files | The panel's i18n files |
| Tap targets | Driver theme 64 dp, user theme 56 dp | Web focus styles, 56 dp equivalent |

One map file per app for the code-to-copy table. Two apps mapping codes inline in widgets is how `vanHeldByAnotherDriver` ends up with two different words.

### 4.3 The conflict cards are not error cards

`vanHeldByAnotherDriver`, `vanAlreadyClaimed` and `staleMarker` are conflicts, not failures. `errors.json` `x-rules` `conflictIsNotError`: they route to the `startConflict` phase, with their own copy and their own call to act, including `offerDifferentDriver`. Routing them through the generic error path loses the recovery action.

### 4.4 Adding a new shared pattern

1. Check the catalog above. If it exists, use it. Do not fork it.
2. If it needs a new token name, that is a contract change: `./making-a-contract-change.md`, A2 against `../02-contracts/design-tokens.json`, PATCH bump.
3. If it needs a new copy key, that is an `errors.json` change with its own entry.
4. If it is app-local, keep it in the app. Do not promote a screen detail to a token.

## 5. Do NOT

| Do NOT | Why |
|---|---|
| Do not copy a colour value from another app's source | Copy the token name from `design-tokens.json`. Values may theme, names may not drift |
| Do not put server wording in the payload | The server sends codes. Three apps need three wordings |
| Do not show the raw `HttpsError` code | The user sees the mapped copy. The log sees the rest |
| Do not mix driver sizes into the user app | `minTapTargetDriverDp` = 64 exists because the driver wears gloves on a moving van |
| Do not read `staffPhones` from a client app | Admin-only. The raw phone must never reach a client read path |
| Do not invent a status colour | Four statuses, four tokens. A fifth means a contract change first |

## 6. Self-verification

```bash
flutter analyze
# expected: No issues found!
flutter test
# expected: All tests passed!
grep -c "status" 02-contracts/design-tokens.json
# expected: at least 4 (statusReceived, statusAssigned, statusResolved, statusEscalated)
```

For `adminpanel`, substitute `npm run lint` and `npx tsc --noEmit` for the analyze and test steps.

Verify no raw hex leaked into screens (Flutter apps):

```bash
grep -rn "Color(0xFF" lib/ --include="*.dart" | grep -v theme | grep -v tokens
# expected: no output, exit code 1
```

Verify this guide's tables:

```bash
python3 - <<'PY'
import re
doc="07-guides/common-ui-patterns.md"
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

Expected: `07-guides/common-ui-patterns.md: TABLES=5 MALFORMED=0`. Any `BAD` line is a failure.

## 7. Report format

This is an app-repo guide. End with the app block:

```
CONTRACT VERSION: <version>
CONTRACT DRIFT: none | <field: old -> new>
FILES CHANGED: <paths>
VERIFICATION: analyze <pass/fail> | test <pass/fail> | adoption <pass/fail>
CONTRACT CHANGE NEEDED: none | <proposed CHG id + one line>
```

`CONTRACT CHANGE NEEDED` carries a proposal when the work needed a token name or a copy key that does not exist yet, for example `CHG-0009: design-tokens.json needs statusDeferred colour for the new staff view`.
