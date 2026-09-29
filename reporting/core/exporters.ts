/** CSV / JSON / chat-summary exporters. Browser-safe; operate on already-sanitized report data. */
import { areaInfo, primaryEndpoint, suiteOf } from './catalog';
import {
  countStatuses,
  evaluateGates,
  executedCount,
  formatDuration,
  formatPct,
  healthScore,
  outcomeCounts,
  overallVerdict,
  passRate,
  scopeTests,
  SEVERITY_RANK,
  testOutcome,
} from './analytics';
import type { ReportData, ReportTest } from './types';

const CSV_COLUMNS: [string, (t: ReportTest) => string | number][] = [
  ['test_id', (t) => t.id],
  ['endpoint', (t) => primaryEndpoint(t.endpoints)],
  ['title', (t) => t.title],
  ['status', (t) => testOutcome(t).outcome],
  ['remarks', (t) => testOutcome(t).remark],
  ['what_it_does', (t) => t.info?.what ?? ''],
  ['why_it_matters', (t) => t.info?.why ?? ''],
  ['steps', (t) => (t.info?.steps ?? []).map((s, i) => `${i + 1}. ${s}`).join(' ')],
  ['expected_result', (t) => t.info?.expected ?? ''],
  ['test_type', (t) => t.info?.type ?? ''],
  ['suite', (t) => suiteOf(t.tags)],
  ['priority', (t) => t.info?.priority ?? ''],
  ['preconditions', (t) => t.info?.preconditions ?? ''],
  ['raw_status', (t) => (t.notRun ? 'NOT_RUN' : t.status)],
  ['category', (t) => areaInfo(t.area).label],
  ['severity', (t) => t.severity],
  ['endpoints', (t) => t.endpoints.join(' ')],
  ['duration_ms', (t) => Math.round(t.durationMs)],
  ['http_statuses', (t) => [...new Set(t.apiCalls.map((c) => c.status ?? 'none'))].join(' ')],
  ['api_calls', (t) => t.apiCalls.length],
  ['worker', (t) => t.workerIndex],
  ['retries', (t) => t.retries],
  ['tags', (t) => t.tags.join(' ')],
  ['project', (t) => t.project],
  ['file', (t) => `${t.file}:${t.line}`],
  ['started_at', (t) => t.startedAt ?? ''],
  [
    'blocked_reason',
    (t) =>
      t.annotations
        .filter((a) => a.type === 'blocked')
        .map((a) => a.description ?? '')
        .join(' | '),
  ],
];

function csvCell(value: string | number): string {
  const s = String(value);
  // Neutralise spreadsheet formula injection and quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function testsToCsv(tests: readonly ReportTest[]): string {
  const header = CSV_COLUMNS.map(([h]) => h).join(',');
  const rows = tests.map((t) => CSV_COLUMNS.map(([, get]) => csvCell(get(t))).join(','));
  return [header, ...rows].join('\n') + '\n';
}

/** Machine-readable results export (sanitized report data, same as data/results.json). */
export function resultsJson(report: ReportData, tests: readonly ReportTest[] = report.tests): string {
  const counts = countStatuses(tests);
  return JSON.stringify(
    {
      schemaVersion: report.schemaVersion,
      product: report.meta.product,
      dataSource: report.meta.dataSource,
      generatedAt: report.meta.generatedAt,
      run: report.run,
      environment: report.environment,
      subtitle: report.meta.subtitle,
      summary: { ...counts, passRate: passRate(counts), outcomes: outcomeCounts(tests) },
      tests: tests.map((t) => ({
        key: t.key,
        id: t.id,
        title: t.title,
        status: testOutcome(t).outcome,
        remarks: testOutcome(t).remark,
        rawStatus: t.notRun ? 'NOT_RUN' : t.status,
        description: t.info ?? null,
        area: t.area,
        severity: t.severity,
        endpoints: t.endpoints,
        durationMs: t.durationMs,
        retries: t.retries,
        tags: t.tags,
        apiCalls: t.apiCalls,
        errors: t.errors,
        annotations: t.annotations,
      })),
    },
    null,
    2,
  );
}

/** Concise Slack / ClickUp-ready summary. */
export function chatSummary(
  report: ReportData,
  tests: readonly ReportTest[] = scopeTests(report.tests),
): string {
  const c = countStatuses(tests);
  const o = outcomeCounts(tests);
  const health = healthScore(tests, report.endpoints, report.config.health);
  const verdict = overallVerdict(evaluateGates(tests, report.config.gates));
  const critical = tests
    .filter((t) => t.status === 'FAIL')
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, 8);
  const label = (t: ReportTest) =>
    testOutcome(t).outcome === 'Security finding' ? ' [security finding]' : '';
  const lines = [
    `${report.meta.product} — QA Summary${report.meta.dataSource === 'DEMO' ? ' [DEMO DATA — NOT REAL]' : ''}`,
    `Run: ${report.run.label} · Env: ${report.run.environment.toUpperCase()} · ${new Date(report.run.startedAt).toUTCString()}`,
    '',
    `Tests: ${c.total} (executed ${executedCount(c)})${
      tests.length < report.tests.length
        ? ` — service tests only; ${report.tests.length - tests.length} framework self-tests reported separately`
        : ''
    }`,
    `Pass: ${o.Pass}  Fail: ${o.Fail}  Security finding: ${o['Security finding']}  Blocked: ${o.Blocked}  Skipped: ${o.Skipped}  Not Tested: ${o['Not Tested']}`,
    `API Pass Rate: ${formatPct(passRate(c))}  ·  Test Health: ${health.score === null ? 'N/A' : `${Math.round(health.score)}% (${health.band})`}`,
    `Duration: ${formatDuration(report.run.durationMs)}`,
    `Verdict: ${verdict.verdict}`,
  ];
  if (critical.length) {
    lines.push(
      '',
      'Failures (by severity):',
      ...critical.map((t) => `- ${t.id} [${t.severity}]${label(t)} ${t.title.replace(/^\S+\s/, '')}`),
    );
  }
  return lines.join('\n');
}
