// check-adoption.ts
//
// Reads the target repo's .contract/adopted.json and reports, per app known
// to that file: the pinned contract version vs the current platform VERSION,
// which manifest entries are adopted, which are pending, and progress as
// adopted / (adopted + pending). An app with no checklist shows 0%, not 100%.
// When the file itself is missing, the repo's own app is reported at 0%.
//
// Only the apps in this repo's own record gate the exit code. Another app's
// adoption is that app's own CI's business (see AGENTS.md hard constraint 5).
//
// The adopted.json may be a single-app record (contractVersion,
// extensionVersion, coreChanges) or an aggregate ({ "apps": { ... } }), the
// shape 06-changes/adoption.json uses.
//
// Exits 1 when a gated app is behind on an S0 or S1 entry.
//
// Usage:
//   node check-adoption.ts <app-repo>   (or set APP_REPO, default ".")
//   node check-adoption.ts --write      regenerate the impact matrix
//   node check-adoption.ts --check      fail when the impact matrix is stale
//   node check-adoption.ts --write --source=report
//   node check-adoption.ts --check --source=report
//
// The --write mode regenerates section 1 of 06-changes/impact-matrix.md from
// the manifest and the adoption records, so the matrix is never hand-edited
// and never drifts from the machine log. --check renders the same section,
// compares it with the committed file, writes nothing and exits 1 when they
// differ. Both use the same renderer, so they cannot disagree.
//
// By default --write prefers a sibling app checkout, because that file is the
// app's own truth. It refuses to write when a checkout pins an older contract
// version than 06-changes/adoption.json already reports: that checkout is
// stale, and writing from it would silently roll the matrix back. Pass
// --source=report to use the committed report instead. --check defaults to the
// report, because CI has no sibling checkouts and a local stale checkout must
// not fail the gate.

import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  APPS,
  CHANGES_DIR,
  MANIFEST_PATH,
  MONOREPO_ROOT,
  REGISTRY_PATH,
  asArray,
  currentContractVersion,
  isJsonObject,
  ok,
  printErrors,
  resolveTargetRepo,
  tryReadJson,
  type Json,
  type JsonObject,
} from './lib.ts';

const HEADER = 'check-adoption failed';

const MATRIX_PATH = path.join(CHANGES_DIR, 'impact-matrix.md');
const MATRIX_BEGIN = '<!-- BEGIN GENERATED: section-1 -->';
const MATRIX_END = '<!-- END GENERATED: section-1 -->';

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

type AppRecord = {
  app: string;
  hasFile: boolean;
  contractVersion: string | undefined;
  extensionVersion: string | undefined;
  // change id -> status as written ("adopted", "not_started", "not_applicable")
  checklist: Map<string, string>;
  // change id -> the fraction of the checklist that is done, 0 to 1
  progress: Map<string, number>;
  // change id -> the urgency the app recorded ("immediate", "before_release")
  urgency: Map<string, string>;
};

function toRecord(app: string, doc: JsonObject, hasFile: boolean): AppRecord {
  const checklist = new Map<string, string>();
  const progress = new Map<string, number>();
  const urgency = new Map<string, string>();
  // Core changes and extension changes are both tracked. An EXT entry is the
  // app's own, but the report treats it the same way, because the manifest
  // lists it with the same affectedApps and severity axes.
  for (const groupName of ['coreChanges', 'extensionChanges']) {
    const group = doc[groupName];
    if (!isJsonObject(group)) continue;
    for (const [id, raw] of Object.entries(group)) {
      if (!isJsonObject(raw)) continue;
      if (typeof raw['status'] === 'string') checklist.set(id, raw['status']);
      if (typeof raw['progress'] === 'number') progress.set(id, raw['progress']);
      if (typeof raw['urgency'] === 'string') urgency.set(id, raw['urgency']);
    }
  }
  return {
    app,
    hasFile,
    contractVersion: typeof doc['contractVersion'] === 'string' ? doc['contractVersion'] : undefined,
    extensionVersion: typeof doc['extensionVersion'] === 'string' ? doc['extensionVersion'] : undefined,
    checklist,
    progress,
    urgency,
  };
}

function emptyRecord(app: string): AppRecord {
  return {
    app,
    hasFile: false,
    contractVersion: undefined,
    extensionVersion: undefined,
    checklist: new Map(),
    progress: new Map(),
    urgency: new Map(),
  };
}

function affectedAppsOf(change: JsonObject): string[] {
  const apps = asArray(change['affectedApps'] ?? [], 'affectedApps');
  return apps.filter((app): app is string => typeof app === 'string');
}

// --- The impact matrix generator -------------------------------------------

// The per-app progress cell. A cell is only ever what the app's own record
// says. A missing record is 0%, never 100%.
function matrixCell(change: JsonObject, record: AppRecord | undefined): string {
  const id = typeof change['id'] === 'string' ? change['id'] : undefined;
  if (id === undefined) return 'n/a';

  // An app that is not in affectedApps is not affected. It is n/a, whatever
  // its own record says. The record may list it as not_applicable, or it may
  // not list it at all. Both mean the same thing here.
  const affected = affectedAppsOf(change);
  if (record === undefined || !affected.includes(record.app)) return 'n/a';

  const status = record.checklist.get(id);
  if (status === undefined) return '⬜ 0%';
  if (status === 'not_applicable') return 'n/a';
  if (status === 'adopted') return '✅ 100%';
  if (status === 'in_progress') {
    const progress = record.progress.get(id);
    const percent = typeof progress === 'number' ? Math.round(progress * 100) : 0;
    return `🟡 ${percent}%`;
  }
  return '⬜ 0%';
}

// The deadline cell. An immediate urgency wins over a date. A date wins over
// the other urgencies. With neither, the change is not on a clock.
function matrixDeadline(change: JsonObject, records: ReadonlyMap<string, AppRecord>): string {
  const id = typeof change['id'] === 'string' ? change['id'] : undefined;

  let urgency: string | undefined;
  for (const app of affectedAppsOf(change)) {
    const value = records.get(app)?.urgency.get(id ?? '');
    if (value === 'immediate') {
      urgency = 'immediate';
      break;
    }
    if (value !== undefined && urgency === undefined) urgency = value;
  }
  if (urgency === 'immediate') return '**Immediate**';

  const migration = isJsonObject(change['migration']) ? change['migration'] : undefined;
  const deadline = migration?.['deadline'];
  if (typeof deadline === 'string' && deadline.length > 0) return deadline;

  if (urgency === 'before_release') return 'Before release';
  if (urgency === 'scheduled') return 'Scheduled';
  if (urgency === 'optional') return 'Optional';
  return 'none';
}

// Builds section 1 of the impact matrix.
function buildMatrixSection(changes: JsonObject[], records: ReadonlyMap<string, AppRecord>): string {
  const lines: string[] = [];
  lines.push('| Change | Sev | Pri | Driver | User | Admin | Deadline |');
  lines.push('|---|---|---|---|---|---|---|');

  for (const change of changes) {
    const id = typeof change['id'] === 'string' ? change['id'] : '(missing id)';
    const title = typeof change['title'] === 'string' ? change['title'] : id;
    const explainedIn = typeof change['explainedIn'] === 'string' ? change['explainedIn'] : undefined;
    const severity = typeof change['severity'] === 'string' ? change['severity'] : '?';
    const priority = typeof change['priority'] === 'string' ? change['priority'] : '?';
    const priorityCell = severity === 'S0' || severity === 'S1' ? `**${priority}**` : priority;
    const label = explainedIn === undefined ? id : `[${id}](${explainedIn}) ${title}`;

    const cells = APPS.map((app) => matrixCell(change, records.get(app)));
    lines.push(`| ${label} | ${severity} | ${priorityCell} | ${cells[0]} | ${cells[1]} | ${cells[2]} | ${matrixDeadline(change, records)} |`);
  }

  lines.push('');
  lines.push('**Legend**: ✅ done. 🟡 in progress. ⬜ not started. n/a not affected.');
  return lines.join('\n');
}

// Compares two dotted contract versions. A missing version cannot be compared,
// so it reports equal and the guard stays quiet.
function compareVersions(a: string | undefined, b: string | undefined): number {
  if (a === undefined || b === undefined) return 0;
  const left = a.split('.').map((part) => Number.parseInt(part, 10));
  const right = b.split('.').map((part) => Number.parseInt(part, 10));
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const one = Number.isNaN(left[index]) ? 0 : left[index] ?? 0;
    const two = Number.isNaN(right[index]) ? 0 : right[index] ?? 0;
    if (one !== two) return one < two ? -1 : 1;
  }
  return 0;
}

type MatrixSource = 'auto' | 'report';

type MatrixRecords = {
  records: Map<string, AppRecord>;
  // One line per app that came from the committed report, so the source is
  // visible before the file is overwritten.
  sources: string[];
  // One line per stale sibling checkout. Non-empty means --write must refuse.
  stale: string[];
};

// Collects the adoption records for the matrix. An app's OWN file wins when
// the app repo is checked out next to this one. Otherwise the platform's
// report in 06-changes/adoption.json is used, and that report is a copy of
// the app's file anyway.
//
// A sibling checkout that pins an older contract version than the report is
// stale. In auto mode that is an error, because the last time it was allowed
// the generated table rolled back from 100% to 0%.
async function collectMatrixRecords(source: MatrixSource): Promise<MatrixRecords> {
  const records = new Map<string, AppRecord>();
  const sources: string[] = [];
  const stale: string[] = [];

  const platformRaw = await tryReadJson(path.join(CHANGES_DIR, 'adoption.json'));
  const platformApps =
    platformRaw !== undefined && isJsonObject(platformRaw) && isJsonObject(platformRaw['apps'])
      ? platformRaw['apps']
      : {};

  for (const app of APPS) {
    const reported = platformApps[app];
    const reportRecord = isJsonObject(reported) ? toRecord(app, reported, false) : undefined;

    const ownPath = path.join(MONOREPO_ROOT, app, '.contract', 'adopted.json');
    const ownRaw = source === 'report' ? undefined : await tryReadJson(ownPath);

    if (ownRaw !== undefined && isJsonObject(ownRaw)) {
      const ownRecord = toRecord(app, ownRaw, true);
      if (reportRecord !== undefined && compareVersions(ownRecord.contractVersion, reportRecord.contractVersion) < 0) {
        stale.push(
          `${app}: the checkout pins ${ownRecord.contractVersion ?? 'none'}, the report pins ${reportRecord.contractVersion ?? 'none'}`
        );
      }
      records.set(app, ownRecord);
      sources.push(`${app} <- checkout ${ownRecord.contractVersion ?? 'none'} (${path.relative(process.cwd(), ownPath)})`);
      continue;
    }

    if (reportRecord !== undefined) {
      records.set(app, reportRecord);
      sources.push(`${app} <- report ${reportRecord.contractVersion ?? 'none'}`);
      continue;
    }

    records.set(app, emptyRecord(app));
    sources.push(`${app} <- empty, no adoption record`);
  }

  return { records, sources, stale };
}

// Reads --source=..., or uses the fallback. --write falls back to auto (a
// checkout is the app's truth); --check falls back to report (CI has no
// checkouts and a stale local checkout must not fail the gate).
function matrixSource(fallback: MatrixSource): MatrixSource {
  if (process.argv.includes('--source=report')) return 'report';
  if (process.argv.includes('--source=auto')) return 'auto';
  return fallback;
}

// Renders the generated section, sharing one renderer with --write so the two
// modes cannot disagree.
async function renderMatrixSection(source: MatrixSource, changes: JsonObject[]): Promise<string> {
  const { records, sources, stale } = await collectMatrixRecords(source);

  for (const line of sources) console.log(`matrix source: ${line}`);

  if (stale.length > 0) {
    printErrors(HEADER, [
      ...stale.map((line) => `stale sibling checkout, ${line}`),
      'The matrix was not written. Run 08-tools/sync-adoption.ts, update the checkout, or pass --source=report.',
    ]);
  }

  return buildMatrixSection(changes, records);
}

// Rewrites the generated block of the impact matrix in place.
async function writeImpactMatrix(changes: JsonObject[]): Promise<void> {
  const section = await renderMatrixSection(matrixSource('auto'), changes);

  const text = await readFile(MATRIX_PATH, 'utf8');
  const begin = text.indexOf(MATRIX_BEGIN);
  const end = text.indexOf(MATRIX_END);
  if (begin < 0 || end < 0 || end < begin) {
    printErrors(HEADER, [
      `${MATRIX_PATH} has no generated block. It must contain ${MATRIX_BEGIN} and ${MATRIX_END}.`,
    ]);
  }
  const head = text.slice(0, begin + MATRIX_BEGIN.length);
  const tail = text.slice(end);
  await writeFile(MATRIX_PATH, `${head}\n${section}\n${tail}`, 'utf8');
  console.log(`wrote the generated section of ${path.relative(process.cwd(), MATRIX_PATH)}`);
}

async function checkImpactMatrix(changes: JsonObject[]): Promise<void> {
  const section = await renderMatrixSection(matrixSource('report'), changes);

  const text = await readFile(MATRIX_PATH, 'utf8');
  const begin = text.indexOf(MATRIX_BEGIN);
  const end = text.indexOf(MATRIX_END);
  if (begin < 0 || end < 0 || end < begin) {
    printErrors(HEADER, [
      `${MATRIX_PATH} has no generated block. It must contain ${MATRIX_BEGIN} and ${MATRIX_END}.`,
    ]);
  }

  const current = text.slice(begin + MATRIX_BEGIN.length, end).trim();
  if (current !== section.trim()) {
    printErrors(HEADER, [
      `${path.relative(process.cwd(), MATRIX_PATH)} is stale. Run node 08-tools/check-adoption.ts --write.`,
    ]);
  }

  ok('impact matrix is current');
}

async function main(): Promise<void> {
  const errors: string[] = [];
  const notes: string[] = [];

  // --write regenerates the impact matrix; --check compares it. Neither needs
  // an app repo.
  const writeOnly = process.argv.includes('--write');
  const checkOnly = process.argv.includes('--check');
  if (writeOnly || checkOnly) {
    const manifestRaw = await tryReadJson(MANIFEST_PATH);
    if (manifestRaw === undefined || !isJsonObject(manifestRaw)) {
      printErrors(HEADER, ['06-changes/manifest.json must be a JSON object']);
    }
    const changes: JsonObject[] = [];
    for (const raw of asArray(manifestRaw['changes'] ?? [], 'manifest.json "changes"')) {
      if (isJsonObject(raw)) changes.push(raw);
    }
    if (checkOnly && !writeOnly) {
      await checkImpactMatrix(changes);
      return;
    }
    await writeImpactMatrix(changes);
    ok('impact matrix regenerated');
    return;
  }

  const target = resolveTargetRepo(process.argv);
  const targetStat = await stat(target).catch(() => undefined);
  if (targetStat === undefined || !targetStat.isDirectory()) {
    printErrors(HEADER, [`app repo not found: ${target}`]);
  }

  const currentVersion = await currentContractVersion();
  const adoptedPath = path.join(target, '.contract', 'adopted.json');
  const adoptedRaw = await tryReadJson(adoptedPath);

  // The records this repo owns. They are the only ones that gate.
  const records = new Map<string, AppRecord>();
  if (adoptedRaw === undefined) {
    const ownApp = path.basename(path.resolve(target));
    records.set(ownApp, emptyRecord(ownApp));
    notes.push(`no ${adoptedPath}: ${ownApp} is reported with no checklist, 0%`);
  } else if (!isJsonObject(adoptedRaw)) {
    printErrors(HEADER, [`${adoptedPath} must be a JSON object`]);
  } else {
    const appsRaw = adoptedRaw['apps'];
    if (isJsonObject(appsRaw)) {
      for (const [app, raw] of Object.entries(appsRaw)) {
        if (!isJsonObject(raw)) {
          errors.push(`${adoptedPath}: apps.${app} must be an object`);
          continue;
        }
        records.set(app, toRecord(app, raw, true));
      }
    } else {
      const app = typeof adoptedRaw['app'] === 'string' ? adoptedRaw['app'] : path.basename(path.resolve(target));
      records.set(app, toRecord(app, adoptedRaw, true));
    }
  }

  // The manifest entries to report on.
  const manifestRaw = await tryReadJson(MANIFEST_PATH);
  const changes: JsonObject[] = [];
  if (manifestRaw === undefined) {
    notes.push('no 06-changes/manifest.json yet: nothing to be behind on');
  } else if (!isJsonObject(manifestRaw)) {
    errors.push('06-changes/manifest.json must be a JSON object');
  } else {
    for (const raw of asArray(manifestRaw['changes'] ?? [], 'manifest.json "changes"')) {
      if (isJsonObject(raw)) changes.push(raw);
    }
  }
  if (errors.length > 0) printErrors(HEADER, errors);

  const registryRaw = await tryReadJson(REGISTRY_PATH);
  const registryApps =
    registryRaw !== undefined && isJsonObject(registryRaw) && isJsonObject(registryRaw['apps'])
      ? registryRaw['apps']
      : {};
  const manifestIds = new Set(
    changes
      .map((change) => change['id'])
      .filter((id): id is string => typeof id === 'string'),
  );
  const blocking: string[] = [];

  console.log(`adoption report, current contract version ${currentVersion}`);
  const sorted = [...records.values()].sort((a, b) => a.app.localeCompare(b.app));
  for (const record of sorted) {
    let adoptedCount = 0;
    let pendingCount = 0;
    const pendingList: string[] = [];
    for (const change of changes) {
      if (!affectedAppsOf(change).includes(record.app)) continue;
      const id = typeof change['id'] === 'string' ? change['id'] : undefined;
      if (id === undefined) {
        notes.push(`${record.app}: a manifest entry without an id cannot be tracked`);
        continue;
      }
      const status = record.checklist.get(id);
      if (status === 'adopted') {
        adoptedCount += 1;
        continue;
      }
      if (status === 'not_applicable') continue;
      pendingCount += 1;
      const severity = typeof change['severity'] === 'string' ? change['severity'] : '?';
      const priority = typeof change['priority'] === 'string' ? change['priority'] : '?';
      pendingList.push(`${id} (${severity})`);
      if (severity === 'S0' || severity === 'S1') {
        blocking.push(`${record.app} is behind on ${id} (${severity}, ${priority})`);
      }
    }

    const total = adoptedCount + pendingCount;
    let progress: string;
    if (total === 0) {
      progress = 'n/a';
    } else if (!record.hasFile || record.checklist.size === 0) {
      progress = '0%';
    } else {
      progress = `${Math.round((adoptedCount / total) * 100)}%`;
    }

    const pinned = record.contractVersion ?? 'none';
    const versionFlag = record.contractVersion !== undefined && record.contractVersion !== currentVersion ? ' BEHIND' : '';
    const pendingText = pendingList.length > 0 ? ` (${pendingList.join(', ')})` : '';
    const fileText = record.hasFile ? '' : ' [no .contract/adopted.json]';
    console.log(`  ${record.app}: pinned ${pinned}${versionFlag}, adopted ${adoptedCount}, pending ${pendingCount}${pendingText}, progress ${progress}${fileText}`);

    const registered = registryApps[record.app];
    if (
      isJsonObject(registered) &&
      registered['extensionVersion'] !== undefined &&
      record.extensionVersion !== undefined &&
      String(registered['extensionVersion']) !== String(record.extensionVersion)
    ) {
      notes.push(`${record.app}: extensionVersion ${record.extensionVersion} does not match the registered ${String(registered['extensionVersion'])}`);
    }
    for (const id of record.checklist.keys()) {
      if (!manifestIds.has(id)) notes.push(`${record.app}: checklist has ${id} but the manifest has no such change`);
    }
  }
  for (const note of notes) console.log(`  note: ${note}`);

  if (blocking.length > 0) {
    console.error(`adoption check FAILED: ${blocking.length} gap(s) on S0 or S1 changes`);
    for (const line of blocking) console.error(`  - ${line}`);
    process.exit(1);
  }
  ok('adoption check passed: no app is behind on an S0 or S1 change');
}

try {
  await main();
} catch (cause) {
  printErrors(HEADER, [errorText(cause)]);
}
