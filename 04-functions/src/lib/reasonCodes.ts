// reasonCodes.ts
//
// The server sends a code. The client owns the words.
//
// A Function NEVER returns an English sentence to a client. It throws an
// HttpsError whose message IS the reason code. The client switches on the
// code and shows its own localized string. Three apps, three sets of arb
// files, one server.
//
// The vocabulary is 02-contracts/errors.json. This file mirrors it. If you
// add a code there, add it here in the same commit.

import * as functions from 'firebase-functions/v1';

export type ReasonCode =
  | 'invalidInput'
  | 'notAuthorised'
  | 'notFound'
  | 'rateLimited'
  | 'invalidState'
  | 'vanAlreadyClaimed'
  | 'vanHeldByAnotherDriver'
  | 'staleMarker'
  | 'internal';

/**
 * The reason codes the CLIENT detects on its own.
 *
 * `offline` means the phone has no network. The client buffers the action and
 * retries it, and the server never sees the call at all. It lives in
 * errors.json so the client has ONE mapping table, not two.
 *
 * It is deliberately NOT in ReasonCode. A server path that tries to send it
 * must not compile, because the server does not know the client's network
 * state.
 */
export const CLIENT_ONLY_REASON_CODES = ['offline'] as const;

const HTTPS_CODE = {
  invalidInput: 'invalid-argument',
  notAuthorised: 'permission-denied',
  notFound: 'not-found',
  rateLimited: 'resource-exhausted',
  invalidState: 'failed-precondition',
  vanAlreadyClaimed: 'already-exists',
  vanHeldByAnotherDriver: 'failed-precondition',
  staleMarker: 'failed-precondition',
  internal: 'internal',
} as const;

/**
 * Throw a reason code. Never throw anything else at a client.
 *
 * The `details` object is optional and must never carry a phone number, a
 * raw exception message, or any value the caller is not allowed to see.
 * The code alone is enough for the client to pick its wording.
 */
export function fail(code: ReasonCode, details?: Record<string, unknown>): never {
  // The lookup is guarded at run time as well as at compile time. A plain
  // JavaScript caller, or a cast, would otherwise produce an HttpsError with
  // an undefined status, and the client would see a generic failure instead
  // of the real bug.
  const httpCode: functions.https.FunctionsErrorCode | undefined = (
    HTTPS_CODE as Record<string, functions.https.FunctionsErrorCode | undefined>
  )[code];
  if (httpCode === undefined) {
    throw new Error(`Unknown reason code: ${code}`);
  }
  throw new functions.https.HttpsError(httpCode, code, details);
}

/**
 * Wrap a handler so an unexpected throw becomes the `internal` reason code
 * instead of leaking the exception text to the client. The real error is
 * logged, where only the operator can read it.
 */
export function withInternalGuard<T>(
  handler: () => Promise<T>,
  context: string
): Promise<T> {
  return handler().catch((cause: unknown) => {
    const message = cause instanceof Error ? cause.message : String(cause);
    // A reason code thrown by fail() is already correct. Let it through.
    if (cause instanceof functions.https.HttpsError) throw cause;
    console.error(`${context} failed`, { message });
    return fail('internal');
  });
}
