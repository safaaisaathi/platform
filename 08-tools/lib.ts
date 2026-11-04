// Shared helpers for the 08-tools scripts.
//
// Every script resolves the platform repo from import.meta.url, so the tools
// run from any working directory.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

// The tools live in <repo>/08-tools, so the repo root is one level up.
export const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.dirname(TOOLS_DIR);
// The folder that holds the platform repo and the app repos side by side.
export const MONOREPO_ROOT = path.dirname(REPO_ROOT);

export const CONTRACTS_DIR = path.join(REPO_ROOT, '02-contracts');
export const COLLECTIONS_DIR = path.join(CONTRACTS_DIR, 'collections');
export const COMPOSED_DIR = path.join(COLLECTIONS_DIR, '.composed');
export const ENUMS_PATH = path.join(CONTRACTS_DIR, 'enums.json');
export const CONSTANTS_PATH = path.join(CONTRACTS_DIR, 'constants.json');
export const REGISTRY_PATH = path.join(CONTRACTS_DIR, 'extensions', 'registry.json');
export const RULES_DIR = path.join(REPO_ROOT, '03-rules');
export const DECISIONS_DIR = path.join(REPO_ROOT, '05-decisions');
export const CHANGES_DIR = path.join(REPO_ROOT, '06-changes');
export const MANIFEST_PATH = path.join(CHANGES_DIR, 'manifest.json');
export const VERSION_PATH = path.join(REPO_ROOT, 'VERSION');

export const APPS: readonly string[] = ['driverapp', 'userapp', 'adminpanel'];
export const DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';
export const ENUMS_REF_PREFIX = 'https://safaaisaathi.contracts/enums.json#/$defs/';
export const KNOWN_CONSTANT_TYPES: readonly string[] = [
  'string', 'number', 'integer', 'boolean', 'string[]', 'number[]',
];

// Top-level keys of constants.json that describe the file, not a group of
// constants. They carry no "value", so no exporter or checker may treat them
// as a group.
export const CONSTANT_METADATA_KEYS: readonly string[] = ['$schema', '$id', 'title', 'description'];

export function isJsonObject(value: Json): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asObject(value: Json, label: string): JsonObject {
  if (!isJsonObject(value)) throw new Error(`${label} must be a JSON object`);
  return value;
}

export function asArray(value: Json, label: string): Json[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be a JSON array`);
  return value;
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function isMissingFileError(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    (cause as { code?: unknown }).code === 'ENOENT'
  );
}

export async function readJson(filePath: string): Promise<Json> {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (cause) {
    throw new Error(`cannot read ${filePath}: ${describe(cause)}`);
  }
  try {
    return JSON.parse(text) as Json;
  } catch (cause) {
    throw new Error(`${filePath} is not valid JSON: ${describe(cause)}`);
  }
}

// Reads a JSON file, or returns undefined when the file does not exist.
// A file that exists but does not parse is still an error.
export async function tryReadJson(filePath: string): Promise<Json | undefined> {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (cause) {
    if (isMissingFileError(cause)) return undefined;
    throw new Error(`cannot read ${filePath}: ${describe(cause)}`);
  }
  try {
    return JSON.parse(text) as Json;
  } catch (cause) {
    throw new Error(`${filePath} is not valid JSON: ${describe(cause)}`);
  }
}

export function printErrors(header: string, errors: string[]): never {
  console.error(`${header}: ${errors.length} error(s)`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

export function ok(line: string): void {
  console.log(line);
}

// The target app repo: argv[2] wins, then APP_REPO, then the current directory.
export function resolveTargetRepo(argv: string[]): string {
  const chosen = argv[2] ?? process.env.APP_REPO ?? '.';
  return path.resolve(chosen);
}

export async function currentContractVersion(): Promise<string> {
  const text = await readFile(VERSION_PATH, 'utf8');
  return text.trim();
}

export function schemaBaseName(file: string): string {
  return file.replace(/\.schema\.json$/, '');
}

export async function listCollectionSchemaFiles(): Promise<string[]> {
  const dirents = await readdir(COLLECTIONS_DIR, { withFileTypes: true });
  return dirents
    .filter((dirent) => dirent.isFile() && dirent.name.endsWith('.schema.json'))
    .map((dirent) => dirent.name)
    .sort();
}

export async function readCollectionSchemas(): Promise<Map<string, JsonObject>> {
  const schemas = new Map<string, JsonObject>();
  for (const file of await listCollectionSchemaFiles()) {
    const doc = await readJson(path.join(COLLECTIONS_DIR, file));
    schemas.set(schemaBaseName(file), asObject(doc, `collections/${file}`));
  }
  return schemas;
}

// The manifest and the catalog use plural collection names ("wards"), the
// schema files are singular ("ward"). Try the name as given, then the
// singular forms.
export function singularize(name: string): string {
  if (name.endsWith('ies')) return `${name.slice(0, -3)}y`;
  if (name.endsWith('s')) return name.slice(0, -1);
  return name;
}

// Maps a subcollection's own name to the schema that documents it. A schema
// with "x-path": "trips/{tripId}/trail/{chunkIndex}" is the trail schema, so
// "trail" resolves to "trailChunk". Without this, an app that writes
// collection('trail') is reported as touching an unknown collection, because
// the schema file's base name is trailChunk, not trail.
export function collectionAliases(
  schemas: ReadonlyMap<string, JsonObject>
): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const [base, schema] of schemas) {
    const xPath = schema['x-path'];
    if (typeof xPath !== 'string') continue;
    // The last path segment that is a literal name, not a {placeholder}.
    const last = xPath
      .split('/')
      .reverse()
      .find((segment) => segment.length > 0 && !segment.startsWith('{') && !segment.endsWith('}'));
    if (last === undefined || last === base) continue;
    if (!aliases.has(last)) aliases.set(last, base);
  }
  return aliases;
}

export function resolveCollectionName(
  name: string,
  known: ReadonlySet<string>,
  aliases?: ReadonlyMap<string, string>
): string | null {
  if (known.has(name)) return name;
  const alias = aliases?.get(name);
  if (alias !== undefined && known.has(alias)) return alias;
  const singular = singularize(name);
  if (singular !== name && known.has(singular)) return singular;
  return null;
}

// Collects every "$ref" string value in a JSON tree, including inside arrays
// and sibling keywords.
export function collectRefs(node: Json, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, out);
  } else if (isJsonObject(node)) {
    const ref = node['$ref'];
    if (typeof ref === 'string') out.push(ref);
    for (const [key, value] of Object.entries(node)) {
      if (key !== '$ref') collectRefs(value, out);
    }
  }
  return out;
}

// True when "fieldPath" ("center.lat", "phoneMasked") names a property in the
// schema. Nested paths walk the "properties" of each object field.
export function fieldExists(schema: JsonObject | undefined, fieldPath: string): boolean {
  if (schema === undefined) return false;
  let node: Json | undefined = schema['properties'];
  for (const segment of fieldPath.split('.')) {
    if (!isJsonObject(node)) return false;
    node = node[segment];
  }
  return node !== undefined;
}

// Reads the registered extension files and returns the extra property names
// each collection gets from them.
//
// A field owned by an extension IS a real field of the document. The manifest
// may name it in affectedFields, and the strict composed schema accepts it.
// So a field-existence check has to look at the core schema AND at the
// registered extensions, or it reports a legitimate extension field as
// missing.
export async function collectExtensionFields(): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  const registryRaw = await tryReadJson(REGISTRY_PATH);
  if (registryRaw === undefined || !isJsonObject(registryRaw)) return out;

  const apps = registryRaw['apps'];
  if (!isJsonObject(apps)) return out;

  for (const entryRaw of Object.values(apps)) {
    if (!isJsonObject(entryRaw)) continue;

    // The mirror lives inside the platform repo, so it is readable on a bare CI
    // checkout where the app repos are absent. Fall back to the app's own file
    // only for a registry that predates the mirror.
    const mirror = entryRaw['mirror'];
    const source = entryRaw['source'];
    const candidates: string[] = [];
    if (typeof mirror === 'string' && mirror.length > 0) candidates.push(path.resolve(REPO_ROOT, mirror));
    if (typeof source === 'string' && source.length > 0) candidates.push(path.resolve(MONOREPO_ROOT, source));

    let extRaw: Json | undefined;
    for (const candidate of candidates) {
      try {
        extRaw = await tryReadJson(candidate);
      } catch {
        // A broken mirror must not stop the fallback to the app's own file.
        extRaw = undefined;
      }
      if (extRaw !== undefined) break;
    }
    if (extRaw === undefined || !isJsonObject(extRaw)) continue;

    const extendsMap = extRaw['extends'];
    if (!isJsonObject(extendsMap)) continue;

    for (const [collectionKey, specRaw] of Object.entries(extendsMap)) {
      if (!isJsonObject(specRaw)) continue;
      const propsRaw = specRaw['properties'];
      if (!isJsonObject(propsRaw)) continue;
      const names = out.get(collectionKey) ?? new Set<string>();
      for (const name of Object.keys(propsRaw)) names.add(name);
      out.set(collectionKey, names);
    }
  }
  return out;
}

// True when the field exists in the core schema, or is owned by a registered
// extension of that collection.
export function fieldExistsWithExtensions(
  schemas: ReadonlyMap<string, JsonObject>,
  extensionFields: ReadonlyMap<string, ReadonlySet<string>>,
  collection: string,
  fieldPath: string,
): boolean {
  if (fieldExists(schemas.get(collection), fieldPath)) return true;
  const names = extensionFields.get(collection);
  if (names === undefined) return false;
  const top = fieldPath.split('.')[0];
  // A dotted path inside an extension-owned field is only valid when the
  // extension declares the nested shape, which the extension model does not
  // allow for now. Only the top-level name is accepted.
  return names.has(top);
}

// Lists every file under "dir", relative and sorted. Empty for an empty dir.
export async function listFilesRecursive(dir: string): Promise<string[]> {
  const out: string[] = [];
  const dirents = await readdir(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    if (dirent.isDirectory()) {
      const nested = await listFilesRecursive(path.join(dir, dirent.name));
      for (const rel of nested) out.push(`${dirent.name}/${rel}`);
    } else if (dirent.isFile()) {
      out.push(dirent.name);
    }
  }
  return out.sort();
}

// Lists every markdown file under "dir", absolute and sorted.
export async function listMarkdownFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (current: string): Promise<void> => {
    const dirents = await readdir(current, { withFileTypes: true });
    for (const dirent of dirents) {
      const full = path.join(current, dirent.name);
      if (dirent.isDirectory()) await walk(full);
      else if (dirent.isFile() && dirent.name.endsWith('.md')) out.push(full);
    }
  };
  await walk(dir);
  return out.sort();
}

export type ConstantEntry = {
  group: string;
  groupNote: string | undefined;
  key: string;
  value: Json | undefined;
  declaredType: string | undefined;
  unit: string | undefined;
  note: string | undefined;
};

// Flattens constants.json into an ordered list. Metadata keys ("$schema",
// "x-groups") are skipped. Structural problems come back as errors.
export function flattenConstants(doc: JsonObject): { entries: ConstantEntry[]; errors: string[] } {
  const groupsMeta = isJsonObject(doc['x-groups']) ? doc['x-groups'] : {};
  const entries: ConstantEntry[] = [];
  const errors: string[] = [];
  for (const [group, groupRaw] of Object.entries(doc)) {
    if (group.startsWith('$') || group.startsWith('x-') || CONSTANT_METADATA_KEYS.includes(group)) continue;
    if (!isJsonObject(groupRaw)) {
      errors.push(`constants.json: group "${group}" must be an object`);
      continue;
    }
    const groupNote = typeof groupsMeta[group] === 'string' ? groupsMeta[group] : undefined;
    for (const [key, entryRaw] of Object.entries(groupRaw)) {
      if (!isJsonObject(entryRaw)) {
        errors.push(`constants.json: ${group}.${key} must be an object`);
        continue;
      }
      entries.push({
        group,
        groupNote,
        key,
        value: entryRaw['value'],
        declaredType: typeof entryRaw['type'] === 'string' ? entryRaw['type'] : undefined,
        unit: typeof entryRaw['unit'] === 'string' ? entryRaw['unit'] : undefined,
        note: typeof entryRaw['note'] === 'string' ? entryRaw['note'] : undefined,
      });
    }
  }
  return { entries, errors };
}

// True when the value fits the declared type. Unknown declared types return
// false, the caller owns the clearer message.
export function typeMatches(value: Json | undefined, declared: string): boolean {
  switch (declared) {
    case 'string':
      return typeof value === 'string';
    case 'number':
    case 'integer':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'string[]':
      return Array.isArray(value) && value.every((item) => typeof item === 'string');
    case 'number[]':
      return Array.isArray(value) && value.every((item) => typeof item === 'number');
    default:
      return false;
  }
}

// --- The PRD pointer frontmatter -------------------------------------------

export const PRDS_DIR = path.join(REPO_ROOT, '01-prds');

export type ContractRefs = {
  collections: string[];
  fields: string[];
  enums: string[];
};

// Reads the YAML frontmatter of a markdown file as a flat map of the
// top-level keys. A key with a block value maps to the raw lines of that
// block, indented, so the caller can read the shape it expects.
export function readFrontmatter(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') return out;
  let end = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '---') {
      end = index;
      break;
    }
  }
  if (end < 0) return out;

  let currentKey: string | undefined;
  let currentBlock: string[] = [];

  const flush = (): void => {
    if (currentKey !== undefined) out.set(currentKey, currentBlock.join('\n'));
    currentKey = undefined;
    currentBlock = [];
  };

  for (let index = 1; index < end; index += 1) {
    const line = lines[index];
    if (/^[A-Za-z_][A-Za-z0-9_-]*:/.test(line)) {
      flush();
      const colon = line.indexOf(':');
      currentKey = line.slice(0, colon);
      const rest = line.slice(colon + 1).trim();
      if (rest.length > 0) {
        out.set(currentKey, rest);
        currentKey = undefined;
      }
      continue;
    }
    if (currentKey !== undefined) currentBlock.push(line);
  }
  flush();

  return out;
}

// Parses the contractRefs block of a PRD pointer. The format is fixed by
// 01-prds/README.md: three keys, each either an inline list
// "collections: [a, b]" or a block of "- item" lines.
export function parseContractRefs(frontmatter: Map<string, string>): ContractRefs {
  const block = frontmatter.get('contractRefs') ?? '';
  const refs: ContractRefs = { collections: [], fields: [], enums: [] };

  let current: keyof ContractRefs | undefined;
  for (const raw of block.split('\n')) {
    if (raw.trim().length === 0) continue;

    const keyMatch = /^\s*(collections|fields|enums):\s*(.*)$/.exec(raw);
    if (keyMatch) {
      const key = keyMatch[1] as keyof ContractRefs;
      current = key;
      const rest = keyMatch[2].trim();
      if (rest.startsWith('[') && rest.endsWith(']')) {
        const inner = rest.slice(1, -1);
        for (const item of inner.split(',')) {
          const trimmed = item.trim();
          if (trimmed.length > 0) refs[key].push(trimmed);
        }
        current = undefined;
      }
      continue;
    }

    const itemMatch = /^\s*-\s+(.*)$/.exec(raw);
    if (itemMatch && current !== undefined) {
      const value = itemMatch[1].trim();
      if (value.length > 0) refs[current].push(value);
    }
  }

  return refs;
}
