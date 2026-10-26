/**
 * Declares one Playwright test per design case of a per-API check, titled with its workbook ID. Cases marked
 * Manual in the design (e.g. the ActiveAdmin HTML page) are not automated. Cases that need an approved suite account
 * (late.ts runsLate) are declared by m2/tests/zz-late/ ({ late: true }) so they run last; every other case by the
 * check's own spec in m2/tests/per-api/.
 */
import type { AnyCase } from '../../scripts/m2-all-cases';
import type { AppDb } from '../db/app-db';
import type { PiiDb } from '../db/pii-db';
import { caseById, casesFor, titleOf } from '../design';
import { blockIfOpen, test } from '../fixtures/m2-fixtures';
import type { CheckFixtures } from './context';
import { runsLate } from './late';

export const automatable = (c: AnyCase) => c.mode !== 'Manual';

export function defineChecks(
  check: string,
  title: string,
  run: (c: AnyCase, fx: CheckFixtures) => Promise<void>,
  filter: (c: AnyCase) => boolean = () => true,
  opts: { late?: boolean } = {},
): AnyCase[] {
  const cases = casesFor(check).filter(
    (c) => automatable(c) && filter(c) && runsLate(c) === Boolean(opts.late),
  );
  test.describe(title, () => {
    for (const c of cases) {
      test(titleOf(c), { tag: c.tags }, async ({ m2, m2Config, accounts, data, observe }) => {
        blockIfOpen(c);
        await run(c, { m2, m2Config, accounts, data, observe });
      });
    }
  });
  return cases;
}

/** Same, for checks that read the PII DB (the `piiDb` fixture blocks with M2Q-16 when it is not configured). */
export function defineDbChecks(
  check: string,
  title: string,
  run: (c: AnyCase, fx: CheckFixtures, db: PiiDb) => Promise<void>,
  filter: (c: AnyCase) => boolean = () => true,
  opts: { late?: boolean } = {},
): AnyCase[] {
  const cases = casesFor(check).filter(
    (c) => automatable(c) && filter(c) && runsLate(c) === Boolean(opts.late),
  );
  test.describe(title, () => {
    for (const c of cases) {
      test(titleOf(c), { tag: c.tags }, async ({ m2, m2Config, accounts, data, observe, piiDb }) => {
        blockIfOpen(c);
        await run(c, { m2, m2Config, accounts, data, observe }, piiDb);
      });
    }
  });
  return cases;
}

/** One hand-written scenario case, titled with its workbook ID (blocked per its design status first). */
export function scenario(id: string, run: (fx: CheckFixtures, c: AnyCase) => Promise<void>): void {
  const c = caseById(id);
  if (!automatable(c)) return;
  test(titleOf(c), { tag: c.tags }, async ({ m2, m2Config, accounts, data, observe }) => {
    blockIfOpen(c);
    await run({ m2, m2Config, accounts, data, observe }, c);
  });
}

/** A scenario case that also reads the PII DB (blocks with M2Q-16 when the DB is not configured). */
export function dbScenario(
  id: string,
  run: (fx: CheckFixtures, db: PiiDb, c: AnyCase) => Promise<void>,
): void {
  const c = caseById(id);
  if (!automatable(c)) return;
  test(titleOf(c), { tag: c.tags }, async ({ m2, m2Config, accounts, data, observe, piiDb }) => {
    blockIfOpen(c);
    await run({ m2, m2Config, accounts, data, observe }, piiDb, c);
  });
}

/**
 * A scenario case that reads the PII DB AND the app DB (aisleweb, suite accounts only — M2Q-33); blocks with M2Q-16
 * when either is not configured or reachable.
 */
export function appDbScenario(
  id: string,
  run: (fx: CheckFixtures, db: PiiDb, app: AppDb, c: AnyCase) => Promise<void>,
): void {
  const c = caseById(id);
  if (!automatable(c)) return;
  test(titleOf(c), { tag: c.tags }, async ({ m2, m2Config, accounts, data, observe, piiDb, appDb }) => {
    blockIfOpen(c);
    await run({ m2, m2Config, accounts, data, observe }, piiDb, appDb, c);
  });
}
