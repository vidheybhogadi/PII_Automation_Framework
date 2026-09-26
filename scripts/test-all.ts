/**
 * One command for the full pipeline:
 *   1. execute tests (default: the service-test project `api`; pass Playwright args after --, e.g. `npm run test:all -- --project=api --grep @smoke`)
 *   2. collect results        (reporting/collector → reports/latest/run-data.json, written by Playwright)
 *   3. generate analytics + HTML dashboard + run history + archive
 *   4. generate the PDF
 *   5. print artifact locations
 * Exits with the TEST exit code (report generation never masks test failures).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { exportPdf } from '../reporting/generator/export-pdf';
import { generate, PATHS, ROOT } from '../reporting/generator/generate';

async function main(): Promise<number> {
  // A CLI --reporter replaces the configured reporters, so always keep the PII Sentinel collector attached.
  const COLLECTOR = './reporting/collector/pii-results-reporter.ts';
  const args = process.argv.slice(2).map((a) => (a.startsWith('--reporter=') ? `${a},${COLLECTOR}` : a));
  // Service tests only by default: framework self-tests belong to `npm run verify`, not to service reports.
  if (!args.some((a) => a === '--project' || a.startsWith('--project='))) args.unshift('--project=api');
  console.log(`\n▶ 1/4 Running tests: playwright test ${args.join(' ')}\n`);
  const run = spawnSync('npx', ['playwright', 'test', ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  const testExit = run.status ?? 1;

  console.log('\n▶ 2/4 Collected results: reports/latest/run-data.json');
  console.log('▶ 3/4 Generating analytics + dashboard');
  const { outDir } = await generate({ archive: true });

  console.log('▶ 4/4 Generating PDF');
  try {
    const pdf = await exportPdf(outDir);
    console.log(`  PDF: ${path.relative(ROOT, pdf)}`);
  } catch (e) {
    console.error(`  PDF generation failed (dashboard is still available): ${(e as Error).message}`);
  }
  console.log(
    `\n  Artifacts: ${path.relative(ROOT, PATHS.out)}/ (index.html, report.pdf, results.json, results.csv, summary.txt, data/)`,
  );
  console.log(`  Tests exited with code ${testExit}.\n`);
  return testExit;
}

main().then(
  (code) => process.exit(code),
  (e: Error) => {
    console.error(`✘ ${e.message}`);
    process.exit(1);
  },
);
