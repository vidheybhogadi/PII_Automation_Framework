/** PII Sentinel report — the simple single-page report, tested in Chromium against SYNTHETIC fixtures only. */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FIXTURES, INJECTED_SECRETS } from '../fixtures';
import { expectNoHorizontalOverflow, openReport } from './helpers';

type FixtureTest = { status: string; kind: string; title: string };
/** The report is about service (integration) tests; framework self-tests are summarised separately. */
const serviceTests = (dir = FIXTURES.demo) =>
  (
    JSON.parse(readFileSync(path.join(dir, 'data/report.json'), 'utf8')) as { tests: FixtureTest[] }
  ).tests.filter((t) => t.kind === 'integration');
const counts = (dir?: string) => {
  const s = serviceTests(dir);
  const pass = s.filter((t) => t.status === 'PASS').length;
  const fail = s.filter((t) => t.status === 'FAIL').length;
  return { total: s.length, pass, fail, waiting: s.length - pass - fail };
};

test.describe('REPORT UI — at a glance', () => {
  test('RPT-UI-001 one sentence + four numbers + score, all from the data, no console errors', async ({
    page,
  }) => {
    const errors = await openReport(page, FIXTURES.demo);
    const c = counts();
    await expect(page.locator('.demo-ribbon').first()).toContainText('DEMO DATA');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      `${c.fail} of ${c.pass + c.fail} checks failed — needs attention.`,
    );
    await expect(page.getByRole('button', { name: `Passed: ${c.pass}` })).toBeVisible();
    await expect(page.getByRole('button', { name: `Failed: ${c.fail}` })).toBeVisible();
    await expect(page.getByRole('button', { name: `Waiting: ${c.waiting}` })).toBeVisible();
    await expect(page.getByRole('button', { name: `Total: ${c.total}` })).toBeVisible();
    await expect(page.getByRole('img', { name: /Health score \d+% out of 100%/ })).toBeVisible();
    for (const title of ['What needs attention', 'How each endpoint did', 'All tests', 'About this run']) {
      await expect(page.getByRole('heading', { name: title, level: 2 })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('RPT-UI-002 "what needs attention" lists every failure in plain language and opens details', async ({
    page,
  }) => {
    await openReport(page, FIXTURES.demo);
    const attention = page.locator('#attention');
    await expect(attention.locator('.alert-card--fail')).toHaveCount(counts().fail);
    await expect(attention).toContainText('checks are waiting to run');
    await attention.getByRole('button', { name: /Request without a Content-Type header/ }).click();
    const drawer = page.getByRole('dialog', { name: /Request without a Content-Type header/ });
    await expect(drawer).toContainText('What went wrong');
    await expect(drawer).toContainText('Expected');
    await expect(drawer).toContainText('Where to look first');
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });

  test("RPT-UI-003 one tile per endpoint; clicking one shows only that endpoint's test cases under its heading", async ({
    page,
  }) => {
    await openReport(page, FIXTURES.demo);
    const tiles = page.locator('#endpoints .area');
    await expect(tiles).toHaveCount(12); // 11 endpoints + "Across endpoints"
    await expect(page.locator('#endpoints')).toContainText('/api/v1/pii/read');
    await expect(page.locator('#endpoints')).not.toContainText('Security checks');
    await page.getByRole('button', { name: /^Read PII:/ }).click();
    await expect(page.getByRole('button', { name: 'Remove endpoint filter Read PII' })).toBeVisible();
    const headings = page.locator('#tests tr.group-row');
    await expect(headings).toHaveCount(1);
    await expect(headings.first()).toContainText('Read PII');
    await expect(headings.first()).toContainText('POST');
    await expect(page.locator('#tests tbody tr[data-status]')).toHaveCount(15);
  });

  test("RPT-UI-003b all tests are listed under endpoint headings, in the guide's endpoint order", async ({
    page,
  }) => {
    await openReport(page, FIXTURES.demo);
    const first = page.locator('#tests tr.group-row').first();
    await expect(first).toContainText('Health check');
    await expect(first).toContainText('/health/ready');
    await expect(page.locator('#tests tr.group-row').nth(1)).toContainText('Save PII');
  });

  test('RPT-UI-004 test list: tabs, search, pagination, open details', async ({ page }) => {
    await openReport(page, FIXTURES.demo);
    const c = counts();
    const tests = page.locator('#tests');
    await tests.scrollIntoViewIfNeeded();
    await expect(tests.locator('tbody tr[data-status]')).toHaveCount(20);
    await expect(tests.locator('.pagination')).toContainText(`1–20 of ${c.total}`);
    await tests.getByRole('button', { name: /^Failed/ }).click();
    await expect(tests.locator('tbody tr[data-status]')).toHaveCount(c.fail);
    await tests.getByRole('button', { name: /^All/ }).click();
    await tests.getByRole('searchbox', { name: 'Search tests' }).fill('AUTH-018');
    await expect(tests.locator('tbody tr[data-status]')).toHaveCount(1);
    await tests.locator('tbody tr[data-status]').first().click();
    await expect(page.locator('.drawer')).toContainText('PII-AUTH-018');
  });
});

test.describe('REPORT UI — look & feel', () => {
  test('RPT-UI-010 dark/light persists; system follows the OS; accent colours switch', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await openReport(page, FIXTURES.demo);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: 'Toggle dark mode' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Theme and colour' }).click();
    for (const a of ['violet', 'emerald', 'rose', 'amber', 'cyan', 'azure']) {
      await page.getByRole('button', { name: `${a} accent` }).click();
      await expect(page.locator('html')).toHaveAttribute('data-accent', a);
    }
    await page.getByRole('button', { name: /Auto/ }).click();
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('RPT-UI-011 dock: back-to-top leaves no empty slot; toggle folds and unfolds the bar', async ({
    page,
  }) => {
    await openReport(page, FIXTURES.demo);
    const top = page.getByRole('button', { name: 'Back to top' });
    await expect(top).toHaveAttribute('data-hidden', 'true');
    const hiddenHeight = await top.evaluate((el) => el.getBoundingClientRect().height);
    expect(hiddenHeight, 'hidden back-to-top must not take space').toBe(0);
    await page.locator('#about').scrollIntoViewIfNeeded();
    await expect(top).toHaveAttribute('data-hidden', 'false');
    await expect.poll(() => top.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(30);
    await top.click();
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 15_000 }).toBeLessThan(50);

    const dock = page.getByRole('toolbar', { name: 'Quick actions' });
    await page.getByRole('button', { name: 'Hide quick actions' }).click();
    await expect(dock).toHaveAttribute('data-collapsed', 'true');
    await expect.poll(() => dock.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(70);
    await page.reload();
    await expect(dock).toHaveAttribute('data-collapsed', 'true'); // remembered
    await page.getByRole('button', { name: 'Show quick actions' }).click();
    await expect(dock).toHaveAttribute('data-collapsed', 'false');
    await expect.poll(() => dock.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(200);
  });

  test('RPT-UI-012 search (Ctrl+K) finds a test; shortcuts help (?) and guide open and close', async ({
    page,
  }) => {
    await openReport(page, FIXTURES.demo);
    await page.keyboard.press('Control+k');
    const input = page.getByRole('combobox', { name: 'Search' });
    await expect(input).toBeFocused();
    await input.fill('AUTH-018');
    await page.keyboard.press('Enter');
    await expect(page.locator('.drawer')).toContainText('PII-AUTH-018');
    await page.keyboard.press('Escape');
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'How to read this report' }).click();
    await expect(page.getByRole('dialog', { name: 'How to read this report' })).toBeVisible();
  });

  test('RPT-UI-014 keyboard: sections (1–4), filters (F/W/A), paging (← →), next test (J/K), export (E), dock (Q)', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openReport(page, FIXTURES.demo);
    const c = counts();
    const inView = (id: string) =>
      page.evaluate((i) => Math.abs(document.getElementById(i)!.getBoundingClientRect().top) < 150, id);

    for (const [key, id] of [
      ['1', 'attention'],
      ['2', 'endpoints'],
      ['3', 'tests'],
    ] as const) {
      await page.keyboard.press(key);
      await expect.poll(() => inView(id)).toBe(true);
    }
    await page.keyboard.press('0');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

    const rows = page.locator('#tests tbody tr[data-status]');
    await page.keyboard.press('f');
    await expect(rows).toHaveCount(c.fail);
    await page.keyboard.press('w');
    await expect(rows).toHaveCount(c.waiting);
    await page.keyboard.press('a');
    await expect(page.locator('#tests .pagination')).toContainText(`1–20 of ${c.total}`);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#tests .pagination')).toContainText(`21–40 of ${c.total}`);
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#tests .pagination')).toContainText(`1–20 of ${c.total}`);

    // J / K follow the table order.
    const first = (await rows.nth(0).locator('.mono').textContent())!.trim();
    const second = (await rows.nth(1).locator('.mono').textContent())!.trim();
    await rows.first().click();
    await expect(page.locator('.drawer')).toContainText(first);
    await page.keyboard.press('j');
    await expect(page.locator('.drawer')).toContainText(second);
    await page.keyboard.press('k');
    await expect(page.locator('.drawer')).toContainText(first);
    await page.keyboard.press('Escape');
    await expect(page.locator('.drawer')).toBeHidden();

    await page.keyboard.press('e');
    await expect(page.getByRole('menu', { name: 'Export' })).toBeVisible();
    await page.keyboard.press('Escape');

    const dock = page.getByRole('toolbar', { name: 'Quick actions' });
    const state = await dock.getAttribute('data-collapsed');
    await page.locator('body').click({ position: { x: 4, y: 300 } });
    await page.keyboard.press('q');
    await expect(dock).not.toHaveAttribute('data-collapsed', state!);
  });

  test('RPT-UI-013 no horizontal overflow at 4K, laptop, tablet and phone widths', async ({ page }) => {
    for (const [w, h] of [
      [3840, 2160],
      [1280, 800],
      [820, 1180],
      [390, 844],
    ]) {
      await page.setViewportSize({ width: w as number, height: h as number });
      await openReport(page, FIXTURES.demo);
      await expectNoHorizontalOverflow(page);
    }
  });
});

test.describe('REPORT UI — honest states', () => {
  test('RPT-UI-020 empty run: "no tests" instead of fake zeros', async ({ page }) => {
    await openReport(page, FIXTURES.empty);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('No tests were run.');
    await expect(page.getByRole('img', { name: /Health score not available/ })).toBeVisible();
    await expect(page.getByText('Nothing needs attention')).toBeVisible();
  });

  test('RPT-UI-021 service unreachable: one clear environment message, not N separate failures', async ({
    page,
  }) => {
    await openReport(page, FIXTURES.preflight);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'The PII service could not be reached',
    );
    await expect(page.locator('#attention .alert-card--fail')).toHaveCount(1);
    await expect(page.locator('#about')).toContainText('Service readiness check failed at startup');
  });

  test('RPT-UI-022 framework self-tests never inflate the service numbers', async ({ page }) => {
    await openReport(page, FIXTURES.demo);
    await expect(page.getByRole('button', { name: `Total: ${counts().total}` })).toBeVisible();
    await expect(page.locator('#about')).toContainText(/Framework self-tests\s*\d+\/\d+ passed/);
  });

  test('RPT-UI-025 a self-tests-only run says the service was not tested (no score, no "all clear")', async ({
    page,
  }) => {
    await openReport(page, FIXTURES.selfOnly);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('The PII service was not tested');
    await expect(page.getByRole('img', { name: /Health score not available/ })).toBeVisible();
    await expect(page.getByText('Service not tested')).toBeVisible();
  });

  test('RPT-UI-023 malformed data shows a clear message, not a crash', async ({ page }) => {
    await openReport(page, FIXTURES.malformed);
    await expect(page.getByRole('alert')).toContainText('Unsupported report schema version');
  });

  test('RPT-UI-024 large run (1,200 tests) opens quickly and renders one page of rows', async ({ page }) => {
    const start = Date.now();
    const errors = await openReport(page, FIXTURES.large);
    expect(Date.now() - start).toBeLessThan(15_000);
    await expect(page.locator('#tests tbody tr[data-status]')).toHaveCount(20);
    await expect(page.locator('#tests .pagination')).toContainText(
      `of ${serviceTests(FIXTURES.large).length}`,
    );
    expect(errors).toEqual([]);
  });
});

test.describe('REPORT UI — privacy & accessibility', () => {
  test('RPT-UI-030 injected PII / secrets never reach the page or any output file', async ({ page }) => {
    await openReport(page, FIXTURES.redaction);
    // Open a failed test: its details include the (scrubbed) technical error message.
    await page.locator('#tests tbody tr[data-status="FAIL"]').first().click();
    await page.getByText('Technical error message').click();
    const html = await page.content();
    const files = [
      'data/report-data.js',
      'data/report.json',
      'results.json',
      'results.csv',
      'summary.txt',
    ].map((f) => readFileSync(path.join(FIXTURES.redaction, f), 'utf8'));
    for (const [name, secret] of Object.entries(INJECTED_SECRETS)) {
      expect(html.includes(secret), `${name} in page`).toBe(false);
      for (const f of files) expect(f.includes(secret), `${name} in output file`).toBe(false);
    }
    for (const fragment of ['Hunter2Secret', 'SuperSecret123', 'jane.realperson']) {
      expect(html).not.toContain(fragment);
      for (const f of files) expect(f).not.toContain(fragment);
    }
  });

  test('RPT-UI-031 axe: no serious or critical accessibility issues (light and dark)', async ({ page }) => {
    test.setTimeout(120_000);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await openReport(page, FIXTURES.demo);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(
        serious.map((v) => `${scheme}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`),
      ).toEqual([]);
    }
  });

  test('RPT-UI-032 reduced motion is honoured and keyboard focus is visible', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openReport(page, FIXTURES.demo);
    expect(await page.locator('.bg__blob--1').evaluate((el) => getComputedStyle(el).animationName)).toBe(
      'none',
    );
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle),
    ).not.toBe('none');
  });
});
