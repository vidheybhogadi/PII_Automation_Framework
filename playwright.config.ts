import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'node:path';
import { generateRunId } from './src/data/test-identifiers';

/**
 * Environment selection:
 *   - default: .env in the project root
 *   - ENV_FILE=.env.qa npm test   -> load a different file (e.g. per environment)
 *   - CI: variables come from CI secrets; a missing file is fine.
 * Real environment variables always win over file values (dotenv does not override by default).
 */
dotenv.config({ path: path.resolve(__dirname, process.env.ENV_FILE ?? '.env'), quiet: true });

/**
 * One run ID shared by ALL workers: the config file is evaluated in the main process first and workers
 * inherit its environment, so setting it here makes every worker tag data with the same run ID.
 */
process.env.PII_TEST_RUN_ID ??= generateRunId(process.env.PII_TEST_RUN_PREFIX || 'qa-auto');

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: isCI,
  // Retries hide flakiness and re-send writes; keep at 0 locally, 1 in CI for infrastructure blips only.
  retries: isCI ? 1 : 0,
  workers: isCI ? 4 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['junit', { outputFile: 'reports/junit/results.xml' }],
    ['json', { outputFile: 'reports/json/results.json' }],
    // PII Sentinel collector: normalized, sanitized run data consumed by the QA dashboard (npm run report).
    ['./reporting/collector/pii-results-reporter.ts', { outputFile: 'reports/latest/run-data.json' }],
  ],
  use: {
    // API tests use Axios, not the browser. Tracing is OFF on purpose: Playwright traces capture request/
    // response bodies, which here would contain decrypted PII and raw keys. Diagnostics come from the
    // redacted per-test api-calls.log attachment instead.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      // Framework self-tests: no network, no .env needed.
      name: 'unit',
      testDir: './tests/unit',
    },
    {
      // Live PII service tests. Requires .env / CI secrets (see docs/setup-guide.md).
      name: 'api',
      testDir: './tests',
      testIgnore: ['unit/**'],
    },
  ],
});
