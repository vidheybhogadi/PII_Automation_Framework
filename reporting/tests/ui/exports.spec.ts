/** Exports: Excel, CSV, JSON, copy summary, print mode, programmatic PDF. SYNTHETIC fixtures only. */
import { expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';
import { cpSync, existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { exportPdf } from '../../generator/export-pdf';
import { FIXTURES, FIXTURE_ROOT } from '../fixtures';
import { openReport } from './helpers';

test.describe('REPORT UI — exports', () => {
  test('RPT-EX-001 CSV export downloads the (filtered) test table', async ({ page }) => {
    await openReport(page, FIXTURES.demo);
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: /Raw data \(CSV\)/ }).click(),
    ]);
    const csv = readFileSync((await dl.path()) as string, 'utf8');
    const data = JSON.parse(readFileSync(path.join(FIXTURES.demo, 'data/report.json'), 'utf8')) as {
      tests: { kind: string }[];
    };
    expect(csv.split('\n')[0]).toContain('test_id,endpoint,title,status,remarks,what_it_does,why_it_matters');
    // Exports the current view — default scope is service tests.
    expect(csv.trim().split('\n')).toHaveLength(
      data.tests.filter((t) => t.kind === 'integration').length + 1,
    );
  });

  test('RPT-EX-006 Excel export is the styled test-case workbook (same design as docs/test-cases.xlsx)', async ({
    page,
  }) => {
    await openReport(page, FIXTURES.demo);
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: /Excel \(\.xlsx\)/ }).click(),
    ]);
    expect(dl.suggestedFilename()).toBe('test-cases.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile((await dl.path()) as string);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Test Cases']);
    const ws = wb.getWorksheet('Test Cases')!;
    const texts: string[] = [];
    ws.eachRow((r) =>
      texts.push(r.values ? String((r.values as unknown[]).filter(Boolean).join(' | ')) : ''),
    );
    const all = texts.join('\n');
    // Same header row, endpoint sections and statuses as the docs sheet.
    expect(all).toContain('S/No | TC ID | Test Case Description');
    expect(all).toContain('Tester Notes');
    expect(all).toMatch(/Save PII/);
    expect(all).toMatch(/\bFail\b/);
    expect(all).toMatch(/\bPass\b/);
    // Coloured status cells (the design), not plain values.
    let styled = 0;
    ws.eachRow((r) =>
      r.eachCell((c) => {
        if (c.text === 'Fail' && (c.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb) styled++;
      }),
    );
    expect(styled).toBeGreaterThan(0);
    // Section links must work in Excel for the web: HYPERLINK formulas, never "#Sheet!A1" external links.
    const formulas: string[] = [];
    let externalLinks = 0;
    ws.eachRow((r) =>
      r.eachCell((c) => {
        if (c.formula?.startsWith('HYPERLINK("#')) formulas.push(c.formula);
        if ((c.value as { hyperlink?: string } | null)?.hyperlink) externalLinks++;
      }),
    );
    expect(formulas.length).toBeGreaterThan(0);
    expect(externalLinks).toBe(0);
  });

  test('RPT-EX-002 JSON export is valid, sanitized and labelled with its data source', async ({ page }) => {
    await openReport(page, FIXTURES.demo, '#status=FAIL');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: /Data \(JSON\)/ }).click(),
    ]);
    const json = JSON.parse(readFileSync((await dl.path()) as string, 'utf8')) as {
      dataSource: string;
      tests: { status: string }[];
    };
    expect(json.dataSource).toBe('DEMO');
    expect(json.tests.length).toBeGreaterThan(0);
    expect(json.tests.every((t) => t.status === 'Fail')).toBe(true);
    expect(dl.suggestedFilename()).toContain('-filtered');
  });

  test('RPT-EX-003 copy summary produces a Slack/ClickUp-ready text', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openReport(page, FIXTURES.demo);
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('menuitem', { name: /Copy summary/ }).click();
    await expect(page.locator('.toast')).toContainText('Summary copied');
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain('Aisle PII API Automation — QA Summary');
    expect(text).toMatch(/Pass: \d+ {2}Fail: \d+ {2}Security finding: \d+ {2}Blocked: \d+/);
    expect(text).toContain('[DEMO DATA — NOT REAL]');
    expect(text).toMatch(/API Pass Rate: \d+\.\d%/);
  });

  test('RPT-EX-004 print mode renders the cover page and hides on-screen controls', async ({ page }) => {
    await openReport(page, FIXTURES.demo, '?mode=print');
    await expect(page.locator('.cover')).toBeVisible();
    await expect(page.locator('.topbar')).toHaveCount(0);
    await expect(page.locator('.dock')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('.cover')).toContainText('checks failed');
  });

  test('RPT-EX-005 programmatic PDF export produces a real PDF and links it from the dashboard', async () => {
    test.setTimeout(120_000);
    const dir = path.join(FIXTURE_ROOT, 'pdf');
    cpSync(FIXTURES.demo, dir, { recursive: true });
    const out = await exportPdf(dir);
    expect(existsSync(out)).toBe(true);
    expect(statSync(out).size).toBeGreaterThan(100_000);
    expect(readFileSync(out).subarray(0, 5).toString()).toBe('%PDF-');
    expect(readFileSync(path.join(dir, 'data/report-data.js'), 'utf8')).toContain('"pdfFile": "report.pdf"');
  });
});
