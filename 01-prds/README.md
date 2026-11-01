---
id: prds-readme
title: The PRD Folder
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: harness
see_also:
  - ./PRD-0-platform.md
  - ../06-changes/templates/contract-request.md
---

# The PRD Folder

**One PRD per product, plus one for the platform itself.**

**Each PRD has exactly one canonical copy.** It lives in the repo of the team that owns it. The file in this folder is a **pointer**, except for `PRD-0-platform.md`, which is canonical here.

## The files

| File | Canonical home | This file is |
|---|---|---|
| `PRD-0-platform.md` | **Here** | Canonical |
| `PRD-1-user-app.md` | `safaaisaathi/userapp` | A pointer |
| `PRD-2-driver-app.md` | `safaaisaathi/driverapp` | A pointer |
| `PRD-3-admin-panel.md` | `safaaisaathi/adminpanel` | A pointer |

## Why pointers and not copies

| Pointer | Copy |
|---|---|
| One original, always fresh | Two versions. Which one is real is a question |
| Edit the original, bump the `pin` here | Edit both, they go out of sync |
| The link opens the exact original | The reader cannot tell which copy is stale |

**The cost.** The reader takes two clicks. **That is cheaper than reading the wrong copy.**

## The pointer format

Every pointer has this frontmatter. **The `contractRefs` block is the important part.**

```yaml
---
id: prd-2-driver-app
title: Driver App PRD
type: pointer
owner: driverapp-team

canonical_repo: safaaisaathi/driverapp
canonical_path: docs/PRD-2-driver-app.md
canonical_url: https://github.com/safaaisaathi/driverapp/blob/main/docs/PRD-2-driver-app.md
pin: v1.4.0
sourceHash: sha256:9f2c1a...

contractRefs:
  collections: [vans, trips, routes, wards, drivers]
  fields: [trips.endedAt, trips.startedAt, vans.lastLocation, vans.status]
  enums: [van.status, ward.type]

audience: both
---
```

### What `contractRefs` does

**It makes the pointer machine-checkable.** The CI runs `08-tools/check-consistency.ts`, which reads every PRD's `contractRefs` block and checks that every collection, field and enum listed there **still exists in the schema**.

| A PRD says | The schema has | CI |
|---|---|---|
| `trips.endedAt` | Yes | Pass |
| `trips.shiftEnd` | No | **Fail. "The PRD references a field that does not exist"** |

**So a stale PRD is detected the moment it goes stale.** That is the whole point of the reference block. Without it, a PRD can name a field that was renamed six months ago and nobody notices until a builder follows it.

**The `contractRefs` block is the contract request, in machine form.** When the contract changes, the PRD pointers are updated in the same PR. If a field is renamed, the PRD pointer that named the old field fails CI until it is updated.

## The rule

**A PRD is a product spec. The contract is the technical shape.** When they disagree, the contract wins for the shape and the PRD wins for the intent. **If the PRD describes a field that does not exist, that is a contract request, not a licence to invent the field.**

## The three PRDs and their owners

| PRD | Owner | The app |
|---|---|---|
| `PRD-1-user-app.md` | The user app team | The citizen app |
| `PRD-2-driver-app.md` | The driver app team | The driver app. It already exists and is frozen |
| `PRD-3-admin-panel.md` | The admin panel team | The office tool |

**The platform does not own the product spec of an app.** It owns the contract between them.
