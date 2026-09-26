/**
 * Generate the PII Sentinel dashboard from collected run data.
 *
 *   npm run report                     # reports/latest/run-data.json → reports/qa-report/
 *   npm run report:demo                # synthetic DEMO data → reports/demo-report/ (clearly labelled)
 *   tsx reporting/generator/generate.ts --input <file> --out <dir> [--no-history] [--archive] [--no-bundle]
 */
import { cpSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  countStatuses,
  scopeTests,
  evaluateGates,
  formatDuration,
  formatPct,
  overallVerdict,
  passRate,
  toHistoryEntry,
} from '../core/analytics';
import type { HistoryEntry } from '../core/types';
import { buildReportData } from './build-report-data';
import { historyFileName, loadHistory, saveHistoryEntry } from './history';
import { parseCollectedRun, parseReportConfig } from './schema';
import { writeReport } from './write-report';

export const ROOT = path.resolve(__dirname, '../..');
export const PATHS = {
  config: path.join(ROOT, 'reporting/config/report-config.json'),
  latestRun: path.join(ROOT, 'reports/latest/run-data.json'),
  out: path.join(ROOT, 'reports/qa-report'),
  demoOut: path.join(ROOT, 'reports/demo-report'),
  history: path.join(ROOT, 'reports/history'),
  archive: path.join(ROOT, 'reports/archive'),
  demoRun: path.join(ROOT, 'reporting/fixtures/demo-run.json'),
  demoHistory: path.join(ROOT, 'reporting/fixtures/demo-history'),
};

export interface GenerateOptions {
  input?: string;
  out?: string;
  demo?: boolean;
  history?: boolean;
  historyDir?: string;
  archive?: boolean;
  bundle?: boolean;
  quiet?: boolean;
}

function readJson(file: string, what: string): unknown {
  if (!existsSync(file)) {
    throw new Error(
      `${what} not found at ${path.relative(ROOT, file)}. ` +
        (what === 'Run data'
          ? 'Run the tests first (e.g. npm run test:smoke or npm run test:unit) — the collector writes it automatically.'
          : ''),
    );
  }
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`${what} at ${path.relative(ROOT, file)} is not valid JSON.`);
  }
}

function loadDemoHistory(): HistoryEntry[] {
  if (!existsSync(PATHS.demoHistory)) return [];
  return readdirSync(PATHS.demoHistory)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(path.join(PATHS.demoHistory, f), 'utf8')) as HistoryEntry);
}

export async function generate(
  opts: GenerateOptions = {},
): Promise<{ outDir: string; files: string[]; historyFile: string | null }> {
  const demo = Boolean(opts.demo);
  const input = opts.input ?? (demo ? PATHS.demoRun : PATHS.latestRun);
  const outDir = path.resolve(opts.out ?? (demo ? PATHS.demoOut : PATHS.out));
  const historyDir = opts.historyDir ?? PATHS.history;
  const useHistory = opts.history !== false;

  const config = parseReportConfig(readJson(PATHS.config, 'Report config'));
  const run = parseCollectedRun(readJson(input, 'Run data'), path.relative(ROOT, input));
  if (demo && run.dataSource !== 'DEMO') throw new Error('--demo requires a DEMO dataset.');
  if (!demo && run.dataSource === 'DEMO' && useHistory) {
    throw new Error(
      'Refusing to treat DEMO data as a real run. Use --demo (or --no-history) for synthetic data.',
    );
  }

  const history = !useHistory
    ? []
    : run.dataSource === 'DEMO'
      ? loadDemoHistory()
      : loadHistory(historyDir, config.historyLimit).entries;
  const report = buildReportData(run, config, history.slice(-config.historyLimit));
  const files = await writeReport(report, outDir, { bundle: opts.bundle });

  let historyFile: string | null = null;
  if (run.dataSource === 'REAL' && useHistory) {
    historyFile = saveHistoryEntry(historyDir, toHistoryEntry(report, report.tests));
  }
  if (opts.archive && run.dataSource === 'REAL') {
    const dest = path.join(
      PATHS.archive,
      historyFileName(toHistoryEntry(report, report.tests)).replace(/\.json$/, ''),
    );
    cpSync(outDir, dest, { recursive: true });
    files.push(dest);
  }

  if (!opts.quiet) {
    const scoped = scopeTests(report.tests);
    const c = countStatuses(scoped);
    const verdict = overallVerdict(evaluateGates(scoped, report.config.gates));
    const others = report.tests.length - scoped.length;
    const rel = (p: string) => path.relative(ROOT, p);
    console.log(`\n  ${report.meta.product} — ${report.run.label}${demo ? '  [DEMO DATA — NOT REAL]' : ''}`);
    console.log(
      `  ${c.total} ${others ? 'service ' : ''}tests · ${c.PASS} passed · ${c.FAIL} failed · ${c.BLOCKED + c.FIXME} blocked · ${c.SKIPPED} skipped · pass rate ${formatPct(passRate(c))} · ${formatDuration(report.run.durationMs)}`,
    );
    if (others) console.log(`  (+ ${others} framework self-tests, reported separately)`);
    if (report.run.profile) console.log(`  Profile: ${report.run.profile}`);
    console.log(`  Verdict: ${verdict.verdict}`);
    if (report.diagnostics.length)
      console.log(`  Diagnostics:\n${report.diagnostics.map((d) => `    - ${d}`).join('\n')}`);
    console.log(`\n  Dashboard : ${rel(path.join(outDir, 'index.html'))}`);
    console.log(
      `  Data      : ${rel(path.join(outDir, 'data'))}/  ·  results.json  ·  results.csv  ·  summary.txt`,
    );
    console.log(
      `  History   : ${historyFile ? rel(historyFile) : demo ? 'demo history (fixtures, read-only)' : 'not written'} (${history.length} previous run(s) loaded)`,
    );
    console.log(`  PDF       : npm run report:pdf${demo ? ' -- --demo' : ''}\n`);
  }
  return { outDir, files, historyFile };
}

function parseArgs(argv: string[]): GenerateOptions {
  const o: GenerateOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--demo') o.demo = true;
    else if (a === '--no-history') o.history = false;
    else if (a === '--archive') o.archive = true;
    else if (a === '--no-bundle') o.bundle = false;
    else if (a === '--input') o.input = path.resolve(argv[++i] ?? '');
    else if (a === '--out') o.out = path.resolve(argv[++i] ?? '');
    else if (a === '--history-dir') o.historyDir = path.resolve(argv[++i] ?? '');
  }
  return o;
}

if (require.main === module) {
  generate(parseArgs(process.argv.slice(2))).catch((error: Error) => {
    console.error(`\n✘ Report generation failed: ${error.message}\n`);
    process.exit(1);
  });
}
