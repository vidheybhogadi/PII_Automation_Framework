/**
 * Puts a sheet built by ExcelJS into the shared workbook docs/Test cases.xlsx without touching any other sheet.
 *
 * Why ZIP-level injection: the workbook (~100 sheets, Google Sheets export) has drawings, VML, legacy and threaded
 * comments, document tasks and persons. ExcelJS drops those parts on a round trip, so it is used ONLY to build the new
 * sheet in a standalone file. The sheet XML is then copied into the original package with JSZip: its styles are
 * appended to styles.xml (existing entries untouched, indexes remapped), shared strings are turned into inline strings,
 * and workbook.xml / workbook.xml.rels / [Content_Types].xml get one entry each. Every other part stays byte-for-byte
 * identical. If the sheet already exists, only its sheet part is replaced.
 *
 * Verification (callers refuse to write on any problem):
 *   1. every original ZIP part is present; all parts except the four edited ones are byte-identical;
 *   2. the edited XML parts equal the original once the added entries are removed (styles: original lists are an
 *      unchanged prefix); xmllint --noout passes on the edited parts and the new sheet (when xmllint exists);
 *   3. snapshot(): ExcelJS view of every sheet (name, dimensions, cell values, merges, data-validation count, column
 *      widths and style hash) so callers can prove existing sheets are unchanged.
 */
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ---- Snapshot of existing sheets (ExcelJS view) ---------------------------------------------------------------
export interface SheetSig {
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

export async function snapshot(buf: Buffer): Promise<Map<string, SheetSig>> {
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

export const EDITED = [
  'xl/workbook.xml',
  'xl/_rels/workbook.xml.rels',
  '[Content_Types].xml',
  'xl/styles.xml',
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Injects sheet1 of `sheetBuf` into `origBuf` as `sheetName` (adds it, or replaces its part if it already exists). */
export async function injectSheet(origBuf: Buffer, sheetBuf: Buffer, sheetName: string) {
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
  const existing = new RegExp(`<sheet\\b[^>]*name="${escapeRe(sheetName)}"[^>]*/>`).exec(workbook);
  if (existing) {
    const rid = /r:id="([^"]+)"/.exec(existing[0])?.[1];
    const target = new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*/>`).exec(rels)?.[0];
    const t = target && /Target="([^"]+)"/.exec(target)?.[1];
    if (!t) throw new Error(`Cannot resolve the part of the existing "${sheetName}" sheet`);
    sheetPart = t.startsWith('/') ? t.slice(1) : `xl/${t}`;
  } else {
    const nums = Object.keys(orig.files)
      .map((f) => /^xl\/worksheets\/sheet(\d+)\.xml$/.exec(f)?.[1])
      .filter(Boolean)
      .map(Number);
    const n = Math.max(0, ...nums) + 1;
    sheetPart = `xl/worksheets/sheet${n}.xml`;
    const sheetId = Math.max(0, ...[...workbook.matchAll(/sheetId="(\d+)"/g)].map((m) => Number(m[1]))) + 1;
    let rid = `rId${sheetName.replace(/[^A-Za-z0-9]/g, '')}`;
    while (rels.includes(`Id="${rid}"`)) rid += 'X';
    added['xl/workbook.xml'] =
      `<sheet state="visible" name="${sheetName}" sheetId="${sheetId}" r:id="${rid}"/>`;
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
export async function verifyPackage(
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
    const dir = mkdtempSync(path.join(os.tmpdir(), 'pii-xlsx-xml-'));
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
