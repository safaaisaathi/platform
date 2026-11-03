// missedCollectionAlert.ts
//
// When enough citizens in one ward report the same missed collection in one
// day, the ward's inspector hears about it once.
//
// The count is scoped to the IST day, not the phone's day: a report filed
// just before IST midnight belongs to that day, and the day key is the
// server's. The threshold is MISSED_REPORT_THRESHOLD reports of category
// missed_collection in one ward on one IST day.
//
// The push goes to topic `staff_{staffId}` for the ward's inspector, which is
// mapped in 02-contracts/topics.json. This is how the platform pushes to one
// staff member without a device registry.

import * as functions from 'firebase-functions/v1';

import { db, messaging } from '../lib/firebase';
import { istDayKey, istDayStart } from '../lib/time';
import { MISSED_REPORT_THRESHOLD } from '../generated/constants';

/** The category this alert is about, from the frozen enum. */
const CATEGORY_MISSED_COLLECTION = 'missed_collection';

// --- missedCollectionAlert --------------------------------------------------

export const missedCollectionAlert = functions.firestore
  .document('complaints/{complaintId}')
  .onCreate(async (snap) => {
    const data = snap.data();
    if (data === undefined) return null;
    if (data.category !== CATEGORY_MISSED_COLLECTION) return null;

    const wardId = data.wardId;
    if (typeof wardId !== 'string' || wardId.length === 0) return null;

    const dayKey = istDayKey();
    const dayStart = istDayStart(dayKey);

    // The query is covered by the complaints index (category, wardId,
    // createdAt) in 03-rules/firestore.indexes.json.
    const countSnap = await db
      .collection('complaints')
      .where('wardId', '==', wardId)
      .where('category', '==', CATEGORY_MISSED_COLLECTION)
      .where('createdAt', '>=', dayStart)
      .get();

    if (countSnap.size < MISSED_REPORT_THRESHOLD) return null;

    const wardSnap = await db.collection('wards').doc(wardId).get();
    if (!wardSnap.exists) return null;

    const ward: Record<string, unknown> = wardSnap.data() ?? {};
    const inspectorId = ward.inspectorId;
    if (typeof inspectorId !== 'string' || inspectorId.length === 0) return null;

    const wardName = typeof ward.name === 'string' && ward.name.length > 0 ? ward.name : wardId;

    // Topic `staff_{staffId}` is mapped in 02-contracts/topics.json.
    await messaging.send({
      topic: `staff_${inspectorId}`,
      notification: {
        title: '⚠️ Missed Collection Threshold Alert',
        body: `Ward ${wardName} has received ${countSnap.size} missed collection reports today. Immediate verification required.`,
      },
      data: {
        wardId,
        reportCount: String(countSnap.size),
        type: 'missed_collection_alert',
      },
    });

    return null;
  });
