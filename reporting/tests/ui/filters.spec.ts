/** Test-list filter bar (Group by · Show · Status · Area · Endpoint · chips), the endpoint side panel, URL hash, view export. SYNTHETIC fixtures only. */
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

const groupBy = (page: Page, label: string) => ({
  click: () => page.locator('#tests').getByRole('combobox', { name: 'Group by' }).selectOption({ label }),
});
const showing = (page: Page) => page.locator('#tests .filter-count');
const optionTexts = (select: Locator) =>
  select.locator('option').evaluateAll((os) => os.map((o) => (o.textContent ?? '').trim()));
/** "Positive (12)" → { label, total } — the name and the count only, no pass / fail / blocked split. */
function parseOption(text: string) {
  expect(text, `option "${text}" has no status counts`).not.toMatch(/[✓✗⛔]/);
  const m = text.match(/^(.*) \((\d+)\)$/);
  expect(m, `option "${text}" shows name and count`).toBeTruthy();
  const [, label, total] = m as RegExpMatchArray;
  return { label, total: Number(total) };
}
const chips = (page: Page) => page.locator('#tests').getByRole('group', { name: 'Active filters' });
/** The vertical centre of an element (controls on one row share it). */
const centreY = (l: Locator) =>
  l.evaluate((e) => {
    const r = e.getBoundingClientRect();
    return Math.round(r.top + r.height / 2);
  });

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
  test('RPT-UI-050 the Show picker follows Group by; options show name and count only', async ({ page }) => {
    await openReport(page, FIXTURES.m2);
    const tests = page.locator('#tests');
    const show = tests.getByRole('combobox', { name: 'Show' });

    // Endpoint (default): Area + searchable Endpoint picker, no value list.
    await expect(tests.getByRole('combobox', { name: 'Area' })).toBeVisible();
    await expect(tests.getByRole('combobox', { name: 'Endpoint' })).toBeVisible();
    await expect(show).toHaveCount(0);
    for (const t of await optionTexts(tests.getByRole('combobox', { name: 'Area' }))) parseOption(t);

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
    // The Endpoint picker belongs to Group by = Endpoint; Area stays.
    await expect(tests.getByRole('combobox', { name: 'Endpoint' })).toHaveCount(0);
    await expect(tests.getByRole('combobox', { name: 'Area' })).toBeVisible();

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

    // Milestone 1: no areas — one searchable endpoint picker.
    await openReport(page, FIXTURES.demo);
    await groupBy(page, 'Endpoint').click();
    await expect(page.locator('#tests').getByRole('combobox', { name: 'Area' })).toHaveCount(0);
    await expect(page.locator('#tests').getByRole('combobox', { name: 'Endpoint' })).toBeVisible();
  });

  test('RPT-UI-051 Type + Status dropdown + search combine; each shows as a chip; Clear all resets', async ({
    page,
  }) => {
    await openReport(page, FIXTURES.m2);
    const tests = page.locator('#tests');
    const all = data(FIXTURES.m2).tests.length;
    await expect(showing(page)).toHaveText(`${all} tests`);
    await expect(chips(page)).toHaveCount(0); // no empty chip row

    await groupBy(page, 'Type').click();
    const show = tests.getByRole('combobox', { name: 'Show' });
    const negative = parseOption((await optionTexts(show)).find((t) => t.startsWith('Negative ')) as string);
    expect(negative.total).toBeGreaterThan(0);
    await show.selectOption('Negative');

    const heads = tests.locator('tr.group-row');
    await expect(heads).toHaveCount(1);
    await expect(heads.first()).toContainText('Negative');
    await expect(showing(page)).toHaveText(`Showing ${negative.total} of ${all} tests`);
    await expect(chips(page).getByRole('button', { name: 'Remove filter Type: Negative' })).toBeVisible();

    // + search: the per-API test without a workbook row is Negative by its @negative tag.
    const search = tests.getByRole('searchbox', { name: 'Search tests' });
    await search.fill(M2_EXTRA.id);
    await expect(showing(page)).toHaveText(`Showing 1 of ${all} tests`);
    await expect(chips(page)).toContainText(`Search:“${M2_EXTRA.id}”`);
    await search.fill('');

    // + Status dropdown: its counts follow the other filters; Fail shows only failed negative tests.
    const status = tests.getByRole('combobox', { name: 'Status' });
    const failText = (await optionTexts(status)).find((t) => t.startsWith('Fail ')) as string;
    const fail = parseOption(failText).total;
    await status.selectOption('FAIL');
    await expect(showing(page)).toHaveText(`Showing ${fail} of ${all} tests`);
    await expect(chips(page).getByRole('button', { name: 'Remove filter Status: Fail' })).toBeVisible();
    if (fail)
      await expect(tests.locator('tbody tr[data-status]').first()).toHaveAttribute('data-status', 'FAIL');

    // Removing one chip drops only that filter.
    await chips(page).getByRole('button', { name: 'Remove filter Status: Fail' }).click();
    await expect(status).toHaveValue('');
    await expect(showing(page)).toHaveText(`Showing ${negative.total} of ${all} tests`);

    // Clear all → everything again, Show back to All, chip row gone.
    await status.selectOption('FAIL');
    await chips(page).getByRole('button', { name: 'Clear all' }).click();
    await expect(show).toHaveValue('');
    await expect(status).toHaveValue('');
    await expect(chips(page)).toHaveCount(0);
    await expect(showing(page)).toHaveText(`${all} tests`);
  });

  test('RPT-UI-052 M2: area tile opens the side panel; "Show in test list" applies the area; endpoint type-ahead', async ({
    page,
  }) => {
    await openReport(page, FIXTURES.m2);
    const fx = data(FIXTURES.m2);
    const areas = fx.apiAreas ?? [];
    expect(areas.map((a) => a.key)).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10']);
    expect(fx.tests.find((t) => t.id === M2_EXTRA.id)).toMatchObject({ api: 'API-004', apiArea: 'G5' });

    // "How each endpoint did": one tile per area, no expand-below detail.
    const section = page.locator('#endpoints');
    await expect(section.locator('.area')).toHaveCount(10);
    const g3 = areas.find((a) => a.key === 'G3')!;
    await section.getByRole('button', { name: new RegExp(`^G3 ${escapeRe(g3.name)}:`) }).click();
    await expect(section.locator('.area-detail')).toHaveCount(0);
    const panel = page.getByRole('dialog', { name: `G3 ${g3.name}` });
    await expect(panel.locator('.xrow')).toHaveCount(g3.endpoints.length);
    for (const ep of g3.endpoints) await expect(panel).toContainText(ep.path);
    await panel.getByRole('button', { name: 'Show in test list' }).click();
    await expect(panel).toBeHidden();

    const tests = page.locator('#tests');
    await expect(tests.getByRole('combobox', { name: 'Area' })).toHaveValue('G3');
    await expect(
      chips(page).getByRole('button', { name: `Remove filter Area: G3 ${g3.name}` }),
    ).toBeVisible();
    const inG3 = fx.tests.filter((t) => t.apiArea === 'G3').length;
    await expect(showing(page)).toHaveText(new RegExp(`^Showing ${inG3} of ${fx.tests.length} tests$`));

    // The endpoint picker lists "All in G3 …" + only G3's endpoints, each with method, path and its count.
    const combo = tests.getByRole('combobox', { name: 'Endpoint' });
    await combo.click();
    const options = tests.getByRole('listbox').getByRole('option');
    await expect(options).toHaveCount(g3.endpoints.length + 1);
    await expect(options.first()).toContainText(`All in G3 ${g3.name}`);
    for (const ep of g3.endpoints) await expect(tests.getByRole('listbox')).toContainText(ep.path);
    await expect(options.nth(1).locator('.combo__count')).toHaveText(/^\(\d+\)$/);
    await expect(tests.getByRole('listbox')).not.toContainText('✓');

    // Type-ahead on the path narrows to one endpoint; Enter picks it.
    const target = g3.endpoints[1]!;
    await combo.fill(target.path);
    await expect(options).toHaveCount(2); // "All in …" + the match
    await combo.press('ArrowDown');
    await combo.press('Enter');
    await expect(combo).toHaveValue(`${target.method} ${target.path}`);
    await expect(
      chips(page).getByRole('button', { name: `Remove filter Endpoint: ${target.method} ${target.path}` }),
    ).toBeVisible();
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
    await expect(tests.getByRole('combobox', { name: 'Group by' })).toHaveValue('type');
    await expect(tests.getByRole('combobox', { name: 'Show' })).toHaveValue('Security');
    await expect(tests.getByRole('combobox', { name: 'Status' })).toHaveValue('FAIL');
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

  test('RPT-UI-054 "Export CSV" downloads only the shown tests, with the results.csv columns', async ({
    page,
  }) => {
    await openReport(page, FIXTURES.m2, '#by=type&show=Positive');
    const shown = Number(((await showing(page).textContent()) ?? '').match(/Showing (\d+)/)?.[1]);
    expect(shown).toBeGreaterThan(0);
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#tests').getByRole('button', { name: 'Export CSV' }).click(),
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

  test('RPT-UI-055 filter bar and side panel: no serious axe issues (light and dark), no overflow on a phone', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const check = async (what: string) => {
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(
        serious.map((v) => `${what}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`),
      ).toEqual([]);
    };
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await openReport(page, FIXTURES.m2, '#by=type&show=Negative&status=FAIL&area=G3&q=x');
      await page.locator('#tests').getByRole('combobox', { name: 'Area' }).focus();
      await check(`${scheme} filters + chips`);
      await openReport(page, FIXTURES.m2);
      await page.locator('#tests').getByRole('combobox', { name: 'Endpoint' }).click(); // open the list
      await check(`${scheme} endpoint list`);
      await page.keyboard.press('Escape');
      await page.locator('#endpoints .area').first().click(); // side panel, level 1
      await expect(page.locator('.drawer .xrow').first()).toBeVisible();
      await check(`${scheme} panel level 1`);
      await page.locator('.drawer .xrow').first().click();
      await expect(page.locator('.drawer .xtest').first()).toBeVisible();
      await check(`${scheme} panel level 2`);
      await page.locator('.drawer .xtest').first().click();
      await expect(page.locator('.drawer .crumbs__item')).toHaveCount(3);
      await check(`${scheme} panel level 3`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await openReport(page, FIXTURES.m2, '#by=category');
    await expectNoHorizontalOverflow(page);
  });

  test('RPT-UI-056 hash round trip: every filter, the Group by choice and the side panel survive a shared link', () => {
    const f = {
      ...EMPTY_FILTERS,
      statuses: ['FAIL' as const],
      area: 'G3',
      endpoint: 'API-011',
      show: '',
      q: 'name x',
    };
    expect(parseHash(buildHash(f, 'k1', 'endpoint'))).toEqual({
      filters: f,
      test: 'k1',
      by: 'endpoint',
      panel: null,
    });
    const typed = { ...EMPTY_FILTERS, show: 'Security' };
    expect(parseHash(buildHash(typed, null, 'type'))).toEqual({
      filters: typed,
      test: null,
      by: 'type',
      panel: null,
    });
    const panel = { area: 'G3', endpoint: 'API-011' };
    expect(parseHash(buildHash(EMPTY_FILTERS, 'k2', 'endpoint', panel))).toMatchObject({ panel, test: 'k2' });
    expect(
      parseHash(buildHash(EMPTY_FILTERS, null, 'endpoint', { area: null, endpoint: 'readPii' })).panel,
    ).toEqual({ area: null, endpoint: 'readPii' });
    expect(buildHash(EMPTY_FILTERS, null, 'endpoint')).toBe(''); // default view: clean URL
    expect(parseHash('#status=FAIL').filters).toEqual({ ...EMPTY_FILTERS, statuses: ['FAIL'] }); // older links
  });

  test('RPT-UI-057 Status dropdown: every status with its count; Not applicable only when a test has it', async ({
    page,
  }) => {
    await openReport(page, FIXTURES.m2);
    const status = page.locator('#tests').getByRole('combobox', { name: 'Status' });
    const opts = (await optionTexts(status)).map(parseOption);
    expect(opts.map((o) => o.label)).toEqual([
      'All',
      'Pass',
      'Fail',
      'Security finding',
      'Blocked',
      'Skipped',
      'Not tested',
    ]);
    expect(opts.slice(1).reduce((n, o) => n + o.total, 0)).toBe(opts[0]!.total);
    await expect(page.locator('#summary')).not.toContainText('Not Applicable');

    await openReport(page, FIXTURES.statuses);
    const withNa = (await optionTexts(page.locator('#tests').getByRole('combobox', { name: 'Status' }))).map(
      parseOption,
    );
    expect(withNa.at(-1)).toEqual({ label: 'Not applicable', total: 1 });
  });

  test('RPT-UI-058 filter bar layout: one row at 1440 px, wraps without overflow or crops at 1024 / 768 / 390 px', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const row1 = () => page.locator('#tests .filter-bar > *');
    // Group by = Endpoint (Area + Endpoint pickers) and Group by = Type with every filter set.
    for (const hash of ['', '#by=type&show=Negative&status=FAIL&area=G3&q=like']) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await openReport(page, FIXTURES.m2, hash);
      const ys = await Promise.all((await row1().all()).map(centreY));
      expect(ys.length).toBeGreaterThanOrEqual(6);
      expect(
        Math.max(...ys) - Math.min(...ys),
        `row 1 on one line (${hash || 'default'})`,
      ).toBeLessThanOrEqual(2);
      if (hash) {
        await expect(chips(page).locator('.filter-chip')).toHaveCount(4);
        const chipTop = await chips(page).evaluate((e) => e.getBoundingClientRect().top);
        expect(chipTop).toBeGreaterThan(Math.max(...ys));
      }
    }
    for (const width of [1024, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await openReport(page, FIXTURES.m2, '#by=type&show=Negative&status=FAIL&area=G3&q=like');
      await expectNoHorizontalOverflow(page);
      const card = await page.locator('#tests .filters').evaluate((e) => e.getBoundingClientRect().right);
      for (const el of await page.locator('#tests .filter-bar > *, #tests .filter-chips > *').all()) {
        const box = (await el.boundingBox())!;
        expect(box.x + box.width, `control inside the card at ${width}px`).toBeLessThanOrEqual(card + 1);
      }
      // Long values end in "…" with the full text as a tooltip instead of pushing the layout.
      await expect(page.locator('#tests .fsel').filter({ hasText: 'Area' })).toHaveAttribute(
        'title',
        /^G3 .+ \(\d+\)$/,
      );
    }
  });

  test('RPT-UI-059 side panel: area → endpoint → test with breadcrumb and back; restores from the URL; Escape closes', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openReport(page, FIXTURES.m2);
    const fx = data(FIXTURES.m2);
    const g3 = fx.apiAreas!.find((a) => a.key === 'G3')!;
    const tile = page
      .locator('#endpoints')
      .getByRole('button', { name: new RegExp(`^G3 ${escapeRe(g3.name)}:`) });
    await tile.click();
    const panel = page.getByRole('dialog');
    await expect(panel).toHaveAttribute('data-level', '1');
    await expect(panel.getByRole('heading', { level: 3 })).toHaveText(`G3 ${g3.name}`);
    await expect(panel.locator('.xscore')).toContainText(/\d+ passed\s*\d+ failed\s*\d+ blocked/);

    // Level 1: filter the endpoints by path.
    const ep = g3.endpoints[0]!;
    const filter = panel.getByRole('searchbox', { name: 'Filter endpoints' });
    await filter.fill(ep.path);
    await expect(panel.locator('.xrow')).toHaveCount(1);
    await filter.fill('no-such-endpoint');
    await expect(panel.locator('.xrow')).toHaveCount(0);
    await filter.fill('');
    await expect(panel.locator('.xrow')).toHaveCount(g3.endpoints.length);
    // Full path, never cropped.
    const path0 = panel.locator('.xrow__path').first();
    expect(await path0.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);

    // Level 2: the endpoint's tests by type, each with a status dot.
    await panel.locator('.xrow').filter({ hasText: ep.path }).click();
    await expect(panel).toHaveAttribute('data-level', '2');
    const crumbs = panel.getByRole('navigation', { name: 'Breadcrumb' }).locator('.crumbs__item');
    await expect(crumbs).toHaveText([`G3 ${g3.name}`, `${ep.method} ${ep.path}`]);
    const epTests = fx.tests.filter((t) => t.api === ep.key);
    await expect(panel.locator('.xtest')).toHaveCount(epTests.length);
    await expect(panel.locator('.xtest .xdot')).toHaveCount(epTests.length);
    await expect(panel.locator('.drawer__body .subhead').first()).toHaveText(/^\w+ \(\d+\)$/);

    // Level 3: the usual test details with the full breadcrumb.
    const firstId = (await panel.locator('.xtest__id').first().textContent())!.trim();
    await panel.locator('.xtest').first().click();
    await expect(panel).toHaveAttribute('data-level', '3');
    await expect(crumbs).toHaveText([`G3 ${g3.name}`, `${ep.method} ${ep.path}`, firstId]);
    await expect(panel).toContainText('Result of this run');
    const hash = await page.evaluate(() => location.hash);
    expect(hash).toContain('panelArea=G3');
    expect(hash).toContain(`panelEndpoint=${ep.key}`);
    expect(hash).toContain('test=');

    // Reload restores the same level.
    await page.reload();
    await page.waitForFunction(() => (globalThis as { __PII_READY__?: boolean }).__PII_READY__ === true);
    await expect(page.getByRole('dialog')).toHaveAttribute('data-level', '3');

    // Focus stays inside the panel (focus trap).
    for (let i = 0; i < 25; i += 1) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.drawer')))).toBe(true);

    // Back goes up one level at a time.
    await page.getByRole('button', { name: `Back to ${ep.method} ${ep.path}` }).click();
    await expect(page.getByRole('dialog')).toHaveAttribute('data-level', '2');
    await page.getByRole('button', { name: `Back to G3 ${g3.name}` }).click();
    await expect(page.getByRole('dialog')).toHaveAttribute('data-level', '1');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => location.hash)).not.toContain('panelArea');

    // "Show in test list" at level 2 applies the endpoint (and its area) as chips.
    await openReport(page, FIXTURES.m2, `#panelArea=G3&panelEndpoint=${ep.key}`);
    await page.getByRole('dialog').getByRole('button', { name: 'Show in test list' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      chips(page).getByRole('button', { name: `Remove filter Endpoint: ${ep.method} ${ep.path}` }),
    ).toBeVisible();
    await expect(showing(page)).toHaveText(new RegExp(`^Showing ${epTests.length} of `));
  });

  test('RPT-UI-060 M1: an endpoint tile opens the side panel at the endpoint (no area level)', async ({
    page,
  }) => {
    await openReport(page, FIXTURES.demo);
    const tile = page.locator('#endpoints').getByRole('button', { name: /^Read PII:/ });
    await tile.click();
    const panel = page.getByRole('dialog', { name: 'Read PII' });
    await expect(panel).toHaveAttribute('data-level', '2');
    await expect(panel.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(0);
    await expect(panel).toContainText('/api/v1/pii-test/read');
    await panel.locator('.xtest').first().click();
    await expect(page.getByRole('dialog')).toHaveAttribute('data-level', '3');
    await expect(page.locator('.drawer .crumbs__item')).toHaveText(['POST /api/v1/pii-test/read', /^\S+$/]);
    await page.getByRole('button', { name: 'Back to POST /api/v1/pii-test/read' }).click();
    await expect(page.getByRole('dialog')).toHaveAttribute('data-level', '2');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(tile).toBeFocused(); // focus returns to the tile
  });
});
