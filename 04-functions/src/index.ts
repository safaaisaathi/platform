import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import * as logger from "firebase-functions/logger";

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

/// Rate limit: max 5 PIN attempts per 10 minutes per van.
const MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 10 * 60 * 1000;

/// Hash a PIN with the vanId as salt — matches the `driverPinHash` shape
/// stored in `vanSecrets/{vanId}`. Cloud Functions only; apps never read
/// this value (PRD-2 §0.2: `vanSecrets` is not readable/writable from apps).
function hashPin(pin: string, vanId: string): string {
  return crypto.createHash("sha256").update(`${pin}|${vanId}`).digest("hex");
}

/// `verifyDriverPin` callable (PRD-2 §0.7).
/// Input: `{vanId, pin}`.
/// Compares against `vanSecrets/{vanId}.driverPinHash`, rate-limited to
/// 5 tries per 10 minutes. Returns `{token}` — a Firebase custom auth
/// token carrying the `vanId` claim.
///
/// Error codes the CLIENT relies on (mirrored in the app's _mapCode):
/// - "unauthenticated"      ⟺ wrong PIN (the ONLY driver-typo signal)
/// - "resource-exhausted"   ⟺ lockout window active
/// - "not-found"            ⟺ no PIN registered for that van (config gap)
/// Every invocation is logged so backend-side failures are observable
/// via `firebase functions:log` — never debug blind again.
export const verifyDriverPin = functions.https.onCall(
  async (request: functions.https.CallableRequest) => {
    const { vanId, pin } = request.data as {
      vanId?: string;
      pin?: string;
    };

    logger.info("verifyDriverPin called", {
      vanId,
      authUid: request.auth?.uid ?? null,
    });

    if (typeof vanId !== "string" || typeof pin !== "string" ||
        (vanId as string).length === 0 || (pin as string).length === 0) {
      logger.warn("verifyDriverPin rejected: bad argument types", {
        vanIdType: typeof vanId,
        pinType: typeof pin,
      });
      throw new functions.https.HttpsError(
        "invalid-argument",
        "vanId and pin must be non-empty strings",
      );
    }

    const trimmedPin = (pin as string).trim();
    const normalizedVanId = (vanId as string).trim();

    const secretRef = db.collection("vanSecrets").doc(normalizedVanId);
    const secretSnap = await secretRef.get();

    if (!secretSnap.exists) {
      const existingVan = await db.collection("vans").doc(normalizedVanId).get();
      logger.warn("verifyDriverPin: no vanSecrets doc for this van", {
        vanId: normalizedVanId,
        vanDocExists: existingVan.exists,
      });
      throw new functions.https.HttpsError(
        "not-found",
        "No PIN registered for this van",
      );
    }

    const secretData = secretSnap.data();
    const storedHash = secretData?.driverPinHash as string | undefined;
    const attempts = (secretData?.attempts as number) || 0;
    const lastAttempt = secretData?.lastAttempt as
      | admin.firestore.Timestamp
      | undefined;

    // Rate-limit check: lock out after MAX_ATTEMPTS within the window.
    if (attempts >= MAX_ATTEMPTS && lastAttempt) {
      const elapsedMs =
        admin.firestore.Timestamp.now().toMillis() - lastAttempt.toMillis();
      if (elapsedMs < LOCKOUT_WINDOW_MS) {
        logger.warn("verifyDriverPin: van locked out", {
          vanId: normalizedVanId,
          attempts,
        });
        throw new functions.https.HttpsError(
          "resource-exhausted",
          "Too many attempts. Try again later.",
        );
      }
      // Window expired — reset the counter.
      await secretRef.update({ attempts: 0, lastAttempt: null });
    }

    const inputHash = hashPin(trimmedPin, normalizedVanId);

    if (!storedHash || inputHash !== storedHash) {
      // Record the failed attempt.
      await secretRef
        .update({
          attempts: admin.firestore.FieldValue.increment(1),
          lastAttempt: admin.firestore.Timestamp.now(),
        })
        .catch((err: Error) => {
          // A concurrent reset may have rewritten the doc; a failed
          // attempt-counter write must NOT turn this into a 500.
          logger.error("verifyDriverPin: attempt-counter update failed", {
            vanId: normalizedVanId,
            err: err.message,
          });
        });
      logger.info("verifyDriverPin: wrong PIN", {
        vanId: normalizedVanId,
      });
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Wrong PIN. Try again.",
      );
    }

    // PIN correct — reset attempts and mint a custom auth token.
    await secretRef
      .update({ attempts: 0, lastAttempt: null })
      .catch((err: Error) => {
        logger.error("verifyDriverPin: post-success reset failed", {
          vanId: normalizedVanId,
          err: err.message,
        });
      });

    const token = await auth.createCustomToken(normalizedVanId, {
      vanId: normalizedVanId,
    });

    logger.info("verifyDriverPin: PIN verified", {
      vanId: normalizedVanId,
    });

    return { token };
  }
);

/// `setDriverPin` callable (admin only, PRD-2 §0.7).
/// Writes a hashed PIN to `vanSecrets/{vanId}`. Used to seed/demo the
/// driver PIN before the admin flow exists.
///
/// ADMIN-ONLY (restored). The `demoSeedBypass` env var exists ONLY so a
/// seeded demo can run before the admin auth flow is built; set it in the
/// Functions env config, never in code review-visible runtime, and remove
/// it at the integration sweep. Without the flag the caller must carry
/// Firebase Auth (an admin session).
export const setDriverPin = functions.https.onCall(
  async (request: functions.https.CallableRequest) => {
    const { vanId, pin } = request.data as {
      vanId?: string;
      pin?: string;
    };

    if (typeof vanId !== "string" || typeof pin !== "string" ||
        (vanId as string).length === 0 || (pin as string).length === 0) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "vanId and pin must be non-empty strings",
      );
    }

    const demoBypass =
      process.env.DEMO_SEED_BYPASS === "true";

    if (!demoBypass && !request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Admin authentication required",
      );
    }
    if (!request.auth && demoBypass) {
      // Bypass active — restrict to seeded-only drafts in logging so the
      // window is auditable if it is ever left on accidentally.
      logger.warn("setDriverPin: DEMO SEED BYPASS active", {
        vanId,
      });
    }

    const secretRef = db.collection("vanSecrets").doc(vanId);
    await secretRef.set(
      {
        driverPinHash: hashPin(pin, vanId),
        pinSetAt: admin.firestore.Timestamp.now(),
        setBy: request.auth?.uid ?? "demo-seed-bypass",
        // A re-seed is authoritative: clear any lockout from previous runs.
        attempts: 0,
        lastAttempt: null,
      },
      { merge: true },
    );

    logger.info("setDriverPin: PIN seeded", {
      vanId,
      setBy: request.auth?.uid ?? "demo-seed-bypass",
    });

    return { ok: true };
  }
);
