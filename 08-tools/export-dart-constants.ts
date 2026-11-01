// export-dart-constants.ts
//
// Reads 02-contracts/constants.json and writes a Dart constants file into the
// target app repo at lib/generated/app_constants.dart. Keys are converted
// from SCREAMING_SNAKE_CASE to camelCase Dart names. The file is generated:
// it starts with a DO NOT EDIT header and is safe to regenerate.
//
// Usage: node export-dart-constants.ts <app-repo>   (or set APP_REPO, default ".")

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

const HEADER = 'export-dart-constants failed';

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

// SCREAMING_SNAKE_CASE to camelCase: GPS_INTERVAL_SEC -> gpsIntervalSec
function toDartName(key: string): string {
  return key
    .toLowerCase()
    .replace(/_+([a-z0-9])/g, (_match, char: string) => char.toUpperCase())
    .replace(/^_+/, '');
}

// A "$" or a "\" in the value would start an interpolation or an escape in a
// normal Dart string, so those values become raw strings.
function dartString(value: string): string {
  if (/[$\\]/.test(value)) {
    if (!value.includes('"')) return `r"${value}"`;
    return `r'''${value}'''`;
  }
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function dartType(entry: ConstantEntry): string {
  if (entry.declaredType === 'string[]' || Array.isArray(entry.value)) return 'List<String>';
  if (typeof entry.value === 'number') return Number.isInteger(entry.value) ? 'int' : 'double';
  if (typeof entry.value === 'string') return 'String';
  if (typeof entry.value === 'boolean') return 'bool';
  return 'Object';
}

function dartLiteral(value: Json): string {
  if (typeof value === 'string') return dartString(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `[${value.map((item) => dartString(String(item))).join(', ')}]`;
  return 'null';
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

  const names = new Set<string>();
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
    const name = toDartName(entry.key);
    if (!/^[a-z][a-zA-Z0-9]*$/.test(name)) {
      errors.push(`${label} cannot be turned into a Dart identifier ("${name}")`);
    } else if (names.has(name)) {
      errors.push(`${label} produces the duplicate Dart name "${name}"`);
    }
    names.add(name);
  }
  if (errors.length > 0) printErrors(HEADER, errors);

  const contractVersion = await currentContractVersion();
  const lines: string[] = [
    '// GENERATED FILE. DO NOT EDIT.',
    `// Source: 02-contracts/constants.json in the platform repo (contract version ${contractVersion}).`,
    '// Regenerate with: node 08-tools/export-dart-constants.ts <path to this repo>',
    '',
    '// Every number and string that must match on both sides of a boundary.',
    '',
    'class AppConstants {',
    '  const AppConstants._();',
    '',
  ];
  let currentGroup = '';
  for (const entry of entries) {
    if (entry.group !== currentGroup) {
      currentGroup = entry.group;
      const groupNote = entry.groupNote === undefined ? '' : `: ${entry.groupNote}`;
      lines.push(`  // ${entry.group}${groupNote}`);
      lines.push('');
    }
    const docParts: string[] = [];
    if (entry.note !== undefined) docParts.push(entry.note);
    if (entry.unit !== undefined) docParts.push(`(${entry.unit})`);
    if (docParts.length > 0) lines.push(`  /// ${docParts.join(' ')}`);
    lines.push(`  static const ${dartType(entry)} ${toDartName(entry.key)} = ${dartLiteral(entry.value)};`);
    lines.push('');
  }
  lines.push('}');

  const outPath = path.join(target, 'lib', 'generated', 'app_constants.dart');
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${lines.join('\n')}\n`);
  console.log(`exported ${entries.length} constants to ${outPath}`);
  ok('dart constants exported');
}

try {
  await main();
} catch (cause) {
  printErrors(HEADER, [errorText(cause)]);
}
