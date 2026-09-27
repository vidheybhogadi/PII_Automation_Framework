/**
 * The full list of tests in the suite, read from the code (`playwright test --list`) — not from a run.
 *
 * Used by the report and by docs/test-cases.xlsx so that EVERY test appears, even ones that were not part of the
 * last run (they show as "Not Tested"). New tests appear automatically; nothing is hard-coded.
 */
import { execSync } from 'node:child_process';
import path from 'node:path';

export interface InventoryTest {
  /** Same key format as the collector: `<project>::<file>::<describe › … › title>`. */
  key: string;
  id: string;
  /** Full title including the ID, e.g. "PII-WR-001 Saving a new field …". */
  title: string;
  suite: string;
  file: string;
  line: number;
  project: string;
  tags: string[];
}

const ROOT = path.resolve(__dirname, '../..');

interface ListSpec {
  title: string;
  file: string;
  line: number;
  tags: string[];
  tests: { projectName: string }[];
}
interface ListSuite {
  title: string;
  specs?: ListSpec[];
  suites?: ListSuite[];
}

/** Every test in the given Playwright project(s) (default: the service tests, project "api"). */
export function listInventory(projects: readonly string[] = ['api']): InventoryTest[] {
  const args = projects.map((p) => `--project=${p}`).join(' ');
  const json = JSON.parse(
    execSync(`npx playwright test --list --reporter=json ${args}`, {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  ) as { suites?: ListSuite[] };

  const out: InventoryTest[] = [];
  const walk = (suite: ListSuite, describes: string[], file: string) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests) {
        const specFile = spec.file || file;
        out.push({
          key: `${t.projectName}::${specFile}::${[...describes, spec.title].join(' › ')}`,
          id: spec.title.split(' ')[0] ?? spec.title,
          title: spec.title,
          suite: describes.join(' › '),
          file: specFile,
          line: spec.line,
          project: t.projectName,
          tags: spec.tags.map((x) => (x.startsWith('@') ? x : `@${x}`)),
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, [...describes, child.title], file);
  };
  // Top-level suites are files; their children are describe() blocks.
  for (const fileSuite of json.suites ?? []) walk(fileSuite, [], fileSuite.title);
  return out;
}
