/**
 * Builds docs/test-cases.xlsx — every test case organized by endpoint: a Summary tab, an "All test cases" tab
 * with a heading per endpoint, one tab per endpoint, and the framework self-tests.
 *
 *   npm run docs:testcases
 *
 * The list comes from the real suite (`playwright test --list`), so the sheet can never drift from the code.
 * "Last result" is read from the latest recorded run (reports/latest/run-data.json) when one exists; tests that were
 * not part of that run say "Not run". Nothing is guessed.
 */
import ExcelJS from 'exceljs';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  areaForId,
  CROSS_ENDPOINT,
  ENDPOINT_GROUP_ORDER,
  endpointsForId,
  primaryEndpoint,
} from '../reporting/core/catalog';
import { plainEndpoint } from '../reporting/dashboard/src/plain';
import { ENDPOINTS } from '../src/clients/endpoints';

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/test-cases.xlsx');

interface ListedTest {
  id: string;
  title: string;
  file: string;
  line: number;
  project: string;
  tags: string[];
}

// ---- 1. The real test list ------------------------------------------------------------------------
function listTests(): ListedTest[] {
  const json = JSON.parse(
    execSync('npx playwright test --list --reporter=json', {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }),
  );
  interface Spec {
    title: string;
    file: string;
    line: number;
    tags: string[];
    tests: { projectName: string }[];
  }
  interface Suite {
    specs?: Spec[];
    suites?: Suite[];
  }
  const out: ListedTest[] = [];
  const walk = (s: Suite) => {
    for (const sp of s.specs ?? [])
      for (const t of sp.tests)
        out.push({
          id: sp.title.split(' ')[0] ?? sp.title,
          title: sp.title.replace(/^\S+\s/, ''),
          file: sp.file,
          line: sp.line,
          project: t.projectName,
          tags: sp.tags.map((x) => (x.startsWith('@') ? x : `@${x}`)),
        });
    for (const c of s.suites ?? []) walk(c);
  };
  for (const s of json.suites as Suite[]) walk(s);
  return out;
}

// ---- 2. Facts read from the source: which open question (if any) a test waits on --------------------
function openQuestions(tests: ListedTest[]): Map<string, string> {
  const found = new Map<string, string>();
  const files = new Set(tests.map((t) => t.file));
  for (const f of files) {
    const src = readFileSync(path.join(ROOT, 'tests', f), 'utf8');
    // Split the file at each test(…) so a blockedBy() belongs to the test it is written in.
    const chunks = src.split(/\n\s*test\(/);
    for (const chunk of chunks) {
      const id = /^\s*[`']?((?:PII|POC|UT)-[A-Z]*-?\d+[a-z]?)/.exec(chunk)?.[1];
      const q = /blockedBy\(\s*'(Q-\d+)'/.exec(chunk)?.[1];
      if (id && q) found.set(id, q);
    }
  }
  return found;
}

// ---- 3. Last recorded result per test (never invented) ------------------------------------------------
function lastResults(): { results: Map<string, string>; label: string } {
  const file = path.join(ROOT, 'reports/latest/run-data.json');
  const results = new Map<string, string>();
  if (!existsSync(file)) return { results, label: 'no run recorded yet' };
  const run = JSON.parse(readFileSync(file, 'utf8')) as {
    run?: { startedAt?: string; environment?: string };
    tests?: { id: string; title: string; status: string }[];
  };
  const word: Record<string, string> = {
    PASS: 'Passed',
    FAIL: 'Failed',
    BLOCKED: 'Waiting',
    FIXME: 'Waiting',
    SKIPPED: 'Skipped',
    UNKNOWN: 'Not run',
  };
  for (const t of run.tests ?? [])
    results.set(`${t.id} ${t.title.replace(/^\S+\s/, '')}`, word[t.status] ?? t.status);
  const when = run.run?.startedAt
    ? new Date(run.run.startedAt).toISOString().slice(0, 16).replace('T', ' ')
    : '';
  return { results, label: `${run.run?.environment ?? ''} ${when} UTC`.trim() };
}

// ---- 4. Grouping and simple, rule-based columns -----------------------------------------------------
/** Same rule as the report: the endpoint a test mainly tests, or "Across endpoints". */
const endpointOfId = (id: string): string => primaryEndpoint(endpointsForId(id, areaForId(id)));

function endpointLabel(key: string) {
  const p = plainEndpoint(key);
  if (key === CROSS_ENDPOINT) return { name: p.name, method: '—', path: 'several endpoints', means: p.means };
  const e = ENDPOINTS[key as keyof typeof ENDPOINTS];
  return { name: p.name, method: e.method, path: e.path, means: p.means };
}

/** Negative = the title says the request is refused or fails; undocumented behaviour = to be decided. */
const typeOf = (title: string): 'Positive' | 'Negative' | 'To be decided' =>
  /not documented yet/i.test(title)
    ? 'To be decided'
    : /\b(rejected|refused|cannot|never|fails|not found|40[0-9]|41[0-9]|422|503|invalid)\b/i.test(title)
      ? 'Negative'
      : 'Positive';

const expectedStatus = (title: string): string =>
  [...new Set(title.match(/\b(200|201|400|401|403|404|413|415|422|503)\b/g) ?? [])].join(' / ');

// ---- 5. Workbook --------------------------------------------------------------------------------------
const COLOR = {
  ink: 'FF1F2937',
  head: 'FF1E3A8A',
  group: 'FFE0E7FF',
  zebra: 'FFF8FAFC',
  border: 'FFE2E8F0',
  pass: 'FF15803D',
  fail: 'FFB91C1C',
  wait: 'FFB45309',
  muted: 'FF64748B',
  link: 'FF1D4ED8',
};
const thin = { style: 'thin' as const, color: { argb: COLOR.border } };
const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });

function styleHeader(row: ExcelJS.Row) {
  row.height = 22;
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = fill(COLOR.head);
    c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  });
}

const resultColor = (v: string): string =>
  v === 'Passed' ? COLOR.pass : v === 'Failed' ? COLOR.fail : v === 'Waiting' ? COLOR.wait : COLOR.muted;

/** Excel sheet names: max 31 chars, no []:*?/\ */
const sheetName = (s: string) => s.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31);

const CASE_COLUMNS: Partial<ExcelJS.Column>[] = [
  { header: 'Test ID', key: 'id', width: 14 },
  { header: 'Test case', key: 'title', width: 84 },
  { header: 'Type', key: 'type', width: 13 },
  { header: 'Expected status', key: 'status', width: 15 },
  { header: 'Tags', key: 'tags', width: 22 },
  { header: 'Open question', key: 'q', width: 13 },
  { header: 'Last result', key: 'result', width: 12 },
  { header: 'Source', key: 'source', width: 42 },
];
const LAST_COL = CASE_COLUMNS.length;

async function main() {
  const all = listTests();
  const service = all.filter((t) => t.project === 'api');
  const unit = all.filter((t) => t.project === 'unit');
  const questions = openQuestions(all);
  const { results, label } = lastResults();
  const result = (t: ListedTest) => results.get(`${t.id} ${t.title}`) ?? 'Not run';

  const groups = (ENDPOINT_GROUP_ORDER as readonly string[])
    .map((key) => ({
      key,
      label: endpointLabel(key),
      tests: service
        .filter((t) => endpointOfId(t.id) === key)
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
    }))
    .filter((g) => g.tests.length > 0);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PII API automation';
  wb.created = new Date();

  const addCaseRow = (ws: ExcelJS.Worksheet, t: ListedTest, zebra: boolean) => {
    const res = result(t);
    const r = ws.addRow({
      id: t.id,
      title: t.title,
      type: typeOf(t.title),
      status: expectedStatus(t.title),
      tags: t.tags.join(' '),
      q: questions.get(t.id) ?? '',
      result: res,
      source: `tests/${t.file}:${t.line}`,
    });
    r.alignment = { vertical: 'top', wrapText: true };
    r.getCell('id').font = { name: 'Menlo', size: 10 };
    r.getCell('result').font = { bold: true, color: { argb: resultColor(res) } };
    r.getCell('source').font = { color: { argb: COLOR.muted }, size: 9 };
    r.eachCell({ includeEmpty: true }, (c, col) => {
      if (col > LAST_COL) return;
      c.border = { bottom: thin };
      if (zebra) c.fill = fill(COLOR.zebra);
    });
  };

  const addEndpointHeading = (ws: ExcelJS.Worksheet, g: (typeof groups)[number]) => {
    const e = g.label;
    const row = ws.addRow([
      `${e.name}  —  ${e.method === '—' ? '' : `${e.method} `}${e.path}  ·  ${g.tests.length} test${g.tests.length === 1 ? '' : 's'}`,
    ]);
    ws.mergeCells(row.number, 1, row.number, LAST_COL);
    row.height = 24;
    const c = row.getCell(1);
    c.font = { bold: true, size: 12, color: { argb: COLOR.head } };
    c.fill = fill(COLOR.group);
    c.alignment = { vertical: 'middle' };
  };

  // ---- Summary: one row per endpoint, each linking to its tab
  const sum = wb.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 4 }] });
  sum.columns = [
    { width: 5 },
    { width: 28 },
    { width: 9 },
    { width: 38 },
    { width: 9 },
    { width: 10 },
    { width: 10 },
    { width: 9 },
    { width: 9 },
    { width: 9 },
  ];
  sum.mergeCells('A1:J1');
  sum.getCell('A1').value = 'PII Service — API test cases by endpoint';
  sum.getCell('A1').font = { bold: true, size: 16, color: { argb: COLOR.ink } };
  sum.mergeCells('A2:J2');
  sum.getCell('A2').value =
    `Generated from the code with "npm run docs:testcases" on ${new Date().toISOString().slice(0, 10)}. ` +
    `Last result from: ${label}. Click an endpoint to open its tab.`;
  sum.getCell('A2').font = { italic: true, color: { argb: COLOR.muted } };
  const sh = sum.getRow(4);
  sh.values = [
    '#',
    'Endpoint',
    'Method',
    'Path',
    'Tests',
    'Positive',
    'Negative',
    'Passed',
    'Failed',
    'Not run',
  ];
  styleHeader(sh);
  const count = (tests: ListedTest[], pick: (t: ListedTest) => boolean) => tests.filter(pick).length;
  groups.forEach((g, i) => {
    const r = sum.addRow([
      i + 1,
      { text: g.label.name, hyperlink: `#'${sheetName(g.label.name)}'!A1` },
      g.label.method,
      g.label.path,
      g.tests.length,
      count(g.tests, (t) => typeOf(t.title) === 'Positive'),
      count(g.tests, (t) => typeOf(t.title) === 'Negative'),
      count(g.tests, (t) => result(t) === 'Passed'),
      count(g.tests, (t) => result(t) === 'Failed'),
      count(g.tests, (t) => !['Passed', 'Failed'].includes(result(t))),
    ]);
    r.getCell(2).font = { color: { argb: COLOR.link }, underline: true };
    r.eachCell((c) => {
      c.border = { bottom: thin };
      if (i % 2) c.fill = fill(COLOR.zebra);
    });
  });
  // Totals: formulas with their values stored, so every viewer (Excel, Numbers, Quick Look) shows them.
  const last = 4 + groups.length;
  const total = (col: string, pick: (t: ListedTest) => boolean) => ({
    formula: `SUM(${col}5:${col}${last})`,
    result: service.filter(pick).length,
  });
  const tot = sum.addRow([
    '',
    'Total',
    '',
    '',
    total('E', () => true),
    total('F', (t) => typeOf(t.title) === 'Positive'),
    total('G', (t) => typeOf(t.title) === 'Negative'),
    total('H', (t) => result(t) === 'Passed'),
    total('I', (t) => result(t) === 'Failed'),
    total('J', (t) => !['Passed', 'Failed'].includes(result(t))),
  ]);
  tot.font = { bold: true };
  tot.eachCell((c) => (c.border = { top: { style: 'medium', color: { argb: COLOR.head } } }));
  sum.addRow([]);
  sum.addRow(['', `Framework self-tests (no service needed): ${unit.length} — see the "Self-tests" tab.`]);

  // ---- All test cases: a heading per endpoint, its test cases underneath
  const allWs = wb.addWorksheet('All test cases', { views: [{ state: 'frozen', ySplit: 1 }] });
  allWs.columns = CASE_COLUMNS;
  styleHeader(allWs.getRow(1));
  for (const g of groups) {
    addEndpointHeading(allWs, g);
    g.tests.forEach((t, i) => addCaseRow(allWs, t, i % 2 === 1));
  }

  // ---- One tab per endpoint
  for (const g of groups) {
    const ws = wb.addWorksheet(sheetName(g.label.name), { views: [{ state: 'frozen', ySplit: 3 }] });
    ws.columns = CASE_COLUMNS.map((c) => ({ key: c.key, width: c.width }));
    const title = ws.addRow([
      `${g.label.name}  —  ${g.label.method === '—' ? '' : `${g.label.method} `}${g.label.path}`,
    ]);
    ws.mergeCells(1, 1, 1, LAST_COL);
    title.getCell(1).font = { bold: true, size: 14, color: { argb: COLOR.head } };
    const sub = ws.addRow([
      `${g.label.means}. ${g.tests.length} test case${g.tests.length === 1 ? '' : 's'}.`,
    ]);
    ws.mergeCells(2, 1, 2, LAST_COL);
    sub.getCell(1).font = { italic: true, color: { argb: COLOR.muted } };
    const header = ws.addRow(CASE_COLUMNS.map((c) => c.header as string));
    styleHeader(header);
    g.tests.forEach((t, i) => addCaseRow(ws, t, i % 2 === 1));
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: LAST_COL } };
    const back = ws.addRow([]);
    back.getCell(1).value = { text: '← Back to Summary', hyperlink: "#'Summary'!A1" };
    back.getCell(1).font = { color: { argb: COLOR.link }, underline: true };
  }

  // ---- Framework self-tests
  const us = wb.addWorksheet('Self-tests', { views: [{ state: 'frozen', ySplit: 1 }] });
  us.columns = [
    { header: 'Component', key: 'component', width: 26 },
    { header: 'Test ID', key: 'id', width: 14 },
    { header: 'Test case', key: 'title', width: 90 },
    { header: 'Last result', key: 'result', width: 12 },
    { header: 'Source', key: 'source', width: 40 },
  ];
  styleHeader(us.getRow(1));
  const COMPONENT: Record<string, string> = {
    SIG: 'Request signing',
    CLI: 'API client',
    CFG: 'Settings (.env)',
    AST: 'Assertions',
    RED: 'Secret-hiding logger',
    DAT: 'Test data',
    DB: 'Database access',
    END: 'Endpoint list',
    RTY: 'Retries',
    CLN: 'Clean-up',
  };
  [...unit]
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
    .forEach((t, i) => {
      const res = result(t);
      const r = us.addRow({
        component: COMPONENT[t.id.split('-')[1] ?? ''] ?? 'Framework',
        id: t.id,
        title: t.title,
        result: res,
        source: `tests/${t.file}:${t.line}`,
      });
      r.alignment = { vertical: 'top', wrapText: true };
      r.getCell('id').font = { name: 'Menlo', size: 10 };
      r.getCell('result').font = { bold: true, color: { argb: resultColor(res) } };
      r.getCell('source').font = { color: { argb: COLOR.muted }, size: 9 };
      r.eachCell((c) => {
        c.border = { bottom: thin };
        if (i % 2) c.fill = fill(COLOR.zebra);
      });
    });
  us.autoFilter = { from: 'A1', to: 'E1' };

  await wb.xlsx.writeFile(OUT);
  console.log(
    `Written ${path.relative(ROOT, OUT)} — ${service.length} API test cases under ${groups.length} endpoints ` +
      `(one tab each), ${unit.length} self-tests. Last result from: ${label}.`,
  );
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
