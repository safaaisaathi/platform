// validate-contract.ts
//
// Checks that the contract layer is internally sound:
//   1. every collection schema in 02-contracts/collections/ parses and
//      compiles as JSON Schema draft 2020-12
//   2. every "$ref" points at an enums.json "$defs" entry
//   3. every enum definition is referenced, by a schema, by another contract
//      file, or catalogued for use outside the schemas
//   4. every enum has an "x-catalog" entry and every catalog entry has an enum
//   5. every constant's value type matches its declared "type"
//
// Prints "contract valid" and exits 0, or prints the errors and exits 1.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  COLLECTIONS_DIR,
  CONTRACTS_DIR,
  CONSTANT_METADATA_KEYS,
  CONSTANTS_PATH,
  DRAFT_2020_12,
  ENUMS_PATH,
  ENUMS_REF_PREFIX,
  KNOWN_CONSTANT_TYPES,
  asObject,
  collectRefs,
  isJsonObject,
  listCollectionSchemaFiles,
  ok,
  printErrors,
  readJson,
  singularize,
  typeMatches,
  type Json,
  type JsonObject,
} from './lib.ts';

const HEADER = 'validate-contract failed';

// ajv's own schema parameter type, aliased once so JSON.parse results can
// cross the boundary without leaking "any" into this file.
type AjvSchema = Parameters<InstanceType<typeof Ajv2020>['addSchema']>[0];

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

// Enum names referenced from the other contract files (callables.json and
// claims.json use an "enumRef" style pointer rather than "$ref").
async function collectExternalEnumRefs(): Promise<Set<string>> {
  const used = new Set<string>();
  const dirents = await readdir(CONTRACTS_DIR, { withFileTypes: true });
  for (const dirent of dirents) {
    if (!dirent.isFile() || !dirent.name.endsWith('.json') || dirent.name === 'enums.json') continue;
    const text = await readFile(path.join(CONTRACTS_DIR, dirent.name), 'utf8');
    for (const match of text.matchAll(/enums\.json#\/\$defs\/([A-Za-z0-9_.-]+)/g)) {
      used.add(match[1]);
    }
  }
  return used;
}

async function main(): Promise<void> {
  const errors: string[] = [];

  // The enum registry. Everything else resolves against it.
  const enumsDoc = asObject(await readJson(ENUMS_PATH), '02-contracts/enums.json');
  const defs = asObject(enumsDoc['$defs'] ?? {}, 'enums.json "$defs"');
  const catalog = asObject(enumsDoc['x-catalog'] ?? {}, 'enums.json "x-catalog"');

  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  ajv.addSchema(enumsDoc as AjvSchema);

  // 1. every collection schema parses, declares the draft, and compiles
  const schemaFiles = await listCollectionSchemaFiles();
  if (schemaFiles.length === 0) {
    errors.push('no collection schemas found in 02-contracts/collections/');
  }
  const schemaDocs = new Map<string, JsonObject>();
  for (const file of schemaFiles) {
    const rel = `collections/${file}`;
    let doc: Json;
    try {
      doc = await readJson(path.join(COLLECTIONS_DIR, file));
    } catch (cause) {
      errors.push(errorText(cause));
      continue;
    }
    if (!isJsonObject(doc)) {
      errors.push(`${rel}: must be a JSON object`);
      continue;
    }
    schemaDocs.set(file.replace(/\.schema\.json$/, ''), doc);
    if (doc['$schema'] !== DRAFT_2020_12) {
      errors.push(`${rel}: "$schema" must be "${DRAFT_2020_12}"`);
    }
    const expectedId = `https://safaaisaathi.contracts/collections/${file}`;
    if (doc['$id'] !== expectedId) {
      errors.push(`${rel}: "$id" must be "${expectedId}"`);
    }
    try {
      ajv.compile(doc as AjvSchema);
    } catch (cause) {
      errors.push(`${rel}: is not a valid draft 2020-12 schema: ${errorText(cause)}`);
    }
  }

  // 2. every "$ref" resolves into enums.json "$defs"
  const referencedDefs = new Set<string>();
  for (const [base, doc] of schemaDocs) {
    for (const ref of collectRefs(doc)) {
      if (!ref.startsWith(ENUMS_REF_PREFIX)) {
        errors.push(`collections/${base}.schema.json: "$ref" "${ref}" must point at ${ENUMS_REF_PREFIX}<name>`);
        continue;
      }
      const defName = ref.slice(ENUMS_REF_PREFIX.length);
      if (defName.length === 0 || !(defName in defs)) {
        errors.push(`collections/${base}.schema.json: "$ref" "${ref}" names no enum in enums.json "$defs"`);
        continue;
      }
      referencedDefs.add(defName);
    }
  }

  // 3. and 4. the enums and the catalog agree with each other and with the
  // schemas. An enum that no schema references is still alive when another
  // contract file points at it, or when its catalog entry names a consumer
  // outside the collections (for example "callable responses").
  const collectionBases = new Set(schemaDocs.keys());
  const externalRefs = await collectExternalEnumRefs();
  for (const [defName, defRaw] of Object.entries(defs)) {
    if (!isJsonObject(defRaw)) {
      errors.push(`enums.json: "$defs.${defName}" must be an object`);
      continue;
    }
    const values = defRaw['enum'];
    if (!Array.isArray(values) || values.length === 0) {
      errors.push(`enums.json: "$defs.${defName}" has no "enum" values`);
    }
    if (!(defName in catalog)) {
      errors.push(`enums.json: enum "${defName}" has no "x-catalog" entry`);
    }
  }
  for (const [catalogName, entryRaw] of Object.entries(catalog)) {
    if (!(catalogName in defs)) {
      errors.push(`enums.json: "x-catalog" entry "${catalogName}" names no enum in "$defs"`);
      continue;
    }
    if (!isJsonObject(entryRaw)) {
      errors.push(`enums.json: "x-catalog" entry "${catalogName}" must be an object`);
      continue;
    }
    const usedBy = entryRaw['usedBy'];
    if (!Array.isArray(usedBy) || usedBy.length === 0) {
      errors.push(`enums.json: "x-catalog" entry "${catalogName}" has an empty "usedBy" list`);
    }
  }
  for (const defName of Object.keys(defs)) {
    if (referencedDefs.has(defName) || externalRefs.has(defName)) continue;
    const entry = catalog[defName];
    const usedBy = isJsonObject(entry) && Array.isArray(entry['usedBy']) ? entry['usedBy'] : [];
    const usedOutsideSchemas = usedBy.some(
      (item) => typeof item === 'string' && !collectionBases.has(item) && !collectionBases.has(singularize(item)),
    );
    if (!usedOutsideSchemas) {
      errors.push(`enums.json: enum "${defName}" is not referenced by any schema, contract file or catalog consumer`);
    }
  }

  // 5. the constants: declared type vs value type
  const constantsDoc = asObject(await readJson(CONSTANTS_PATH), '02-contracts/constants.json');
  for (const [group, groupRaw] of Object.entries(constantsDoc)) {
    if (group.startsWith('$') || group.startsWith('x-') || CONSTANT_METADATA_KEYS.includes(group)) continue;
    if (!isJsonObject(groupRaw)) {
      errors.push(`constants.json: group "${group}" must be an object`);
      continue;
    }
    for (const [key, entryRaw] of Object.entries(groupRaw)) {
      if (!isJsonObject(entryRaw)) {
        errors.push(`constants.json: ${group}.${key} must be an object`);
        continue;
      }
      if (!('value' in entryRaw)) {
        errors.push(`constants.json: ${group}.${key} has no "value"`);
        continue;
      }
      const declared = entryRaw['type'];
      if (declared === undefined) continue;
      if (typeof declared !== 'string' || !KNOWN_CONSTANT_TYPES.includes(declared)) {
        errors.push(`constants.json: ${group}.${key} declares an unknown type ${JSON.stringify(declared ?? null)}`);
        continue;
      }
      if (!typeMatches(entryRaw['value'], declared)) {
        errors.push(`constants.json: ${group}.${key} declares type "${declared}" but the value does not match`);
      }
    }
  }

  if (errors.length > 0) printErrors(HEADER, errors);
  ok('contract valid');
}

try {
  await main();
} catch (cause) {
  printErrors(HEADER, [errorText(cause)]);
}
