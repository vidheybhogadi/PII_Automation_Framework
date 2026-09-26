/**
 * Programmatic PDF export with Playwright/Chromium (not browser "print"): loads the static report in print
 * mode, waits until fonts and every chart have rendered, and prints A4 with header/footer and page numbers.
 *
 *   npm run report:pdf              # reports/qa-report/report.pdf
 *   npm run report:pdf -- --demo    # reports/demo-report/report.pdf
 *   tsx reporting/generator/export-pdf.ts --dir <report dir>
 */
import { chromium } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PATHS, ROOT } from './generate';

export async function exportPdf(dir: string, opts: { timeoutMs?: number } = {}): Promise<string> {
  const index = path.join(dir, 'index.html');
  if (!existsSync(index))
    throw new Error(`No report at ${path.relative(ROOT, index)} — run npm run report first.`);
  const dataFile = path.join(dir, 'data/report-data.js');
  const dataText = readFileSync(dataFile, 'utf8');
  const demo = /dataSource=DEMO/.test(dataText.slice(0, 300));
  const label = /"label":"([^"]{1,80})"/.exec(dataText)?.[1] ?? 'Run';

  const browser = await chromium.launch();
  const errors: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1800 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.emulateMedia({ media: 'screen', reducedMotion: 'reduce', colorScheme: 'light' });
    await page.goto(`${pathToFileURL(index).href}?mode=print`);
    await page.waitForFunction(
      () => (globalThis as { __PII_READY__?: boolean }).__PII_READY__ === true,
      undefined,
      { timeout: opts.timeoutMs ?? 90_000 },
    );
    if (errors.length) throw new Error(`Report rendered with errors:\n  - ${errors.join('\n  - ')}`);
    const out = path.join(dir, 'report.pdf');
    const esc = (s: string) => s.replace(/[<>&]/g, '');
    await page.pdf({
      path: out,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      margin: { top: '16mm', bottom: '16mm', left: '12mm', right: '12mm' },
      headerTemplate: `<div style="width:100%;font-size:8px;color:#667;padding:0 12mm;display:flex;justify-content:space-between;font-family:sans-serif"><span>PII Sentinel · ${esc(label)}${demo ? ' · DEMO DATA — NOT REAL' : ''}</span><span>Internal — contains no personal data</span></div>`,
      footerTemplate: `<div style="width:100%;font-size:8px;color:#667;padding:0 12mm;display:flex;justify-content:space-between;font-family:sans-serif"><span class="date"></span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    });
    // Point the dashboard's Export → PDF at the generated file.
    for (const f of [dataFile, path.join(dir, 'data/report.json')]) {
      if (existsSync(f))
        writeFileSync(f, readFileSync(f, 'utf8').replace(/"pdfFile":\s*null/, '"pdfFile": "report.pdf"'));
    }
    return out;
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dirArg = args.indexOf('--dir');
  const dir =
    dirArg >= 0 ? path.resolve(args[dirArg + 1] ?? '') : args.includes('--demo') ? PATHS.demoOut : PATHS.out;
  exportPdf(dir)
    .then((out) => console.log(`\n  PDF written: ${path.relative(ROOT, out)}\n`))
    .catch((e: Error) => {
      console.error(`\n✘ PDF export failed: ${e.message}\n`);
      process.exit(1);
    });
}
