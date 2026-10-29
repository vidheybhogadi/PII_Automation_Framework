/**
 * API docs drift check — spots changes to the documented Aisle APIs automatically.
 *
 *   npm run docs:api:drift                 report only → m2/docs/api-drift-report.md + .json
 *   npm run docs:api:drift -- --apply      also append the evidence-backed changes to m2/docs/api-changes.json and
 *                                          regenerate docs/API-Documentation.md (then `npm run docs:api:publish`)
 *
 * Options: --no-fetch (skip `git fetch`), --repo <Aisle clone> (default AISLE_REPO_DIR or ~/Downloads/PII/aisle_new),
 * --head <ref> (default origin/develop_new — the ref that matches staging), --base <ref> (default ae838f4 — the
 * documented inventory snapshot), --run <run-data.json> (repeatable; default reports/m2/latest/run-data.json).
 *
 * Read-only on the Aisle code: only `git fetch` and `git show <ref>:<path>` — it never checks out, modifies, runs or
 * copies that code, and never records secrets (only route lines, param and key NAMES, file:line @sha). Staging facts
 * come from the latest M2 run's recorded 2xx exchanges (field names only). Ambiguous items are listed under "Needs
 * review" and are never applied. Run it after each M2 run (docs/execution-guide.md).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import * as prettier from 'prettier';
import { ABOUT, appendChanges, CHANGES_FILE, loadChanges, type ApiChange, type ChangeLog } from './changes';
import { gitReader, snapshot } from './drift/code';
import { compare, type DocEndpoint, type DriftResult, type Finding } from './drift/compare';
import { readRun } from './drift/staging';
import {
  ABOUT_CODE_ROUTES,
  CODE_ROUTES_JSON,
  CODE_ROUTES_MD,
  codeRoutesFrom,
  codeRoutesMarkdown,
  loadCodeRoutes,
} from './code-routes';
import { build, GROUP_INFO } from './export';

const ROOT = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });
const REPORT_MD = 'm2/docs/api-drift-report.md';
const REPORT_JSON = 'm2/docs/api-drift-report.json';

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const args = (name: string) =>
  process.argv.flatMap((a, i) => (a === name && process.argv[i + 1] ? [process.argv[i + 1]!] : []));

/** The docs' current statement of every endpoint (export content with the recorded changes merged). */
export function docEndpoints(data: ReturnType<typeof build>): DocEndpoint[] {
  return data.apis.map((a) => ({
    apiId: a.id,
    method: a.method,
    path: a.path,
    sourceFile: a.source.split(';')[0]!.trim() || undefined,
    params: a.params.map((p) => ({ ...p, source: p.source as DocEndpoint['params'][number]['source'] })),
    responseFields: a.responseFields.map((p) => ({
      ...p,
      source: p.source as DocEndpoint['params'][number]['source'],
    })),
    headers: a.headers.map((h) => h[0]),
    ...(a.removed ? { removed: { on: a.removed.on } } : {}),
  }));
}

/** Findings that may be applied (evidence-backed, not "needs review", not a new API). */
export const applicable = (f: Finding) =>
  !f.review && f.kind !== 'endpoint-added' && f.kind !== 'route-changed';

/** Change-log entries for the applicable findings of a drift result. */
export function toChanges(r: DriftResult, today: string): ApiChange[] {
  const stagingDate =
    r.staging
      .map((s) => s.date)
      .sort()
      .pop() ?? today;
  return r.findings.filter(applicable).map((f) => ({
    date: f.source === 'staging' ? stagingDate : today,
    apiId: f.apiId,
    kind: f.kind as ApiChange['kind'],
    name: f.name,
    before: f.before,
    after: f.after,
    source: f.source,
    evidence: f.evidence.join('; '),
  }));
}

/** Record when each endpoint was last confirmed against code and staging. */
export function markVerified(
  log: ChangeLog,
  r: DriftResult,
  verifiedIds: { code: string[]; staging: Map<string, string> },
  today: string,
) {
  for (const id of verifiedIds.code)
    log.verified[id] = { ...log.verified[id], code: { date: today, ref: r.head.sha.slice(0, 7) } };
  for (const [id, date] of verifiedIds.staging) log.verified[id] = { ...log.verified[id], staging: { date } };
}

// ---- Report ------------------------------------------------------------------------------------------------------
const KIND: Record<string, string> = {
  'endpoint-removed': 'Endpoint removed',
  'endpoint-restored': 'Endpoint restored',
  'endpoint-added': 'Endpoint added under a documented controller (list only)',
  'route-changed': 'Route now served by another controller',
  'param-added': 'Request param added',
  'param-removed': 'Request param removed',
  'param-changed': 'Request param changed',
  'field-added': 'Response field added',
  'field-removed': 'Response field removed',
  'field-changed': 'Response field changed',
};
const attrs = (x: Finding['after']) =>
  x
    ? [x.required === undefined ? '' : x.required ? 'required' : 'optional', x.type ?? '']
        .filter(Boolean)
        .join(', ')
    : '';
const cell = (s: string) => s.replace(/\|/g, '\\|');

export function reportMarkdown(r: DriftResult, today: string): string {
  const ok = r.findings.filter(applicable);
  const review = r.findings.filter((f) => f.review);
  const added = r.findings.filter((f) => f.kind === 'endpoint-added');
  const count = (k: string, list = ok) => list.filter((f) => f.kind === k).length;
  const out: string[] = [
    '<!-- GENERATED by `npm run docs:api:drift` (scripts/api-docs/drift.ts) — do not edit by hand. -->',
    '',
    '# API docs drift report',
    '',
    `Generated ${today}. Code: \`${r.head.ref}\` @ \`${r.head.sha.slice(0, 7)}\` (${r.head.date}) compared with the documented snapshot \`${r.base.ref}\` @ \`${r.base.sha.slice(0, 7)}\` (${r.base.date}). Staging: ${
      r.staging.length ? r.staging.map((s) => `run \`${s.runId}\` (${s.date})`).join(', ') : 'no recordings'
    }. ${r.checked} documented endpoints checked.`,
    '',
    'Code facts are **from code — confirm with Dev**; staging observations win when they differ. Items under **Needs review** are never applied. `npm run docs:api:drift -- --apply` appends the other items to `m2/docs/api-changes.json` and regenerates the docs.',
    '',
    '## Summary',
    '',
    '| Category | Will apply | Needs review | Listed only |',
    '| --- | --- | --- | --- |',
    ...[
      'endpoint-removed',
      'endpoint-restored',
      'param-added',
      'param-removed',
      'param-changed',
      'field-added',
      'field-removed',
      'route-changed',
    ].map((k) => `| ${KIND[k]} | ${k === 'route-changed' ? '—' : count(k)} | ${count(k, review)} | — |`),
    `| ${KIND['endpoint-added']} | — | — | ${added.length} (new-API flow) |`,
    `| Endpoints whose params or response could not be fully determined | — | — | ${new Set(r.notDetermined.map((n) => n.apiId)).size} |`,
    '',
    'Confidence: **high** = new since the snapshot or seen on staging; **medium** = present in the code at the snapshot too (missing from the source document) or only part of the response is visible in the code; **low** = needs review.',
    '',
  ];
  const groupBy = (list: Finding[]) => {
    const m = new Map<string, Finding[]>();
    for (const f of list) {
      const k = f.apiId ? `${f.apiId} · ${f.method} ${f.path}` : `${f.method} ${f.path}`;
      m.set(k, [...(m.get(k) ?? []), f]);
    }
    return m;
  };
  /** Response fields added with the same source, confidence and note are one row (names listed together). */
  const rows = (list: Finding[]) => {
    const out2: { f: Finding; names: string[]; evidence: string[] }[] = [];
    for (const f of list) {
      const same =
        f.kind === 'field-added'
          ? out2.find(
              (x) =>
                x.f.kind === f.kind &&
                x.f.source === f.source &&
                x.f.confidence === f.confidence &&
                x.f.note === f.note,
            )
          : undefined;
      const lineOf =
        f.kind === 'field-added' && f.source === 'code' ? (f.evidence[0]!.match(/:(\d+) @/)?.[1] ?? '') : '';
      const label = lineOf ? `${f.name} (L${lineOf})` : f.name;
      if (same) {
        same.names.push(label);
        if (f.source === 'code') same.evidence[0] = same.evidence[0]!.replace(/:\d+ @/, ' @');
      } else out2.push({ f, names: [label], evidence: [...f.evidence] });
    }
    return out2;
  };
  const table = (list: Finding[]) => [
    '| Change | Name | Detail | Source | Confidence | Evidence |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows(list).map(
      ({ f, names, evidence }) =>
        `| ${KIND[f.kind]} | ${names[0] ? names.map((n) => `\`${cell(n)}\``).join(', ') : '—'} | ${cell(
          [
            f.before || f.after ? `${attrs(f.before) || '—'} → ${attrs(f.after) || 'not stated'}` : '',
            f.note ?? '',
          ]
            .filter(Boolean)
            .join(' · '),
        )} | ${f.source} | ${f.confidence} | ${cell(evidence.join('<br>'))} |`,
    ),
  ];
  out.push('## Changes by endpoint (will apply)', '');
  if (!ok.length) out.push('None.', '');
  for (const [k, list] of groupBy(ok)) out.push(`### ${k}`, '', ...table(list), '');
  out.push('## Needs review (never applied)', '');
  if (!review.length) out.push('None.', '');
  for (const [k, list] of groupBy(review)) out.push(`### ${k}`, '', ...table(list), '');
  out.push('## Endpoints added under a documented controller', '');
  out.push(
    'New since the documented snapshot. Document them through the new-API flow (CLAUDE.md) — the drift check never adds endpoints.',
    '',
  );
  if (!added.length) out.push('None.', '');
  else
    out.push(
      '| Method | Path | Controller#action | Evidence |',
      '| --- | --- | --- | --- |',
      ...added.map((f) => `| ${f.method} | \`${f.path}\` | \`${f.name}\` | ${cell(f.evidence.join('; '))} |`),
      '',
    );
  out.push('## Could not be determined statically', '');
  out.push(
    'For these endpoints the check cannot tell everything from the code alone (params handed on whole, keys built at run time, routes generated by a gem). Their documented params are not marked removed; staging fills in response fields where it recorded 2xx answers.',
    '',
  );
  if (!r.notDetermined.length) out.push('None.', '');
  else
    out.push(
      '| Endpoint | What | Why |',
      '| --- | --- | --- |',
      ...r.notDetermined.map(
        (n) =>
          `| ${n.apiId} · ${n.method} \`${n.path}\` | ${n.what} | ${cell(n.reasons.slice(0, 3).join('<br>') || '—')} |`,
      ),
      '',
    );
  if (r.routeFileDynamic.length)
    out.push(
      '## Route statements read as dynamic',
      '',
      ...r.routeFileDynamic.map(
        (d) => `- \`config/routes.rb:${d.line}\` — \`${cell(d.text.slice(0, 100))}\``,
      ),
      '',
    );
  return out.join('\n');
}

async function writeFormatted(rel: string, text: string) {
  const file = path.join(ROOT, rel);
  const cfg = (await prettier.resolveConfig(file)) ?? {};
  writeFileSync(file, await prettier.format(text, { ...cfg, filepath: file }));
}

async function main() {
  const apply = process.argv.includes('--apply');
  const repo =
    arg('--repo') ?? process.env.AISLE_REPO_DIR ?? path.join(os.homedir(), 'Downloads/PII/aisle_new');
  const headRef = arg('--head') ?? 'origin/develop_new';
  const baseRef = arg('--base') ?? 'ae838f4';
  const runFiles = args('--run').length
    ? args('--run')
    : [path.join(ROOT, 'reports/m2/latest/run-data.json')];
  const today = new Date().toISOString().slice(0, 10);
  if (!existsSync(path.join(repo, '.git')))
    throw new Error(`${repo} is not a git clone of the Aisle app (set AISLE_REPO_DIR).`);
  if (!process.argv.includes('--no-fetch')) {
    const remote = headRef.split('/')[0]!;
    const branch = headRef.split('/').slice(1).join('/');
    try {
      execFileSync('git', ['-C', repo, 'fetch', '--quiet', remote, branch], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
    } catch {
      console.warn(`warning: git fetch ${remote} ${branch} failed — using the local ${headRef}.`);
    }
  }
  const head = snapshot(gitReader(repo, headRef));
  const base = snapshot(gitReader(repo, baseRef));
  const runs = runFiles
    .filter((f) => {
      if (existsSync(f)) return true;
      console.warn(`warning: ${f} not found — no staging facts from it.`);
      return false;
    })
    .map(readRun);
  const docs = docEndpoints(build());
  const result = compare(docs, head, base, runs);
  await writeFormatted(REPORT_MD, reportMarkdown(result, today));
  await writeFormatted(REPORT_JSON, JSON.stringify({ generated: today, ...result }));
  const ok = result.findings.filter(applicable);
  const review = result.findings.filter((f) => f.review);
  console.log(
    `API drift: ${result.checked} endpoints · ${ok.length} evidence-backed changes · ${review.length} need review · ${
      result.findings.filter((f) => f.kind === 'endpoint-added').length
    } new routes listed → ${REPORT_MD}`,
  );
  if (!apply) return;
  const log = loadChanges(ROOT);
  log.about = ABOUT;
  const addedEntries = appendChanges(log, toChanges(result, today));
  // --document-new-routes (user decision 2026-10-29): routes new in the code are documented docs-only, from code.
  if (process.argv.includes('--document-new-routes')) {
    const data = build({ log });
    const documented = data.apis.map((a) => ({
      path: a.path,
      group: a.group,
      controller: head.endpoint(a.method, a.path).route?.controller,
    }));
    const file = loadCodeRoutes(ROOT);
    const before = file.routes.length;
    file.about = ABOUT_CODE_ROUTES;
    file.routes = codeRoutesFrom(result.findings, head, documented, file.routes, today);
    const fresh = file.routes.slice(before);
    addedEntries.push(
      ...appendChanges(
        log,
        fresh.map((r) => ({
          date: today,
          apiId: r.id,
          kind: 'endpoint-added' as const,
          name: '',
          before: null,
          after: null,
          source: 'code' as const,
          evidence: `config/routes.rb:${r.routeLine} @${r.sha}; ${r.controller}#${r.action}`,
        })),
      ),
    );
    for (const r of fresh) log.verified[r.id] = { code: { date: today, ref: r.sha } };
    await writeFormatted(CODE_ROUTES_JSON, JSON.stringify(file));
    await writeFormatted(
      CODE_ROUTES_MD,
      codeRoutesMarkdown(file, (k) => GROUP_INFO[k]?.name ?? ''),
    );
    console.log(
      `API drift: ${fresh.length} code-discovered route(s) documented docs-only → ${CODE_ROUTES_MD}`,
    );
  }
  const codeIds = docs.filter((d) => head.endpoint(d.method, d.path).route).map((d) => d.apiId);
  const stagingIds = new Map<string, string>();
  for (const r of [...runs].sort((a, b) => (a.date < b.date ? -1 : 1)))
    for (const id of r.byEndpoint.keys()) stagingIds.set(id, r.date);
  markVerified(log, result, { code: codeIds, staging: stagingIds }, today);
  await writeFormatted(CHANGES_FILE, JSON.stringify(log));
  console.log(`API drift: appended ${addedEntries.length} change(s) to ${CHANGES_FILE}.`);
  execFileSync('npx', ['tsx', path.join(__dirname, 'export.ts')], { cwd: ROOT, stdio: 'inherit' });
  console.log('Next: `npm run docs:api:publish` updates the API_Guide site.');
}

if (require.main === module)
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
