// reasonCodes.test.ts
//
// The failure envelope: the server sends a code, the client owns the words.
//
// These tests read 02-contracts/errors.json at run time. That is deliberate:
// the contract is the source of truth, so the suite must fail the moment a
// code is added to the contract and the helper is not taught about it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as functions from 'firebase-functions/v1';
import { fail, withInternalGuard } from '../src/lib/reasonCodes.ts';
import type { ReasonCode } from '../src/lib/reasonCodes.ts';

interface ErrorEntry {
  appPhase?: string;
  severity?: string;
}

interface ErrorsContract {
  'x-codes': Record<string, ErrorEntry>;
}

const contract = JSON.parse(
  readFileSync(new URL('../../02-contracts/errors.json', import.meta.url), 'utf8')
) as ErrorsContract;

const contractCodes = Object.keys(contract['x-codes']);

// errors.json names the code the client detects locally and the server never
// sends. The helper must not accept it, so the loop below skips only codes
// the contract itself marks as the offline phase.
const clientOnlyCodes = contractCodes.filter(
  (code) => contract['x-codes'][code].appPhase === 'offline'
);
const serverCodes = contractCodes.filter((code) => !clientOnlyCodes.includes(code));

function captureConsoleError(): { logs: unknown[][]; restore: () => void } {
  const logs: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args);
  };
  return {
    logs,
    restore: () => {
      console.error = original;
    },
  };
}

// --- fail -------------------------------------------------------------------

test('fail throws an HttpsError whose message is the reason code, not a sentence', () => {
  // The client switches on the code. An English message would be shown in a
  // language the app did not pick, so the payload must be the bare code.
  assert.throws(
    () => fail('notFound'),
    (error: unknown) => {
      assert.ok(error instanceof functions.https.HttpsError);
      assert.strictEqual(error.message, 'notFound');
      assert.strictEqual(error.code, 'not-found');
      assert.ok(!/\s/.test(error.message), 'the message must not contain a sentence');
      return true;
    }
  );
});

test('fail carries no details unless the caller passes them', () => {
  // Anything in details crosses the wire to the client, so an empty call
  // must not invent a payload that could leak a server value.
  assert.throws(
    () => fail('notFound'),
    (error: unknown) => {
      assert.ok(error instanceof functions.https.HttpsError);
      assert.strictEqual(error.details, undefined);
      return true;
    }
  );
});

test('fail passes explicit details through unchanged', () => {
  assert.throws(
    () => fail('notFound', { ticketId: 'PMH-20260101-0001' }),
    (error: unknown) => {
      assert.ok(error instanceof functions.https.HttpsError);
      assert.deepStrictEqual(error.details, { ticketId: 'PMH-20260101-0001' });
      return true;
    }
  );
});

test('every server-sent reason code in errors.json is accepted by fail', () => {
  // THIS IS THE CONTRACT TEST. A code added to errors.json without a matching
  // entry in HTTPS_CODE makes fail throw "Unknown error code" instead of an
  // HttpsError, which reaches the client as a generic internal failure.
  assert.ok(serverCodes.length > 0, 'the contract must contain at least one server code');

  for (const code of serverCodes) {
    assert.throws(
      () => fail(code as ReasonCode),
      (error: unknown) => {
        assert.ok(
          error instanceof functions.https.HttpsError,
          `${code} must be a known reason code, not an unregistered one`
        );
        assert.strictEqual(error.message, code);
        assert.strictEqual(typeof error.code, 'string');
        assert.ok(error.code.length > 0, `${code} must map to an HTTP code`);
        return true;
      }
    );
  }
});

test('offline is the only contract code the server never sends', () => {
  // Deriving the exclusion from appPhase means the loop above cannot silently
  // skip a second code. If the contract adds another client-only code, or
  // turns offline into a server code, this test surfaces it.
  assert.deepStrictEqual(clientOnlyCodes, ['offline']);
  assert.ok(serverCodes.includes('internal'));
  assert.ok(serverCodes.includes('invalidInput'));
});

// --- withInternalGuard ------------------------------------------------------

test('withInternalGuard resolves a handler that succeeds', async () => {
  const result = await withInternalGuard(async () => 'ok', 'testHandler');
  assert.strictEqual(result, 'ok');
});

test('withInternalGuard turns an unexpected Error into the internal reason code', async () => {
  const capture = captureConsoleError();
  try {
    await assert.rejects(
      withInternalGuard(async () => {
        throw new Error('boom');
      }, 'testHandler'),
      (error: unknown) => {
        assert.ok(error instanceof functions.https.HttpsError);
        assert.strictEqual(error.message, 'internal');
        assert.strictEqual(error.code, 'internal');
        assert.notStrictEqual(error.message, 'boom', 'the raw exception text must not reach the client');
        return true;
      }
    );
  } finally {
    capture.restore();
  }

  // The raw error must still reach the operator's log. Swallowing it would
  // make a real failure invisible.
  const loggedBoom = capture.logs.some((args) =>
    args.some((arg) => {
      try {
        return JSON.stringify(arg)?.includes('boom') === true;
      } catch {
        return false;
      }
    })
  );
  assert.ok(loggedBoom, 'the raw error message must be logged');
  assert.ok(
    capture.logs.some((args) => String(args[0]).includes('testHandler')),
    'the log line must name the context'
  );
});

test('withInternalGuard turns a non-Error throw into the internal reason code', async () => {
  // A rejected non-Error is unusual, but the guard must not crash while
  // reading .message from it. It still becomes internal.
  const capture = captureConsoleError();
  try {
    await assert.rejects(
      withInternalGuard(async () => {
        throw 'boom';
      }, 'testHandler'),
      (error: unknown) => {
        assert.ok(error instanceof functions.https.HttpsError);
        assert.strictEqual(error.message, 'internal');
        return true;
      }
    );
  } finally {
    capture.restore();
  }
});

test('withInternalGuard lets a deliberate fail through unchanged', async () => {
  // A conflict code is not a server failure. Rewriting invalidState to
  // internal would send the driver to the generic error screen instead of
  // the state-conflict screen.
  const capture = captureConsoleError();
  try {
    await assert.rejects(
      withInternalGuard(async () => fail('invalidState'), 'testHandler'),
      (error: unknown) => {
        assert.ok(error instanceof functions.https.HttpsError);
        assert.strictEqual(error.message, 'invalidState');
        assert.strictEqual(error.code, 'failed-precondition');
        return true;
      }
    );
  } finally {
    capture.restore();
  }

  assert.deepStrictEqual(capture.logs, [], 'a deliberate reason code is not an internal failure');
});
