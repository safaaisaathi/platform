// check-features.ts
//
// Checks every feature entry in 02-contracts/features/ against the feature
// schema and against the rest of the contract:
//   1. the file parses and matches feature.schema.json (draft 2020-12)
//   2. the file name is the feature id, and the id and the scenario id are
//      unique across the folder
//   3. every contractRefs entry resolves: a collection schema exists, a
//      callable is in callables.json, an enum is in enums.json "$defs", a
//      constant is in constants.json, a step ref names a real field
//   4. every step path ("collection/{id}") names a real collection and keeps
//      the id placeholder
//   5. the slices agree with the journey: unique ids, an app that is one of the
//      actors, evidence for a built/wired/verified state, dependsOn ids that
//      exist, and no wired slice that waits on an unspecified one
//   6. the declared status is the status the slices imply
//   7. every handoff has a producer: the "from" app has a step that writes the
//      handoff's path, or the handoff names a real callable or topic
//   8. the scenario is runnable at the tier the slices claim: a verified slice
//      needs a simulated or live tier
//
// Usage: node --experimental-strip-types check-features.ts
//
// Exits 0 when every entry is sound (or when the folder holds no entry), 1
// otherwise. The summary table is printed before the error lines because
// printErrors exits.
//
// Node's type stripping is on: no enums, no namespaces, no parameter
// properties, and types come in with "import type".

import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ValidateFunction } from 'ajv';

import {
  CONTRACTS_DIR,
  CONSTANTS_PATH,
  ENUMS_PATH,
  asObject,
  collectExtensionFields,
  fieldExistsWithExtensions,
  flattenConstants,
  isJsonObject,
  ok,
  printErrors,
  readCollectionSchemas,
  readJson,
  resolveCollectionName,
  type Json,
  type JsonObject,
} from './lib.ts';

const HEADER = 'check-features failed';
const FEATURES_DIR = path.join(CONTRACTS_DIR, 'features');
const FEATURE_SCHEMA_PATH = path.join(FEATURES_DIR, 'feature.schema.json');
const CALLABLES_PATH = path.join(CONTRACTS_DIR, 'callables.json');
const TOPICS_PATH = path.join(CONTRACTS_DIR, 'topics.json');

// Anything in the folder that is documentation, not a feature entry.
const NOT_A_FEATURE: ReadonlySet<string> = new Set(['README.md', 'feature.schema.json']);

type AjvSchema = Parameters<InstanceType<typeof Ajv2020>['addSchema']>[0];
type AjvError = { instancePath?: string; message?: string };

// The shape feature.schema.json guarantees once a document validates. It is
// declared here so the semantic checks below read like prose instead of
// index lookups; nothing validates against these types at runtime.
type FeatureStep = {
  n: number;
  actor: string;
  action: string;
  via: string;
  reads: string[];
  writes: string[];
  contractRefs?: string[];
  notes?: string;
};

type FeatureSlice = {
  id: string;
  app: string;
  surface: string;
  state: string;
  dependsOn: string[];
  contractRefs?: string[];
  evidence?: string;
  blockedBy?: string;
};

type FeatureHandoff = {
  from: string;
  to: string;
  via: string;
  latency?: string;
  notes?: string;
};

type Feature = {
  id: string;
  title: string;
  status: string;
  owner: string;
  updated: string;
  journey: string;
  actors: string[];
  steps: FeatureStep[];
  slices: FeatureSlice[];
  handoffs: FeatureHandoff[];
  contractRefs: {
    collections: string[];
    callables: string[];
    enums?: string[];
    constants?: string[];
  };
  scenario: {
    id: string;
    name: string;
    steps: string[];
    tiers: string[];
  };
  openQuestions?: string[];
};

// Everything the semantic checks resolve against, read once.
type Contract = {
  schemas: Map<string, JsonObject>;
  known: Set<string>;
  extensionFields: Map<string, Set<string>>;
  callables: Set<string>;
  enums: Set<string>;
  constants: Set<string>;
  topics: TopicRow[];
};

type TopicRow = { key: string; prefix: string };

type Problem = { feature: string; message: string };

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

// --- reading the contract ---------------------------------------------------

async function readCallableNames(): Promise<Set<string>> {
  const doc = asObject(await readJson(CALLABLES_PATH), '02-contracts/callables.json');
  const names = new Set<string>();
  for (const section of ['x-callables', 'x-server-functions']) {
    const group = doc[section];
    if (!isJsonObject(group)) continue;
    for (const name of Object.keys(group)) names.add(name);
  }
  return names;
}

async function readEnumNames(): Promise<Set<string>> {
  const doc = asObject(await readJson(ENUMS_PATH), '02-contracts/enums.json');
  const defs = asObject(doc['$defs'] ?? {}, 'enums.json "$defs"');
  return new Set(Object.keys(defs));
}

async function readConstantNames(): Promise<Set<string>> {
  const doc = asObject(await readJson(CONSTANTS_PATH), '02-contracts/constants.json');
  const { entries, errors } = flattenConstants(doc);
  if (errors.length > 0) throw new Error(errors.join('; '));
  return new Set(entries.map((entry) => `${entry.group}.${entry.key}`));
}

async function readTopics(): Promise<TopicRow[]> {
  const doc = asObject(await readJson(TOPICS_PATH), '02-contracts/topics.json');
  const table = doc['x-topics'];
  if (!isJsonObject(table)) return [];
  return Object.keys(table).map((key) => ({ key, prefix: key.replace(/\{[^}]*\}/g, '') }));
}

async function readContract(): Promise<Contract> {
  const schemas = await readCollectionSchemas();
  return {
    schemas,
    known: new Set(schemas.keys()),
    extensionFields: await collectExtensionFields(),
    callables: await readCallableNames(),
    enums: await readEnumNames(),
    constants: await readConstantNames(),
    topics: await readTopics(),
  };
}

// --- resolution helpers -----------------------------------------------------

// A Firestore path is "collection/{id}" or "collection/{id}/sub". Only the
// first segment is checked: a sub-collection has no schema of its own yet.
function checkStepPath(contract: Contract, raw: string): string | null {
  const first = raw.split('/')[0] ?? '';
  if (resolveCollectionName(first, contract.known) === null) {
    return `"${raw}" names no collection: "${first}" has no schema in 02-contracts/collections/`;
  }
  if (!/\{[^}]+\}/.test(raw)) {
    return `"${raw}" has no id placeholder; use ${first}/{id}`;
  }
  return null;
}

// The four pointer forms feature.schema.json documents.
function checkContractRef(contract: Contract, raw: string): string | null {
  const hash = raw.indexOf('#');
  if (hash < 0) {
    return (
      `"${raw}" has no "#"; use collection.schema.json#field, callables.json#name, ` +
      'enums.json#/$defs/name or constants.json#group.KEY'
    );
  }
  const file = raw.slice(0, hash);
  const pointer = raw.slice(hash + 1);
  if (pointer.length === 0) return `"${raw}" has an empty pointer after "#"`;

  if (file.endsWith('.schema.json')) {
    const base = resolveCollectionName(file.replace(/\.schema\.json$/, ''), contract.known);
    if (base === null) return `"${raw}" names no collection schema "${file}"`;
    if (!fieldExistsWithExtensions(contract.schemas, contract.extensionFields, base, pointer)) {
      return `"${raw}" names no field "${pointer}" in ${base}.schema.json`;
    }
    return null;
  }
  if (file === 'callables.json') {
    if (!contract.callables.has(pointer)) return `"${raw}" names no callable "${pointer}" in callables.json`;
    return null;
  }
  if (file === 'enums.json') {
    const name = pointer.replace(/^\/\$defs\//, '');
    if (!contract.enums.has(name)) return `"${raw}" names no enum "${name}" in enums.json "$defs"`;
    return null;
  }
  if (file === 'constants.json') {
    if (!contract.constants.has(pointer)) return `"${raw}" names no constant "${pointer}" in constants.json`;
    return null;
  }
  return `"${raw}" points at "${file}", which is not a contract file this tool reads`;
}

function topicIsContracted(name: string, table: readonly TopicRow[]): boolean {
  for (const row of table) {
    const parameterised = row.prefix !== row.key;
    if (name === row.key || name === row.prefix) return true;
    if (parameterised && name.startsWith(row.prefix) && name.length > row.prefix.length) return true;
  }
  return false;
}

type Via = { kind: 'path' | 'callable' | 'topic'; name: string } | { kind: 'unknown' };

// A handoff names its mechanism. It is one of: a Firestore path, a callable,
// or an FCM topic. The order matters: a slash means a path, an exact callable
// name wins over a topic prefix with the same spelling.
function resolveVia(contract: Contract, via: string): Via {
  if (via.includes('/')) {
    const first = via.split('/')[0] ?? '';
    const base = resolveCollectionName(first, contract.known);
    if (base === null) return { kind: 'unknown' };
    return { kind: 'path', name: base };
  }
  if (contract.callables.has(via)) return { kind: 'callable', name: via };
  if (topicIsContracted(via, contract.topics)) return { kind: 'topic', name: via };
  return { kind: 'unknown' };
}

// The status the slices imply, read off feature.schema.json "x-feature-states":
// every slice verified is working, every slice wired is connected, a mixture is
// partial, and a feature with nothing wired is still designed.
function computeStatus(states: readonly string[]): string {
  if (states.length === 0) return 'designed';
  if (states.every((state) => state === 'verified')) return 'working';
  if (states.every((state) => state === 'wired' || state === 'verified')) return 'connected';
  if (states.some((state) => state === 'wired' || state === 'verified')) return 'partial';
  return 'designed';
}

// --- the semantic checks ----------------------------------------------------

function formatAjvError(error: AjvError): string {
  const at = error.instancePath === undefined || error.instancePath.length === 0
    ? '(root)'
    : error.instancePath.slice(1).split('/').join('.');
  return `${at}: ${error.message ?? 'is invalid'}`;
}

function checkFeature(
  feature: Feature,
  file: string,
  contract: Contract,
  problems: string[],
): string {
  const add = (message: string): void => {
    problems.push(`${file}: ${message}`);
  };

  const expectedId = file.replace(/\.json$/, '');
  if (feature.id !== expectedId) {
    add(`id "${feature.id}" does not match the file name; the file must be "${feature.id}.json"`);
  }

  const actorSet = new Set(feature.actors);

  // 3. the feature-level contract refs.
  for (const name of feature.contractRefs.collections) {
    if (resolveCollectionName(name, contract.known) === null) {
      add(`contractRefs.collections names "${name}", which has no schema in 02-contracts/collections/`);
    }
  }
  for (const name of feature.contractRefs.callables) {
    if (!contract.callables.has(name)) {
      add(`contractRefs.callables names "${name}", which is not in 02-contracts/callables.json`);
    }
  }
  for (const name of feature.contractRefs.enums ?? []) {
    if (!contract.enums.has(name)) {
      add(`contractRefs.enums names "${name}", which is not in enums.json "$defs"`);
    }
  }
  for (const name of feature.contractRefs.constants ?? []) {
    if (!contract.constants.has(name)) {
      add(`contractRefs.constants names "${name}", which is not in constants.json; use group.KEY`);
    }
  }

  // 4. the steps: order, actor, paths, refs.
  const stepsByActor = new Map<string, FeatureStep[]>();
  feature.steps.forEach((step, index) => {
    const expected = index + 1;
    if (step.n !== expected) add(`steps[${index}].n is ${step.n}; the journey is in order, so it must be ${expected}`);
    if (!actorSet.has(step.actor)) add(`steps[${index}] actor "${step.actor}" is not in actors`);
    for (const target of step.reads) {
      const reason = checkStepPath(contract, target);
      if (reason !== null) add(`steps[${index}].reads ${reason}`);
    }
    for (const target of step.writes) {
      const reason = checkStepPath(contract, target);
      if (reason !== null) add(`steps[${index}].writes ${reason}`);
    }
    for (const ref of step.contractRefs ?? []) {
      const reason = checkContractRef(contract, ref);
      if (reason !== null) add(`steps[${index}].contractRefs ${reason}`);
    }
    const bucket = stepsByActor.get(step.actor) ?? [];
    bucket.push(step);
    stepsByActor.set(step.actor, bucket);
  });

  // 5. the slices.
  const sliceById = new Map<string, FeatureSlice>();
  for (const slice of feature.slices) {
    if (sliceById.has(slice.id)) add(`slice id "${slice.id}" is used twice`);
    sliceById.set(slice.id, slice);
    if (!actorSet.has(slice.app)) add(`slice "${slice.id}" is app "${slice.app}", which is not in actors`);
    if (slice.state !== 'missing' && slice.state !== 'specified' && (slice.evidence ?? '').trim().length === 0) {
      add(`slice "${slice.id}" is ${slice.state} with no evidence; a state without evidence is a guess`);
    }
    for (const ref of slice.contractRefs ?? []) {
      const reason = checkContractRef(contract, ref);
      if (reason !== null) add(`slice "${slice.id}" contractRefs ${reason}`);
    }
  }
  for (const slice of feature.slices) {
    for (const dependency of slice.dependsOn) {
      if (dependency === slice.id) {
        add(`slice "${slice.id}" dependsOn itself`);
        continue;
      }
      const other = sliceById.get(dependency);
      if (other === undefined) {
        add(`slice "${slice.id}" dependsOn "${dependency}", which is not a slice of this feature`);
        continue;
      }
      if (slice.state === 'wired' || slice.state === 'verified') {
        if (other.state === 'missing' || other.state === 'specified') {
          add(
            `slice "${slice.id}" is ${slice.state} but dependsOn "${dependency}", which is still ${other.state}; ` +
              'a slice that waits on an unwritten one cannot be wired',
          );
        }
      }
    }
  }

  // 6. the declared status against the slices.
  const computed = computeStatus(feature.slices.map((slice) => slice.state));
  if (feature.status !== computed) {
    add(`status is "${feature.status}" but the slices imply "${computed}"`);
  }

  // 7. the handoffs.
  for (const handoff of feature.handoffs) {
    if (handoff.from === handoff.to) {
      add(`handoff "${handoff.via}" is from ${handoff.from} to itself, which is not a handoff`);
    }
    if (!actorSet.has(handoff.from)) add(`handoff "${handoff.via}" is from "${handoff.from}", which is not in actors`);
    if (!actorSet.has(handoff.to)) add(`handoff "${handoff.via}" is to "${handoff.to}", which is not in actors`);
    const via = resolveVia(contract, handoff.via);
    if (via.kind === 'unknown') {
      add(`handoff via "${handoff.via}" names no collection path, callable or topic in the contract`);
      continue;
    }
    if (via.kind !== 'path') continue;
    const produced = (stepsByActor.get(handoff.from) ?? []).some((step) =>
      step.writes.some((target) => resolveCollectionName(target.split('/')[0] ?? '', contract.known) === via.name),
    );
    if (!produced) {
      add(
        `handoff via "${handoff.via}" has no producer: no ${handoff.from} step writes ${via.name}, ` +
          'so nothing ever puts a document there',
      );
    }
  }

  // 8. the scenario.
  const tiers = new Set(feature.scenario.tiers);
  const runnable = tiers.has('simulated') || tiers.has('live');
  const verified = feature.slices.some((slice) => slice.state === 'verified');
  if (verified && !runnable) {
    add('a slice is verified, but the scenario has no simulated or live tier, so it was never run');
  }
  if (feature.status === 'working' && !runnable) {
    add('status is "working", but the scenario has no simulated or live tier, so it was never run');
  }

  return computed;
}

// --- reading the folder -----------------------------------------------------

async function listFeatureFiles(): Promise<string[]> {
  const info = await stat(FEATURES_DIR).catch(() => undefined);
  if (info === undefined || !info.isDirectory()) return [];
  const dirents = await readdir(FEATURES_DIR, { withFileTypes: true });
  return dirents
    .filter((dirent) => dirent.isFile() && dirent.name.endsWith('.json') && !NOT_A_FEATURE.has(dirent.name))
    .map((dirent) => dirent.name)
    .sort();
}

function pad(text: string, width: number): string {
  return text.padEnd(width);
}

type Row = {
  file: string;
  declared: string;
  computed: string;
  slices: number;
  steps: number;
  handoffs: number;
  problems: number;
};

function printSummary(rows: readonly Row[]): void {
  if (rows.length === 0) return;
  const headers = ['FEATURE', 'DECLARED', 'COMPUTED', 'SLICES', 'STEPS', 'HANDOFFS', 'PROBLEMS'];
  const cells = rows.map((row) => [
    row.file.replace(/\.json$/, ''),
    row.declared,
    row.computed,
    String(row.slices),
    String(row.steps),
    String(row.handoffs),
    String(row.problems),
  ]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...cells.map((row) => row[index].length)),
  );
  const line = (items: readonly string[]): string =>
    items.map((item, index) => pad(item, widths[index])).join('  ').trimEnd();

  console.log('');
  console.log(line(headers));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const row of cells) console.log(line(row));
  console.log('');
  console.log(`features checked: ${rows.length}`);
  console.log(`problems: ${rows.reduce((sum, row) => sum + row.problems, 0)}`);
}

// --- main -------------------------------------------------------------------

async function main(): Promise<void> {
  const files = await listFeatureFiles();
  if (files.length === 0) {
    ok('no features to check: 02-contracts/features/ holds no feature entry');
    return;
  }

  const schemaInfo = await stat(FEATURE_SCHEMA_PATH).catch(() => undefined);
  if (schemaInfo === undefined) {
    printErrors(HEADER, [
      '02-contracts/features/feature.schema.json is missing, so nothing can be validated',
    ]);
  }

  const schemaDoc = await readJson(FEATURE_SCHEMA_PATH);
  if (!isJsonObject(schemaDoc)) {
    printErrors(HEADER, ['02-contracts/features/feature.schema.json must be a JSON object']);
  }

  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  let validate: ValidateFunction;
  try {
    validate = ajv.compile(schemaDoc as AjvSchema);
  } catch (cause) {
    printErrors(HEADER, [`feature.schema.json does not compile: ${errorText(cause)}`]);
  }

  const contract = await readContract();

  const problems: Problem[] = [];
  const rows: Row[] = [];
  const scenarioOwners = new Map<string, string>();

  for (const file of files) {
    let raw: Json;
    try {
      raw = await readJson(path.join(FEATURES_DIR, file));
    } catch (cause) {
      problems.push({ feature: file, message: `${file}: ${errorText(cause)}` });
      continue;
    }
    if (!isJsonObject(raw)) {
      problems.push({ feature: file, message: `${file}: must be a JSON object` });
      continue;
    }

    const valid = validate(raw);
    if (!valid) {
      const errors = (validate.errors ?? []) as AjvError[];
      for (const error of errors) {
        problems.push({ feature: file, message: `${file}: ${formatAjvError(error)}` });
      }
      rows.push({
        file,
        declared: 'invalid',
        computed: '-',
        slices: 0,
        steps: 0,
        handoffs: 0,
        problems: errors.length,
      });
      continue;
    }

    const feature = raw as unknown as Feature;

    // The scenario id is how the test runner finds the check, so two features
    // cannot claim the same one.
    const owner = scenarioOwners.get(feature.scenario.id);
    if (owner !== undefined) {
      problems.push({
        feature: file,
        message: `${file}: scenario id "${feature.scenario.id}" is already used by ${owner}`,
      });
    } else {
      scenarioOwners.set(feature.scenario.id, file);
    }

    const messages: string[] = [];
    const computed = checkFeature(feature, file, contract, messages);
    for (const message of messages) problems.push({ feature: file, message });

    rows.push({
      file,
      declared: feature.status,
      computed,
      slices: feature.slices.length,
      steps: feature.steps.length,
      handoffs: feature.handoffs.length,
      problems: messages.length + (owner !== undefined ? 1 : 0),
    });
  }

  printSummary(rows);

  if (problems.length === 0) {
    ok(`features valid: ${files.length} feature(s) checked`);
    return;
  }
  printErrors(HEADER, problems.map((problem) => problem.message));
}

try {
  await main();
} catch (cause) {
  printErrors(HEADER, [errorText(cause)]);
}
