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
// Usage: node check-adoption.ts <app-repo>   (or set APP_REPO, default ".")

import { stat } from 'node:fs/promises';
import path from 'node:path';

import {
  MANIFEST_PATH,
  REGISTRY_PATH,
  asArray,
  currentContractVersion,
  isJsonObject,
  ok,
  printErrors,
  resolveTargetRepo,
  tryReadJson,
  type JsonObject,
} from './lib.ts';

const HEADER = 'check-adoption failed';

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
};

function toRecord(app: string, doc: JsonObject, hasFile: boolean): AppRecord {
  const checklist = new Map<string, string>();
  const core = doc['coreChanges'];
  if (isJsonObject(core)) {
    for (const [id, raw] of Object.entries(core)) {
      if (isJsonObject(raw) && typeof raw['status'] === 'string') checklist.set(id, raw['status']);
    }
  }
  return {
    app,
    hasFile,
    contractVersion: typeof doc['contractVersion'] === 'string' ? doc['contractVersion'] : undefined,
    extensionVersion: typeof doc['extensionVersion'] === 'string' ? doc['extensionVersion'] : undefined,
    checklist,
  };
}

function emptyRecord(app: string): AppRecord {
  return { app, hasFile: false, contractVersion: undefined, extensionVersion: undefined, checklist: new Map() };
}

function affectedAppsOf(change: JsonObject): string[] {
  const apps = asArray(change['affectedApps'] ?? [], 'affectedApps');
  return apps.filter((app): app is string => typeof app === 'string');
}

async function main(): Promise<void> {
  const errors: string[] = [];
  const notes: string[] = [];
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
