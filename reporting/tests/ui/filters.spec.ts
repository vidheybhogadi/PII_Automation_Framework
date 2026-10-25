/** Test-list filters: Group by + dependent Show picker, M2 area → endpoint narrowing, URL hash, view export. SYNTHETIC fixtures only. */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildHash, EMPTY_FILTERS, parseHash } from '../../dashboard/src/utils';
import { FIXTURES, M2_EXTRA } from '../fixtures';
import { expectNoHorizontalOverflow, openReport } from './helpers';

interface Fx {
  tests: { id: string; api?: string; apiArea?: string; info?: { type?: string } }[];
  apiAreas?: { key: string; name: string; endpoints: { key: string; method: string; path: string }[] }[];
}
const data = (dir: string) => JSON.parse(readFileSync(path.join(dir, 'data/report.json'), 'utf8')) as Fx;

const groupBy = (page: Page, name: string) =>
  page.locator('#tests').getByRole('group', { name: 'Group by' }).getByRole('button', { name, exact: true });
const showing = (page: Page) => page.locator('#tests .view-bar [role="status"]');
const optionTexts = (select: Locator) =>
  select.locator('option').evaluateAll((os) => os.map((o) => (o.textContent ?? '').trim()));
/** "Positive (12) · 9 ✓ · 2 ✗ · 1 ⛔" → { label, total, pass, fail, blocked } */
function parseOption(text: string) {
  const m = text.match(/^(.*) \((\d+)\) · (\d+) ✓ · (\d+) ✗(?: · (\d+) ⛔)?$/);
  expect(m, `option "${text}" shows count and pass / fail / blocked`).toBeTruthy();
  const [, label, total, pass, fail, blocked] = m as RegExpMatchArray;
  return {
    label,
    total: Number(total),
    pass: Number(pass),
    fail: Number(fail),
    blocked: Number(blocked ?? 0),
  };
}

/** Minimal RFC 4180 parser (quoted cells may hold commas, quotes and newlines). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i] as string;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test.describe('REPORT UI — filters', () => {
  test('RPT-UI-050 the Show picker follows Group by: Type, Suite and Category values, endpoint picker, none', async ({
    page,
  }) => {
    await openReport(page, FIXTURES.m2);
    const tests = page.locator('#tests');
    const show = tests.getByRole('combobox', { name: 'Show' });

    // Endpoint (default): Area + searchable Endpoint picker, no value list.
    await expect(tests.getByRole('combobox', { name: 'Area' })).toBeVisible();
    await expect(tests.getByRole('combobox', { name: 'Endpoint' })).toBeVisible();
    await expect(show).toHaveCount(0);

    await groupBy(page, 'Type').click();
    const types = (await optionTexts(show)).map(parseOption);
    expect(types.map((o) => o.label)).toEqual([
      'All',
      'Positive',
      'Negative',
      'Security',
      'Database',
      'Contract',
    ]);
    expect(types.slice(1).reduce((n, o) => n + o.total, 0)).toBe(types[0]!.total);

    await groupBy(page, 'Suite').click();
    expect((await optionTexts(show)).map((t) => parseOption(t).label)).toEqual([
      'All',
      'Smoke',
      'Regression',
    ]);

    await groupBy(page, 'Category').click();
    const cats = (await optionTexts(show)).map(parseOption);
    expect(cats[0]!.label).toBe('All');
    expect(cats.length).toBeGreaterThan(2);
    expect(cats.slice(1).reduce((n, o) => n + o.total, 0)).toBe(cats[0]!.total);

    await groupBy(page, 'None').click();
    await expect(show).toHaveCount(0);
    await expect(tests.getByRole('combobox', { name: 'Endpoint' })).toHaveCount(0);

    // Milestone 1: no areas — one searchable endpoint picker with the same look.
    await openReport(page, FIXTURES.demo);
    await groupBy(page, 'Endpoint').click();
    await expect(page.locator('#tests').getByRole('combobox', { name: 'Area' })).toHaveCount(0);
    await expect(page.locator('#tests').getByRole('combobox', { name: 'Endpoint' })).toBeVisible();
  });

  test('RPT-UI-051 choosing a Type shows only that group; it combines with the status tabs and search', async ({
    page,
  }) => {
    await openReport(page, FIXTURES.m2);
    const tests = page.locator('#tests');
    await groupBy(page, 'Type').click();
    const show = tests.getByRole('combobox', { name: 'Show' });
    const negative = parseOption((await optionTexts(show)).find((t) => t.startsWith('Negative ')) as string);
    expect(negative.total).toBeGreaterThan(0);
    await show.selectOption('Negative');

    const heads = tests.locator('tr.group-row');
    await expect(heads).toHaveCount(1);
    await expect(heads.first()).toContainText('Negative');
    const all = data(FIXTURES.m2).tests.length;
    await expect(showing(page)).toHaveText(`Showing ${negative.total} of ${all} tests`);
    expect(negative.total).toBeLessThan(all);

    // + search: the per-API test without a workbook row is Negative by its @negative tag.
    const search = tests.getByRole('searchbox', { name: 'Search tests' });
    await search.fill(M2_EXTRA.id);
    await expect(showing(page)).toHaveText(`Showing 1 of ${all} tests`);
    await search.fill('');

    // + status tab Fail → only the failed negative tests.
    await tests.getByRole('group', { name: 'Status' }).getByRole('button', { name: /^Fail/ }).click();
    await expect(showing(page)).toHaveText(new RegExp(`^Showing ${negative.fail} of `));
    if (negative.fail)
      await expect(tests.locator('tbody tr[data-status]').first()).toHaveAttribute('data-status', 'FAIL');

    // Clear filters → everything again, Show back to All.
    await tests.getByRole('button', { name: 'Clear filters' }).click();
    await expect(show).toHaveValue('');
    await expect(showing(page)).toHaveText(/^Showing (\d+) of \1 tests$/);
    await expect(tests.getByRole('button', { name: 'Clear filters' })).toBeDisabled();
  });

  test('RPT-UI-052 M2: ten area tiles; an area narrows the endpoint picker to its own endpoints (type-ahead)', async ({
    page,
  }) => {
    await openReport(page, FIXTURES.m2);
    const fx = data(FIXTURES.m2);
    const areas = fx.apiAreas ?? [];
    expect(areas.map((a) => a.key)).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10']);
    expect(fx.tests.find((t) => t.id === M2_EXTRA.id)).toMatchObject({ api: 'API-004', apiArea: 'G5' });

    // "How each endpoint did": one tile per area, not one per endpoint.
    const section = page.locator('#endpoints');
    await expect(section.locator('.area')).toHaveCount(10);
    const g3 = areas.find((a) => a.key === 'G3')!;
    const tile = section.getByRole('button', { name: new RegExp(`^G3 ${escapeRe(g3.name)}:`) });
    await tile.click();
    await expect(tile).toHaveAttribute('aria-expanded', 'true');
    const detail = section.getByRole('region', { name: `${g3.name} endpoints` });
    await expect(detail.locator('.area')).toHaveCount(g3.endpoints.length);
    await detail.getByRole('button', { name: "Show this area's tests" }).click();

    const tests = page.locator('#tests');
    await expect(tests.getByRole('combobox', { name: 'Area' })).toHaveValue('G3');
    const inG3 = fx.tests.filter((t) => t.apiArea === 'G3').length;
    await expect(showing(page)).toHaveText(new RegExp(`^Showing ${inG3} of ${fx.tests.length} tests$`));

    // The endpoint picker lists "All in G3 …" + only G3's endpoints, each with method, path and counts.
    const combo = tests.getByRole('combobox', { name: 'Endpoint' });
    await combo.click();
    const options = tests.getByRole('listbox').getByRole('option');
    await expect(options).toHaveCount(g3.endpoints.length + 1);
    await expect(options.first()).toContainText(`All in G3 ${g3.name}`);
    for (const ep of g3.endpoints) await expect(tests.getByRole('listbox')).toContainText(ep.path);
    await expect(options.nth(1)).toContainText(/\(\d+\) · \d+ ✓ · \d+ ✗/);

    // Type-ahead on the path narrows to one endpoint; Enter picks it.
    const target = g3.endpoints[1]!;
    await combo.fill(target.path);
    await expect(options).toHaveCount(2); // "All in …" + the match
    await combo.press('ArrowDown');
    await combo.press('Enter');
    await expect(combo).toHaveValue(`${target.method} ${target.path}`);
    const heads = tests.locator('tr.group-row');
    await expect(heads).toHaveCount(1);
    await expect(heads.first()).toContainText(target.path);
    const n = fx.tests.filter((t) => t.api === target.key).length;
    await expect(showing(page)).toHaveText(new RegExp(`^Showing ${n} of `));

    // Another area drops an endpoint that is not in it.
    await tests.getByRole('combobox', { name: 'Area' }).selectOption('G1');
    await expect(combo).toHaveValue(/All in G1/);
  });

  test('RPT-UI-053 the selection is kept in the URL hash and restored from a shared link', async ({
    page,
  }) => {
    await openReport(page, FIXTURES.demo, '#by=type&show=Security&status=FAIL');
    const tests = page.locator('#tests');
    await expect(groupBy(page, 'Type')).toHaveAttribute('aria-pressed', 'true');
    await expect(tests.getByRole('combobox', { name: 'Show' })).toHaveValue('Security');
    await expect(
      tests.getByRole('group', { name: 'Status' }).getByRole('button', { name: /^Fail/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    const heads = tests.locator('tr.group-row');
    if ((await heads.count()) > 0) await expect(heads.first()).toContainText('Security');

    // Changing the choice updates the hash (shareable).
    await groupBy(page, 'Suite').click();
    await tests.getByRole('combobox', { name: 'Show' }).selectOption('Smoke');
    await expect.poll(() => page.evaluate(() => location.hash)).toContain('by=suite');
    await expect.poll(() => page.evaluate(() => location.hash)).toContain('show=Smoke');

    // M2 area + endpoint from a link.
    await openReport(page, FIXTURES.m2, '#area=G1&endpoint=API-001');
    const m2 = page.locator('#tests');
    await expect(m2.getByRole('combobox', { name: 'Area' })).toHaveValue('G1');
    await expect(m2.getByRole('combobox', { name: 'Endpoint' })).toHaveValue(
      'GET /V1/pii_integration/first_name',
    );
    const n = data(FIXTURES.m2).tests.filter((t) => t.api === 'API-001').length;
    await expect(showing(page)).toHaveText(new RegExp(`^Showing ${n} of `));
  });

  test('RPT-UI-054 "Export current view" downloads only the shown tests, with the results.csv columns', async ({
    page,
  }) => {
    await openReport(page, FIXTURES.m2, '#by=type&show=Positive');
    const shown = Number(((await showing(page).textContent()) ?? '').match(/Showing (\d+)/)?.[1]);
    expect(shown).toBeGreaterThan(0);
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#tests').getByRole('button', { name: 'Export current view (CSV)' }).click(),
    ]);
    expect(dl.suggestedFilename()).toMatch(/-view\.csv$/);
    const csv = parseCsv(readFileSync((await dl.path()) as string, 'utf8'));
    const header = parseCsv(readFileSync(path.join(FIXTURES.m2, 'results.csv'), 'utf8'))[0];
    expect(csv[0]).toEqual(header);
    expect(csv).toHaveLength(shown + 1);
    const typeCol = csv[0]!.indexOf('test_type');
    expect(typeCol).toBeGreaterThan(-1);
    for (const row of csv.slice(1)) expect(row[typeCol]).toBe('Positive');
  });

  test('RPT-UI-055 M2 pickers and area tiles: no serious axe issues (light and dark), no overflow on a phone', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await openReport(page, FIXTURES.m2);
      await page.locator('#endpoints .area').first().click(); // open an area
      await page.locator('#tests').getByRole('combobox', { name: 'Endpoint' }).click(); // open the list
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(
        serious.map((v) => `${scheme}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`),
      ).toEqual([]);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await openReport(page, FIXTURES.m2, '#by=category');
    await expectNoHorizontalOverflow(page);
  });

  test('RPT-UI-056 hash round trip: every filter and the Group by choice survive a shared link', () => {
    const f = {
      ...EMPTY_FILTERS,
      statuses: ['FAIL' as const],
      area: 'G3',
      endpoint: 'API-011',
      show: '',
      q: 'name x',
    };
    expect(parseHash(buildHash(f, 'k1', 'endpoint'))).toEqual({ filters: f, test: 'k1', by: 'endpoint' });
    const typed = { ...EMPTY_FILTERS, show: 'Security' };
    expect(parseHash(buildHash(typed, null, 'type'))).toEqual({ filters: typed, test: null, by: 'type' });
    expect(buildHash(EMPTY_FILTERS, null, 'endpoint')).toBe(''); // default view: clean URL
    expect(parseHash('#status=FAIL').filters).toEqual({ ...EMPTY_FILTERS, statuses: ['FAIL'] }); // older links
  });
});
