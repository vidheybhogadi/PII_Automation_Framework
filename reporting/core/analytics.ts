/**
 * Analytics engine — pure, browser-safe functions over ReportTest[].
 *
 * Integrity rules (enforced here, relied on by the UI):
 *   - Every number is derived from recorded test results / API calls. Nothing is estimated or invented.
 *   - Missing inputs produce null (rendered as "N/A" with an explanation), never 0 or a guess.
 *   - Failure "patterns" are classifications of the observed error text, not root causes.
 */
import { areaInfo } from './catalog';
import type {
  CallPhase,
  Counts,
  EndpointInfo,
  GateRule,
  HealthConfig,
  HistoryEntry,
  ReportData,
  ReportTest,
  Severity,
  TestStatus,
} from './types';

// ---- Basics -----------------------------------------------------------------------------------------

export function emptyCounts(): Counts {
  return { total: 0, PASS: 0, FAIL: 0, SKIPPED: 0, BLOCKED: 0, FIXME: 0, UNKNOWN: 0 };
}

export function countStatuses(tests: readonly { status: TestStatus }[]): Counts {
  const c = emptyCounts();
  for (const t of tests) {
    c.total += 1;
    c[t.status] += 1;
  }
  return c;
}

export const executedCount = (c: Counts): number => c.PASS + c.FAIL;
export const notExecutedCount = (c: Counts): number => c.SKIPPED + c.BLOCKED + c.FIXME + c.UNKNOWN;

/** Pass rate over EXECUTED tests (passed / (passed + failed)). null when nothing executed. */
export function passRate(c: Counts): number | null {
  const executed = executedCount(c);
  return executed === 0 ? null : c.PASS / executed;
}

export function ratio(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

/** Linear-interpolated percentile (same method as numpy's default). */
export function percentile(sortedAsc: readonly number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0] as number;
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const a = sortedAsc[lo] as number;
  const b = sortedAsc[hi] as number;
  return a + (b - a) * (rank - lo);
}

export interface LatencyStats {
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
}

export function latencyStats(values: readonly number[]): LatencyStats | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const sum = s.reduce((acc, v) => acc + v, 0);
  const p = (q: number) => percentile(s, q) as number;
  return {
    count: s.length,
    min: s[0] as number,
    max: s[s.length - 1] as number,
    avg: sum / s.length,
    p50: p(50),
    p75: p(75),
    p90: p(90),
    p95: p(95),
    p99: p(99),
  };
}

// ---- Scope & coverage helpers -------------------------------------------------------------------------

/**
 * Default reporting scope: SERVICE (integration) tests whenever the run contains any, otherwise everything.
 * Framework self-tests never inflate service pass rates — they are reported as their own gate.
 */
export function scopeTests<T extends { kind: 'integration' | 'unit'; notRun?: boolean }>(
  tests: readonly T[],
): T[] {
  // Only tests that were part of the run: health, gates, history and comparisons measure what actually ran.
  const ran = tests.filter((t) => !t.notRun);
  const service = ran.filter((t) => t.kind === 'integration');
  return service.length ? service : ran;
}

/** Every service test in the suite, including ones not part of this run — for lists, tiles and exports. */
export function catalogTests<T extends { kind: 'integration' | 'unit'; notRun?: boolean }>(
  tests: readonly T[],
): T[] {
  const service = tests.filter((t) => t.kind === 'integration');
  return service.length ? service : tests.filter((t) => !t.notRun);
}

/**
 * The statuses a reader sees, in display / sort order (most urgent first):
 *   Fail             — the test ran and found a problem (automation failure).
 *   Security finding — the test ran and failed on a KNOWN security issue (annotation `security-finding`). Still a
 *                      failure for gates and the verdict, but shown apart from ordinary failures.
 *   Blocked          — cannot run until Dev answers / grants access (status BLOCKED/FIXME, or skipped with a
 *                      `blocked` annotation). Neither a pass nor a failure.
 *   Skipped          — skipped in this run for another reason (e.g. optional setup missing).
 *   Not Tested       — not part of this run, the run stopped first, or the Aisle PII facade was unreachable.
 *   Not Applicable   — Dev CONFIRMED the feature is intentionally unsupported (skipped with a `not-applicable`
 *                      annotation, "BQ-xx: <answer>"). Neither a pass nor a failure, and left out of pass rate,
 *                      quality gates, health and "checks that ran" — there is nothing to test.
 *   Pass             — the test ran and everything was as expected.
 */
export const OUTCOMES = [
  'Fail',
  'Security finding',
  'Blocked',
  'Skipped',
  'Not Tested',
  'Not Applicable',
  'Pass',
] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** Annotation marking a test that fails on a known, reported security issue (e.g. "BQ-08: …"). */
export const SECURITY_FINDING_ANNOTATION = 'security-finding';
export const SECURITY_FINDING_PREFIX = 'SECURITY FINDING (expected until Dev fixes it) — ';

/** Annotation marking a feature Dev confirmed is intentionally unsupported (helper `notApplicable()`). */
export const NOT_APPLICABLE_ANNOTATION = 'not-applicable';
export const NOT_APPLICABLE_PREFIX = 'NOT APPLICABLE — ';

/** A test that did not run because Dev confirmed the feature is intentionally unsupported. */
export function isNotApplicable(t: Pick<ReportTest, 'status' | 'annotations' | 'notRun'>): boolean {
  return (
    !t.notRun &&
    t.status !== 'PASS' &&
    t.status !== 'FAIL' &&
    t.annotations.some((a) => a.type === NOT_APPLICABLE_ANNOTATION)
  );
}

/** Tests that count towards gates, health and "checks that ran": everything except Not Applicable. */
export function applicableTests<T extends Pick<ReportTest, 'status' | 'annotations' | 'notRun'>>(
  tests: readonly T[],
): T[] {
  return tests.filter((t) => !isNotApplicable(t));
}

/** A failed test that carries a `security-finding` annotation. */
export function isSecurityFinding(t: Pick<ReportTest, 'status' | 'annotations'>): boolean {
  return t.status === 'FAIL' && t.annotations.some((a) => a.type === SECURITY_FINDING_ANNOTATION);
}

/** One of the statuses above plus a one-line reason (why it failed, is blocked, or was not tested). */
export function testOutcome(t: ReportTest): { outcome: Outcome; remark: string } {
  const note = (type: string) => t.annotations.find((a) => a.type === type)?.description ?? '';
  if (t.notRun) return { outcome: 'Not Tested', remark: 'Not part of this run' };
  if (t.annotations.some((a) => a.type === 'preflight'))
    return {
      outcome: 'Not Tested',
      remark: 'The Aisle PII facade could not be reached, so this test could not run',
    };
  if (t.status === 'PASS') return { outcome: 'Pass', remark: '' };
  if (t.status === 'FAIL') {
    const f = analyzeFailure(t);
    const remark =
      f.expected && f.received
        ? `Expected ${f.expected}, got ${f.received}`
        : f.message
            .split('\n')
            .find((l) => l.trim().length > 0)
            ?.trim() || FAILURE_PATTERNS[f.pattern].label;
    if (isSecurityFinding(t)) {
      // Only the (already sanitized) annotation text or the sanitized failure summary — never raw values.
      const why = note(SECURITY_FINDING_ANNOTATION) || remark;
      return { outcome: 'Security finding', remark: `${SECURITY_FINDING_PREFIX}${why}`.slice(0, 400) };
    }
    return { outcome: 'Fail', remark: remark.slice(0, 300) };
  }
  if (isNotApplicable(t))
    return {
      outcome: 'Not Applicable',
      remark:
        `${NOT_APPLICABLE_PREFIX}${note(NOT_APPLICABLE_ANNOTATION) || 'confirmed by Dev as not supported'}`.slice(
          0,
          400,
        ),
    };
  const blockedWhy = note('blocked') || note('fixme');
  if (
    t.status === 'BLOCKED' ||
    t.status === 'FIXME' ||
    (t.status === 'SKIPPED' && t.annotations.some((a) => a.type === 'blocked'))
  )
    return {
      outcome: 'Blocked',
      remark: `BLOCKED — ${blockedWhy || 'waiting on an answer from Dev'}`.slice(0, 400),
    };
  if (t.status === 'SKIPPED') return { outcome: 'Skipped', remark: note('skip') || 'Skipped in this run' };
  return { outcome: 'Not Tested', remark: 'The run stopped before this test' };
}

/**
 * The dependency / blocker behind a test's outcome — "BQ-xx: reason" for Blocked, Not Applicable and Security
 * finding (from the annotation text, already sanitized), '' for everything else.
 */
export function dependencyOf(t: ReportTest): string {
  const outcome = testOutcome(t).outcome;
  const types: Partial<Record<Outcome, string[]>> = {
    Blocked: ['blocked', 'fixme'],
    'Not Applicable': [NOT_APPLICABLE_ANNOTATION],
    'Security finding': [SECURITY_FINDING_ANNOTATION],
  };
  const wanted = types[outcome];
  if (!wanted) return '';
  const notes = [
    ...new Set(
      t.annotations.filter((a) => wanted.includes(a.type) && a.description).map((a) => a.description),
    ),
  ];
  return notes.join(' | ') || testOutcome(t).remark;
}

/** How many tests have each outcome (every outcome present, zero when none). */
export function outcomeCounts(tests: readonly ReportTest[]): Record<Outcome, number> {
  const c = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<Outcome, number>;
  for (const t of tests) c[testOutcome(t).outcome] += 1;
  return c;
}

export function scopeOf(tests: readonly { kind: 'integration' | 'unit' }[]): 'service' | 'all' {
  return tests.some((t) => t.kind === 'integration') ? 'service' : 'all';
}

/** Calls that belong to the behaviour under test (older data without a phase counts as test). */
export const isTestPhase = (c: { phase?: string }): boolean => !c.phase || c.phase === 'test';

/**
 * Endpoints that were actually exercised: at least one integration test received an HTTP response from it
 * (preflight calls excluded). Tests that "executed" but never reached the service do not count.
 */
export function coveredEndpoints(
  tests: readonly ReportTest[],
  endpoints: readonly EndpointInfo[],
): EndpointInfo[] {
  const responded = new Set<string>();
  for (const t of tests) {
    if (t.kind !== 'integration') continue;
    for (const c of t.apiCalls) if (c.status !== null && c.phase !== 'preflight') responded.add(c.endpoint);
  }
  return endpoints.filter((e) => responded.has(e.key));
}

/** Records created by tests that could not be removed through an approved API. */
export function dataLeftBehind(tests: readonly ReportTest[]): number {
  return tests.reduce((s, t) => s + (t.cleanup?.leftBehind ?? 0), 0);
}

/** Tests that failed because the service was not ready at worker startup. */
export function preflightFailures(tests: readonly ReportTest[]): ReportTest[] {
  return tests.filter((t) => t.annotations.some((a) => a.type === 'preflight'));
}

export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

// ---- API calls & performance ---------------------------------------------------------------------------

export interface FlatCall {
  testKey: string;
  testId: string;
  endpoint: string;
  method: string;
  path: string;
  status: number | null;
  errorCode?: string;
  durationMs: number;
  requestId?: string;
  transportError?: string;
  phase?: CallPhase;
}

export function flattenCalls(tests: readonly ReportTest[]): FlatCall[] {
  const out: FlatCall[] = [];
  for (const t of tests) {
    for (const c of t.apiCalls) out.push({ ...c, testKey: t.key, testId: t.id });
  }
  return out;
}

/** Only calls that received an HTTP response contribute to latency statistics. */
export function responseLatencies(calls: readonly FlatCall[]): number[] {
  return calls.filter((c) => c.status !== null).map((c) => c.durationMs);
}

// ---- Areas & endpoints ------------------------------------------------------------------------------

export interface EndpointStat {
  endpoint: EndpointInfo;
  tests: ReportTest[];
  counts: Counts;
  passRate: number | null;
  latency: LatencyStats | null;
  statusCodes: Record<string, number>;
  slowestTest: ReportTest | null;
  securityTests: number;
  dbTests: number;
  callCount: number;
  /** Calls that were the request under test (excludes setup / verify / preflight). */
  testCallCount: number;
}

export function endpointStats(
  tests: readonly ReportTest[],
  endpoints: readonly EndpointInfo[],
  calls: readonly FlatCall[] = flattenCalls(tests),
): EndpointStat[] {
  return endpoints.map((endpoint) => {
    const mapped = tests.filter((t) => t.endpoints.includes(endpoint.key));
    const counts = countStatuses(mapped);
    const epCalls = calls.filter((c) => c.endpoint === endpoint.key && c.phase !== 'preflight');
    const statusCodes: Record<string, number> = {};
    for (const c of epCalls) {
      const k = c.status === null ? 'no response' : String(c.status);
      statusCodes[k] = (statusCodes[k] ?? 0) + 1;
    }
    const executed = mapped.filter((t) => t.status === 'PASS' || t.status === 'FAIL');
    const slowestTest = executed.length
      ? executed.reduce((a, b) => (b.durationMs > a.durationMs ? b : a))
      : null;
    return {
      endpoint,
      tests: mapped,
      counts,
      passRate: passRate(counts),
      latency: latencyStats(responseLatencies(epCalls)),
      statusCodes,
      slowestTest,
      securityTests: mapped.filter((t) => areaInfo(t.area).security).length,
      dbTests: mapped.filter((t) => areaInfo(t.area).db).length,
      callCount: epCalls.length,
      testCallCount: epCalls.filter(isTestPhase).length,
    };
  });
}

// ---- Failure intelligence ------------------------------------------------------------------------

export type FailurePatternKey =
  | 'CONNECTIVITY'
  | 'CONFIGURATION'
  | 'UNEXPECTED_401'
  | 'UNEXPECTED_403'
  | 'UNEXPECTED_404'
  | 'UNEXPECTED_4XX'
  | 'UNEXPECTED_2XX'
  | 'SERVER_ERROR'
  | 'CONTRACT'
  | 'VALUE_MISMATCH'
  | 'TIMEOUT'
  | 'ASSERTION'
  | 'UNCLASSIFIED';

export const FAILURE_PATTERNS: Record<FailurePatternKey, { label: string; investigate: string[] }> = {
  CONNECTIVITY: {
    label: 'No HTTP response (connectivity)',
    investigate: [
      'AISLE_BASE_URL and network/VPN access',
      'Facade health: GET /api/v1/pii-test/health/ready (needs the token)',
      'Firewall / DNS for the runner',
    ],
  },
  CONFIGURATION: {
    label: 'Missing or invalid configuration',
    investigate: ['The variable named in the message', 'docs/setup-guide.md §3', 'npm run check-env'],
  },
  UNEXPECTED_401: {
    label: 'Unexpected 401 (authentication)',
    investigate: [
      'AISLE_TEST_TOKEN is set, valid and not expired',
      'Authorization header format (Bearer <token>)',
      'Token accepted by this environment (e.g. staging vs. QA)',
    ],
  },
  UNEXPECTED_403: {
    label: 'Unexpected 403 (authorization)',
    investigate: [
      'Field/action access granted to the Aisle caller (see the BQ list)',
      'FREE_TEXT capability grants',
    ],
  },
  UNEXPECTED_404: {
    label: 'Unexpected 404 (not found)',
    investigate: [
      'Test data setup step',
      'Tenant ID / ownership (caller + tenant)',
      'Expiry or consumption of transient data',
    ],
  },
  UNEXPECTED_4XX: {
    label: 'Unexpected client error',
    investigate: ['Request contract vs. integration guide', 'Validation rules / limits for this environment'],
  },
  UNEXPECTED_2XX: {
    label: 'Unexpectedly accepted (2xx)',
    investigate: [
      'Server-side validation / authentication for this negative case',
      'Whether the contract changed (confirm with backend)',
      'Data possibly persisted by the accepted request',
    ],
  },
  SERVER_ERROR: {
    label: 'Server error (5xx)',
    investigate: ['Server logs for the request ID', 'KEY_UNAVAILABLE / DATABASE_ERROR infrastructure'],
  },
  CONTRACT: {
    label: 'Response contract mismatch',
    investigate: ['Response schema changes vs. the integration guide', 'New/removed fields in the envelope'],
  },
  VALUE_MISMATCH: {
    label: 'Value mismatch (redacted comparison)',
    investigate: ['Normalization rules', 'Replacement / upsert behaviour', 'Test data collisions'],
  },
  TIMEOUT: { label: 'Test timeout', investigate: ['Service latency', 'PII_HTTP_TIMEOUT_MS / test timeout'] },
  ASSERTION: { label: 'Assertion failed', investigate: ['Assertion location in the test source'] },
  UNCLASSIFIED: { label: 'Unclassified failure', investigate: ['Full error message in the test detail'] },
};

export interface FailureInsight {
  test: ReportTest;
  pattern: FailurePatternKey;
  expected: string | null;
  received: string | null;
  httpStatus: number | null;
  errorCode: string | null;
  assertion: string | null;
  message: string;
  requestId: string | null;
}

export function analyzeFailure(test: ReportTest): FailureInsight {
  const message = test.errors.map((e) => e.message).join('\n');
  const firstLine = message.split('\n').find((l) => l.trim().length > 0) ?? '';
  let expected: string | null = null;
  let received: string | null = null;
  let httpStatus: number | null = null;
  let errorCode: string | null = null;
  let assertion: string | null = null;

  const http =
    /expected (?:HTTP|error code) ([A-Z0-9_ ]+?(?: or [A-Z0-9_]+)*) but got (?:[A-Z]+ \S+ -> )?HTTP (\d{3})(?: code=([A-Z_]+))?/i.exec(
      message,
    );
  if (http) {
    expected = http[1]?.trim() ?? null;
    httpStatus = Number(http[2]);
    errorCode = http[3] ?? null;
    received = `HTTP ${httpStatus}${errorCode ? ` ${errorCode}` : ''}`;
    assertion = /error code/i.test(http[0]) ? 'Response error.code' : 'Response HTTP status';
  } else {
    const exp = /Expected[^:\n]*:\s*(.+)/.exec(message);
    const rec = /Received[^:\n]*:\s*(.+)/.exec(message);
    if (exp) expected = exp[1]?.trim().slice(0, 200) ?? null;
    if (rec) received = rec[1]?.trim().slice(0, 200) ?? null;
    // Prefer the call under test over setup/verification calls.
    const call =
      [...test.apiCalls].reverse().find((c) => isTestPhase(c) && c.status !== null && c.status >= 400) ??
      [...test.apiCalls].reverse().find((c) => c.status !== null && c.status >= 400);
    if (call) {
      httpStatus = call.status;
      errorCode = call.errorCode ?? null;
    }
  }
  const matcher = /expect\([^)]*\)\.(\w+)/.exec(message);
  if (!assertion && matcher) assertion = `expect(…).${matcher[1]}`;
  if (!assertion && /: value mismatch/.test(message)) assertion = firstLine.split(':')[0] ?? null;

  let pattern: FailurePatternKey = 'UNCLASSIFIED';
  if (test.rawStatus === 'timedOut') pattern = 'TIMEOUT';
  else if (
    /ApiTransportError|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|failed before an HTTP response/.test(
      message,
    )
  )
    pattern = 'CONNECTIVITY';
  else if (/ConfigError|DbConfigError|is not configured|DB_ENGINE=none/.test(message))
    pattern = 'CONFIGURATION';
  else if (/contract violation|keys differ from the documented contract/.test(message)) pattern = 'CONTRACT';
  else if (httpStatus !== null && httpStatus >= 500) pattern = 'SERVER_ERROR';
  else if (httpStatus === 401) pattern = 'UNEXPECTED_401';
  else if (httpStatus === 403) pattern = 'UNEXPECTED_403';
  else if (httpStatus === 404) pattern = 'UNEXPECTED_404';
  else if (httpStatus !== null && httpStatus >= 400) pattern = 'UNEXPECTED_4XX';
  else if (http && httpStatus !== null && httpStatus < 400) pattern = 'UNEXPECTED_2XX';
  else if (/value mismatch/.test(message)) pattern = 'VALUE_MISMATCH';
  else if (/expect\(|Expected/.test(message)) pattern = 'ASSERTION';

  const requestId =
    /requestId=([0-9a-f-]{8,})/i.exec(message)?.[1] ??
    [...test.apiCalls].reverse().find((c) => isTestPhase(c) && c.requestId)?.requestId ??
    [...test.apiCalls].reverse().find((c) => c.requestId)?.requestId ??
    null;

  return { test, pattern, expected, received, httpStatus, errorCode, assertion, message, requestId };
}

export function questionIdOf(test: ReportTest, type = 'blocked'): string | null {
  for (const a of test.annotations) {
    const m = /\b(B?Q-\d+)\b/.exec(`${a.description ?? ''}`);
    if (a.type === type && m) return m[1] as string;
  }
  return null;
}

// ---- Quality gates ---------------------------------------------------------------------------------

export type GateStatus = 'PASS' | 'WARNING' | 'FAIL' | 'NOT RUN';

export interface GateResult {
  gate: GateRule;
  status: GateStatus;
  counts: Counts;
  failedIds: string[];
  reason: string;
}

export function evaluateGates(tests: readonly ReportTest[], gates: readonly GateRule[]): GateResult[] {
  // Not Applicable tests are neither run nor missing: a gate never waits on them.
  const applicable = applicableTests(tests);
  return gates.map((gate) => {
    const inGate = applicable.filter((t) => gate.areas.includes(t.area));
    const counts = countStatuses(inGate);
    const failedIds = inGate.filter((t) => t.status === 'FAIL').map((t) => t.id);
    let status: GateStatus;
    let reason: string;
    if (counts.total === 0 || executedCount(counts) === 0) {
      status = 'NOT RUN';
      reason = counts.total === 0 ? 'No tests for this gate in this run' : 'Tests present but none executed';
    } else if (counts.FAIL > 0) {
      status = 'FAIL';
      reason = `${counts.FAIL} failed`;
    } else if (gate.warnOnNotExecuted && notExecutedCount(counts) > 0) {
      status = 'WARNING';
      reason = `${notExecutedCount(counts)} not executed (blocked/skipped)`;
    } else {
      status = 'PASS';
      reason = `${counts.PASS}/${executedCount(counts)} passed`;
    }
    return { gate, status, counts, failedIds, reason };
  });
}

export type OverallVerdict = 'PASSED' | 'ATTENTION REQUIRED' | 'FAILED' | 'INCOMPLETE' | 'NOT EVALUATED';

export function overallVerdict(results: readonly GateResult[]): {
  verdict: OverallVerdict;
  explanation: string;
} {
  const run = results.filter((r) => r.status !== 'NOT RUN');
  if (run.length === 0) return { verdict: 'NOT EVALUATED', explanation: 'No gate had executed tests.' };
  const criticalFail = results.filter((r) => r.status === 'FAIL' && r.gate.critical);
  if (criticalFail.length)
    return {
      verdict: 'FAILED',
      explanation: `Critical gate(s) failed: ${criticalFail.map((r) => r.gate.label).join(', ')}.`,
    };
  if (results.some((r) => r.status === 'FAIL' || r.status === 'WARNING'))
    return {
      verdict: 'ATTENTION REQUIRED',
      explanation: 'Non-critical failures or tests not executed in one or more gates.',
    };
  // Only CRITICAL gates that did not run make the verdict incomplete (e.g. framework self-tests not in scope do not).
  const criticalNotRun = results.filter((r) => r.status === 'NOT RUN' && r.gate.critical);
  if (criticalNotRun.length)
    return {
      verdict: 'INCOMPLETE',
      explanation: `All executed gates passed, but these critical gates were not run: ${criticalNotRun.map((r) => r.gate.label).join(', ')}.`,
    };
  return { verdict: 'PASSED', explanation: 'All quality gates passed.' };
}

// ---- Health score (transparent) ----------------------------------------------------------------------

export interface HealthComponent {
  key: 'passRate' | 'criticalPassRate' | 'completion' | 'endpointCoverage';
  label: string;
  value: number | null;
  weight: number;
  explain: string;
}

export interface HealthScore {
  score: number | null;
  band: string;
  components: HealthComponent[];
  capped: boolean;
  formula: string;
}

export function healthScore(
  allTests: readonly ReportTest[],
  endpoints: readonly EndpointInfo[],
  cfg: HealthConfig,
): HealthScore {
  // Checks that never reached the service (readiness check failed at startup) say nothing about the
  // service's health — they are left out, so an unreachable service gives "N/A", not a low score.
  // Not Applicable tests (feature confirmed unsupported) are left out too — there is nothing to execute.
  const unreachable = new Set(preflightFailures(allTests));
  const tests = applicableTests(allTests).filter((t) => !unreachable.has(t));
  const counts = countStatuses(tests);
  const critical = tests.filter((t) => t.severity === 'critical');
  const criticalCounts = countStatuses(critical);
  const integration = tests.filter((t) => t.kind === 'integration');
  const covered = coveredEndpoints(tests, endpoints).length;

  const components: HealthComponent[] = [
    {
      key: 'passRate',
      label: 'API Pass Rate',
      value: passRate(counts),
      weight: cfg.weights.passRate,
      explain:
        'Passed ÷ executed (passed + failed). Skipped, blocked and Not Applicable tests are excluded here.',
    },
    {
      key: 'criticalPassRate',
      label: 'Critical pass rate',
      value: passRate(criticalCounts),
      weight: cfg.weights.criticalPassRate,
      explain: 'Pass rate of critical-severity tests (auth, authz, isolation, security, DB, POC).',
    },
    {
      key: 'completion',
      label: 'Execution completeness',
      value: ratio(executedCount(counts), counts.total),
      weight: cfg.weights.completion,
      explain:
        'Executed ÷ total. Blocked, skipped and fixme tests lower this component; Not Applicable tests are left out.',
    },
    {
      key: 'endpointCoverage',
      label: 'Endpoint Coverage',
      value: integration.length ? ratio(covered, endpoints.length) : null,
      weight: cfg.weights.endpointCoverage,
      explain: `Endpoints that returned at least one HTTP response to a service test ÷ ${endpoints.length} documented endpoints.`,
    },
  ];

  const formula =
    'score = Σ(weight × component) ÷ Σ(weight of available components) × 100; ' +
    `capped at ${cfg.capOnCriticalFailure} if any critical test failed; N/A when nothing executed.`;

  // Nothing ran, or only the framework's own self-tests ran: that says nothing about the Aisle PII API.
  if (executedCount(counts) === 0 || integration.length === 0)
    return { score: null, band: 'N/A', components, capped: false, formula };

  const available = components.filter((c) => c.value !== null);
  const weightSum = available.reduce((s, c) => s + c.weight, 0);
  let score = (available.reduce((s, c) => s + c.weight * (c.value as number), 0) / weightSum) * 100;
  const capped = criticalCounts.FAIL > 0 && score > cfg.capOnCriticalFailure;
  if (capped) score = cfg.capOnCriticalFailure;
  score = Math.round(score * 10) / 10;
  const band = [...cfg.bands].sort((a, b) => b.min - a.min).find((b) => score >= b.min)?.label ?? 'Critical';
  return { score, band, components, capped, formula };
}

// ---- Security / coverage / requirements --------------------------------------------------------------

// ---- History, trends, comparison, flakiness --------------------------------------------------------

export function toHistoryEntry(
  report: Pick<ReportData, 'run' | 'meta' | 'endpoints'>,
  tests: readonly ReportTest[],
): HistoryEntry {
  const counts = countStatuses(scopeTests(tests));
  const lat = latencyStats(responseLatencies(flattenCalls(tests)));
  const endpointPassRate: Record<string, number | null> = {};
  for (const s of endpointStats(tests, report.endpoints)) endpointPassRate[s.endpoint.key] = s.passRate;
  const compact: HistoryEntry['tests'] = {};
  for (const t of tests)
    compact[t.key] = { id: t.id, s: t.status, d: Math.round(t.durationMs), r: t.retries };
  return {
    runId: report.run.runId,
    label: report.run.label,
    startedAt: report.run.startedAt,
    durationMs: report.run.durationMs,
    environment: report.run.environment,
    dataSource: report.meta.dataSource,
    ...(report.run.profile ? { profile: report.run.profile } : {}),
    scope: scopeOf(tests),
    dataLeftBehind: dataLeftBehind(tests),
    counts,
    passRate: passRate(counts),
    latency: lat ? { avg: lat.avg, p50: lat.p50, p95: lat.p95 } : null,
    endpointPassRate,
    tests: compact,
  };
}

export interface RunComparison {
  previous: HistoryEntry;
  newFailures: string[];
  fixed: string[];
  added: string[];
  removed: string[];
  deltaTotal: number;
  deltaPassed: number;
  deltaFailed: number;
  deltaPassRate: number | null;
  deltaDurationPct: number | null;
  deltaP95Pct: number | null;
}

/** History entries comparable with the current run (same profile; entries without a profile match anything). */
export function sameProfile(history: readonly HistoryEntry[], profile: string | undefined): HistoryEntry[] {
  if (!profile) return [...history];
  return history.filter((h) => !h.profile || h.profile === profile);
}

export function compareRuns(current: HistoryEntry, previous: HistoryEntry | undefined): RunComparison | null {
  if (!previous) return null;
  const cur = current.tests;
  const prev = previous.tests;
  const ids = (keys: string[], src: HistoryEntry['tests']) => keys.map((k) => src[k]?.id ?? k);
  const newFailures = ids(
    Object.keys(cur).filter((k) => cur[k]?.s === 'FAIL' && prev[k] && prev[k]?.s !== 'FAIL'),
    cur,
  );
  const fixed = ids(
    Object.keys(cur).filter((k) => cur[k]?.s === 'PASS' && prev[k]?.s === 'FAIL'),
    cur,
  );
  const added = ids(
    Object.keys(cur).filter((k) => !prev[k]),
    cur,
  );
  const removed = ids(
    Object.keys(prev).filter((k) => !cur[k]),
    prev,
  );
  const pct = (a: number | null | undefined, b: number | null | undefined) =>
    a === null || a === undefined || b === null || b === undefined || b === 0 ? null : (a - b) / b;
  return {
    previous,
    newFailures,
    fixed,
    added,
    removed,
    deltaTotal: current.counts.total - previous.counts.total,
    deltaPassed: current.counts.PASS - previous.counts.PASS,
    deltaFailed: current.counts.FAIL - previous.counts.FAIL,
    deltaPassRate:
      current.passRate === null || previous.passRate === null ? null : current.passRate - previous.passRate,
    deltaDurationPct: pct(current.durationMs, previous.durationMs),
    deltaP95Pct: pct(current.latency?.p95, previous.latency?.p95),
  };
}

// ---- Narrative ---------------------------------------------------------------------------------------

// ---- Formatting helpers (shared) --------------------------------------------------------------------

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return 'N/A';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 2 : 1)} s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return m < 60 ? `${m}m ${rem}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function formatPct(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined ? 'N/A' : `${(v * 100).toFixed(digits)}%`;
}

export function formatMs(v: number | null | undefined): string {
  return v === null || v === undefined ? 'N/A' : `${Math.round(v)} ms`;
}
