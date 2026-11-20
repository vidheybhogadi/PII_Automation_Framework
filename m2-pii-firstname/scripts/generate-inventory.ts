/**
 * Builds m2-pii-firstname/docs/firstname-inventory.xlsx (M2 PII First Name white-box inventory) from
 * m2-pii-firstname/docs/firstname-inventory.json — every place the Aisle Network code reads, writes, searches, displays, sends
 * or stores a first name, grouped by division and then by code path. Everything is "from code — confirm with Dev".
 *
 *   npm run m2fn:inventory
 *
 * Sheets: Overview · Paths (one row per code path, with its edge cases and suggested representative per division) ·
 * one sheet per division (rows grouped under a band per path) · Data Stores · Dev Questions.
 * The "Dev Answer" column of Dev Questions is carried over from the previous file so answers survive regeneration.
 */
import ExcelJS from 'exceljs';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'm2-pii-firstname/docs/firstname-inventory.json');
const OUT = path.join(ROOT, 'm2-pii-firstname/docs/firstname-inventory.xlsx');
const FONT = 'Calibri';

// ---- Palette (same as generate-m2-workbook.ts) ---------------------------------------------------------------
const C = {
  headerBg: 'FF1E293B',
  band: 'FF334155',
  zebra: 'FFF8FAFC',
  border: 'FFE2E8F0',
  white: 'FFFFFFFF',
  slate: 'FF475569',
  ink: 'FF0F172A',
  bypassBg: 'FFFEF2F2',
  bypassInk: 'FFB91C1C',
  repBg: 'FFECFDF5',
  repInk: 'FF047857',
};
const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin' as const, color: { argb: C.border } };

interface PathDef {
  code: string;
  group: string;
  name: string;
  flag_aware: boolean;
  how: string;
}
interface Item {
  id: string;
  division: string;
  path: string;
  agent_path: string;
  source: string;
  kind?: string;
  method?: string;
  route?: string;
  handler?: string;
  access?: string;
  name_source?: string;
  flag_aware?: boolean;
  hide_first_name_handled?: boolean | null;
  stores?: string[];
  side_effects?: string[];
  auth?: string;
  screens?: string[];
  edge_cases?: string[];
  evidence?: string[];
  notes?: string;
  representative?: boolean;
}
interface Inventory {
  about: string;
  generated: string;
  refs: Record<string, string>;
  corrections: string[];
  paths: PathDef[];
  items: Item[];
  questions: { source: string; text: string }[];
}

const SOURCE_LABEL: Record<string, string> = {
  api: 'Aisle APIs',
  int: 'Aisle background',
  cms: 'Aisle CMS',
  vn: 'Vernac backend + CMS',
  app: 'Mobile apps',
  svc: 'Notification + Django',
};
const DIVISIONS = [
  'Aisle',
  'Aisle CMS',
  'Aisle background',
  'Vernac',
  'Vernac CMS',
  'Aisle Android',
  'Aisle iOS',
  'Vernac Android',
  'Vernac iOS',
  'Notification',
  'Django',
];

const list = (v?: string[]) => (v ?? []).filter(Boolean).join('\n');
const yesNo = (v: boolean | null | undefined) => (v === true ? 'Yes' : v === false ? 'No' : '—');
const isBypass = (p: PathDef) => /BYPASS/i.test(p.name) || p.code === 'A-R6';

interface Col {
  header: string;
  width: number;
  mono?: boolean;
}

function title(ws: ExcelJS.Worksheet, text: string, sub: string, span: number) {
  ws.mergeCells(1, 1, 1, span);
  const t = ws.getCell(1, 1);
  t.value = text;
  t.font = { name: FONT, bold: true, size: 15, color: { argb: C.white } };
  t.fill = fill(C.headerBg);
  t.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 28;
  ws.mergeCells(2, 1, 2, span);
  const s = ws.getCell(2, 1);
  s.value = sub;
  s.font = { name: FONT, italic: true, size: 10, color: { argb: C.slate } };
  s.alignment = { wrapText: true, vertical: 'top', indent: 1 };
  ws.getRow(2).height = 30;
}

function header(ws: ExcelJS.Worksheet, cols: Col[], row: number) {
  ws.columns = cols.map((c) => ({ width: c.width }));
  cols.forEach((c, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = c.header;
    cell.font = { name: FONT, bold: true, color: { argb: C.white } };
    cell.fill = fill(C.band);
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = { top: thin, bottom: thin, left: thin, right: thin };
  });
  ws.getRow(row).height = 30;
}

function dataRow(ws: ExcelJS.Worksheet, cols: Col[], values: unknown[], zebra: boolean) {
  const r = ws.addRow(values);
  r.eachCell({ includeEmpty: true }, (cell, n) => {
    const c = cols[n - 1];
    cell.font = c?.mono
      ? { name: 'Menlo', size: 9, color: { argb: C.ink } }
      : { name: FONT, size: 10, color: { argb: C.ink } };
    cell.alignment = { vertical: 'top', wrapText: true };
    cell.border = { top: thin, bottom: thin, left: thin, right: thin };
    if (zebra) cell.fill = fill(C.zebra);
  });
  return r;
}

function finish(ws: ExcelJS.Worksheet, cols: Col[], headerRow: number, lastRow: number, xSplit = 2) {
  ws.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: Math.max(lastRow, headerRow), column: cols.length },
  };
  ws.views = [{ state: 'frozen', ySplit: headerRow, xSplit }];
}

function overview(wb: ExcelJS.Workbook, inv: Inventory, pathBy: Map<string, PathDef>) {
  const ws = wb.addWorksheet('Overview', { properties: { tabColor: { argb: C.headerBg } } });
  ws.columns = [{ width: 34 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 70 }];
  title(ws, 'M2 PII First Name — white-box inventory', inv.about, 5);
  let r = 4;
  const section = (text: string) => {
    ws.mergeCells(r, 1, r, 5);
    const c = ws.getCell(r, 1);
    c.value = text;
    c.font = { name: FONT, bold: true, size: 12, color: { argb: C.white } };
    c.fill = fill(C.band);
    r++;
  };
  const kv = (k: string, v: string) => {
    ws.getCell(r, 1).value = k;
    ws.getCell(r, 1).font = { name: FONT, bold: true, color: { argb: C.slate } };
    ws.mergeCells(r, 2, r, 5);
    ws.getCell(r, 2).value = v;
    ws.getCell(r, 2).font = { name: FONT, color: { argb: C.ink } };
    ws.getCell(r, 2).alignment = { wrapText: true, vertical: 'top' };
    r++;
  };

  section('How to use this workbook');
  [
    '1. Each division sheet lists every place that division touches the first name, grouped under a band per code path.',
    '2. A path = the route through the code that decides where the name comes from (PII, Aisle DB, a cache) — APIs on the same path share that logic.',
    '3. Test strategy: deep white-box tests through the ★ representative of each path (flag ON/OFF, cache miss/hit, missing PII value, PII error, hide_first_name, update-then-read …), plus a one-check sweep of every other row (name equals the PII value with the flag ON).',
    '4. Every BYPASS path (red) ignores ALLOW_PII_FIRST_NAME_READ and gets its own deep tests.',
    '5. Everything here is from code — confirm with Dev. Staging observations win when they differ. Questions are on "Dev Questions".',
  ].forEach((t) => kv('', t));
  r++;

  section('Counts per division');
  const head = ['Division', 'Rows', 'Paths', '★ Representatives', 'Bypass rows'];
  head.forEach((h, i) => {
    const c = ws.getCell(r, i + 1);
    c.value = h;
    c.font = { name: FONT, bold: true, color: { argb: C.slate } };
  });
  r++;
  for (const d of DIVISIONS) {
    const rows = inv.items.filter((i) => i.division === d);
    if (!rows.length) continue;
    const vals = [
      d,
      rows.length,
      new Set(rows.map((i) => i.path)).size,
      rows.filter((i) => i.representative).length,
      rows.filter((i) => {
        const p = pathBy.get(i.path);
        return p ? isBypass(p) : false;
      }).length,
    ];
    vals.forEach((v, i) => (ws.getCell(r, i + 1).value = v));
    r++;
  }
  const total = [
    'Total',
    inv.items.length,
    new Set(inv.items.map((i) => i.path)).size,
    inv.items.filter((i) => i.representative).length,
    '',
  ];
  total.forEach((v, i) => {
    ws.getCell(r, i + 1).value = v;
    ws.getCell(r, i + 1).font = { name: FONT, bold: true };
  });
  r += 2;

  section('Code read (read-only)');
  Object.entries(inv.refs).forEach(([k, v]) => kv(k, v));
  r++;
  section('Corrections to earlier notes');
  inv.corrections.forEach((t) => kv('', t));
  r++;
  section('Sources');
  Object.entries(SOURCE_LABEL).forEach(([k, v]) =>
    kv(v, `${inv.items.filter((i) => i.source === k).length} rows`),
  );
  kv('Generated', inv.generated);
}

function pathsSheet(wb: ExcelJS.Workbook, inv: Inventory) {
  const ws = wb.addWorksheet('Paths', { properties: { tabColor: { argb: 'FF7C3AED' } } });
  const cols: Col[] = [
    { header: 'Path', width: 9, mono: true },
    { header: 'Group', width: 20 },
    { header: 'What the path is', width: 44 },
    { header: 'Honours read flag?', width: 10 },
    { header: 'How / why it matters', width: 44 },
    { header: 'Divisions (rows)', width: 26 },
    { header: '★ Representative per division', width: 46 },
    { header: 'Edge cases seen in code (all rows of this path)', width: 70 },
  ];
  title(
    ws,
    'Code paths',
    'One row per path. Deep-test the ★ representative of each division; sweep the rest. Red = BYPASS.',
    cols.length,
  );
  header(ws, cols, 4);
  let z = false;
  for (const p of inv.paths) {
    const rows = inv.items.filter((i) => i.path === p.code);
    if (!rows.length) continue;
    const byDiv = DIVISIONS.map((d) => [d, rows.filter((i) => i.division === d)] as const).filter(
      ([, v]) => v.length,
    );
    const reps = byDiv
      .map(([d, v]) => {
        const rep = v.find((i) => i.representative);
        return rep ? `${d}: ${rep.id} ${[rep.method, rep.route].filter(Boolean).join(' ')}` : '';
      })
      .filter(Boolean)
      .join('\n');
    const edges = [...new Set(rows.flatMap((i) => i.edge_cases ?? []))];
    const r = dataRow(
      ws,
      cols,
      [
        p.code,
        p.group,
        p.name,
        p.flag_aware ? 'Yes' : 'No',
        p.how,
        byDiv.map(([d, v]) => `${d} (${v.length})`).join('\n'),
        reps,
        edges.slice(0, 25).join('\n') +
          (edges.length > 25 ? `\n… +${edges.length - 25} more on the division sheets` : ''),
      ],
      z,
    );
    if (isBypass(p)) {
      r.getCell(1).fill = fill(C.bypassBg);
      r.getCell(3).font = { name: FONT, size: 10, bold: true, color: { argb: C.bypassInk } };
    }
    z = !z;
  }
  finish(ws, cols, 4, ws.rowCount, 1);
}

const ITEM_COLS: Col[] = [
  { header: 'ID', width: 13, mono: true },
  { header: 'Path', width: 8, mono: true },
  { header: '★', width: 4 },
  { header: 'Kind', width: 11 },
  { header: 'Method', width: 8 },
  { header: 'Route / job / screen', width: 38, mono: true },
  { header: 'Handler', width: 34, mono: true },
  { header: 'Access', width: 9 },
  { header: 'Name comes from', width: 16 },
  { header: 'Honours read flag?', width: 9 },
  { header: 'hide_first_name handled?', width: 9 },
  { header: 'Stores', width: 30 },
  { header: 'Side effects', width: 24 },
  { header: 'Auth', width: 14 },
  { header: 'Screens', width: 22 },
  { header: 'Edge cases', width: 50 },
  { header: 'Evidence (file:line @sha)', width: 44, mono: true },
  { header: 'Notes', width: 50 },
];

function divisionSheet(wb: ExcelJS.Workbook, inv: Inventory, division: string, pathBy: Map<string, PathDef>) {
  const rows = inv.items.filter((i) => i.division === division);
  if (!rows.length) return;
  const ws = wb.addWorksheet(division.slice(0, 31), { properties: { tabColor: { argb: 'FF2563EB' } } });
  title(
    ws,
    `${division} — ${rows.length} rows in ${new Set(rows.map((i) => i.path)).size} paths`,
    '★ = suggested representative for the deep tests of that path. Red band = BYPASS of the PII read flag. From code — confirm with Dev.',
    ITEM_COLS.length,
  );
  header(ws, ITEM_COLS, 4);
  const order = inv.paths.map((p) => p.code);
  const codes = [...new Set(rows.map((i) => i.path))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  for (const code of codes) {
    const p = pathBy.get(code);
    const group = rows.filter((i) => i.path === code);
    const band = ws.addRow([
      `${code} · ${p?.name ?? ''} · ${group.length} row${group.length === 1 ? '' : 's'}${p?.how ? ` — ${p.how}` : ''}`,
    ]);
    ws.mergeCells(band.number, 1, band.number, ITEM_COLS.length);
    const bc = band.getCell(1);
    bc.font = { name: FONT, bold: true, color: { argb: p && isBypass(p) ? C.bypassInk : C.white } };
    bc.fill = fill(p && isBypass(p) ? C.bypassBg : C.slate);
    bc.alignment = { vertical: 'middle', wrapText: true };
    band.height = 20;
    let z = false;
    for (const i of group) {
      const r = dataRow(
        ws,
        ITEM_COLS,
        [
          i.id,
          i.path,
          i.representative ? '★' : '',
          i.kind ?? '',
          i.method ?? '',
          i.route ?? '',
          i.handler ?? '',
          i.access ?? '',
          i.name_source ?? '',
          yesNo(i.flag_aware),
          yesNo(i.hide_first_name_handled),
          list(i.stores),
          list(i.side_effects),
          i.auth ?? '',
          list(i.screens),
          list(i.edge_cases),
          list(i.evidence),
          i.notes ?? '',
        ],
        z,
      );
      if (i.representative) {
        r.getCell(3).fill = fill(C.repBg);
        r.getCell(3).font = { name: FONT, bold: true, color: { argb: C.repInk } };
        r.getCell(3).alignment = { horizontal: 'center', vertical: 'top' };
      }
      z = !z;
    }
  }
  finish(ws, ITEM_COLS, 4, ws.rowCount);
}

function storesSheet(wb: ExcelJS.Workbook, inv: Inventory) {
  const ws = wb.addWorksheet('Data Stores', { properties: { tabColor: { argb: 'FF0891B2' } } });
  const cols: Col[] = [
    { header: 'Store / channel (as named in code)', width: 50 },
    { header: 'Rows', width: 8 },
    { header: 'Divisions', width: 34 },
    { header: 'Paths', width: 30, mono: true },
    { header: 'Example rows', width: 40, mono: true },
  ];
  title(
    ws,
    'Where the name is stored or sent',
    'Postgres, PII service, Redis, Mongo, Kafka, providers … — every store/side effect named on any row.',
    cols.length,
  );
  header(ws, cols, 4);
  const by = new Map<string, Item[]>();
  for (const i of inv.items) {
    for (const s of [...(i.stores ?? []), ...(i.side_effects ?? [])]) {
      const k = s.trim();
      if (!k) continue;
      by.set(k, [...(by.get(k) ?? []), i]);
    }
  }
  let z = false;
  [...by.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .forEach(([k, v]) => {
      dataRow(
        ws,
        cols,
        [
          k,
          v.length,
          [...new Set(v.map((i) => i.division))].join(', '),
          [...new Set(v.map((i) => i.path))].join(', '),
          v
            .slice(0, 4)
            .map((i) => i.id)
            .join(', ') + (v.length > 4 ? ' …' : ''),
        ],
        z,
      );
      z = !z;
    });
  finish(ws, cols, 4, ws.rowCount, 1);
}

async function questionsSheet(wb: ExcelJS.Workbook, inv: Inventory) {
  // Carry Dev answers over from the previous file (keyed by question text).
  const previous = new Map<string, string>();
  if (existsSync(OUT)) {
    const old = new ExcelJS.Workbook();
    await old.xlsx.readFile(OUT);
    old.getWorksheet('Dev Questions')?.eachRow((row, n) => {
      if (n <= 4) return;
      const text = String(row.getCell(3).value ?? '');
      const answer = String(row.getCell(4).value ?? '');
      if (text && answer) previous.set(text, answer);
    });
  }
  const ws = wb.addWorksheet('Dev Questions', { properties: { tabColor: { argb: 'FFD97706' } } });
  const cols: Col[] = [
    { header: 'ID', width: 9, mono: true },
    { header: 'Area', width: 20 },
    { header: 'Question (with code evidence)', width: 100 },
    { header: 'Dev Answer', width: 50 },
  ];
  title(
    ws,
    'Questions for Dev',
    'Raised while reading the code. Dev: please answer in "Dev Answer" — it is kept when the sheet is regenerated.',
    cols.length,
  );
  header(ws, cols, 4);
  let z = false;
  inv.questions.forEach((q, n) => {
    dataRow(
      ws,
      cols,
      [
        `FNQ-${String(n + 1).padStart(2, '0')}`,
        SOURCE_LABEL[q.source] ?? q.source,
        q.text,
        previous.get(q.text) ?? '',
      ],
      z,
    );
    z = !z;
  });
  finish(ws, cols, 4, ws.rowCount, 1);
}

async function main() {
  const inv = JSON.parse(readFileSync(SRC, 'utf8')) as Inventory;
  const pathBy = new Map(inv.paths.map((p) => [p.code, p]));
  const ids = new Set<string>();
  for (const i of inv.items) {
    if (!pathBy.has(i.path)) throw new Error(`${i.id}: unknown path ${i.path}`);
    if (ids.has(i.id)) throw new Error(`duplicate id ${i.id}`);
    if (!DIVISIONS.includes(i.division)) throw new Error(`${i.id}: unknown division ${i.division}`);
    ids.add(i.id);
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PII Automation Framework';
  overview(wb, inv, pathBy);
  pathsSheet(wb, inv);
  for (const d of DIVISIONS) divisionSheet(wb, inv, d, pathBy);
  storesSheet(wb, inv);
  await questionsSheet(wb, inv);
  await wb.xlsx.writeFile(OUT);
  console.log(
    `Wrote ${path.relative(ROOT, OUT)}: ${inv.items.length} rows, ${pathBy.size} paths, ${inv.questions.length} questions`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
