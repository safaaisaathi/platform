# CHG-0005: Shard the GPS trail into a trail subcollection

**Severity**: S1 (Breaking) | **Priority**: P1 | **Version**: 1.0.0 → 2.0.0
**Date**: 2026-11-01 | **Author**: platform-owner | **Decides**: none

## What changed

The trip's GPS trail stops being one array on the trip document and becomes a set of chunk documents under a subcollection.

| Before | After |
|---|---|
| `trips/{id}.gpsTrail` is one array | `trips/{id}/trail/{n}` is a set of documents |
| Unbounded. Hits the 1 MiB document cap | Each chunk holds at most 1000 points |
| One write grows one document forever | Each chunk is written once and never grows |

**The chunk shape.** `points[]` (at most 1000), `from` (the index of the first point in the full trail), `to` (the index after the last one).

## Why

**A Firestore document is capped at 1 MiB.** A point is roughly 40 bytes of JSON, so a single trip document holds somewhere around 20,000 to 25,000 points. At one point every 10 seconds, that is roughly 55 hours of continuous tracking.

**The driver works an 8-hour shift and the document is fine.** The problem is the historical data, and the recovery paths. A driver who works two shifts on the same phone, a van that was never properly ended, a long trip that got retried. **The failure is not "one shift is too long". It is "the write starts failing and nobody knows why", and the symptom is a trail with a hole in it.**

**And a rejected write loses the whole document's write, not just the new point.** The entire trail update is rejected. So one oversized trip means **the trail stops recording entirely**, and the office has no way to see where the van actually went.

## What breaks

| App | What breaks |
|---|---|
| driverapp | The tracking engine's write changes shape. The trail read changes shape. Any code touching `gpsTrail` breaks |
| adminpanel | The trail read changes shape. The admin panel's trip detail view breaks |
| userapp | Nothing. It never reads the trail |

## Who is affected

| App | Affected? | What they must do | Blocked release? |
|---|---|---|---|
| driverapp | YES | Write chunks. Read chunks in index order. Stop writing `trips.gpsTrail` | Yes, at the deadline |
| userapp | NO | Never reads the trail | No |
| adminpanel | YES | Read chunks in index order | Yes, at the deadline |

## Migration steps

| # | Step | Why here |
|---|---|---|
| 1 | Add the chunk write to the driver app's tracking engine. Chunk at 1000 points | New data is correct from the start |
| 2 | Add the chunk read. Concatenate the chunks in `from` order | The read has to handle both shapes during the window |
| 3 | Update the admin panel's trail read | |
| 4 | Keep writing `trips.gpsTrail` for now, alongside the chunks | Both shapes are present during the window |
| 5 | Stop writing `trips.gpsTrail` | The old field becomes read-only |
| 6 | Drop `trips.gpsTrail` from the schema | The MAJOR bump lands here |

**Why write both during the window.** A driver app that has the new write but an old read shows a partial trail. A driver app that has the new read but an old write shows a partial trail too. **Writing both and reading both is the only shape where no one sees a gap.**

## The deprecation window

| Field | Meaning | Value |
|---|---|---|
| `oldFieldReadableUntil` | The last date `trips.gpsTrail` can be read | 2026-11-15 |
| `oldFieldWritableUntil` | The last date `trips.gpsTrail` can be written | 2026-11-15 |

**Inside the window**, both shapes are written and both are read.

**The field is never removed in the same release that stops writing it.**

## Rollback

**Stop writing the chunks and go back to `gpsTrail`.** The data written to the chunks is still there, so a rollback loses nothing as long as the app also reads both.

**A rollback after step 6 is harder.** The schema no longer has the field, so the old write is rejected by validation. **The window exists so this rollback is never needed.**

## The failure modes

| Failure | What the user sees | What the log says |
|---|---|---|
| A chunk exceeds 1000 points | The write is rejected and the trail stops | The validation error on the chunk |
| The chunks are read in the wrong order | The trail is a zigzag across the map. Obviously wrong to a human looking at it | Nothing. The data is valid, just ordered wrong |
| The app writes chunks but not `gpsTrail`, and the read is old | The trail is empty for trips during the window | Nothing. The read looked in the wrong place |
| The parent `trips` doc is deleted but the chunks are not | Orphan chunks. The trail is gone but the storage is not | A cleanup job, if one exists |

**The ordering bug is the sneaky one.** The data is valid and the read is correct code. It just concatenates in the wrong order. **Always sort by `from`, never by document id.**

## Files changed

| File | What changed in it |
|---|---|
| `02-contracts/collections/trailChunk.schema.json` | Created. The `points` maxItems is 1000 |
| `02-contracts/collections/trip.schema.json` | `gpsTrail` marked as the legacy shape |
| `02-contracts/collections/README.md` | The subcollection row |
| `VERSION` | 1.0.0 → 2.0.0 |
| `06-changes/manifest.json` | The `CHG-0005` entry |

## See also

- [The trail chunk schema](../02-contracts/collections/trailChunk.schema.json)
- [The trip schema](../02-contracts/collections/trip.schema.json)
- [The collection table](../02-contracts/collections/README.md)
