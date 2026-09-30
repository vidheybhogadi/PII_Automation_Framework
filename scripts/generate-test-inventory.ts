/**
 * Builds docs/test-case-inventory.md — every Aisle PII API test case, one table per endpoint section, with:
 *   Test ID | Test Name | Module | Endpoint | Method | Preconditions | Request | Expected Result | Validation |
 *   Status | Dependency/Blocker
 *
 *   npm run docs:inventory          (also run automatically at the end of npm run test:all)
 *
 * Same sources and rules as docs/test-cases.xlsx (scripts/generate-test-cases-xlsx.ts): the test list from the
 * code, descriptions from tests/catalog, status from the LAST run (reports/latest/run-data.json; missing → every
 * test is Not Tested), blockers from the run or the test source. Missing values show as "—".
 *
 * Preview options: --run <run-data.json> --out <file.md>
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { OUTCOMES } from '../reporting/core/analytics';
import { moduleOf, NONE, requestOf, validationOf } from '../reporting/core/test-case';
import { listInventory, type InventoryTest } from '../reporting/generator/inventory';
import { TEST_CASES } from '../tests/catalog';
import {
  endpointOf,
  groupByEndpoint,
  loadLastRun,
  outcomeFor,
  staticBlockers,
  tally,
} from './generate-test-cases-xlsx';

const ROOT = path.resolve(__dirname, '..');
export const TEST_INVENTORY_MD = path.join(ROOT, 'docs/test-case-inventory.md');

const argValue = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i > 0 ? process.argv[i + 1] : undefined;
};

/** A markdown table cell: pipes escaped, line breaks as <br>, empty → "—". */
export function mdCell(value: string | undefined): string {
  const s = (value ?? '').trim();
  if (!s) return NONE;
  return s.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

/** Inline code cell (for requests / paths); backticks inside are replaced so the span never breaks. */
function mdCode(value: string | undefined): string {
  const s = (value ?? '').trim();
  if (!s) return NONE;
  return `\`${s.replace(/`/g, "'").replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')}\``;
}

const HEADER = [
  'Test ID',
  'Test Name',
  'Module',
  'Endpoint',
  'Method',
  'Preconditions',
  'Request',
  'Expected Result',
  'Validation',
  'Status',
  'Dependency/Blocker',
];

export interface InventoryDocOptions {
  runData: string | null;
  inventory?: InventoryTest[];
}

export function buildTestInventoryDoc(opts: InventoryDocOptions): { markdown: string; summary: string } {
  const inventory = opts.inventory ?? listInventory(['api']);
  const last = loadLastRun(opts.runData);
  const blockers = staticBlockers();
  const groups = groupByEndpoint(inventory).map((g) => ({
    ...g,
    results: g.tests.map((t) => outcomeFor(t, last, blockers)),
  }));
  const all = tally(groups.flatMap((g) => g.results));
  const total = groups.reduce((n, g) => n + g.tests.length, 0);
  const byStatus = OUTCOMES.filter((o) => all[o] > 0)
    .map((o) => `${o} ${all[o]}`)
    .join(' · ');

  const out: string[] = [
    '<!-- GENERATED FILE — do not edit by hand. Source: tests/catalog + the last run · Regenerate: npm run docs:inventory -->',
    '',
    '# Test-case inventory',
    '',
    `**${total} test cases** — ${byStatus || 'none'}`,
    '',
    `${last.label ?? 'No run recorded yet — every test shows Not Tested until the tests are run.'}`,
    '',
    'Status is from the last run only (the same rule as the HTML report). **Not Applicable** = Dev confirmed the',
    'feature is intentionally unsupported; it is neither a pass nor a failure. Dependency/Blocker shows the BQ',
    'question behind a Blocked / Not Applicable / Security finding result, or — for tests not in the last run —',
    'the questions the test can block on. The same data, with steps and tester notes, is in `docs/test-cases.xlsx`.',
    '',
    '## Sections',
    '',
    ...groups.map(
      (g, i) =>
        `${i + 1}. [${g.name}](#${slug(`${i + 1}. ${g.name}`)}) — ${g.method ? `${g.method} ` : ''}\`${g.path}\` (${g.tests.length})`,
    ),
    '',
  ];

  groups.forEach((g, gi) => {
    const gt = tally(g.results);
    out.push(
      `## ${gi + 1}. ${g.name}`,
      '',
      `${g.method ? `${g.method} ` : ''}\`${g.path}\`${g.means ? ` — ${g.means}` : ''}  `,
      `${g.tests.length} test cases: ${OUTCOMES.filter((o) => gt[o] > 0)
        .map((o) => `${o} ${gt[o]}`)
        .join(' · ')}`,
      '',
      `| ${HEADER.join(' | ')} |`,
      `|${HEADER.map(() => '---').join('|')}|`,
    );
    g.tests.forEach((t, i) => {
      const info = TEST_CASES[t.id];
      const r = g.results[i]!;
      const ep = endpointOf(t);
      const validation = validationOf(info);
      out.push(
        `| ${[
          mdCell(t.id),
          mdCell(t.title.replace(/^\S+\s/, '')),
          mdCell(moduleOf(t.id)),
          mdCode(ep.path),
          mdCell(ep.method),
          mdCell(info?.preconditions),
          mdCode(requestOf(info)),
          mdCell(info?.expected),
          validation.length ? validation.map((v) => `• ${mdCell(v)}`).join('<br>') : NONE,
          mdCell(r.outcome),
          mdCell(r.dependency),
        ].join(' | ')} |`,
      );
    });
    out.push('');
  });

  const summary = `${total} test cases in ${groups.length} endpoint sections (${byStatus || 'none'}). ${last.label ?? 'No run recorded yet.'}`;
  return { markdown: out.join('\n'), summary };
}

/** GitHub-style heading anchor. */
function slug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

function main() {
  const out = path.resolve(ROOT, argValue('--out') ?? TEST_INVENTORY_MD);
  const runData = path.resolve(ROOT, argValue('--run') ?? 'reports/latest/run-data.json');
  const { markdown, summary } = buildTestInventoryDoc({ runData });
  writeFileSync(out, markdown);
  console.log(`Written ${path.relative(ROOT, out)} — ${summary}`);
}

if (require.main === module) {
  try {
    main();
  } catch (e: unknown) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
