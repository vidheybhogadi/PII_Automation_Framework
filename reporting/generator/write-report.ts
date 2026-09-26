/**
 * Writes the static report artifact:
 *
 *   <out>/index.html              shell (loading skeleton, CSP, no external requests)
 *   <out>/assets/app.js|app.css   dashboard bundle + fonts
 *   <out>/data/report-data.js     window.__PII_REPORT__ = {...}   (script tag → works from file:// too)
 *   <out>/data/report.json        same data, machine-readable
 *   <out>/results.json            results export      <out>/results.csv   test table
 *   <out>/summary.txt             Slack/ClickUp summary
 *   <out>/report.pdf              added by `npm run report:pdf`
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chatSummary, resultsJson, testsToCsv } from '../core/exporters';
import { FORBIDDEN_REPORT_PATTERNS } from '../core/sanitize';
import type { ReportData } from '../core/types';
import { bundleDashboard } from './bundle';

const TEMPLATE = path.resolve(__dirname, '../templates/index.html');
const BOOT_SCRIPT = path.resolve(__dirname, '../templates/boot.js');

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

export function renderShell(report: ReportData): string {
  const demo = report.meta.dataSource === 'DEMO';
  const title = `${report.meta.product} — ${report.run.label}${demo ? ' (DEMO DATA)' : ''}`;
  return readFileSync(TEMPLATE, 'utf8')
    .replace(/{{TITLE}}/g, escapeHtml(title))
    .replace(/{{DATA_SOURCE}}/g, report.meta.dataSource)
    .replace(/{{GENERATED_AT}}/g, escapeHtml(report.meta.generatedAt));
}

export function reportDataScript(report: ReportData): string {
  return `/* ${report.meta.product} report data — generated ${report.meta.generatedAt} — dataSource=${report.meta.dataSource} */\nwindow.__PII_REPORT__ = ${JSON.stringify(report)};\n`;
}

/** Self-check: refuse to publish a report whose data contains key material, emails or signatures. */
export function assertNoSensitiveData(content: string, label: string): void {
  for (const pattern of FORBIDDEN_REPORT_PATTERNS) {
    if (pattern.test(content)) {
      throw new Error(
        `Report self-check failed: ${label} matches forbidden pattern ${pattern}. The report was NOT written. ` +
          'Find the source of the value and sanitize it (reporting/core/sanitize.ts).',
      );
    }
  }
}

export async function writeReport(
  report: ReportData,
  outDir: string,
  options: { bundle?: boolean } = {},
): Promise<string[]> {
  const dataJs = reportDataScript(report);
  assertNoSensitiveData(dataJs, 'report data');

  mkdirSync(path.join(outDir, 'data'), { recursive: true });
  mkdirSync(path.join(outDir, 'assets'), { recursive: true });
  if (options.bundle !== false) await bundleDashboard(outDir);

  const files: Record<string, string> = {
    'index.html': renderShell(report),
    'assets/boot.js': readFileSync(BOOT_SCRIPT, 'utf8'),
    'data/report-data.js': dataJs,
    'data/report.json': JSON.stringify(report, null, 2),
    'results.json': resultsJson(report),
    'results.csv': testsToCsv(report.tests),
    'summary.txt': chatSummary(report),
  };
  for (const [rel, content] of Object.entries(files)) writeFileSync(path.join(outDir, rel), content);
  return Object.keys(files).map((f) => path.join(outDir, f));
}
