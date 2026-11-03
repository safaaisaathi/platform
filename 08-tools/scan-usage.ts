// scan-usage.ts
//
// Reads one app repo's source and works out what that app actually touches:
//   1. the Firestore collections (and where, by file and line)
//   2. the field names, attributed to every collection named in the same file
//   3. the callables it calls, and the functions it defines in its own
//      functions folder
//   4. the FCM topics it subscribes to, literal or template
//   5. the Firebase Auth calls
//   6. the Firebase project id it is wired to, hardcoded or from an env var
//   7. the PII field names, derived from (2)
//
// The result goes to <app-repo>/.contract/usage.json. check-conflicts.ts reads
// that file and compares it with the contract.
//
// The three apps are written in different languages, so this matches on TEXT,
// not on a syntax tree. That is a deliberate trade: it is the only way one
// tool can read Dart, TypeScript and JavaScript. It also means the field
// attribution is per FILE, not per statement: a field counts as belonging to a
// collection when both appear in the same file. A file that holds two
// collections attributes its fields to both.
//
// Determinism: the same source produces the same bytes. scannedAt is the ISO
// DATE only, and every array is sorted by name and then by file. Do not add a
// timestamp or an unsorted array here.
//
// Usage: node --experimental-strip-types scan-usage.ts <app-repo>
// The argument may be a path or one of driverapp, userapp, adminpanel, which
// resolves against the folder that holds the platform repo and the app repos
// side by side. With no argument it falls back to APP_REPO, then to the
// current directory.

import { readFile, readdir, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { APPS, MONOREPO_ROOT, ok, printErrors } from './lib.ts';

const HEADER = 'scan-usage failed';

export const USAGE_SCHEMA = 'https://safaaisaathi.contracts/usage.schema.json';
export const USAGE_TOOL = 'scan-usage';
export const USAGE_FILE_NAME = 'usage.json';

// Folders that never hold the app's own code. ".contract" is added to the
// brief's list because it holds vendored copies of the contract, not source.
const SKIP_DIRS: ReadonlySet<string> = new Set([
  '.git',
  'node_modules',
  'build',
  '.dart_tool',
  'android',
  'ios',
  'web',
  'dist',
  'docs',
  '.contract',
]);

// Generated code next to its source. The path is relative to the app repo.
const SKIP_RELATIVE_DIRS: ReadonlySet<string> = new Set(['lib/generated']);

const SOURCE_EXTENSIONS: readonly string[] = ['.dart', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

// A file bigger than this is an asset with a source extension, not code.
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

// A "collection" that is really part of the Firebase SDK's own module paths.
// The brief names these: they must never be reported as a collection.
const FIREBASE_SDK_NAMES: ReadonlySet<string> = new Set([
  'app',
  'auth',
  'analytics',
  'database',
  'firebase',
  'firebaseapp',
  'firestore',
  'functions',
  'messaging',
  'performance',
  'storage',
]);

const AUTH_METHODS: readonly string[] = [
  'signInAnonymously',
  'signInWithCustomToken',
  'signInWithEmailAndPassword',
  'signInWithEmail',
  'signInWithPhoneNumber',
  'signInWithPopup',
  'signInWithRedirect',
  'onAuthStateChanged',
  'currentUser',
  'getIdToken',
  'getIdTokenResult',
];

// Names generic enough to appear in code that has nothing to do with Firebase.
// They only count when the file mentions firebase at all.
const AUTH_METHODS_NEEDING_FIREBASE: ReadonlySet<string> = new Set(['currentUser']);

// Every field name that is personal data. photoUrl is here on purpose: a photo
// is personal data even though it is not a phone number.
export const PII_FIELD_NAMES: readonly string[] = [
  'phone',
  'phoneNumber',
  'mobile',
  'contact',
  'email',
  'emailAddress',
  'address',
  'street',
  'houseNo',
  'aadhaar',
  'aadhar',
  'pan',
  'panNumber',
  'idNumber',
  'dob',
  'dateOfBirth',
  'photo',
  'photoUrl',
  'imageUrl',
  'selfie',
  'signature',
  'lat',
  'lng',
  'latitude',
  'longitude',
];

const PII_FIELD_SET: ReadonlySet<string> = new Set(PII_FIELD_NAMES.map((name) => name.toLowerCase()));

export type UsageCollection = { name: string; files: string[] };
export type UsageField = { collection: string; name: string; files: string[] };
export type UsageNamed = { name: string; files: string[] };
export type UsageTopic = { name: string; kind: string; files: string[] };
export type UsageProjectId = { value: string; files: string[]; hardcoded: boolean };

export type Usage = {
  $schema: string;
  app: string;
  scannedAt: string;
  tool: string;
  collections: UsageCollection[];
  fields: UsageField[];
  callablesCalled: UsageNamed[];
  callablesDefined: string[];
  topics: UsageTopic[];
  authMethods: UsageNamed[];
  firebaseProjectIds: UsageProjectId[];
  piiFields: UsageField[];
};

// name -> the lines it was found on
type Hits = Map<string, Set<number>>;

type FileHits = {
  collections: Hits;
  fields: Hits;
  callables: Hits;
  callablesDefined: Set<string>;
  // `${kind}\u0000${name}` -> lines
  topics: Hits;
  auth: Hits;
  // `${hardcoded}\u0000${value}` -> lines
  projectIds: Hits;
};

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function usageJsonPath(repoDir: string): string {
  return path.join(repoDir, '.contract', USAGE_FILE_NAME);
}

// --- the source walk --------------------------------------------------------

function isSourceFile(name: string): boolean {
  return SOURCE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

// Lists every source file under the app repo, relative and sorted. Skips the
// folders in SKIP_DIRS, the brief's binary archives, and anything under
// lib/generated.
async function listSourceFiles(repoDir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (currentRel: string): Promise<void> => {
    const dirents = await readdir(path.join(repoDir, currentRel), { withFileTypes: true });
    // A "lib" folder next to a "src" folder is compiled output. Scanning it
    // would report the same code twice, with the compiler's line numbers.
    const hasSrcSibling = dirents.some((dirent) => dirent.isDirectory() && dirent.name === 'src');
    for (const dirent of dirents) {
      const rel = currentRel.length === 0 ? dirent.name : `${currentRel}/${dirent.name}`;
      if (dirent.isDirectory()) {
        if (SKIP_DIRS.has(dirent.name) || SKIP_RELATIVE_DIRS.has(rel)) continue;
        if (dirent.name === 'lib' && hasSrcSibling) continue;
        await walk(rel);
        continue;
      }
      if (!dirent.isFile()) continue;
      if (dirent.name.toLowerCase().endsWith('.zip')) continue;
      if (!isSourceFile(dirent.name)) continue;
      out.push(rel);
    }
  };
  await walk('');
  return out.sort();
}

async function readSource(repoDir: string, rel: string): Promise<string | null> {
  const full = path.join(repoDir, rel);
  const info = await stat(full).catch(() => undefined);
  if (info === undefined || !info.isFile() || info.size > MAX_SOURCE_BYTES) return null;
  const text = await readFile(full, 'utf8');
  // A NUL byte means this is not text. Do not scan a binary.
  if (text.includes('\u0000')) return null;
  return text;
}

// The newest modification time of any source file, or 0 when there is none.
// check-conflicts.ts uses it to decide whether its usage.json is stale.
export async function newestSourceMs(repoDir: string): Promise<number> {
  let newest = 0;
  for (const rel of await listSourceFiles(repoDir)) {
    const info = await stat(path.join(repoDir, rel)).catch(() => undefined);
    if (info !== undefined && info.isFile() && info.mtimeMs > newest) newest = info.mtimeMs;
  }
  return newest;
}

// --- text helpers -----------------------------------------------------------

type LineOf = (offset: number) => number;

// Maps a character offset to its 1-based line number.
function makeLineLookup(text: string): LineOf {
  const starts: number[] = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return (offset: number): number => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
}

// True for a line that is only a comment. A commented-out example or a doc
// line that names a collection must not be counted as live code.
function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('#')
  );
}

function forEachMatch(
  text: string,
  pattern: RegExp,
  lineOf: LineOf,
  commentLines: readonly boolean[],
  visit: (match: RegExpExecArray, line: number) => void,
): void {
  pattern.lastIndex = 0;
  let match = pattern.exec(text);
  while (match !== null) {
    const line = lineOf(match.index);
    if (commentLines[line - 1] !== true) visit(match, line);
    if (match[0].length === 0) pattern.lastIndex += 1;
    match = pattern.exec(text);
  }
}

function addHit(hits: Hits, name: string, line: number): void {
  const lines = hits.get(name) ?? new Set<number>();
  lines.add(line);
  hits.set(name, lines);
}

// Skips a quoted string and returns the offset just past its closing quote.
function skipString(text: string, start: number): number {
  const quote = text[start];
  let index = start + 1;
  while (index < text.length) {
    const ch = text[index];
    if (ch === '\\') {
      index += 2;
      continue;
    }
    if (ch === quote) return index + 1;
    index += 1;
  }
  return text.length;
}

// Blanks out every map literal that starts with a spread, keeping the offsets
// and the newlines. A map written as {...data, 'id': id} copies another
// document's shape into a read model. It is not a payload the app defines, so
// its keys are not fields of anything.
function maskSpreadLiterals(text: string): string {
  const pattern = /\{\s*\.\.\./g;
  const masked: string[] = text.split('');
  let match = pattern.exec(text);
  while (match !== null) {
    const open = match.index;
    let depth = 0;
    let index = open;
    let end = text.length;
    while (index < text.length) {
      const ch = text[index];
      if (ch === "'" || ch === '"') {
        index = skipString(text, index);
        continue;
      }
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          end = index + 1;
          break;
        }
      }
      index += 1;
    }
    for (let cursor = open; cursor < end; cursor += 1) {
      if (masked[cursor] !== '\n') masked[cursor] = ' ';
    }
    pattern.lastIndex = end;
    match = pattern.exec(text);
  }
  return masked.join('');
}

const PLAIN_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*\s*:/;
const QUOTED_KEY_PATTERN = /^(['"])([A-Za-z_$][A-Za-z0-9_$]*)\1\s*:/;

// Reads an object-literal key at "index". Returns the name and where the key
// ends, or null when there is no key here.
function readObjectKey(text: string, index: number): { name: string; next: number } | null {
  const plain = PLAIN_KEY.exec(text.slice(index, index + 128));
  if (plain !== null && plain[0].length > 0) {
    const name = plain[0].slice(0, plain[0].indexOf(':')).trim();
    // A bare "?" is a ternary, not a key.
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) return { name, next: index + plain[0].length };
  }
  const quoted = QUOTED_KEY_PATTERN.exec(text.slice(index, index + 128));
  if (quoted !== null && quoted[0].length > 0) return { name: quoted[2], next: index + quoted[0].length };
  return null;
}

// The keys at depth 1 of the object literal that starts at or after "from".
// This is how a Firestore write payload's field names are read: the payload of
// setDoc(ref, { a: 1, b: 2 }) is an object literal, and its depth-1 keys are
// the fields the app writes.
function objectLiteralKeys(text: string, from: number, lineOf: LineOf): Array<{ name: string; line: number }> {
  const out: Array<{ name: string; line: number }> = [];
  const open = text.indexOf('{', from);
  if (open < 0) return out;

  let depth = 0;
  let index = open;
  while (index < text.length) {
    const ch = text[index];
    if (ch === '\u0027' || ch === '"' || ch === '`') {
      index = skipString(text, index);
      continue;
    }
    if (ch === '/' && text[index + 1] === '/') {
      const newline = text.indexOf('\n', index);
      index = newline < 0 ? text.length : newline;
      continue;
    }
    if (ch === '/' && text[index + 1] === '*') {
      const end = text.indexOf('*/', index + 2);
      index = end < 0 ? text.length : end + 2;
      continue;
    }
    if (ch === '{' || ch === '(' || ch === '[') {
      depth += 1;
      index += 1;
      continue;
    }
    if (ch === '}' || ch === ')' || ch === ']') {
      depth -= 1;
      index += 1;
      if (depth <= 0) break;
      continue;
    }
    if (depth === 1) {
      const key = readObjectKey(text, index);
      if (key !== null) {
        out.push({ name: key.name, line: lineOf(index) });
        index = key.next;
        continue;
      }
    }
    index += 1;
  }
  return out;
}

// --- the detectors ----------------------------------------------------------

const COLLECTION_PATTERNS: readonly RegExp[] = [
  // Dart: _db.collection('vans'), Firestore.instance.collection('vans')
  // TS:  collection(db, 'complaints') is pattern 2, collection('vans') is here
  /\bcollection(?:Group)?\(\s*['"]([A-Za-z0-9_]+)['"]/g,
  // TS: collection(db, 'complaints')
  /\bcollection(?:Group)?\(\s*[^,()'"]+,\s*['"]([A-Za-z0-9_]+)['"]/g,
  // Dart and TS: doc(db, 'complaints', id), doc(db, 'vans', vanId)
  /\bdoc\(\s*[^,()'"]+,\s*['"]([A-Za-z0-9_]+)['"]/g,
  /\bdoc\(\s*['"]([A-Za-z0-9_]+)['"]\s*,/g,
  // A bare collection name used as a path string: 'complaints/{id}'
  /['"]([a-z][A-Za-z0-9_]*)\/\{/g,
];

const CALLABLE_CALL_PATTERNS: readonly RegExp[] = [
  // httpsCallable(functions, 'name'), httpsCallable('name'),
  // getFunctions().httpsCallable('name'), functions.httpsCallable('name')
  /httpsCallable(?:<[^>]*>)?\(\s*(?:[^,()'"]+,\s*)?['"]([A-Za-z0-9_.-]+)['"]/g,
  /callFunction\(\s*['"]([A-Za-z0-9_.-]+)['"]/g,
];

const DEFINED_FUNCTION_PATTERNS: readonly RegExp[] = [
  /export\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[:=]/g,
  /export\s+async\s+function\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
  /\bexports\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=/g,
];

// subscribeToTopic('all'), unsubscribeFromTopic('all')
const TOPIC_LITERAL = /(?:subscribeToTopic|unsubscribeFromTopic)\(\s*['"]([^'"`]+)['"]/g;
// 'van_$vanId', 'ward_${wardId}', `staff_${staffId}`. The interpolation must
// be an id, because a topic is always <prefix>_<something>Id in the contract.
const TOPIC_TEMPLATE =
  /(['"`])([a-z][A-Za-z0-9]*_)\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g;
// 'ward_' + wardId
const TOPIC_CONCAT = /(['"])([a-z][A-Za-z0-9]*_)\1\s*\+\s*([A-Za-z_$][A-Za-z0-9_$]*)/g;
// A file that never mentions messaging cannot hold a topic subscription.
const MESSAGING_SIGNAL = /messaging|subscribeToTopic/i;
// A string built from these is a document id or a database uid, not a topic.
const ID_PREFIX_SIGNAL = /createCustomToken|customToken|randomUUID|Date\.now|Math\.random|generateId/i;

// Dart map literal key: 'lastLocation': value
const QUOTED_MAP_KEY = /(['"])([A-Za-z_][A-Za-z0-9_]*)\1\s*:/g;
// Dart and TS read: snapshot.data()['status'], snap.data()!['status']
const DATA_INDEX = /\bdata\(\)!?\s*\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\]/g;
// A query filters on a field: .where('category', isEqualTo: ...)
const WHERE_KEY = /\.where\(\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g;
// TS read: data().status
const DATA_PROPERTY = /\bdata\(\)\.([A-Za-z_][A-Za-z0-9_]*)/g;
// A TS write payload: setDoc(ref, { ... }), updateDoc(ref, { ... }),
// addDoc(collection, { ... }), ref.set({ ... }), ref.update({ ... }).
// The first two arguments are inspected: the payload is the first one that is
// an object literal. setDoc(ref, payload, { merge: true }) has no literal
// payload, and its options object must not be read as one.
const TS_WRITE_CALL = /\b(?:setDoc|updateDoc|addDoc)\(|\.(?:set|update|add)\(/g;

// The offset of the "{" that opens the payload argument, or -1 when the
// arguments checked hold no object literal. "from" is the offset just after
// the call's "(". "maxArguments" bounds how far to look: setDoc(ref, payload)
// has the payload second, while docRef.update(payload) has it first.
function firstObjectArgument(text: string, from: number, maxArguments: number): number {
  let depth = 0;
  let expectArgument = true;
  let seen = 0;
  let index = from;
  while (index < text.length) {
    const ch = text[index];
    if (ch === "'" || ch === '"' || ch === '`') {
      index = skipString(text, index);
      continue;
    }
    if (depth === 0 && expectArgument) {
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        index += 1;
        continue;
      }
      if (ch === '{') return index;
      if (ch === ')') return -1;
      seen += 1;
      if (seen >= maxArguments) return -1;
      expectArgument = false;
      index += 1;
      continue;
    }
    if (ch === '{' || ch === '(' || ch === '[') {
      depth += 1;
      index += 1;
      continue;
    }
    if (ch === '}' || ch === ')' || ch === ']') {
      if (depth === 0) return -1;
      depth -= 1;
      index += 1;
      continue;
    }
    if (depth === 0 && ch === ',') {
      expectArgument = true;
      index += 1;
      continue;
    }
    index += 1;
  }
  return -1;
}

// A batch or a transaction write puts the payload second: batch.update(ref,
// data). A document write puts it first: docRef.update(data). They are told
// apart by the receiver's name.
const BATCH_RECEIVERS: ReadonlySet<string> = new Set(['batch', 'tx', 'transaction']);
const RECEIVER = /([A-Za-z_$][A-Za-z0-9_$]*)$/;

function payloadOffset(text: string, match: RegExpExecArray): number {
  const from = match.index + match[0].length;
  if (!match[0].startsWith('.')) return firstObjectArgument(text, from, 2);
  const before = text.slice(Math.max(0, match.index - 60), match.index);
  const receiver = RECEIVER.exec(before);
  const isBatch = receiver !== null && BATCH_RECEIVERS.has(receiver[1]);
  return firstObjectArgument(text, from, isBatch ? 2 : 1);
}

// A read or a write of a collection, per file. Used only to answer "does this
// app write to this collection", which check-conflicts needs for the admin
// panel's direct-write finding.
const WRITE_CALL =
  /\b(?:setDoc|updateDoc|addDoc|batch\.set|batch\.update|batch\.delete)\(|\.(?:set|update|add|delete)\(\s*(?:<[^>]*>)?\s*\{/g;

const PROJECT_KEY = /projectId|project_id|FIREBASE_PROJECT_ID|VITE_FIREBASE_PROJECT_ID/;
const ENV_PROJECT = /(?:import\.meta\.env|process\.env)\.([A-Za-z0-9_]+)/;
const QUOTED_LITERAL = /['"]([^'"\n]+)['"]/g;
const PROJECT_NAME_LITERAL = /['"]((?:safaaisaathi|safai-saathi)-[A-Za-z0-9-]+)['"]/g;

function isCollectionCandidate(name: string): boolean {
  if (name.length === 0) return false;
  return !FIREBASE_SDK_NAMES.has(name.toLowerCase());
}

function isFunctionsFolder(rel: string): boolean {
  return rel.split('/').includes('functions');
}

function scanText(rel: string, text: string): FileHits {
  const hits: FileHits = {
    collections: new Map(),
    fields: new Map(),
    callables: new Map(),
    callablesDefined: new Set(),
    topics: new Map(),
    auth: new Map(),
    projectIds: new Map(),
  };
  const lineOf = makeLineLookup(text);
  const lines = text.split('\n');
  const commentLines = lines.map(isCommentLine);
  const isDart = rel.endsWith('.dart');
  const mentionsFirebase = /firebase/i.test(text);

  // 1. Collections
  for (const pattern of COLLECTION_PATTERNS) {
    forEachMatch(text, pattern, lineOf, commentLines, (match) => {
      const name = match[1];
      if (isCollectionCandidate(name)) addHit(hits.collections, name, lineOf(match.index));
    });
  }

  // 2. Fields
  if (isDart) {
    // The mask keeps the offsets, so the line numbers stay right.
    const dartMapText = maskSpreadLiterals(text);
    forEachMatch(dartMapText, QUOTED_MAP_KEY, lineOf, commentLines, (match) => {
      addHit(hits.fields, match[2], lineOf(match.index));
    });
  } else {
    forEachMatch(text, TS_WRITE_CALL, lineOf, commentLines, (match) => {
      const open = payloadOffset(text, match);
      if (open < 0) return;
      for (const key of objectLiteralKeys(text, open, lineOf)) {
        addHit(hits.fields, key.name, key.line);
      }
    });
    forEachMatch(text, DATA_PROPERTY, lineOf, commentLines, (match) => {
      addHit(hits.fields, match[1], lineOf(match.index));
    });
  }
  forEachMatch(text, DATA_INDEX, lineOf, commentLines, (match) => {
    addHit(hits.fields, match[1], lineOf(match.index));
  });
  forEachMatch(text, WHERE_KEY, lineOf, commentLines, (match) => {
    addHit(hits.fields, match[1], lineOf(match.index));
  });

  // 3. Callables
  for (const pattern of CALLABLE_CALL_PATTERNS) {
    forEachMatch(text, pattern, lineOf, commentLines, (match) => {
      addHit(hits.callables, match[1], lineOf(match.index));
    });
  }
  if (isFunctionsFolder(rel)) {
    for (const pattern of DEFINED_FUNCTION_PATTERNS) {
      forEachMatch(text, pattern, lineOf, commentLines, (match) => {
        // A SCREAMING_SNAKE export is a constant, not a function.
        if (!/^[A-Z][A-Z0-9_]*$/.test(match[1])) hits.callablesDefined.add(match[1]);
      });
    }
  }

  // 4. Topics
  forEachMatch(text, TOPIC_LITERAL, lineOf, commentLines, (match) => {
    addHit(hits.topics, `literal\u0000${match[1]}`, lineOf(match.index));
  });
  if (MESSAGING_SIGNAL.test(text)) {
    forEachMatch(text, TOPIC_TEMPLATE, lineOf, commentLines, (match) => {
      const variable = match[3] ?? match[4];
      if (!variable.endsWith('Id')) return;
      if (ID_PREFIX_SIGNAL.test(lines[lineOf(match.index) - 1])) return;
      addHit(hits.topics, `template\u0000${match[2]}`, lineOf(match.index));
    });
    forEachMatch(text, TOPIC_CONCAT, lineOf, commentLines, (match) => {
      if (!match[3].endsWith('Id')) return;
      if (ID_PREFIX_SIGNAL.test(lines[lineOf(match.index) - 1])) return;
      addHit(hits.topics, `template\u0000${match[2]}`, lineOf(match.index));
    });
  }

  // 5. Auth methods
  for (const method of AUTH_METHODS) {
    if (AUTH_METHODS_NEEDING_FIREBASE.has(method) && !mentionsFirebase) continue;
    forEachMatch(text, new RegExp(`\\b${method}\\b`, 'g'), lineOf, commentLines, (match) => {
      addHit(hits.auth, method, lineOf(match.index));
    });
  }

  // 6. The Firebase project id
  for (let index = 0; index < lines.length; index += 1) {
    if (commentLines[index]) continue;
    const line = lines[index];
    const key = PROJECT_KEY.exec(line);
    if (key !== null) {
      const lineNumber = index + 1;
      const rest = line.slice(key.index);
      const env = ENV_PROJECT.exec(rest);
      if (env !== null) addHit(hits.projectIds, `false\u0000${env[1]}`, lineNumber);
      // Only the value that follows the key and ends at the next comma, so a
      // neighbouring "authDomain: 'x'" is not read as a project id.
      const comma = rest.indexOf(',');
      const value = comma < 0 ? rest : rest.slice(0, comma);
      QUOTED_LITERAL.lastIndex = 0;
      let literal = QUOTED_LITERAL.exec(value);
      while (literal !== null) {
        if (literal[1].trim().length > 0) addHit(hits.projectIds, `true\u0000${literal[1]}`, lineNumber);
        literal = QUOTED_LITERAL.exec(value);
      }
    }
    // A project name literal anywhere in live code.
    PROJECT_NAME_LITERAL.lastIndex = 0;
    let named = PROJECT_NAME_LITERAL.exec(line);
    while (named !== null) {
      addHit(hits.projectIds, `true\u0000${named[1]}`, index + 1);
      named = PROJECT_NAME_LITERAL.exec(line);
    }
  }

  return hits;
}

// --- gathering --------------------------------------------------------------

function toFileList(lines: Set<number>, rel: string): string[] {
  return [...lines].sort((a, b) => a - b).map((line) => `${rel}:${line}`);
}

type Accumulated = {
  collections: Map<string, Set<string>>;
  fields: Map<string, Set<string>>;
  callables: Map<string, Set<string>>;
  topics: Map<string, Set<string>>;
  auth: Map<string, Set<string>>;
  projectIds: Map<string, Set<string>>;
  callablesDefined: Set<string>;
};

function emptyAccumulated(): Accumulated {
  return {
    collections: new Map(),
    fields: new Map(),
    callables: new Map(),
    topics: new Map(),
    auth: new Map(),
    projectIds: new Map(),
    callablesDefined: new Set(),
  };
}

function mergeFiles(target: Map<string, Set<string>>, key: string, files: string[]): void {
  const bucket = target.get(key) ?? new Set<string>();
  for (const file of files) bucket.add(file);
  target.set(key, bucket);
}

function sortByNameThenFile<T extends { name: string; files: string[] }>(items: T[]): T[] {
  return items.sort((left, right) => {
    if (left.name !== right.name) return left.name < right.name ? -1 : 1;
    const leftFile = left.files[0] ?? '';
    const rightFile = right.files[0] ?? '';
    if (leftFile === rightFile) return 0;
    return leftFile < rightFile ? -1 : 1;
  });
}

function namedFrom(map: Map<string, Set<string>>): UsageNamed[] {
  const out: UsageNamed[] = [];
  for (const [name, files] of map) out.push({ name, files: [...files].sort() });
  return sortByNameThenFile(out);
}

// The collection a field most likely belongs to. The field and the collection
// are in the same file (the brief's rule); when a file names several
// collections, the nearest occurrence in lines wins, so one 600-line functions
// file does not attribute every field to all seven of its collections.
function nearestCollections(collections: Map<string, Set<number>>, line: number): string[] {
  let best = Number.POSITIVE_INFINITY;
  let winners: string[] = [];
  for (const [name, collectionLines] of collections) {
    for (const candidate of collectionLines) {
      const distance = Math.abs(candidate - line);
      if (distance < best) {
        best = distance;
        winners = [name];
      } else if (distance === best && !winners.includes(name)) {
        winners.push(name);
      }
    }
  }
  return winners;
}

function location(rel: string, line: number): string {
  return `${rel}:${line}`;
}

export async function scanRepo(repoDir: string): Promise<Usage> {
  const info = await stat(repoDir).catch(() => undefined);
  if (info === undefined || !info.isDirectory()) {
    throw new Error(`app repo not found: ${repoDir}`);
  }

  const accumulated = emptyAccumulated();

  for (const rel of await listSourceFiles(repoDir)) {
    const text = await readSource(repoDir, rel);
    if (text === null) continue;
    const hits = scanText(rel, text);

    for (const [name, fileLines] of hits.collections) {
      mergeFiles(accumulated.collections, name, toFileList(fileLines, rel));
    }

    // A field belongs to the collection named closest to it in the same file.
    for (const [name, fileLines] of hits.fields) {
      const filesByCollection = new Map<string, string[]>();
      for (const line of [...fileLines].sort((left, right) => left - right)) {
        for (const collection of nearestCollections(hits.collections, line)) {
          const files = filesByCollection.get(collection) ?? [];
          files.push(location(rel, line));
          filesByCollection.set(collection, files);
        }
      }
      for (const [collection, files] of filesByCollection) {
        mergeFiles(accumulated.fields, `${collection}\u0000${name}`, files);
      }
    }

    for (const [name, fileLines] of hits.callables) {
      mergeFiles(accumulated.callables, name, toFileList(fileLines, rel));
    }
    for (const [key, fileLines] of hits.topics) {
      mergeFiles(accumulated.topics, key, toFileList(fileLines, rel));
    }
    for (const [name, fileLines] of hits.auth) {
      mergeFiles(accumulated.auth, name, toFileList(fileLines, rel));
    }
    for (const [key, fileLines] of hits.projectIds) {
      mergeFiles(accumulated.projectIds, key, toFileList(fileLines, rel));
    }
    for (const name of hits.callablesDefined) accumulated.callablesDefined.add(name);
  }

  const collections: UsageCollection[] = [];
  for (const [name, files] of accumulated.collections) collections.push({ name, files: [...files].sort() });
  sortByNameThenFile(collections);

  const fields: UsageField[] = [];
  for (const [key, files] of accumulated.fields) {
    const separator = key.indexOf('\u0000');
    fields.push({ collection: key.slice(0, separator), name: key.slice(separator + 1), files: [...files].sort() });
  }
  sortFields(fields);

  const piiFields = fields.filter((field) => PII_FIELD_SET.has(field.name.toLowerCase()));

  const topics: UsageTopic[] = [];
  for (const [key, files] of accumulated.topics) {
    const separator = key.indexOf('\u0000');
    topics.push({ kind: key.slice(0, separator), name: key.slice(separator + 1), files: [...files].sort() });
  }
  topics.sort((left, right) => {
    if (left.name !== right.name) return left.name < right.name ? -1 : 1;
    if (left.kind !== right.kind) return left.kind < right.kind ? -1 : 1;
    const leftFile = left.files[0] ?? '';
    const rightFile = right.files[0] ?? '';
    if (leftFile === rightFile) return 0;
    return leftFile < rightFile ? -1 : 1;
  });

  const firebaseProjectIds: UsageProjectId[] = [];
  for (const [key, files] of accumulated.projectIds) {
    const separator = key.indexOf('\u0000');
    firebaseProjectIds.push({
      value: key.slice(separator + 1),
      files: [...files].sort(),
      hardcoded: key.slice(0, separator) === 'true',
    });
  }
  firebaseProjectIds.sort((left, right) => {
    if (left.value !== right.value) return left.value < right.value ? -1 : 1;
    const leftFile = left.files[0] ?? '';
    const rightFile = right.files[0] ?? '';
    if (leftFile === rightFile) return 0;
    return leftFile < rightFile ? -1 : 1;
  });

  return {
    $schema: USAGE_SCHEMA,
    app: path.basename(path.resolve(repoDir)),
    scannedAt: new Date().toISOString().slice(0, 10),
    tool: USAGE_TOOL,
    collections,
    fields,
    callablesCalled: namedFrom(accumulated.callables),
    callablesDefined: [...accumulated.callablesDefined].sort(),
    topics,
    authMethods: namedFrom(accumulated.auth),
    firebaseProjectIds,
    piiFields,
  };
}

function sortFields(fields: UsageField[]): void {
  fields.sort((left, right) => {
    if (left.name !== right.name) return left.name < right.name ? -1 : 1;
    if (left.collection !== right.collection) return left.collection < right.collection ? -1 : 1;
    const leftFile = left.files[0] ?? '';
    const rightFile = right.files[0] ?? '';
    if (leftFile === rightFile) return 0;
    return leftFile < rightFile ? -1 : 1;
  });
}

// The collections this app writes to. `scanRepo` records what the app TOUCHES;
// a write needs the extra signal of a write call in the same file, because the
// usage.json shape has no read/write flag. File-level like everything else
// here: a file that contains a write call marks every collection it names as
// written.
export async function scanWriteTargets(repoDir: string): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  const info = await stat(repoDir).catch(() => undefined);
  if (info === undefined || !info.isDirectory()) {
    throw new Error(`app repo not found: ${repoDir}`);
  }
  for (const rel of await listSourceFiles(repoDir)) {
    const text = await readSource(repoDir, rel);
    if (text === null) continue;
    WRITE_CALL.lastIndex = 0;
    if (!WRITE_CALL.test(text)) continue;
    const hits = scanText(rel, text);
    for (const [name, fileLines] of hits.collections) {
      const bucket = out.get(name) ?? new Set<string>();
      for (const file of toFileList(fileLines, rel)) bucket.add(file);
      out.set(name, bucket);
    }
  }
  return out;
}

export async function writeUsage(repoDir: string, usage: Usage): Promise<string> {
  const target = usageJsonPath(repoDir);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(usage, null, 2)}\n`);
  return target;
}

// --- the command ------------------------------------------------------------

// argv[2] may be a path or one of the app names. A path that does not exist
// falls back to the sibling repo of the same name, so "../driverapp" works
// from any folder depth. With no argument, APP_REPO wins over the current
// directory.
export async function resolveAppRepo(argv: string[]): Promise<string> {
  const chosen = argv[2];
  if (chosen !== undefined && chosen.length > 0) {
    if (APPS.includes(chosen)) return path.join(MONOREPO_ROOT, chosen);
    const resolved = path.resolve(chosen);
    const info = await stat(resolved).catch(() => undefined);
    if (info !== undefined && info.isDirectory()) return resolved;
    const base = path.basename(resolved);
    if (APPS.includes(base)) {
      const sibling = path.join(MONOREPO_ROOT, base);
      const siblingInfo = await stat(sibling).catch(() => undefined);
      if (siblingInfo !== undefined && siblingInfo.isDirectory()) return sibling;
    }
    return resolved;
  }
  const fromEnv = process.env.APP_REPO;
  if (fromEnv !== undefined && fromEnv.length > 0) return path.resolve(fromEnv);
  return path.resolve('.');
}

async function main(): Promise<void> {
  const repo = await resolveAppRepo(process.argv);
  const usage = await scanRepo(repo);
  const target = await writeUsage(repo, usage);
  ok(
    `${usage.app} usage scanned: ${usage.collections.length} collection(s), ` +
      `${usage.fields.length} field(s), ${usage.callablesCalled.length} callable call(s), ` +
      `${usage.topics.length} topic(s), ${usage.authMethods.length} auth method(s), ` +
      `${usage.firebaseProjectIds.length} project id(s), ${usage.piiFields.length} PII field(s) -> ${target}`,
  );
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  try {
    await main();
  } catch (cause) {
    printErrors(HEADER, [errorText(cause)]);
  }
}
