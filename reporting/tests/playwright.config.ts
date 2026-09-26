import { defineConfig, devices } from '@playwright/test';

/**
 * Tests for the reporting layer itself (not the PII service):
 *   report-unit — analytics, sanitizer, collector, exporters, generator safety, catalog drift (Node only)
 *   report-ui   — the built dashboard in Chromium, against SYNTHETIC fixtures (reports/.report-tests)
 *
 *   npm run report:test
 */
export default defineConfig({
  testDir: '.',
  outputDir: '../../test-results/report-tests',
  fullyParallel: true,
  // Browser tests are CPU-heavy (SVG charts, axe); cap workers so a busy machine or CI runner doesn't cause timeouts.
  workers: process.env.CI ? 2 : 3,
  retries: 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { outputFolder: '../../reports/report-tests-html', open: 'never' }]],
  globalSetup: './global-setup.ts',
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'report-unit', testDir: './unit' },
    {
      name: 'report-ui',
      testDir: './ui',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
});
