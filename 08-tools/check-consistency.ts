// check-consistency.ts
//
// Checks that the change manifest and the extension registry agree with the
// contract:
//   1. every affectedFields[].path names a field that exists in the
//      corresponding collection schema. A path whose change is "renamed" or
//      "removed" names the old field, which may already be gone, so only the
//      collection is checked there. A renamed target ("to") must exist.
//   2. every affectedCollections[] entry names a real collection schema file.
//      Plural names ("wards") resolve to their singular schema ("ward").
//   3. every affectedApps[] entry is one of driverapp, userapp, adminpanel
//   4. every entry has a severity in S0..S4 and a priority in P0..P4
//   5. every entry has explainedIn pointing at a file that exists under
//      06-changes/
//   6. every registry entry has a "source" shaped
//      <app>/.contract/extensions/<app>.json, an "app" matching the key, and,
//      when the file is visible in this checkout, a matching hash
//
// With no 06-changes/manifest.json yet this prints
// "manifest consistent (no manifest yet)" and exits 0.

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  APPS,
  CHANGES_DIR,
  ENUMS_PATH,
  MANIFEST_PATH,
  MONOREPO_ROOT,
  PRDS_DIR,
  REGISTRY_PATH,
  REPO_ROOT,
  asArray,
  asObject,
  collectExtensionFields,
  fieldExists,
  fieldExistsWithExtensions,
  isJsonObject,
  listMarkdownFiles,
  ok,
  parseContractRefs,
  printErrors,
  readCollectionSchemas,
  readFrontmatter,
  resolveCollectionName,
  tryReadJson,
  type Json,
  type JsonObject,
} from './lib.ts';

const HEADER = 'check-consistency failed';
const SEVERITIES = new Set(['S0', 'S1', 'S2', 'S3', 'S4']);
const PRIORITIES = new Set(['P0', 'P1', 'P2', 'P3', 'P4']);

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function changeKind(field: JsonObject): string {
  return typeof field['change'] === 'string' ? field['change'] : '';
}

async function main(): Promise<void> {
  const manifestRaw = await tryReadJson(MANIFEST_PATH);
  if (manifestRaw === undefined) {
    ok('manifest consistent (no manifest yet)');
    return;
  }
  if (!isJsonObject(manifestRaw)) {
    printErrors(HEADER, ['06-changes/manifest.json must be a JSON object']);
  }

  const errors: string[] = [];
  const schemas = await readCollectionSchemas();
  const known = new Set(schemas.keys());
  // A field owned by a registered extension is a real field of the document.
  // The manifest is allowed to name it.
  const extensionFields = await collectExtensionFields();
  const changes = asArray(manifestRaw['changes'] ?? [], 'manifest.json "changes"');
  const seenIds = new Set<string>();

  for (const changeRaw of changes) {
    if (!isJsonObject(changeRaw)) {
      errors.push('manifest.json: a change entry is not an object');
      continue;
    }
    const id = typeof changeRaw['id'] === 'string' ? changeRaw['id'] : '(missing id)';
    if (typeof changeRaw['id'] !== 'string' || changeRaw['id'].length === 0) {
      errors.push('manifest.json: a change entry has no "id"');
    } else if (seenIds.has(id)) {
      errors.push(`${id}: duplicate change id`);
    }
    seenIds.add(id);

    // severity and priority
    const severity = changeRaw['severity'];
    if (typeof severity !== 'string' || !SEVERITIES.has(severity)) {
      errors.push(`${id}: severity must be one of S0..S4, got ${JSON.stringify(severity ?? null)}`);
    }
    const priority = changeRaw['priority'];
    if (typeof priority !== 'string' || !PRIORITIES.has(priority)) {
      errors.push(`${id}: priority must be one of P0..P4, got ${JSON.stringify(priority ?? null)}`);
    }

    // affected apps
    const affectedApps = asArray(changeRaw['affectedApps'] ?? [], `${id} affectedApps`);
    for (const app of affectedApps) {
      if (typeof app !== 'string' || !APPS.includes(app)) {
        errors.push(`${id}: affectedApps entry ${JSON.stringify(app ?? null)} is not one of ${APPS.join(', ')}`);
      }
    }

    // affected collections
    const affectedCollections = asArray(changeRaw['affectedCollections'] ?? [], `${id} affectedCollections`);
    for (const collection of affectedCollections) {
      if (typeof collection !== 'string' || resolveCollectionName(collection, known) === null) {
        errors.push(`${id}: affectedCollections entry ${JSON.stringify(collection ?? null)} names no collection schema file`);
      }
    }

    // affected fields
    const affectedFields = asArray(changeRaw['affectedFields'] ?? [], `${id} affectedFields`);
    for (const fieldRaw of affectedFields) {
      if (!isJsonObject(fieldRaw)) {
        errors.push(`${id}: an affectedFields entry is not an object`);
        continue;
      }
      const fieldPath = fieldRaw['path'];
      if (typeof fieldPath !== 'string' || fieldPath.length === 0) {
        errors.push(`${id}: an affectedFields entry has no "path"`);
        continue;
      }
      const dot = fieldPath.indexOf('.');
      if (dot < 1 || dot === fieldPath.length - 1) {
        errors.push(`${id}: affectedFields path "${fieldPath}" must look like <collection>.<field>`);
        continue;
      }
      const base = resolveCollectionName(fieldPath.slice(0, dot), known);
      if (base === null) {
        errors.push(`${id}: affectedFields path "${fieldPath}" names no collection schema`);
        continue;
      }
      const fieldName = fieldPath.slice(dot + 1);
      const kind = changeKind(fieldRaw);

      // A renamed field must land on a field that exists now.
      if (kind === 'renamed' && typeof fieldRaw['to'] === 'string') {
        const target = fieldRaw['to'];
        const targetDot = target.indexOf('.');
        if (targetDot < 1 || targetDot === target.length - 1) {
          errors.push(`${id}: renamed target "${target}" must look like <collection>.<field>`);
        } else {
          const targetBase = resolveCollectionName(target.slice(0, targetDot), known);
          const targetField = target.slice(targetDot + 1);
          if (targetBase === null) {
            errors.push(`${id}: renamed target "${target}" names no collection schema`);
          } else if (!fieldExists(schemas.get(targetBase), targetField)) {
            errors.push(`${id}: renamed target "${target}" does not exist in ${targetBase}.schema.json`);
          }
        }
      }

      // The old name of a renamed or removed field may already be gone from
      // the schema. Every other kind must name a field that exists, in the
      // core schema or in a registered extension.
      if (kind !== 'removed' && kind !== 'renamed' && !fieldExistsWithExtensions(schemas, extensionFields, base, fieldName)) {
        errors.push(`${id}: affectedFields path "${fieldPath}" names no field in ${base}.schema.json`);
      }
    }

    // explainedIn must point at a real file under 06-changes/
    const explainedIn = changeRaw['explainedIn'];
    if (typeof explainedIn !== 'string' || explainedIn.length === 0) {
      errors.push(`${id}: explainedIn is missing`);
      continue;
    }
    const resolved = path.resolve(CHANGES_DIR, explainedIn);
    const rel = path.relative(CHANGES_DIR, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      errors.push(`${id}: explainedIn "${explainedIn}" escapes 06-changes/`);
      continue;
    }
    const explainedStat = await stat(resolved).catch(() => undefined);
    if (explainedStat === undefined || !explainedStat.isFile()) {
      errors.push(`${id}: explainedIn "${explainedIn}" names no file under 06-changes/`);
    }
  }

  // The extension registry
  const registryRaw = await tryReadJson(REGISTRY_PATH);
  if (registryRaw === undefined) {
    errors.push('02-contracts/extensions/registry.json is missing');
  } else if (!isJsonObject(registryRaw)) {
    errors.push('02-contracts/extensions/registry.json must be a JSON object');
  } else {
    const apps = asObject(registryRaw['apps'] ?? {}, 'registry.json "apps"');
    for (const [app, entryRaw] of Object.entries(apps)) {
      if (!isJsonObject(entryRaw)) {
        errors.push(`registry.json: entry "${app}" must be an object`);
        continue;
      }
      const expectedSource = `${app}/.contract/extensions/${app}.json`;
      const source = entryRaw['source'];
      if (source !== expectedSource) {
        errors.push(`registry.json: "${app}" source must be "${expectedSource}", got ${JSON.stringify(source ?? null)}`);
      }
      if (entryRaw['app'] !== undefined && entryRaw['app'] !== app) {
        errors.push(`registry.json: entry "${app}" declares app ${JSON.stringify(entryRaw['app'])}, which does not match the key`);
      }

      // The registry enforces the app's file by hash. That only works when
      // the app repo is checked out next to the platform repo.
      const sourcePath = path.resolve(MONOREPO_ROOT, expectedSource);
      let fileText: string;
      try {
        fileText = await readFile(sourcePath, 'utf8');
      } catch {
        errors.push(`registry.json: the extension file for "${app}" is not visible at ${sourcePath}`);
        continue;
      }
      let extDoc: Json;
      try {
        extDoc = JSON.parse(fileText) as Json;
      } catch {
        errors.push(`registry.json: the extension file for "${app}" is not valid JSON`);
        continue;
      }
      if (isJsonObject(extDoc) && extDoc['app'] !== undefined && extDoc['app'] !== app) {
        errors.push(`registry.json: the extension file for "${app}" declares app ${JSON.stringify(extDoc['app'])}`);
      }

      // The registry's "extends" list must match the file's own "extends"
      // keys. Otherwise the registry is a summary that can drift from the
      // thing it summarizes, and a reader trusts the summary.
      const registeredExtends = asArray(entryRaw['extends'] ?? [], `registry.json "${app}" extends`);
      if (isJsonObject(extDoc)) {
        const fileExtends = extDoc['extends'];
        const fileKeys = isJsonObject(fileExtends) ? Object.keys(fileExtends).sort() : [];
        const listed = registeredExtends
          .filter((item): item is string => typeof item === 'string')
          .slice()
          .sort();
        if (listed.join(',') !== fileKeys.join(',')) {
          errors.push(`registry.json: "${app}" extends [${listed.join(', ')}] does not match the extension file's collections [${fileKeys.join(', ')}]`);
        }
      }

      const hash = entryRaw['hash'];
      if (typeof hash === 'string' && hash.startsWith('sha256:')) {
        const actual = `sha256:${createHash('sha256').update(fileText).digest('hex')}`;
        if (actual !== hash) {
          errors.push(`registry.json: "${app}" hash mismatch, registered ${hash}, actual ${actual}`);
        }
      }
    }
  }

  // The PRD pointers. Every collection, field and enum a PRD names must still
  // exist. A PRD that names a field which was renamed six months ago is a
  // stale PRD, and this is where it gets caught.
  const enumDefsRaw = await tryReadJson(ENUMS_PATH);
  const enumNames = new Set<string>();
  if (enumDefsRaw !== undefined && isJsonObject(enumDefsRaw) && isJsonObject(enumDefsRaw['$defs'])) {
    for (const name of Object.keys(enumDefsRaw['$defs'])) enumNames.add(name);
  }

  const prdFiles = (await listMarkdownFiles(PRDS_DIR)).filter((file) => file !== path.join(PRDS_DIR, 'README.md'));
  for (const prdFile of prdFiles) {
    const rel = path.relative(REPO_ROOT, prdFile);
    const text = await readFile(prdFile, 'utf8');
    const frontmatter = readFrontmatter(text);
    if (!frontmatter.has('contractRefs')) continue;
    const refs = parseContractRefs(frontmatter);

    for (const collection of refs.collections) {
      if (resolveCollectionName(collection, known) === null) {
        errors.push(`${rel}: contractRefs.collections names "${collection}", which has no collection schema`);
      }
    }

    for (const fieldPath of refs.fields) {
      const dot = fieldPath.indexOf('.');
      if (dot < 1 || dot === fieldPath.length - 1) {
        errors.push(`${rel}: contractRefs.fields entry "${fieldPath}" must look like <collection>.<field>`);
        continue;
      }
      const base = resolveCollectionName(fieldPath.slice(0, dot), known);
      if (base === null) {
        errors.push(`${rel}: contractRefs.fields entry "${fieldPath}" names no collection schema`);
        continue;
      }
      if (!fieldExists(schemas.get(base), fieldPath.slice(dot + 1))) {
        errors.push(`${rel}: contractRefs.fields entry "${fieldPath}" names no field in ${base}.schema.json`);
      }
    }

    for (const enumName of refs.enums) {
      if (!enumNames.has(enumName)) {
        errors.push(`${rel}: contractRefs.enums names "${enumName}", which is not in enums.json`);
      }
    }
  }

  if (errors.length > 0) printErrors(HEADER, errors);
  ok('manifest consistent');
}

try {
  await main();
} catch (cause) {
  printErrors(HEADER, [errorText(cause)]);
}
