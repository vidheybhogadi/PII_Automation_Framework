/**
 * Which backend branches contain each documented route, and whether it was actually seen on staging — the "Branch"
 * and "Env" pills of the API_Guide website.
 *
 *   npm run docs:api:branches -- --out <API_Guide clone>     update the shared vernac folder in the clone
 *   (the Aisle folder gets the same field from export.ts, so `docs:api` / `docs:api:publish` keep it current)
 *
 * Facts only (QA lead, 2026-11-20: "don't assume — just mention the branch"):
 *   - branches: a route is on a branch when that branch's config/routes.rb has a route matching METHOD + path. The
 *     backend clones are read with `git cat-file` at `origin/<branch>` — never checked out, modified or run. Which
 *     branch an environment runs is NOT inferred here.
 *   - seen: set only when the entry carries a staging observation (lastVerified / history source 'staging', or a
 *     recorded QA observation), with that date.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitReader, snapshot, type CodeSnapshot } from './drift/code';

export interface DeployBranch {
  name: string;
  /** Short commit the route was read at. */
  sha: string;
  /** One of the backend's long-lived branches (master / staging / develop…), not a feature branch. */
  main: boolean;
}
/** Per endpoint: names of the tracked branches whose routes.rb has the route (empty: matched on none). */
export interface DeployInfo {
  branches: string[];
  seen?: { env: 'staging'; host: string; date: string };
}
/** Per folder (api-data.json `meta.deploy`): every branch that was read, with its commit. */
export interface DeployMeta {
  source: 'code';
  label: string;
  branches: DeployBranch[];
}

interface Track {
  dir: string;
  main: string[];
  feature: string[];
  stagingHost: string;
}

const home = (p: string) => p.replace(/^~(?=\/)/, os.homedir());
export const TRACKS: Record<'aisle' | 'vernac', Track> = {
  aisle: {
    dir: home(process.env.AISLE_REPO_DIR?.trim() || '~/Downloads/PII/aisle_new'),
    main: ['master', 'staging', 'develop_new'],
    feature: [
      'saurabh/pii-changes',
      'saurabh/pii-email',
      'saurabh/pii-phone',
      'jup/free_text_pii',
      'jup/cms_pii',
      'jup/pii',
      'fix-pii-m2-first-name',
    ],
    stagingHost: 'testa2.aisle.co',
  },
  vernac: {
    dir: home(process.env.VERNAC_REPO_DIR?.trim() || '~/Downloads/PII/repos/desiapp'),
    main: ['master', 'staging', 'develop'],
    feature: ['jup/pii'],
    stagingHost: 'testapp.koode.co',
  },
};

interface EntryLike {
  id?: string;
  method: string;
  path: string;
  lastVerified?: { date?: string; source?: string; label?: string };
  history?: { date?: string; source?: string; label?: string }[];
}

/** Snapshots of every tracked branch that exists in the clone (null when the clone is missing). */
export function branchSnapshots(
  app: keyof typeof TRACKS,
): { name: string; main: boolean; snap: CodeSnapshot }[] | null {
  const t = TRACKS[app];
  if (!existsSync(path.join(t.dir, '.git'))) return null;
  const out: { name: string; main: boolean; snap: CodeSnapshot }[] = [];
  for (const [list, main] of [
    [t.main, true],
    [t.feature, false],
  ] as const)
    for (const name of list) {
      try {
        out.push({ name, main, snap: snapshot(gitReader(t.dir, `origin/${name}`, ['config/routes.rb'])) });
      } catch {
        // branch not in this clone (or no routes.rb there): not tracked for this run
      }
    }
  return out;
}

/** Latest staging observation recorded for an entry (never inferred from branches). */
export function seenOnStaging(e: EntryLike, host: string, observed?: string): DeployInfo['seen'] | undefined {
  const dates: string[] = [];
  if (e.lastVerified?.source === 'staging' && e.lastVerified.date) dates.push(e.lastVerified.date);
  for (const h of e.history ?? []) if (h?.source === 'staging' && h.date) dates.push(h.date);
  const m = observed?.match(/Observed (\d{4}-\d{2}-\d{2})/);
  if (m) dates.push(m[1]!);
  if (!dates.length) return undefined;
  return { env: 'staging', host, date: dates.sort().at(-1)! };
}

export function deployFor(
  app: keyof typeof TRACKS,
  entries: EntryLike[],
  observed: Record<string, string> = {},
): { meta: DeployMeta; of: Map<EntryLike, DeployInfo> } | null {
  const snaps = branchSnapshots(app);
  if (!snaps) return null;
  const of = new Map<EntryLike, DeployInfo>();
  for (const e of entries) {
    const branches = snaps
      .filter((s) => s.snap.endpoint(e.method.toUpperCase(), e.path).route)
      .map((s) => s.name);
    const seen = seenOnStaging(e, TRACKS[app].stagingHost, e.id ? observed[e.id] : undefined);
    of.set(e, { branches, ...(seen ? { seen } : {}) });
  }
  const meta: DeployMeta = {
    source: 'code',
    label: 'from code — confirm with Dev',
    branches: snaps.map((s) => ({ name: s.name, sha: s.snap.sha.slice(0, 7), main: s.main })),
  };
  return { meta, of };
}

/** One Markdown line for an endpoint ("" when there is nothing to say). */
export function deployLine(d: DeployInfo | undefined, meta: DeployMeta | undefined): string {
  if (!d || !meta) return '';
  const sha = new Map(meta.branches.map((b) => [b.name, b.sha]));
  const br = d.branches.length
    ? d.branches.map((b) => `\`${b}\` @${sha.get(b)}`).join(', ')
    : 'not matched on the tracked branches';
  return `**Branch** ${br}${d.seen ? ` · **Env** Staging (${d.seen.host}, seen ${d.seen.date})` : ''} _(from code — confirm with Dev)_`;
}

/** CLI: add `deploy` to the shared vernac folder of an API_Guide clone (api-data.json + its Markdown copy). */
function main() {
  const i = process.argv.indexOf('--out');
  const out = i > 0 ? process.argv[i + 1] : undefined;
  if (!out) throw new Error('Usage: npm run docs:api:branches -- --out <API_Guide clone>');
  const dir = path.join(out, 'content/apps/vernac');
  const file = path.join(dir, 'api-data.json');
  const data = JSON.parse(readFileSync(file, 'utf8')) as {
    meta: Record<string, unknown>;
    apis: (EntryLike & { deploy?: DeployInfo })[];
  };
  const res0 = deployFor('vernac', data.apis);
  if (!res0) {
    console.log(`API docs: vernac clone not found at ${TRACKS.vernac.dir} — branch pills left unchanged.`);
    return;
  }
  data.meta.deploy = res0.meta;
  for (const a of data.apis) a.deploy = res0.of.get(a)!;
  writeFileSync(file, `${JSON.stringify(data, null, 1)}\n`);

  // Markdown copy: one Branch line after each endpoint's "_Last verified …_" line (replaced on re-runs).
  const mdFile = path.join(dir, 'API-Documentation.md');
  if (existsSync(mdFile)) {
    const byKey = new Map(data.apis.map((a) => [`${a.method.toUpperCase()} ${a.path}`, a.deploy]));
    const res: string[] = [];
    let cur: DeployInfo | undefined;
    for (const l of readFileSync(mdFile, 'utf8').split('\n')) {
      if (l.startsWith('**Branch** ')) {
        if (res.at(-1) === '') res.pop(); // drop the line written by an earlier run (and its blank line)
        continue;
      }
      const h = l.match(/^#### `(\S+) (\S+)`/);
      if (h) cur = byKey.get(`${h[1]} ${h[2]}`);
      res.push(l);
      if (cur && l.startsWith('**Called by** ')) {
        res.push('', deployLine(cur, res0.meta));
        cur = undefined;
      }
    }
    writeFileSync(mdFile, res.join('\n'));
  }
  const on = (n: string) => data.apis.filter((a) => a.deploy!.branches.includes(n)).length;
  console.log(
    `API docs: vernac branch pills — ${data.apis.length} endpoints; ${res0.meta.branches.map((b) => `${b.name} ${on(b.name)}`).join(', ')}`,
  );
}

if (require.main === module)
  try {
    main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
