// firebase.ts
//
// The ONE place the Admin SDK is initialised.
//
// Every module imports `db`, `auth` and `messaging` from here, never from
// firebase-admin directly. If two modules each called initializeApp, the
// second call would throw "The default Firebase app already exists" at import
// time, and the error would point at a module that looks innocent.
//
// The Admin SDK bypasses every Firestore rule. That is exactly why it lives
// here and nowhere else. No client app may import this file. The platform
// boundary says the Admin SDK never ships to a phone.

import { initializeApp, getApps } from 'firebase-admin/app';
import {
  getFirestore,
  FieldValue,
  Timestamp,
  GeoPoint,
  type Firestore,
} from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';

if (getApps().length === 0) {
  initializeApp();
}

export const db: Firestore = getFirestore();
export const auth: Auth = getAuth();
export const messaging: Messaging = getMessaging();

export { FieldValue, Timestamp, GeoPoint };

/** The server clock, as a Firestore timestamp. */
export function serverNow(): FieldValue {
  return FieldValue.serverTimestamp();
}
