/**
 * Makes sure the GitHub Actions environment (default "staging") has every secret and variable the CI workflow
 * (.github/workflows/pii-api-tests.yml) reads. For each one:
 *   - already there in GitHub   → left alone (never overwritten)
 *   - missing, value in .env    → created from the local .env value
 *   - missing, no local value   → skipped and listed (empty or PENDING_ in .env)
 *
 * Values are passed to `gh` on stdin — never printed, never on the command line. Needs the GitHub CLI logged in
 * with admin rights on the repo:  brew install gh && gh auth login
 *
 *   npm run ci:sync-env                    # staging, creates what is missing
 *   npm run ci:sync-env -- --dry-run       # only shows what would be created
 *   npm run ci:sync-env -- --env qa        # another GitHub environment
 */
import dotenv from 'dotenv';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

type Kind = 'secret' | 'variable';
interface Setting {
  /** Name in GitHub (what the workflow reads). */
  name: string;
  kind: Kind;
  /** Where the value comes from locally: a .env key, or a file. */
  from: { env: string } | { file: string };
  /** Only sync when this local file exists (the DB settings need the SQL catalog, else CI DB setup breaks). */
  onlyIfFile?: string;
}

const DB_CATALOG = 'config/db-queries.json';

/** Everything .github/workflows/pii-api-tests.yml reads from the environment. */
const SETTINGS: Setting[] = [
  { name: 'AISLE_TEST_TOKEN', kind: 'secret', from: { env: 'AISLE_TEST_TOKEN' } },
  { name: 'AISLE_TEST_PHONES', kind: 'secret', from: { env: 'AISLE_TEST_PHONES' } },
  { name: 'AISLE_BASE_URL', kind: 'variable', from: { env: 'AISLE_BASE_URL' } },
  { name: 'AISLE_TEST_EMAIL_DOMAIN', kind: 'variable', from: { env: 'AISLE_TEST_EMAIL_DOMAIN' } },
  // Database (read-only checks) — synced only once the SQL catalog exists locally (DB tests are BLOCKED until then).
  { name: 'DB_ENGINE', kind: 'variable', from: { env: 'DB_ENGINE' }, onlyIfFile: DB_CATALOG },
  { name: 'DB_HOST', kind: 'variable', from: { env: 'DB_HOST' }, onlyIfFile: DB_CATALOG },
  { name: 'DB_PORT', kind: 'variable', from: { env: 'DB_PORT' }, onlyIfFile: DB_CATALOG },
  { name: 'DB_NAME', kind: 'variable', from: { env: 'DB_NAME' }, onlyIfFile: DB_CATALOG },
  { name: 'DB_USER', kind: 'variable', from: { env: 'DB_USER' }, onlyIfFile: DB_CATALOG },
  {
    name: 'DB_READONLY_PASSWORD',
    kind: 'secret',
    from: { env: 'DB_PASSWORD' },
    onlyIfFile: DB_CATALOG,
  },
  { name: 'DB_QUERIES_JSON', kind: 'secret', from: { file: DB_CATALOG } },
  // Report email.
  { name: 'SMTP_HOST', kind: 'variable', from: { env: 'SMTP_HOST' } },
  { name: 'SMTP_PORT', kind: 'variable', from: { env: 'SMTP_PORT' } },
  { name: 'SMTP_USER', kind: 'secret', from: { env: 'SMTP_USER' } },
  { name: 'SMTP_PASSWORD', kind: 'secret', from: { env: 'SMTP_PASSWORD' } },
  { name: 'REPORT_MAIL_FROM', kind: 'variable', from: { env: 'REPORT_MAIL_FROM' } },
  { name: 'REPORT_MAIL_TO', kind: 'variable', from: { env: 'REPORT_MAIL_TO' } },
];

function gh(args: string[], input?: string): { status: number; stdout: string; stderr: string } {
  const r = spawnSync('gh', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  if (r.error) throw r.error;
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function existingNames(kind: Kind, envName: string): Set<string> {
  const r = gh([kind, 'list', '--env', envName, '--json', 'name']);
  if (r.status !== 0) throw new Error(`gh ${kind} list failed: ${r.stderr.trim()}`);
  return new Set((JSON.parse(r.stdout || '[]') as { name: string }[]).map((x) => x.name));
}

function localValue(s: Setting, env: Record<string, string>): string | undefined {
  let value: string | undefined;
  if ('env' in s.from) value = env[s.from.env];
  else {
    const file = path.resolve(process.cwd(), s.from.file);
    value = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
  }
  value = value?.trim();
  return !value || value.startsWith('PENDING_') ? undefined : value;
}

function main(): number {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const envIdx = argv.indexOf('--env');
  const envName = envIdx >= 0 ? (argv[envIdx + 1] ?? '') : 'staging';
  if (!envName) throw new Error('--env needs a GitHub environment name');

  const envFile = path.resolve(process.cwd(), process.env.ENV_FILE ?? '.env');
  if (!existsSync(envFile))
    throw new Error(`${path.basename(envFile)} not found — run from the project root`);
  const env = dotenv.parse(readFileSync(envFile));

  if (spawnSync('gh', ['--version'], { stdio: 'ignore' }).error) {
    throw new Error('GitHub CLI not found. Install and log in: brew install gh && gh auth login');
  }
  if (gh(['auth', 'status']).status !== 0) throw new Error('GitHub CLI is not logged in: run gh auth login');

  // Create the GitHub environment if it does not exist yet (PUT is a no-op for an existing one).
  const repo = gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']).stdout.trim();
  if (!repo) throw new Error('Could not determine the GitHub repository (gh repo view)');
  if (gh(['api', `repos/${repo}/environments/${envName}`]).status !== 0) {
    if (dryRun) console.log(`  + environment "${envName}" would be created`);
    else if (gh(['api', '-X', 'PUT', `repos/${repo}/environments/${envName}`]).status !== 0) {
      throw new Error(`Could not create environment "${envName}" (admin rights on ${repo} needed)`);
    } else console.log(`  + environment "${envName}" created`);
  }

  const existing: Record<Kind, Set<string>> = {
    secret: existingNames('secret', envName),
    variable: existingNames('variable', envName),
  };

  console.log(
    `\nGitHub environment "${envName}" in ${repo}${dryRun ? ' (dry run — nothing changed)' : ''}\n`,
  );
  let failed = 0;
  for (const s of SETTINGS) {
    const label = `${s.name} (${s.kind})`;
    if (existing[s.kind].has(s.name)) {
      console.log(`  ✔ ${label} — already there, left unchanged`);
      continue;
    }
    if (s.onlyIfFile && !existsSync(path.resolve(process.cwd(), s.onlyIfFile))) {
      console.log(`  ⚠ ${label} — missing, skipped: ${s.onlyIfFile} not set up yet`);
      continue;
    }
    const value = localValue(s, env);
    const source = 'env' in s.from ? `.env ${s.from.env}` : s.from.file;
    if (value === undefined) {
      console.log(`  ⚠ ${label} — missing, skipped: no value in ${source}`);
      continue;
    }
    if (dryRun) {
      console.log(`  + ${label} — would be created from ${source}`);
      continue;
    }
    // The value goes in on stdin, so it never appears in the process list or the shell history.
    const r = gh([s.kind, 'set', s.name, '--env', envName], value);
    if (r.status === 0) console.log(`  + ${label} — created from ${source}`);
    else {
      failed += 1;
      console.log(`  ✘ ${label} — could not be created: ${r.stderr.trim().split('\n')[0]}`);
    }
  }
  console.log('');
  return failed ? 1 : 0;
}

try {
  process.exitCode = main();
} catch (e) {
  console.error(`✘ ${(e as Error).message}`);
  process.exitCode = 1;
}
