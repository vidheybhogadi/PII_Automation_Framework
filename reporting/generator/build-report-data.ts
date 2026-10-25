/** Enrich a CollectedRun with catalog knowledge, config and history → ReportData (the dashboard's only input). */
import { ENDPOINTS } from '../../m1/src/clients/endpoints';
import { flattenCalls } from '../core/analytics';
import { areaForId, ENDPOINT_DESCRIPTIONS, endpointsForId, severityFor } from '../core/catalog';
import { sanitizeText } from '../core/sanitize';
import { requestOf, validationOf } from '../core/test-case';
import type {
  CollectedRun,
  EndpointInfo,
  HistoryEntry,
  ReportConfig,
  ReportData,
  ReportTest,
} from '../core/types';
import { testCaseInfo } from '../../m1/tests/catalog';
import type { InventoryTest } from './inventory';
import { isM2Id, m2ApiAreas, m2ApiOf, m2TestInfo } from './m2-catalog';
import { knownSecrets, maskKnownSecrets } from './secrets';
import type { ApiExchange } from '../core/types';

/** Mask every known secret (the token, passwords) in a captured exchange — the last line of defence. */
/**
 * Aisle's generic error reply names its support mailbox ("…write to us at <address>@aisle.co.", staging 2026-10-23).
 * It is not personal data, but the report's self-check rightly refuses any real email address, so only this exact
 * phrase is replaced.
 */
const SUPPORT_ADDRESS = /write to us at [A-Za-z0-9._%+-]+@aisle\.co\b/g;
/** Subresource-integrity hashes in HTML pages (public asset digests) look like signatures to the self-check. */
const SRI_HASH = /integrity="sha(?:256|384|512)-[A-Za-z0-9+/=]+"/g;

function maskExchange(e: ApiExchange): ApiExchange {
  const secrets = knownSecrets();
  const m = (s: string) =>
    maskKnownSecrets(s, secrets)
      .replace(SUPPORT_ADDRESS, 'write to us at [Aisle support address]')
      .replace(SRI_HASH, 'integrity="[SRI hash]"');
  return {
    ...e,
    url: m(e.url),
    curl: m(e.curl),
    requestHeaders: Object.fromEntries(Object.entries(e.requestHeaders).map(([k, v]) => [k, m(v)])),
    requestBody: e.requestBody === null ? null : m(e.requestBody),
    responseBody: e.responseBody === null ? null : m(e.responseBody),
  };
}

export const PRODUCT = 'Aisle PII API Automation';
/** The architecture under test (QA automation calls only the Aisle facade). */
export const SUBTITLE = 'Aisle API → PII service → DB validation';
export const REPORT_VERSION = '1.0.0';

export function endpointInventory(): EndpointInfo[] {
  return Object.values(ENDPOINTS).map((e) => ({
    key: e.key,
    method: e.method,
    path: e.path,
    description: ENDPOINT_DESCRIPTIONS[e.key] ?? '',
    authenticated: e.authenticated,
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
        ...(c.auth ? { auth: c.auth } : {}),
        ...(c.transportError ? { transportError: sanitizeText(c.transportError, 60) } : {}),
        ...(c.phase ? { phase: c.phase } : {}),
        // Exact request/response for debugging (synthetic data in full; token masked again here).
        ...(c.exchange ? { exchange: maskExchange(c.exchange) } : {}),
      })),
      area,
      endpoints: resolveEndpoints(t.id),
      severity: severityFor(area),
      kind: area === 'framework' || t.project === 'unit' ? 'unit' : 'integration',
      milestone: milestoneOf(t.project),
      ...describe(t.id),
      ...m2ApiOf(t.id, t.title, t.tags),
    };
  });
}

/** Milestone of a Playwright project: m2-* projects are Milestone 2, everything else Milestone 1. */
export const milestoneOf = (project: string) => (project.startsWith('m2') ? 'M2' : 'M1');

/**
 * The endpoints a test belongs to. Order of precedence:
 *   1. `endpoint` in its m1/tests/catalog entry (explicit — how a new test says where it belongs)
 *   2. a per-test override in reporting/core/catalog.ts
 *   3. the default for its ID prefix (PII-WR → Save PII, PII-RD → Read PII, …)
 * The first entry is the heading it is listed under; none (or several) = "Across endpoints".
 */
export function resolveEndpoints(id: string): string[] {
  // M2 tests are listed under "Across endpoints"; group them by Type / Suite / Category instead.
  if (isM2Id(id)) return [];
  const declared = testCaseInfo(id)?.endpoint;
  if (declared === 'crossEndpoint') return [];
  if (declared) return [declared];
  return endpointsForId(id, areaForId(id));
}

/** Attach the plain-English description from m1/tests/catalog (sanitized like every other text field). */
function describe(id: string): Pick<ReportTest, 'info'> {
  const m2 = m2TestInfo(id);
  if (m2) {
    return {
      info: {
        ...m2,
        what: sanitizeText(m2.what, 600),
        why: sanitizeText(m2.why, 600),
        steps: m2.steps.map((s) => sanitizeText(s, 300)),
        expected: sanitizeText(m2.expected, 800),
        ...(m2.preconditions ? { preconditions: sanitizeText(m2.preconditions, 400) } : {}),
        validation: (m2.validation ?? []).map((v) => sanitizeText(v, 300)),
      },
    };
  }
  const info = testCaseInfo(id);
  if (!info) return {};
  // request / validation may still be missing while the catalog is being filled in — omit them then.
  const request = requestOf(info);
  const validation = validationOf(info).map((v) => sanitizeText(v, 300));
  return {
    info: {
      what: sanitizeText(info.what, 600),
      why: sanitizeText(info.why, 600),
      steps: info.steps.map((s) => sanitizeText(s, 300)),
      expected: sanitizeText(info.expected, 800),
      type: info.type,
      priority: info.priority,
      ...(info.preconditions ? { preconditions: sanitizeText(info.preconditions, 400) } : {}),
      ...(request ? { request: sanitizeText(request, 800) } : {}),
      ...(validation.length ? { validation } : {}),
    },
  };
}

/**
 * Tests that exist in the suite but were not part of this run, as "Not Tested" entries — so the report always
 * lists every test. They are flagged `notRun` and excluded from health, gates, history and comparisons.
 */
export function notRunTests(inventory: readonly InventoryTest[], ran: readonly ReportTest[]): ReportTest[] {
  const seen = new Set(ran.map((t) => t.key));
  return inventory
    .filter((t) => !seen.has(t.key))
    .map((t) => {
      const area = areaForId(t.id);
      return {
        key: t.key,
        id: t.id,
        title: sanitizeText(t.title, 300),
        suite: sanitizeText(t.suite, 300),
        file: t.file,
        line: t.line,
        project: t.project,
        tags: t.tags,
        status: 'SKIPPED' as const,
        rawStatus: 'skipped',
        outcome: 'skipped' as const,
        durationMs: 0,
        startedAt: null,
        workerIndex: -1,
        parallelIndex: -1,
        retries: 0,
        annotations: [{ type: 'not-run', description: 'Not part of this run' }],
        errors: [],
        steps: [],
        apiCalls: [],
        area,
        endpoints: resolveEndpoints(t.id),
        severity: severityFor(area),
        kind: area === 'framework' || t.project === 'unit' ? ('unit' as const) : ('integration' as const),
        milestone: milestoneOf(t.project),
        notRun: true,
        ...describe(t.id),
        ...m2ApiOf(t.id, t.title, t.tags),
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
      `Service readiness check failed at startup (${why}) — ${preflight.length} service test(s) could not reach the Aisle PII facade. Endpoint, security, DB and performance views reflect the environment, not the service.`,
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
  inventory: readonly InventoryTest[] = [],
): ReportData {
  const ran = enrichTests(run);
  const tests = [...ran, ...notRunTests(inventory, ran)];
  return {
    schemaVersion: 1,
    meta: {
      product: PRODUCT,
      subtitle: SUBTITLE,
      reportVersion: REPORT_VERSION,
      generatedAt: generatedAt.toISOString(),
      dataSource: run.dataSource,
      pdfFile: null,
      excelFile: null,
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
    ...(tests.some((t) => t.apiArea) ? { apiAreas: m2ApiAreas(tests) } : {}),
    config,
    history: history.filter((h) => h.runId !== run.run.runId && h.dataSource === run.dataSource),
    diagnostics: diagnose(run, ran),
  };
}
