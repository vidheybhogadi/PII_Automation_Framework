/**
 * Builds m2-pii-firstname/docs/m2fn-test-cases.xlsx (Dev-review workbook of the M2 PII First Name suite), in the
 * same style as the Milestone 2 workbook, from:
 *   - m2-pii-firstname/docs/redis-key-apis.md          (source document — parsed, never edited)
 *   - m2-pii-firstname/docs/firstname-inventory.json   (first-name inventory — read only)
 *   - m2-pii-firstname/scripts/m2fn-firstname-cases.data.ts (white-box cases + coverage matrix)
 *   - m2-pii-firstname/scripts/m2fn-sweep.ts           (sweep classification of every Aisle / CMS row)
 *   - m2-pii-firstname/scripts/m2fn-vernac-cases.data.ts / m2fn-vernac-sweep.ts (vernac + vernac CMS cases, sweep)
 *   - m2-pii-firstname/scripts/m2fn-test-cases.data.ts (QA test design)
 *   - m2-pii-firstname/scripts/m2fn-questions.ts       (M2FNQ-xx questions for Dev)
 *
 *   npm run m2fn:docs
 *
 * Fails if a case cites an unknown API or question, an ID repeats, or a suite API has no case. The "Dev Decision" /
 * "Dev Review Comments" / "Dev Response" columns are carried over from the previous file.
 */
import ExcelJS from 'exceljs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { EDGES } from './m2fn-firstname-cases.data';
import {
  ALL_MATRIX,
  buildM2fnDesign,
  designProblems,
  SWEEP_CASES,
  FN_INVENTORY,
  ROOT,
  scopeRows,
  type M2fnDesign,
  type M2fnDesignCase,
} from './m2fn-design';
import { SOURCE_DOC } from './m2fn-inventory';
import { SWEEP } from './m2fn-sweep';
import { VN_SWEEP } from './m2fn-vernac-sweep';
import { QUESTIONS } from './m2fn-questions';
import type { Status } from './m2fn-test-cases.data';

const OUT = path.join(ROOT, 'm2-pii-firstname/docs/m2fn-test-cases.xlsx');

// ---- Palette (same as m2/scripts/generate-m2-workbook.ts) ----------------------------------------------------
const C = {
  headerBg: 'FF1E293B',
  band: 'FF334155',
  zebra: 'FFF8FAFC',
  border: 'FFE2E8F0',
  white: 'FFFFFFFF',
  muted: 'FF64748B',
  slate: 'FF475569',
  ink: 'FF0F172A',
  accentBg: 'FFEFF6FF',
};
const STATUS_STYLE: Record<Status, { bg: string; ink: string }> = {
  PASS: { bg: 'FFC6EFCE', ink: 'FF006100' },
  FAIL: { bg: 'FFFFC7CE', ink: 'FF9C0006' },
  BLOCKED: { bg: 'FFFFEB9C', ink: 'FF9C5700' },
  'NEED DEV CLARIFICATION': { bg: 'FFEBD5F5', ink: 'FF6B1D5E' },
  WAITING: { bg: 'FFDBEAFE', ink: 'FF1E40AF' },
  'NOT APPLICABLE': { bg: 'FFD5EEEC', ink: 'FF285E61' },
  'NOT RUN': { bg: 'FFE5E7EB', ink: 'FF4B5563' },
};
const STATUSES = Object.keys(STATUS_STYLE) as Status[];
const PRIORITY_INK: Record<string, string> = {
  Critical: 'FFB91C1C',
  High: 'FFC2410C',
  Medium: 'FF1D4ED8',
  Low: 'FF6B7280',
};
const DEV_DECISIONS = [
  'Approved',
  'Approved with changes',
  'Change expected result',
  'Not applicable',
  'Needs discussion',
];
const AUTOMATION = ['NOT AUTOMATED', 'AUTOMATED', 'AUTOMATION BLOCKED'];
const Q_STATUSES = ['Open', 'Answered', 'Deferred', 'Closed'];
const FONT = 'Calibri';
const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin' as const, color: { argb: C.border } };
const box = { top: thin, left: thin, bottom: thin, right: thin };

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
  read('Test Cases', 'Test Case ID', ['Dev Decision', 'Dev Review Comments']);
  read('Dev Review - Questions', 'Question ID', ['Dev Response', 'Status']);
  return keep;
}

// ---- Sheets -----------------------------------------------------------------------------------------------
function overviewSheet(wb: ExcelJS.Workbook, d: M2fnDesign) {
  const ws = wb.addWorksheet('Overview', { properties: { tabColor: { argb: C.headerBg } } });
  titleBlock(
    ws,
    'M2 PII First Name — white-box test cases (Aisle, Aisle CMS, Vernac, Vernac CMS) and Redis key API cases',
    `White-box first-name suite (kept apart from Milestone 2). Sources: ${FN_INVENTORY}, ${SOURCE_DOC}. Tests: m2-pii-firstname/tests (Playwright projects m2fn-api — npm run m2fn:test — and m2fn-vn-api — npm run m2fn:vn:test).`,
    3,
  );
  const count = (pred: (c: M2fnDesignCase) => boolean) => d.cases.filter(pred).length;
  const rows: (string | number)[][] = [
    ['APIs in scope', d.apis.length, d.apis.map((a) => `${a.id} ${a.method} ${a.path}`).join('\n')],
    [
      'Test cases',
      d.cases.length,
      'M2FN-RDK-xxx Redis key APIs; M2FN-<area>-NNN first-name white-box cases (M2FN-V<area>-NNN = vernac); M2FN-SWP-001 / M2FN-VSWP-001 sweeps (one test per callable row)',
    ],
    [
      'Vernac sweep (Vernac + Vernac CMS)',
      VN_SWEEP.length,
      `${VN_SWEEP.filter((r) => r.cls === 'now').length} callable now, ${VN_SWEEP.filter((r) => r.cls === 'later').length} through an existing relation between team users, ${VN_SWEEP.filter((r) => r.cls === 'cannot').length} cannot be called`,
    ],
    [
      'Inventory rows in scope (Aisle, Aisle CMS, Vernac, Vernac CMS)',
      scopeRows().length,
      `Sweep: ${SWEEP.filter((r) => r.cls === 'now').length} callable now, ${SWEEP.filter((r) => r.cls === 'approved').length} after CMS approval, ${SWEEP.filter((r) => r.cls === 'cannot').length} cannot be called (reasons on "Sweep Rows")`,
    ],
    ...STATUSES.filter((s) => count((c) => c.status === s)).map((s): (string | number)[] => [
      `Status: ${s}`,
      count((c) => c.status === s),
      d.cases
        .filter((c) => c.status === s)
        .map((c) => c.id)
        .join(', '),
    ]),
    ...AUTOMATION.map((a): (string | number)[] => [`Automation: ${a}`, count((c) => c.automation === a), '']),
    [
      'Open questions for Dev',
      QUESTIONS.filter((q) => !q.answer).length,
      QUESTIONS.filter((q) => !q.answer)
        .map((q) => `${q.id} ${q.topic}`)
        .join('\n'),
    ],
    [
      'Answered questions',
      QUESTIONS.filter((q) => q.answer).length,
      QUESTIONS.filter((q) => q.answer)
        .map((q) => `${q.id} ${q.topic}`)
        .join('\n'),
    ],
  ];
  table(
    ws,
    4,
    [
      { header: 'Item', width: 34 },
      { header: 'Count', width: 10 },
      { header: 'Details', width: 90 },
    ],
    rows,
  );
}

function inventorySheet(wb: ExcelJS.Workbook, d: M2fnDesign) {
  const ws = wb.addWorksheet('API Inventory', { properties: { tabColor: { argb: 'FF2563EB' } } });
  titleBlock(ws, 'APIs in scope', `Parsed from ${SOURCE_DOC} (Aisle backend rows).`, 7);
  const cols: Col[] = [
    { header: 'API ID', width: 10, mono: true },
    { header: 'Method', width: 9 },
    { header: 'Path', width: 24, mono: true },
    { header: 'Purpose', width: 30 },
    { header: 'Auth', width: 34 },
    { header: 'Behaviour (quick reference)', width: 70 },
    { header: 'Test Cases', width: 40, mono: true },
  ];
  const rows = d.apis.map((a) => [
    a.id,
    a.method,
    a.path,
    a.purpose,
    a.auth,
    a.notes,
    d.cases
      .filter((c) => c.apis.includes(a.id))
      .map((c) => c.id)
      .join(', '),
  ]);
  const end = table(ws, 4, cols, rows);
  for (let r = 5; r <= end; r++) ws.getRow(r).height = 90;
}

function casesSheet(wb: ExcelJS.Workbook, d: M2fnDesign, keep: Map<string, Record<string, string>>) {
  const ws = wb.addWorksheet('Test Cases', { properties: { tabColor: { argb: 'FF16A34A' } } });
  titleBlock(
    ws,
    'Test cases (M2FN-RDK-xxx Redis key APIs, M2FN-<area>-NNN first-name white-box cases)',
    'Fill "Dev Decision" (dropdown) and "Dev Review Comments" — they are preserved when the workbook is regenerated.',
    27,
  );
  const cols: Col[] = [
    { header: 'S.No.', width: 6 },
    { header: 'Test Case ID', width: 16, mono: true },
    { header: 'Milestone', width: 11 },
    { header: 'Module/Feature', width: 20 },
    { header: 'HTTP Method', width: 9 },
    { header: 'Endpoint', width: 30, mono: true },
    { header: 'Test Case Name', width: 36 },
    { header: 'Test Type', width: 11 },
    { header: 'Category', width: 16 },
    { header: 'Suite', width: 11 },
    { header: 'Priority', width: 9 },
    { header: 'PII Fields', width: 11 },
    { header: 'Preconditions', width: 36 },
    { header: 'Test Data', width: 30 },
    { header: 'Testing Steps', width: 44 },
    { header: 'What to Validate', width: 36 },
    { header: 'Why / Business or Security Rationale', width: 34 },
    { header: 'Expected Result', width: 42 },
    { header: 'Evidence for Expected Result', width: 30 },
    { header: 'DB Verification', width: 28 },
    { header: 'Dependencies / Dev Clarification', width: 24 },
    { header: 'Current Status', width: 16 },
    { header: 'Automation Status', width: 16 },
    { header: 'Execution Mode', width: 13 },
    { header: 'APIs Covered', width: 24, mono: true },
    { header: 'Planned Tags', width: 30, mono: true },
    { header: 'Dev Decision', width: 18 },
    { header: 'Dev Review Comments', width: 36 },
  ];
  const deps = (c: M2fnDesignCase) =>
    c.deps
      .map((q) => `${q} (${QUESTIONS.find((x) => x.id === q)?.answer ? 'answered' : 'open'})`)
      .join('\n') || '—';
  const rows = d.cases.map((c, i) => {
    const refs = c.apis.map((a) => d.refs.get(a)!);
    const k = keep.get(c.id) ?? {};
    return [
      i + 1,
      c.id,
      'M2 PII First Name',
      c.module,
      [...new Set(refs.map((r) => r.method))].join(' / '),
      refs.map((r) => `${r.id} ${r.method} ${r.path}`).join('\n'),
      c.name,
      c.type,
      c.category,
      c.suite,
      c.priority,
      c.fields.length ? 'First name' : '—',
      c.pre,
      c.data,
      c.steps.map((s, n) => `${n + 1}. ${s}`).join('\n'),
      c.validate,
      c.why,
      c.expected,
      c.evidence,
      c.db,
      deps(c),
      c.status,
      c.automation,
      c.mode,
      c.apis.join(', '),
      c.tags.join(' '),
      k['Dev Decision'] ?? '',
      k['Dev Review Comments'] ?? '',
    ];
  });
  const end = table(ws, 4, cols, rows);
  for (let r = 5; r <= end; r++) {
    const stepsText = String(ws.getCell(r, colIndex(cols, 'Testing Steps')).value ?? '');
    ws.getRow(r).height = Math.min(200, Math.max(80, stepsText.split('\n').length * 34));
    ws.getCell(r, colIndex(cols, 'Test Case ID')).font = { name: 'Menlo', size: 9, bold: true };
    ws.getCell(r, colIndex(cols, 'Test Case Name')).font = {
      name: FONT,
      size: 10,
      bold: true,
      color: { argb: C.ink },
    };
    const p = ws.getCell(r, colIndex(cols, 'Priority'));
    p.font = { name: FONT, bold: true, color: { argb: PRIORITY_INK[String(p.value)] ?? C.muted } };
    ws.getCell(r, colIndex(cols, 'Dev Decision')).fill = fill(C.accentBg);
    ws.getCell(r, colIndex(cols, 'Dev Review Comments')).fill = fill(C.accentBg);
  }
  statusFormatting(ws, colIndex(cols, 'Current Status'), 5, end);
  listValidation(ws, colIndex(cols, 'Current Status'), 5, end, STATUSES);
  listValidation(ws, colIndex(cols, 'Automation Status'), 5, end, AUTOMATION);
  listValidation(ws, colIndex(cols, 'Dev Decision'), 5, end, DEV_DECISIONS);
}

function questionsSheet(wb: ExcelJS.Workbook, d: M2fnDesign, keep: Map<string, Record<string, string>>) {
  const ws = wb.addWorksheet('Dev Review - Questions', { properties: { tabColor: { argb: 'FF9333EA' } } });
  titleBlock(
    ws,
    'Questions for Dev (M2FNQ-xx)',
    'Each question lists the cases it blocks. Please answer in "Dev Response" and set Status. Answers are preserved when the workbook is regenerated.',
    11,
  );
  const cols: Col[] = [
    { header: 'Question ID', width: 11, mono: true },
    { header: 'Topic', width: 20 },
    { header: 'Type', width: 16 },
    { header: 'Question for Dev', width: 70 },
    { header: 'Why It Matters', width: 40 },
    { header: 'Impacted APIs', width: 18, mono: true },
    { header: 'Impacted Test Cases', width: 30, mono: true },
    { header: 'Current Observation / Evidence', width: 42 },
    { header: 'Required Decision', width: 34 },
    { header: 'Dev Response', width: 50 },
    { header: 'Status', width: 10 },
  ];
  const rows = QUESTIONS.map((q) => {
    const k = keep.get(q.id) ?? {};
    const tcs = d.cases.filter((c) => c.deps.includes(q.id)).map((c) => c.id);
    return [
      q.id,
      q.topic,
      q.kind,
      q.question,
      q.why,
      q.apis.join(', '),
      `${tcs.length} case(s): ${tcs.join(', ') || '—'}`,
      q.evidence,
      q.decision,
      q.answer ? `${q.answer.text} (${q.answer.by}, ${q.answer.on})` : (k['Dev Response'] ?? ''),
      q.answer ? 'Answered' : (k['Status'] ?? 'Open'),
    ];
  });
  const end = table(ws, 4, cols, rows);
  for (let r = 5; r <= end; r++) {
    ws.getRow(r).height = 150;
    ws.getCell(r, colIndex(cols, 'Dev Response')).fill = fill(C.accentBg);
  }
  listValidation(ws, colIndex(cols, 'Status'), 5, end, Q_STATUSES);
}

function matrixSheet(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet('Coverage Matrix', { properties: { tabColor: { argb: 'FFEA580C' } } });
  titleBlock(
    ws,
    'Coverage matrix — code path × edge case (Aisle, Aisle CMS, Vernac, Vernac CMS)',
    'Each cell names the case(s) that cover it (prefix M2FN-), or "N/A – reason" / "Blocked – …" / "Waiting – …". No cell is empty (checked by npm run m2fn:docs).',
    EDGES.length + 1,
  );
  const cols: Col[] = [
    { header: 'Path', width: 16, mono: true },
    ...EDGES.map((e) => ({ header: e, width: 18 })),
  ];
  const rows = Object.entries(ALL_MATRIX).map(([p, cells]) => [p, ...EDGES.map((e) => cells[e])]);
  const end = table(ws, 4, cols, rows);
  for (let r = 5; r <= end; r++) ws.getRow(r).height = 48;
}

function sweepSheet(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet('Sweep Rows', { properties: { tabColor: { argb: 'FF0891B2' } } });
  titleBlock(
    ws,
    'Sweeps M2FN-SWP-001 (Aisle / Aisle CMS) and M2FN-VSWP-001 (Vernac / Vernac CMS) — every in-scope inventory row',
    'Class: now = callable today; approved = (Aisle) callable once the suite’s accounts are approved through the CMS (M2FNQ-07) and related; later = (vernac) callable only through a relation that already exists between team users (M2FNQ-34); cannot = not callable (reason). Deep-covered rows show their cases.',
    9,
  );
  const cols: Col[] = [
    { header: 'Row', width: 12, mono: true },
    { header: 'Division', width: 11 },
    { header: 'Path', width: 8, mono: true },
    { header: 'Method', width: 8 },
    { header: 'Route', width: 44, mono: true },
    { header: 'Sweep class', width: 11 },
    { header: 'Caller / check', width: 16 },
    { header: 'Reason / relation', width: 60 },
    { header: 'Deep cases', width: 30, mono: true },
  ];
  const d = buildM2fnDesign(ROOT);
  const rows = scopeRows().map((r) => {
    const s = SWEEP.find((x) => x.row === r.id);
    const v = VN_SWEEP.find((x) => x.row === r.id);
    const deep = d.cases.filter((c) => !SWEEP_CASES.has(c.id) && c.apis.includes(r.id)).map((c) => c.id);
    if (v)
      return [
        r.id,
        r.division,
        r.path,
        r.method,
        r.route,
        v.cls,
        v.how ?? '',
        v.reason ?? (v.relation ? `relation: ${v.relation}` : ''),
        deep.join(', '),
      ];
    return [
      r.id,
      r.division,
      r.path,
      r.method,
      r.route,
      s?.cls ?? '— (deep only)',
      s?.how ?? '',
      s?.reason ?? (s?.relation ? `relation: ${s.relation}` : ''),
      deep.join(', '),
    ];
  });
  const end = table(ws, 4, cols, rows);
  for (let r = 5; r <= end; r++) ws.getRow(r).height = 30;
}

async function main() {
  const d = buildM2fnDesign(ROOT);
  const problems = designProblems(d);
  if (problems.length) {
    console.error(`M2 PII First Name design has ${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  const keep = await previousReview();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PII Automation Framework';
  overviewSheet(wb, d);
  inventorySheet(wb, d);
  casesSheet(wb, d, keep);
  matrixSheet(wb);
  sweepSheet(wb);
  questionsSheet(wb, d, keep);
  await wb.xlsx.writeFile(OUT);
  const open = QUESTIONS.filter((q) => !q.answer).length;
  console.log(
    `Wrote ${path.relative(ROOT, OUT)}: ${d.apis.length} APIs, ${d.cases.length} cases (${d.cases.filter((c) => c.status === 'NOT RUN').length} runnable), ${QUESTIONS.length} questions (${open} open)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
