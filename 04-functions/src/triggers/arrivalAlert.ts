// arrivalAlert.ts
//
// The core loop of the product: the van nears a ward, the citizens of that
// ward get one push.
//
// Four guards stand between a location write and that push, and every one of
// them must hold:
//
//   1. The van is `on_shift`. A van that is idle or offline never alerts.
//   2. The location is fresh. A ping older than STALE_LOCATION_SEC is not
//      trusted, so a phone that died at the ward edge cannot alert from a
//      position the van has left.
//   3. The geometry is measured from the ward BOUNDARY:
//      distance(van, ward.center) <= ward.radiusM + ARRIVAL_ALERT_RADIUS_M.
//      A flat radius from the center is the classic bug.
//   4. The ward is not already in trips.alertedWardIds. The 10-second
//      location cadence writes many times while the van sits in the radius,
//      so the bookkeeping is what turns that into exactly one push.
//
// The push goes to topic `ward_{wardId}` from 02-contracts/topics.json. The
// user app subscribes to its own ward's topic before the van arrives.

import * as functions from 'firebase-functions/v1';

import { db, messaging } from '../lib/firebase';
import { distanceMeters, isStale, type GeoPoint } from '../lib/time';
import { ARRIVAL_ALERT_RADIUS_M, STALE_LOCATION_SEC } from '../generated/constants';

// --- small shape helpers ----------------------------------------------------

/** A stored {lat, lng} as a point, or undefined when the shape is wrong. */
function asGeo(value: unknown): GeoPoint | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.lat !== 'number' || typeof record.lng !== 'number') return undefined;
  return { lat: record.lat, lng: record.lng };
}

/** The ward ids in a stored array, tolerant of an old or odd shape. */
function wardIdArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/** The ward ids already recorded in trips.wardsDone, which arrive as objects. */
function doneWardIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.wardId === 'string') ids.push(record.wardId);
  }
  return ids;
}

// --- arrivalAlert -----------------------------------------------------------

export const arrivalAlert = functions.firestore
  .document('vans/{vanId}')
  .onWrite(async (change, context) => {
    const after = change.after.data();
    if (after === undefined) return null;

    // Guard 1: only a van that is on shift can be arriving anywhere.
    if (after.status !== 'on_shift') return null;

    const lastLocation = asGeo(after.lastLocation);
    if (lastLocation === undefined) return null;

    // Guard 2: a stale ping never alerts.
    const locationRecord = after.lastLocation as Record<string, unknown>;
    if (isStale(locationRecord.updatedAt, STALE_LOCATION_SEC)) return null;

    const routeId = typeof after.routeId === 'string' && after.routeId.length > 0 ? after.routeId : undefined;
    const currentTripId =
      typeof after.currentTripId === 'string' && after.currentTripId.length > 0 ? after.currentTripId : undefined;
    if (routeId === undefined || currentTripId === undefined) return null;

    const [tripSnap, routeSnap] = await Promise.all([
      db.collection('trips').doc(currentTripId).get(),
      db.collection('routes').doc(routeId).get(),
    ]);
    if (!tripSnap.exists || !routeSnap.exists) return null;

    const trip: Record<string, unknown> = tripSnap.data() ?? {};
    const route: Record<string, unknown> = routeSnap.data() ?? {};

    const alerted = new Set(wardIdArray(trip.alertedWardIds));
    const done = new Set(doneWardIds(trip.wardsDone));
    const routeWardIds = wardIdArray(route.wardIds);

    const vanId = context.params.vanId;

    // Walk the route in visiting order. The first ward that is neither done
    // nor alerted and that the van is close enough to, is the one to alert.
    for (const wardId of routeWardIds) {
      if (done.has(wardId) || alerted.has(wardId)) continue;

      const wardSnap = await db.collection('wards').doc(wardId).get();
      if (!wardSnap.exists) continue;

      const ward: Record<string, unknown> = wardSnap.data() ?? {};
      const center = asGeo(ward.center);
      const radiusM = typeof ward.radiusM === 'number' ? ward.radiusM : undefined;
      if (center === undefined || radiusM === undefined) continue;

      // Guard 3: measure from the ward boundary, not the centre.
      if (distanceMeters(lastLocation, center) > radiusM + ARRIVAL_ALERT_RADIUS_M) continue;

      const tripRef = tripSnap.ref;

      // Guard 4: append the ward once, inside a transaction, so two Function
      // instances racing the same location write cannot both alert. An HTTP
      // send cannot literally run inside a Firestore transaction, so the send
      // is gated on winning this append.
      const appended = await db.runTransaction(async (tx) => {
        const txSnap = await tx.get(tripRef);
        if (!txSnap.exists) return false;
        const txTrip: Record<string, unknown> = txSnap.data() ?? {};
        const txAlerted = wardIdArray(txTrip.alertedWardIds);
        if (txAlerted.includes(wardId)) return false;
        tx.update(tripRef, { alertedWardIds: [...txAlerted, wardId] });
        return true;
      });
      if (!appended) break;

      // Topic `ward_{wardId}` is mapped in 02-contracts/topics.json.
      await messaging.send({
        topic: `ward_${wardId}`,
        notification: {
          title: '🌱 સફાઈ વાન નજીક છે / Sanitation Van Arriving',
          body: 'સફાઈ વાન તમારા વિસ્તારમાં પહોંચી રહી છે. કચરો તૈયાર રાખો.\nThe sanitation van is arriving in your area. Please keep your waste ready.',
        },
        data: {
          wardId,
          vanId,
          type: 'arrival_alert',
        },
      });
      break;
    }

    return null;
  });
