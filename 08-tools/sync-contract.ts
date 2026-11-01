// sync-contract.ts
//
// Copies 02-contracts/, 03-rules/ and 05-decisions/ into the app repo's
// .contract/vendor/ and writes .contract/fingerprint.json with the sha256 of
// each copied file. Running it twice over the same contract produces the same
// bytes, so it is safe to re-run and CI can diff the fingerprint.
//
// Usage: node sync-contract.ts <app-repo>   (or set APP_REPO, default ".")

import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

import {
  CONTRACTS_DIR,
  DECISIONS_DIR,
  RULES_DIR,
  currentContractVersion,
  listFilesRecursive,
  ok,
  printErrors,
  resolveTargetRepo,
} from './lib.ts';

const HEADER = 'sync-contract failed';

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

async function main(): Promise<void> {
  const target = resolveTargetRepo(process.argv);
  const targetStat = await stat(target).catch(() => undefined);
  if (targetStat === undefined || !targetStat.isDirectory()) {
    printErrors(HEADER, [`target repo not found: ${target}`]);
  }

  const contractVersion = await currentContractVersion();
  const vendorRoot = path.join(target, '.contract', 'vendor');
  const sources: Array<[string, string]> = [
    ['02-contracts', CONTRACTS_DIR],
    ['03-rules', RULES_DIR],
    ['05-decisions', DECISIONS_DIR],
  ];

  await mkdir(path.join(target, '.contract'), { recursive: true });
  const copied: string[] = [];
  for (const [name, sourceDir] of sources) {
    const sourceStat = await stat(sourceDir).catch(() => undefined);
    if (sourceStat === undefined || !sourceStat.isDirectory()) {
      printErrors(HEADER, [`${name}/ is missing from the platform repo`]);
    }
    const files = await listFilesRecursive(sourceDir);
    const destRoot = path.join(vendorRoot, name);
    // Remove the previous copy first, so files deleted from the contract do
    // not survive in the vendor folder.
    await rm(destRoot, { recursive: true, force: true });
    await mkdir(destRoot, { recursive: true });
    for (const rel of files) {
      const dest = path.join(destRoot, rel);
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(path.join(sourceDir, rel), dest);
      copied.push(`${name}/${rel}`);
    }
    console.log(`synced ${name} (${files.length} files)`);
  }

  // The fingerprint is a pure function of the copied bytes: no timestamp, so
  // an unchanged contract always writes the same file.
  const files: Record<string, string> = {};
  for (const rel of copied) {
    const bytes = await readFile(path.join(vendorRoot, rel));
    files[rel] = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  }
  const fingerprint = {
    contractVersion,
    note: 'sha256 of each vendored file. Written by 08-tools/sync-contract.ts. Deterministic: the same contract content always produces the same fingerprint.',
    files,
  };
  const fingerprintPath = path.join(target, '.contract', 'fingerprint.json');
  await writeFile(fingerprintPath, `${JSON.stringify(fingerprint, null, 2)}\n`);
  console.log(`wrote .contract/fingerprint.json (${copied.length} files)`);
  ok(`contract synced into ${vendorRoot}`);
}

try {
  await main();
} catch (cause) {
  printErrors(HEADER, [errorText(cause)]);
}
