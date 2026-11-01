// build-schemas.ts
//
// Composes the raw collection schemas plus the registered app extensions into
// generated, self-contained schemas under 02-contracts/collections/.composed/:
//   <name>.schema.json         plain composed: core properties with enum refs
//                              inlined and registered extension properties
//                              merged, so validators that do not resolve
//                              external refs work
//   <name>.strict.schema.json  the strict version: with extensions it is
//                              "allOf" plus "unevaluatedProperties: false",
//                              with zero extensions it is the core with
//                              "additionalProperties: false"
//
// The raw files stay permissive (see 02-contracts/README.md rule 3). The
// composed files are generated: never edit them by hand.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  COMPOSED_DIR,
  DRAFT_2020_12,
  ENUMS_PATH,
  ENUMS_REF_PREFIX,
  MONOREPO_ROOT,
  REGISTRY_PATH,
  asObject,
  isJsonObject,
  ok,
  printErrors,
  readCollectionSchemas,
  readJson,
  resolveCollectionName,
  tryReadJson,
  type Json,
  type JsonObject,
} from './lib.ts';

const HEADER = 'build-schemas failed';

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

type ExtensionMerge = { app: string; properties: JsonObject };
type ComposedSchema = { base: string; plain: JsonObject; strict: JsonObject };

// Replaces every enums.json "$ref" inside the schema with a copy of the enum
// definition, so the composed file needs no external resolution. Sibling
// keywords of the "$ref" survive.
function makeInliner(defs: JsonObject): (node: Json) => Json {
  const inline = (node: Json): Json => {
    if (Array.isArray(node)) return node.map(inline);
    if (!isJsonObject(node)) return node;
    const ref = node['$ref'];
    if (typeof ref === 'string' && ref.startsWith(ENUMS_REF_PREFIX)) {
      const defName = ref.slice(ENUMS_REF_PREFIX.length);
      const def = defs[defName];
      if (def === undefined) throw new Error(`"$ref" "${ref}" names no enum in enums.json`);
      const rest: JsonObject = { ...node };
      delete rest['$ref'];
      const inlinedDef = inline(def);
      return isJsonObject(inlinedDef) ? { ...inlinedDef, ...rest } : rest;
    }
    const out: JsonObject = {};
    for (const [key, value] of Object.entries(node)) out[key] = inline(value);
    return out;
  };
  return inline;
}

// Reads the registered extension files and maps each collection to the
// extension properties that must be merged into it. The registry's "source"
// paths are relative to the folder that holds the platform repo and the app
// repos side by side.
async function collectExtensionMerges(known: ReadonlySet<string>): Promise<{
  merges: Map<string, ExtensionMerge[]>;
  errors: string[];
  mergeCount: number;
}> {
  const merges = new Map<string, ExtensionMerge[]>();
  const errors: string[] = [];
  let mergeCount = 0;
  const registryRaw = await tryReadJson(REGISTRY_PATH);
  if (registryRaw === undefined || !isJsonObject(registryRaw)) {
    return { merges, errors, mergeCount };
  }
  const apps = asObject(registryRaw['apps'] ?? {}, 'registry.json "apps"');
  for (const [app, entryRaw] of Object.entries(apps)) {
    if (!isJsonObject(entryRaw)) {
      errors.push(`registry.json: entry "${app}" must be an object`);
      continue;
    }
    const sourcePath = path.resolve(MONOREPO_ROOT, `${app}/.contract/extensions/${app}.json`);
    const extRaw = await tryReadJson(sourcePath);
    if (extRaw === undefined) {
      errors.push(`registry.json: the extension file for "${app}" is not visible at ${sourcePath}`);
      continue;
    }
    if (!isJsonObject(extRaw)) {
      errors.push(`the extension file for "${app}" must be a JSON object`);
      continue;
    }
    const extendsMap = asObject(extRaw['extends'] ?? {}, `the extension file for "${app}"`);
    for (const [collectionKey, specRaw] of Object.entries(extendsMap)) {
      const base = resolveCollectionName(collectionKey, known);
      if (base === null) {
        errors.push(`the extension file for "${app}" extends unknown collection "${collectionKey}"`);
        continue;
      }
      if (!isJsonObject(specRaw)) {
        errors.push(`the extension file for "${app}" must map "${collectionKey}" to an object`);
        continue;
      }
      // The extension model allows additions only. A "required" list in an
      // extension would change the document shape for every reader.
      if (specRaw['required'] !== undefined) {
        errors.push(`the extension file for "${app}" adds required fields to "${base}", which the extension model forbids`);
      }
      const propsRaw = asObject(specRaw['properties'] ?? {}, `the extension file for "${app}", collection "${collectionKey}"`);
      const properties: JsonObject = {};
      for (const [propName, propRaw] of Object.entries(propsRaw)) {
        if (!isJsonObject(propRaw)) {
          errors.push(`the extension file for "${app}" declares "${collectionKey}.${propName}" that is not an object`);
          continue;
        }
        properties[propName] = propRaw;
      }
      const list = merges.get(base) ?? [];
      list.push({ app, properties });
      merges.set(base, list);
      mergeCount += 1;
    }
  }
  return { merges, errors, mergeCount };
}

async function main(): Promise<void> {
  const errors: string[] = [];

  const enumsDoc = asObject(await readJson(ENUMS_PATH), '02-contracts/enums.json');
  const defs = asObject(enumsDoc['$defs'] ?? {}, 'enums.json "$defs"');
  const schemas = await readCollectionSchemas();
  const known = new Set(schemas.keys());
  if (schemas.size === 0) {
    printErrors(HEADER, ['no collection schemas found in 02-contracts/collections/']);
  }

  const { merges, errors: extensionErrors, mergeCount } = await collectExtensionMerges(known);
  errors.push(...extensionErrors);
  const inlineEnumRefs = makeInliner(defs);

  const composed: ComposedSchema[] = [];
  for (const [base, doc] of schemas) {
    let core: JsonObject;
    try {
      core = asObject(inlineEnumRefs(doc), `collections/${base}.schema.json`);
    } catch (cause) {
      errors.push(`${base}: ${errorText(cause)}`);
      continue;
    }
    const coreTitle = typeof core['title'] === 'string' ? core['title'] : base;
    const coreProps = isJsonObject(core['properties']) ? core['properties'] : {};

    // Merge the extension properties for this collection. An extension may
    // only add a field nobody else has.
    const extProps: JsonObject = {};
    for (const merge of merges.get(base) ?? []) {
      for (const [propName, propRaw] of Object.entries(merge.properties)) {
        if (propName in coreProps) {
          errors.push(`extension "${merge.app}" redefines the core field "${base}.${propName}"`);
          continue;
        }
        if (propName in extProps) {
          errors.push(`extension "${merge.app}" redefines the extension field "${base}.${propName}" added by another extension`);
          continue;
        }
        extProps[propName] = propRaw;
      }
    }

    const note =
      'Generated by 08-tools/build-schemas.ts from the raw schema plus registered extensions. Do not edit by hand. Regenerate with: node 08-tools/build-schemas.ts';
    const plainId = `https://safaaisaathi.contracts/collections/.composed/${base}.schema.json`;
    const strictId = `https://safaaisaathi.contracts/collections/.composed/${base}.strict.schema.json`;
    const { $schema: _s, $id: _i, title: _t, description: _d, properties: _p, ...rest } = core;

    const plain: JsonObject = {
      $schema: DRAFT_2020_12,
      $id: plainId,
      title: `${coreTitle} (composed)`,
      description: note,
      ...rest,
      type: 'object',
      properties: { ...coreProps, ...extProps },
    };

    // Zero extensions: the core itself, closed. With extensions: the classic
    // allOf pattern, where "unevaluatedProperties: false" sees properties
    // declared in any branch.
    const strict: JsonObject =
      Object.keys(extProps).length === 0
        ? {
            $schema: DRAFT_2020_12,
            $id: strictId,
            title: `${coreTitle} (composed, strict)`,
            description: note,
            ...rest,
            properties: { ...coreProps },
            additionalProperties: false,
          }
        : {
            $schema: DRAFT_2020_12,
            $id: strictId,
            title: `${coreTitle} (composed, strict)`,
            description: note,
            allOf: [core, { type: 'object', properties: { ...extProps } }],
            unevaluatedProperties: false,
          };

    composed.push({ base, plain, strict });
  }

  // Nothing is written until every schema composed cleanly, so a failed run
  // never leaves a half-generated folder behind.
  if (errors.length > 0) printErrors(HEADER, errors);

  await rm(COMPOSED_DIR, { recursive: true, force: true });
  await mkdir(COMPOSED_DIR, { recursive: true });
  let written = 0;
  for (const item of composed) {
    await writeFile(path.join(COMPOSED_DIR, `${item.base}.schema.json`), `${JSON.stringify(item.plain, null, 2)}\n`);
    await writeFile(path.join(COMPOSED_DIR, `${item.base}.strict.schema.json`), `${JSON.stringify(item.strict, null, 2)}\n`);
    written += 2;
    console.log(`wrote collections/.composed/${item.base}.schema.json and collections/.composed/${item.base}.strict.schema.json`);
  }
  ok(`composed schemas built: ${composed.length} collections, ${mergeCount} extension merge(s), ${written} files in 02-contracts/collections/.composed`);
}

try {
  await main();
} catch (cause) {
  printErrors(HEADER, [errorText(cause)]);
}
