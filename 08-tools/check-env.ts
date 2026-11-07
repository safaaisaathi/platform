// check-env.ts
//
// Read-only status report for the project this repo deploys to. It answers the
// three questions a deploy is blocked on, without printing any secret value:
//
//   - is the project's billing account enabled, and is the account open?
//   - which of the defineSecret() names already exist in Secret Manager?
//   - which Cloud Functions are deployed, and on what runtime?
//
// It reads. It writes nothing. It needs network access and a logged-in
// Firebase CLI (or gcloud, or FIREBASE_ACCESS_TOKEN).
//
// The Firebase CLI writes a refresh token to its config file. This tool
// exchanges that refresh token with the CLI's own public installed-app OAuth
// client, which is the same client every firebase-tools install ships. Google
// does not treat an installed-app client secret as a secret: it cannot keep
// one, because it ships in the binary. It identifies the CLI, not the user.
//
// Usage:
//   node --experimental-strip-types check-env.ts
//   node --experimental-strip-types check-env.ts --json
//
// Exits 0 when the report was produced, 1 when no access token could be found.

import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import type { Dirent } from 'node:fs';

import { REPO_ROOT, isJsonObject, type JsonObject } from './lib.ts';

const run = promisify(execFile);

const FIREBASE_CONFIG = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
const FIREBASE_CLI_CLIENT = {
  id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
  secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
};

type EnvReport = {
  project: string;
  billing: { enabled: boolean | null; account: string | null; open: boolean | null; name: string | null };
  secretManagerApi: string | null;
  secrets: { expected: string[]; present: string[] | null; missing: string[] };
  functions: { count: number | null; items: Array<{ name: string; runtime: string; state: string }> };
  errors: string[];
};

function projectOverride(): string | undefined {
  const override = process.env['FIREBASE_PROJECT'];
  return override !== undefined && override.length > 0 ? override : undefined;
}

async function firebaseProject(): Promise<string> {
  const override = projectOverride();
  if (override !== undefined) return override;
  const text = await readFile(path.join(REPO_ROOT, '.firebaserc'), 'utf8');
  const parsed = JSON.parse(text) as JsonObject;
  const projects = parsed['projects'];
  if (isJsonObject(projects)) {
    const fallback = projects['default'];
    if (typeof fallback === 'string' && fallback.length > 0) return fallback;
  }
  throw new Error('.firebaserc has no projects.default');
}

// Tries, in order: FIREBASE_ACCESS_TOKEN, gcloud, the Firebase CLI refresh
// token. Returns undefined when none works.
async function accessToken(): Promise<string | undefined> {
  const direct = process.env['FIREBASE_ACCESS_TOKEN'];
  if (direct !== undefined && direct.length > 0) return direct;

  try {
    const { stdout } = await run('gcloud', ['auth', 'print-access-token']);
    const token = stdout.trim();
    if (token.length > 0) return token;
  } catch {
    // gcloud is not installed, or has no account. Fall through.
  }

  try {
    const configRaw = JSON.parse(await readFile(FIREBASE_CONFIG, 'utf8')) as JsonObject;
    const tokens = configRaw['tokens'];
    if (!isJsonObject(tokens)) return undefined;
    const refresh = tokens['refresh_token'];
    if (typeof refresh !== 'string' || refresh.length === 0) return undefined;

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: FIREBASE_CLI_CLIENT.id,
      client_secret: FIREBASE_CLI_CLIENT.secret,
    });
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
    const payload = (await response.json()) as JsonObject;
    const token = payload['access_token'];
    return typeof token === 'string' && token.length > 0 ? token : undefined;
  } catch {
    return undefined;
  }
}

async function getJson(url: string, token: string): Promise<JsonObject | undefined> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) return undefined;
  const payload = (await response.json()) as unknown;
  return isJsonObject(payload) ? payload : undefined;
}

// Reads the secret names out of the source, so the checklist never drifts from
// the code. Only the names are read. No value is in the source.
async function expectedSecrets(dir: string): Promise<string[]> {
  const names = new Set<string>();
  const marker = 'defineSecret(';
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const name of await expectedSecrets(full)) names.add(name);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const text = await readFile(full, 'utf8');
    let cursor = text.indexOf(marker);
    while (cursor !== -1) {
      const rest = text.slice(cursor + marker.length);
      const match = /^['"]([A-Z][A-Z0-9_]*)['"]/.exec(rest);
      if (match !== null) names.add(match[1]);
      cursor = text.indexOf(marker, cursor + marker.length);
    }
  }
  return [...names].sort();
}

async function check(project: string): Promise<EnvReport> {
  const report: EnvReport = {
    project,
    billing: { enabled: null, account: null, open: null, name: null },
    secretManagerApi: null,
    secrets: { expected: await expectedSecrets(path.join(REPO_ROOT, '04-functions', 'src')), present: null, missing: [] },
    functions: { count: null, items: [] },
    errors: [],
  };

  const token = await accessToken();
  if (token === undefined) {
    report.errors.push(
      'no access token: log in with the Firebase CLI, install gcloud, or set FIREBASE_ACCESS_TOKEN'
    );
    return report;
  }

  const billing = await getJson(`https://cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`, token);
  if (billing === undefined) {
    report.errors.push('billing: could not read the project billing info');
  } else {
    report.billing.enabled = billing['billingEnabled'] === true;
    const account = billing['billingAccountName'];
    report.billing.account = typeof account === 'string' ? account : null;
    const accountName = report.billing.account?.split('/').pop();
    if (accountName !== undefined) {
      const detail = await getJson(`https://cloudbilling.googleapis.com/v1/billingAccounts/${accountName}`, token);
      if (detail !== undefined) {
        report.billing.open = detail['open'] === true;
        const display = detail['displayName'];
        report.billing.name = typeof display === 'string' ? display : null;
      }
    }
  }

  const service = await getJson(
    `https://serviceusage.googleapis.com/v1/projects/${project}/services/secretmanager.googleapis.com`,
    token
  );
  if (service !== undefined) {
    const state = service['state'];
    report.secretManagerApi = typeof state === 'string' ? state : null;
  }

  const secrets = await getJson(
    `https://secretmanager.googleapis.com/v1/projects/${project}/secrets?pageSize=200`,
    token
  );
  if (secrets === undefined) {
    report.errors.push('secrets: could not list Secret Manager secrets');
  } else {
    const items = secrets['secrets'];
    const present = new Set<string>();
    if (Array.isArray(items)) {
      for (const item of items) {
        if (!isJsonObject(item)) continue;
        const full = item['name'];
        if (typeof full === 'string') present.add(full.split('/').pop() ?? '');
      }
    }
    report.secrets.present = [...present].sort();
    report.secrets.missing = report.secrets.expected.filter((name) => !present.has(name));
  }

  const functions = await getJson(
    `https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/-/functions?pageSize=200`,
    token
  );
  if (functions === undefined) {
    report.errors.push('functions: could not list Cloud Functions');
  } else {
    const items = functions['functions'];
    if (Array.isArray(items)) {
      for (const item of items) {
        if (!isJsonObject(item)) continue;
        const full = item['name'];
        const build = item['buildConfig'];
        const runtimeRaw = isJsonObject(build) ? build['runtime'] : undefined;
        const state = item['state'];
        report.functions.items.push({
          name: typeof full === 'string' ? (full.split('/').pop() ?? full) : '(unknown)',
          runtime: typeof runtimeRaw === 'string' ? runtimeRaw : '?',
          state: typeof state === 'string' ? state : '?',
        });
      }
      report.functions.items.sort((a, b) => a.name.localeCompare(b.name));
      report.functions.count = report.functions.items.length;
    }
  }

  return report;
}

function print(report: EnvReport): void {
  console.log(`project: ${report.project}`);

  const billing = report.billing;
  if (billing.enabled === null) {
    console.log('billing: unavailable');
  } else {
    const account = billing.account ?? 'none';
    const open = billing.open === null ? 'unknown' : String(billing.open);
    const name = billing.name === null ? 'unknown' : billing.name;
    console.log(`billing: enabled=${billing.enabled} account=${account} open=${open} name=${name}`);
  }

  console.log(`secretmanager api: ${report.secretManagerApi ?? 'unknown'}`);

  const expected = report.secrets.expected.length;
  if (report.secrets.present === null) {
    console.log(`secrets: unavailable, ${expected} defined in 04-functions`);
  } else {
    console.log(`secrets: ${report.secrets.present.length} present, ${expected} defined in 04-functions`);
  }
  if (report.secrets.missing.length > 0) {
    console.log(`secrets missing: ${report.secrets.missing.join(', ')}`);
  }

  if (report.functions.count === null) {
    console.log('functions: unavailable');
  } else {
    console.log(`functions: ${report.functions.count} deployed`);
    for (const item of report.functions.items) {
      console.log(`  - ${item.name} ${item.runtime} ${item.state}`);
    }
  }

  for (const line of report.errors) console.log(`!! ${line}`);
  console.log('note: secret values were not read and not printed');
}

async function main(): Promise<void> {
  const project = await firebaseProject();
  const report = await check(project);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    print(report);
  }

  if (report.errors.some((line) => line.startsWith('no access token'))) process.exit(1);
}

await main();
