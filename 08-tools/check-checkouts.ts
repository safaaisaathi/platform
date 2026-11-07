// check-checkouts.ts
//
// Read-only map of the app checkouts this machine can see, next to the platform
// repo. It answers one question: when a report or matrix run read an app's
// adoption record, which file did it read, and was that file current?
//
// For each app it prints:
//   - the checkout path, branch and short HEAD;
//   - the contract version in the checkout's .contract/adopted.json;
//   - the contract version in 06-changes/adoption.json;
//   - a STALE marker when the checkout is older than the report. In that case
//     the report wins in --check, and --write refuses.
//
// It reads only. It writes nothing and needs no network.
//
// Usage:
//   node --experimental-strip-types check-checkouts.ts

import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { APPS, CHANGES_DIR, MONOREPO_ROOT, isJsonObject, tryReadJson, type JsonObject } from './lib.ts';

const run = promisify(execFile);
const REPORT_PATH = path.join(CHANGES_DIR, 'adoption.json');

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

async function git(dir: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await run('git', ['-C', dir, ...args]);
    const text = stdout.trim();
    return text.length > 0 ? text : undefined;
  } catch {
    return undefined;
  }
}

async function adoptedVersion(dir: string): Promise<string | undefined> {
  const raw = await tryReadJson(path.join(dir, '.contract', 'adopted.json'));
  if (!isJsonObject(raw)) return undefined;
  const version = raw['contractVersion'];
  return typeof version === 'string' ? version : undefined;
}

function reportedVersion(reportApps: JsonObject, app: string): string | undefined {
  const entry = reportApps[app];
  if (!isJsonObject(entry)) return undefined;
  const version = entry['contractVersion'];
  return typeof version === 'string' ? version : undefined;
}

async function main(): Promise<void> {
  const reportRaw = await tryReadJson(REPORT_PATH);
  const reportApps =
    isJsonObject(reportRaw) && isJsonObject(reportRaw['apps']) ? reportRaw['apps'] : {};

  console.log(`platform: ${MONOREPO_ROOT}`);
  console.log(`report:  ${path.relative(MONOREPO_ROOT, REPORT_PATH)}`);
  console.log('');

  for (const app of APPS) {
    const dir = path.join(MONOREPO_ROOT, app);
    const entry = await stat(dir).catch(() => undefined);
    if (entry === undefined || !entry.isDirectory()) {
      console.log(`${app}: no checkout at ${dir}`);
      continue;
    }

    const branch = await git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const head = await git(dir, ['rev-parse', '--short', 'HEAD']);
    const adopted = await adoptedVersion(dir);
    const reported = reportedVersion(reportApps, app);
    const stale = compareVersions(adopted, reported) < 0;

    console.log(`${app}: ${branch ?? 'no git metadata'} ${head ?? '?'}`);
    console.log(`  path     ${dir}`);
    console.log(`  adopted  ${adopted ?? 'no .contract/adopted.json'}`);
    console.log(`  report   ${reported ?? 'no report entry'}`);
    if (stale) console.log('  STALE, the report wins in a check');
    console.log('');
  }
}

await main();
