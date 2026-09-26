/**
 * ⚠️ SYNTHETIC DEMO DATA GENERATOR — FOR DASHBOARD UI DEVELOPMENT ONLY ⚠️
 *
 * Produces reporting/fixtures/demo-run.json (+ demo-history/) with dataSource "DEMO".
 * The test INVENTORY is the real suite (from `playwright test --list`), but every OUTCOME, duration, latency and
 * request ID is invented by a seeded PRNG. The dashboard shows a "DEMO DATA" ribbon/watermark for this data, the
 * generator refuses to write it into real run history, and the PDF cover and headers are labelled.
 *
 *   npm run report:demo-data     (deterministic — same seed, same output)
 */
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { toHistoryEntry } from '../core/analytics';
import { areaForId, endpointsForId } from '../core/catalog';
import type { ApiCallRecord, CollectedRun, CollectedTest, HistoryEntry, TestStatus } from '../core/types';
import { displayIdFromTitle } from '../collector/pii-results-reporter';
import { buildReportData, endpointInventory } from '../generator/build-report-data';
import { parseReportConfig } from '../generator/schema';

const ROOT = path.resolve(__dirname, '../..');

/** Mulberry32 — tiny deterministic PRNG. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Inventory {
  title: string;
  suite: string;
  file: string;
  line: number;
  tags: string[];
  project: string;
}

export function readInventory(): Inventory[] {
  const json = JSON.parse(
    execSync('npx playwright test --list --reporter=json', {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    }).toString(),
  ) as {
    suites: unknown[];
  };
  const out: Inventory[] = [];
  type S = {
    title: string;
    specs?: { title: string; file: string; line: number; tags: string[]; tests: { projectName: string }[] }[];
    suites?: S[];
  };
  const walk = (s: S, trail: string[]) => {
    for (const sp of s.specs ?? []) {
      for (const t of sp.tests)
        out.push({
          title: sp.title,
          suite: trail.slice(1).join(' › '),
          file: `tests/${sp.file}`,
          line: sp.line,
          tags: sp.tags.map((x) => (x.startsWith('@') ? x : `@${x}`)),
          project: t.projectName,
        });
    }
    for (const c of s.suites ?? []) walk(c, [...trail, c.title]);
  };
  for (const s of json.suites as S[]) walk(s, [s.title]);
  return out;
}

const BLOCKED: Record<string, string> = {
  'PII-HLT-002':
    'Q-17: A not-ready state cannot be induced safely from automation; needs a test hook or dedicated instance.',
  'PII-SR-012':
    'Q-18: Which catalog fields are NOT searchable is undocumented; set PII_NON_SEARCHABLE_FIELD.',
  'PII-TR-012':
    'Q-12: Minimum TTL is 300s in development. Enable PII_ENABLE_TTL_EXPIRY_TEST in a short-TTL environment.',
  'PII-AUTH-021': 'Q-14: Guide requires a fresh ID per call but does not define server behaviour on reuse.',
  'PII-AUTH-022':
    'Q-21: Signature covers only the body (no timestamp/nonce/path). Replay protection is undocumented.',
  'PII-SEC-002': 'Q-22: Configured maximum body size is undocumented; set PII_MAX_BODY_BYTES.',
  'PII-SEC-003': 'Q-23: Only applicable to non-development environments.',
  'PII-DB-007': 'Q-26: Audit table schema and whether it stores X-Request-Id are undocumented.',
};

/** Synthetic failures, written in the framework's real (already-sanitized) message formats. */
const FAILURES: Record<string, (rid: string) => string> = {
  'PII-AZ-009': (rid) =>
    `Error: expected HTTP 403 but got POST /api/v1/transient/phones/promote -> HTTP 404 code=TRANSIENT_PHONE_NOT_FOUND (requestId=${rid}, 188ms) message="Transient phone not found"`,
  'PII-SR-007': () =>
    `Error: expect(received).toMatchObject(expected)\n\nExpected: {"count": 2, "truncated": true}\nReceived: {"count": 2, "truncated": false}`,
  'PII-DB-002': () =>
    `Error: NAME ciphertext: stored representation contains the plaintext (sha256:4f1c2a9e0b7d) — value is not encrypted at rest\n\nexpect(received).toBe(expected)\n\nExpected: false\nReceived: true`,
  'PII-AUTH-018': (rid) =>
    `Error: Rejection (exact status pending Q-13): expected HTTP 400 or 401 or 415 or 422 but got POST /api/v1/pii -> HTTP 201 (requestId=${rid}, 142ms)`,
};

function uuid(r: () => number): string {
  const h = () => Math.floor(r() * 16).toString(16);
  const s = Array.from({ length: 32 }, h).join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-${'89ab'[Math.floor(r() * 4)]}${s.slice(17, 20)}-${s.slice(20, 32)}`;
}

function lognormal(r: () => number, median: number, sigma = 0.45): number {
  const u = Math.max(1e-9, r());
  const v = r();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(4, Math.round(median * Math.exp(sigma * z)));
}

const LATENCY_MEDIAN: Record<string, number> = {
  healthReady: 18,
  writePii: 142,
  readPii: 96,
  searchPii: 118,
  batchReadPii: 265,
  createTransientPhone: 128,
  resolveTransientPhone: 84,
  promoteTransientPhone: 176,
  createFreeTextKey: 74,
  readFreeTextKey: 58,
  revokeFreeTextKey: 66,
};
const PATHS = Object.fromEntries(endpointInventory().map((e) => [e.key, e]));

export function buildDemoRun(
  inventory: Inventory[],
  seed: number,
  runIndex: number,
  opts: { label: string; start: Date; variant: 'current' | 'history'; profile?: string },
): CollectedRun {
  const r = prng(seed);
  const workers = 4;
  const lanes = Array.from({ length: workers }, () => 0);
  const tests: CollectedTest[] = inventory.map((inv) => {
    const id = displayIdFromTitle(inv.title);
    const area = areaForId(id);
    let status: TestStatus = 'PASS';
    const annotations: CollectedTest['annotations'] = [];
    if (BLOCKED[id]) {
      status = 'BLOCKED';
      annotations.push(
        { type: 'blocked', description: BLOCKED[id] },
        { type: 'fixme', description: `BLOCKED (${BLOCKED[id].split(':')[0]})` },
      );
    } else if (id === 'PII-TR-007' && runIndex % 3 === 0) {
      status = 'SKIPPED';
      annotations.push({
        type: 'skip',
        description: 'Needs at least 2 approved numbers in PII_TEST_PHONES to observe replacement',
      });
    } else if (opts.variant === 'current' && FAILURES[id]) {
      status = 'FAIL';
    } else if (opts.variant === 'history' && FAILURES[id] && r() < 0.35) {
      status = 'FAIL';
    } else if (id === 'PII-BR-005' && r() < 0.3) {
      status = 'FAIL'; // intermittent in demo history → "potentially flaky"
    }

    const isUnit = inv.project === 'unit';
    const executed = status === 'PASS' || status === 'FAIL';
    const duration = !executed
      ? 0
      : isUnit
        ? lognormal(r, 6, 0.8)
        : lognormal(
            r,
            id === 'PII-BR-004' || id === 'PII-BR-005' ? 7800 : id === 'PII-SR-008' ? 2600 : 680,
            0.5,
          );
    const lane = lanes.indexOf(Math.min(...lanes));
    const start = new Date(opts.start.getTime() + (lanes[lane] as number));
    lanes[lane] = (lanes[lane] as number) + duration + 3;

    const calls: ApiCallRecord[] = [];
    if (!isUnit && executed) {
      const eps = endpointsForId(id, area);
      const n = id === 'PII-BR-004' ? 51 : id === 'PII-SR-008' ? 12 : 1 + Math.floor(r() * 4);
      for (let i = 0; i < n; i += 1) {
        const ep = eps.length ? (eps[i % eps.length] as string) : 'healthReady';
        const def = PATHS[ep];
        const failing = status === 'FAIL' && i === n - 1;
        const authArea = area === 'authentication' && i === n - 1 && id !== 'PII-AUTH-001';
        const code = failing
          ? id === 'PII-AZ-009'
            ? 404
            : id === 'PII-AUTH-018'
              ? 201
              : 200
          : authArea
            ? 401
            : area === 'authorization' &&
                i === n - 1 &&
                !['PII-AZ-004', 'PII-AZ-005', 'PII-AZ-012'].includes(id)
              ? 403
              : ep === 'writePii' && i === 0
                ? 201
                : 200;
        calls.push({
          endpoint: ep,
          method: def?.method ?? 'POST',
          path: (def?.path ?? '/api/v1/pii').replace('{field}', 'EMAIL'),
          status: code,
          ...(code >= 400
            ? {
                errorCode:
                  code === 401
                    ? 'INVALID_SIGNATURE'
                    : code === 403
                      ? 'AUTHORIZATION_DENIED'
                      : 'TRANSIENT_PHONE_NOT_FOUND',
              }
            : {}),
          durationMs: lognormal(r, LATENCY_MEDIAN[ep] ?? 100),
          requestId: uuid(r),
          caller: area === 'authorization' ? 'limited' : 'primary',
          // earlier calls seed data, the last one is the request under test
          phase: n > 1 && i < n - 1 ? 'setup' : 'test',
        });
      }
    }
    const rid = calls[calls.length - 1]?.requestId ?? uuid(r);
    return {
      key: `${inv.project}::${inv.file.replace(/^tests\//, '')}::${inv.suite ? `${inv.suite} › ` : ''}${inv.title}`,
      id,
      title: inv.title,
      suite: inv.suite,
      file: inv.file,
      line: inv.line,
      project: inv.project,
      tags: inv.tags,
      status,
      rawStatus: status === 'PASS' ? 'passed' : status === 'FAIL' ? 'failed' : 'skipped',
      outcome: status === 'PASS' ? 'expected' : status === 'FAIL' ? 'unexpected' : 'skipped',
      durationMs: duration,
      startedAt: executed ? start.toISOString() : null,
      workerIndex: executed ? lane : -1,
      parallelIndex: executed ? lane : -1,
      retries: 0,
      annotations,
      errors:
        status === 'FAIL' && FAILURES[id]
          ? [
              {
                message: (FAILURES[id] as (x: string) => string)(rid),
                location: `${inv.file}:${inv.line + 6}`,
              },
            ]
          : status === 'FAIL'
            ? [
                {
                  message: 'Error: expect(received).toBe(expected)\n\nExpected: 400\nReceived: 422',
                  location: `${inv.file}:${inv.line + 4}`,
                },
              ]
            : [],
      steps:
        id === 'POC-001'
          ? [
              { title: 'write EMAIL via API', durationMs: 180, failed: false },
              { title: 'validate persisted record in DB', durationMs: 64, failed: false },
              { title: 'read EMAIL via API and verify normalized value', durationMs: 120, failed: false },
              { title: 'verify logs contain no plaintext PII', durationMs: 2, failed: false },
            ]
          : [],
      apiCalls: calls,
      ...(executed && !isUnit
        ? {
            cleanup: {
              performed: area === 'freeText' ? 1 : 0,
              failed: 0,
              leftBehind: area === 'freeText' ? 0 : 1,
            },
          }
        : {}),
    };
  });
  const durationMs = Math.max(...lanes) + 900;
  return {
    schemaVersion: 1,
    dataSource: 'DEMO',
    run: {
      runId: `demo-run-${135 + runIndex}`,
      label: opts.label,
      environment: 'qa (demo)',
      startedAt: opts.start.toISOString(),
      finishedAt: new Date(opts.start.getTime() + durationMs).toISOString(),
      durationMs,
      playwrightStatus: tests.some((t) => t.status === 'FAIL') ? 'failed' : 'passed',
      workers,
      projects: ['unit', 'api'],
      retries: 1,
      timeoutMs: 60_000,
      command: 'playwright test (DEMO DATA — synthetic)',
      profile: opts.profile ?? 'projects=api+unit',
      git: { commit: 'dem0dem0dem0dem0dem0dem0dem0dem0dem0dem0', branch: 'demo' },
      ci: {
        provider: 'Demo',
        runNumber: String(135 + runIndex),
        runUrl: null,
        build: `12.68.${700 + runIndex}`,
      },
    },
    environment: {
      node: process.version,
      os: 'Demo OS',
      arch: 'x64',
      playwright: '1.63.0',
      framework: 'aisle-pii-api-automation',
      frameworkVersion: '1.0.0',
      serviceUrl: 'https://pii-•••demo:443',
      runtime: 'Node.js — API tests via Axios (no browser)',
      timezone: 'UTC',
    },
    tests,
    diagnostics: [],
  };
}

function main(): void {
  const inventory = readInventory();
  const config = parseReportConfig(
    JSON.parse(readFileSync(path.join(ROOT, 'reporting/config/report-config.json'), 'utf8')),
  );
  const base = new Date('2026-09-26T10:00:00Z').getTime();
  const histDir = path.join(__dirname, 'demo-history');
  rmSync(histDir, { recursive: true, force: true });
  mkdirSync(histDir, { recursive: true });
  const HISTORY_RUNS = 7;
  // Two of the history runs are smoke-only runs (different profile) — the dashboard compares like with like.
  const smokeInventory = inventory.filter((t) => t.tags.includes('@smoke'));
  for (let i = 0; i < HISTORY_RUNS; i += 1) {
    const smoke = i === 2 || i === 5;
    const run = buildDemoRun(smoke ? smokeInventory : inventory, 1000 + i, i, {
      label: `DEMO Run #${135 + i}${smoke ? ' (smoke)' : ''}`,
      start: new Date(base - (HISTORY_RUNS - i) * 86_400_000),
      variant: 'history',
      profile: smoke ? 'projects=api · grep=@smoke' : 'projects=api+unit',
    });
    const entry: HistoryEntry = toHistoryEntry(
      buildReportData(run, config, []),
      buildReportData(run, config, []).tests,
    );
    writeFileSync(
      path.join(histDir, `${String(i).padStart(2, '0')}__${run.run.runId}.json`),
      JSON.stringify(entry),
    );
  }
  const current = buildDemoRun(inventory, 4242, HISTORY_RUNS, {
    label: `DEMO Run #${135 + HISTORY_RUNS}`,
    start: new Date(base),
    variant: 'current',
  });
  writeFileSync(path.join(__dirname, 'demo-run.json'), JSON.stringify(current, null, 2));
  console.log(
    `  DEMO data written: reporting/fixtures/demo-run.json (${current.tests.length} tests) + ${HISTORY_RUNS} demo history runs`,
  );
}

if (require.main === module) main();
