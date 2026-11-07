// sync-adoption.ts
//
// Regenerates 06-changes/adoption.json from each app's own
// .contract/adopted.json. The app's file is the truth; the platform's report is
// a copy. This tool never invents a status:
//
//   - an app with no file gets no contractVersion, and adoptionFile is null;
//   - a manifest entry the app's file does not mention becomes not_started
//     when the manifest lists the app in affectedApps, and not_applicable
//     when it does not.
//
// That is the same rule check-adoption.ts already uses to read a report, so
// the generated file and the report agree by construction.
//
// Usage:
//   node 08-tools/sync-adoption.ts
//   node 08-tools/sync-adoption.ts --repo driverapp=/path/to/worktree
//   APP_REPO_DRIVERAPP=/path/to/worktree node 08-tools/sync-adoption.ts
//   node 08-tools/sync-adoption.ts --check
//
// A sibling checkout is read when it exists. --repo <app>=<path> and
// APP_REPO_<APP> point at a branch or a git worktree, which is how a report is
// generated before a change merges. --check exits 1 when the committed report
// disagrees with the visible checkouts; an app with no checkout is skipped,
// because the platform's CI checks out only this repo.
//
// After it writes, run check-adoption.ts --write to regenerate the impact
// matrix from the new report.

import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  APPS,
  CHANGES_DIR,
  MANIFEST_PATH,
  MONOREPO_ROOT,
  REGISTRY_PATH,
  asArray,
  isJsonObject,
  ok,
  printErrors,
  readJson,
  tryReadJson,
  type Json,
  type JsonObject,
} from './lib.ts';

const HEADER = 'sync-adoption failed';
const REPORT_PATH = path.join(CHANGES_DIR, 'adoption.json');

function versionParts(version: unknown): number[] {
  return String(version ?? '0').split('.').map((part) => {
    const value = Number.parseInt(part, 10);
    return Number.isNaN(value) ? 0 : value;
  });
}

// Compares two dotted contract versions. A missing version cannot be compared,
// so it reports equal and the guard stays quiet.
function compareVersions(left: unknown, right: unknown): number {
  const a = versionParts(left);
  const b = versionParts(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const one = a[index] ?? 0;
    const two = b[index] ?? 0;
    if (one !== two) return one < two ? -1 : 1;
  }
  return 0;
}

type ChangeEntry = {
  id: string;
  group: 'coreChanges' | 'extensionChanges';
  affectedApps: string[];
};

function affectedAppsOf(change: JsonObject): string[] {
  return asArray(change['affectedApps'] ?? [], 'affectedApps').filter(
    (app): app is string => typeof app === 'string',
  );
}

function imageOf(value: Json): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

// Sorted-key stringify, so two JSON documents compare by value and not by the
// order the keys happen to sit in on disk.
function stable(value: Json): string {
  if (Array.isArray(value)) return `[${value.map((item) => stable(item)).join(',')}]`;
  if (isJsonObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function withoutGeneratedAt(doc: Json): Json {
  if (!isJsonObject(doc)) return doc;
  const copy: JsonObject = { ...doc };
  delete copy['generatedAt'];
  return copy;
}

function envKey(app: string): string {
  return `APP_REPO_${app.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

// Reads --repo <app>=<path> and --repo=<app>=<path>. These name a checkout,
// not a report filter: a report is always written for all three apps.
function parseRepoOverrides(argv: readonly string[]): Map<string, string> {
  const overrides = new Map<string, string>();
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    let pair: string | undefined;
    if (arg === '--repo') {
      pair = argv[index + 1];
      if (pair === undefined) printErrors(HEADER, ['--repo needs <app>=<path>']);
      index += 1;
    } else if (arg.startsWith('--repo=')) {
      pair = arg.slice('--repo='.length);
    } else {
      continue;
    }
    const equals = pair.indexOf('=');
    if (equals < 1 || equals === pair.length - 1) {
      printErrors(HEADER, [`--repo needs <app>=<path>, got "${pair}"`]);
    }
    const app = pair.slice(0, equals);
    if (!APPS.includes(app)) {
      printErrors(HEADER, [`unknown app "${app}". Valid apps: ${APPS.join(', ')}`]);
    }
    overrides.set(app, path.resolve(pair.slice(equals + 1)));
  }
  return overrides;
}

function repoDirFor(app: string, overrides: ReadonlyMap<string, string>): string {
  const explicit = overrides.get(app);
  if (explicit !== undefined) return explicit;
  const fromEnv = process.env[envKey(app)];
  if (fromEnv !== undefined && fromEnv.length > 0) return path.resolve(fromEnv);
  return path.join(MONOREPO_ROOT, app);
}

// The default entry for a manifest change the app's file does not mention.
// Urgency and notes are platform rulings, not adoption evidence, so they are
// carried from the previous report. The status and the progress never are.
function defaultEntry(change: ChangeEntry, app: string, carried: Json): JsonObject {
  const affected = change.affectedApps.includes(app);
  const entry: JsonObject = affected
    ? { status: 'not_started', progress: 0 }
    : {
        status: 'not_applicable',
        progress: null,
        note: `The manifest does not list ${app} in affectedApps.`,
      };
  if (!isJsonObject(carried)) return entry;
  if (affected) {
    for (const key of ['urgency', 'checklist', 'verifiedBy']) {
      if (carried[key] !== undefined) entry[key] = imageOf(carried[key]);
    }
  }
  if (typeof carried['note'] === 'string') entry['note'] = carried['note'];
  return entry;
}

// Copies the app's own entries for the groups it has, then fills every
// manifest entry the file does not mention, in manifest order. `carriedCore`
// and `carriedExtensions` are the previous report's entries for this app; they
// supply urgency and notes, never a status the app file does not back.
function buildChanges(
  changes: readonly ChangeEntry[],
  ownCore: JsonObject,
  ownExtensions: JsonObject,
  carriedCore: JsonObject,
  carriedExtensions: JsonObject,
  app: string,
  notes: string[],
): { coreChanges: JsonObject; extensionChanges: JsonObject } {
  const coreChanges: JsonObject = {};
  const extensionChanges: JsonObject = {};
  const seen = new Set<string>();

  for (const change of changes) {
    const own = change.group === 'coreChanges' ? ownCore[change.id] : ownExtensions[change.id];
    const carried =
      change.group === 'coreChanges' ? carriedCore[change.id] : carriedExtensions[change.id];
    const entry = isJsonObject(own)
      ? (imageOf(own) as JsonObject)
      : defaultEntry(change, app, carried);
    if (change.group === 'coreChanges') coreChanges[change.id] = entry;
    else extensionChanges[change.id] = entry;
    seen.add(change.id);
  }

  // An id the app tracks but the manifest does not have is kept, so the
  // evidence is not silently dropped. check-adoption.ts reports it as a note.
  for (const [id, entry] of Object.entries({ ...ownCore, ...ownExtensions })) {
    if (seen.has(id) || !isJsonObject(entry)) continue;
    notes.push(`${app}: ${id} is in the app's record but not in the manifest; kept as written`);
    const target = id.startsWith('EXT-') ? extensionChanges : coreChanges;
    if (target[id] === undefined) target[id] = imageOf(entry);
  }

  return { coreChanges, extensionChanges };
}

async function buildReport(): Promise<{ report: JsonObject; skipped: string[]; notes: string[] }> {
  const manifestRaw = await readJson(MANIFEST_PATH);
  const changes: ChangeEntry[] = [];
  for (const raw of asArray(manifestRaw['changes'] ?? [], 'manifest.json "changes"')) {
    if (!isJsonObject(raw)) continue;
    const id = raw['id'];
    if (typeof id !== 'string' || id.length === 0) continue;
    changes.push({
      id,
      group: id.startsWith('EXT-') ? 'extensionChanges' : 'coreChanges',
      affectedApps: affectedAppsOf(raw),
    });
  }

  const overrides = parseRepoOverrides(process.argv);
  const registryRaw = await tryReadJson(REGISTRY_PATH);
  const registryApps =
    registryRaw !== undefined && isJsonObject(registryRaw) && isJsonObject(registryRaw['apps'])
      ? registryRaw['apps']
      : {};

  const existing = await tryReadJson(REPORT_PATH);
  const metadata = isJsonObject(existing) ? existing : {};
  const xRules = isJsonObject(metadata['x-rules']) ? imageOf(metadata['x-rules']) as JsonObject : {};

  const skipped: string[] = [];
  const notes: string[] = [];
  const apps: JsonObject = {};

  for (const app of APPS) {
    const repoDir = repoDirFor(app, overrides);
    const repoStat = await stat(repoDir).catch(() => undefined);
    const repoVisible = repoStat !== undefined && repoStat.isDirectory();
    if (!repoVisible) {
      skipped.push(app);
      // No checkout means no evidence. Keep the entry that is already in the
      // report instead of regenerating it from nothing, so a run from a sparse
      // checkout cannot wipe another app's evidence.
      if (isJsonObject(existing) && isJsonObject(existing['apps'])) {
        const carried = existing['apps'][app];
        if (isJsonObject(carried)) {
          apps[app] = imageOf(carried);
          continue;
        }
      }
    }

    const adoptedPath = path.join(repoDir, '.contract', 'adopted.json');
    const adoptedRaw = repoVisible ? await tryReadJson(adoptedPath) : undefined;
    if (adoptedRaw !== undefined && !isJsonObject(adoptedRaw)) {
      printErrors(HEADER, [`${adoptedPath} must be a JSON object`]);
    }
    const own = adoptedRaw === undefined ? {} : (adoptedRaw as JsonObject);

    const ownCore = isJsonObject(own['coreChanges']) ? own['coreChanges'] : {};
    const ownExtensions = isJsonObject(own['extensionChanges']) ? own['extensionChanges'] : {};

    const previous =
      isJsonObject(existing) && isJsonObject(existing['apps']) ? existing['apps'][app] : undefined;
    const carriedCore =
      isJsonObject(previous) && isJsonObject(previous['coreChanges'])
        ? previous['coreChanges']
        : {};
    const carriedExtensions =
      isJsonObject(previous) && isJsonObject(previous['extensionChanges'])
        ? previous['extensionChanges']
        : {};

    const { coreChanges, extensionChanges } = buildChanges(
      changes,
      ownCore,
      ownExtensions,
      carriedCore,
      carriedExtensions,
      app,
      notes,
    );

    const registered = registryApps[app];
    const registeredVersion =
      isJsonObject(registered) && registered['extensionVersion'] !== undefined
        ? String(registered['extensionVersion'])
        : undefined;

    apps[app] = {
      repo: `safaaisaathi/${app}`,
      contractVersion: typeof own['contractVersion'] === 'string' ? own['contractVersion'] : null,
      extensionVersion:
        typeof own['extensionVersion'] === 'string'
          ? own['extensionVersion']
          : (registeredVersion ?? null),
      adoptionFile: adoptedRaw === undefined ? null : '.contract/adopted.json',
      coreChanges,
      extensionChanges,
    };
  }

  xRules['sourceOfTruth'] =
    'Each app\'s own .contract/adopted.json in its own repo. This file is generated from those files and this repo\'s manifest. An app with no file shows contractVersion null and adoptionFile null, and its statuses are derived from the manifest, never carried as evidence.';
  xRules['generatedBy'] =
    'Generated by 08-tools/sync-adoption.ts from each app\'s .contract/adopted.json and this repo\'s manifest. Do not hand-edit the statuses.';
  xRules['regenerate'] =
    'node 08-tools/sync-adoption.ts && node 08-tools/check-adoption.ts --write';

  const report: JsonObject = {
    $schema:
      typeof metadata['$schema'] === 'string'
        ? metadata['$schema']
        : 'https://json-schema.org/draft/2020-12/schema',
    $id:
      typeof metadata['$id'] === 'string'
        ? metadata['$id']
        : 'https://safaaisaathi.contracts/changes/adoption.json',
    title: typeof metadata['title'] === 'string' ? metadata['title'] : 'Safai Saathi adoption record',
    description:
      typeof metadata['description'] === 'string'
        ? metadata['description']
        : 'Who has caught up with which change. Each app updates its own record in its own repo, in .contract/adopted.json. This file is the platform aggregated view. It is a REPORT, not a source of truth.',
    generatedAt: new Date().toISOString().slice(0, 10),
    'x-rules': xRules,
    apps,
  };

  return { report, skipped, notes };
}

async function main(): Promise<void> {
  const checkOnly = process.argv.includes('--check');
  const { report, skipped, notes } = await buildReport();

  for (const note of notes) console.log(`  note: ${note}`);
  for (const app of skipped) {
    console.log(`  skipped ${app}: no checkout visible, so its entry is not comparable`);
  }

  if (checkOnly) {
    const currentRaw = await tryReadJson(REPORT_PATH);
    if (currentRaw === undefined) {
      printErrors(HEADER, [`${REPORT_PATH} is missing. Run node 08-tools/sync-adoption.ts`]);
    }

    // A visible checkout older than the committed report is stale. The report
    // is the newer evidence, so compare against its entry, not the old file.
    // This is the local false alarm the README now names.
    const currentApps =
      isJsonObject(currentRaw) && isJsonObject(currentRaw['apps']) ? currentRaw['apps'] : {};
    const reportApps = isJsonObject(report['apps']) ? report['apps'] : {};
    for (const app of APPS) {
      const visible = reportApps[app];
      const committed = currentApps[app];
      if (!isJsonObject(visible) || !isJsonObject(committed)) continue;
      const visibleVersion =
        typeof visible['contractVersion'] === 'string' ? visible['contractVersion'] : undefined;
      const committedVersion =
        typeof committed['contractVersion'] === 'string' ? committed['contractVersion'] : undefined;
      if (compareVersions(visibleVersion, committedVersion) < 0) {
        reportApps[app] = imageOf(committed);
        console.log(
          `  note: ${app} checkout pins ${visibleVersion ?? 'none'}, older than the report's ${committedVersion ?? 'none'}; using the report`
        );
      }
    }

    if (stable(withoutGeneratedAt(report)) !== stable(withoutGeneratedAt(currentRaw))) {
      printErrors(HEADER, [
        '06-changes/adoption.json is stale. Run node 08-tools/sync-adoption.ts, ' +
        'then node 08-tools/check-adoption.ts --write.',
      ]);
    }
    ok('adoption report is current');
    return;
  }

  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`wrote ${path.relative(process.cwd(), REPORT_PATH)}`);
  ok('adoption report regenerated; run node 08-tools/check-adoption.ts --write next');
}

try {
  await main();
} catch (cause) {
  printErrors(HEADER, [cause instanceof Error ? cause.message : String(cause)]);
}
