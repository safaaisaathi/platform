// export-ts-constants.ts
//
// Reads 02-contracts/constants.json and writes a TypeScript constants file
// into the target app repo at lib/generated/app_constants.ts. Keys keep their
// SCREAMING_SNAKE_CASE names. The file is generated: it starts with a DO NOT
// EDIT header and is safe to regenerate.
//
// Usage: node export-ts-constants.ts <app-repo>   (or set APP_REPO, default ".")

import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  CONSTANTS_PATH,
  KNOWN_CONSTANT_TYPES,
  asObject,
  currentContractVersion,
  flattenConstants,
  isJsonObject,
  ok,
  printErrors,
  readJson,
  resolveTargetRepo,
  typeMatches,
  type ConstantEntry,
  type Json,
} from './lib.ts';

const HEADER = 'export-ts-constants failed';

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function tsLiteral(value: Json): string {
  if (Array.isArray(value)) {
    return `${JSON.stringify(value)} as const`;
  }
  return JSON.stringify(value);
}

function isExportable(value: Json | undefined): boolean {
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return true;
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

async function main(): Promise<void> {
  const errors: string[] = [];
  const target = resolveTargetRepo(process.argv);
  const targetStat = await stat(target).catch(() => undefined);
  if (targetStat === undefined || !targetStat.isDirectory()) {
    printErrors(HEADER, [`target repo not found: ${target}`]);
  }

  const doc = asObject(await readJson(CONSTANTS_PATH), '02-contracts/constants.json');
  const { entries, errors: flattenErrors } = flattenConstants(doc);
  errors.push(...flattenErrors);

  for (const entry of entries) {
    const label = `constants.json: ${entry.group}.${entry.key}`;
    if (entry.value === undefined) {
      errors.push(`${label} has no "value"`);
      continue;
    }
    if (!isExportable(entry.value)) {
      errors.push(`${label} has a value type the exporter does not support (number, string, boolean or array of strings)`);
    }
    if (entry.declaredType !== undefined) {
      if (!KNOWN_CONSTANT_TYPES.includes(entry.declaredType)) {
        errors.push(`${label} declares an unknown type "${entry.declaredType}"`);
      } else if (!typeMatches(entry.value, entry.declaredType)) {
        errors.push(`${label} declares type "${entry.declaredType}" but the value does not match`);
      }
    }
    if (!/^[A-Z][A-Z0-9_]*$/.test(entry.key)) {
      errors.push(`${label} is not a SCREAMING_SNAKE_CASE key, refusing to export it as a TypeScript name`);
    }
  }
  if (errors.length > 0) printErrors(HEADER, errors);

  const contractVersion = await currentContractVersion();
  const lines: string[] = [
    '// GENERATED FILE. DO NOT EDIT.',
    `// Source: 02-contracts/constants.json in the platform repo (contract version ${contractVersion}).`,
    '// Regenerate with: node 08-tools/export-ts-constants.ts <path to this repo>',
    '',
    '// Every number and string that must match on both sides of a boundary.',
    '',
  ];
  let currentGroup = '';
  for (const entry of entries) {
    if (entry.group !== currentGroup) {
      currentGroup = entry.group;
      const groupNote = entry.groupNote === undefined ? '' : `: ${entry.groupNote}`;
      lines.push(`// ${entry.group}${groupNote}`);
      lines.push('');
    }
    const docParts: string[] = [];
    if (entry.note !== undefined) docParts.push(entry.note);
    if (entry.unit !== undefined) docParts.push(`(${entry.unit})`);
    if (docParts.length > 0) lines.push(`/** ${docParts.join(' ')} */`);
    lines.push(`export const ${entry.key} = ${tsLiteral(entry.value)};`);
    lines.push('');
  }

  const outPath = path.join(target, 'lib', 'generated', 'app_constants.ts');
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${lines.join('\n')}\n`);
  console.log(`exported ${entries.length} constants to ${outPath}`);
  ok('ts constants exported');
}

try {
  await main();
} catch (cause) {
  printErrors(HEADER, [errorText(cause)]);
}
