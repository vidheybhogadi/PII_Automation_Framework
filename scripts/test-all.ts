/**
 * One command for the full pipeline:
 *   1. execute tests (default: the service-test project `api`; pass Playwright args after --, e.g. `npm run test:all -- --project=api --grep @smoke`)
 *   2. collect results        (reporting/collector → reports/latest/run-data.json, written by Playwright)
 *   3. generate analytics + HTML dashboard + run history + archive
 *   4. generate the PDF
 *   5. refresh the test-case sheet (docs/test-cases.xlsx) and inventory (docs/test-case-inventory.md) with this run's results
 *   6. print artifact locations and open the dashboard in the browser (skipped in CI, with --no-open or REPORT_OPEN=false)
 * Exits with the TEST exit code (report generation never masks test failures).
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { exportPdf } from '../reporting/generator/export-pdf';
import { generate, PATHS, ROOT } from '../reporting/generator/generate';
import { openFile } from '../reporting/generator/open-file';

async function main(): Promise<number> {
  // A CLI --reporter replaces the configured reporters, so always keep the PII Sentinel collector attached.
  const COLLECTOR = './reporting/collector/pii-results-reporter.ts';
  const argv = process.argv.slice(2);
  const autoOpen = !process.env.CI && process.env.REPORT_OPEN !== 'false' && !argv.includes('--no-open');
  const args = argv
    .filter((a) => a !== '--no-open')
    .map((a) => (a.startsWith('--reporter=') ? `${a},${COLLECTOR}` : a));
  // Service tests only by default: framework self-tests belong to `npm run verify`, not to service reports.
  if (!args.some((a) => a === '--project' || a.startsWith('--project='))) args.unshift('--project=api');
  console.log(`\n▶ 1/5 Running tests: playwright test ${args.join(' ')}\n`);
  const run = spawnSync('npx', ['playwright', 'test', ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  const testExit = run.status ?? 1;

  console.log('\n▶ 2/5 Collected results: reports/latest/run-data.json');
  console.log('▶ 3/5 Generating analytics + dashboard');
  // A PDF left over from an earlier run must not be archived or emailed with this one.
  rmSync(path.join(PATHS.out, 'report.pdf'), { force: true });
  const { outDir, files } = await generate({ archive: true });
  const archiveDir = files.find((f) => f.startsWith(PATHS.archive));

  console.log('▶ 4/5 Generating PDF');
  try {
    const pdf = await exportPdf(outDir);
    console.log(`  PDF: ${path.relative(ROOT, pdf)}`);
    // The archive copy was taken before the PDF existed: add the PDF and the data files that now point at it.
    if (archiveDir)
      for (const f of ['report.pdf', 'data/report-data.js', 'data/report.json'])
        if (existsSync(path.join(outDir, f))) cpSync(path.join(outDir, f), path.join(archiveDir, f));
  } catch (e) {
    console.error(`  PDF generation failed (dashboard is still available): ${(e as Error).message}`);
  }
  console.log('▶ 5/5 Updating the test-case sheet (docs/test-cases.xlsx) and inventory');
  const sheet = spawnSync('npx', ['tsx', 'scripts/generate-test-cases-xlsx.ts'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (sheet.status !== 0) console.error('  Test-case sheet was not updated (the report is unaffected).');
  console.log('  Updating the test-case inventory (docs/test-case-inventory.md)');
  const inventoryDoc = spawnSync('npm', ['run', '-s', 'docs:inventory'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (inventoryDoc.status !== 0)
    console.error('  Test-case inventory was not updated (the report is unaffected).');
  console.log(
    `\n  Artifacts: ${path.relative(ROOT, PATHS.out)}/ (index.html, report.pdf, results.json, results.csv, summary.txt, data/)`,
  );
  if (autoOpen) {
    openFile(path.join(outDir, 'index.html'));
    console.log(`  Opened ${path.relative(ROOT, path.join(outDir, 'index.html'))}`);
  }
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
