/**
 * Playwright fixtures for INTEGRATION tests (live PII service).
 *
 * A "fixture" is something Playwright creates for a test and tears down afterwards. Tests simply ask for
 * what they need by name:
 *
 *   test('PII-WR-001 ...', async ({ pii, data, tenant }) => { ... });
 *
 * Worker-scoped fixtures (config, db, preflight) are created once per worker process; test-scoped ones
 * (log, pii, data, cleanup) are fresh for every test, so tests are independent and parallel-safe.
 *
 * Unit tests do NOT use this file — they import `test` from '@playwright/test' directly, so they run without
 * any environment configuration.
 */
import { test as base, expect } from '@playwright/test';
import { generateKeyPairSync } from 'node:crypto';
import { Ed25519Signer } from '../auth/ed25519-signer';
import type { PiiClient } from '../clients/pii-client';
import { createPiiClient } from '../clients/client-factory';
import type { EndpointKey } from '../clients/endpoints';
import { assertIntegrationConfig, loadConfig, type CallerRole, type FrameworkConfig } from '../config/config';
import { TestDataFactory } from '../data/test-data-factory';
import { generateRunId } from '../data/test-identifiers';
import { createDbAdapter } from '../db/db-client';
import { loadQueryCatalog, PiiRepository } from '../db/pii-repository';
import { CleanupRegistry } from '../utils/cleanup';
import { Logger } from '../utils/logger';
import { runInPhase } from '../utils/phase';

export interface TestFixtures {
  /** Per-test redacting logger; its lines are attached to the report as api-calls.log. */
  log: Logger;
  /** Client signed as the PRIMARY caller (full test permissions). */
  pii: PiiClient;
  /** Client for another configured caller role ('secondary' | 'limited'). */
  piiAs: (role: CallerRole) => PiiClient;
  /** A signer for a freshly generated key pair that is NOT registered with the service. */
  unregisteredSigner: Ed25519Signer;
  data: TestDataFactory;
  /** Primary test tenant (PII_TEST_TENANT_ID). */
  tenant: string;
  cleanup: CleanupRegistry;
  /** Automatic: fails the test with a clear, recorded reason when the worker's readiness check failed. */
  serviceReady: void;
}

export interface WorkerFixtures {
  config: FrameworkConfig;
  /** Automatic once-per-worker check: configuration present + service ready. */
  preflight: PreflightResult;
  /** Read-only DB repository. Created lazily — only tests that request `db` need DB configuration. */
  db: PiiRepository;
}

/** Outcome of the once-per-worker readiness check (GET /health/ready). */
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
  // `serviceReady` fixture then fails each test with a clear message, an annotation and the recorded call,
  // so reports can say "service not ready at startup" instead of "no API calls recorded".
  preflight: [
    async ({ config }, use) => {
      const logger = new Logger({ level: config.logging.level, toConsole: config.logging.toConsole });
      const client = createPiiClient(config, logger, null);
      let result: PreflightResult;
      try {
        const res = await runInPhase('preflight', () => client.healthReady());
        result =
          res.status === 200
            ? { ok: true, summary: res.summary(), lines: logger.lines() }
            : { ok: false, summary: `service not ready: ${res.summary()}`, lines: logger.lines() };
      } catch (error) {
        result = {
          ok: false,
          summary: `service unreachable: ${(error as Error).message.split(' (')[0]}`,
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
          `Preflight failed — ${preflight.summary}. The PII service at PII_BASE_URL is not ready, so this test ` +
            'could not run. Check PII_BASE_URL, network/VPN access and service health, then retry.',
        );
      }
      await use();
    },
    { auto: true },
  ],

  db: [
    async ({ config }, use) => {
      const repository = new PiiRepository(createDbAdapter(config), loadQueryCatalog(config.db.queriesFile));
      try {
        await use(repository);
      } finally {
        await repository.close();
      }
    },
    { scope: 'worker' },
  ],

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

  pii: async ({ config, log }, use) => {
    await use(createPiiClient(config, log, 'primary'));
  },

  piiAs: async ({ config, log }, use) => {
    await use((role: CallerRole) => createPiiClient(config, log, role));
  },

  unregisteredSigner: async ({}, use) => {
    const { privateKey } = generateKeyPairSync('ed25519');
    await use(Ed25519Signer.fromKeyObject(privateKey, 'unregistered-throwaway'));
  },

  data: async ({ config }, use, testInfo) => {
    const runId = config.testData.runId ?? generateRunId(config.testData.runPrefix);
    await use(new TestDataFactory(config, runId, testInfo.workerIndex));
  },

  tenant: async ({ data }, use) => {
    await use(data.tenant());
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

/**
 * Mark a test as BLOCKED by missing backend information. Shows as "fixme" (not passed) in the report,
 * with the question ID from docs/known-gaps-and-questions.md.
 */
export function blockedBy(questionId: string, reason: string): void {
  test.info().annotations.push({ type: 'blocked', description: `${questionId}: ${reason}` });
  test.fixme(true, `BLOCKED (${questionId}): ${reason}`);
}

/** Record a documented-but-ambiguous expectation in the report next to the test. */
export function noteAssumption(id: string, text: string): void {
  test.info().annotations.push({ type: 'assumption', description: `${id}: ${text}` });
}
