/**
 * Builds docs/test-cases.xlsx — every PII service test case, grouped by API endpoint, on one sheet.
 *
 *   npm run docs:testcases          (also run automatically at the end of npm run test:all)
 *
 * Fully dynamic:
 *   - The test list comes from the code (`playwright test --list`), so new tests and new endpoints appear
 *     automatically, in the right endpoint section.
 *   - Descriptions (what / why / steps / expected / type / priority / preconditions) come from tests/catalog.
 *     A test without one is flagged in the sheet, and self-test UT-DOC-002 fails until it is written.
 *   - Status comes from the LAST run only: Pass, Fail, or Not Tested (with the reason). Tests that were not part of
 *     the last run are Not Tested. Nothing is guessed.
 *   - The "Tester Notes" column is carried over from the previous file, so manual notes survive regeneration.
 *
 * The same builder (buildTestCasesWorkbook) produces the Excel file in the HTML report's Export menu, so both
 * files always look identical.
 */
import ExcelJS from 'exceljs';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { testOutcome, type Outcome } from '../reporting/core/analytics';
import { ENDPOINT_GROUP_ORDER, primaryEndpoint, suiteOf } from '../reporting/core/catalog';
import type { ReportTest } from '../reporting/core/types';
import { plainEndpoint } from '../reporting/dashboard/src/plain';
import { enrichTests, resolveEndpoints } from '../reporting/generator/build-report-data';
import { listInventory, type InventoryTest } from '../reporting/generator/inventory';
import { parseCollectedRun } from '../reporting/generator/schema';
import { ENDPOINTS } from '../src/clients/endpoints';
import { TEST_CASES, type TestCaseInfo } from '../tests/catalog';

const ROOT = path.resolve(__dirname, '..');
// Preview options (e.g. from demo data into a scratch file): --run <run-data.json> --out <file.xlsx>
const argValue = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i > 0 ? process.argv[i + 1] : undefined;
};
export const TEST_CASES_XLSX = path.join(ROOT, 'docs/test-cases.xlsx');
const SHEET = 'Test Cases';

// ---- Columns -----------------------------------------------------------------------------------------------
const COLUMNS = [
  { key: 'sno', header: 'S/No', width: 6 },
  { key: 'id', header: 'TC ID', width: 14 },
  { key: 'description', header: 'Test Case Description', width: 46 },
  { key: 'why', header: 'Why It Matters', width: 38 },
  { key: 'steps', header: 'Steps', width: 44 },
  { key: 'expected', header: 'Expected Result', width: 40 },
  { key: 'type', header: 'Type', width: 11 },
  { key: 'suite', header: 'Suite', width: 12 },
  { key: 'priority', header: 'Priority', width: 10 },
  { key: 'pre', header: 'Preconditions', width: 28 },
  { key: 'status', header: 'Status', width: 14 },
  { key: 'remarks', header: 'Actual Result / Remarks', width: 32 },
  { key: 'notes', header: 'Tester Notes', width: 26 },
] as const;
type ColKey = (typeof COLUMNS)[number]['key'];
const COLS = COLUMNS.length;
const col = (key: ColKey) => COLUMNS.findIndex((c) => c.key === key) + 1;
const width = (key: ColKey) => COLUMNS[col(key) - 1]!.width;

// ---- Palette ------------------------------------------------------------------------------------------------
const C = {
  navy: 'FF1E293B',
  slate: 'FF334155',
  headerBg: 'FF475569',
  band: 'FF1E3A8A',
  bandSoft: 'FFDBEAFE',
  bandInk: 'FF1E3A8A',
  zebra: 'FFF8FAFC',
  border: 'FFE2E8F0',
  white: 'FFFFFFFF',
  muted: 'FF64748B',
  link: 'FF1D4ED8',
  passBg: 'FFC6EFCE',
  passInk: 'FF006100',
  failBg: 'FFFFC7CE',
  failInk: 'FF9C0006',
  notBg: 'FFE5E7EB',
  notInk: 'FF4B5563',
  warnInk: 'FFB45309',
};
const PRIORITY_INK: Record<string, string> = {
  Critical: 'FFB91C1C',
  High: 'FFC2410C',
  Medium: 'FF1D4ED8',
  Low: 'FF6B7280',
};
const OUTCOME_STYLE: Record<Outcome, { label: string; bg: string; ink: string }> = {
  Pass: { label: '✔ Pass', bg: C.passBg, ink: C.passInk },
  Fail: { label: '✘ Fail', bg: C.failBg, ink: C.failInk },
  'Not Tested': { label: '— Not Tested', bg: C.notBg, ink: C.notInk },
};
const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin' as const, color: { argb: C.border } };
const box = { top: thin, left: thin, bottom: thin, right: thin };

// ---- Last run: Pass / Fail / Not Tested per test -----------------------------------------------------------
interface LastRun {
  byKey: Map<string, ReportTest>;
  label: string | null;
}

function loadLastRun(runData: string | null): LastRun {
  if (!runData || !existsSync(runData)) return { byKey: new Map(), label: null };
  try {
    const run = parseCollectedRun(JSON.parse(readFileSync(runData, 'utf8')), path.relative(ROOT, runData));
    const tests = enrichTests(run);
    const when = new Date(run.run.startedAt);
    const date = Number.isNaN(when.getTime())
      ? run.run.startedAt
      : `${when.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
    const secs = Math.round(run.run.durationMs / 100) / 10;
    const label =
      `Last run: ${date}  ·  environment ${run.run.environment}  ·  ` +
      `${run.run.profile ?? 'all tests'}  ·  took ${secs}s`;
    return { byKey: new Map(tests.map((t) => [t.key, t])), label };
  } catch {
    return { byKey: new Map(), label: null };
  }
}

function outcomeFor(t: InventoryTest, last: LastRun): { outcome: Outcome; remark: string } {
  const ran = last.byKey.get(t.key);
  if (!ran)
    return {
      outcome: 'Not Tested',
      remark: last.label ? 'Not part of the last run' : 'No run recorded yet',
    };
  return testOutcome(ran);
}

// ---- Tester notes carried over from the previous file -------------------------------------------------------
async function previousNotes(file: string | undefined): Promise<Map<string, string>> {
  const notes = new Map<string, string>();
  if (!file || !existsSync(file)) return notes;
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.getWorksheet(SHEET);
    if (!ws) return notes;
    let idCol = 0;
    let notesCol = 0;
    const seen = new Map<string, number>();
    ws.eachRow((row) => {
      const values = row.values as unknown[];
      const idIdx = values.findIndex((v) => v === 'TC ID');
      const notesIdx = values.findIndex((v) => v === 'Tester Notes');
      if (idIdx > 0 && notesIdx > 0) {
        idCol = idIdx;
        notesCol = notesIdx;
        return;
      }
      if (!idCol) return;
      const id = String(row.getCell(idCol).value ?? '').trim();
      if (!/^(PII-[A-Z]+|POC)-\d+[a-z]?$/.test(id)) return;
      const n = (seen.get(id) ?? 0) + 1;
      seen.set(id, n);
      const note = row.getCell(notesCol).text?.trim();
      if (note) notes.set(`${id}#${n}`, note);
    });
  } catch {
    /* unreadable previous file: start fresh */
  }
  return notes;
}

// ---- Layout helpers -----------------------------------------------------------------------------------------
/** Excel does not auto-size wrapped rows in a generated file, so estimate the height from the text. */
function rowHeight(texts: [string, number][]): number {
  let lines = 1;
  for (const [text, w] of texts) {
    const perLine = Math.max(8, Math.floor(w * 1.15));
    const n = text.split('\n').reduce((sum, part) => sum + Math.max(1, Math.ceil(part.length / perLine)), 0);
    lines = Math.max(lines, n);
  }
  return Math.min(409, lines * 15 + 6);
}

function band(ws: ExcelJS.Worksheet, rowNo: number, text: string, bg: string, ink: string, size: number) {
  ws.mergeCells(rowNo, 1, rowNo, COLS);
  const cell = ws.getCell(rowNo, 1);
  cell.value = text;
  cell.font = { bold: true, size, color: { argb: ink } };
  cell.fill = fill(bg);
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
}

// ---- Build ---------------------------------------------------------------------------------------------------
export interface TestCasesWorkbookOptions {
  /** The run to take Pass / Fail / Not Tested from (a collector run-data.json). Missing → all Not Tested. */
  runData: string | null;
  /** An earlier sheet whose Tester Notes are carried over. */
  notesFrom?: string;
  /** Test list; default: read from the code. */
  inventory?: InventoryTest[];
}

/** Builds the styled "Test Cases" workbook and returns it as .xlsx bytes plus a one-line summary. */
export async function buildTestCasesWorkbook(
  opts: TestCasesWorkbookOptions,
): Promise<{ buffer: Buffer; summary: string }> {
  const inventory = opts.inventory ?? listInventory(['api']);
  const last = loadLastRun(opts.runData);
  const notes = await previousNotes(opts.notesFrom);

  const endpointOfTest = (t: InventoryTest) => primaryEndpoint(resolveEndpoints(t.id));
  const byEndpoint = new Map<string, InventoryTest[]>();
  for (const t of inventory) {
    const key = endpointOfTest(t);
    byEndpoint.set(key, [...(byEndpoint.get(key) ?? []), t]);
  }
  // Known endpoints in the guide's order, then any new endpoint found in the tests.
  const known = (ENDPOINT_GROUP_ORDER as readonly string[]).filter((k) => byEndpoint.has(k));
  const extra = [...byEndpoint.keys()].filter((k) => !known.includes(k)).sort();
  const groups = [...known, ...extra].map((key) => {
    const p = plainEndpoint(key);
    const def = ENDPOINTS[key as keyof typeof ENDPOINTS];
    const tests = [...(byEndpoint.get(key) ?? [])].sort(
      (a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }) || a.title.localeCompare(b.title),
    );
    return {
      name: p.name,
      method: def?.method ?? '',
      path: def?.path ?? 'several endpoints',
      means: p.means,
      tests,
      results: tests.map((t) => outcomeFor(t, last)),
    };
  });
  const everyResult = groups.flatMap((g) => g.results);
  const total = everyResult.length;
  const pass = everyResult.filter((r) => r.outcome === 'Pass').length;
  const failN = everyResult.filter((r) => r.outcome === 'Fail').length;
  const notTested = total - pass - failN;
  const rate = (p: number, f: number) => (p + f ? `${Math.round((p / (p + f)) * 1000) / 10}%` : 'N/A');

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PII API automation';
  wb.created = new Date();
  const ws = wb.addWorksheet(SHEET, {
    views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      printTitlesRow: '1:3',
    },
    headerFooter: { oddFooter: '&L&8PII Service — API Test Cases&R&8Page &P of &N' },
  });
  ws.columns = COLUMNS.map((c) => ({ key: c.key, width: c.width }));

  // Rows 1–3: title, last run, totals (frozen at the top while scrolling).
  band(ws, 1, 'PII Service — API Test Cases', C.navy, C.white, 18);
  ws.getRow(1).height = 34;
  band(
    ws,
    2,
    last.label ?? 'No run recorded yet — every test shows Not Tested until the tests are run.',
    C.slate,
    C.white,
    11,
  );
  ws.getRow(2).height = 22;
  const totals: [number, number, string, string, string][] = [
    [1, 3, `Total test cases: ${total}`, C.bandSoft, C.bandInk],
    [4, 5, `✔ Pass: ${pass}`, C.passBg, C.passInk],
    [6, 7, `✘ Fail: ${failN}`, C.failBg, C.failInk],
    [8, 10, `— Not Tested: ${notTested}`, C.notBg, C.notInk],
    [11, 13, `Pass rate of tests run: ${rate(pass, failN)}`, C.bandSoft, C.bandInk],
  ];
  for (const [from, to, text, bg, ink] of totals) {
    ws.mergeCells(3, from, 3, to);
    const cell = ws.getCell(3, from);
    cell.value = text;
    cell.font = { bold: true, size: 12, color: { argb: ink } };
    cell.fill = fill(bg);
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = box;
  }
  ws.getRow(3).height = 26;

  // Summary by endpoint (links are filled in once every section's row is known).
  band(ws, 5, 'SUMMARY BY ENDPOINT', C.band, C.white, 12);
  ws.getRow(5).height = 24;
  const writeCells = (rowNo: number, spec: [number, number, ExcelJS.CellValue][]) => {
    for (const [from, to, value] of spec) {
      if (to > from) ws.mergeCells(rowNo, from, rowNo, to);
      ws.getCell(rowNo, from).value = value;
    }
  };
  writeCells(6, [
    [1, 1, '#'],
    [2, 3, 'Endpoint'],
    [4, 5, 'Method and path'],
    [6, 6, 'Test cases'],
    [7, 7, 'Pass'],
    [8, 8, 'Fail'],
    [9, 9, 'Not Tested'],
    [10, 10, 'Pass rate'],
    [11, 13, 'Go to'],
  ]);
  for (let n = 1; n <= COLS; n += 1) {
    const cell = ws.getCell(6, n);
    cell.font = { bold: true, color: { argb: C.white } };
    cell.fill = fill(C.headerBg);
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = box;
  }
  ws.getRow(6).height = 22;

  const summaryStart = 7;
  let rowNo = summaryStart + groups.length + 2;
  const sectionRows: number[] = [];

  // One section per endpoint.
  groups.forEach((g, gi) => {
    const gPass = g.results.filter((r) => r.outcome === 'Pass').length;
    const gFail = g.results.filter((r) => r.outcome === 'Fail').length;
    const gNot = g.results.length - gPass - gFail;
    sectionRows.push(rowNo);

    ws.mergeCells(rowNo, 1, rowNo, COLS - 1);
    const title = ws.getCell(rowNo, 1);
    title.value =
      `${gi + 1}.  ${g.name}     ${g.method ? `${g.method} ` : ''}${g.path}` +
      `        ${g.tests.length} test cases  ·  ✔ ${gPass}  ·  ✘ ${gFail}  ·  — ${gNot}`;
    title.font = { bold: true, size: 13, color: { argb: C.white } };
    title.fill = fill(C.band);
    title.alignment = { vertical: 'middle', indent: 1 };
    const up = ws.getCell(rowNo, COLS);
    up.value = { text: '↑ Summary', hyperlink: `#'${SHEET}'!A5` };
    up.font = { bold: true, color: { argb: C.white }, underline: true };
    up.fill = fill(C.band);
    up.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(rowNo).height = 28;
    rowNo += 1;

    band(ws, rowNo, g.means ? `What this endpoint does: ${g.means}.` : '', C.bandSoft, C.bandInk, 10);
    ws.getCell(rowNo, 1).font = { italic: true, size: 10, color: { argb: C.bandInk } };
    ws.getRow(rowNo).height = 18;
    rowNo += 1;

    const header = ws.getRow(rowNo);
    COLUMNS.forEach((c, i) => {
      const cell = header.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: C.white } };
      cell.fill = fill(C.headerBg);
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = box;
    });
    header.height = 30;
    rowNo += 1;

    const occurrences = new Map<string, number>();
    g.tests.forEach((t, i) => {
      const info: TestCaseInfo | undefined = TEST_CASES[t.id];
      const result = g.results[i]!;
      const n = (occurrences.get(t.id) ?? 0) + 1;
      occurrences.set(t.id, n);
      const shortTitle = t.title.replace(/^\S+\s/, '');
      const steps = (info?.steps ?? []).map((s, k) => `${k + 1}. ${s}`).join('\n');
      const values: Record<ColKey, ExcelJS.CellValue> = {
        sno: i + 1,
        id: t.id,
        description: {
          richText: [
            { text: shortTitle, font: { bold: true, color: { argb: 'FF0F172A' } } },
            info
              ? { text: `\n${info.what}`, font: { bold: false, color: { argb: 'FF334155' } } }
              : {
                  text: '\n⚠ Description not written yet — add it in tests/catalog',
                  font: { italic: true, color: { argb: C.warnInk } },
                },
          ],
        },
        why: info?.why ?? '',
        steps,
        expected: info?.expected ?? '',
        type: info?.type ?? '',
        suite: suiteOf(t.tags),
        priority: info?.priority ?? '',
        pre: info?.preconditions ?? '',
        status: OUTCOME_STYLE[result.outcome].label,
        remarks: result.remark,
        notes: notes.get(`${t.id}#${n}`) ?? '',
      };
      const row = ws.getRow(rowNo);
      COLUMNS.forEach((c, k) => {
        const cell = row.getCell(k + 1);
        cell.value = values[c.key];
        cell.alignment = {
          vertical: 'top',
          wrapText: true,
          horizontal: ['sno', 'type', 'suite', 'priority', 'status'].includes(c.key) ? 'center' : 'left',
        };
        cell.border = box;
        if (i % 2 === 1) cell.fill = fill(C.zebra);
      });
      row.getCell(col('id')).font = { name: 'Menlo', size: 10, bold: true };
      row.getCell(col('suite')).font =
        suiteOf(t.tags) === 'Smoke'
          ? { bold: true, color: { argb: 'FF6D28D9' } }
          : { color: { argb: C.muted } };
      row.getCell(col('why')).font = { color: { argb: C.slate } };
      const st = row.getCell(col('status'));
      st.fill = fill(OUTCOME_STYLE[result.outcome].bg);
      st.font = { bold: true, color: { argb: OUTCOME_STYLE[result.outcome].ink } };
      row.getCell(col('priority')).font = {
        bold: info?.priority === 'Critical' || info?.priority === 'High',
        color: { argb: PRIORITY_INK[info?.priority ?? ''] ?? C.muted },
      };
      row.getCell(col('remarks')).font =
        result.outcome === 'Fail'
          ? { bold: true, color: { argb: C.failInk } }
          : { italic: true, color: { argb: C.muted } };
      row.height = rowHeight([
        [`${shortTitle}\n${info?.what ?? ''}`, width('description')],
        [info?.why ?? '', width('why')],
        [steps, width('steps')],
        [info?.expected ?? '', width('expected')],
        [info?.preconditions ?? '', width('pre')],
        [result.remark, width('remarks')],
      ]);
      rowNo += 1;
    });
    rowNo += 1; // gap between sections
  });

  // Summary rows, now that every section's first row is known.
  groups.forEach((g, gi) => {
    const r = summaryStart + gi;
    const gPass = g.results.filter((x) => x.outcome === 'Pass').length;
    const gFail = g.results.filter((x) => x.outcome === 'Fail').length;
    const gNot = g.results.length - gPass - gFail;
    const link = `#'${SHEET}'!A${sectionRows[gi]}`;
    writeCells(r, [
      [1, 1, gi + 1],
      [2, 3, { text: g.name, hyperlink: link }],
      [4, 5, `${g.method ? `${g.method} ` : ''}${g.path}`],
      [6, 6, g.tests.length],
      [7, 7, gPass],
      [8, 8, gFail],
      [9, 9, gNot],
      [10, 10, rate(gPass, gFail)],
      [11, 13, { text: `Go to section ${gi + 1} →`, hyperlink: link }],
    ]);
    ws.getRow(r).height = 20;
    for (let n = 1; n <= COLS; n += 1) {
      const cell = ws.getCell(r, n);
      cell.border = box;
      cell.alignment = { vertical: 'middle', horizontal: n === 2 || n === 4 ? 'left' : 'center' };
      if (gi % 2 === 1) cell.fill = fill(C.zebra);
    }
    ws.getCell(r, 2).font = { bold: true, color: { argb: C.link }, underline: true };
    ws.getCell(r, 4).font = { name: 'Menlo', size: 9, color: { argb: C.muted } };
    ws.getCell(r, 7).font = { bold: true, color: { argb: C.passInk } };
    ws.getCell(r, 8).font = { bold: true, color: { argb: gFail ? C.failInk : C.muted } };
    ws.getCell(r, 9).font = { color: { argb: C.notInk } };
    ws.getCell(r, 11).font = { color: { argb: C.link }, underline: true };
  });

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const summary =
    `${total} test cases in ${groups.length} endpoint sections ` +
    `(Pass ${pass} · Fail ${failN} · Not Tested ${notTested}). ${last.label ?? 'No run recorded yet.'}`;
  return { buffer, summary };
}

async function main() {
  const out = path.resolve(ROOT, argValue('--out') ?? TEST_CASES_XLSX);
  const runData = path.resolve(ROOT, argValue('--run') ?? 'reports/latest/run-data.json');
  const { buffer, summary } = await buildTestCasesWorkbook({ runData, notesFrom: out });
  writeFileSync(out, buffer);
  console.log(`Written ${path.relative(ROOT, out)} — ${summary}`);
}

if (require.main === module) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
