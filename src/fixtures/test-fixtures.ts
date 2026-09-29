/**
 * Playwright fixtures for the Aisle PII facade tests (live staging).
 *
 *   QA test → Aisle PII facade (Bearer token) → PII service → PII DB (read-only checks)
 *
 * A "fixture" is something Playwright creates for a test and tears down afterwards. Tests ask for what they
 * need by name:
 *
 *   test('AISLE-WR-001 ...', async ({ aisle, data, cleanup }) => { ... });
 *
 * Worker-scoped fixtures (config, preflight, dbRepository) are created once per worker process; test-scoped
 * ones (log, aisle, data, cleanup, db) are fresh for every test, so tests are independent and parallel-safe.
 *
 * Unit tests do NOT use this file — they import `test` from '@playwright/test' directly, so they run without
 * any environment configuration.
 */
import { test as base, expect } from '@playwright/test';
import type { ApiResponse } from '../clients/api-response';
import type { AislePiiClient } from '../clients/aisle-pii-client';
import { createAisleClient } from '../clients/client-factory';
import type { EndpointKey } from '../clients/endpoints';
import { assertIntegrationConfig, isDbConfigured, loadConfig, type FrameworkConfig } from '../config/config';
import { TestDataFactory } from '../data/test-data-factory';
import { generateRunId } from '../data/test-identifiers';
import { createDbAdapter } from '../db/db-client';
import { loadQueryCatalog, PiiRepository } from '../db/pii-repository';
import { ERROR_CODES } from '../models/common.models';
import { CleanupRegistry } from '../utils/cleanup';
import { Logger } from '../utils/logger';
import { runInPhase } from '../utils/phase';

/** Why DB tests are blocked while read-only DB access is missing (docs/backend-open-questions.md). */
export const DB_BLOCKER = {
  id: 'BQ-04',
  reason: 'Read-only DB access and the PII table/column layout have not been provided yet',
} as const;

export interface TestFixtures {
  /** Per-test redacting logger; its lines are attached to the report as api-calls.log. */
  log: Logger;
  /** Aisle PII facade client, authenticated with AISLE_TEST_TOKEN. */
  aisle: AislePiiClient;
  data: TestDataFactory;
  cleanup: CleanupRegistry;
  /**
   * Read-only DB repository. If DB access is not configured yet, the test is marked BLOCKED (BQ-04) —
   * never failed and never silently skipped.
   */
  db: PiiRepository;
  /** Automatic: fails the test with a clear, recorded reason when the worker's readiness check failed. */
  serviceReady: void;
}

export interface WorkerFixtures {
  config: FrameworkConfig;
  /** Automatic once-per-worker check: configuration present + facade ready. */
  preflight: PreflightResult;
  /** Read-only DB repository, or `undefined` while DB access is not configured. */
  dbRepository: PiiRepository | undefined;
}

/** Outcome of the once-per-worker readiness check (GET /api/v1/pii-test/health/ready). */
export interface PreflightResult {
  ok: boolean;
  summary: string;
  /** Sanitized log entries of the readiness call, replayed into each test's api-calls.log on failure. */
  lines: readonly string[];
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  config: [
    async ({}, use) => {
      const config = loadConfig();
      assertIntegrationConfig(config);
      await use(config);
    },
    { scope: 'worker' },
  ],

  // Checks readiness once per worker and RECORDS the outcome (it does not throw here). The test-scoped
  // `serviceReady` fixture then fails each test with a clear message, an annotation and the recorded call.
  preflight: [
    async ({ config }, use) => {
      const logger = new Logger({ level: config.logging.level, toConsole: config.logging.toConsole });
      const client = createAisleClient(config, logger);
      let result: PreflightResult;
      try {
        const res = await runInPhase('preflight', () => client.healthReady());
        result =
          res.status === 200
            ? { ok: true, summary: res.summary(), lines: logger.lines() }
            : { ok: false, summary: `facade not ready: ${res.summary()}`, lines: logger.lines() };
      } catch (error) {
        result = {
          ok: false,
          summary: `facade unreachable: ${(error as Error).message.split(' (')[0]}`,
          lines: logger.lines(),
        };
      }
      await use(result);
    },
    { scope: 'worker', auto: true },
  ],

  serviceReady: [
    async ({ preflight, log }, use, testInfo) => {
      if (!preflight.ok) {
        log.replay(preflight.lines, { phase: 'preflight' });
        testInfo.annotations.push({ type: 'preflight', description: preflight.summary });
        throw new Error(
          `Preflight failed — ${preflight.summary}. The Aisle PII facade at AISLE_BASE_URL is not ready, so ` +
            'this test could not run. Check AISLE_BASE_URL, AISLE_TEST_TOKEN and network access, then retry.',
        );
      }
      await use();
    },
    { auto: true },
  ],

  dbRepository: [
    async ({ config }, use) => {
      if (!isDbConfigured(config)) {
        await use(undefined);
        return;
      }
      const repository = new PiiRepository(createDbAdapter(config), loadQueryCatalog(config.db.queriesFile));
      try {
        await use(repository);
      } finally {
        await repository.close();
      }
    },
    { scope: 'worker' },
  ],

  db: async ({ dbRepository }, use, testInfo) => {
    if (!dbRepository) {
      testInfo.annotations.push({ type: 'blocked', description: `${DB_BLOCKER.id}: ${DB_BLOCKER.reason}` });
      testInfo.skip(true, `BLOCKED (${DB_BLOCKER.id}): ${DB_BLOCKER.reason}`);
      return;
    }
    await use(dbRepository);
  },

  log: async ({ config }, use, testInfo) => {
    const logger = new Logger({
      level: config.logging.level,
      toConsole: config.logging.toConsole,
      context: { test: testInfo.title.split(' ')[0] },
    });
    await use(logger);
    // Lines are already sanitized by the logger.
    await testInfo.attach('api-calls.log', { body: logger.lines().join('\n'), contentType: 'text/plain' });
  },

  aisle: async ({ config, log }, use) => {
    await use(createAisleClient(config, log));
  },

  data: async ({ config }, use, testInfo) => {
    const runId = config.testData.runId ?? generateRunId(config.testData.runPrefix);
    await use(new TestDataFactory(config, runId, testInfo.workerIndex));
  },

  cleanup: async ({}, use, testInfo) => {
    const registry = new CleanupRegistry();
    await use(registry);
    const summary = await registry.run();
    if (summary.performed.length + summary.failed.length + summary.leftBehind.length > 0) {
      await testInfo.attach('cleanup-summary.json', {
        body: JSON.stringify(summary, null, 2),
        contentType: 'application/json',
      });
    }
  },
});

export { expect };

// ---- Blocked / security-finding helpers ------------------------------------------------------------------

/**
 * Mark the current test BLOCKED and stop it. BLOCKED means "could not be tested because something outside
 * QA's control is missing" — it is neither a pass nor a failure, and the reason is shown in every report.
 */
export function block(questionId: string, reason: string): void {
  test.info().annotations.push({ type: 'blocked', description: `${questionId}: ${reason}` });
  test.skip(true, `BLOCKED (${questionId}): ${reason}`);
}

/**
 * Statically BLOCKED until the backend answers a question (docs/backend-open-questions.md). The test body is
 * not run. Use when the test cannot be written correctly without the answer.
 */
export function blockedBy(questionId: string, reason: string): void {
  test.info().annotations.push({ type: 'blocked', description: `${questionId}: ${reason}` });
  test.fixme(true, `BLOCKED (${questionId}): ${reason}`);
}

/**
 * Runtime access gate: if the facade answered 403 AUTHORIZATION_DENIED, the Aisle caller has not been given
 * access yet — mark the test BLOCKED with the real observed response. As soon as Dev grants access the test
 * runs its real assertions; nothing is faked. Any other status continues to the test's own assertions.
 */
export function blockIfAccessDenied(res: ApiResponse, questionId: string, what: string): void {
  if (res.status === 403 && res.errorCode === ERROR_CODES.AUTHORIZATION_DENIED) {
    block(questionId, `${what} — observed ${res.summary()}`);
  }
}

/** BLOCK when no approved test phone numbers are configured (never invent real phone numbers). */
export function requireApprovedPhones(config: FrameworkConfig): void {
  if (config.testData.phones.length === 0) {
    block('BQ-03', 'No approved test phone numbers configured (AISLE_TEST_PHONES)');
  }
}

/**
 * Tag a test as checking a KNOWN security finding. If the test fails, reports show it as
 * "Security finding" — a real defect for Dev — not as an automation failure. The assertion itself must never
 * be weakened to make it pass.
 */
export function securityFinding(questionId: string, text: string): void {
  test.info().annotations.push({ type: 'security-finding', description: `${questionId}: ${text}` });
}

/** Record an expectation that is observed on staging but not yet confirmed as the contract. */
export function noteAssumption(id: string, text: string): void {
  test.info().annotations.push({ type: 'assumption', description: `${id}: ${text}` });
}

/**
 * Skip a describe block when its endpoints are excluded via PII_ENDPOINTS_IN_SCOPE.
 * The skip reason is shown in the report, so exclusion is explicit — never silent.
 */
export function onlyIfInScope(...keys: EndpointKey[]): void {
  test.beforeEach(({ config }) => {
    const excluded = keys.filter((k) => !config.endpointsInScope.includes(k));
    test.skip(excluded.length > 0, `Out of scope via PII_ENDPOINTS_IN_SCOPE: ${excluded.join(', ')}`);
  });
}
