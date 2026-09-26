/** Enrich a CollectedRun with catalog knowledge, config and history → ReportData (the dashboard's only input). */
import { ENDPOINTS } from '../../src/clients/endpoints';
import { flattenCalls } from '../core/analytics';
import { areaForId, ENDPOINT_DESCRIPTIONS, endpointsForId, severityFor } from '../core/catalog';
import { sanitizeText } from '../core/sanitize';
import type {
  CollectedRun,
  EndpointInfo,
  HistoryEntry,
  ReportConfig,
  ReportData,
  ReportTest,
} from '../core/types';

export const PRODUCT = 'PII Sentinel';
export const SUBTITLE = 'Aisle PII API Quality & Security Intelligence';
export const REPORT_VERSION = '1.0.0';

export function endpointInventory(): EndpointInfo[] {
  return Object.values(ENDPOINTS).map((e) => ({
    key: e.key,
    method: e.method,
    path: e.path,
    description: ENDPOINT_DESCRIPTIONS[e.key] ?? '',
    authenticated: e.authenticated,
    permission: e.permission,
    noStore: e.noStore,
  }));
}

export function enrichTests(run: CollectedRun): ReportTest[] {
  return run.tests.map((t) => {
    const area = areaForId(t.id);
    // Defence in depth: re-sanitize EVERY free-text field, even though the collector already did.
    return {
      ...t,
      title: sanitizeText(t.title, 300),
      suite: sanitizeText(t.suite, 300),
      errors: t.errors.map((e) => ({
        message: sanitizeText(e.message),
        ...(e.location ? { location: sanitizeText(e.location, 300) } : {}),
      })),
      annotations: t.annotations.map((a) => ({
        type: sanitizeText(a.type, 40),
        ...(a.description ? { description: sanitizeText(a.description, 400) } : {}),
      })),
      steps: t.steps.map((st) => ({ ...st, title: sanitizeText(st.title, 200) })),
      apiCalls: t.apiCalls.map((c) => ({
        endpoint: sanitizeText(c.endpoint, 80),
        method: sanitizeText(c.method, 10),
        path: sanitizeText(c.path, 200),
        status: c.status,
        durationMs: c.durationMs,
        ...(c.errorCode ? { errorCode: sanitizeText(c.errorCode, 60) } : {}),
        ...(c.requestId ? { requestId: sanitizeText(c.requestId, 80) } : {}),
        ...(c.caller ? { caller: sanitizeText(c.caller, 80) } : {}),
        ...(c.transportError ? { transportError: sanitizeText(c.transportError, 60) } : {}),
        ...(c.phase ? { phase: c.phase } : {}),
      })),
      area,
      endpoints: endpointsForId(t.id, area),
      severity: severityFor(area),
      kind: area === 'framework' || t.project === 'unit' ? 'unit' : 'integration',
      milestone: 'M1',
    };
  });
}

/** Data-completeness diagnostics shown as a banner (never fatal). */
export function diagnose(run: CollectedRun, tests: readonly ReportTest[]): string[] {
  const out = [...run.diagnostics];
  const integration = tests.filter((t) => t.kind === 'integration');
  const executedIntegration = integration.filter((t) => t.status === 'PASS' || t.status === 'FAIL');
  const calls = flattenCalls(integration);
  if (tests.length === 0) out.push('The run recorded no tests.');
  if (integration.length === 0 && tests.length > 0)
    out.push(
      'Only framework self-tests were recorded — endpoint, security, DB and performance views have no service data.',
    );
  const preflight = integration.filter((t) => t.annotations.some((a) => a.type === 'preflight'));
  if (preflight.length > 0) {
    const why = preflight[0]?.annotations.find((a) => a.type === 'preflight')?.description ?? 'not ready';
    out.push(
      `Service readiness check failed at startup (${why}) — ${preflight.length} service test(s) could not reach the PII service. Endpoint, security, DB and performance views reflect the environment, not the service.`,
    );
  } else if (executedIntegration.length > 0 && calls.every((c) => c.phase === 'preflight'))
    out.push(
      'Integration tests executed but no API calls were recorded — performance metrics are unavailable.',
    );
  if (calls.length > 0 && calls.every((c) => c.status === null))
    out.push('All recorded API calls failed before an HTTP response — latency metrics are unavailable.');
  const unknown = tests.filter((t) => t.status === 'UNKNOWN').length;
  if (unknown > 0)
    out.push(
      `${unknown} test(s) have status UNKNOWN (not run — e.g. run interrupted or max-failures reached).`,
    );
  if (tests.some((t) => (t.status === 'PASS' || t.status === 'FAIL') && !t.startedAt))
    out.push('Some executed tests have no start time — the execution timeline is partial.');
  return out;
}

export function buildReportData(
  run: CollectedRun,
  config: ReportConfig,
  history: HistoryEntry[],
  generatedAt = new Date(),
): ReportData {
  const tests = enrichTests(run);
  return {
    schemaVersion: 1,
    meta: {
      product: PRODUCT,
      subtitle: SUBTITLE,
      reportVersion: REPORT_VERSION,
      generatedAt: generatedAt.toISOString(),
      dataSource: run.dataSource,
      pdfFile: null,
    },
    run: {
      ...run.run,
      label: sanitizeText(run.run.label, 120),
      command: sanitizeText(run.run.command, 300),
      environment: sanitizeText(run.run.environment, 60),
      ...(run.run.profile ? { profile: sanitizeText(run.run.profile, 200) } : {}),
    },
    environment: run.environment,
    tests,
    endpoints: endpointInventory(),
    config,
    history: history.filter((h) => h.runId !== run.run.runId && h.dataSource === run.dataSource),
    diagnostics: diagnose(run, tests),
  };
}
