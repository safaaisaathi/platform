// bump-contract.ts
//
// Rewrites the app repo's .contract/adopted.json with a new contractVersion
// and/or extensionVersion, preserving the per-change adoption records. Prints
// a diff-style summary of exactly what moved.
//
// Usage:
//   node bump-contract.ts <app-repo> --contract-version=2.0.0
//   node bump-contract.ts <app-repo> --extension-version=5
//   node bump-contract.ts <app-repo> --contract-version=2.0.0 --extension-version=5
// The app repo also comes from APP_REPO when omitted.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isJsonObject, ok, printErrors, tryReadJson, type JsonObject } from './lib.ts';

const HEADER = 'bump-contract failed';
const USAGE = 'usage: node bump-contract.ts <app-repo> [--contract-version=x.y.z] [--extension-version=n]';
const SEMVER = /^\d+\.\d+\.\d+$/;
const EXTENSION_VERSION = /^\d+$/;

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function countAdoptionRecords(doc: JsonObject): number {
  const core = doc['coreChanges'];
  return isJsonObject(core) ? Object.keys(core).length : 0;
}

// Applies the requested versions to one record and collects the diff lines.
function applyVersions(node: JsonObject, label: string, contractVersion: string | undefined, extensionVersion: string | undefined, diffs: string[]): void {
  if (contractVersion !== undefined) {
    const before = node['contractVersion'];
    node['contractVersion'] = contractVersion;
    if (String(before) !== contractVersion) {
      diffs.push(`- ${label}.contractVersion: ${JSON.stringify(before ?? null)}`);
      diffs.push(`+ ${label}.contractVersion: ${JSON.stringify(contractVersion)}`);
    }
  }
  if (extensionVersion !== undefined) {
    const before = node['extensionVersion'];
    node['extensionVersion'] = extensionVersion;
    if (String(before) !== extensionVersion) {
      diffs.push(`- ${label}.extensionVersion: ${JSON.stringify(before ?? null)}`);
      diffs.push(`+ ${label}.extensionVersion: ${JSON.stringify(extensionVersion)}`);
    }
  }
}

async function main(): Promise<void> {
  let target: string | undefined;
  let contractVersion: string | undefined;
  let extensionVersion: string | undefined;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--contract-version=')) {
      contractVersion = arg.slice('--contract-version='.length);
    } else if (arg.startsWith('--extension-version=')) {
      extensionVersion = arg.slice('--extension-version='.length);
    } else if (arg.startsWith('--')) {
      printErrors(HEADER, [`unknown option "${arg}". ${USAGE}`]);
    } else if (target === undefined) {
      target = arg;
    } else {
      printErrors(HEADER, [`unexpected argument "${arg}". ${USAGE}`]);
    }
  }
  if (contractVersion === undefined && extensionVersion === undefined) {
    printErrors(HEADER, [`nothing to bump: pass --contract-version and/or --extension-version. ${USAGE}`]);
  }
  if (contractVersion !== undefined && !SEMVER.test(contractVersion)) {
    printErrors(HEADER, [`--contract-version must be semver (x.y.z), got "${contractVersion}"`]);
  }
  if (extensionVersion !== undefined && !EXTENSION_VERSION.test(extensionVersion)) {
    printErrors(HEADER, [`--extension-version must be a number, got "${extensionVersion}"`]);
  }
  target ??= process.env.APP_REPO;
  if (target === undefined) {
    printErrors(HEADER, [`no target repo given. Pass a path or set APP_REPO. ${USAGE}`]);
  }
  target = path.resolve(target);

  const adoptedPath = path.join(target, '.contract', 'adopted.json');
  const doc = await tryReadJson(adoptedPath);
  if (doc === undefined) {
    printErrors(HEADER, [`no adoption record at ${adoptedPath}. Run sync-contract and create .contract/adopted.json first.`]);
  }
  if (!isJsonObject(doc)) {
    printErrors(HEADER, [`${adoptedPath} must be a JSON object`]);
  }

  // Only the version scalars move. coreChanges and every other key stay as
  // they are, so the per-change adoption records survive.
  const diffs: string[] = [];
  applyVersions(doc, 'adopted', contractVersion, extensionVersion, diffs);
  const appsRaw = doc['apps'];
  if (isJsonObject(appsRaw)) {
    for (const [app, raw] of Object.entries(appsRaw)) {
      if (isJsonObject(raw)) applyVersions(raw, app, contractVersion, extensionVersion, diffs);
    }
  }

  if (diffs.length === 0) {
    ok(`no change: the record is already at contract ${String(doc['contractVersion'] ?? 'none')}, extension ${String(doc['extensionVersion'] ?? 'none')}`);
    return;
  }

  await writeFile(adoptedPath, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`bumping ${adoptedPath}`);
  for (const line of diffs) console.log(line);
  console.log(`preserved ${countAdoptionRecords(doc)} adoption record(s)`);
  ok('adoption record bumped');
}

try {
  await main();
} catch (cause) {
  printErrors(HEADER, [errorText(cause)]);
}
