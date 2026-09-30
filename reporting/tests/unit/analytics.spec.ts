/** Report analytics: every number must be derivable and never invented. */
import { expect, test } from '@playwright/test';
import {
  analyzeFailure,
  catalogTests,
  compareRuns,
  countStatuses,
  dependencyOf,
  evaluateGates,
  healthScore,
  isNotApplicable,
  isSecurityFinding,
  latencyStats,
  OUTCOMES,
  outcomeCounts,
  overallVerdict,
  passRate,
  percentile,
  sameProfile,
  scopeOf,
  scopeTests,
  testOutcome,
  toHistoryEntry,
} from '../../core/analytics';
import type { HistoryEntry, ReportConfig, ReportData, ReportTest, TestStatus } from '../../core/types';
import { areaForId } from '../../core/catalog';
import { chatSummary, testsToCsv } from '../../core/exporters';
import { endpointInventory } from '../../generator/build-report-data';
import config from '../../config/report-config.json';

const cfg = config as unknown as ReportConfig;
const endpoints = endpointInventory();

function t(id: string, status: TestStatus, extra: Partial<ReportTest> = {}): ReportTest {
  return {
    key: `k-${id}-${Math.random()}`,
    id,
    title: `${id} test`,
    suite: '',
    file: 'f.spec.ts',
    line: 1,
    project: 'api',
    tags: [],
    status,
    rawStatus: status === 'PASS' ? 'passed' : status === 'FAIL' ? 'failed' : 'skipped',
    outcome: 'expected',
    durationMs: 100,
    startedAt: null,
    workerIndex: 0,
    parallelIndex: 0,
    retries: 0,
    annotations: [],
    errors: [],
    steps: [],
    apiCalls: [],
    area: 'write',
    endpoints: ['writePii'],
    severity: 'high',
    kind: 'integration',
    milestone: 'M1',
    ...extra,
  };
}

test.describe('REPORT analytics', () => {
  test('RPT-AN-001 percentiles use linear interpolation (numpy default)', () => {
    const s = [10, 20, 30, 40, 50];
    expect(percentile(s, 50)).toBe(30);
    expect(percentile(s, 95)).toBeCloseTo(48);
    expect(percentile([], 50)).toBeNull();
    const l = latencyStats([100, 300, 200]);
    expect(l).toMatchObject({ count: 3, min: 100, max: 300, avg: 200, p50: 200 });
    expect(latencyStats([])).toBeNull();
  });

  test('RPT-AN-002 pass rate excludes not-executed tests and is null when nothing executed', () => {
    expect(passRate(countStatuses([t('A', 'PASS'), t('B', 'FAIL'), t('C', 'BLOCKED')]))).toBe(0.5);
    expect(passRate(countStatuses([t('C', 'BLOCKED'), t('D', 'SKIPPED')]))).toBeNull();
  });

  test('RPT-AN-003 health score: N/A when nothing executed; capped on critical failure; weights re-normalised', () => {
    expect(healthScore([t('A', 'BLOCKED')], endpoints, cfg.health).score).toBeNull();
    const responded = {
      endpoint: 'writePii',
      method: 'POST',
      path: '/api/v1/pii',
      status: 201,
      durationMs: 5,
    };
    const allPass = healthScore(
      [t('A', 'PASS', { severity: 'critical', apiCalls: [responded] })],
      endpoints,
      cfg.health,
    );
    // passRate 1, critical 1, completion 1, coverage 1/11 (writePii responded) → (0.5+0.25+0.15+0.1/11)/1
    expect(allPass.score).toBeCloseTo((0.5 + 0.25 + 0.15 + 0.1 / 11) * 100, 0);
    // Executed but never reached the service (or only the preflight check responded) → endpoint coverage 0.
    const unreached = healthScore(
      [
        t('A', 'FAIL', {
          apiCalls: [
            { ...responded, status: null },
            { ...responded, endpoint: 'healthReady', phase: 'preflight' },
          ],
        }),
      ],
      endpoints,
      cfg.health,
    );
    expect(unreached.components.find((c) => c.key === 'endpointCoverage')?.value).toBe(0);
    const critFail = healthScore(
      [
        ...Array.from({ length: 20 }, (_, i) => t(`P${i}`, 'PASS', { severity: 'critical' })),
        t('B', 'FAIL', { severity: 'critical' }),
      ],
      endpoints,
      cfg.health,
    );
    expect(critFail.capped).toBe(true);
    expect(critFail.score).toBe(cfg.health.capOnCriticalFailure);
    const unitOnly = healthScore(
      [t('UT-1', 'PASS', { kind: 'unit', area: 'framework', severity: 'low', endpoints: [] })],
      endpoints,
      cfg.health,
    );
    expect(unitOnly.components.find((c) => c.key === 'endpointCoverage')?.value).toBeNull();
    // Framework self-tests alone say nothing about the service: no score, never "100 healthy".
    expect(unitOnly.score).toBeNull();
  });

  test('RPT-AN-004 quality gates never report PASS when a critical gate fails', () => {
    const gates = evaluateGates(
      [t('PII-AUTH-001', 'FAIL', { area: 'authentication' }), t('PII-WR-001', 'PASS')],
      cfg.gates,
    );
    expect(gates.find((g) => g.gate.key === 'authentication')?.status).toBe('FAIL');
    expect(overallVerdict(gates).verdict).toBe('FAILED');
    expect(
      overallVerdict(evaluateGates([t('PII-WR-001', 'PASS'), t('PII-WR-002', 'BLOCKED')], cfg.gates)).verdict,
    ).toBe('ATTENTION REQUIRED');
    expect(overallVerdict(evaluateGates([], cfg.gates)).verdict).toBe('NOT EVALUATED');
  });

  test('RPT-AN-005 failure patterns are classified from observed error text', () => {
    const f = (msg: string, extra: Partial<ReportTest> = {}) =>
      analyzeFailure(t('X', 'FAIL', { errors: [{ message: msg }], ...extra })).pattern;
    expect(
      f('ApiTransportError: POST /api/v1/pii failed before an HTTP response was received (ECONNREFUSED'),
    ).toBe('CONNECTIVITY');
    expect(f('ConfigError: This test needs the "limited" caller')).toBe('CONFIGURATION');
    expect(
      f(
        'Error: expected HTTP 201 but got POST /api/v1/pii -> HTTP 401 code=INVALID_SIGNATURE (requestId=abc)',
      ),
    ).toBe('UNEXPECTED_401');
    expect(f('Error: expected HTTP 403 but got POST /x -> HTTP 404 code=PII_NOT_FOUND')).toBe(
      'UNEXPECTED_404',
    );
    expect(f('Error: expected HTTP 400 or 422 but got POST /x -> HTTP 201')).toBe('UNEXPECTED_2XX');
    expect(f('Error: expected HTTP 200 but got POST /x -> HTTP 503 code=KEY_UNAVAILABLE')).toBe(
      'SERVER_ERROR',
    );
    expect(f('Success envelope contract violation for POST /x')).toBe('CONTRACT');
    expect(f('EMAIL: value mismatch (values redacted). expected len=1')).toBe('VALUE_MISMATCH');
    expect(f('Timed out', { rawStatus: 'timedOut' })).toBe('TIMEOUT');
    const d = analyzeFailure(
      t('X', 'FAIL', {
        errors: [
          {
            message:
              'Error: expected HTTP 401 but got POST /api/v1/pii -> HTTP 403 code=AUTHORIZATION_DENIED (requestId=5e136a0b-2c1d-4f3e-9a8b-7c6d5e4f3a2b, 5ms)',
          },
        ],
      }),
    );
    expect(d).toMatchObject({
      expected: '401',
      httpStatus: 403,
      errorCode: 'AUTHORIZATION_DENIED',
      requestId: '5e136a0b-2c1d-4f3e-9a8b-7c6d5e4f3a2b',
    });
  });

  test('RPT-AN-008 run comparison lists new failures, fixes, added and removed tests', () => {
    const mk = (tests: Record<string, TestStatus>, id: string): HistoryEntry => ({
      runId: id,
      label: id,
      startedAt: '2026-09-26T00:00:00Z',
      durationMs: 1000,
      environment: 'qa',
      dataSource: 'REAL',
      counts: countStatuses(Object.values(tests).map((s) => ({ status: s }))),
      passRate: null,
      latency: null,
      endpointPassRate: {},
      tests: Object.fromEntries(Object.entries(tests).map(([k, s]) => [k, { id: k, s, d: 1, r: 0 }])),
    });
    const c = compareRuns(
      mk({ a: 'FAIL', b: 'PASS', n: 'PASS' }, 'cur'),
      mk({ a: 'PASS', b: 'FAIL', gone: 'PASS' }, 'prev'),
    );
    expect(c).toMatchObject({ newFailures: ['a'], fixed: ['b'], added: ['n'], removed: ['gone'] });
    expect(compareRuns(mk({}, 'x'), undefined)).toBeNull();
  });

  test('RPT-AN-010 history entries are compact and carry no free text', () => {
    const report = {
      run: { runId: 'r', label: 'L', startedAt: '2026-09-26T00:00:00Z', durationMs: 5, environment: 'qa' },
      meta: { dataSource: 'REAL' },
      endpoints,
    } as unknown as ReportData;
    const e = toHistoryEntry(report, [t('PII-WR-001', 'FAIL', { errors: [{ message: 'secret detail' }] })]);
    expect(JSON.stringify(e)).not.toContain('secret detail');
    expect(Object.values(e.tests)[0]).toEqual({ id: 'PII-WR-001', s: 'FAIL', d: 100, r: 0 });
  });

  test('RPT-AN-015 an unreachable service gives an N/A score, not a low one', () => {
    const down = (id: string) =>
      t(id, 'FAIL', { annotations: [{ type: 'preflight', description: 'service unreachable' }] });
    expect(healthScore([down('A'), down('B')], endpoints, cfg.health).score).toBeNull();
    // Mixed: preflight failures are ignored, real results still count.
    expect(
      healthScore([down('A'), t('B', 'PASS', { severity: 'critical' })], endpoints, cfg.health).score,
    ).not.toBeNull();
  });

  test('RPT-AN-011 default scope is service tests; self-tests never inflate service pass rate', () => {
    const tests = [
      t('PII-WR-001', 'FAIL'),
      ...Array.from({ length: 5 }, (_, i) => t(`UT-X-${i}`, 'PASS', { kind: 'unit', area: 'framework' })),
    ];
    expect(scopeTests(tests).map((x) => x.id)).toEqual(['PII-WR-001']);
    expect(scopeOf(tests)).toBe('service');
    expect(scopeTests(tests.filter((x) => x.kind === 'unit'))).toHaveLength(5); // unit-only run → everything
    const report = {
      run: {
        runId: 'r',
        label: 'L',
        startedAt: '2026-09-26T00:00:00Z',
        durationMs: 5,
        environment: 'qa',
        profile: 'projects=api',
      },
      meta: { dataSource: 'REAL' },
      endpoints,
    } as unknown as ReportData;
    const h = toHistoryEntry(report, tests);
    expect(h).toMatchObject({ scope: 'service', passRate: 0, profile: 'projects=api' });
    expect(Object.keys(h.tests)).toHaveLength(6); // per-test results still kept for flaky detection
  });

  test('RPT-AN-012 a non-critical gate that did not run does not make the verdict INCOMPLETE', () => {
    const v = overallVerdict(
      evaluateGates(
        [t('PII-WR-001', 'PASS'), t('PII-AUTH-001', 'PASS', { area: 'authentication' })],
        cfg.gates,
      ),
    );
    expect(v.verdict).toBe('INCOMPLETE'); // critical gates (authz, tenant, db, security) not run
    expect(v.explanation).not.toContain('Framework self-tests');
  });

  test('RPT-AN-013 history comparison uses runs with the same profile only', () => {
    const e = (id: string, profile?: string) => ({ runId: id, profile }) as HistoryEntry;
    expect(
      sameProfile([e('a', 'projects=api · grep=@smoke'), e('b', 'projects=api'), e('c')], 'projects=api').map(
        (x) => x.runId,
      ),
    ).toEqual(['b', 'c']);
    expect(sameProfile([e('a', 'x')], undefined)).toHaveLength(1);
  });

  test('RPT-AN-014 failure analysis prefers the call under test over setup calls', () => {
    const f = analyzeFailure(
      t('X', 'FAIL', {
        errors: [{ message: 'Error: expect(received).toBe(expected)' }],
        apiCalls: [
          {
            endpoint: 'writePii',
            method: 'POST',
            path: '/p',
            status: 409,
            durationMs: 1,
            requestId: 'setup-id',
            phase: 'setup',
          },
          {
            endpoint: 'readPii',
            method: 'POST',
            path: '/r',
            status: 403,
            errorCode: 'AUTHORIZATION_DENIED',
            durationMs: 1,
            requestId: 'test-id',
            phase: 'test',
          },
          {
            endpoint: 'readPii',
            method: 'POST',
            path: '/r',
            status: 404,
            durationMs: 1,
            requestId: 'verify-id',
            phase: 'verify',
          },
        ],
      }),
    );
    expect(f).toMatchObject({ httpStatus: 403, errorCode: 'AUTHORIZATION_DENIED', requestId: 'test-id' });
  });

  test('RPT-AN-016 one outcome rule, with the reason; tests not in the run never affect health', () => {
    const pass = t('PII-WR-001', 'PASS');
    const fail = t('PII-WR-008', 'FAIL', {
      errors: [{ message: 'expected HTTP 400 but got POST /api/v1/pii -> HTTP 201' }],
    });
    const waiting = t('PII-AUTH-021', 'FIXME', {
      annotations: [{ type: 'blocked', description: 'Q-14: reuse behaviour undocumented' }],
    });
    const skipped = t('PII-AZ-001', 'SKIPPED', {
      annotations: [{ type: 'skip', description: 'Needs the "limited" caller' }],
    });
    const unreachable = t('PII-RD-001', 'FAIL', {
      annotations: [{ type: 'preflight', description: 'down' }],
    });
    const notRun = t('PII-SR-001', 'SKIPPED', { notRun: true });

    expect(testOutcome(pass)).toEqual({ outcome: 'Pass', remark: '' });
    expect(testOutcome(fail)).toEqual({ outcome: 'Fail', remark: 'Expected 400, got HTTP 201' });
    expect(testOutcome(waiting)).toEqual({
      outcome: 'Blocked',
      remark: 'BLOCKED — Q-14: reuse behaviour undocumented',
    });
    expect(testOutcome(skipped)).toEqual({ outcome: 'Skipped', remark: 'Needs the "limited" caller' });
    expect(testOutcome(unreachable)).toEqual({
      outcome: 'Not Tested', // never really tested
      remark: 'The Aisle PII facade could not be reached, so this test could not run',
    });
    expect(testOutcome(notRun)).toEqual({ outcome: 'Not Tested', remark: 'Not part of this run' });

    // A one-test run: the full list shows every test, but health and gates only see what ran.
    const all = [pass, notRun];
    expect(catalogTests(all)).toHaveLength(2);
    expect(scopeTests(all)).toEqual([pass]);
    expect(healthScore(scopeTests(all), endpointInventory(), cfg.health).score).toBe(
      healthScore([pass], endpointInventory(), cfg.health).score,
    );
  });

  test('RPT-AN-017 Blocked, Skipped, Security finding vs Fail, Not Tested (synthetic AISLE-* tests)', () => {
    const blockedDesc =
      'BQ-01: EMAIL access not granted to the Aisle caller — observed POST /api/v1/pii-test -> HTTP 403 code=AUTHORIZATION_DENIED';
    // BLOCKED / FIXME status, or a skip that carries a `blocked` annotation → Blocked.
    const blocked = t('AISLE-WR-004', 'BLOCKED', {
      annotations: [{ type: 'blocked', description: blockedDesc }],
    });
    const fixme = t('AISLE-WR-005', 'FIXME', {
      annotations: [{ type: 'fixme', description: 'BQ-02: pending' }],
    });
    const skippedBlocked = t('AISLE-RD-003', 'SKIPPED', {
      annotations: [{ type: 'blocked', description: blockedDesc }],
    });
    expect(testOutcome(blocked)).toEqual({ outcome: 'Blocked', remark: `BLOCKED — ${blockedDesc}` });
    expect(testOutcome(fixme)).toEqual({ outcome: 'Blocked', remark: 'BLOCKED — BQ-02: pending' });
    expect(testOutcome(skippedBlocked).outcome).toBe('Blocked');
    expect(testOutcome(t('AISLE-WR-006', 'BLOCKED')).remark).toBe('BLOCKED — waiting on an answer from Dev');

    // A plain skip → Skipped with its reason.
    const skipped = t('AISLE-TR-009', 'SKIPPED', {
      annotations: [{ type: 'skip', description: 'AISLE_TEST_PHONES not configured' }],
    });
    expect(testOutcome(skipped)).toEqual({ outcome: 'Skipped', remark: 'AISLE_TEST_PHONES not configured' });
    expect(testOutcome(t('AISLE-TR-010', 'SKIPPED')).remark).toBe('Skipped in this run');

    // FAIL + `security-finding` annotation → Security finding; the remark uses the annotation text only.
    const findingDesc = 'BQ-08: 422 errors echo the submitted value and internal tenant_id';
    const finding = t('AISLE-SEC-001', 'FAIL', {
      annotations: [{ type: 'security-finding', description: findingDesc }],
      errors: [{ message: 'expected error body not to contain the submitted value [REDACTED]' }],
    });
    const f = testOutcome(finding);
    expect(f.outcome).toBe('Security finding');
    expect(f.remark).toBe(`SECURITY FINDING (expected until Dev fixes it) — ${findingDesc}`);
    expect(f.remark.startsWith('SECURITY FINDING (expected until Dev fixes it) — ')).toBe(true);
    expect(isSecurityFinding(finding)).toBe(true);
    // A PASS with the annotation (Dev fixed it) is a Pass; a FAIL without it is an ordinary Fail.
    expect(
      testOutcome(
        t('AISLE-SEC-002', 'PASS', { annotations: [{ type: 'security-finding', description: 'x' }] }),
      ).outcome,
    ).toBe('Pass');
    const plainFail = t('AISLE-SEC-003', 'FAIL', {
      errors: [{ message: 'expected HTTP 400 but got POST /api/v1/pii-test -> HTTP 201' }],
    });
    expect(testOutcome(plainFail)).toEqual({ outcome: 'Fail', remark: 'Expected 400, got HTTP 201' });

    // Not Tested: not in this run, facade unreachable, or the run stopped first.
    expect(testOutcome(t('AISLE-HLT-001', 'SKIPPED', { notRun: true })).outcome).toBe('Not Tested');
    expect(testOutcome(t('AISLE-HLT-002', 'UNKNOWN'))).toEqual({
      outcome: 'Not Tested',
      remark: 'The run stopped before this test',
    });

    // Counted in one place, in the OUTCOMES order.
    expect(OUTCOMES).toEqual([
      'Fail',
      'Security finding',
      'Blocked',
      'Skipped',
      'Not Tested',
      'Not Applicable',
      'Pass',
    ]);
    expect(outcomeCounts([blocked, fixme, skipped, finding, plainFail, t('AISLE-RD-001', 'PASS')])).toEqual({
      Fail: 1,
      'Security finding': 1,
      Blocked: 2,
      Skipped: 1,
      'Not Tested': 0,
      'Not Applicable': 0,
      Pass: 1,
    });
  });

  test('RPT-AN-018 a security finding still fails the gates and the verdict; blocked is not a failure', () => {
    const finding = t('AISLE-SEC-001', 'FAIL', {
      area: 'responseSecurity',
      annotations: [{ type: 'security-finding', description: 'BQ-08: echo' }],
    });
    const passes = [t('AISLE-WR-001', 'PASS'), t('AISLE-RD-001', 'PASS', { area: 'read' })];
    const withFinding = overallVerdict(evaluateGates([...passes, finding], cfg.gates)).verdict;
    expect(['FAILED', 'ATTENTION REQUIRED']).toContain(withFinding);
    const blocked = t('AISLE-WR-004', 'BLOCKED', {
      annotations: [{ type: 'blocked', description: 'BQ-01' }],
    });
    expect(countStatuses([blocked]).FAIL).toBe(0);
    expect(passRate(countStatuses([...passes, blocked]))).toBe(1);
  });

  test('RPT-AN-019 ID prefixes: AISLE-* (live) and PII-* (demo only) map to the same areas', () => {
    for (const [a, b] of [
      ['AISLE-HLT-001', 'PII-HLT-001'],
      ['AISLE-WR-001', 'PII-WR-001'],
      ['AISLE-RD-001', 'PII-RD-001'],
      ['AISLE-SR-001', 'PII-SR-001'],
      ['AISLE-BR-001', 'PII-BR-001'],
      ['AISLE-NRM-001', 'PII-NRM-001'],
      ['AISLE-TR-001', 'PII-TR-001'],
      ['AISLE-FT-001', 'PII-FT-001'],
      ['AISLE-AUTH-001', 'PII-AUTH-001'],
      ['AISLE-SEC-001', 'PII-SEC-001'],
      ['AISLE-CON-001', 'PII-CON-001'],
      ['AISLE-DB-001', 'PII-DB-001'],
    ])
      expect(areaForId(a as string), a).toBe(areaForId(b as string));
    expect(areaForId('AISLE-SEC-001')).toBe('responseSecurity');
    expect(areaForId('POC-001')).toBe('poc');
    expect(areaForId('PII-AZ-001')).toBe('authorization');
    expect(areaForId('AISLE-XYZ-001')).toBe('other');
  });
  test('RPT-AN-020 Not Applicable: confirmed-unsupported skips are neither pass nor fail and never counted', () => {
    const answer = 'BQ-05: Dev confirmed bulk read of FREE_TEXT is intentionally not supported';
    // What notApplicable() records: a `not-applicable` annotation plus Playwright's own skip annotation.
    const na = t('AISLE-BR-009', 'SKIPPED', {
      area: 'batch',
      endpoints: ['batchReadPii'],
      annotations: [
        { type: 'not-applicable', description: answer },
        { type: 'skip', description: `NOT APPLICABLE (BQ-05): ${answer.slice(7)}` },
      ],
    });
    expect(isNotApplicable(na)).toBe(true);
    expect(testOutcome(na)).toEqual({ outcome: 'Not Applicable', remark: `NOT APPLICABLE — ${answer}` });
    expect(dependencyOf(na)).toBe(answer);
    // Not part of the run, or a test that ran anyway, is never Not Applicable.
    expect(testOutcome({ ...na, notRun: true }).outcome).toBe('Not Tested');
    expect(testOutcome({ ...na, status: 'PASS', rawStatus: 'passed' }).outcome).toBe('Pass');
    expect(testOutcome({ ...na, status: 'FAIL', rawStatus: 'failed' }).outcome).toBe('Fail');
    // A plain skip stays Skipped; a blocked skip stays Blocked (with its dependency).
    const blocked = t('AISLE-BR-010', 'SKIPPED', {
      area: 'batch',
      annotations: [{ type: 'blocked', description: 'BQ-01: EMAIL access not granted' }],
    });
    expect(testOutcome(blocked).outcome).toBe('Blocked');
    expect(dependencyOf(blocked)).toBe('BQ-01: EMAIL access not granted');
    expect(dependencyOf(t('AISLE-BR-001', 'PASS'))).toBe('');

    // Counts: its own bucket.
    const passes = [
      t('AISLE-BR-001', 'PASS', { area: 'batch', endpoints: ['batchReadPii'] }),
      t('AISLE-WR-001', 'PASS'),
      t('AISLE-RD-001', 'PASS', { area: 'read', endpoints: ['readPii'] }),
    ];
    expect(outcomeCounts([...passes, na])).toMatchObject({ Pass: 3, 'Not Applicable': 1, Skipped: 0 });
    // Pass rate: unaffected.
    expect(passRate(countStatuses([...passes, na]))).toBe(1);
    // Gates: a gate never warns about (or waits on) a Not Applicable test — same result as without it.
    const gates = (tests: ReportTest[]) => evaluateGates(tests, cfg.gates).map((g) => [g.gate.key, g.status]);
    expect(gates([...passes, na])).toEqual(gates(passes));
    // An ordinary skip in the same gate DOES count as not executed (control).
    const plainSkip = t('AISLE-BR-011', 'SKIPPED', { area: 'batch' });
    const batchGate = cfg.gates.find((g) => g.areas.includes('batch'));
    if (batchGate?.warnOnNotExecuted)
      expect(evaluateGates([...passes, plainSkip], cfg.gates).find((g) => g.gate === batchGate)?.status).toBe(
        'WARNING',
      );
    // Health: execution completeness ignores it.
    const health = (tests: ReportTest[]) => healthScore(tests, endpoints, cfg.health);
    expect(health([...passes, na]).score).toBe(health(passes).score);
    expect(health([...passes, na]).components.find((c) => c.key === 'completion')?.value).toBe(1);

    // CSV: status column + the new inventory columns.
    const csv = testsToCsv([na]).trim().split('\n');
    const header = csv[0]!.split(',');
    for (const col of ['module', 'method', 'request', 'validation', 'dependency'])
      expect(header, col).toContain(col);
    expect(csv[1]).toContain(`,Not Applicable,NOT APPLICABLE — ${answer}`);
    // Chat summary: its own count and the BQ reason.
    const report = {
      meta: { product: 'P', dataSource: 'REAL' },
      run: { label: 'r', environment: 'staging', startedAt: new Date(0).toISOString(), durationMs: 1 },
      endpoints,
      config: cfg,
      tests: [...passes, na],
    } as unknown as ReportData;
    const summary = chatSummary(report, report.tests);
    expect(summary).toContain('Not Applicable: 1');
    expect(summary).toContain(`- AISLE-BR-009 ${answer}`);
  });
});
