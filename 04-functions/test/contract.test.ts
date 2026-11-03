// contract.test.ts
//
// The contract is the source of truth. This file proves the code agrees with
// it, by reading the JSON from disk and checking the source against it.
//
// Nothing here needs Firebase. The tests run with cwd = 04-functions, and
// they resolve 02-contracts from this file's own location so the run does not
// depend on where it was started.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const CONTRACTS = new URL('../../02-contracts/', import.meta.url);
const SRC = new URL('../src/', import.meta.url);

interface CallableEntry {
  reasonCodes?: string[];
  lifecycle?: string;
}

interface CallablesContract {
  'x-callables'?: Record<string, CallableEntry>;
  'x-server-functions'?: Record<string, CallableEntry>;
}

interface ErrorsContract {
  'x-codes'?: Record<string, unknown>;
}

function readText(url: URL): string {
  return readFileSync(url, 'utf8');
}

function readJson<T>(url: URL): T {
  return JSON.parse(readText(url)) as T;
}

function walkTypeScriptFiles(dir: URL): URL[] {
  const files: URL[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, dir);
    if (entry.isDirectory()) {
      files.push(...walkTypeScriptFiles(child));
    } else if (entry.name.endsWith('.ts')) {
      files.push(child);
    }
  }
  return files;
}

/**
 * The names src/index.ts exports. It is a re-export file, so most names come
 * from `export { a, b } from './x'`, but direct declarations are also read so
 * a new style of export cannot slip past the reverse check.
 */
function exportedNames(source: string): string[] {
  const names: string[] = [];

  for (const match of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of match[1].split(',')) {
      const cleaned = part.trim().replace(/^type\s+/, '');
      if (cleaned === '') continue;
      const alias = cleaned.split(/\s+as\s+/);
      names.push((alias[1] ?? alias[0]).trim());
    }
  }

  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g)) {
    names.push(match[1]);
  }

  for (const match of source.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g)) {
    names.push(match[1]);
  }

  return names;
}

const indexSource = readText(new URL('index.ts', SRC));
const indexExports = exportedNames(indexSource);
const contract = readJson<CallablesContract>(new URL('callables.json', CONTRACTS));

function contractGroups(): Array<['x-callables' | 'x-server-functions', Record<string, CallableEntry>]> {
  const callables = contract['x-callables'];
  const serverFunctions = contract['x-server-functions'];
  assert.ok(callables !== undefined, 'callables.json must declare x-callables');
  assert.ok(serverFunctions !== undefined, 'callables.json must declare x-server-functions');
  return [
    ['x-callables', callables],
    ['x-server-functions', serverFunctions],
  ];
}

// --- the wired exports ------------------------------------------------------

test('every callable in callables.json is exported from index.ts', () => {
  // A callable that is specified but not wired is a dead contract: the client
  // ships the button and the server does not answer. Only the export name
  // makes it a deployed function.
  const callables = contract['x-callables'];
  assert.ok(callables !== undefined, 'callables.json must declare x-callables');

  const names = Object.keys(callables);
  assert.ok(names.length > 0, 'the contract must declare at least one callable');

  // A sentinel so a broken export parser cannot make this test vacuous.
  assert.ok(indexExports.includes('startShift'), 'the export parser must see a known callable');

  for (const name of names) {
    assert.ok(
      indexExports.includes(name),
      `${name} is in callables.json but is not exported from src/index.ts`
    );
  }
});

test('every server function in callables.json is exported from index.ts', () => {
  const serverFunctions = contract['x-server-functions'];
  assert.ok(serverFunctions !== undefined, 'callables.json must declare x-server-functions');

  const names = Object.keys(serverFunctions);
  assert.ok(names.length > 0, 'the contract must declare at least one server function');

  assert.ok(indexExports.includes('arrivalAlert'), 'the export parser must see a known server function');

  for (const name of names) {
    assert.ok(
      indexExports.includes(name),
      `${name} is in callables.json but is not exported from src/index.ts`
    );
  }
});

test('every function exported from index.ts is named in the contract', () => {
  // The reverse check. An orphan export is a deployed endpoint no client has
  // a contract for, which means no agreed input, no agreed reason codes and
  // no review.
  const contractNames = new Set<string>();
  for (const [, group] of contractGroups()) {
    for (const name of Object.keys(group)) contractNames.add(name);
  }

  assert.ok(indexExports.length > 0, 'index.ts must export at least one function');

  for (const name of indexExports) {
    assert.ok(
      contractNames.has(name),
      `${name} is exported from src/index.ts but is not in callables.json`
    );
  }
});

// --- the reason codes -------------------------------------------------------

test('every reason code a callable can return exists in errors.json', () => {
  // The callables promise a code the client will switch on. A code that is
  // not in errors.json has no copy, no severity and no retry rule, so the
  // client would fall through to a blank error.
  const errors = readJson<ErrorsContract>(new URL('errors.json', CONTRACTS));
  const known = new Set(Object.keys(errors['x-codes'] ?? {}));
  assert.ok(known.size > 0, 'errors.json must declare at least one reason code');

  for (const [groupName, group] of contractGroups()) {
    for (const [functionName, entry] of Object.entries(group)) {
      assert.ok(
        Array.isArray(entry.reasonCodes),
        `${groupName}.${functionName} must declare a reasonCodes array`
      );
      for (const code of entry.reasonCodes) {
        assert.ok(
          known.has(code),
          `${groupName}.${functionName} returns ${code}, which errors.json does not define`
        );
      }
    }
  }
});

// --- the constants ----------------------------------------------------------

test('every constant the source imports from generated/constants.ts exists in constants.json', () => {
  // The generated file is a copy of constants.json. If it drifts, the server
  // and the phones can agree on a name while disagreeing on a number.
  const constantsContract = readJson<Record<string, unknown>>(new URL('constants.json', CONTRACTS));

  // constants.json groups its keys, for example arrival.ARRIVAL_ALERT_RADIUS_M.
  // The generated file exports the leaf name only, so compare leaf to leaf.
  const leafKeys = new Set<string>();
  for (const [group, groupValue] of Object.entries(constantsContract)) {
    if (group.startsWith('$') || group.startsWith('x-')) continue;
    if (groupValue === null || typeof groupValue !== 'object' || Array.isArray(groupValue)) continue;
    for (const leaf of Object.keys(groupValue)) leafKeys.add(leaf);
  }
  assert.ok(leafKeys.size > 0, 'constants.json must declare at least one constant');

  const importPattern = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"][^'"]*generated\/constants['"]/g;
  const importedNames = new Set<string>();

  for (const file of walkTypeScriptFiles(SRC)) {
    for (const match of readText(file).matchAll(importPattern)) {
      for (const part of match[1].split(',')) {
        const name = part.trim().replace(/^type\s+/, '');
        if (name !== '') importedNames.add(name);
      }
    }
  }

  assert.ok(importedNames.size > 0, 'the source must import at least one generated constant');
  // A sentinel so a broken import parser cannot make this test vacuous.
  assert.ok(importedNames.has('CLAIM_VAN_ID'), 'the import parser must see a known constant');

  for (const name of importedNames) {
    assert.ok(
      leafKeys.has(name),
      `${name} is imported from src/generated/constants.ts but constants.json does not define it`
    );
  }
});

// --- the collections --------------------------------------------------------

test('every collection the source names has a schema in 02-contracts/collections', () => {
  // A write to a collection with no schema is an unagreed document shape, and
  // the strict schema and the tightened rules will later reject it. This scans
  // the three ways the source reaches a collection: collection(), the trigger
  // document() path, and a string-literal doc() path.
  const patterns = [
    /\.collection\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    /\.doc\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    /\.document\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  ];

  const collections = new Set<string>();
  for (const file of walkTypeScriptFiles(SRC)) {
    const source = readText(file);
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        // A trigger path is 'complaints/{complaintId}'; the collection is the
        // first segment. A doc id such as 'AB-1234' is reported separately in
        // the rare case a literal reaches doc().
        collections.add(match[1].split('/')[0]);
      }
    }
  }

  assert.ok(collections.size > 0, 'the scanner must find at least one collection');
  // Sentinels so a broken regex cannot make this test vacuous.
  assert.ok(collections.has('complaints'), 'the scanner must find the complaints collection');
  assert.ok(collections.has('staffPhones'), 'the scanner must find the staffPhones collection');

  const schemaNames = new Set(
    readdirSync(new URL('collections/', CONTRACTS), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.schema.json'))
      .map((entry) => entry.name.slice(0, -'.schema.json'.length))
  );
  assert.ok(schemaNames.size > 0, 'the contracts collections directory must hold schemas');

  for (const collection of collections) {
    // The schema filename is singular and the collection name is plural, so a
    // small set of candidates covers the naming rule the repo uses.
    const candidates = new Set<string>([collection]);
    if (collection.endsWith('ies')) candidates.add(`${collection.slice(0, -3)}y`);
    if (collection.endsWith('es')) candidates.add(collection.slice(0, -2));
    if (collection.endsWith('s')) candidates.add(collection.slice(0, -1));

    const hasSchema = [...candidates].some((candidate) => schemaNames.has(candidate));
    assert.ok(
      hasSchema,
      `the source uses the ${collection} collection but no schema matches it in 02-contracts/collections`
    );
  }
});
