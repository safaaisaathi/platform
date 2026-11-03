// vanOfflineWatch.ts
//
// A van stopped reporting. Mark it offline.
//
// The user app shows a van only while its status is on_shift, so flipping a
// silent van to offline is how it disappears from the citizen's map. The
// server clock decides: a van whose lastLocation.updatedAt is older than
// OFFLINE_THRESHOLD_MIN minutes, and whose status is on_shift, becomes
// offline.
//
// A van with no lastLocation at all is left alone here. There is nothing to
// age, and the shift's own end is what clears it.

import * as functions from 'firebase-functions/v1';

import { db } from '../lib/firebase';
import { isStale } from '../lib/time';
import { OFFLINE_THRESHOLD_MIN } from '../generated/constants';

/** OFFLINE_THRESHOLD_MIN is in minutes; isStale takes seconds. */
const OFFLINE_THRESHOLD_SEC = OFFLINE_THRESHOLD_MIN * 60;

/** The van statuses this sweep reads and writes, from the frozen enum. */
const STATUS_ON_SHIFT = 'on_shift';
const STATUS_OFFLINE = 'offline';

// --- vanOfflineWatch --------------------------------------------------------

export const vanOfflineWatch = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    const activeVans = await db.collection('vans').where('status', '==', STATUS_ON_SHIFT).get();

    for (const doc of activeVans.docs) {
      const data: Record<string, unknown> = doc.data() ?? {};

      const lastLocation = data.lastLocation;
      if (typeof lastLocation !== 'object' || lastLocation === null || Array.isArray(lastLocation)) continue;

      const updatedAt = (lastLocation as Record<string, unknown>).updatedAt;
      if (updatedAt === undefined || updatedAt === null) continue;

      if (!isStale(updatedAt, OFFLINE_THRESHOLD_SEC)) continue;

      await doc.ref.update({ status: STATUS_OFFLINE });
    }

    return null;
  });
