// check-x-writes.ts
//
// Checks that each collection schema's x-writes header agrees with the strict
// Firestore rules. x-writes is the contract's claim of who writes a document.
// The rules are the enforcement. When the two disagree, an app team reads the
// header and writes code the rules will deny, or trusts a field the rules do
// not protect. Nothing else checked this, which is how they drifted apart.
//
// This is a COARSE check, on purpose. It is not a CEL parser. It answers two
// questions, for the top-level collections only:
//   1. If x-writes names a client app for a direct write, do the strict rules
//      allow that collection to be written by a client at all?
//   2. If x-writes names the fields, is each one inside the rule's
//      hasOnly([...]) set?
//
// A subcollection (a schema with x-path) is skipped: its rule is nested under
// its parent, and this tool does not descend.
//
// Usage: node --experimental-strip-types check-x-writes.ts
// Exits 0 when every header agrees with the strict rules, 1 otherwise.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  APPS,
  RULES_DIR,
  collectionAliases,
  isJsonObject,
  ok,
  printErrors,
  readCollectionSchemas,
  resolveCollectionName,
  type JsonObject,
} from './lib.ts';

const HEADER = 'check-x-writes failed';
const STRICT_RULES = path.join(RULES_DIR, 'firestore.strict.rules');

const MATCH_PATTERN = /match\s+\/([A-Za-z0-9_]+)\/\{[A-Za-z0-9_]+\}\s*\{/g;
const ALLOW_PATTERN = /allow\s+([^;]*);/g;
const HAS_ONLY_PATTERN = /hasOnly\(\s*\[([^\]]*)\]/g;
const QUOTED_PATTERN = /['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

// Skips a quoted string and returns the offset just past its closing quote.
function skipString(text: string, start: number): number {
  const quote = text[start];
  let index = start + 1;
  while (index < text.length) {
    if (text[index] === '\\') {
      index += 2;
      continue;
    }
    if (text[index] === quote) return index + 1;
    index += 1;
  }
  return text.length;
}

// The offset of the "}" that closes the "{" at "open".
function matchingBrace(text: string, open: number): number {
  let depth = 0;
  let index = open;
  while (index < text.length) {
    const ch = text[index];
    if (ch === "'" || ch === '"') {
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
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
    index += 1;
  }
  return text.length;
}

// Removes every nested "match ... { ... }" block from a block body, so the
// parent's own allow lines are the only ones left. The trips block holds the
// nested trail block, and the trail's allow line must not read as the trip's.
function stripNestedMatches(body: string): string {
  const pattern = new RegExp(MATCH_PATTERN.source, 'g');
  let result = '';
  let cursor = 0;
  let found = pattern.exec(body);
  while (found !== null) {
    const open = found.index + found[0].length - 1;
    result += body.slice(cursor, found.index);
    cursor = matchingBrace(body, open) + 1;
    pattern.lastIndex = cursor;
    found = pattern.exec(body);
  }
  result += body.slice(cursor);
  return result;
}

// name -> the body of each top-level match block. A nested block is jumped
// over, so it is not recorded and does not leak into its parent.
function ruleBlocks(source: string): Map<string, string> {
  const blocks = new Map<string, string>();
  const pattern = new RegExp(MATCH_PATTERN.source, 'g');
  let found = pattern.exec(source);
  while (found !== null) {
    const open = found.index + found[0].length - 1;
    const close = matchingBrace(source, open);
    blocks.set(found[1], source.slice(open + 1, close));
    pattern.lastIndex = close + 1;
    found = pattern.exec(source);
  }
  return blocks;
}

type RuleFacts = { allowsClientWrite: boolean; hasOnlyFields: Set<string> };

function ruleFacts(body: string): RuleFacts {
  const flat = stripNestedMatches(body);

  const hasOnlyFields = new Set<string>();
  HAS_ONLY_PATTERN.lastIndex = 0;
  let only = HAS_ONLY_PATTERN.exec(flat);
  while (only !== null) {
    QUOTED_PATTERN.lastIndex = 0;
    let quoted = QUOTED_PATTERN.exec(only[1]);
    while (quoted !== null) {
      hasOnlyFields.add(quoted[1]);
      quoted = QUOTED_PATTERN.exec(only[1]);
    }
    only = HAS_ONLY_PATTERN.exec(flat);
  }

  let allowsClientWrite = false;
  ALLOW_PATTERN.lastIndex = 0;
  let allow = ALLOW_PATTERN.exec(flat);
  while (allow !== null) {
    const clause = allow[1].replace(/\s+/g, ' ').trim();
    const touchesWrite = /\b(create|update|delete|write)\b/.test(clause);
    const denied = /if false$/.test(clause);
    if (touchesWrite && !denied) allowsClientWrite = true;
    allow = ALLOW_PATTERN.exec(flat);
  }

  return { allowsClientWrite, hasOnlyFields };
}

// The field names an x-writes entry claims, or null when the entry is prose
// rather than a clean "app: f1, f2" list. A token that is not an identifier or
// not a real property means the entries are words, not fields, so the tool
// does not guess. This is the coarse trade: it checks the clean lists only.
function declaredFields(entry: string, schema: JsonObject): string[] | null {
  const colon = entry.indexOf(':');
  if (colon < 0) return null;
  const tokens = entry
    .slice(colon + 1)
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return null;

  const properties = isJsonObject(schema['properties']) ? schema['properties'] : {};
  for (const token of tokens) {
    if (!IDENTIFIER.test(token)) return null;
    if (!Object.prototype.hasOwnProperty.call(properties, token)) return null;
  }
  return tokens;
}

async function main(): Promise<void> {
  const source = await readFile(STRICT_RULES, 'utf8');
  const schemas = await readCollectionSchemas();
  const known = new Set(schemas.keys());
  const aliases = collectionAliases(schemas);

  // The rule block of each top-level collection, keyed by schema base name so
  // "trips" and trip.schema.json meet.
  const blocksByBase = new Map<string, string>();
  for (const [name, body] of ruleBlocks(source)) {
    const base = resolveCollectionName(name, known, aliases);
    if (base !== null && !blocksByBase.has(base)) blocksByBase.set(base, body);
  }

  const errors: string[] = [];
  let checked = 0;

  for (const [base, schema] of schemas) {
    // A subcollection's rule is nested. Skipped, by design.
    if (typeof schema['x-path'] === 'string') continue;

    const xWrites = schema['x-writes'];
    if (!Array.isArray(xWrites)) continue;

    for (const entryRaw of xWrites) {
      if (typeof entryRaw !== 'string') continue;
      const entry = entryRaw.trim();
      if (entry.length === 0) continue;
      // A via entry is a callable write, not a direct client write.
      if (/\bvia\b/.test(entry)) continue;

      const head = entry.split(/[:\s,]/)[0];
      if (!APPS.includes(head)) continue;

      const bare = entry === head;
      const fields = declaredFields(entry, schema);
      // A bare app name always claims a write. An "app: ..." entry claims one
      // only when its field list is clean; "app: NONE" and other prose do not.
      if (!bare && fields === null) continue;

      const body = blocksByBase.get(base);
      if (body === undefined) {
        errors.push(
          `${base}.schema.json x-writes names "${head}" for a direct write, but ` +
            `${path.basename(STRICT_RULES)} has no match /${base}/.../ block for it.`
        );
        continue;
      }

      const facts = ruleFacts(body);
      if (!facts.allowsClientWrite) {
        errors.push(
          `${base}.schema.json x-writes names "${head}" for a direct write, but the strict ` +
            `rules deny every client write on ${base} (allow create, update, delete: if false). ` +
            'The schema and the rules disagree.'
        );
        continue;
      }

      if (fields !== null && facts.hasOnlyFields.size > 0) {
        for (const field of fields) {
          if (!facts.hasOnlyFields.has(field)) {
            errors.push(
              `${base}.schema.json x-writes lets ${head} write ${base}.${field}, but the strict ` +
                `rules' hasOnly([...]) does not list it (listed: ${[...facts.hasOnlyFields].sort().join(', ')}).`
            );
          }
        }
      }
      checked += 1;
    }
  }

  if (errors.length > 0) printErrors(HEADER, errors);
  ok(`check-x-writes: ${checked} client direct-write claim(s) agree with ${path.basename(STRICT_RULES)}`);
}

try {
  await main();
} catch (cause) {
  printErrors(HEADER, [errorText(cause)]);
}
