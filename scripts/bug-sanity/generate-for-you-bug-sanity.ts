/**
 * Builds the "For You Bug Sanity" sheet (ClickUp 14zmk4dkx0v) from for-you-bug-sanity.data.ts and adds it to the
 * shared workbook docs/Test cases.xlsx without touching any other sheet (same ZIP-level injection + verification as
 * m2/scripts/generate-manual-cases.ts). A standalone copy is written to docs/For-You-Bug-Sanity.xlsx.
 *
 *   npx tsx scripts/bug-sanity/generate-for-you-bug-sanity.ts            # build, inject, verify, replace workbook
 *   npx tsx scripts/bug-sanity/generate-for-you-bug-sanity.ts --dry-run  # build + verify only
 */
import ExcelJS from 'exceljs';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EDITED, injectSheet, snapshot, verifyPackage } from '../../m2/scripts/lib/xlsx-inject';
import { CASES, type BugCase, type Platform } from './for-you-bug-sanity.data';

const ROOT = path.resolve(__dirname, '..', '..');
const WORKBOOK = path.join(ROOT, 'docs', 'Test cases.xlsx');
const STANDALONE = path.join(ROOT, 'docs', 'For-You-Bug-Sanity.xlsx');
const SHEET = 'For You Bug Sanity';
const DRY_RUN = process.argv.includes('--dry-run');

const STATUSES = ['Pass', 'Fail', "Can't Test", 'Not Required', 'Test Pending'] as const;
const RESULT_COLS: { col: string; p: Platform; label: string }[] = [
  { col: 'L', p: 'A', label: 'Android' },
  { col: 'M', p: 'I', label: 'iOS' },
  { col: 'N', p: 'P', label: 'API' },
  { col: 'O', p: 'D', label: 'DB' },
];
const HEADERS = [
  'S/No',
  'Group',
  'Test Case',
  'Why',
  'Pre-conditions',
  'Steps',
  'Verification Points (UI)',
  'API / DB Check',
  'Expected',
  'Priority',
  'Source',
  'Android Results',
  'IOS Results',
  'API Results',
  'DB Results',
  'Comments',
];
const WIDTHS = [8, 16, 40, 36, 42, 38, 38, 44, 38, 10, 20, 16, 16, 16, 16, 40];

const BLACK = { argb: 'FF000000' };
const THIN = { style: 'thin' as const, color: BLACK };
const BORDER: Partial<ExcelJS.Borders> = { left: THIN, right: THIN, top: THIN, bottom: THIN };
const CENTER: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true };
const LEFT: Partial<ExcelJS.Alignment> = { horizontal: 'left', vertical: 'middle', wrapText: true };
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
const F_LIKELY_FAIL: Partial<ExcelJS.Font> = {
  name: 'Calibri',
  size: 11,
  bold: true,
  color: { argb: 'FFC00000' },
};

const numbered = (items: string[]) =>
  items.length === 1 ? (items[0] ?? '') : items.map((s, i) => `${i + 1}. ${s}`).join('\n');
const result = (c: BugCase, p: Platform) => (c.on.includes(p) ? 'Test Pending' : 'Not Required');

function buildSheet(ws: ExcelJS.Worksheet): number {
  ws.columns = WIDTHS.map((width) => ({ width }));
  ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 2, topLeftCell: 'D3', activeCell: 'D3' }];

  const bold = { name: 'Arial', bold: true, color: BLACK };
  const a1 = ws.getCell('A1');
  a1.value = {
    richText: [
      {
        font: bold,
        text: 'Clickup task - https://app.clickup.com/t/14zmk4dkx0v (For You passed profiles issue)\n',
      },
      {
        font: { name: 'Arial', color: BLACK },
        text:
          'Bug: after a pass reset, previously passed profiles re-appear in For You but still show "Passed" and cannot be commented on.\n' +
          'Fix (backend, develop_new 60cd477 + 70e220f): "Passed" only when user_passes.created_at > last reset (Mongo repeat_pass_shown_partner_ids.updated_at); ' +
          'For You cache cleared on every reset (discovery service). Backend-only → same on Android and iOS. Not on master as of 16-Nov-2026.\n' +
          'Main API: GET /V1/users/fetch_top_matched_profiles → users[].display_message / can_send_comment. Test data: synthetic +91 10xxxxxxxx only (never 106 series), OTP 1234.\n',
      },
      {
        font: bold,
        text: 'Open before testing: how to trigger a pass reset on testa2; is the discovery-service cache clear deployed? Red "Expected" = likely Fail from code — confirm with Dev.',
      },
    ],
  };
  ws.mergeCells('A1:I1');
  a1.fill = fill('FFFFE599');
  a1.alignment = LEFT;
  a1.border = BORDER;
  ws.getRow(1).height = 110;
  for (let c = 10; c <= HEADERS.length; c++) ws.getRow(1).getCell(c).fill = fill('FFFFE599');

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
  CASES.forEach((c, i) => {
    if (c.group !== prev) {
      band = (band + 1) % BANDS.length;
      prev = c.group;
    }
    const b = BANDS[band] ?? BANDS[0]!;
    const likelyFail = /likely FAIL|possible FAIL/.test(c.expected);
    const values = [
      i + 1,
      c.group,
      c.title,
      c.why,
      numbered(c.pre),
      numbered(c.steps),
      numbered(c.verify),
      c.check,
      c.expected,
      c.priority,
      c.source,
      ...RESULT_COLS.map(({ p }) => result(c, p)),
      c.comment ?? 'N/A',
    ];
    const row = ws.getRow(3 + i);
    values.forEach((v, j) => {
      const col = j + 1;
      const cell = row.getCell(col);
      const isResult = col >= 12 && col <= 15;
      cell.value = v;
      cell.border = BORDER;
      cell.alignment = col >= 4 && col <= 9 ? LEFT : CENTER;
      cell.fill = fill(col === 1 || isResult ? b.key : b.main);
      cell.font =
        col <= 2
          ? F_KEY
          : col === 3
            ? F_TITLE
            : isResult
              ? F_RESULT
              : col === 9 && likelyFail
                ? F_LIKELY_FAIL
                : F_TEXT;
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
  const last = 2 + CASES.length;

  // ---- Summary ----
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
  const num = (cell: ExcelJS.Cell, formula: string, res: number) => {
    cell.value = { formula, result: res };
    cell.font = F_TEXT;
    cell.border = BORDER;
    cell.alignment = CENTER;
  };
  let r = last + 3;
  const t = ws.getCell(`A${r}`);
  t.value = 'Summary — For You Bug Sanity (counts update live as the result columns are filled)';
  ws.mergeCells(`A${r}:I${r}`);
  t.fill = fill('FFFFE599');
  t.font = bold;
  t.alignment = CENTER;
  t.border = BORDER;
  r += 2;

  for (const [title, colLetter, keys] of [
    ['Group', 'B', [...new Set(CASES.map((c) => c.group))]],
    ['Priority', 'J', ['P0', 'P1', 'P2']],
  ] as const) {
    head(ws.getCell(`C${r}`), title);
    head(ws.getCell(`D${r}`), 'Cases');
    r++;
    const start = r;
    for (const k of keys) {
      label(ws.getCell(`C${r}`), k);
      const n = CASES.filter((c) => (title === 'Group' ? c.group : c.priority) === k).length;
      num(ws.getCell(`D${r}`), `COUNTIF($${colLetter}$${first}:$${colLetter}$${last},C${r})`, n);
      r++;
    }
    label(ws.getCell(`C${r}`), 'Total');
    num(ws.getCell(`D${r}`), `SUM(D${start}:D${r - 1})`, CASES.length);
    r += 2;
  }

  head(ws.getCell(`K${r}`), 'Platform / status');
  RESULT_COLS.forEach(({ col, label: l }) => head(ws.getCell(`${col}${r}`), l));
  r++;
  const rng = (col: string) => `${col}$${first}:${col}$${last}`;
  const count = (p: Platform, s: string) => CASES.filter((c) => result(c, p) === s).length;
  label(ws.getCell(`K${r}`), 'Applicable');
  RESULT_COLS.forEach(({ col, p }) =>
    num(
      ws.getCell(`${col}${r}`),
      `COUNTA(${rng(col)})-COUNTIF(${rng(col)},"Not Required")`,
      CASES.length - count(p, 'Not Required'),
    ),
  );
  const applicable = r;
  r++;
  let passRow = r;
  for (const s of STATUSES) {
    if (s === 'Pass') passRow = r;
    label(ws.getCell(`K${r}`), s);
    RESULT_COLS.forEach(({ col, p }) =>
      num(ws.getCell(`${col}${r}`), `COUNTIF(${rng(col)},"${s}")`, count(p, s)),
    );
    r++;
  }
  label(ws.getCell(`K${r}`), 'Pass % of applicable');
  RESULT_COLS.forEach(({ col }) =>
    num(
      ws.getCell(`${col}${r}`),
      `IF(${col}${applicable}=0,0,ROUND(${col}${passRow}/${col}${applicable}*100,1))`,
      0,
    ),
  );
  return last;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(SHEET);
  const lastDataRow = buildSheet(ws);
  const sheetBuf = Buffer.from(await wb.xlsx.writeBuffer());
  writeFileSync(STANDALONE, sheetBuf);
  console.log(`Standalone sheet: ${path.relative(ROOT, STANDALONE)} (${CASES.length} cases)`);

  const origBuf = readFileSync(WORKBOOK);
  const before = await snapshot(origBuf);
  before.delete(SHEET);
  const { buf, sheetPart, added, replaced } = await injectSheet(origBuf, sheetBuf, SHEET);
  const pkg = await verifyPackage(origBuf, buf, sheetPart, added);
  const after = await snapshot(buf);
  const problems = [...pkg.problems];
  for (const [name, sig] of before) {
    const now = after.get(name);
    if (!now) problems.push(`sheet missing after injection: ${name}`);
    else if (JSON.stringify(now) !== JSON.stringify(sig)) problems.push(`sheet changed: ${name}`);
  }
  const check = new ExcelJS.Workbook();
  await check.xlsx.load(buf as unknown as ArrayBuffer);
  const newWs = check.getWorksheet(SHEET);
  if (!newWs) problems.push('new sheet not readable');
  else if (newWs.getCell(`C${lastDataRow}`).value !== CASES[CASES.length - 1]?.title)
    problems.push('new sheet content mismatch');
  if (check.worksheets.length !== before.size + 1) problems.push('sheet count mismatch');

  console.log(
    `Package: ${pkg.identical}/${pkg.totalOrig - EDITED.length} untouched parts byte-identical; ${pkg.xmlChecked}; ` +
      `existing sheets compared: ${before.size}; ${replaced ? 'replaced' : 'added'} ${sheetPart}`,
  );
  if (problems.length) {
    console.error('VERIFICATION FAILED — workbook NOT modified:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  if (DRY_RUN) return console.log('Dry run: verification passed; workbook not modified.');
  const tmp = path.join(mkdtempSync(path.join(os.tmpdir(), 'fy-sanity-')), 'Test cases.xlsx');
  writeFileSync(tmp, buf);
  copyFileSync(tmp, WORKBOOK);
  if (!readFileSync(WORKBOOK).equals(buf))
    throw new Error('Written workbook differs from the verified buffer');
  console.log(`Verification passed; ${path.relative(ROOT, WORKBOOK)} updated (sheet "${SHEET}").`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
