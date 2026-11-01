---
id: glossary
title: Safai Saathi Glossary
status: frozen
owner: platform-owner
updated: 2026-11-01
contractVersion: "1.0.0"
audience: both
see_also:
  - ./product-overview.md
  - ../09-reference/issue-register.md
---

# Glossary

**The words all three teams use.** If a term is not here and you are about to use it in code, add it.

**Each entry gives the meaning and the word to avoid.** The "avoid" line matters more than it looks. It is how the three apps end up saying the same thing about the same thing.

## The domain

**Ward**
A mapped area the van serves. A centre point plus a radius. The citizen's geography.
_Avoid_: zone, area, sector

**Route**
The ordered list of wards a van visits in a shift. `routes/{id}.wardIds` is the visiting order.
_Avoid_: schedule, path, journey

**Van**
The garbage collection vehicle. Carries one tracked phone. Serves one route.
_Avoid_: truck, vehicle, lorry

**Driver**
The person borrowing the van's phone. **Not** the same thing as the van.
_Avoid_: operator, driver-vehicle (as one word)

**Driver code**
A badge like `AB-1001`. The doc id of `drivers/{CODE}`. **A public identifier, not a secret.**
_Avoid_: PIN, password, credential

**Shift**
The driver's working session, from Start Shift to End Shift.
_Avoid_: session, duty, roster

**Trip**
The log record of one shift. The van's trail, the wards done, and the alert history.
_Avoid_: journey, ride, run

**Mark Ward Done**
The driver's action that records a ward as collected during the current trip. Marks may be made out of order, any undone ward and not only the next one.
_Avoid_: tick, check-in, complete

**Next Ward**
The first ward in the route's visiting order that today's trip has not recorded done. The live route screen highlights it.
_Avoid_: current ward, target ward, upcoming

**Flagged**
A Mark Ward Done made from outside that ward's radius. Kept for admin review.
_Avoid_: suspicious, invalid, rejected

**Notice**
A one-way message from the office to a van, to a ward, or to everyone.
_Avoid_: announcement, alert, bulletin

**Pending Report**
A missed-collection complaint for today's route wards that awaits driver action.
_Avoid_: backlog, open ticket, queue

**Complaint**
The citizen's report of a problem. The busiest collection.
_Avoid_: ticket, issue, request

**Ticket id**
The human id of a complaint. Format `PMH-YYYYMMDD-NNNN`.
_Avoid_: complaint id, case number

**Escalation level**
0 is the inspector, 1 is the chief officer or TDO, 2 is the DDO.
_Avoid_: priority, severity, tier (those mean different things here)

**Depot**
An admin-set tag on the van. 3 hours of dwell inside it auto-ends the shift.
_Avoid_: garage, yard, base

**Depot dwell (auto-end)**
The rule that ends a shift by itself when the van stays inside 500 m of its depot for 3 hours non-stop. Leaving the radius or moving 100 m restarts the clock.
_Avoid_: parking timeout, idle shift

**Arrival alert**
The push to a citizen when the van nears their ward.
_Avoid_: proximity notification, geofence alert

**The merge**
Two complaints at the same spot become one. `mergedInto` points at the survivor.
_Avoid_: dedupe, de-duplication

## The technical

**The rules**
`firestore.rules`. The server-side authorization. **The security boundary.**
_Avoid_: permissions, ACL

**The contract**
`02-contracts/`. The machine-readable shape of the data and the vocabulary.
_Avoid_: schema (only the collection schemas), spec

**A claim**
A field baked into a token by the server. `vanId`, `driverId`, `role`, `staffId`.
_Avoid_: permission, role (a role is a specific claim's value)

**A custom token**
A token the server mints and the client signs in with. It carries custom claims.
_Avoid_: session token, JWT (it is one, but the word people use is custom token)

**The callable**
An HTTPS endpoint the client calls, which runs server-side code. `https.onCall`.
_Avoid_: API endpoint, REST endpoint

**The trigger**
A Function that fires on a document write. `firestore.onDocumentUpdated`.
_Avoid_: webhook, event handler

**The scheduler**
A Function that runs on a timer.
_Avoid_: cron job, scheduled task

**The Admin SDK**
The server-side Firebase library. It **bypasses the rules entirely.**
_Avoid_: backend SDK, server SDK (both true but less specific)

**App Check / Play Integrity**
Firebase's proof that the caller is the real signed app.
_Avoid_: attestation, device check

**Composite index**
A Firestore index on multiple fields.
_Avoid_: compound index, multi-field index

**Multi-branch index**
The special index an `OR` query with 2 or more field-equality branches needs.
_Avoid_: OR index

**Server timestamp**
`FieldValue.serverTimestamp()`. The server's clock.
_Avoid_: now, current time

**The emulator**
A local Firebase. **Does not enforce composite indexes.**
_Avoid_: local server, mock server

**A transaction**
A read-modify-write that is atomic. The only way to make "read then write" safe.
_Avoid_: lock, atomic write

**A seam**
Where an interface lives. A point where behaviour can change without editing in that place.
_Avoid_: hook, layer

## The process

**A ruling**
A product decision that resolves a contract contradiction. Recorded in the PRD, not just in the code.
_Avoid_: decision, ruling decision

**An ADR**
An Architecture Decision Record. One decision, its context, its consequences. In `05-decisions/`.
_Avoid_: design doc, RFC

**The change log**
`06-changes/`. Every contract change, who it affects, and whether they have caught up.
_Avoid_: changelog (that is the human-readable view of it)

**Adoption**
The state where an app has implemented a published change. Measured as done checklist items over total.
_Avoid_: completion, done-ness

**S0 to S4**
The severity of a change. S0 is emergency, S1 is breaking, S2 is new capability, S3 is additive, S4 is internal.
_Avoid_: priority (that is P0 to P4, a different axis)

**P0 to P4**
The priority of a change. Severity plus impact.
_Avoid_: severity (that is S0 to S4, a different axis)

**CHG-nnn**
A core contract change. Written by the platform owner. Affects the contract version.
_Avoid_: ticket, issue, PR

**EXT-nnn**
An app-owned extension change. Written by the app owner. Does not affect the contract version.
_Avoid_: ticket, issue, PR

## The words to be careful with

| Word | Means | Does not mean |
|---|---|---|
| **Scope** | The set of documents a caller may touch, decided by a claim or a live doc | The screen's visible area |
| **Privilege** | A claim that grants authority and therefore goes stale | Any claim. The `routeId` claim is not a privilege |
| **Live document** | A document whose current value is the authority | Any document |
| **Vendored** | A copy of the contract in an app repo, with a hash proving it is current | A fork. It is regenerated, never edited |
| **Reserved** | A field name in the core schema that an extension may not reuse | A keyword |
