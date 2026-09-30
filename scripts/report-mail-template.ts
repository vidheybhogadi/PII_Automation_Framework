/**
 * HTML + plain-text body of the daily report email (used by send-report-mail.ts).
 *
 * Email-safe markup only: tables, inline styles and bgcolor attributes (Outlook ignores flex/grid, <style> blocks
 * and external CSS). Every value comes from the report's own results.json / summary.txt, which are already
 * sanitized — no bodies, tokens or personal data.
 */
import { AREAS } from '../reporting/core/catalog';

export const EMAIL_WIDTH = 720;

type Outcome = 'Pass' | 'Fail' | 'Security finding' | 'Blocked' | 'Skipped' | 'Not Tested' | 'Not Applicable';

interface ResultTest {
  id: string;
  title: string;
  status: Outcome;
  remarks?: string | null;
  area: string;
  severity: string;
}

interface Results {
  run: {
    label?: string;
    environment?: string;
    startedAt?: string;
    durationMs?: number;
    git?: { commit?: string };
  };
  summary: { total: number; outcomes: Partial<Record<Outcome, number>> };
  tests: ResultTest[];
}

export interface ReportFacts {
  environment: string;
  runLabel: string;
  startedAt: Date | null;
  durationMs: number | null;
  verdict: string;
  apiPassRate: string | null;
  health: string | null;
  total: number;
  count: (o: Outcome) => number;
  executed: number;
  attention: ResultTest[];
  blockedGroups: { code: string; reason: string; ids: string[] }[];
  areas: { label: string; pass: number; problems: number; blocked: number; notRun: number }[];
}

// ---- Data --------------------------------------------------------------------------------------------------

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];

/** "BLOCKED — BQ-03: No approved test phones; … — observed POST … -> HTTP 403" → { BQ-03, "No approved test phones; …" } */
function blockReason(remarks: string | null | undefined): { code: string; reason: string } {
  const text = (remarks ?? '').replace(/^[A-Z ]+(\([^)]*\))?\s*—\s*/, '');
  const m = /^(BQ-\d+):\s*(.*)$/.exec(text);
  const reason = (m ? m[2]! : text)
    .split(/\s+—\s+observed\b/)[0]!
    .replace(/\s*\((?:permission|see)[^)]*\)/, '');
  return { code: m ? m[1]! : 'Other', reason: reason.trim() || 'Waiting on setup' };
}

export function readFacts(results: Results, summaryText: string): ReportFacts {
  const o = results.summary.outcomes;
  const count = (k: Outcome) => o[k] ?? 0;
  const tests = results.tests;

  const attention = tests
    .filter((t) => t.status === 'Fail' || t.status === 'Security finding')
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

  const groups = new Map<string, { code: string; reason: string; ids: string[] }>();
  for (const t of tests.filter((x) => x.status === 'Blocked')) {
    const { code, reason } = blockReason(t.remarks);
    const g = groups.get(code) ?? { code, reason, ids: [] };
    g.ids.push(t.id);
    groups.set(code, g);
  }

  const areas = AREAS.map((a) => {
    const inArea = tests.filter((t) => t.area === a.key);
    const n = (...s: Outcome[]) => inArea.filter((t) => s.includes(t.status)).length;
    return {
      label: a.label,
      pass: n('Pass'),
      problems: n('Fail', 'Security finding'),
      blocked: n('Blocked'),
      notRun: n('Skipped', 'Not Tested', 'Not Applicable'),
      total: inArea.length,
    };
  }).filter((a) => a.total > 0);

  return {
    environment: (results.run.environment ?? 'unknown').toUpperCase(),
    runLabel: results.run.label ?? 'Run',
    startedAt: results.run.startedAt ? new Date(results.run.startedAt) : null,
    durationMs: results.run.durationMs ?? null,
    verdict: /^Verdict:\s*(\S+)/m.exec(summaryText)?.[1] ?? 'UNKNOWN',
    apiPassRate: /API Pass Rate:\s*([\d.]+%)/.exec(summaryText)?.[1] ?? null,
    health: /Test Health:\s*([^\n]+)/.exec(summaryText)?.[1]?.trim() ?? null,
    total: results.summary.total,
    count,
    executed: count('Pass') + count('Fail') + count('Security finding'),
    attention,
    blockedGroups: [...groups.values()].sort((a, b) => b.ids.length - a.ids.length),
    areas,
  };
}

// ---- Formatting helpers ------------------------------------------------------------------------------------

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Test IDs with non-breaking hyphens so "AISLE-TR-003" never wraps mid-ID. */
const ids = (list: string[]) => list.map((id) => escapeHtml(id).replace(/-/g, '&#8209;')).join(', ');

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Tue, 29 Sep 2026" or "Tue, 29 Sep 2026 · 8:05 AM IST" */
function istDate(d: Date, withTime = true): string {
  const ist = new Date(d.getTime() + 330 * 60_000);
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][ist.getUTCDay()];
  const date = `${day}, ${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
  if (!withTime) return date;
  const h = ist.getUTCHours();
  const time = `${h % 12 || 12}:${String(ist.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  return `${date} · ${time} IST`;
}

const duration = (ms: number) =>
  ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 60_000)} min`;

const FONT = "font-family:'Segoe UI',-apple-system,Helvetica,Arial,sans-serif";
const C = {
  ink: '#1f2937',
  muted: '#6b7280',
  line: '#e5e7eb',
  page: '#f3f4f6',
  navy: '#0f1b33',
  pass: '#15803d',
  passBg: '#ecfdf3',
  fail: '#b91c1c',
  failBg: '#fef2f2',
  sec: '#7e22ce',
  secBg: '#faf5ff',
  block: '#b45309',
  blockBg: '#fffbeb',
  grey: '#6b7280',
  greyBg: '#f9fafb',
  link: '#2563eb',
};

const VERDICT_STYLE: Record<string, { fg: string; bg: string; icon: string }> = {
  PASSED: { fg: C.pass, bg: C.passBg, icon: '✔' },
  FAILED: { fg: C.fail, bg: C.failBg, icon: '✖' },
};
const verdictStyle = (v: string) => VERDICT_STYLE[v] ?? { fg: C.block, bg: C.blockBg, icon: '!' };

const SEVERITY_STYLE: Record<string, { fg: string; bg: string }> = {
  critical: { fg: '#ffffff', bg: C.fail },
  high: { fg: '#ffffff', bg: '#ea580c' },
  medium: { fg: C.ink, bg: '#fde68a' },
  low: { fg: C.ink, bg: C.line },
};

function chip(text: string, fg: string, bg: string): string {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:${bg};color:${fg};font-size:11px;font-weight:700;letter-spacing:.3px;white-space:nowrap">${escapeHtml(text)}</span>`;
}

function section(title: string, subtitle: string, body: string): string {
  return `<tr><td class="px" style="padding:24px 28px 0">
  <div style="${FONT};font-size:16px;font-weight:700;color:${C.ink}">${escapeHtml(title)}</div>
  ${subtitle ? `<div style="${FONT};font-size:12px;color:${C.muted};margin-top:2px">${escapeHtml(subtitle)}</div>` : ''}
  <div style="margin-top:12px">${body}</div>
</td></tr>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
  <td bgcolor="${C.link}" style="border-radius:6px"><a href="${escapeHtml(href)}" style="display:inline-block;padding:10px 18px;${FONT};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">${escapeHtml(label)}</a></td>
</tr></table>`;
}

function shell(preheader: string, rows: string, pages: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<style>@media (max-width:520px){.px{padding-left:14px!important;padding-right:14px!important}.kpi{border-width:2px!important;padding:10px 0!important}.kpin{font-size:20px!important}.kpil{font-size:9px!important;letter-spacing:0!important}.cellp{padding:8px 6px!important}}</style></head>
<body style="margin:0;padding:0;background:${C.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}"><tr><td align="center" style="padding:20px 12px">
<!--[if mso]><table role="presentation" width="${EMAIL_WIDTH}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:${EMAIL_WIDTH}px;border:1px solid ${C.line};border-radius:10px;overflow:hidden">
${rows}
<tr><td class="px" style="padding:24px 28px;border-top:1px solid ${C.line};margin-top:24px">
  <div style="${FONT};font-size:11px;color:${C.muted};line-height:1.5">Internal — contains no personal data, keys or credentials. Sent automatically every day at 8:00 AM IST by the <b>PII API tests</b> GitHub workflow.</div>
</td></tr>
</table>
${pages}
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}

function header(env: string, subline: string): string {
  return `<tr><td class="px" bgcolor="${C.navy}" style="padding:22px 28px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="${FONT};color:#ffffff"><div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#93c5fd;font-weight:600">Aisle PII API</div>
      <div style="font-size:22px;font-weight:700;margin-top:2px">Daily QA Report</div></td>
    <td align="right" valign="top">${chip(env, C.navy, '#93c5fd')}</td>
  </tr></table>
  <div style="${FONT};font-size:12px;color:#cbd5e1;margin-top:8px">${escapeHtml(subline)}</div>
</td></tr>`;
}

// ---- Email -------------------------------------------------------------------------------------------------

export interface EmailParts {
  subject: string;
  html: string;
  text: string;
}

export function buildReportEmail(
  f: ReportFacts,
  opts: { runUrl: string | null; pagesHtml: string; pageCount: number; note: string | null },
): EmailParts {
  const fail = f.count('Fail');
  const sec = f.count('Security finding');
  const blocked = f.count('Blocked');
  const notRun = f.count('Skipped') + f.count('Not Tested') + f.count('Not Applicable');
  const pass = f.count('Pass');
  const vs = verdictStyle(f.verdict);
  const when = f.startedAt ? istDate(f.startedAt) : '';
  const dateShort = istDate(f.startedAt ?? new Date(), false).slice(5);

  const problems = [sec ? plural(sec, 'security finding') : '', fail ? plural(fail, 'failure') : ''].filter(
    Boolean,
  );
  const headline = problems.length
    ? `${problems.join(' and ')} ${sec + fail === 1 ? 'needs' : 'need'} attention`
    : f.executed === 0
      ? 'No API tests ran'
      : `All ${f.executed} tests that ran passed`;
  const subline = [
    `${pass} of ${f.executed} tests that ran passed`,
    blocked ? `${blocked} blocked, waiting on Dev answers or setup (not failures)` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const subject = `[PII API · ${f.environment}] ${f.verdict} — ${problems.length ? `${problems.join(', ')} · ` : ''}${pass}/${f.executed} passed · ${dateShort}`;

  // Verdict banner
  const banner = `<tr><td class="px" style="padding:24px 28px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td bgcolor="${vs.bg}" style="border-left:5px solid ${vs.fg};border-radius:6px;padding:16px 18px">
      <div style="${FONT};font-size:12px;font-weight:700;letter-spacing:1px;color:${vs.fg}">${vs.icon} ${escapeHtml(f.verdict)}</div>
      <div style="${FONT};font-size:19px;font-weight:700;color:${C.ink};margin-top:4px">${escapeHtml(headline)}</div>
      <div style="${FONT};font-size:13px;color:${C.muted};margin-top:4px">${escapeHtml(subline)}</div>
    </td>
  </tr></table>
</td></tr>`;

  // KPI tiles
  const tile = (n: number, label: string, fg: string, bg: string) =>
    `<td class="kpi" width="20%" align="center" bgcolor="${n ? bg : C.greyBg}" style="padding:14px 4px;border:4px solid #ffffff;border-radius:10px">
      <div class="kpin" style="${FONT};font-size:26px;font-weight:800;color:${n ? fg : '#9ca3af'};line-height:1">${n}</div>
      <div class="kpil" style="${FONT};font-size:11px;font-weight:600;color:${n ? fg : C.muted};margin-top:6px;text-transform:uppercase;letter-spacing:.5px">${label}</div>
    </td>`;
  const kpis = `<tr><td class="px" style="padding:16px 24px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    ${tile(pass, 'Passed', C.pass, C.passBg)}${tile(fail, 'Failed', C.fail, C.failBg)}${tile(sec, 'Security', C.sec, C.secBg)}${tile(blocked, 'Blocked', C.block, C.blockBg)}${tile(notRun, 'Not run', C.grey, C.greyBg)}
  </tr></table>
  <div style="${FONT};font-size:12px;color:${C.muted};padding:8px 4px 0">
    ${[
      f.apiPassRate ? `API pass rate <b style="color:${C.ink}">${f.apiPassRate}</b>` : '',
      f.health ? `Test health <b style="color:${C.ink}">${escapeHtml(f.health)}</b>` : '',
      `<b style="color:${C.ink}">${f.total}</b> tests in the suite`,
      f.durationMs !== null ? `took <b style="color:${C.ink}">${duration(f.durationMs)}</b>` : '',
    ]
      .filter(Boolean)
      .join(' &nbsp;·&nbsp; ')}
  </div>
</td></tr>`;

  // Needs attention
  const cell = `${FONT};font-size:13px;color:${C.ink};padding:10px 12px;border-bottom:1px solid ${C.line};vertical-align:top`;
  const attention = f.attention.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line};border-radius:8px">
${f.attention
  .map((t) => {
    const sv = SEVERITY_STYLE[t.severity] ?? SEVERITY_STYLE.low!;
    const kind =
      t.status === 'Security finding'
        ? chip('SECURITY FINDING', C.sec, C.secBg)
        : chip('FAILED', C.fail, C.failBg);
    const reason = (t.remarks ?? '').replace(/^[A-Z ]+(\([^)]*\))?\s*—\s*/, '');
    return `<tr><td class="cellp" style="${cell}" width="130">${chip(t.severity.toUpperCase(), sv.fg, sv.bg)}<div style="margin-top:6px">${kind}</div></td>
  <td class="cellp" style="${cell}"><div style="font-family:Consolas,Menlo,monospace;font-size:12px;color:${C.muted}">${ids([t.id])}</div>
    <div style="font-weight:600;margin-top:2px">${escapeHtml(t.title.replace(new RegExp(`^${t.id}\\s*`), ''))}</div>
    ${reason ? `<div style="font-size:12px;color:${C.muted};margin-top:4px">${escapeHtml(reason)}</div>` : ''}</td></tr>`;
  })
  .join('\n')}
</table>`
    : `<div style="${FONT};font-size:13px;color:${C.pass};background:${C.passBg};padding:12px 14px;border-radius:8px">✔ Nothing failed and no security findings.</div>`;

  // Blocked
  const blockedTable = f.blockedGroups.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line};border-radius:8px">
${f.blockedGroups
  .map(
    (g) => `<tr><td class="cellp" style="${cell}" width="70">${chip(g.code, C.block, C.blockBg)}</td>
  <td class="cellp" style="${cell}"><div style="font-weight:600">${escapeHtml(g.reason)}</div>
    <div style="font-family:Consolas,Menlo,monospace;font-size:11px;color:${C.muted};margin-top:4px">${ids(g.ids)}</div></td>
  <td class="cellp" style="${cell};text-align:right;font-weight:700;color:${C.block}" width="60">${g.ids.length}</td></tr>`,
  )
  .join('\n')}
</table>`
    : '';

  // By area
  const num = (n: number, fg: string) =>
    `<td class="cellp" align="center" style="${cell};font-weight:${n ? 700 : 400};color:${n ? fg : '#d1d5db'}">${n}</td>`;
  const th = (t: string, align = 'center') =>
    `<th class="cellp" align="${align}" style="${FONT};font-size:11px;font-weight:700;color:${C.muted};text-transform:uppercase;letter-spacing:.4px;padding:8px 12px;border-bottom:2px solid ${C.line};background:${C.greyBg}">${t}</th>`;
  const areaTable = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line};border-radius:8px">
<tr>${th('Area', 'left')}${th('Passed')}${th('Failed / security')}${th('Blocked')}${th('Not run')}</tr>
${f.areas
  .map(
    (a) =>
      `<tr><td class="cellp" style="${cell}">${escapeHtml(a.label)}</td>${num(a.pass, C.pass)}${num(a.problems, C.fail)}${num(a.blocked, C.block)}${num(a.notRun, C.grey)}</tr>`,
  )
  .join('\n')}
</table>`;

  const links = opts.runUrl
    ? `<tr><td class="px" style="padding:24px 28px 0">${button(opts.runUrl, 'Open this run on GitHub →')}
  <div style="${FONT};font-size:12px;color:${C.muted};margin-top:8px">The interactive dashboard, CSV and Excel are under <b>Artifacts</b> on the run page.</div></td></tr>`
    : '';
  const note = opts.note
    ? `<tr><td class="px" style="padding:16px 28px 0"><div style="${FONT};font-size:12px;color:${C.block};background:${C.blockBg};padding:10px 12px;border-radius:6px">${escapeHtml(opts.note)}</div></td></tr>`
    : '';

  const rows = [
    header(f.environment, [f.runLabel, when].filter(Boolean).join('  ·  ')),
    banner,
    kpis,
    section(
      'Needs attention',
      f.attention.length ? 'Failed checks and security findings, most severe first' : '',
      attention,
    ),
    blockedTable
      ? section(
          'Blocked — waiting on Dev answers or setup',
          'Not failures: these checks cannot run until the question is answered (docs/backend-open-questions.md)',
          blockedTable,
        )
      : '',
    section('Results by area', '', areaTable),
    links,
    note,
    `<tr><td style="padding:0 0 4px"></td></tr>`,
  ].join('\n');

  const pages = opts.pageCount
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${EMAIL_WIDTH}px;margin-top:20px"><tr><td>
  <div style="${FONT};font-size:16px;font-weight:700;color:${C.ink};padding:0 4px">Full report</div>
  <div style="${FONT};font-size:12px;color:${C.muted};padding:2px 4px 12px">All ${opts.pageCount} pages of the PDF report</div>
  ${opts.pagesHtml}
</td></tr></table>`
    : '';

  const text = [
    `AISLE PII API — DAILY QA REPORT (${f.environment})`,
    [f.runLabel, when].filter(Boolean).join(' · '),
    '',
    `${f.verdict}: ${headline}`,
    subline,
    '',
    `Passed ${pass} · Failed ${fail} · Security findings ${sec} · Blocked ${blocked} · Not run ${notRun}`,
    [f.apiPassRate && `API pass rate ${f.apiPassRate}`, f.health && `Test health ${f.health}`]
      .filter(Boolean)
      .join(' · '),
    '',
    'NEEDS ATTENTION',
    ...(f.attention.length
      ? f.attention.map((t) => `- [${t.severity.toUpperCase()}] ${t.title} (${t.status})`)
      : ['- Nothing failed and no security findings.']),
    ...(f.blockedGroups.length
      ? [
          '',
          'BLOCKED (waiting on Dev answers or setup)',
          ...f.blockedGroups.map((g) => `- ${g.code} (${g.ids.length}): ${g.reason}`),
        ]
      : []),
    '',
    ...(opts.note ? [opts.note, ''] : []),
    ...(opts.runUrl ? [`Open the run: ${opts.runUrl}`, ''] : []),
    'Internal — contains no personal data.',
  ].join('\n');

  return { subject, html: shell(`${f.verdict}: ${headline}. ${subline}`, rows, pages), text };
}

export function buildNoReportEmail(runUrl: string | null): EmailParts {
  const date = new Date().toISOString().slice(0, 10);
  const vs = verdictStyle('FAILED');
  const rows = [
    header('NO REPORT', istDate(new Date())),
    `<tr><td class="px" style="padding:24px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td bgcolor="${vs.bg}" style="border-left:5px solid ${vs.fg};border-radius:6px;padding:16px 18px">
      <div style="${FONT};font-size:19px;font-weight:700;color:${C.ink}">The run did not produce a report</div>
      <div style="${FONT};font-size:13px;color:${C.muted};margin-top:4px">It stopped before the tests finished — usually a configuration or setup problem (for example a missing or expired token). Open the run log to see which step failed.</div>
    </td></tr></table></td></tr>`,
    runUrl
      ? `<tr><td class="px" style="padding:20px 28px 0">${button(runUrl, 'Open the run log on GitHub →')}</td></tr>`
      : '',
    `<tr><td style="padding:0 0 4px"></td></tr>`,
  ].join('\n');
  return {
    subject: `[PII API] Run failed — no report produced · ${date}`,
    html: shell('The run did not produce a report.', rows, ''),
    text: `The PII API run did not produce a report (configuration or setup failure).${runUrl ? `\nRun log: ${runUrl}` : ''}`,
  };
}
