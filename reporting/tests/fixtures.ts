/**
 * Report UI test fixtures — all SYNTHETIC (dataSource "DEMO"), generated into reports/.report-tests/.
 * Never written to real run history.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CollectedRun, CollectedTest, TestStatus } from '../core/types';
import { generate, PATHS, ROOT } from '../generator/generate';
import { buildDesign } from '../../m2/scripts/m2-all-cases';
import { GROUPS } from '../../m2/scripts/m2-inventory';

export const FIXTURE_ROOT = path.join(ROOT, 'reports/.report-tests');
export const FIXTURES = {
  demo: path.join(FIXTURE_ROOT, 'demo'),
  single: path.join(FIXTURE_ROOT, 'single'),
  empty: path.join(FIXTURE_ROOT, 'empty'),
  large: path.join(FIXTURE_ROOT, 'large'),
  redaction: path.join(FIXTURE_ROOT, 'redaction'),
  malformed: path.join(FIXTURE_ROOT, 'malformed'),
  preflight: path.join(FIXTURE_ROOT, 'preflight'),
  selfOnly: path.join(FIXTURE_ROOT, 'self-only'),
  statuses: path.join(FIXTURE_ROOT, 'statuses'),
  m2: path.join(FIXTURE_ROOT, 'm2'),
};

/** A per-API M2 test with no workbook row: its API comes from its ID / title (API-004 → area G5). */
export const M2_EXTRA = {
  id: 'M2-API-004-UNMIG',
  title: 'M2-API-004-UNMIG API-004 POST /V1/invites/send_request_to_profile — Unmigrated data',
  tags: ['@m2', '@g5', '@negative', '@unmigrated-data', '@regression', '@name'],
};

/**
 * A SYNTHETIC Milestone 2 run (dataSource DEMO, made-up results): for each area G1–G10, up to 4 APIs × 3 of their
 * workbook cases (real IDs, names and tags from m2/scripts), plus one per-API test without a workbook row.
 */
export function m2Run(): CollectedRun {
  const base = demoRun();
  const cases = buildDesign(ROOT).cases;
  const picked: { id: string; title: string; tags: string[] }[] = [];
  for (const g of GROUPS.filter((x) => /^G\d+$/.test(x.key))) {
    const byApi = new Map<string, typeof cases>();
    for (const c of cases)
      if (c.apis[0] && g.ids.includes(c.apis[0])) byApi.set(c.apis[0], [...(byApi.get(c.apis[0]) ?? []), c]);
    for (const list of [...byApi.values()].slice(0, 4))
      for (const c of list.slice(0, 3)) picked.push({ id: c.id, title: `${c.id} ${c.name}`, tags: c.tags });
  }
  picked.push(M2_EXTRA);
  const STATUS: TestStatus[] = ['PASS', 'PASS', 'FAIL', 'PASS', 'BLOCKED', 'PASS', 'PASS'];
  const tests: CollectedTest[] = picked.map((p, i) => {
    const status = STATUS[i % STATUS.length] as TestStatus;
    return {
      key: `m2-api::m2/tests/per-api/demo.spec.ts::${p.title}`,
      id: p.id,
      title: p.title,
      suite: 'Milestone 2 (synthetic fixture)',
      file: 'm2/tests/per-api/demo.spec.ts',
      line: i + 1,
      project: 'm2-api',
      tags: p.tags,
      status,
      rawStatus: status === 'PASS' ? 'passed' : status === 'FAIL' ? 'failed' : 'skipped',
      outcome: status === 'PASS' ? 'expected' : status === 'FAIL' ? 'unexpected' : 'skipped',
      durationMs: status === 'BLOCKED' ? 0 : 40 + (i % 9) * 15,
      startedAt: status === 'BLOCKED' ? null : base.run.startedAt,
      workerIndex: 0,
      parallelIndex: 0,
      retries: 0,
      annotations:
        status === 'BLOCKED' ? [{ type: 'blocked', description: 'M2Q-36: synthetic blocker' }] : [],
      errors: status === 'FAIL' ? [{ message: 'Error: expected 200, received 500 (synthetic)' }] : [],
      steps: [],
      apiCalls: [],
    };
  });
  return {
    ...base,
    run: { ...base.run, runId: 'demo-m2', label: 'DEMO Milestone 2', projects: ['m2-api'] },
    tests,
  };
}

/** Synthetic annotations for the "statuses" fixture (a known security finding, a blocker, a plain skip). */
export const STATUS_FIXTURE = {
  finding: {
    id: 'PII-SEC-001',
    description: 'BQ-08: 422 errors echo the submitted value and internal tenant_id',
  },
  blocked: {
    id: 'PII-RD-002',
    description:
      'BQ-01: EMAIL access not granted to the Aisle caller — observed POST /api/v1/pii-test/read -> HTTP 403 code=AUTHORIZATION_DENIED',
  },
  skipped: { id: 'PII-WR-002', description: 'AISLE_TEST_PHONES not configured' },
  /** Skipped with a `not-applicable` annotation (helper notApplicable()): feature confirmed unsupported by Dev. */
  notApplicable: {
    id: 'PII-BR-006',
    description: 'BQ-05: Dev confirmed repeated user IDs in a bulk read are intentionally not supported',
  },
  /** A demo test re-labelled with a live catalog ID, so the drawer shows its Request + Validation. */
  described: { from: 'PII-WR-001', id: 'AISLE-WR-001' },
};

/** Secrets injected into the redaction fixture. None may appear in the rendered report. */
export const INJECTED_SECRETS = {
  email: 'jane.realperson@corp-mail.com',
  phone: '+91 98765 43210',
  pem: '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIJ1hsZ3v/VpguoRK9JLsLMREScVpezJpGXA7rAMcrn9g\n-----END PRIVATE KEY-----',
  signature: `${'A'.repeat(86)}==`,
  bearer:
    'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  dbUrl: 'postgres://pii_ro:SuperSecret123@db.internal:5432/pii',
  password: 'password=Hunter2Secret',
};

export function demoRun(): CollectedRun {
  return JSON.parse(readFileSync(PATHS.demoRun, 'utf8')) as CollectedRun;
}

function writeRun(name: string, run: CollectedRun): string {
  const file = path.join(FIXTURE_ROOT, `${name}.json`);
  writeFileSync(file, JSON.stringify(run));
  return file;
}

export function largeRun(n = 1200): CollectedRun {
  const base = demoRun();
  const tests: CollectedTest[] = [];
  for (let i = 0; tests.length < n; i += 1) {
    const t = base.tests[i % base.tests.length] as CollectedTest;
    const copy = Math.floor(i / base.tests.length);
    tests.push({ ...t, key: `${t.key}#${copy}`, title: copy ? `${t.title} [copy ${copy}]` : t.title });
  }
  return { ...base, run: { ...base.run, runId: 'demo-large', label: 'DEMO Large dataset' }, tests };
}

export async function buildFixtures(): Promise<void> {
  rmSync(FIXTURE_ROOT, { recursive: true, force: true });
  mkdirSync(FIXTURE_ROOT, { recursive: true });
  const base = demoRun();

  await generate({ demo: true, out: FIXTURES.demo, quiet: true });
  await generate({ input: writeRun('single', base), out: FIXTURES.single, history: false, quiet: true });
  await generate({
    input: writeRun('empty', {
      ...base,
      run: { ...base.run, runId: 'demo-empty', label: 'DEMO Empty' },
      tests: [],
    }),
    out: FIXTURES.empty,
    history: false,
    quiet: true,
  });
  await generate({ input: writeRun('large', largeRun()), out: FIXTURES.large, history: false, quiet: true });

  const s = INJECTED_SECRETS;
  const leaky: CollectedRun = {
    ...base,
    run: {
      ...base.run,
      runId: 'demo-redaction',
      label: 'DEMO Redaction',
      command: `playwright test ${s.password}`,
    },
    tests: base.tests.map((t, i) =>
      i === 0
        ? {
            ...t,
            status: 'FAIL',
            title: `${t.title} for ${s.email}`,
            errors: [
              {
                message: `Error for ${s.email} phone ${s.phone}\nAuthorization: ${s.bearer}\n${s.pem}\nX-PII-Signature: ${s.signature}\n${s.dbUrl}`,
              },
            ],
            annotations: [{ type: 'assumption', description: `seen ${s.email}` }],
            steps: [{ title: `write ${s.email}`, durationMs: 1, failed: true }],
          }
        : t,
    ),
  };
  await generate({
    input: writeRun('redaction', leaky),
    out: FIXTURES.redaction,
    history: false,
    quiet: true,
  });

  // Service unreachable at startup: every service test fails in preflight; self-tests pass.
  const why = 'service unreachable: GET /health/ready failed before an HTTP response was received';
  const down: CollectedRun = {
    ...base,
    run: { ...base.run, runId: 'demo-preflight', label: 'DEMO Service down' },
    tests: base.tests.map((t) =>
      t.project === 'unit'
        ? t
        : {
            ...t,
            status: 'FAIL',
            rawStatus: 'failed',
            durationMs: 3,
            steps: [],
            annotations: [{ type: 'preflight', description: why }],
            errors: [
              {
                message: `Error: Preflight failed — ${why}. The Aisle PII facade at AISLE_BASE_URL is not ready, so this test could not run.`,
              },
            ],
            apiCalls: [
              {
                endpoint: 'healthReady',
                method: 'GET',
                path: '/health/ready',
                status: null,
                durationMs: 2,
                transportError: 'ECONNREFUSED',
                phase: 'preflight',
              },
            ],
          },
    ),
  };
  await generate({
    input: writeRun('preflight', down),
    out: FIXTURES.preflight,
    history: false,
    quiet: true,
  });

  // Only the framework's own unit tests ran (e.g. `npm run m1:test:unit`): the service was not tested at all.
  const selfOnly: CollectedRun = {
    ...base,
    run: { ...base.run, runId: 'demo-self-only', label: 'DEMO Self-tests only' },
    tests: base.tests.filter((t) => t.project === 'unit'),
  };
  await generate({
    input: writeRun('self-only', selfOnly),
    out: FIXTURES.selfOnly,
    history: false,
    quiet: true,
  });

  // Every reader-facing status at once: a security finding (FAIL + annotation), a blocked, a skipped and a
  // not-applicable test, plus one test with a live catalog description (request + validation).
  const sf = STATUS_FIXTURE;
  const statuses: CollectedRun = {
    ...base,
    run: { ...base.run, runId: 'demo-statuses', label: 'DEMO All statuses' },
    tests: base.tests.map((t): CollectedTest => {
      if (t.id === sf.finding.id)
        return {
          ...t,
          status: 'FAIL',
          rawStatus: 'failed',
          outcome: 'unexpected',
          annotations: [{ type: 'security-finding', description: sf.finding.description }],
          errors: [{ message: 'Error: expected the 422 error body not to echo the submitted value' }],
        };
      if (t.id === sf.blocked.id)
        return {
          ...t,
          status: 'BLOCKED',
          rawStatus: 'skipped',
          outcome: 'skipped',
          durationMs: 0,
          annotations: [{ type: 'blocked', description: sf.blocked.description }],
          errors: [],
        };
      if (t.id === sf.notApplicable.id)
        return {
          ...t,
          status: 'SKIPPED',
          rawStatus: 'skipped',
          outcome: 'skipped',
          durationMs: 0,
          annotations: [
            { type: 'not-applicable', description: sf.notApplicable.description },
            { type: 'skip', description: `NOT APPLICABLE (BQ-05): ${sf.notApplicable.description.slice(7)}` },
          ],
          apiCalls: [],
          errors: [],
        };
      if (t.id === sf.described.from)
        return { ...t, id: sf.described.id, title: t.title.replace(sf.described.from, sf.described.id) };
      if (t.id === sf.skipped.id)
        return {
          ...t,
          status: 'SKIPPED',
          rawStatus: 'skipped',
          outcome: 'skipped',
          durationMs: 0,
          annotations: [{ type: 'skip', description: sf.skipped.description }],
          errors: [],
        };
      return t;
    }),
  };
  await generate({
    input: writeRun('statuses', statuses),
    out: FIXTURES.statuses,
    history: false,
    quiet: true,
  });

  await generate({ input: writeRun('m2', m2Run()), out: FIXTURES.m2, history: false, quiet: true });

  cpSync(FIXTURES.demo, FIXTURES.malformed, { recursive: true });
  writeFileSync(
    path.join(FIXTURES.malformed, 'data/report-data.js'),
    'window.__PII_REPORT__ = { "schemaVersion": 99 };\n',
  );
}
