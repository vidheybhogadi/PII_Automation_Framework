/**
 * Builds the manual milestone test-case sheets (procedure confirmed with Dev 2026-10-29) and puts them into the shared
 * workbook docs/Test cases.xlsx without touching any other sheet:
 *
 *   PII M2 FirstName · PII M3 Email · PII M4 Phone · PII M5 FreeText   (data: m2/scripts/milestone-cases/*.data.ts)
 *
 *   npx tsx m2/scripts/generate-milestone-cases.ts               # build, inject, verify, then replace the workbook
 *   npx tsx m2/scripts/generate-milestone-cases.ts --dry-run     # build + verify only (workbook not modified)
 *   npx tsx m2/scripts/generate-milestone-cases.ts --out x.xlsx  # build + verify, write the result to x.xlsx instead
 *
 * A standalone copy with the four sheets is written to docs/PII-Milestone-Cases.xlsx. Injection and verification
 * (ZIP-level, every other part byte-identical, every existing sheet unchanged) are in m2/scripts/lib/xlsx-inject.ts.
 * The older "PII M2 Cases" sheet stays as history (m2/scripts/generate-manual-cases.ts).
 */
import ExcelJS from 'exceljs';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EDITED, injectSheet, snapshot, verifyPackage } from './lib/xlsx-inject';
import { CASES as M2 } from './milestone-cases/m2-first-name.data';
import { CASES as M3 } from './milestone-cases/m3-email.data';
import { CASES as M4 } from './milestone-cases/m4-phone.data';
import { CASES as M5 } from './milestone-cases/m5-free-text.data';
import { KINDS, MODULES, type MilestoneCase, type Platform } from './milestone-cases/types';

const ROOT = path.resolve(__dirname, '..', '..');
const WORKBOOK = path.join(ROOT, 'docs', 'Test cases.xlsx');
const STANDALONE = path.join(ROOT, 'docs', 'PII-Milestone-Cases.xlsx');
const DRY_RUN = process.argv.includes('--dry-run');
const OUT = process.argv.includes('--out')
  ? path.resolve(process.argv[process.argv.indexOf('--out') + 1] ?? 'out.xlsx')
  : undefined;

const SHEETS: { name: string; milestone: string; field: string; cases: MilestoneCase[] }[] = [
  { name: 'PII M2 FirstName', milestone: 'M2', field: 'First name', cases: M2 },
  { name: 'PII M3 Email', milestone: 'M3', field: 'Email', cases: M3 },
  { name: 'PII M4 Phone', milestone: 'M4', field: 'Phone number', cases: M4 },
  { name: 'PII M5 FreeText', milestone: 'M5', field: 'Free text', cases: M5 },
];

const STATUSES = ['Pass', 'Fail', 'Blocked', "Can't Test", 'Not Required', 'Test Pending'] as const;
const RESULT_COLS: { col: string; p: Platform; label: string }[] = [
  { col: 'L', p: 'A', label: 'Android' },
  { col: 'M', p: 'I', label: 'iOS' },
  { col: 'N', p: 'W', label: 'Web' },
  { col: 'O', p: 'C', label: 'CMS' },
  { col: 'P', p: 'D', label: 'DB' },
  { col: 'Q', p: 'R', label: 'Redis' },
];
const FIRST_RESULT = 12;
const LAST_RESULT = 17;
const HEADERS = [
  'S/No',
  'Module',
  'Sub-area',
  'Test Case',
  'Why',
  'Steps',
  'Verification Points',
  'Expected',
  'Priority',
  'Suite',
  'Type',
  'Android Results',
  'IOS Results',
  'Web Results',
  'CMS Results',
  'DB Results',
  'Redis Results',
  'Comments',
];
const WIDTHS = [8, 16, 18, 40, 34, 44, 38, 36, 9, 11, 12, 15, 15, 15, 15, 15, 15, 44];
const WEB_NOTE = 'Web: web app URL / login not available (UI notes #6).';

// ---- Styles (same look as the "PII - FirstName Smoke" / "PII M2 Cases" sheets) --------------------------------
const BLACK = { argb: 'FF000000' };
const THIN = { style: 'thin' as const, color: BLACK };
const BORDER: Partial<ExcelJS.Borders> = { left: THIN, right: THIN, top: THIN, bottom: THIN };
const CENTER: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true };
const fill = (argb: string): ExcelJS.Fill => ({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb },
  bgColor: { argb },
});
const BANDS = [
  { main: 'FFDDEBF7', key: 'FFDDEBF7' },
  { main: 'FFE2F0D9', key: 'FFD9EAD3' },
];
const F_KEY: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF17365D' } };
const F_TITLE: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11, bold: true, color: BLACK };
const F_TEXT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11, color: BLACK };
const F_RESULT: Partial<ExcelJS.Font> = { name: 'Arial', color: { theme: 1 } };
const F_HEAD: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };

const numbered = (items: string[]) =>
  items.length === 1 ? (items[0] ?? '') : items.map((s, i) => `${i + 1}. ${s}`).join('\n ');

function resultsFor(c: MilestoneCase): Record<Platform, string> {
  const out = {} as Record<Platform, string>;
  for (const { p } of RESULT_COLS) {
    if (!c.on.includes(p)) out[p] = 'Not Required';
    else if (c.blocked?.includes(p)) out[p] = 'Blocked';
    else if (p === 'W') out[p] = "Can't Test";
    else out[p] = 'Test Pending';
  }
  return out;
}

function commentFor(c: MilestoneCase): string {
  const parts = [c.comment, c.on.includes('W') && !c.blocked?.includes('W') ? WEB_NOTE : undefined].filter(
    Boolean,
  );
  return parts.length ? parts.join('\n') : 'N/A';
}

/** Data must follow the module order (the sheet groups by it). */
function checkOrder(name: string, cases: MilestoneCase[]): string[] {
  const problems: string[] = [];
  let last = -1;
  cases.forEach((c, i) => {
    const idx = MODULES.indexOf(c.module);
    if (idx < 0) problems.push(`${name} #${i + 1}: unknown module "${c.module}"`);
    if (idx < last) problems.push(`${name} #${i + 1}: module "${c.module}" out of order`);
    last = Math.max(last, idx);
    if (!c.on || /[^AIWCDR]/.test(c.on)) problems.push(`${name} #${i + 1}: bad "on" value "${c.on}"`);
    if (c.blocked && [...c.blocked].some((p) => !c.on.includes(p)))
      problems.push(`${name} #${i + 1}: blocked "${c.blocked}" not within on "${c.on}"`);
    if (!KINDS.includes(c.kind)) problems.push(`${name} #${i + 1}: bad type "${c.kind}"`);
    if (!c.title || !c.steps.length || !c.verify.length || !c.expected)
      problems.push(`${name} #${i + 1}: missing title/steps/verify/expected`);
  });
  return problems;
}

// ---- Build one sheet -----------------------------------------------------------------------------------------
function buildSheet(ws: ExcelJS.Worksheet, s: (typeof SHEETS)[number]): { lastDataRow: number } {
  const cases = s.cases;
  ws.properties.defaultRowHeight = 15.75;
  ws.columns = WIDTHS.map((width) => ({ width }));
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2, topLeftCell: 'A3', activeCell: 'A3' }];

  const a1 = ws.getCell('A1');
  const bold = { name: 'Arial', bold: true, color: BLACK };
  a1.value = {
    richText: [
      { font: bold, text: 'PRD- \nFigma- \nClickup task - https://app.clickup.com/t/86d3yjxhh\n' },
      {
        font: bold,
        text:
          `Scope: PII ${s.milestone} — ${s.field}, on testa2 (procedure confirmed with Dev 29-Oct-2026). Modules in order: ` +
          `${MODULES.join(' → ')}.\n` +
          'Flow: writes → Aisle DB + PII DB; reads ON → Redis cache → PII service on a miss.\n' +
          'Test data: synthetic +91 10xxxxxxxx accounts only (never the 106 series), OTP 1234, emails @example.com.\n',
      },
      { font: bold, text: 'Scroll Down to see the summary of this sheet' },
    ],
  };
  ws.mergeCells('A1:E1');
  a1.fill = fill('FFFFE599');
  a1.font = bold;
  a1.border = { left: THIN, top: THIN, bottom: THIN };
  a1.alignment = CENTER;
  ws.getRow(1).height = 110;
  for (let c = 6; c <= HEADERS.length; c++) {
    const cell = ws.getRow(1).getCell(c);
    cell.fill = fill('FFFFE599');
    cell.font = { name: 'Arial', color: { theme: 1 } };
  }

  HEADERS.forEach((h, i) => {
    const cell = ws.getRow(2).getCell(i + 1);
    cell.value = h;
    cell.fill = fill('FF2F75B5');
    cell.font = F_HEAD;
    cell.border = BORDER;
    cell.alignment = CENTER;
  });

  let band = -1;
  let prev = '';
  cases.forEach((c, i) => {
    if (c.module !== prev) {
      band = (band + 1) % BANDS.length;
      prev = c.module;
    }
    const b = BANDS[band] ?? BANDS[0]!;
    const res = resultsFor(c);
    const row = ws.getRow(3 + i);
    const values: (string | number)[] = [
      i + 1,
      c.module,
      c.area,
      c.title,
      c.why,
      numbered(c.steps),
      numbered(c.verify),
      c.expected,
      c.priority,
      c.suite,
      c.kind,
      ...RESULT_COLS.map(({ p }) => res[p]),
      commentFor(c),
    ];
    values.forEach((v, j) => {
      const cell = row.getCell(j + 1);
      const col = j + 1;
      const isResult = col >= FIRST_RESULT && col <= LAST_RESULT;
      cell.value = v;
      cell.border = BORDER;
      cell.alignment = CENTER;
      cell.fill = fill(col === 1 || isResult ? b.key : b.main);
      cell.font = col <= 3 ? F_KEY : col === 4 ? F_TITLE : isResult ? F_RESULT : F_TEXT;
      if (isResult) {
        cell.dataValidation = {
          type: 'list',
          allowBlank: true,
          showErrorMessage: true,
          formulae: [`"${STATUSES.join(',')}"`],
        };
      }
    });
  });
  const first = 3;
  const last = 2 + cases.length;

  // ---- Summary block ----
  const head = (cell: ExcelJS.Cell, v: string) => {
    cell.value = v;
    cell.fill = fill('FF2F75B5');
    cell.font = F_HEAD;
    cell.border = BORDER;
    cell.alignment = CENTER;
  };
  const label = (cell: ExcelJS.Cell, v: string) => {
    cell.value = v;
    cell.fill = fill('FFDDEBF7');
    cell.font = F_KEY;
    cell.border = BORDER;
    cell.alignment = CENTER;
  };
  const num = (cell: ExcelJS.Cell, formula: string, result: number) => {
    cell.value = { formula, result };
    cell.font = F_TEXT;
    cell.border = BORDER;
    cell.alignment = CENTER;
  };
  const countTable = (
    r: number,
    title: string,
    col: string,
    keys: readonly string[],
    of: (c: MilestoneCase) => string,
  ) => {
    head(ws.getCell(`D${r}`), title);
    head(ws.getCell(`E${r}`), 'Cases');
    r++;
    const start = r;
    for (const k of keys) {
      label(ws.getCell(`D${r}`), k);
      num(
        ws.getCell(`E${r}`),
        `COUNTIF($${col}$${first}:$${col}$${last},D${r})`,
        cases.filter((c) => of(c) === k).length,
      );
      r++;
    }
    label(ws.getCell(`D${r}`), 'Total');
    num(ws.getCell(`E${r}`), `SUM(E${start}:E${r - 1})`, cases.length);
    return r + 2;
  };

  let r = last + 3;
  const title = ws.getCell(`A${r}`);
  title.value = `Summary — PII ${s.milestone} ${s.field} (counts update live as the result columns are filled)`;
  ws.mergeCells(`A${r}:H${r}`);
  title.fill = fill('FFFFE599');
  title.font = { name: 'Arial', bold: true, color: BLACK };
  title.alignment = CENTER;
  title.border = BORDER;
  r += 2;
  const modules = MODULES.filter((m) => cases.some((c) => c.module === m));
  r = countTable(r, 'Module', 'B', modules, (c) => c.module);
  r = countTable(r, 'Priority', 'I', ['P0', 'P1', 'P2'], (c) => c.priority);
  r = countTable(r, 'Suite', 'J', ['Smoke', 'Sanity', 'Regression'], (c) => c.suite);
  r = countTable(r, 'Type', 'K', KINDS, (c) => c.kind);

  head(ws.getCell(`J${r}`), 'Platform / status');
  RESULT_COLS.forEach(({ col, label: l }) => head(ws.getCell(`${col}${r}`), l));
  r++;
  const all = cases.map(resultsFor);
  const count = (p: Platform, st: string) => all.filter((x) => x[p] === st).length;
  const rng = (col: string) => `${col}$${first}:${col}$${last}`;
  label(ws.getCell(`J${r}`), 'Applicable (not "Not Required")');
  RESULT_COLS.forEach(({ col, p }) =>
    num(
      ws.getCell(`${col}${r}`),
      `COUNTA(${rng(col)})-COUNTIF(${rng(col)},"Not Required")`,
      cases.length - count(p, 'Not Required'),
    ),
  );
  const applicableRow = r;
  r++;
  const statusRow: Record<string, number> = {};
  for (const st of STATUSES) {
    label(ws.getCell(`J${r}`), st);
    statusRow[st] = r;
    RESULT_COLS.forEach(({ col, p }) =>
      num(ws.getCell(`${col}${r}`), `COUNTIF(${rng(col)},"${st}")`, count(p, st)),
    );
    r++;
  }
  label(ws.getCell(`J${r}`), 'Pass % of applicable');
  RESULT_COLS.forEach(({ col }) =>
    num(
      ws.getCell(`${col}${r}`),
      `IF(${col}${applicableRow}=0,0,ROUND(${col}${statusRow.Pass}/${col}${applicableRow}*100,1))`,
      0,
    ),
  );
  return { lastDataRow: last };
}

async function main() {
  const orderProblems = SHEETS.flatMap((s) => checkOrder(s.name, s.cases));
  if (orderProblems.length) {
    console.error('Data problems:\n  ' + orderProblems.join('\n  '));
    process.exit(1);
  }

  // 1. Standalone workbook with all four sheets.
  const standalone = new ExcelJS.Workbook();
  for (const s of SHEETS) buildSheet(standalone.addWorksheet(s.name), s);
  writeFileSync(STANDALONE, Buffer.from(await standalone.xlsx.writeBuffer()));
  console.log(
    `Standalone: ${path.relative(ROOT, STANDALONE)} — ` +
      SHEETS.map((s) => `${s.name}: ${s.cases.length}`).join(', '),
  );

  // 2. Inject each sheet into the original package, verifying every step.
  if (!existsSync(WORKBOOK)) throw new Error(`Workbook not found: ${WORKBOOK}`);
  const origBuf = readFileSync(WORKBOOK);
  const names = new Set(SHEETS.map((s) => s.name));
  const before = await snapshot(origBuf);
  for (const n of names) before.delete(n);
  const problems: string[] = [];
  const built: Record<string, number> = {};
  let buf: Buffer = origBuf;
  for (const s of SHEETS) {
    const wb = new ExcelJS.Workbook();
    built[s.name] = buildSheet(wb.addWorksheet(s.name), s).lastDataRow;
    const sheetBuf = Buffer.from(await wb.xlsx.writeBuffer());
    const step = await injectSheet(buf, sheetBuf, s.name);
    const pkg = await verifyPackage(buf, step.buf, step.sheetPart, step.added);
    problems.push(...pkg.problems.map((p) => `${s.name}: ${p}`));
    console.log(
      `${s.name}: ${pkg.identical}/${pkg.totalOrig - EDITED.length} untouched parts byte-identical; ${pkg.xmlChecked}; ` +
        `${step.replaced ? 'replaced' : 'added'} ${step.sheetPart}`,
    );
    buf = step.buf;
  }

  // 3. Every original sheet unchanged; the new sheets readable with the expected rows.
  const after = await snapshot(buf);
  for (const [name, sig] of before) {
    const now = after.get(name);
    if (!now) problems.push(`sheet missing after injection: ${name}`);
    else if (JSON.stringify(now) !== JSON.stringify(sig)) problems.push(`sheet changed: ${name}`);
  }
  const check = new ExcelJS.Workbook();
  await check.xlsx.load(buf as unknown as ArrayBuffer);
  for (const s of SHEETS) {
    const ws = check.getWorksheet(s.name);
    if (!ws) problems.push(`${s.name}: not readable`);
    else if (ws.getCell(`D${built[s.name]}`).value !== s.cases[s.cases.length - 1]?.title)
      problems.push(`${s.name}: content mismatch`);
  }
  if (check.worksheets.length !== before.size + SHEETS.length) problems.push('sheet count mismatch');
  console.log(`Existing sheets compared: ${before.size}`);

  if (problems.length) {
    console.error('VERIFICATION FAILED — workbook NOT modified:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  if (DRY_RUN) {
    console.log('Dry run: verification passed; workbook not modified.');
    return;
  }
  if (OUT) {
    writeFileSync(OUT, buf);
    console.log(`Verification passed; written to ${OUT} (workbook not modified).`);
    return;
  }
  const tmp = path.join(mkdtempSync(path.join(os.tmpdir(), 'pii-ms-')), 'Test cases.xlsx');
  writeFileSync(tmp, buf);
  copyFileSync(tmp, WORKBOOK);
  if (!readFileSync(WORKBOOK).equals(buf))
    throw new Error('Written workbook differs from the verified buffer');
  console.log(
    `Verification passed; ${path.relative(ROOT, WORKBOOK)} updated (${SHEETS.map((s) => s.name).join(', ')}).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
