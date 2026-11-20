/**
 * The M2 PII First Name design, ready to show and to test: cases with their derived status, automation status,
 * M1-style type / suite and Playwright tags. Shared by the workbook (npm run m2fn:docs), the tests (titles, blocking)
 * and the self-tests, so all three always agree.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CATEGORY_TYPE, type CaseType } from '../../m2/scripts/m2-grouping';
import { parseInventory } from '../../m2/scripts/m2-inventory';
import { EDGES, FN_CASES, MATRIX } from './m2fn-firstname-cases.data';
import { VN_CASES, VN_MATRIX_CELLS } from './m2fn-vernac-cases.data';
import { VN_SWEEP } from './m2fn-vernac-sweep';
import { parseM2fnInventory, type M2fnApi } from './m2fn-inventory';
import { OPEN, QUESTIONS, statusFromDeps } from './m2fn-questions';
import { SWEEP } from './m2fn-sweep';
import { RDK_CASES, type M2fnCase, type Status } from './m2fn-test-cases.data';

export const CASES: M2fnCase[] = [...RDK_CASES, ...FN_CASES, ...VN_CASES];
const VN_IDS = new Set(VN_CASES.map((c) => c.id));
/** The sweep cases (one test per row); their apis are not deep coverage. */
export const SWEEP_CASES = new Set(['M2FN-SWP-001', 'M2FN-VSWP-001']);

/** Coverage matrix of every in-scope division: Aisle / Aisle CMS paths, then the vernac paths. */
export const ALL_MATRIX: Record<string, Record<(typeof EDGES)[number], string>> = {
  ...MATRIX,
  ...Object.fromEntries(
    Object.entries(VN_MATRIX_CELLS).map(([p, cells]) => [
      p,
      Object.fromEntries(EDGES.map((e, i) => [e, cells[i]!])),
    ]),
  ),
} as Record<string, Record<(typeof EDGES)[number], string>>;

/** The first-name inventory (read only — never edited here): m2-pii-firstname/docs/firstname-inventory.json. */
export const FN_INVENTORY = 'm2-pii-firstname/docs/firstname-inventory.json';
/** Divisions in scope of the white-box cases (QA lead, 2026-11-09; vernac added 2026-11-11). */
export const SCOPE_DIVISIONS = ['Aisle', 'Aisle CMS', 'Vernac', 'Vernac CMS'];

export interface FnRow {
  id: string;
  division: string;
  path: string;
  method: string;
  route: string;
  handler: string;
  representative?: boolean;
}

export function fnRows(root: string = ROOT): FnRow[] {
  const inv = JSON.parse(readFileSync(path.join(root, FN_INVENTORY), 'utf8')) as {
    items: {
      id: string;
      division: string;
      path: string;
      method: unknown;
      route: string;
      handler: string;
      representative?: boolean;
    }[];
  };
  return inv.items.map((i) => ({
    id: i.id,
    division: i.division,
    path: i.path,
    method:
      i.method === null || i.method === undefined || String(i.method) === 'None' ? '—' : String(i.method),
    route: i.route,
    handler: i.handler,
    ...(i.representative ? { representative: true } : {}),
  }));
}

/** In-scope rows (Aisle, Aisle CMS, Vernac, Vernac CMS). */
export const scopeRows = (root: string = ROOT) =>
  fnRows(root).filter((r) => SCOPE_DIVISIONS.includes(r.division));

export const ROOT = path.resolve(__dirname, '../..');

export type Automation = 'NOT AUTOMATED' | 'AUTOMATED' | 'AUTOMATION BLOCKED';

export type M2fnDesignCase = M2fnCase & {
  status: Status;
  automation: Automation;
  type: CaseType;
  suite: 'Smoke' | 'Regression';
  tags: string[];
};

/** An API a case touches: a suite API (redis-key-apis.md) or a Milestone 2 inventory API it uses as a step. */
export interface ApiRef {
  id: string;
  method: string;
  path: string;
  name: string;
  source: 'm2fn' | 'm2' | 'fn';
}

export interface M2fnDesign {
  apis: M2fnApi[];
  refs: Map<string, ApiRef>;
  cases: M2fnDesignCase[];
}

const SMOKE = new Set([
  'M2FN-RDK-001',
  'M2FN-RDK-002',
  'M2FN-RDK-006',
  'M2FN-PRF-001',
  'M2FN-OWN-001',
  'M2FN-WRT-001',
  'M2FN-CMS-001',
  'M2FN-SRC-001',
]);

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const automatable = (c: { mode: string }) => c.mode !== 'Manual';

export function buildM2fnDesign(root: string = ROOT): M2fnDesign {
  const apis = parseM2fnInventory(root);
  const refs = new Map<string, ApiRef>();
  for (const a of apis)
    refs.set(a.id, { id: a.id, method: a.method, path: a.path, name: a.purpose, source: 'm2fn' });
  const m2 = new Map(parseInventory(root).map((a) => [a.id, a]));
  const fn = new Map(fnRows(root).map((r) => [r.id, r]));
  const cited = [...CASES.flatMap((c) => c.apis), ...QUESTIONS.flatMap((q) => q.apis)];
  for (const id of cited) {
    if (refs.has(id)) continue;
    const a = m2.get(id);
    if (a) refs.set(id, { id, method: a.method, path: a.path, name: a.path, source: 'm2' });
    const r = fn.get(id);
    if (r) refs.set(id, { id, method: r.method, path: r.route, name: r.handler, source: 'fn' });
  }
  const cases = CASES.map((c): M2fnDesignCase => {
    const accessOpen = c.deps.some(
      (d) => OPEN.has(d) && QUESTIONS.find((q) => q.id === d)?.kind === 'Access / environment',
    );
    const status: Status = c.blockedReason
      ? 'BLOCKED'
      : c.status === 'NOT RUN' && !accessOpen
        ? 'NOT RUN'
        : statusFromDeps(c.deps);
    const automation: Automation = !automatable(c)
      ? 'NOT AUTOMATED'
      : status === 'NOT RUN'
        ? 'AUTOMATED'
        : 'AUTOMATION BLOCKED';
    const type = CATEGORY_TYPE[c.category];
    const suite = SMOKE.has(c.id) ? 'Smoke' : 'Regression';
    const area = c.id.split('-')[1]!.toLowerCase();
    const tags = [
      '@m2fn',
      area === 'rdk' ? '@redis' : `@${area}`,
      ...(c.apis.some((a) => a === 'API-213' || a === 'API-214') ? ['@redis'] : []),
      `@${type.toLowerCase()}`,
      `@${slug(c.category)}`,
      suite === 'Smoke' ? '@smoke' : '@regression',
      ...c.fields.map((f) => `@${f.toLowerCase()}`),
    ];
    if (VN_IDS.has(c.id)) tags.push('@vernac');
    if (type === 'Security') tags.push('@security');
    if (c.dbCheck || type === 'Database') tags.push('@db');
    return { ...c, status, automation, type, suite, tags: [...new Set(tags)] };
  });
  return { apis, refs, cases };
}

/** Design problems (unknown API / question, repeated ID, a suite API without a case); empty = consistent. */
export function designProblems(d: M2fnDesign): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  const qids = new Set(QUESTIONS.map((q) => q.id));
  for (const c of d.cases) {
    if (ids.has(c.id)) out.push(`${c.id}: repeated ID`);
    ids.add(c.id);
    if (!/^M2FN-[A-Z]+-\d{3}$/.test(c.id)) out.push(`${c.id}: ID is not M2FN-<AREA>-NNN`);
    for (const a of c.apis) if (!d.refs.has(a)) out.push(`${c.id}: unknown API ${a}`);
    for (const q of c.deps) if (!qids.has(q)) out.push(`${c.id}: unknown question ${q}`);
    if (/'/.test(c.name)) out.push(`${c.id}: use a typographic apostrophe (’) in the name`);
    if (c.steps.length < 1 || c.steps.length > 5) out.push(`${c.id}: 1–5 steps expected`);
  }
  for (const a of d.apis)
    if (!d.cases.some((c) => c.apis.includes(a.id))) out.push(`${a.id}: no case covers this API`);
  // Every in-scope inventory row: a deep case and / or exactly one sweep entry (with a reason when it cannot be
  // called). A row a deep case cites may also be swept (the sweep is a quick check over it).
  const rows = scopeRows();
  const deep = new Set(
    [...FN_CASES, ...VN_CASES].filter((c) => !SWEEP_CASES.has(c.id)).flatMap((c) => c.apis),
  );
  const swept = new Map<string, number>();
  for (const s of [...SWEEP, ...VN_SWEEP]) swept.set(s.row, (swept.get(s.row) ?? 0) + 1);
  for (const r of rows) {
    const n = swept.get(r.id) ?? 0;
    if (!deep.has(r.id) && n === 0) out.push(`${r.id}: in-scope row with no deep case and no sweep entry`);
    if (n > 1) out.push(`${r.id}: swept more than once`);
  }
  const rowIds = new Set(rows.map((r) => r.id));
  for (const s of VN_SWEEP) {
    if (!rowIds.has(s.row)) out.push(`${s.row}: sweep entry is not an in-scope inventory row`);
    if (s.cls === 'cannot' && !s.reason) out.push(`${s.row}: cannot-call row without a reason`);
    if (s.cls !== 'cannot' && !s.route) out.push(`${s.row}: callable row without a route`);
    if (s.cls === 'later' && !s.relation) out.push(`${s.row}: later row without the relation it needs`);
  }
  for (const s of SWEEP) {
    if (!rowIds.has(s.row)) out.push(`${s.row}: sweep entry is not an in-scope inventory row`);
    if (s.cls === 'cannot' && !s.reason) out.push(`${s.row}: cannot-call row without a reason`);
    if (s.cls !== 'cannot' && !s.api && !s.route) out.push(`${s.row}: callable row without an API`);
    if (s.api && !/^API-\d{3}$/.test(s.api)) out.push(`${s.row}: bad API id ${s.api}`);
  }
  // Coverage matrix: no empty cell; every case id it names exists.
  const ids2 = new Set(d.cases.map((c) => c.id));
  for (const [p, cells] of Object.entries(ALL_MATRIX))
    for (const e of EDGES) {
      const v = cells[e]?.trim();
      if (!v) out.push(`matrix ${p} × ${e}: empty cell`);
      for (const m of (v ?? '').matchAll(/\b([A-Z]{3,4}-\d{3})\b/g))
        if (!m[1]!.startsWith('API') && !ids2.has(`M2FN-${m[1]}`))
          out.push(`matrix ${p} × ${e}: unknown case ${m[1]}`);
    }
  for (const q of QUESTIONS)
    if (q.apis.some((a) => !d.refs.has(a))) out.push(`${q.id}: cites an API that is not in the suite`);
  return out;
}

let cached: M2fnDesign | undefined;
export function design(): M2fnDesign {
  cached ??= buildM2fnDesign(ROOT);
  return cached;
}

export function caseById(id: string): M2fnDesignCase {
  const c = design().cases.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown M2FN case ${id} — it is not in m2-pii-firstname/scripts`);
  return c;
}

export const titleOf = (c: { id: string; name: string }) => `${c.id} ${c.name}`;

/** Open questions a case still cites (empty = nothing open). */
export function openDeps(c: { deps: string[] }): { id: string; topic: string }[] {
  return c.deps
    .filter((d) => OPEN.has(d))
    .map((d) => ({ id: d, topic: QUESTIONS.find((q) => q.id === d)?.topic ?? '' }));
}
