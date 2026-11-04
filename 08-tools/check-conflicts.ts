// check-conflicts.ts
//
// Compares the three apps' usage.json with the shared contract and reports
// every place where an app disagrees with the contract or with another app:
//   1. UNKNOWN COLLECTION      the app touches a collection with no schema
//   2. UNKNOWN FIELD           the app touches a field the schema does not have
//   3. PII IN A SHARED COLLECTION   a personal-data field the schema forbids
//   4. DIRECT ADMIN WRITE      the admin panel writes a collection directly
//   5. NO AUTH                 anonymous sign-in, so the claims cannot exist
//   6. UNKNOWN CALLABLE        a callable that is not in callables.json
//   7. PLANNED CALLABLE        a callable whose lifecycle is still planned
//   8. FIREBASE PROJECT MISMATCH    the app is on another Firebase project
//   9. COLLECTION SHARED WITHOUT AGREEMENT  one app has a field the other lacks
//  10. TOPIC MISMATCH          a topic that is not in topics.json
//
// The usage data must be fresh, so this runs scan-usage.ts itself for any app
// whose .contract/usage.json is missing or older than its newest source file.
// It calls the module's exported function; it never shells out.
//
// Usage: node --experimental-strip-types check-conflicts.ts [--app <name>]
//
// Without --app it checks every app. With --app it still loads every app (the
// shared-field check compares them), but it reports and fails on that app's
// conflicts only. --app=<name> works too. A bare positional argument is not an
// app filter: only --app selects one.
//
// Exits 0 with a clean summary when there are no conflicts, 1 when there is at
// least one. The summary table is printed before the conflict lines because
// printErrors exits.

import { stat } from 'node:fs/promises';
import path from 'node:path';

import {
  APPS,
  COLLECTIONS_DIR,
  CONTRACTS_DIR,
  MONOREPO_ROOT,
  REGISTRY_PATH,
  REPO_ROOT,
  asObject,
  collectExtensionFields,
  collectionAliases,
  fieldExists,
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
import {
  PII_FIELD_NAMES,
  newestSourceMs,
  scanRepo,
  scanWriteTargets,
  usageJsonPath,
  writeUsage,
  type Usage,
} from './scan-usage.ts';

const HEADER = 'check-conflicts failed';
const CALLABLES_PATH = path.join(CONTRACTS_DIR, 'callables.json');
const TOPICS_PATH = path.join(CONTRACTS_DIR, 'topics.json');
const CLAIMS_PATH = path.join(CONTRACTS_DIR, 'claims.json');
const FIREBASERC_PATH = path.join(REPO_ROOT, '.firebaserc');

// The kind order is the order the checks run in, and the order of the summary
// columns.
const KINDS = [
  'UNKNOWN COLLECTION',
  'UNKNOWN FIELD',
  'PII IN A SHARED COLLECTION',
  'DIRECT ADMIN WRITE',
  'NO AUTH',
  'UNKNOWN CALLABLE',
  'PLANNED CALLABLE',
  'FIREBASE PROJECT MISMATCH',
  'COLLECTION SHARED WITHOUT AGREEMENT',
  'TOPIC MISMATCH',
] as const;

type Kind = (typeof KINDS)[number];

// Severity is this tool's own scale, not the contract's S0..S4 change scale:
// P0 is a security hole or data going to the wrong database, P1 breaks a
// feature at runtime, P2 is a routing or observability defect.
const SEVERITY: Record<Kind, 'P0' | 'P1' | 'P2'> = {
  'UNKNOWN COLLECTION': 'P1',
  'UNKNOWN FIELD': 'P1',
  'PII IN A SHARED COLLECTION': 'P0',
  'DIRECT ADMIN WRITE': 'P0',
  'NO AUTH': 'P1',
  'UNKNOWN CALLABLE': 'P1',
  'PLANNED CALLABLE': 'P1',
  'FIREBASE PROJECT MISMATCH': 'P0',
  'COLLECTION SHARED WITHOUT AGREEMENT': 'P1',
  'TOPIC MISMATCH': 'P2',
};

const SHORT_HEADERS: Record<Kind, string> = {
  'UNKNOWN COLLECTION': 'UNK-COLL',
  'UNKNOWN FIELD': 'UNK-FIELD',
  'PII IN A SHARED COLLECTION': 'PII',
  'DIRECT ADMIN WRITE': 'ADMIN-W',
  'NO AUTH': 'NO-AUTH',
  'UNKNOWN CALLABLE': 'UNK-CALL',
  'PLANNED CALLABLE': 'PLANNED',
  'FIREBASE PROJECT MISMATCH': 'PROJECT',
  'COLLECTION SHARED WITHOUT AGREEMENT': 'SHARED',
  'TOPIC MISMATCH': 'TOPIC',
};

const PII_FIELD_SET: ReadonlySet<string> = new Set(PII_FIELD_NAMES.map((name) => name.toLowerCase()));
const SEVERITY_ORDER: readonly string[] = ['P0', 'P1', 'P2'];
const APP_NAMES = APPS.join(', ');

type Conflict = { kind: Kind; app: string; message: string };

// Reads --app from the command line. argv[0] is node and argv[1] is this file,
// so the scan starts at argv[2]. A bare positional is not an app filter: the
// app prompts pass "." as argv[2], and that must keep meaning "no filter".
function parseAppFilter(argv: readonly string[]): string | undefined {
  let selected: string | undefined;
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    let name: string;
    if (arg === '--app') {
      const next = argv[index + 1];
      if (next === undefined) {
        printErrors(HEADER, [`--app needs a name. Valid apps: ${APP_NAMES}`]);
      }
      name = next;
      index += 1;
    } else if (arg.startsWith('--app=')) {
      name = arg.slice('--app='.length);
    } else {
      continue;
    }
    if (name.length === 0) {
      printErrors(HEADER, [`--app needs a name. Valid apps: ${APP_NAMES}`]);
    }
    if (!APPS.includes(name)) {
      printErrors(HEADER, [`unknown app "${name}". Valid apps: ${APP_NAMES}`]);
    }
    if (selected !== undefined && selected !== name) {
      printErrors(HEADER, [
        `--app given twice with different names: "${selected}" and "${name}". Valid apps: ${APP_NAMES}`,
      ]);
    }
    selected = name;
  }
  return selected;
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function locations(files: readonly string[], count = 2): string {
  if (files.length === 0) return 'no location';
  const shown = files.slice(0, count).join(', ');
  const rest = files.length - count;
  return rest > 0 ? `${shown}, and ${rest} more` : shown;
}

// --- the contract lookups ---------------------------------------------------

// True when "name" is a property somewhere in the schema, at the top level or
// nested. A text scanner cannot tell driver.lastLocation.lat from a top-level
// lat, so a nested match counts: it keeps the tool quiet about lastLocation.lat
// while still catching a phone number on a document whose schema has none.
function schemaDeclaresProperty(node: Json | undefined, name: string): boolean {
  if (Array.isArray(node)) return node.some((item) => schemaDeclaresProperty(item, name));
  if (!isJsonObject(node)) return false;
  const properties = node['properties'];
  if (isJsonObject(properties)) {
    if (name in properties) return true;
    for (const value of Object.values(properties)) {
      if (schemaDeclaresProperty(value, name)) return true;
    }
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'properties' || key === 'required') continue;
    if (schemaDeclaresProperty(value, name)) return true;
  }
  return false;
}

// The extra fields each app's own extension file adds, per collection. An
// extension registered by one app does not legitimise another app's field, so
// this is keyed by app.
async function readAppExtensionFields(
  known: ReadonlySet<string>,
): Promise<Map<string, Map<string, Set<string>>>> {
  const byApp = new Map<string, Map<string, Set<string>>>();
  const registryRaw = await tryReadJson(REGISTRY_PATH);
  if (registryRaw === undefined || !isJsonObject(registryRaw)) return byApp;
  const apps = registryRaw['apps'];
  if (!isJsonObject(apps)) return byApp;

  for (const [app, entryRaw] of Object.entries(apps)) {
    if (!isJsonObject(entryRaw)) continue;
    const source = entryRaw['source'];
    if (typeof source !== 'string' || source.length === 0) continue;
    const extRaw = await tryReadJson(path.resolve(MONOREPO_ROOT, source));
    if (extRaw === undefined || !isJsonObject(extRaw)) continue;
    const extendsMap = extRaw['extends'];
    if (!isJsonObject(extendsMap)) continue;

    const perCollection = new Map<string, Set<string>>();
    for (const [collectionKey, specRaw] of Object.entries(extendsMap)) {
      if (!isJsonObject(specRaw)) continue;
      const base = resolveCollectionName(collectionKey, known) ?? collectionKey;
      const properties = specRaw['properties'];
      if (!isJsonObject(properties)) continue;
      const names = perCollection.get(base) ?? new Set<string>();
      for (const name of Object.keys(properties)) names.add(name);
      perCollection.set(base, names);
    }
    byApp.set(app, perCollection);
  }
  return byApp;
}

function extensionHas(
  extensions: ReadonlyMap<string, Map<string, Set<string>>>,
  app: string,
  collection: string,
  name: string,
): boolean {
  const perCollection = extensions.get(app);
  if (perCollection === undefined) return false;
  const names = perCollection.get(collection);
  if (names === undefined) return false;
  return names.has(name.split('.')[0]);
}

// The parent collection and its subcollections, grouped. A schema with
// "x-path": "trips/{tripId}/trail/{chunkIndex}" is a child of the trips
// schema, and the two form one document tree. The scanner attributes a field
// per FILE, by the nearest collection literal, so in a file that names both
// "trips" and "trail" it cannot tell which one a field belongs to. This map
// lets the field check accept a field that belongs to either side of the tree.
function documentTreeRelations(
  schemas: ReadonlyMap<string, JsonObject>,
  known: ReadonlySet<string>,
  aliases: ReadonlyMap<string, string>,
): Map<string, Set<string>> {
  const childrenByRoot = new Map<string, Set<string>>();
  for (const [base, schema] of schemas) {
    const xPath = schema['x-path'];
    if (typeof xPath !== 'string') continue;
    const root = xPath.split('/')[0];
    const rootBase = resolveCollectionName(root, known, aliases) ?? root;
    const children = childrenByRoot.get(rootBase) ?? new Set<string>();
    children.add(base);
    childrenByRoot.set(rootBase, children);
  }

  const relations = new Map<string, Set<string>>();
  for (const [root, children] of childrenByRoot) {
    const group = new Set<string>([root, ...children]);
    for (const base of group) relations.set(base, group);
  }
  return relations;
}

// --- fresh usage ------------------------------------------------------------

function looksLikeUsage(raw: Json): raw is Json & Usage {
  if (!isJsonObject(raw)) return false;
  for (const key of [
    'collections',
    'fields',
    'callablesCalled',
    'topics',
    'authMethods',
    'firebaseProjectIds',
    'piiFields',
  ]) {
    if (!Array.isArray(raw[key])) return false;
  }
  return Array.isArray(raw['callablesDefined']);
}

// Reads the app's usage.json, rescans when it is missing, unreadable or older
// than the newest source file, and keeps the file on disk fresh.
async function loadUsage(app: string, repoDir: string): Promise<Usage> {
  const target = usageJsonPath(repoDir);
  const info = await stat(target).catch(() => undefined);
  const newest = await newestSourceMs(repoDir);

  if (info !== undefined && info.mtimeMs >= newest) {
    const raw = await tryReadJson(target);
    if (raw !== undefined && looksLikeUsage(raw)) return raw;
    console.log(`rescanning ${app}: .contract/usage.json is not readable as usage data`);
  } else {
    console.log(`rescanning ${app}: .contract/usage.json is ${info === undefined ? 'missing' : 'older than the source'}`);
  }

  const usage = await scanRepo(repoDir);
  await writeUsage(repoDir, usage);
  return usage;
}

// --- the checks -------------------------------------------------------------

async function main(): Promise<void> {
  // Parse the filter first, so a bad name fails before the slow scan.
  const selectedApp = parseAppFilter(process.argv);
  const reportApps: readonly string[] = selectedApp === undefined ? APPS : [selectedApp];

  const conflicts: Conflict[] = [];
  const fatal: string[] = [];

  // The platform's own Firebase project, read from .firebaserc. Never hardcode
  // this: the file is the single place a human changes it.
  let platformProjectId: string | undefined;
  const firebasercRaw = await tryReadJson(FIREBASERC_PATH);
  if (firebasercRaw === undefined) {
    fatal.push('.firebaserc is missing, so the platform Firebase project is unknown');
  } else if (!isJsonObject(firebasercRaw) || !isJsonObject(firebasercRaw['projects'])) {
    fatal.push('.firebaserc must hold a "projects" object');
  } else {
    const chosen = firebasercRaw['projects']['default'];
    if (typeof chosen !== 'string' || chosen.length === 0) {
      fatal.push('.firebaserc has no "projects.default", so the platform Firebase project is unknown');
    } else {
      platformProjectId = chosen;
    }
  }

  const schemas = await readCollectionSchemas();
  const known = new Set(schemas.keys());
  // Subcollection names ("trail", "receipts") resolve to their schema file
  // ("trailChunk", "noticeReceipt") through each schema's x-path.
  const aliases = collectionAliases(schemas);
  const tree = documentTreeRelations(schemas, known, aliases);
  const extensions = await readAppExtensionFields(known);
  const callablesDoc = asObject(await readJson(CALLABLES_PATH), '02-contracts/callables.json');
  const callableEntries = new Map<string, JsonObject>();
  for (const section of ['x-callables', 'x-server-functions']) {
    const group = callablesDoc[section];
    if (!isJsonObject(group)) continue;
    for (const [name, entryRaw] of Object.entries(group)) {
      if (isJsonObject(entryRaw)) callableEntries.set(name, entryRaw);
    }
  }
  const claimsDoc = asObject(await readJson(CLAIMS_PATH), '02-contracts/claims.json');
  const claimEntries = isJsonObject(claimsDoc['x-claims']) ? claimsDoc['x-claims'] : {};
  const topicsDoc = asObject(await readJson(TOPICS_PATH), '02-contracts/topics.json');
  const topicTable = readTopicTable(topicsDoc);

  const usages = new Map<string, Usage>();
  const repos = new Map<string, string>();
  for (const app of APPS) {
    const repoDir = path.join(MONOREPO_ROOT, app);
    const info = await stat(repoDir).catch(() => undefined);
    if (info === undefined || !info.isDirectory()) {
      fatal.push(`${app}: app repo not visible at ${repoDir}`);
      continue;
    }
    repos.set(app, repoDir);
    usages.set(app, await loadUsage(app, repoDir));
  }

  // What each app touches, resolved to schema base names.
  const resolved = new Map<string, Set<string>>();
  const touchedBy = new Map<string, Set<string>>();
  const fieldSets = new Map<string, Map<string, Set<string>>>();

  for (const [app, usage] of usages) {
    const collections = new Set<string>();
    for (const entry of usage.collections) {
      const base = resolveCollectionName(entry.name, known, aliases);
      if (base === null) {
        conflicts.push({
          kind: 'UNKNOWN COLLECTION',
          app,
          message:
            `${app}: UNKNOWN COLLECTION "${entry.name}" (${locations(entry.files)}). ` +
            `No 02-contracts/collections/${entry.name}.schema.json, so every other app is blind to it. ` +
            'Add the schema, or stop touching the collection.',
        });
        continue;
      }
      collections.add(base);
      const owners = touchedBy.get(base) ?? new Set<string>();
      owners.add(app);
      touchedBy.set(base, owners);
    }
    resolved.set(app, collections);

    const perCollection = new Map<string, Set<string>>();
    for (const field of usage.fields) {
      const base = resolveCollectionName(field.collection, known, aliases);
      if (base === null) continue;
      const names = perCollection.get(base) ?? new Set<string>();
      names.add(field.name);
      perCollection.set(base, names);
    }
    fieldSets.set(app, perCollection);
  }

  // 2, 3 and 9: the fields.
  for (const [app, usage] of usages) {
    for (const field of usage.fields) {
      const base = resolveCollectionName(field.collection, known, aliases);
      if (base === null) continue;
      if (schemaDeclaresProperty(schemas.get(base), field.name)) continue;
      if (extensionHas(extensions, app, base, field.name)) continue;

      // A file that names both a parent and its subcollection ("trips" and
      // "trail") cannot have its fields attributed to one side by proximity
      // alone. When the field is missing on this side but a schema on the same
      // document tree declares it, the field belongs to the tree, not here.
      const relatives = tree.get(base);
      if (
        relatives !== undefined &&
        [...relatives].some(
          (other) => other !== base && schemaDeclaresProperty(schemas.get(other), field.name),
        )
      ) {
        continue;
      }

      if (PII_FIELD_SET.has(field.name.toLowerCase())) {
        conflicts.push({
          kind: 'PII IN A SHARED COLLECTION',
          app,
          message:
            `${app}: PII IN A SHARED COLLECTION, ${base}.${field.name} is personal data and ` +
            `${base}.schema.json does not declare it (${locations(field.files)}). It is readable by ` +
            'every caller the rules let read the document. Move it out of the collection or declare ' +
            'it and restrict the read.',
        });
        continue;
      }

      const owners = touchedBy.get(base) ?? new Set<string>();
      const onlyHere = [...owners].filter((other) => {
        const names = fieldSets.get(other)?.get(base);
        return names !== undefined && names.has(field.name);
      });
      if (owners.size > 1 && onlyHere.length === 1) {
        const others = [...owners].filter((other) => other !== app).join(', ');
        conflicts.push({
          kind: 'COLLECTION SHARED WITHOUT AGREEMENT',
          app,
          message:
            `${app}: COLLECTION SHARED WITHOUT AGREEMENT, ${base}.${field.name} is used by ${app} only, ` +
            `while ${others} also touches ${base} (${locations(field.files)}). The contract has no such ` +
            'field, so one side of the feature is missing. Agree the field in the schema, or drop it.',
        });
        continue;
      }

      conflicts.push({
        kind: 'UNKNOWN FIELD',
        app,
        message:
          `${app}: UNKNOWN FIELD ${base}.${field.name} (${locations(field.files)}). ` +
          `${base}.schema.json has no such field and no registered extension adds it. ` +
          'Add it to the contract, register an extension, or stop using it.',
      });
    }
  }

  // 4: the admin panel writes directly. Every admin write must go through a
  // callable, so the live staff document is checked before the write.
  const adminRepo = repos.get('adminpanel');
  if (adminRepo !== undefined) {
    const writeTargets = await scanWriteTargets(adminRepo);
    for (const [name, files] of writeTargets) {
      const base = resolveCollectionName(name, known, aliases) ?? name;
      conflicts.push({
        kind: 'DIRECT ADMIN WRITE',
        app: 'adminpanel',
        message:
          `adminpanel: DIRECT ADMIN WRITE to "${base}" (${locations([...files].sort())}). ` +
          'An admin write must go through a callable, because only the server can read the live ' +
          'staff document and lock out a revoked staff member. CHG-0004.',
      });
    }
  }

  // 5: anonymous sign-in without a custom token.
  for (const [app, usage] of usages) {
    const methods = new Set(usage.authMethods.map((entry) => entry.name));
    if (!methods.has('signInAnonymously') || methods.has('signInWithCustomToken')) continue;
    const claimed = Object.entries(claimEntries)
      .filter(([, entryRaw]) => isJsonObject(entryRaw) && Array.isArray(entryRaw['apps']) && entryRaw['apps'].includes(app))
      .map(([claim, entryRaw]): { claim: string; mintedBy: string } => {
        const mintedBy = Array.isArray(entryRaw['mintedBy']) && typeof entryRaw['mintedBy'][0] === 'string'
          ? (entryRaw['mintedBy'][0] as string)
          : 'an unknown callable';
        return { claim, mintedBy };
      });
    if (claimed.length === 0) {
      conflicts.push({
        kind: 'NO AUTH',
        app,
        message:
          `${app}: NO AUTH, it signs in anonymously and never calls signInWithCustomToken. ` +
          'An anonymous token carries no claims, so every rule that reads a claim denies.',
      });
      continue;
    }
    for (const { claim, mintedBy } of claimed) {
      const callsMinter = usage.callablesCalled.some((entry) => entry.name === mintedBy);
      conflicts.push({
        kind: 'NO AUTH',
        app,
        message:
          `${app}: NO AUTH, missing the ${claim} claim. It signs in anonymously and never calls ` +
          `signInWithCustomToken, and it ${callsMinter ? 'calls' : 'never calls'} ${mintedBy}, which mints ` +
          `${claim}. The rules deny every write that depends on it. Mint the token in the session bootstrap.`,
      });
    }
  }

  // 6 and 7: the callables.
  for (const [app, usage] of usages) {
    for (const called of usage.callablesCalled) {
      const entry = callableEntries.get(called.name);
      if (entry === undefined) {
        conflicts.push({
          kind: 'UNKNOWN CALLABLE',
          app,
          message:
            `${app}: UNKNOWN CALLABLE "${called.name}" (${locations(called.files)}). It is in neither ` +
            'x-callables nor x-server-functions of 02-contracts/callables.json, so the call has no ' +
            'contract and no implementation. Remove the call or open a contract request.',
        });
        continue;
      }
      const lifecycle = typeof entry['lifecycle'] === 'string' ? entry['lifecycle'] : 'unknown';
      if (lifecycle !== 'planned') continue;
      const implementation = isJsonObject(entry['implementation']) && typeof entry['implementation']['source'] === 'string'
        ? (entry['implementation']['source'] as string)
        : 'its implementation file';
      conflicts.push({
        kind: 'PLANNED CALLABLE',
        app,
        message:
          `${app}: PLANNED CALLABLE "${called.name}" (${locations(called.files)}). Its lifecycle is ` +
          `"planned", so ${implementation} does not exist yet and the call fails at runtime with ` +
          'not-found, which looks like a network bug. Wait for it to ship, or remove the call.',
      });
    }
  }

  // 8: the Firebase project.
  if (platformProjectId !== undefined) {
    for (const [app, usage] of usages) {
      const ids = usage.firebaseProjectIds;
      if (ids.length === 0) {
        conflicts.push({
          kind: 'FIREBASE PROJECT MISMATCH',
          app,
          message:
            `${app}: FIREBASE PROJECT MISMATCH, no project id in the source at all. The platform ` +
            `project is ${platformProjectId}, so nobody can tell which project this build writes to.`,
        });
        continue;
      }
      // Only a hardcoded id is evidence. An id read from an env var
      // (VITE_FIREBASE_PROJECT_ID) is resolved at build time, so this tool
      // cannot judge it and does not pretend to.
      const hardcoded = ids.filter((entry) => entry.hardcoded);
      if (hardcoded.length === 0) continue;
      const wrong = hardcoded.filter((entry) => entry.value !== platformProjectId);
      if (wrong.length === 0) continue;
      const listed = wrong.map((entry) => `${entry.value} (${locations(entry.files, 1)})`).join(', ');
      const hasRight = hardcoded.some((entry) => entry.value === platformProjectId);
      conflicts.push({
        kind: 'FIREBASE PROJECT MISMATCH',
        app,
        message:
          `${app}: FIREBASE PROJECT MISMATCH, ${listed}. The platform project is ${platformProjectId}` +
          `${hasRight ? ', and this app also names it, so a fallback or a second config is pointing elsewhere' : ''}. ` +
          'Point every config at the platform project; a fallback default is how a build silently ' +
          'writes to the wrong database.',
      });
    }
  }

  // 10: the topics.
  for (const [app, usage] of usages) {
    for (const topic of usage.topics) {
      if (topicIsContracted(topic.name, topic.kind, topicTable)) continue;
      conflicts.push({
        kind: 'TOPIC MISMATCH',
        app,
        message:
          `${app}: TOPIC MISMATCH "${topic.name}" (${locations(topic.files)}). 02-contracts/topics.json ` +
          'has no such topic, so nothing will ever publish to it. Use a contracted topic or add it first.',
      });
    }
  }

  // --- the report -----------------------------------------------------------

  // The checks above always load every app, because the shared-field check
  // compares them. Only the report and the exit code follow --app.
  const reported =
    selectedApp === undefined
      ? conflicts
      : conflicts.filter((conflict) => conflict.app === selectedApp);

  printSummary(reportApps, reported);
  if (reported.length === 0 && fatal.length === 0) {
    ok(
      selectedApp === undefined
        ? 'no conflicts: every app agrees with the contract'
        : `no conflicts: ${selectedApp} agrees with the contract`,
    );
    return;
  }
  printErrors(HEADER, [...fatal, ...reported.map((conflict) => conflict.message)]);
}

type TopicRow = { key: string; prefix: string };

function readTopicTable(topicsDoc: JsonObject): TopicRow[] {
  const table = topicsDoc['x-topics'];
  if (!isJsonObject(table)) return [];
  return Object.keys(table).map((key) => ({ key, prefix: key.replace(/\{[^}]*\}/g, '') }));
}

// A literal topic matches either a full key ("all") or the prefix of a
// parameterised one ("ward_1" is a ward topic). A template topic matches the
// prefix of a parameterised key ("ward_").
function topicIsContracted(name: string, kind: string, table: readonly TopicRow[]): boolean {
  for (const row of table) {
    const parameterised = row.prefix !== row.key;
    if (kind === 'template') {
      if (parameterised && (name === row.prefix || name === row.key)) return true;
      continue;
    }
    if (name === row.key || name === row.prefix) return true;
    if (parameterised && name.startsWith(row.prefix) && name.length > row.prefix.length) return true;
  }
  return false;
}

function pad(text: string, width: number): string {
  return text.padEnd(width);
}

function printSummary(apps: readonly string[], conflicts: readonly Conflict[]): void {
  const counts = new Map<string, Map<Kind, number>>();
  for (const app of apps) counts.set(app, new Map<Kind, number>());
  for (const conflict of conflicts) {
    const perApp = counts.get(conflict.app);
    if (perApp === undefined) continue;
    perApp.set(conflict.kind, (perApp.get(conflict.kind) ?? 0) + 1);
  }

  const headers = ['APP', ...KINDS.map((kind) => SHORT_HEADERS[kind]), 'TOTAL', 'WORST'];
  const rows: string[][] = [];
  for (const app of apps) {
    const perApp = counts.get(app) ?? new Map<Kind, number>();
    const cells = KINDS.map((kind) => String(perApp.get(kind) ?? 0));
    const total = cells.reduce((sum, value) => sum + Number(value), 0);
    const worst = worstSeverity(perApp);
    rows.push([app, ...cells, String(total), worst]);
  }
  const totalRow: string[] = ['TOTAL'];
  for (let index = 1; index < headers.length - 1; index += 1) {
    const sum = rows.reduce((accumulator, row) => accumulator + Number(row[index]), 0);
    totalRow.push(String(sum));
  }
  totalRow.push(worstSeverityOf(conflicts));

  const widths = headers.map((header, index) =>
    Math.max(header.length, totalRow[index].length, ...rows.map((row) => row[index].length)),
  );
  const line = (cells: readonly string[]): string =>
    cells.map((cell, index) => pad(cell, widths[index])).join('  ').trimEnd();

  console.log('');
  console.log(line(headers));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const row of rows) console.log(line(row));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  console.log(line(totalRow));

  const total = conflicts.length;
  console.log('');
  console.log(`total conflicts: ${total}`);
  console.log(`severity: ${total === 0 ? 'none' : worstSeverityOf(conflicts)}`);
}

function worstSeverity(perApp: ReadonlyMap<Kind, number>): string {
  for (const severity of SEVERITY_ORDER) {
    for (const [kind, count] of perApp) {
      if (count > 0 && SEVERITY[kind] === severity) return severity;
    }
  }
  return '-';
}

function worstSeverityOf(conflicts: readonly Conflict[]): string {
  for (const severity of SEVERITY_ORDER) {
    if (conflicts.some((conflict) => SEVERITY[conflict.kind] === severity)) return severity;
  }
  return '-';
}

try {
  await main();
} catch (cause) {
  printErrors(HEADER, [errorText(cause)]);
}
