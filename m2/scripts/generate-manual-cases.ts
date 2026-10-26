/**
 * Builds the manual M2 test-case sheet "PII M2 Cases" from m2/scripts/manual-cases.data.ts and puts it into the shared
 * workbook docs/Test cases.xlsx without touching any other sheet.
 *
 *   npx tsx m2/scripts/generate-manual-cases.ts            # build, inject, verify, then replace the workbook
 *   npx tsx m2/scripts/generate-manual-cases.ts --dry-run  # build + verify only (writes nothing into the workbook)
 *   npx tsx m2/scripts/generate-manual-cases.ts --out x.xlsx  # build + verify, write the result to x.xlsx instead
 *
 * Why ZIP-level injection: the workbook (~100 sheets, Google Sheets export) has drawings, VML, legacy and threaded
 * comments, document tasks and persons. ExcelJS drops those parts on a round trip, so it is used ONLY to build the new
 * sheet in a standalone file (docs/PII-M2-Manual-Cases.xlsx). The sheet XML is then copied into the original package
 * with JSZip: its styles are appended to styles.xml (existing entries untouched, indexes remapped), shared strings are
 * turned into inline strings, and workbook.xml / workbook.xml.rels / [Content_Types].xml get one entry each. Every
 * other part stays byte-for-byte identical. If "PII M2 Cases" already exists, only its sheet part is replaced.
 *
 * Verification before the original is replaced (any failure → original left untouched, exit code 1):
 *   1. every original ZIP part is present; all parts except the four edited ones are byte-identical;
 *   2. the edited XML parts equal the original once the added entries are removed (styles: original lists are an
 *      unchanged prefix); xmllint --noout passes on the edited parts and the new sheet (when xmllint exists);
 *   3. ExcelJS reloads the result; every existing sheet has the same name, dimensions, cell values, merges,
 *      data-validation count, column widths and style hash as before; the new sheet has the expected rows.
 */
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CASES, type ManualCase, type Platform } from './manual-cases.data';

const ROOT = path.resolve(__dirname, '..', '..');
const WORKBOOK = path.join(ROOT, 'docs', 'Test cases.xlsx');
const STANDALONE = path.join(ROOT, 'docs', 'PII-M2-Manual-Cases.xlsx');
const SHEET = 'PII M2 Cases';
const DRY_RUN = process.argv.includes('--dry-run');
/** --out <file>: write the verified workbook there instead of replacing docs/Test cases.xlsx (for inspection). */
const OUT = process.argv.includes('--out')
  ? path.resolve(process.argv[process.argv.indexOf('--out') + 1] ?? 'out.xlsx')
  : undefined;

const STATUSES = ['Pass', 'Fail', "Can't Test", 'Not Required', 'Test Pending'] as const;
const RESULT_COLS: { col: string; p: Platform; label: string }[] = [
  { col: 'H', p: 'A', label: 'Android' },
  { col: 'I', p: 'I', label: 'iOS' },
  { col: 'J', p: 'W', label: 'Web' },
  { col: 'K', p: 'C', label: 'CMS' },
  { col: 'L', p: 'D', label: 'DB' },
];
const HEADERS = [
  'S/No',
  'Group',
  'Smoke Case',
  'Why',
  'Steps',
  'Verification Points',
  'Expected',
  'Android Results',
  'IOS Results',
  'Web Results',
  'CMS Results',
  'DB Results',
  'Suite',
  'Comments',
];
// Widths A–G and the first result / Comments columns copied from "PII - FirstName Smoke"; new columns sized alike.
const WIDTHS = [11.38, 14.75, 40.63, 36.25, 41.5, 36.88, 34.5, 17.13, 16.5, 16.5, 16.5, 16.5, 13, 43.63];
const WEB_NOTE = 'Web: web app URL / login not available (UI notes #6).';

// ---- Styles copied from the sample sheet ----------------------------------------------------------------------
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
  { main: 'FFDDEBF7', key: 'FFDDEBF7' }, // blue: every cell
  { main: 'FFE2F0D9', key: 'FFD9EAD3' }, // green: S/No + result columns slightly darker, like the sample
];
const F_KEY: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF17365D' } };
const F_TITLE: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11, bold: true, color: BLACK };
const F_TEXT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11, color: BLACK };
const F_RESULT: Partial<ExcelJS.Font> = { name: 'Arial', color: { theme: 1 } };
const F_HEAD: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };

const numbered = (items: string[]) =>
  items.length === 1 ? (items[0] ?? '') : items.map((s, i) => `${i + 1}. ${s}`).join('\n ');

function resultsFor(c: ManualCase): Record<Platform, string> {
  const out = {} as Record<Platform, string>;
  for (const { p } of RESULT_COLS) {
    if (c.notRequired || !c.on.includes(p)) out[p] = 'Not Required';
    else if (c.cant?.includes(p) || p === 'W') out[p] = "Can't Test";
    else out[p] = 'Test Pending';
  }
  return out;
}

function commentFor(c: ManualCase): string {
  const parts = [c.comment, !c.notRequired && c.on.includes('W') ? WEB_NOTE : undefined].filter(Boolean);
  return parts.length ? parts.join('\n') : 'N/A';
}

// ---- Build the sheet -------------------------------------------------------------------------------------------
function buildSheet(ws: ExcelJS.Worksheet): { lastDataRow: number; rows: number } {
  ws.properties.defaultRowHeight = 15.75;
  ws.columns = WIDTHS.map((width) => ({ width }));
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2, topLeftCell: 'A3', activeCell: 'A3' }];

  // Row 1 — yellow info cell like the sample.
  const a1 = ws.getCell('A1');
  const bold = { name: 'Arial', bold: true, color: BLACK };
  a1.value = {
    richText: [
      { font: bold, text: 'PRD- \nFigma- \nClickup task - https://app.clickup.com/t/86d3yjxhh\n' },
      {
        font: bold,
        text:
          'Scope: PII M2 (First Name, Email, Phone, Free text) on testa2 — today’s state: writes to Aisle DB + PII DB, reads from Aisle DB (read gates OFF).\n' +
          'Test data: synthetic +91 10xxxxxxxx accounts only (never the 106 series), OTP 1234, emails @example.test.\n',
      },
      { font: bold, text: 'Scroll Down to see the summary of this task' },
    ],
  };
  ws.mergeCells('A1:C1');
  a1.fill = fill('FFFFE599');
  a1.font = bold;
  a1.border = { left: THIN, top: THIN, bottom: THIN };
  a1.alignment = CENTER;
  for (let c = 4; c <= HEADERS.length; c++) {
    const cell = ws.getRow(1).getCell(c);
    cell.fill = fill('FFFFE599');
    cell.font = { name: 'Arial', color: { theme: 1 } };
  }

  // Row 2 — header.
  HEADERS.forEach((h, i) => {
    const cell = ws.getRow(2).getCell(i + 1);
    cell.value = h;
    cell.fill = fill('FF2F75B5');
    cell.font = F_HEAD;
    cell.border = BORDER;
    cell.alignment = CENTER;
  });

  // Data rows — colour band alternates per group.
  let band = -1;
  let prevGroup = '';
  CASES.forEach((c, i) => {
    if (c.group !== prevGroup) {
      band = (band + 1) % BANDS.length;
      prevGroup = c.group;
    }
    const b = BANDS[band] ?? BANDS[0]!;
    const res = resultsFor(c);
    const row = ws.getRow(3 + i);
    const values: (string | number)[] = [
      i + 1,
      c.group,
      c.title,
      c.why,
      numbered(c.steps),
      numbered(c.verify),
      c.expected,
      ...RESULT_COLS.map(({ p }) => res[p]),
      c.suite,
      commentFor(c),
    ];
    values.forEach((v, j) => {
      const cell = row.getCell(j + 1);
      const col = j + 1;
      const isResult = col >= 8 && col <= 12;
      cell.value = v;
      cell.border = BORDER;
      cell.alignment = CENTER;
      cell.fill = fill(col === 1 || isResult ? b.key : b.main);
      cell.font = col <= 2 ? F_KEY : col === 3 ? F_TITLE : isResult ? F_RESULT : F_TEXT;
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

  let r = last + 3;
  const title = ws.getCell(`A${r}`);
  title.value = 'Summary — PII M2 Cases (counts update live as the result columns are filled)';
  ws.mergeCells(`A${r}:G${r}`);
  title.fill = fill('FFFFE599');
  title.font = { name: 'Arial', bold: true, color: BLACK };
  title.alignment = CENTER;
  title.border = BORDER;
  r += 2;

  // By group
  head(ws.getCell(`C${r}`), 'Group');
  head(ws.getCell(`D${r}`), 'Cases');
  r++;
  const groups = [...new Set(CASES.map((c) => c.group))];
  const groupStart = r;
  for (const g of groups) {
    label(ws.getCell(`C${r}`), g);
    num(
      ws.getCell(`D${r}`),
      `COUNTIF($B$${first}:$B$${last},C${r})`,
      CASES.filter((c) => c.group === g).length,
    );
    r++;
  }
  label(ws.getCell(`C${r}`), 'Total');
  num(ws.getCell(`D${r}`), `SUM(D${groupStart}:D${r - 1})`, CASES.length);
  r += 2;

  // By suite
  head(ws.getCell(`C${r}`), 'Suite');
  head(ws.getCell(`D${r}`), 'Cases');
  r++;
  const suiteStart = r;
  for (const s of ['Smoke', 'Sanity', 'Regression'] as const) {
    label(ws.getCell(`C${r}`), s);
    num(
      ws.getCell(`D${r}`),
      `COUNTIF($M$${first}:$M$${last},C${r})`,
      CASES.filter((c) => c.suite === s).length,
    );
    r++;
  }
  label(ws.getCell(`C${r}`), 'Total');
  num(ws.getCell(`D${r}`), `SUM(D${suiteStart}:D${r - 1})`, CASES.length);
  r += 2;

  // By platform + live status (labels in G, counts under the matching result columns H–L)
  head(ws.getCell(`G${r}`), 'Platform / status');
  RESULT_COLS.forEach(({ col, label: l }) => head(ws.getCell(`${col}${r}`), l));
  r++;
  const all = CASES.map(resultsFor);
  const count = (p: Platform, s: string) => all.filter((x) => x[p] === s).length;
  const rng = (col: string) => `${col}$${first}:${col}$${last}`;
  label(ws.getCell(`G${r}`), 'Applicable cases (not "Not Required")');
  RESULT_COLS.forEach(({ col, p }) =>
    num(
      ws.getCell(`${col}${r}`),
      `COUNTA(${rng(col)})-COUNTIF(${rng(col)},"Not Required")`,
      CASES.length - count(p, 'Not Required'),
    ),
  );
  const applicableRow = r;
  r++;
  const statusRow: Record<string, number> = {};
  for (const s of STATUSES) {
    label(ws.getCell(`G${r}`), s);
    statusRow[s] = r;
    RESULT_COLS.forEach(({ col, p }) =>
      num(ws.getCell(`${col}${r}`), `COUNTIF(${rng(col)},"${s}")`, count(p, s)),
    );
    r++;
  }
  label(ws.getCell(`G${r}`), 'Total rows');
  RESULT_COLS.forEach(({ col }) => num(ws.getCell(`${col}${r}`), `COUNTA(${rng(col)})`, CASES.length));
  r++;
  label(ws.getCell(`G${r}`), 'Pass % of applicable');
  RESULT_COLS.forEach(({ col }) =>
    num(
      ws.getCell(`${col}${r}`),
      `IF(${col}${applicableRow}=0,0,ROUND(${col}${statusRow.Pass}/${col}${applicableRow}*100,1))`,
      0,
    ),
  );
  return { lastDataRow: last, rows: r };
}

// ---- Snapshot of existing sheets (ExcelJS view) ---------------------------------------------------------------
interface SheetSig {
  name: string;
  dims: string;
  cells: number;
  values: string;
  styles: string;
  merges: string;
  dv: number;
  widths: string;
}

function signature(ws: ExcelJS.Worksheet): SheetSig {
  const hv = createHash('sha256');
  const hs = createHash('sha256');
  let cells = 0;
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    hs.update(`row${r}:${row.height ?? ''}:${row.hidden ? 1 : 0};`);
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      cells++;
      hv.update(`${r},${c}=${JSON.stringify(cell.value)};`);
      hs.update(`${r},${c}=${JSON.stringify(cell.style)};`);
    });
  });
  const dvModel =
    ((ws as unknown as { dataValidations: unknown }).dataValidations as { model: Record<string, unknown> })
      .model ?? {};
  return {
    name: ws.name,
    dims: ws.dimensions?.range ?? '',
    cells,
    values: hv.digest('hex'),
    styles: hs.digest('hex'),
    merges: createHash('sha256')
      .update(JSON.stringify([...(ws.model.merges ?? [])].sort()))
      .digest('hex'),
    dv: Object.keys(dvModel).length,
    widths: JSON.stringify((ws.columns ?? []).map((c) => c.width ?? null)),
  };
}

async function snapshot(buf: Buffer): Promise<Map<string, SheetSig>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return new Map(wb.worksheets.map((ws) => [ws.name, signature(ws)]));
}

// ---- ZIP / XML helpers ----------------------------------------------------------------------------------------
const STYLE_SECTIONS = [
  { tag: 'fonts', child: 'font' },
  { tag: 'fills', child: 'fill' },
  { tag: 'borders', child: 'border' },
  { tag: 'cellXfs', child: 'xf' },
] as const;

function sectionBody(xml: string, tag: string): string {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml);
  if (!m) throw new Error(`styles.xml: <${tag}> not found`);
  return m[1] ?? '';
}
function children(body: string, child: string): string[] {
  return body.match(new RegExp(`<${child}\\b[^>]*/>|<${child}\\b[^>]*>[\\s\\S]*?</${child}>`, 'g')) ?? [];
}
function stripSections(xml: string): string {
  let out = xml;
  for (const { tag } of STYLE_SECTIONS)
    out = out.replace(new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?</${tag}>`), `<${tag}/>`);
  return out;
}

/** Appends the new workbook's fonts / fills / borders / cellXfs to the original styles; returns xf index map. */
function mergeStyles(origXml: string, newXml: string): { xml: string; xfMap: number[] } {
  const maps: Record<string, number[]> = {};
  let xml = origXml;
  for (const { tag, child } of STYLE_SECTIONS) {
    const orig = children(sectionBody(origXml, tag), child);
    let incoming = children(sectionBody(newXml, tag), child);
    if (tag === 'cellXfs') {
      incoming = incoming.map((xf) => {
        const nf = /numFmtId="(\d+)"/.exec(xf);
        if (nf && Number(nf[1]) >= 164)
          throw new Error('Custom number formats are not supported by the injector');
        return xf
          .replace(/fontId="(\d+)"/, (_, n) => `fontId="${maps.fonts?.[Number(n)]}"`)
          .replace(/fillId="(\d+)"/, (_, n) => `fillId="${maps.fills?.[Number(n)]}"`)
          .replace(/borderId="(\d+)"/, (_, n) => `borderId="${maps.borders?.[Number(n)]}"`);
      });
    }
    if (incoming.some((el) => el.includes('="undefined"')))
      throw new Error(`${tag}: unmapped style reference`);
    const added: string[] = [];
    maps[tag] = incoming.map((el) => {
      const existing = orig.indexOf(el);
      if (existing >= 0) return existing;
      const known = added.indexOf(el);
      if (known >= 0) return orig.length + known;
      added.push(el);
      return orig.length + added.length - 1;
    });
    if (added.length) {
      const total = orig.length + added.length;
      xml = xml.replace(`</${tag}>`, `${added.join('')}</${tag}>`);
      xml = xml.replace(new RegExp(`<${tag}(\\s[^>]*?)count="\\d+"`), `<${tag}$1count="${total}"`);
    }
  }
  return { xml, xfMap: maps.cellXfs ?? [] };
}

/** Rewrites the ExcelJS sheet XML for the target package: remapped styles, inline strings, not tab-selected. */
function adaptSheet(sheetXml: string, sst: string, xfMap: number[]): string {
  const sis = (sst.match(/<si>[\s\S]*?<\/si>|<si\/>/g) ?? []).map((si) =>
    si === '<si/>' ? '<t></t>' : si.slice(4, -5),
  );
  const mapS = (s: string) => {
    const v = xfMap[Number(s)];
    if (v === undefined) throw new Error(`Unknown style index ${s}`);
    return String(v);
  };
  let out = sheetXml.replace(/ tabSelected="1"/g, '');
  out = out.replace(/<col\b[^>]*>/g, (tag) => tag.replace(/ style="(\d+)"/, (_, s) => ` style="${mapS(s)}"`));
  out = out.replace(/<row\b[^>]*>/g, (tag) => tag.replace(/ s="(\d+)"/, (_, s) => ` s="${mapS(s)}"`));
  out = out.replace(
    /<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g,
    (_all, attrs: string, _end: string, inner?: string) => {
      let a = attrs.replace(/ s="(\d+)"/, (_m, s) => ` s="${mapS(s)}"`);
      if (/ t="s"/.test(a) && inner !== undefined) {
        const idx = Number(/<v>(\d+)<\/v>/.exec(inner)?.[1]);
        if (Number.isNaN(idx) || sis[idx] === undefined) throw new Error('Shared string not found');
        a = a.replace(/ t="s"/, ' t="inlineStr"');
        return `<c${a}><is>${sis[idx]}</is></c>`;
      }
      return inner === undefined ? `<c${a}/>` : `<c${a}>${inner}</c>`;
    },
  );
  return out;
}

const EDITED = ['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', '[Content_Types].xml', 'xl/styles.xml'];

async function inject(origBuf: Buffer, sheetBuf: Buffer) {
  const orig = await JSZip.loadAsync(origBuf);
  const src = await JSZip.loadAsync(sheetBuf);
  const read = async (z: JSZip, p: string) => {
    const f = z.file(p);
    if (!f) throw new Error(`Missing part ${p}`);
    return f.async('string');
  };
  const workbook = await read(orig, 'xl/workbook.xml');
  const rels = await read(orig, 'xl/_rels/workbook.xml.rels');
  const types = await read(orig, '[Content_Types].xml');
  const styles = mergeStyles(await read(orig, 'xl/styles.xml'), await read(src, 'xl/styles.xml'));
  const sst = src.file('xl/sharedStrings.xml') ? await read(src, 'xl/sharedStrings.xml') : '';
  const sheetXml = adaptSheet(await read(src, 'xl/worksheets/sheet1.xml'), sst, styles.xfMap);

  const added: Record<string, string> = {};
  let sheetPart: string;
  const existing = new RegExp(`<sheet\\b[^>]*name="${SHEET}"[^>]*/>`).exec(workbook);
  if (existing) {
    const rid = /r:id="([^"]+)"/.exec(existing[0])?.[1];
    const target = new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*/>`).exec(rels)?.[0];
    const t = target && /Target="([^"]+)"/.exec(target)?.[1];
    if (!t) throw new Error(`Cannot resolve the part of the existing "${SHEET}" sheet`);
    sheetPart = t.startsWith('/') ? t.slice(1) : `xl/${t}`;
    orig.file('xl/workbook.xml', workbook); // unchanged
  } else {
    const nums = Object.keys(orig.files)
      .map((f) => /^xl\/worksheets\/sheet(\d+)\.xml$/.exec(f)?.[1])
      .filter(Boolean)
      .map(Number);
    const n = Math.max(0, ...nums) + 1;
    sheetPart = `xl/worksheets/sheet${n}.xml`;
    const sheetId = Math.max(0, ...[...workbook.matchAll(/sheetId="(\d+)"/g)].map((m) => Number(m[1]))) + 1;
    let rid = 'rIdPiiM2Cases';
    while (rels.includes(`Id="${rid}"`)) rid += 'X';
    added['xl/workbook.xml'] = `<sheet state="visible" name="${SHEET}" sheetId="${sheetId}" r:id="${rid}"/>`;
    added['xl/_rels/workbook.xml.rels'] =
      `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`;
    added['[Content_Types].xml'] =
      `<Override ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml" PartName="/${sheetPart}"/>`;
    orig.file('xl/workbook.xml', workbook.replace('</sheets>', `${added['xl/workbook.xml']}</sheets>`));
    orig.file(
      'xl/_rels/workbook.xml.rels',
      rels.replace('</Relationships>', `${added['xl/_rels/workbook.xml.rels']}</Relationships>`),
    );
    orig.file('[Content_Types].xml', types.replace('</Types>', `${added['[Content_Types].xml']}</Types>`));
  }
  orig.file('xl/styles.xml', styles.xml);
  orig.file(sheetPart, sheetXml);
  const buf = await orig.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return { buf, sheetPart, added, replaced: Boolean(existing) };
}

// ---- Verification ---------------------------------------------------------------------------------------------
async function verifyPackage(
  origBuf: Buffer,
  newBuf: Buffer,
  sheetPart: string,
  added: Record<string, string>,
) {
  const problems: string[] = [];
  const a = await JSZip.loadAsync(origBuf);
  const b = await JSZip.loadAsync(newBuf);
  const aParts = Object.keys(a.files).filter((f) => !a.files[f]?.dir);
  const bParts = new Set(Object.keys(b.files).filter((f) => !b.files[f]?.dir));
  let identical = 0;
  for (const p of aParts) {
    if (!bParts.has(p)) {
      problems.push(`missing part ${p}`);
      continue;
    }
    if (EDITED.includes(p) || p === sheetPart) continue;
    const [x, y] = await Promise.all([a.file(p)!.async('nodebuffer'), b.file(p)!.async('nodebuffer')]);
    if (x.equals(y)) identical++;
    else problems.push(`part changed: ${p}`);
  }
  const extra = [...bParts].filter((p) => !aParts.includes(p));
  if (extra.some((p) => p !== sheetPart)) problems.push(`unexpected new parts: ${extra.join(', ')}`);

  for (const p of EDITED.filter((e) => e !== 'xl/styles.xml')) {
    const [x, y] = await Promise.all([a.file(p)!.async('string'), b.file(p)!.async('string')]);
    if ((added[p] ? y.replace(added[p], '') : y) !== x) problems.push(`${p}: differs beyond the added entry`);
  }
  const [sx, sy] = await Promise.all([
    a.file('xl/styles.xml')!.async('string'),
    b.file('xl/styles.xml')!.async('string'),
  ]);
  for (const { tag, child } of STYLE_SECTIONS) {
    const o = children(sectionBody(sx, tag), child);
    const n = children(sectionBody(sy, tag), child);
    if (o.some((el, i) => n[i] !== el)) problems.push(`styles.xml <${tag}>: original entries changed`);
  }
  if (stripSections(sx) !== stripSections(sy))
    problems.push('styles.xml: changed outside fonts/fills/borders/cellXfs');

  const xmllint = spawnSync('xmllint', ['--version']);
  let xmlChecked = 'xmllint not available';
  if (xmllint.status === 0) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'pii-m2-xml-'));
    const bad: string[] = [];
    for (const p of [...EDITED, sheetPart]) {
      const f = path.join(dir, p.replace(/[/[\]]/g, '_'));
      writeFileSync(f, await b.file(p)!.async('nodebuffer'));
      if (spawnSync('xmllint', ['--noout', f]).status !== 0) bad.push(p);
    }
    xmlChecked = bad.length ? `xmllint failed: ${bad.join(', ')}` : 'xmllint OK on edited parts + new sheet';
    if (bad.length) problems.push(xmlChecked);
  }
  return { problems, identical, totalOrig: aParts.length, xmlChecked };
}

async function main() {
  // 1. Build the sheet with ExcelJS in its own workbook (also kept as the standalone deliverable).
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(SHEET);
  const built = buildSheet(ws);
  const sheetBuf = Buffer.from(await wb.xlsx.writeBuffer());
  writeFileSync(STANDALONE, sheetBuf);
  console.log(`Standalone sheet: ${path.relative(ROOT, STANDALONE)} (${CASES.length} cases)`);

  // 2. Inject into the original package.
  if (!existsSync(WORKBOOK)) throw new Error(`Workbook not found: ${WORKBOOK}`);
  const origBuf = readFileSync(WORKBOOK);
  const before = await snapshot(origBuf);
  before.delete(SHEET);
  const { buf, sheetPart, added, replaced } = await inject(origBuf, sheetBuf);

  // 3. Verify.
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
  else {
    const lastCase = newWs.getCell(`C${built.lastDataRow}`).value;
    if (lastCase !== CASES[CASES.length - 1]?.title) problems.push('new sheet content mismatch');
    if (check.worksheets.length !== before.size + 1) problems.push('sheet count mismatch');
  }

  console.log(
    `Package: ${pkg.identical}/${pkg.totalOrig - EDITED.length} untouched parts byte-identical; ${pkg.xmlChecked}; ` +
      `existing sheets compared: ${before.size}; ${replaced ? 'replaced' : 'added'} ${sheetPart}`,
  );
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
  const tmp = path.join(mkdtempSync(path.join(os.tmpdir(), 'pii-m2-')), 'Test cases.xlsx');
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
