/**
 * One Playwright test per design case, titled with its workbook ID and name (m2fn-design.ts), blocked exactly when
 * the design says so — same rules as Milestone 2’s blockIfOpen:
 *  - NOT RUN (runnable): runs; open non-access questions it cites are recorded, not asserted.
 *  - WAITING: skipped with "WAITING" and the question.
 *  - BLOCKED / NEED DEV CLARIFICATION: skipped (fixme) with the open M2FNQ-xx IDs and topics — never a pass or failure.
 */
import { test as pwTest } from '@playwright/test';
import type { AppDb } from '../../m2/src/db/app-db';
import { automatable, caseById, openDeps, titleOf, type M2fnDesignCase } from '../scripts/m2fn-design';
import { KNOWN_FINDINGS } from '../scripts/m2fn-questions';
import { test, type M2fnTestFixtures, type M2fnWorkerFixtures } from './fixtures';

export type Fx = Omit<M2fnTestFixtures, 'appDb'> & M2fnWorkerFixtures;

export function blockIfOpen(c: M2fnDesignCase): void {
  const f = KNOWN_FINDINGS[c.id];
  if (f)
    pwTest.info().annotations.push({ type: 'possible-finding', description: `${f.question}: ${f.text}` });
  const open = openDeps(c);
  if (c.status === 'NOT RUN') {
    for (const q of open)
      pwTest.info().annotations.push({
        type: 'assumption',
        description: `${q.id} (${q.topic}) is open: recorded, not asserted`,
      });
    return;
  }
  if (c.blockedReason) {
    pwTest.info().annotations.push({ type: 'blocked', description: `M2FN: ${c.blockedReason}` });
    pwTest.fixme(true, `BLOCKED (decision): ${c.blockedReason}`);
  }
  const why = open.map((q) => `${q.id} (${q.topic})`).join(', ') || c.status;
  const ids = open.map((q) => q.id).join(', ') || c.status;
  pwTest
    .info()
    .annotations.push({ type: 'blocked', description: `${open[0]?.id ?? 'M2FN'}: waiting for ${why}` });
  if (c.status === 'WAITING') pwTest.skip(true, `WAITING (${ids}): ${why}`);
  pwTest.fixme(true, `BLOCKED (${ids}): waiting for ${why}`);
}

/** A hand-written case (no DB). */
export function scenario(id: string, run: (fx: Fx, c: M2fnDesignCase) => Promise<void>): void {
  const c = caseById(id);
  if (!automatable(c)) return;
  test(
    titleOf(c),
    { tag: c.tags },
    async ({ m2, m2Config, m2fnConfig, accounts, cms, appDbWorker, data, observe, log, scope }) => {
      blockIfOpen(c);
      await run({ m2, m2Config, m2fnConfig, accounts, cms, appDbWorker, data, observe, log, scope }, c);
    },
  );
}

/** A case that also reads the Aisle DB (aisleweb, read-only, suite accounts only); Blocked when not reachable. */
export function appDbScenario(
  id: string,
  run: (fx: Fx, app: AppDb, c: M2fnDesignCase) => Promise<void>,
): void {
  const c = caseById(id);
  if (!automatable(c)) return;
  test(
    titleOf(c),
    { tag: c.tags },
    async ({ m2, m2Config, m2fnConfig, accounts, cms, appDbWorker, data, observe, log, scope, appDb }) => {
      blockIfOpen(c);
      await run(
        { m2, m2Config, m2fnConfig, accounts, cms, appDbWorker, data, observe, log, scope },
        appDb,
        c,
      );
    },
  );
}

/** Title of one sweep test: the case title + the inventory row it calls. */
export const sweepTitle = (c: M2fnDesignCase, row: string, method: string, route: string) =>
  `${titleOf(c)} — ${row} ${method} ${route}`;

/**
 * One test per row of a parametrised case (M2FN-SWP-001): each titled with the case ID + name + the row, blocked the
 * same way as the case, then by the row itself (run).
 */
export function rowScenario(
  id: string,
  row: { row: string; method: string; route: string },
  run: (fx: Fx, c: M2fnDesignCase) => Promise<void>,
): void {
  const c = caseById(id);
  if (!automatable(c)) return;
  test(
    sweepTitle(c, row.row, row.method, row.route),
    { tag: c.tags },
    async ({ m2, m2Config, m2fnConfig, accounts, cms, appDbWorker, data, observe, log, scope }) => {
      blockIfOpen(c);
      await run({ m2, m2Config, m2fnConfig, accounts, cms, appDbWorker, data, observe, log, scope }, c);
    },
  );
}
