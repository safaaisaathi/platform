// check-checkouts.ts
//
// Read-only. Prints every app checkout visible next to this repo: its path,
// branch, HEAD, the adopted contract version, and whether that version is
// older than 06-changes/adoption.json.
//
// A stale sibling checkout is the usual reason a report or matrix run reads
// the wrong file, because the tools prefer an app's own file over the report.
// This tool makes that visible before a run, not after.
//
// Usage:
//   node --experimental-strip-types check-checkouts.ts

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { APPS, CHANGES_DIR, MONOREPO_ROOT, isJsonObject, tryReadJson } from './lib.ts';

const run = promisify(execFile);

function versionParts(version: unknown): number[] {
  return String(version ?? '0').split('.').map((part) => {
    const value = Number.parseInt(part, 10);
    return Number.isNaN(value) ? 0 : value;
  });
}

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

async function git(dir: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await run('git', ['-C', dir, ...args]);
    return stdout.trim();
  } catch {
    return undefined;
  }
}

function adoptedVersion(raw: unknown): string {
  return isJsonObject(raw) && typeof raw['contractVersion'] === 'string' ? raw['contractVersion'] : 'none';
}

const reportRaw = await tryReadJson(path.join(CHANGES_DIR, 'adoption.json'));
const reportApps =
  isJsonObject(reportRaw) && isJsonObject(reportRaw['apps']) ? reportRaw['apps'] : {};

console.log('check-checkouts: app checkouts next to the platform repo');

for (const app of APPS) {
  const dir = path.join(MONOREPO_ROOT, app);
  const branch = await git(dir, ['branch', '--show-current']);
  if (branch === undefined) {
    console.log(`${app}: no checkout at ${dir}`);
    continue;
  }

  const head = await git(dir, ['log', '-1', '--format=%h %s']);
  const adoptedRaw = await tryReadJson(path.join(dir, '.contract', 'adopted.json'));
  const adopted = adoptedVersion(adoptedRaw);
  const reported = adoptedVersion(reportApps[app]);
  const stale = compareVersions(adopted, reported) < 0;

  console.log(`${app}: ${dir}`);
  console.log(`  branch ${branch.length > 0 ? branch : '(detached)'}, HEAD ${head ?? 'unknown'}`);
  console.log(
    `  adopted ${adopted}, report ${reported}${stale ? ' (STALE, the report wins in a check)' : ''}`
  );
}
