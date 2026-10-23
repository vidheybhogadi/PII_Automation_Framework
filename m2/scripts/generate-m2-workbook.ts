/**
 * Builds m2/docs/m2-test-cases.xlsx (Dev-review workbook) and m2/docs/m2-test-design-summary.md from:
 *   - m2/docs/aisle-pii-affected-apis.md   (Dev inventory — parsed, never edited)
 *   - m2/scripts/m2-test-cases.data.ts     (QA test design)
 *   - m2/scripts/m2-questions.ts           (M2Q-xx questions for Dev)
 *   - m2/scripts/m2-baseline.ts            (per-API standard checks, generated for every applicable API)
 *
 *   npm run m2:docs
 *
 * The build fails if a case cites an unknown API or question, an ID repeats, or an inventory API has no case
 * (other than the M1-covered facade routes). The "Dev Decision" / "Dev Review Comments" / "Dev Response" columns
 * are carried over from the previous file so Dev's review survives regeneration.
 */
import ExcelJS from 'exceljs';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  actionOf,
  authLabel,
  FIELD_LABEL,
  groupOf,
  GROUPS,
  OBSERVED,
  PII_FIELDS,
  operationOf,
  scopeOf,
  SOURCE_REF,
  type InventoryApi,
  type PiiField,
} from './m2-inventory';
import { OPEN, QUESTIONS } from './m2-questions';
import { buildDesign, type AnyCase } from './m2-all-cases';
import { CHECKS, type Baseline, type Cell } from './m2-baseline';
import { CATEGORY_ORDER, CATEGORY_TYPE, TYPE_ORDER } from './m2-grouping';
import { CASES as SCENARIOS, type M2Case, type Status } from './m2-test-cases.data';
/** Scenario cases + generated per-API baseline cases; set in main(). */
let CASES: AnyCase[] = [];
let BASE: Baseline = { cases: [], matrix: new Map() };

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'm2/docs/m2-test-cases.xlsx');
const SUMMARY_MD = path.join(ROOT, 'm2/docs/m2-test-design-summary.md');

// ---- Palette (same as m1/scripts/generate-test-cases-xlsx.ts) ------------------------------------------------
const C = {
  headerBg: 'FF1E293B',
  band: 'FF334155',
  zebra: 'FFF8FAFC',
  border: 'FFE2E8F0',
  white: 'FFFFFFFF',
  muted: 'FF64748B',
  slate: 'FF475569',
  ink: 'FF0F172A',
  link: 'FF1D4ED8',
  accentBg: 'FFEFF6FF',
};
const STATUS_STYLE: Record<Status, { bg: string; ink: string }> = {
  PASS: { bg: 'FFC6EFCE', ink: 'FF006100' },
  FAIL: { bg: 'FFFFC7CE', ink: 'FF9C0006' },
  BLOCKED: { bg: 'FFFFEB9C', ink: 'FF9C5700' },
  'NEED DEV CLARIFICATION': { bg: 'FFEBD5F5', ink: 'FF6B1D5E' },
  'NOT APPLICABLE': { bg: 'FFD5EEEC', ink: 'FF285E61' },
  'NOT RUN': { bg: 'FFE5E7EB', ink: 'FF4B5563' },
};
const PRIORITY_INK: Record<string, string> = {
  Critical: 'FFB91C1C',
  High: 'FFC2410C',
  Medium: 'FF1D4ED8',
  Low: 'FF6B7280',
};
const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin' as const, color: { argb: C.border } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const FONT = 'Calibri';

const DEV_DECISIONS = [
  'Approved',
  'Approved with changes',
  'Change expected result',
  'Not applicable',
  'Needs discussion',
];
const STATUSES: Status[] = ['PASS', 'FAIL', 'BLOCKED', 'NEED DEV CLARIFICATION', 'NOT APPLICABLE', 'NOT RUN'];
const AUTOMATION = ['NOT AUTOMATED', 'AUTOMATION IN PROGRESS', 'AUTOMATED', 'AUTOMATION BLOCKED'];
const Q_STATUSES = ['Open', 'Answered', 'Deferred', 'Closed'];

// ---- Validation -------------------------------------------------------------------------------------------
function validate(inventory: InventoryApi[]) {
  const errors: string[] = [];
  const apiIds = new Set(inventory.map((a) => a.id));
  const qIds = new Set(QUESTIONS.map((q) => q.id));
  const seen = new Set<string>();
  for (const c of CASES) {
    if (seen.has(c.id)) errors.push(`duplicate case id ${c.id}`);
    seen.add(c.id);
    for (const a of c.apis) if (!apiIds.has(a)) errors.push(`${c.id} cites unknown ${a}`);
    for (const d of c.deps) if (!qIds.has(d)) errors.push(`${c.id} cites unknown ${d}`);
    for (const ref of `${c.expected} ${c.pre} ${c.db}`.match(/M2Q-\d+/g) ?? [])
      if (!c.deps.includes(ref)) errors.push(`${c.id} mentions ${ref} but does not list it in deps`);
    for (const ref of c.db.match(/M2-DB-\d+/g) ?? [])
      if (!CASES.some((x) => x.id === ref)) errors.push(`${c.id} points to missing ${ref}`);
  }
  for (const [apiId, row] of BASE.matrix)
    for (const [check, cell] of Object.entries(row))
      if (cell.kind === 'covered')
        for (const id of cell.by.split(', ')) {
          const sc = SCENARIOS.find((x) => x.id === id);
          if (!sc) errors.push(`${apiId} ${check} points to missing scenario ${id}`);
          else if (!sc.apis.includes(apiId))
            errors.push(`${apiId} ${check} → ${id}, but ${id} does not list ${apiId}`);
        }
  for (const q of QUESTIONS)
    for (const a of q.apis) if (!apiIds.has(a)) errors.push(`${q.id} cites unknown ${a}`);
  for (const api of inventory)
    if (groupOf(api.id).key !== 'M1' && !CASES.some((c) => c.apis.includes(api.id)))
      errors.push(`${api.id} ${api.method} ${api.path} has no test case`);
  if (errors.length) throw new Error(`M2 test design is inconsistent:\n  ${errors.join('\n  ')}`);
}

// ---- Derived data -----------------------------------------------------------------------------------------
const casesFor = (apiId: string) => CASES.filter((c) => c.apis.includes(apiId));
const casesForQuestion = (qId: string) => CASES.filter((c) => c.deps.includes(qId));
/** "M2-PIIR-001, M2-FNAME-004 + 14 per-API checks" — keeps cells readable with ~2,500 cases. */
function caseSummary(cases: AnyCase[]) {
  const sc = cases.filter((c) => !c.check).map((c) => c.id);
  const per = cases.length - sc.length;
  return (
    [sc.join(', '), per ? `${per} per-API check${per === 1 ? '' : 's'}` : ''].filter(Boolean).join(' + ') ||
    '—'
  );
}
const count = <T>(items: T[], pred: (t: T) => boolean) => items.filter(pred).length;
const steps = (s: string[]) => s.map((x, i) => `${i + 1}. ${x}`).join('\n');
const fieldsText = (f: PiiField[]) => f.map((x) => FIELD_LABEL[x]).join(', ');

function primaryEndpoint(c: M2Case, inv: Map<string, InventoryApi>) {
  const apis = c.apis.map((a) => inv.get(a)!);
  const first = apis[0]!;
  const more = apis.length > 1 ? `\n+ ${apis.length - 1} more: ${c.apis.slice(1).join(', ')}` : '';
  return {
    apiName: `${first.id} ${actionOf(first)}`,
    method: [...new Set(apis.map((a) => a.method))].join(' / '),
    endpoint: `${first.path}${more}`,
  };
}

// ---- Carry over Dev review columns ------------------------------------------------------------------------
async function previousReview(): Promise<Map<string, Record<string, string>>> {
  const keep = new Map<string, Record<string, string>>();
  if (!existsSync(OUT)) return keep;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(OUT);
  const read = (sheet: string, idHeader: string, cols: string[]) => {
    const ws = wb.getWorksheet(sheet);
    if (!ws) return;
    let headerRow = 0;
    ws.eachRow((row, n) => {
      if (!headerRow && row.values && (row.values as unknown[]).includes(idHeader)) headerRow = n;
    });
    if (!headerRow) return;
    const header = (ws.getRow(headerRow).values as unknown[]).map((v) => String(v ?? ''));
    ws.eachRow((row, n) => {
      if (n <= headerRow) return;
      const id = String(row.getCell(header.indexOf(idHeader)).value ?? '');
      if (!id) return;
      const rec: Record<string, string> = {};
      for (const col of cols) {
        const v = row.getCell(header.indexOf(col)).value;
        if (v !== null && v !== undefined && String(v).trim() && String(v) !== 'Open') rec[col] = String(v);
      }
      if (Object.keys(rec).length) keep.set(id, { ...keep.get(id), ...rec });
    });
  };
  wb.eachSheet((ws) => read(ws.name, 'Test Case ID', ['Dev Decision', 'Dev Review Comments']));
  read('Dev Review - Questions', 'Question ID', ['Dev Response', 'Status']);
  return keep;
}

// ---- Sheet helpers ----------------------------------------------------------------------------------------
interface Col {
  header: string;
  width: number;
  mono?: boolean;
}

function titleBlock(ws: ExcelJS.Worksheet, title: string, subtitle: string, span: number) {
  ws.mergeCells(1, 1, 1, span);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { name: FONT, bold: true, size: 15, color: { argb: C.white } };
  t.fill = fill(C.headerBg);
  t.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 28;
  ws.mergeCells(2, 1, 2, span);
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { name: FONT, italic: true, size: 10, color: { argb: C.slate } };
  s.alignment = { vertical: 'middle', indent: 1, wrapText: true };
  ws.getRow(2).height = 30;
}

function table(ws: ExcelJS.Worksheet, startRow: number, cols: Col[], rows: (string | number)[][]) {
  ws.columns = cols.map((c) => ({ width: c.width }));
  const hr = ws.getRow(startRow);
  cols.forEach((c, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: FONT, bold: true, color: { argb: C.white } };
    cell.fill = fill(C.band);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = box;
  });
  hr.height = 32;
  rows.forEach((r, ri) => {
    const row = ws.getRow(startRow + 1 + ri);
    r.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border = box;
      cell.font = cols[ci]!.mono
        ? { name: 'Menlo', size: 9, color: { argb: C.ink } }
        : { name: FONT, size: 10, color: { argb: C.ink } };
      if (ri % 2 === 1) cell.fill = fill(C.zebra);
    });
  });
  ws.autoFilter = {
    from: { row: startRow, column: 1 },
    to: { row: startRow + rows.length, column: cols.length },
  };
  ws.views = [{ state: 'frozen', ySplit: startRow, xSplit: 2 }];
  return startRow + rows.length;
}

const colIndex = (cols: Col[], header: string) => cols.findIndex((c) => c.header === header) + 1;

function listValidation(ws: ExcelJS.Worksheet, col: number, from: number, to: number, values: string[]) {
  for (let r = from; r <= to; r++)
    ws.getCell(r, col).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${values.join(',')}"`],
      showErrorMessage: true,
    };
}

function statusFormatting(ws: ExcelJS.Worksheet, col: number, from: number, to: number) {
  const letter = ws.getColumn(col).letter;
  ws.addConditionalFormatting({
    ref: `${letter}${from}:${letter}${to}`,
    rules: STATUSES.map((s, i) => ({
      type: 'containsText',
      operator: 'containsText',
      text: s,
      priority: i + 1,
      style: { fill: fill(STATUS_STYLE[s].bg), font: { bold: true, color: { argb: STATUS_STYLE[s].ink } } },
    })),
  });
}

function priorityFormatting(ws: ExcelJS.Worksheet, col: number, from: number, to: number) {
  for (let r = from; r <= to; r++) {
    const cell = ws.getCell(r, col);
    cell.font = { name: FONT, bold: true, color: { argb: PRIORITY_INK[String(cell.value)] ?? C.muted } };
    cell.alignment = { vertical: 'top', horizontal: 'center' };
  }
}

// ---- Sheets -----------------------------------------------------------------------------------------------
function overviewSheet(wb: ExcelJS.Workbook, inventory: InventoryApi[]) {
  const ws = wb.addWorksheet('Overview', { properties: { tabColor: { argb: C.headerBg } } });
  ws.columns = [
    { width: 50 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 40 },
  ];
  titleBlock(
    ws,
    'Aisle PII Integration — Milestone 2 Test Design (for Dev review)',
    `Source: ${SOURCE_REF} + staging observations (testa2, 2026-10-19) + executed First Name UI smoke (FN-SAN-001..056). ` +
      `Generated ${new Date().toISOString().slice(0, 10)} by npm run m2:docs. No test case has been executed yet.`,
    7,
  );
  let r = 4;
  const section = (title: string) => {
    ws.mergeCells(r, 1, r, 7);
    const c = ws.getCell(r, 1);
    c.value = title;
    c.font = { name: FONT, bold: true, size: 12, color: { argb: C.white } };
    c.fill = fill(C.band);
    c.alignment = { indent: 1, vertical: 'middle' };
    ws.getRow(r).height = 22;
    r++;
  };
  const kv = (k: string, v: string | number, note = '') => {
    ws.getCell(r, 1).value = k;
    ws.getCell(r, 1).font = { name: FONT, bold: true, color: { argb: C.slate } };
    ws.mergeCells(r, 2, r, 7);
    ws.getCell(r, 2).value = note ? `${v}  —  ${note}` : v;
    ws.getCell(r, 2).alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
    ws.getCell(r, 2).font = { name: FONT, color: { argb: C.ink } };
    const len = String(ws.getCell(r, 2).value).length;
    ws.getRow(r).height = Math.max(16, Math.ceil(len / 110) * 15);
    r++;
  };

  section('Scope');
  kv(
    'Milestone 1 (done at API level)',
    'PII service through the QA facade /V1/api/v1/pii-test/* — 109 cases, last run 2026-10-07: 88 Pass, 21 Blocked (mostly DB). DB verification still blocked (BQ-04/BQ-30: no tables visible).',
  );
  kv(
    'Milestone 2 (this workbook)',
    `The real Aisle app / web / CMS / payment APIs that read or write first name, email and phone via the PII integration: ${inventory.length} method/path entries from Dev’s inventory, grouped into ${GROUPS.length} test-strategy groups.`,
  );
  kv(
    'Two layers',
    `(1) ${SCENARIOS.length} scenario cases — lifecycle, documented gaps, cross-field / cross-API consistency, DB design. (2) ${BASE.cases.length} per-API cases — ${CHECKS.length} standard checks applied to every API where applicable; each non-applicable check is documented with its reason in "Per-API Check Matrix", and checks already covered by a scenario point to it instead of duplicating it.`,
  );
  kv(
    'Not duplicated',
    'The 9 facade proxy routes (API-199..207) are covered by Milestone 1. First Name UI smoke (56 cases) was executed manually — M2 API cases link to it in "Related".',
  );
  r++;

  section('Coverage counts');
  const types = TYPE_ORDER;
  kv('Total test cases', CASES.length);
  kv('  Scenario cases', SCENARIOS.length);
  kv('  Per-API cases', BASE.cases.length);
  for (const t of types)
    kv(
      `  ${t}`,
      count(CASES, (c) => c.type === t),
    );
  r++;
  section('By category (Type → Category)');
  for (const cat of CATEGORY_ORDER)
    kv(
      `${CATEGORY_TYPE[cat]} → ${cat}`,
      count(CASES, (c) => c.category === cat),
    );
  r++;
  section('By suite');
  kv(
    'Smoke',
    count(CASES, (c) => c.suite === 'Smoke'),
    'POS + AUTH for G1–G3 and the core scenario path (tag @smoke)',
  );
  kv(
    'Regression',
    count(CASES, (c) => c.suite === 'Regression'),
  );
  r++;
  section('Type × group (cases)');
  for (const g of GROUPS.filter((x) => x.key !== 'M1')) {
    const cs = CASES.filter((c) => groupOf(c.apis[0]!).key === g.key);
    kv(`${g.key} ${g.name}`, TYPE_ORDER.map((t) => `${t} ${count(cs, (c) => c.type === t)}`).join(' · '));
  }
  kv(
    'Priority',
    ['Critical', 'High', 'Medium', 'Low']
      .map((p) => `${p} ${count(CASES, (c) => c.priority === p)}`)
      .join(' · '),
  );
  r++;

  section('Per-API checks (cases / covered by scenario / not applicable)');
  for (const ch of CHECKS) {
    const cells = [...BASE.matrix.values()].map((row) => row[ch.code]?.kind);
    kv(
      `${ch.code} — ${ch.title}`,
      `${count(cells, (k) => k === 'case')} / ${count(cells, (k) => k === 'covered')} / ${count(cells, (k) => k === 'na')}`,
    );
  }
  r++;

  section('Status');
  for (const s of STATUSES)
    kv(
      s,
      count(CASES, (c) => c.status === s),
    );
  kv(
    'Runnable now',
    count(CASES, (c) => c.status === 'NOT RUN'),
    'no account needed: TEST_TOKEN route cases + no-credential / wrong-credential checks',
  );
  kv(
    'Dev questions',
    `${QUESTIONS.length} — open ${count(QUESTIONS, (q) => !q.answer && !q.deferred)} · deferred ${count(QUESTIONS, (q) => !!q.deferred && !q.answer)} · answered ${count(QUESTIONS, (q) => !!q.answer)}`,
  );
  r++;

  section('Current blockers');
  const blockers = QUESTIONS.filter((q) => q.kind === 'Access / environment' && OPEN.has(q.id))
    .map((q) => ({ q, n: casesForQuestion(q.id).length }))
    .sort((a, b) => b.n - a.n);
  for (const { q, n } of blockers) kv(`${q.id} ${q.topic}`, `${n} case${n === 1 ? '' : 's'}`, q.decision);
  r++;

  section('Likely defects / gaps documented by Dev (need a decision)');
  for (const q of QUESTIONS.filter((x) => x.kind === 'Possible defect — confirm'))
    kv(`${q.id} ${q.topic}`, q.question.slice(0, 260) + (q.question.length > 260 ? '…' : ''));
  kv(
    'API-208',
    'Doc says profile_first_name_source is a broken route; staging implements it (M2Q-01) — the deployed build may differ from ae838f4.',
  );
  r++;

  section('Recommended next steps');
  [
    '1. Dev reviews "Scenario Cases" and the per-group sheets (G1–G10; filter by Check), fills Dev Decision + comments, and answers "Dev Review - Questions".',
    '2. Dev provides test accounts (M2Q-03), CMS admins (M2Q-04) and the read-gate state (M2Q-02) — this unblocks most cases.',
    '3. QA automates the runnable cases now (status NOT RUN: TEST_TOKEN routes, AUTH and TOKEN checks) in the m2-api Playwright project.',
    '4. After answers: update expected results, re-run npm run m2:docs, then automate the approved cases via the testcase-manager agent.',
    '5. DB cases stay BLOCKED until M2Q-16 (= M1 BQ-04/BQ-30) is answered.',
  ].forEach((s) => kv('', s));
  r++;

  section('Status legend');
  kv('NOT RUN', 'Expected behaviour is evidenced; can run when executed.');
  kv('BLOCKED', 'Expected behaviour is evidenced, but access / data / environment is missing.');
  kv('NEED DEV CLARIFICATION', 'Expected behaviour is not confirmed — see the cited M2Q.');
  kv('PASS / FAIL / NOT APPLICABLE', 'Only after execution, or when Dev confirms out of scope.');
}

function inventorySheet(wb: ExcelJS.Workbook, inventory: InventoryApi[]) {
  const ws = wb.addWorksheet('API Inventory', { properties: { tabColor: { argb: 'FF2563EB' } } });
  titleBlock(
    ws,
    'Milestone 2 API inventory',
    `All ${inventory.length} entries from ${SOURCE_REF}. Method, path, fields, access path, auth and notes are verbatim from the Dev doc; group, operation type and scope are QA classification.`,
    15,
  );
  const cols: Col[] = [
    { header: 'S.No.', width: 6 },
    { header: 'API ID', width: 9 },
    { header: 'Test Group', width: 22 },
    { header: 'HTTP Method', width: 8 },
    { header: 'Endpoint', width: 38, mono: true },
    { header: 'Action (business purpose)', width: 26 },
    { header: 'PII Fields', width: 16 },
    { header: 'Operation Type', width: 20 },
    { header: 'Authentication', width: 20 },
    { header: 'PII Access Path / Observable Behaviour (Dev doc)', width: 60 },
    { header: 'Dev Notes / Staging Observation', width: 50 },
    { header: 'Source of Evidence', width: 22 },
    { header: 'DB Verification', width: 18 },
    { header: 'Scope Status', width: 22 },
    { header: 'Test Cases', width: 26 },
  ];
  const rows = inventory.map((a, i) => {
    const g = groupOf(a.id);
    const access = a.fields.map((f) => `${FIELD_LABEL[f]}: ${a.access[f]}`).join('\n');
    const notes = [a.notes, OBSERVED[a.id]].filter(Boolean).join('\n');
    return [
      i + 1,
      a.id,
      `${g.key} ${g.name}`,
      a.method,
      a.path,
      actionOf(a),
      fieldsText(a.fields),
      operationOf(a),
      authLabel(a),
      access,
      notes || '—',
      OBSERVED[a.id] ? 'Dev inventory + staging observation' : 'Dev inventory',
      g.key === 'M1' ? 'M1 BQ-04 (blocked)' : 'Blocked — M2Q-16',
      scopeOf(a),
      g.key === 'M1' ? 'Milestone 1 suite (109 cases)' : caseSummary(casesFor(a.id)),
    ];
  });
  const end = table(ws, 4, cols, rows);
  for (let r = 5; r <= end; r++) ws.getRow(r).height = 48;
}

function casesSheet(
  wb: ExcelJS.Workbook,
  inventory: InventoryApi[],
  keep: Map<string, Record<string, string>>,
  sheet: { name: string; title: string; subtitle: string; tab: string; cases: AnyCase[] },
) {
  const ws = wb.addWorksheet(sheet.name, { properties: { tabColor: { argb: sheet.tab } } });
  titleBlock(
    ws,
    sheet.title,
    `${sheet.subtitle} Fill "Dev Decision" (dropdown) and "Dev Review Comments" — they are preserved when the workbook is regenerated.`,
    28,
  );
  const inv = new Map(inventory.map((a) => [a.id, a]));
  const cols: Col[] = [
    { header: 'S.No.', width: 6 },
    { header: 'Test Case ID', width: 20, mono: true },
    { header: 'Check', width: 11 },
    { header: 'Milestone', width: 9 },
    { header: 'Module/Feature', width: 20 },
    { header: 'API Name', width: 22 },
    { header: 'HTTP Method', width: 9 },
    { header: 'Endpoint', width: 32, mono: true },
    { header: 'Test Case Name', width: 36 },
    { header: 'Test Type', width: 11 },
    { header: 'Category', width: 16 },
    { header: 'Suite', width: 11 },
    { header: 'Priority', width: 9 },
    { header: 'PII Fields', width: 14 },
    { header: 'Preconditions', width: 32 },
    { header: 'Test Data', width: 30 },
    { header: 'Testing Steps', width: 44 },
    { header: 'What to Validate', width: 34 },
    { header: 'Why / Business or Security Rationale', width: 36 },
    { header: 'Expected Result', width: 42 },
    { header: 'Evidence for Expected Result', width: 30 },
    { header: 'DB Verification', width: 26 },
    { header: 'Dependencies / Dev Clarification', width: 22 },
    { header: 'Current Status', width: 16 },
    { header: 'Automation Status', width: 16 },
    { header: 'Execution Mode', width: 13 },
    { header: 'APIs Covered', width: 24, mono: true },
    { header: 'Related (UI smoke / M1)', width: 18 },
    { header: 'Planned Tags', width: 30, mono: true },
    { header: 'Dev Decision', width: 18 },
    { header: 'Dev Review Comments', width: 36 },
  ];
  const rows = sheet.cases.map((c, i) => {
    const p = primaryEndpoint(c, inv);
    const k = keep.get(c.id) ?? {};
    return [
      i + 1,
      c.id,
      c.check ?? 'Scenario',
      'M2',
      c.module,
      p.apiName,
      p.method,
      p.endpoint,
      c.name,
      c.type,
      c.category,
      c.suite,
      c.priority,
      fieldsText(c.fields),
      c.pre,
      c.data,
      steps(c.steps),
      c.validate,
      c.why,
      c.expected,
      c.evidence,
      c.db,
      c.deps.length ? c.deps.join(', ') : '—',
      c.status,
      c.automation,
      c.mode,
      c.apis.join(', '),
      c.related ?? '—',
      c.tags.join(' '),
      k['Dev Decision'] ?? '',
      k['Dev Review Comments'] ?? '',
    ];
  });
  const end = table(ws, 4, cols, rows);
  for (let r = 5; r <= end; r++) {
    const stepsText = String(ws.getCell(r, colIndex(cols, 'Testing Steps')).value ?? '');
    ws.getRow(r).height = Math.min(180, Math.max(60, stepsText.split('\n').length * 30));
    ws.getCell(r, colIndex(cols, 'Test Case ID')).font = { name: 'Menlo', size: 9, bold: true };
    ws.getCell(r, colIndex(cols, 'Test Case Name')).font = {
      name: FONT,
      size: 10,
      bold: true,
      color: { argb: C.ink },
    };
    ws.getCell(r, colIndex(cols, 'Dev Decision')).fill = fill(C.accentBg);
    ws.getCell(r, colIndex(cols, 'Dev Review Comments')).fill = fill(C.accentBg);
  }
  statusFormatting(ws, colIndex(cols, 'Current Status'), 5, end);
  priorityFormatting(ws, colIndex(cols, 'Priority'), 5, end);
  listValidation(ws, colIndex(cols, 'Current Status'), 5, end, STATUSES);
  listValidation(ws, colIndex(cols, 'Automation Status'), 5, end, AUTOMATION);
  listValidation(ws, colIndex(cols, 'Dev Decision'), 5, end, DEV_DECISIONS);
}

function dbSheet(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet('DB Test Cases', { properties: { tabColor: { argb: 'FFCA8A04' } } });
  titleBlock(
    ws,
    'Database verification (read-only) — view of the master cases',
    'Every row is linked to its master case in "Scenario Cases" or its group sheet (no separate definition). All are BLOCKED until M2Q-16 (PII DB + aisleweb schema, read-only access, storage contract). QA never modifies or deletes DB data.',
    10,
  );
  const dbCases = CASES.filter((c) => c.type === 'Database');
  const linked = CASES.filter((c) => c.type !== 'Database' && /M2-DB-\d+/.test(c.db));
  const cols: Col[] = [
    { header: 'Master Test Case ID', width: 16, mono: true },
    { header: 'Test Case Name', width: 40 },
    { header: 'PII Fields', width: 14 },
    { header: 'Required DB Access', width: 30 },
    { header: 'Required Schema / Tables / Columns', width: 36 },
    { header: 'Expected Persistence Behaviour', width: 40 },
    { header: 'Safe Verification Method', width: 36 },
    { header: 'Read-only Possible?', width: 12 },
    { header: 'Feeding API Cases', width: 30, mono: true },
    { header: 'Dependencies', width: 16 },
    { header: 'Current Status', width: 14 },
  ];
  const rows = dbCases.map((c) => [
    c.id,
    c.name,
    fieldsText(c.fields),
    /Dev runs|Dev-run/.test(c.pre)
      ? 'Dev runs aggregate query; QA gets counts only'
      : 'Read-only SELECT on PII DB and aisleweb (credentials in .env / CI secret)',
    c.db,
    c.expected,
    `${steps(c.steps)}\nCompare ciphertext hashes / counts only; never decrypt or print values.`,
    'Yes',
    linked
      .filter((x) => x.db.includes(c.id))
      .map((x) => x.id)
      .join(', ') || '—',
    c.deps.join(', '),
    c.status,
  ]);
  const end = table(ws, 4, cols, rows);
  for (let r = 5; r <= end; r++) ws.getRow(r).height = 90;
  statusFormatting(ws, colIndex(cols, 'Current Status'), 5, end);
}

function questionsSheet(wb: ExcelJS.Workbook, keep: Map<string, Record<string, string>>) {
  const ws = wb.addWorksheet('Dev Review - Questions', { properties: { tabColor: { argb: 'FF9333EA' } } });
  titleBlock(
    ws,
    'Questions for Dev (M2Q-xx)',
    'Each question lists the cases it blocks. Please answer in "Dev Response" and set Status. Answers are preserved when the workbook is regenerated.',
    11,
  );
  const cols: Col[] = [
    { header: 'Question ID', width: 10, mono: true },
    { header: 'Topic', width: 18 },
    { header: 'Type', width: 16 },
    { header: 'Question for Dev', width: 70 },
    { header: 'Why It Matters', width: 40 },
    { header: 'Impacted APIs', width: 24, mono: true },
    { header: 'Impacted Test Cases', width: 30, mono: true },
    { header: 'Current Observation / Evidence', width: 42 },
    { header: 'Required Decision', width: 34 },
    { header: 'Dev Response', width: 40 },
    { header: 'Status', width: 10 },
  ];
  const rows = QUESTIONS.map((q) => {
    const k = keep.get(q.id) ?? {};
    const tcs = casesForQuestion(q.id);
    const apis = [...new Set([...q.apis, ...casesForQuestion(q.id).flatMap((c) => c.apis)])].sort();
    return [
      q.id,
      q.topic,
      q.kind,
      q.question,
      q.why,
      apis.length > 12
        ? `${apis.slice(0, 12).join(', ')} … (+${apis.length - 12})`
        : apis.join(', ') || 'All',
      `${tcs.length} case(s): ${caseSummary(casesForQuestion(q.id))}`,
      q.evidence,
      q.decision,
      // A recorded answer (m2-questions.ts) wins; otherwise keep what Dev typed in the sheet.
      q.answer
        ? `${q.answer.text} (${q.answer.by}, ${q.answer.on})`
        : (k['Dev Response'] ?? q.deferred ?? ''),
      q.answer ? 'Answered' : (k['Status'] ?? (q.deferred ? 'Deferred' : 'Open')),
    ];
  });
  const end = table(ws, 4, cols, rows);
  for (let r = 5; r <= end; r++) {
    ws.getRow(r).height = 120;
    ws.getCell(r, colIndex(cols, 'Dev Response')).fill = fill(C.accentBg);
  }
  listValidation(ws, colIndex(cols, 'Status'), 5, end, Q_STATUSES);
}

function coverageSheet(wb: ExcelJS.Workbook, inventory: InventoryApi[]) {
  const ws = wb.addWorksheet('Coverage Matrix', { properties: { tabColor: { argb: 'FF0891B2' } } });
  titleBlock(
    ws,
    'Coverage matrix',
    'Top: test-strategy group × PII field × scenario type (number of cases). Bottom: every inventory API and the cases that cover it. Missing contracts are listed per group.',
    13,
  );
  const types = TYPE_ORDER;
  const cols: Col[] = [
    { header: 'Group', width: 34 },
    { header: 'PII Field', width: 12 },
    { header: 'APIs in Group (field)', width: 10 },
    { header: 'APIs Covered', width: 10 },
    ...types.map((t) => ({ header: t, width: 10 })),
    { header: 'Missing Contracts / Open Questions', width: 50 },
  ];
  const rows: (string | number)[][] = [];
  for (const g of GROUPS) {
    for (const f of PII_FIELDS) {
      const apis = inventory.filter((a) => g.ids.includes(a.id) && a.fields.includes(f));
      if (!apis.length) continue;
      const cs = CASES.filter((c) => c.fields.includes(f) && c.apis.some((a) => g.ids.includes(a)));
      const covered = apis.filter((a) => cs.some((c) => c.apis.includes(a.id))).length;
      const qs = [...new Set(cs.flatMap((c) => c.deps))].sort();
      rows.push([
        `${g.key} ${g.name}`,
        FIELD_LABEL[f],
        apis.length,
        g.key === 'M1' ? 'M1' : covered,
        ...types.map((t) => count(cs, (c) => c.type === t)),
        g.key === 'M1'
          ? 'Covered by Milestone 1 (see m1/docs/backend-open-questions.md)'
          : qs.join(', ') || '—',
      ]);
    }
  }
  let end = table(ws, 4, cols, rows);
  for (let r = 5; r <= end; r++)
    for (let c = 3; c <= 4 + types.length; c++) {
      const cell = ws.getCell(r, c);
      cell.alignment = { horizontal: 'center', vertical: 'top' };
      if (cell.value === 0) cell.font = { name: FONT, color: { argb: 'FFB91C1C' }, bold: true };
    }

  // Per-API coverage list
  end += 2;
  ws.mergeCells(end, 1, end, 13);
  const h = ws.getCell(end, 1);
  h.value = 'Per-API coverage';
  h.font = { name: FONT, bold: true, size: 12, color: { argb: C.white } };
  h.fill = fill(C.band);
  end++;
  const head = ['API ID', 'Endpoint', 'Fields', 'Cases', 'Case IDs'];
  head.forEach((t, i) => {
    const cell = ws.getCell(end, i === 4 ? 5 : i + 1);
    cell.value = t;
    cell.font = { name: FONT, bold: true, color: { argb: C.white } };
    cell.fill = fill(C.headerBg);
  });
  ws.mergeCells(end, 5, end, 13);
  for (const a of inventory) {
    end++;
    const tcs = casesFor(a.id).map((c) => c.id);
    const m1 = groupOf(a.id).key === 'M1';
    ws.getCell(end, 1).value = a.id;
    ws.getCell(end, 2).value = `${a.method} ${a.path}`;
    ws.getCell(end, 3).value = fieldsText(a.fields);
    ws.getCell(end, 4).value = m1 ? 'M1' : tcs.length;
    ws.mergeCells(end, 5, end, 13);
    ws.getCell(end, 5).value = m1 ? 'Milestone 1 suite' : caseSummary(casesFor(a.id));
    ws.getCell(end, 2).font = { name: 'Menlo', size: 9 };
    ws.getCell(end, 5).font = { name: 'Menlo', size: 9 };
    ws.getCell(end, 5).alignment = { wrapText: true };
    if (!m1 && !tcs.length) ws.getCell(end, 4).font = { bold: true, color: { argb: 'FFB91C1C' } };
  }
}

function matrixSheet(wb: ExcelJS.Workbook, inventory: InventoryApi[]) {
  const ws = wb.addWorksheet('Per-API Check Matrix', { properties: { tabColor: { argb: 'FF0F766E' } } });
  const span = 5 + CHECKS.length;
  titleBlock(
    ws,
    'Per-API check matrix — every API × every standard check',
    '✔ = per-API case (sheet of its group, ID M2-API-xxx-CHECK). ↗ = covered exactly by the named scenario case. N/A = not applicable, with the reason. M1 facade routes are covered by Milestone 1.',
    span,
  );
  const head = [
    'API ID',
    'Group',
    'Endpoint',
    'Fields',
    'Cases',
    ...CHECKS.map((c) => `${c.code} — ${c.title}`),
  ];
  const hr = 4;
  head.forEach((t, i) => {
    const cell = ws.getCell(hr, i + 1);
    cell.value = t;
    cell.font = { name: FONT, bold: true, size: 9, color: { argb: C.white } };
    cell.fill = fill(C.band);
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
      textRotation: i >= 5 ? 90 : 0,
    };
    cell.border = box;
  });
  ws.getRow(hr).height = 190;
  [9, 22, 40, 14, 7, ...CHECKS.map(() => 13)].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const STYLE: Record<Cell['kind'], { bg: string; ink: string }> = {
    case: { bg: 'FFDCFCE7', ink: 'FF166534' },
    covered: { bg: 'FFDBEAFE', ink: 'FF1E40AF' },
    na: { bg: 'FFF1F5F9', ink: 'FF64748B' },
  };
  let r = hr + 1;
  for (const a of inventory) {
    const m1 = groupOf(a.id).key === 'M1';
    const row = BASE.matrix.get(a.id);
    const values: string[] = [a.id, groupOf(a.id).key, `${a.method} ${a.path}`, fieldsText(a.fields)];
    values.push(m1 ? 'M1' : String(casesFor(a.id).length));
    for (const ch of CHECKS) {
      const cell = row?.[ch.code];
      values.push(
        m1 || !cell
          ? 'M1 suite'
          : cell.kind === 'case'
            ? '✔'
            : cell.kind === 'covered'
              ? `↗ ${cell.by}`
              : `N/A — ${cell.reason}`,
      );
    }
    values.forEach((v, i) => {
      const c = ws.getCell(r, i + 1);
      c.value = v;
      c.border = box;
      c.alignment = { vertical: 'top', wrapText: true, horizontal: i >= 4 && v === '✔' ? 'center' : 'left' };
      c.font = { name: i === 2 ? 'Menlo' : FONT, size: i >= 5 ? 8 : 9, color: { argb: C.ink } };
      if (i >= 5) {
        const kind = row?.[CHECKS[i - 5]!.code]?.kind;
        if (kind) {
          c.fill = fill(STYLE[kind].bg);
          c.font = { name: FONT, size: 8, bold: kind === 'case', color: { argb: STYLE[kind].ink } };
        }
      }
    });
    ws.getRow(r).height = 44;
    r++;
  }
  // Totals
  ws.getCell(r, 3).value = 'Per-API cases / covered / N/A';
  ws.getCell(r, 3).font = { name: FONT, bold: true };
  CHECKS.forEach((ch, i) => {
    let n = 0,
      cov = 0,
      na = 0;
    for (const row of BASE.matrix.values()) {
      const k = row[ch.code]?.kind;
      if (k === 'case') n++;
      else if (k === 'covered') cov++;
      else if (k === 'na') na++;
    }
    const c = ws.getCell(r, 6 + i);
    c.value = `${n} / ${cov} / ${na}`;
    c.font = { name: FONT, bold: true, size: 8 };
    c.alignment = { wrapText: true, horizontal: 'center' };
  });
  ws.views = [{ state: 'frozen', ySplit: hr, xSplit: 3 }];
  ws.autoFilter = { from: { row: hr, column: 1 }, to: { row: r - 1, column: head.length } };
}

// ---- Markdown summary -------------------------------------------------------------------------------------
function summaryMarkdown(inventory: InventoryApi[]) {
  const runNow = CASES.filter((c) => c.status === 'NOT RUN');
  const runNowByCheck = CHECKS.map((ch) => ({ ch, n: count(runNow, (c) => c.check === ch.code) })).filter(
    (x) => x.n,
  );
  const byStatus = STATUSES.map((s) => `${s} ${count(CASES, (c) => c.status === s)}`).join(' · ');
  const blockedBy = QUESTIONS.map((q) => ({ q, n: casesForQuestion(q.id).length })).sort((a, b) => b.n - a.n);
  const lines = [
    '<!-- GENERATED FILE — do not edit by hand. Source: m2/scripts/* · Regenerate: npm run m2:docs -->',
    '',
    '# Milestone 2 test design — summary',
    '',
    `Workbook: [m2-test-cases.xlsx](m2-test-cases.xlsx) · Inventory source: [aisle-pii-affected-apis.md](aisle-pii-affected-apis.md) (${SOURCE_REF}).`,
    '',
    `**${CASES.length} test cases** (${SCENARIOS.length} scenario + ${BASE.cases.length} per-API) over **${inventory.length} inventory entries** (${GROUPS.length} groups). ${byStatus}. Nothing has been executed as an M2 test case yet.`,
    '',
    '## By type and category (same Type values as M1)',
    '',
    '| Type | Category | Cases | Smoke |',
    '| --- | --- | --- | --- |',
    ...CATEGORY_ORDER.map(
      (cat) =>
        `| ${CATEGORY_TYPE[cat]} | ${cat} | ${count(CASES, (c) => c.category === cat)} | ${count(CASES, (c) => c.category === cat && c.suite === 'Smoke')} |`,
    ),
    '',
    '## Groups',
    '',
    '| Group | APIs | Cases | Strategy |',
    '| --- | --- | --- | --- |',
    ...GROUPS.map(
      (g) =>
        `| ${g.key} ${g.name} | ${g.ids.length} | ${g.key === 'M1' ? 'M1 suite' : CASES.filter((c) => c.apis.some((a) => g.ids.includes(a))).length} | ${g.strategy} |`,
    ),
    '',
    `## Runnable now (${runNow.length} cases, no new access needed)`,
    '',
    ...runNow.filter((c) => !c.check).map((c) => `- \`${c.id}\` ${c.name}`),
    ...runNowByCheck.map(({ ch, n }) => `- ${ch.code} (${ch.title}): ${n} APIs`),
    '',
    '## Per-API checks',
    '',
    '| Check | Title | Cases | Covered by scenario | N/A |',
    '| --- | --- | --- | --- | --- |',
    ...CHECKS.map((ch) => {
      const cells = [...BASE.matrix.values()].map((row) => row[ch.code]?.kind);
      return `| ${ch.code} | ${ch.title} | ${count(cells, (k) => k === 'case')} | ${count(cells, (k) => k === 'covered')} | ${count(cells, (k) => k === 'na')} |`;
    }),
    '',
    '## Blocking questions (cases affected)',
    '',
    '| Question | Topic | Type | Cases |',
    '| --- | --- | --- | --- |',
    ...blockedBy.map(({ q, n }) => `| ${q.id} | ${q.topic} | ${q.kind} | ${n} |`),
    '',
  ];
  return lines.join('\n');
}

// ---- Main -------------------------------------------------------------------------------------------------
async function main() {
  const design = buildDesign(ROOT);
  const inventory = design.inventory;
  BASE = design.base;
  CASES = design.cases;
  validate(inventory);
  const keep = await previousReview();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Aisle QA — PII automation framework';
  wb.created = new Date();
  overviewSheet(wb, inventory);
  inventorySheet(wb, inventory);
  casesSheet(wb, inventory, keep, {
    name: 'Scenario Cases',
    title: 'Milestone 2 scenario cases',
    subtitle:
      'Lifecycle, documented gaps, cross-field / cross-API and DB design cases. Endpoint shows the primary API; the full list is in "APIs Covered".',
    tab: 'FF16A34A',
    cases: CASES.filter((c) => !c.check),
  });
  for (const g of GROUPS) {
    const order = (c: AnyCase) => TYPE_ORDER.indexOf(c.type) * 100 + CATEGORY_ORDER.indexOf(c.category);
    const cases = CASES.filter((c) => c.check && groupOf(c.apis[0]!).key === g.key).sort(
      (a, b) => a.apis[0]!.localeCompare(b.apis[0]!) || order(a) - order(b),
    );
    if (!cases.length) continue;
    casesSheet(wb, inventory, keep, {
      name: cases[0]!.module.replace(/[\\/?*[\]:]/g, '-').slice(0, 31),
      title: `Per-API cases — ${g.key} ${g.name}`,
      subtitle: `${cases.length} cases for ${g.ids.length} APIs. Filter "Check" to review one standard check across all APIs. ${g.strategy}`,
      tab: 'FF4ADE80',
      cases,
    });
  }
  matrixSheet(wb, inventory);
  dbSheet(wb);
  questionsSheet(wb, keep);
  coverageSheet(wb, inventory);
  await wb.xlsx.writeFile(OUT);
  writeFileSync(SUMMARY_MD, summaryMarkdown(inventory));
  console.log(
    `M2 workbook: ${path.relative(ROOT, OUT)} — ${CASES.length} cases (${SCENARIOS.length} scenario + ${BASE.cases.length} per-API), ${inventory.length} APIs, ${QUESTIONS.length} questions` +
      (keep.size ? ` (kept Dev review for ${keep.size} rows)` : ''),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
