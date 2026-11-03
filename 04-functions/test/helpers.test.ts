// helpers.test.ts
//
// The pure helpers: the phone mask, the IST clock and the geometry.
//
// These functions have no Firebase dependency, so they run with no emulator
// and no credentials. They are still the highest-value tests in the suite:
// the phone mask is the PII boundary, and the IST day decides which document
// a complaint, a duty or a rate limit belongs to.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { maskPhone, isValidIndianPhone } from '../src/lib/phone.ts';
import { Timestamp } from '../src/lib/firebase.ts';

// The source is compiled by tsc with CommonJS module resolution, so it
// imports a sibling as './firebase' without a file extension. Node's ESM
// loader will not resolve that, which makes time.ts unimportable as-is.
// The hook appends '.ts' only for a relative specifier that has no extension
// and only when the file really exists, so every other import is untouched.
registerHooks({
  resolve(
    specifier: string,
    context: { parentURL?: string },
    nextResolve: (specifier: string, context: { parentURL?: string }) => unknown
  ): unknown {
    const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
    const hasExtension = /\.[cm]?[jt]s$/.test(specifier);
    if (!isRelative || hasExtension || !context.parentURL?.startsWith('file:')) {
      return nextResolve(specifier, context);
    }
    const candidate = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(candidate))) {
      return { url: candidate.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { istDayKey, istDayStart, istDayInstant, distanceMeters, isStale } = await import(
  '../src/lib/time.ts'
);

// --- maskPhone --------------------------------------------------------------

test('maskPhone keeps the last two digits and hides the middle six', () => {
  // 9876543210 is the shape PHONE_MASK_FORMAT in constants.json shows. The
  // mask must never let the middle digits through: they are the PII.
  const masked = maskPhone('9876543210');
  assert.strictEqual(masked, '98XXXXXX10');
  assert.strictEqual(masked.length, 10);
  // The masked value must not contain any run of the original middle digits.
  assert.ok(!masked.includes('765432'));
});

test('maskPhone always starts with the fixed 98 prefix, not the real prefix', () => {
  // The mask shape is a constant, not a slice of the input: ADR-0005 and
  // PHONE_MASK_FORMAT pin the displayed shape to 98XXXXXX10. A number that
  // starts with 91 still shows 98, which also hides the operator prefix.
  assert.strictEqual(maskPhone('9123456789'), '98XXXXXX89');
  assert.strictEqual(maskPhone('7012345678'), '98XXXXXX78');
});

test('maskPhone strips non-digits before taking the last two digits', () => {
  assert.strictEqual(maskPhone('98765-43210'), '98XXXXXX10');
  assert.strictEqual(maskPhone('+91 98765 43210'), '98XXXXXX10');
});

test('maskPhone falls back to a fixed mask when it has fewer than two digits', () => {
  // The fallback exists so a malformed input still renders as a 10 character
  // mask and the confirm card's layout does not break.
  assert.strictEqual(maskPhone(''), '98XXXXXX00');
  assert.strictEqual(maskPhone('x'), '98XXXXXX00');
  assert.strictEqual(maskPhone('abc'), '98XXXXXX00');
});

// --- isValidIndianPhone -----------------------------------------------------

test('isValidIndianPhone accepts a ten digit number starting 6, 7, 8 or 9', () => {
  assert.strictEqual(isValidIndianPhone('6876543210'), true);
  assert.strictEqual(isValidIndianPhone('7876543210'), true);
  assert.strictEqual(isValidIndianPhone('8876543210'), true);
  assert.strictEqual(isValidIndianPhone('9876543210'), true);
});

test('isValidIndianPhone strips separators before counting the digits', () => {
  // The admin panel normalises the number, but the server still tolerates
  // spaces and dashes rather than rejecting a phone a human typed normally.
  assert.strictEqual(isValidIndianPhone('98765 43210'), true);
  assert.strictEqual(isValidIndianPhone('98765-43210'), true);
});

test('isValidIndianPhone rejects a number that is not ten digits', () => {
  assert.strictEqual(isValidIndianPhone('987654321'), false); // nine
  assert.strictEqual(isValidIndianPhone('98765432101'), false); // eleven
  assert.strictEqual(isValidIndianPhone(''), false);
});

test('isValidIndianPhone rejects a number that does not start with 6, 7, 8 or 9', () => {
  assert.strictEqual(isValidIndianPhone('5876543210'), false);
  assert.strictEqual(isValidIndianPhone('1234567890'), false);
});

test('isValidIndianPhone rejects a country-code prefixed number', () => {
  // The server expects the admin panel's normalised ten digit value. A +91
  // number has twelve digits, so it is rejected, not silently trimmed.
  assert.strictEqual(isValidIndianPhone('+91 98765 43210'), false);
});

test('isValidIndianPhone rejects letters', () => {
  assert.strictEqual(isValidIndianPhone('abcdefghij'), false);
  // Letters are stripped, so this leaves the ten digits and is accepted.
  // The check is on the digits, not on the original string.
  assert.strictEqual(isValidIndianPhone('98765abcde43210'), true);
});

// --- the IST day ------------------------------------------------------------

test('istDayKey returns a YYYY-MM-DD string', () => {
  assert.match(istDayKey(new Date('2026-01-01T00:00:00.000Z')), /^\d{4}-\d{2}-\d{2}$/);
});

test('istDayKey rolls the IST day at 18:30 UTC, not at midnight UTC', () => {
  // IST is UTC+05:30, so IST midnight of day D is 18:30 UTC on D-1. One
  // millisecond earlier still belongs to the previous IST day. This is the
  // rule that stops a phone in the wrong timezone moving a document into
  // yesterday.
  assert.strictEqual(istDayKey(new Date('2026-01-01T18:29:59.999Z')), '2026-01-01');
  assert.strictEqual(istDayKey(new Date('2026-01-01T18:30:00.000Z')), '2026-01-02');
});

test('istDayKey does not roll at 05:30 UTC, which is 11:00 IST', () => {
  // 05:30 UTC is the offset value, not the day boundary. Both sides of it
  // are the same IST day, and a test that expected a roll here would encode
  // the wrong rule.
  assert.strictEqual(istDayKey(new Date('2026-01-01T05:29:59.999Z')), '2026-01-01');
  assert.strictEqual(istDayKey(new Date('2026-01-01T05:30:00.000Z')), '2026-01-01');
});

test('istDayKey rolls over a month and a year boundary', () => {
  assert.strictEqual(istDayKey(new Date('2026-06-30T18:30:00.000Z')), '2026-07-01');
  assert.strictEqual(istDayKey(new Date('2026-12-31T18:29:59.999Z')), '2026-12-31');
  assert.strictEqual(istDayKey(new Date('2026-12-31T18:30:00.000Z')), '2027-01-01');
});

test('istDayStart is the IST midnight instant of its day key', () => {
  assert.strictEqual(istDayStart('2026-03-01').toISOString(), '2026-02-28T18:30:00.000Z');
  // A leap day must parse, because the key can be produced on 29 February.
  assert.strictEqual(istDayStart('2024-02-29').toISOString(), '2024-02-28T18:30:00.000Z');
});

test('istDayInstant is the ISO form of istDayStart for the same day', () => {
  assert.strictEqual(istDayInstant('2026-03-01'), istDayStart('2026-03-01').toISOString());
  assert.strictEqual(istDayInstant('2026-03-01'), '2026-02-28T18:30:00.000Z');
});

test('istDayStart and istDayKey agree on the same instant and its neighbours', () => {
  // The three functions must agree, or a document written at 23:59 IST could
  // be keyed to one day and started from another. Check a spread of instants
  // including both sides of a month boundary.
  const instants = [
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T18:29:59.999Z',
    '2026-01-01T18:30:00.000Z',
    '2026-02-28T18:30:00.000Z',
    '2026-07-15T12:00:00.000Z',
    '2026-11-03T23:59:59.999Z',
  ];
  for (const iso of instants) {
    const instant = new Date(iso);
    const dayKey = istDayKey(instant);
    const start = istDayStart(dayKey);

    assert.ok(start.getTime() <= instant.getTime(), `${iso} is before its day start`);
    assert.strictEqual(istDayKey(start), dayKey, `${iso} day start does not map back to ${dayKey}`);
    assert.notStrictEqual(
      istDayKey(new Date(start.getTime() - 1)),
      dayKey,
      `the millisecond before ${dayKey} still mapped to ${dayKey}`
    );
    assert.strictEqual(istDayInstant(dayKey), start.toISOString());
  }
});

// --- distanceMeters ---------------------------------------------------------

test('distanceMeters returns 0 for the same point', () => {
  assert.strictEqual(distanceMeters({ lat: 12.9716, lng: 77.5946 }, { lat: 12.9716, lng: 77.5946 }), 0);
});

test('distanceMeters measures 0.001 degrees of longitude on the equator as about 111.19 m', () => {
  // On the equator the geometry is simple: 0.001 degrees is 111.19 metres at
  // the mean Earth radius the helper uses. A tolerance keeps the test from
  // pinning a float representation.
  const metres = distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 });
  assert.ok(Math.abs(metres - 111.19) < 0.5, `expected about 111.19 m, got ${metres}`);
});

test('distanceMeters measures 0.001 degrees of latitude as about 111.19 m', () => {
  const metres = distanceMeters({ lat: 0, lng: 0 }, { lat: 0.001, lng: 0 });
  assert.ok(Math.abs(metres - 111.19) < 0.5, `expected about 111.19 m, got ${metres}`);
});

test('distanceMeters is symmetric', () => {
  const a = { lat: 12.9716, lng: 77.5946 };
  const b = { lat: 12.9801, lng: 77.6012 };
  assert.ok(Math.abs(distanceMeters(a, b) - distanceMeters(b, a)) < 1e-9);
});

// --- isStale ----------------------------------------------------------------

const NOW = new Date('2026-01-01T12:00:00.000Z');

test('isStale returns false for a fresh Date', () => {
  assert.strictEqual(isStale(new Date('2026-01-01T11:59:00.000Z'), 120, NOW), false);
});

test('isStale returns true for a Date older than the limit', () => {
  assert.strictEqual(isStale(new Date('2026-01-01T11:57:00.000Z'), 120, NOW), true);
});

test('isStale treats exactly the limit as fresh, because the check is strictly greater', () => {
  assert.strictEqual(isStale(new Date('2026-01-01T11:58:00.000Z'), 120, NOW), false);
});

test('isStale returns true for null and undefined', () => {
  // A missing location is not a trusted location. This is the van offline
  // and the arrival alert's "never alert on a missing fix" path.
  assert.strictEqual(isStale(null, 120, NOW), true);
  assert.strictEqual(isStale(undefined, 120, NOW), true);
});

test('isStale returns true for an unparseable string', () => {
  assert.strictEqual(isStale('not-a-date', 120, NOW), true);
  assert.strictEqual(isStale('', 120, NOW), true);
});

test('isStale parses a string timestamp and applies the same limit', () => {
  assert.strictEqual(isStale('2026-01-01T11:59:00.000Z', 120, NOW), false);
  assert.strictEqual(isStale('2026-01-01T11:57:00.000Z', 120, NOW), true);
});

test('isStale returns true for a value that is not a Timestamp, Date or string', () => {
  // A number is not a Timestamp. Guessing that it is epoch millis would make
  // an unmigrated document look fresh, so the helper fails closed.
  assert.strictEqual(isStale(1767270600000, 120, NOW), true);
  assert.strictEqual(isStale({ toMillis: () => NOW.getTime() }, 120, NOW), true);
});

test('isStale handles a Firestore Timestamp', () => {
  const fresh = Timestamp.fromMillis(NOW.getTime() - 60 * 1000);
  const old = Timestamp.fromMillis(NOW.getTime() - 180 * 1000);
  assert.strictEqual(isStale(fresh, 120, NOW), false);
  assert.strictEqual(isStale(old, 120, NOW), true);
});
