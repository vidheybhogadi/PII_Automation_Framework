import { expect, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Open a fixture report, fail the test on any page/console error. */
export async function openReport(page: Page, dir: string, suffix = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.goto(`${pathToFileURL(path.join(dir, 'index.html')).href}${suffix}`);
  await page.waitForFunction(
    () => (globalThis as { __PII_READY__?: boolean }).__PII_READY__ === true,
    undefined,
    { timeout: 30_000 },
  );
  return errors;
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page must not scroll horizontally').toBeLessThanOrEqual(0);
}
