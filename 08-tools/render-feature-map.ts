// render-feature-map.ts
//
// Renders 09-reference/feature-change-map.md from three machine files: the
// feature entries, the change manifest and the adoption record.
//
// The blockers section is the one part a machine cannot know, so it is
// hand-written and preserved between the two HANDWRITTEN markers. Everything
// else is rewritten on every run.
//
// Usage:
//   node --experimental-strip-types render-feature-map.ts
//   node --experimental-strip-types render-feature-map.ts --check
//
// --check writes nothing and exits 1 when the file on disk is stale.

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CHANGES_DIR, CONTRACTS_DIR, REPO_ROOT, singularize } from './lib.ts';

const FEATURES_DIR = path.join(CONTRACTS_DIR, 'features');
const MANIFEST_PATH = path.join(CHANGES_DIR, 'manifest.json');
const ADOPTION_PATH = path.join(CHANGES_DIR, 'adoption.json');
const OUT_PATH = path.join(REPO_ROOT, '09-reference', 'feature-change-map.md');
const VERSION_PATH = path.join(REPO_ROOT, 'VERSION');

const HAND_START = '<!-- BEGIN HANDWRITTEN -->';
const HAND_END = '<!-- END HANDWRITTEN -->';
const WIDTH = 88;

// Box drawing, not ASCII pipes. The table checker reads a line that starts
// with a pipe as a table row, and an ASCII tree starts many lines that way.
const PIPE = '│';
const BRANCH = '├── ';
const LAST = '└── ';

type Change = {
  id: string;
  title: string;
  severity: string;
  priority: string;
  affectedApps: string[];
  affectedCollections: string[];
  kind?: string;
};

type Slice = {
  id: string;
  app: string;
  surface: string;
  state: string;
  dependsOn?: string[];
  contractRefs?: string[];
  blockedBy?: string;
};

type Handoff = { from: string; to: string; via: string; latency: string };

type Feature = {
  id: string;
  title: string;
  status: string;
  updated?: string;
  actors?: string[];
  steps?: Array<{ contractRefs?: string[] }>;
  slices: Slice[];
  handoffs?: Handoff[];
  contractRefs?: {
    collections?: string[];
    callables?: string[];
    enums?: string[];
    constants?: string[];
  };
};

type AdoptionEntry = { status?: string; progress?: number };

type AdoptionApp = {
  contractVersion?: string | null;
  coreChanges?: Record<string, AdoptionEntry>;
  extensionChanges?: Record<string, AdoptionEntry>;
};

type Adoption = { generatedAt?: string; apps: Record<string, AdoptionApp> };

// The snapshot's `updated:` date comes from the data, never from the wall
// clock. A wall-clock date made --check fail every midnight, because the
// regenerated header differed from the committed one. Taking the newest date
// the machine files already carry keeps the output deterministic.
function latestDate(values: Array<string | undefined>): string {
  const dates = values
    .filter((value): value is string => typeof value === 'string')
    .filter((value) => /^\d{4}-\d{2}-\d{2}/.test(value))
    .map((value) => value.slice(0, 10))
    .sort();
  return dates.at(-1) ?? '1970-01-01';
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

function wrap(text: string, first: string, rest: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  let prefix = first;
  for (const word of words) {
    const candidate = line === '' ? word : `${line} ${word}`;
    if (prefix.length + candidate.length > WIDTH && line !== '') {
      lines.push(prefix + line);
      line = word;
      prefix = rest;
    } else {
      line = candidate;
    }
  }
  lines.push(prefix + line);
  return lines;
}

function pluralList(values: string[]): string {
  return values.length === 0 ? 'none' : values.join(', ');
}

function buildCollectionAliases(changes: Change[]): Map<string, string> {
  const names = new Set<string>();
  for (const change of changes) {
    for (const name of change.affectedCollections ?? []) names.add(name);
  }
  const aliases = new Map<string, string>();
  for (const name of names) {
    aliases.set(name, name);
    aliases.set(singularize(name), name);
  }
  return aliases;
}

function collectionsFor(refs: string[], aliases: Map<string, string>): Set<string> {
  const found = new Set<string>();
  for (const ref of refs) {
    const file = ref.split('#')[0];
    if (!file.endsWith('.schema.json')) continue;
    const base = file.slice(0, -'.schema.json'.length);
    const collection = aliases.get(base);
    if (collection !== undefined) found.add(collection);
  }
  return found;
}

function featureCollections(feature: Feature, aliases: Map<string, string>): Set<string> {
  const found = new Set<string>();
  for (const name of feature.contractRefs?.collections ?? []) {
    const resolved = aliases.get(name) ?? aliases.get(singularize(name));
    if (resolved !== undefined) found.add(resolved);
  }
  const refs = [
    ...(feature.steps ?? []).flatMap((step) => step.contractRefs ?? []),
    ...feature.slices.flatMap((slice) => slice.contractRefs ?? []),
  ];
  for (const name of collectionsFor(refs, aliases)) found.add(name);
  return found;
}

function touches(change: Change, collections: Set<string>): boolean {
  return (change.affectedCollections ?? []).some((name) => collections.has(name));
}

function scopeOf(change: Change, featureCount: number): string {
  if ((change.affectedCollections ?? []).length === 0) return 'cross-cutting';
  if (featureCount === 0) return 'unmapped';
  if (featureCount === 1) return 'feature-specific';
  if (featureCount <= 3) return 'shared';
  return 'contract-wide';
}

function adoptionState(app: string, change: Change, adoption: Adoption): string {
  const record = adoption.apps[app];
  if (record === undefined) return 'no record';
  const table = change.kind === 'extension' ? record.extensionChanges : record.coreChanges;
  const entry = table?.[change.id];
  return entry?.status ?? 'unknown';
}

function featureTree(
  features: Feature[],
  featureChangeIds: Map<string, string[]>,
  changeFeatureCount: Map<string, number>,
  version: string
): string[] {
  const lines: string[] = [`safaaisaathi, contract ${version}`, PIPE];
  features.forEach((feature, index) => {
    const last = index === features.length - 1;
    const pad = last ? '    ' : `${PIPE}   `;
    if (index > 0) lines.push(PIPE);
    lines.push(`${last ? LAST : BRANCH}FEATURE ${feature.id} [${feature.status}]`);
    lines.push(`${pad}${feature.title}`);
    lines.push(`${pad}actor   ${pluralList(feature.actors ?? [])}`);
    lines.push(`${pad}${PIPE}`);

    for (const slice of feature.slices) {
      const depends = (slice.dependsOn ?? []).length > 0 ? slice.dependsOn!.join(', ') : 'none';
      lines.push(`${pad}${BRANCH}${slice.app.padEnd(11)} ${slice.state.padEnd(9)} ${slice.surface}`);
      lines.push(`${pad}${PIPE}     depends  ${depends}`);
      if (slice.blockedBy !== undefined && slice.blockedBy.trim() !== '') {
        const first = `${pad}${PIPE}     reason   `;
        const rest = `${pad}${PIPE}              `;
        for (const line of wrap(slice.blockedBy, first, rest)) lines.push(line);
      }
      lines.push(`${pad}${PIPE}`);
    }

    const ids = featureChangeIds.get(feature.id) ?? [];
    const own = ids.filter((id) => (changeFeatureCount.get(id) ?? 0) === 1);
    const shared = ids.filter((id) => {
      const count = changeFeatureCount.get(id) ?? 0;
      return count >= 2 && count <= 3;
    });
    const wide = ids.length - own.length - shared.length;
    if (own.length > 0) lines.push(`${pad}${BRANCH}changes  ${own.join(', ')}`);
    if (shared.length > 0) lines.push(`${pad}${BRANCH}shared   ${shared.join(', ')}`);
    if (wide > 0) lines.push(`${pad}${BRANCH}wide     ${wide} contract-wide change(s), see section 4`);
    for (const handoff of feature.handoffs ?? []) {
      lines.push(
        `${pad}${BRANCH}handoff  ${handoff.from} -> ${handoff.to} via ${handoff.via} (${handoff.latency})`
      );
    }
  });
  return lines;
}

function changeTree(
  changes: Change[],
  featureIdsFor: (change: Change) => string[],
  adoption: Adoption
): string[] {
  const lines: string[] = [];
  changes.forEach((change, index) => {
    const touched = featureIdsFor(change);
    const scope = scopeOf(change, touched.length);
    const states = Object.keys(adoption.apps ?? {}).map(
      (app) => `${app} ${adoptionState(app, change, adoption)}`
    );
    const last = index === changes.length - 1;
    lines.push(
      `${last ? LAST : BRANCH}${change.id} [${change.severity} ${change.priority}] ${change.title}`
    );
    if (change.kind === 'extension') lines.push(`    kind      extension`);
    lines.push(`    apps      ${pluralList(change.affectedApps ?? [])}`);
    lines.push(`    adoption  ${states.join(', ') || 'no app record'}`);
    lines.push(`    features  ${touched.length === 0 ? 'none' : touched.join(', ')}`);
    lines.push(`    scope     ${scope}`);
    lines.push('');
  });
  return lines;
}

function independenceTable(
  changes: Change[],
  featureIdsFor: (change: Change) => string[]
): string[] {
  const lines: string[] = [
    '| Change | Scope | Features touched | Collections |',
    '|---|---|---|---|',
  ];
  for (const change of changes) {
    const touched = featureIdsFor(change);
    const collections = change.affectedCollections ?? [];
    lines.push(
      `| ${change.id} | ${scopeOf(change, touched.length)} | ${touched.length === 0 ? 'none' : touched.join(', ')} | ${collections.length === 0 ? 'none' : collections.join(', ')} |`
    );
  }
  return lines;
}

function mermaid(
  features: Feature[],
  changes: Change[],
  featureIdsFor: (change: Change) => string[]
): string[] {
  const lines: string[] = ['```mermaid', 'graph LR'];
  const node = (raw: string): string => raw.replace(/[^A-Za-z0-9]/g, '_');
  for (const feature of features) {
    lines.push(`  ${node(feature.id)}["${feature.id}"]`);
  }
  for (const change of changes) {
    lines.push(`  ${node(change.id)}["${change.id} ${change.severity}"]`);
  }
  for (const change of changes) {
    const touched = featureIdsFor(change);
    for (const featureId of touched) {
      lines.push(`  ${node(featureId)} --> ${node(change.id)}`);
    }
  }
  const unique = (ids: string[]): string[] => [...new Set(ids)];
  const own = unique(
    changes.filter((change) => featureIdsFor(change).length === 1).map((change) => node(change.id))
  );
  const shared = unique(
    changes
      .filter((change) => {
        const count = featureIdsFor(change).length;
        return count >= 2 && count <= 3;
      })
      .map((change) => node(change.id))
  );
  const wide = unique(
    changes.filter((change) => featureIdsFor(change).length >= 4).map((change) => node(change.id))
  );
  const cross = unique(
    changes.filter((change) => featureIdsFor(change).length === 0).map((change) => node(change.id))
  );
  lines.push('  classDef own fill:#e8f5e9,stroke:#2e7d32,color:#000');
  lines.push('  classDef shared fill:#ffe0b2,stroke:#e65100,color:#000');
  lines.push('  classDef wide fill:#ffcdd2,stroke:#b71c1c,color:#000');
  lines.push('  classDef cross fill:#e3f2fd,stroke:#1565c0,color:#000');
  if (own.length > 0) lines.push(`  class ${own.join(',')} own`);
  if (shared.length > 0) lines.push(`  class ${shared.join(',')} shared`);
  if (wide.length > 0) lines.push(`  class ${wide.join(',')} wide`);
  if (cross.length > 0) lines.push(`  class ${cross.join(',')} cross`);
  lines.push('```');
  return lines;
}

const DEFAULT_BLOCKERS = [
  '```text',
  'safaaisaathi-63a87',
  '│',
  '├── billing',
  '│   ├── account 01C515-6137D1-8324BD is CLOSED (open=false)',
  '│   │   ├── Secret Manager writes return 403',
  '│   │   │   └── the 7 WhatsApp secrets cannot be created',
  '│   │   │       └── whatsappWebhook cannot deploy',
  '│   │   └── Cloud Functions writes return 403',
  '│   │       ├── #14 deploy is blocked',
  '│   │       │   └── the 3 identity callables are not live',
  '│   │       │       └── PHASE 2 row 1 is blocked (#17)',
  '│   └── does NOT block Firestore index creation',
  '│       └── that is why #16 passed while #14 did not',
  '│',
  '├── data',
  '│   ├── raw phones still sit on complaints and staff',
  '│   │   ├── the backfill tool is ready, the live run is not (#15)',
  '│   │   └── the strip waits for CHG-0012 to land in userapp',
  '│',
  '└── app adoption',
  '    └── see section 4 for the per-change state',
  '```',
].join('\n');

async function main(): Promise<void> {
  const checkOnly = process.argv.includes('--check');

  const version = (await readFile(VERSION_PATH, 'utf8')).trim();
  const manifest = await readJson<{ generatedAt?: string; changes: Change[] }>(MANIFEST_PATH);
  const adoption = await readJson<Adoption>(ADOPTION_PATH);
  const files = (await readdir(FEATURES_DIR)).filter(
    (name) => name.endsWith('.json') && name !== 'feature.schema.json'
  );
  const features = (
    await Promise.all(files.map((name) => readJson<Feature>(path.join(FEATURES_DIR, name))))
  ).sort((a, b) => a.id.localeCompare(b.id));

  const changes = [...manifest.changes].sort((a, b) => a.id.localeCompare(b.id));
  const aliases = buildCollectionAliases(changes);

  const collectionsByFeature = new Map<string, Set<string>>();
  for (const feature of features) {
    collectionsByFeature.set(feature.id, featureCollections(feature, aliases));
  }

  const featureIdsFor = (change: Change): string[] =>
    features
      .filter((feature) => touches(change, collectionsByFeature.get(feature.id) ?? new Set()))
      .map((feature) => feature.id);

  const featureChangeIds = new Map<string, string[]>();
  for (const feature of features) {
    const ids = changes
      .filter((change) => touches(change, collectionsByFeature.get(feature.id) ?? new Set()))
      .map((change) => change.id);
    featureChangeIds.set(feature.id, ids);
  }

  const changeFeatureCount = new Map<string, number>();
  for (const change of changes) changeFeatureCount.set(change.id, featureIdsFor(change).length);

  let handwritten = DEFAULT_BLOCKERS;
  try {
    const current = await readFile(OUT_PATH, 'utf8');
    const start = current.indexOf(HAND_START);
    const end = current.indexOf(HAND_END);
    if (start !== -1 && end > start) {
      handwritten = current.slice(start + HAND_START.length, end).trim();
    }
  } catch {
    // The file does not exist yet. The default stands.
  }

  const updated = latestDate([
    manifest.generatedAt,
    adoption.generatedAt,
    ...features.map((feature) => feature.updated),
  ]);

  const doc: string[] = [
    '---',
    'id: feature-change-map',
    'title: The Feature and Change Map',
    'status: frozen',
    'owner: platform-owner',
    `updated: ${updated}`,
    `contractVersion: "${version}"`,
    'audience: both',
    'see_also:',
    '  - ../02-contracts/features/README.md',
    '  - ../06-changes/manifest.json',
    '  - ./issue-register.md',
    '---',
    '',
    '# The Feature and Change Map',
    '',
    '**One tree: every feature, the slices that build it, the changes that shape it, and what is blocked.**',
    '',
    'A snapshot, generated from `02-contracts/features/*.json`, `06-changes/manifest.json` and `06-changes/adoption.json`. Those files stay the truth. Regenerate with section 7.',
    '',
    '## 1. How to read it',
    '',
    '### The feature tree',
    '',
    '| Mark | Means |',
    '|---|---|',
    '| `[partial]` | The feature entry\'s own status |',
    '| `wired`, `built`, `specified`, `missing` | A slice state, from the feature entry |',
    '| `depends` | The slice ids this slice waits on. `none` means it can start now |',
    '| `reason` | The slice\'s `blockedBy` text, verbatim |',
    '| `handoff` | Where one app hands the journey to the next, and through what |',
    '| `changes` | Changes that touch this feature and no other. These can ship alone. The line is absent when there are none |',
    '| `shared` | Changes that touch this feature and one or two others |',
    '| `wide` | Contract-wide changes, not repeated here. See section 4 |',
    '',
    '### The scope values in section 4',
    '',
    '| Scope | Means |',
    '|---|---|',
    '| `feature-specific` | One feature touches those collections, so it can ship alone |',
    '| `shared` | Two or three features touch them, so those apps stay coupled |',
    '| `contract-wide` | Four or more features touch them, so it lands everywhere at once |',
    '| `unmapped` | The change names collections, but no feature entry references them yet |',
    '| `cross-cutting` | The change names no collection, so this link cannot place it |',
    '',
    '**A link here is derived, not declared.** It means a shared collection, not a promise that the change is what blocks the slice.',
    '',
    '## 2. The feature tree',
    '',
    '```text',
    ...featureTree(features, featureChangeIds, changeFeatureCount, version),
    '```',
    '',
    '## 3. The change tree',
    '',
    '```text',
    ...changeTree(changes, featureIdsFor, adoption),
    '```',
    '',
    '## 4. Independent or connected',
    '',
    '**`feature-specific` can ship on its own. `shared` keeps the apps coupled. `contract-wide` lands everywhere at once. `cross-cutting` has no collection and needs a human to place it.**',
    '',
    ...independenceTable(changes, featureIdsFor),
    '',
    '## 5. What is blocked, and why',
    '',
    HAND_START,
    handwritten,
    HAND_END,
    '',
    '## 6. The graph',
    '',
    'Green means one feature touches it. Orange means two or three. Red means contract-wide. Blue means cross-cutting, with no collection to place it.',
    '',
    ...mermaid(features, changes, featureIdsFor),
    '',
    '## 7. Regenerate',
    '',
    'Run these from the platform repo root. The `--prefix` form also works from another repo, if you pass the platform path.',
    '',
    '```bash',
    'npm --prefix 08-tools run map        # rewrite this file',
    'npm --prefix 08-tools run map:check   # exits 1 when the file is stale, writes nothing',
    '```',
    '',
    'The second run writes nothing and exits 1 when the snapshot is stale, so it fits a pre-commit hook and a CI job. Section 5 is preserved across runs. Edit it in this file, not in the script.',
    '',
  ];

  const output = doc.join('\n');
  if (checkOnly) {
    const current = await readFile(OUT_PATH, 'utf8').catch(() => '');
    if (current !== output) {
      console.error('render-feature-map: the snapshot is stale. Run without --check to rewrite it.');
      process.exit(1);
    }
    console.log('render-feature-map: the snapshot is current');
    return;
  }

  await writeFile(OUT_PATH, output, 'utf8');
  console.log(`render-feature-map: wrote ${path.relative(REPO_ROOT, OUT_PATH)}`);
}

await main();
