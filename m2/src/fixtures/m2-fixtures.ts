/**
 * Playwright fixtures for the Milestone 2 business-API tests (project m2-api, live staging).
 *
 *   test('M2-API-013-AUTH …', async ({ m2, observe }) => { … });
 *
 * - `m2`       inventory-driven client (m2/src/clients/m2-client.ts); its exact requests/responses are attached as
 *              api-exchanges.json (credentials only as placeholders) and its redacted log as api-calls.log.
 * - `observe`  records what a reply looked like (status + value-free body shape) as an "observed" annotation; the
 *              workbook (npm run m2:docs) copies it into "Last Run (observed)".
 * - `accounts` (worker) synthetic accounts: new accounts only with M2_CREATE_ACCOUNTS=true, Dev-provided onboarded
 *              / connected accounts, ledger + clean-up (m2/src/accounts/accounts.ts).
 * - `accountWarmUp` (worker, auto) onboards the accounts that need staging's approval at worker start (once per
 *              slot and run), so approval runs while other tests execute.
 * - `piiDb`    (worker) read-only PII DB, or a Blocked test when it is not configured here (M2Q-16).
 */
import { test as base, expect } from '@playwright/test';
import type { ApiResponse } from '../../../core/http/api-response';
import { ExchangeRecorder } from '../../../core/utils/exchange-recorder';
import { Logger } from '../../../core/utils/logger';
import type { AnyCase } from '../../scripts/m2-all-cases';
import { KNOWN_FINDINGS, READ_GATES_ON } from '../../scripts/m2-questions';
import { Accounts } from '../accounts/accounts';
import { shapeOf } from '../assertions/pii.assertions';
import type { SessionHelper } from '../auth/session';
import { M2Client } from '../clients/m2-client';
import { loadM2Config, type M2Config } from '../config/m2-config';
import { M2Data } from '../data';
import { PiiDb } from '../db/pii-db';
import { openDeps } from '../design';
import { blockPrereq, PREREQ } from '../prereq';

export interface M2TestFixtures {
  log: Logger;
  m2: M2Client;
  observe: (label: string, res: ApiResponse) => void;
  /** Phone-login helper of this worker's account pool. */
  sessions: SessionHelper;
  /** Synthetic run-prefixed ids and names. */
  data: M2Data;
  /** Read-only PII DB; blocks the test (M2Q-16) when it is not configured. */
  piiDb: PiiDb;
}
export interface M2WorkerFixtures {
  m2Config: M2Config;
  accounts: Accounts;
  piiDbWorker: PiiDb | undefined;
  /** Auto: onboards the accounts that need approval when a worker starts (Accounts.warmUp). */
  accountWarmUp: void;
}

/** Time for the worker-start onboarding of up to six synthetic accounts (Accounts.warmUp). */
const WARM_UP_TIMEOUT_MS = 300_000;

export const test = base.extend<M2TestFixtures, M2WorkerFixtures>({
  m2Config: [
    async ({}, use) => {
      await use(loadM2Config());
    },
    { scope: 'worker' },
  ],

  accounts: [
    async ({ m2Config }, use, workerInfo) => {
      const log = new Logger({ level: m2Config.logging.level, toConsole: m2Config.logging.toConsole });
      const accounts = new Accounts(m2Config, log, workerInfo.workerIndex, workerInfo.parallelIndex);
      await use(accounts);
      await accounts.cleanup();
    },
    { scope: 'worker' },
  ],

  accountWarmUp: [
    async ({ accounts }, use) => {
      // Once per slot and run (accounts already in the run pool are not touched), so approval starts early.
      await accounts.warmUp();
      await use();
    },
    { scope: 'worker', auto: true, timeout: WARM_UP_TIMEOUT_MS },
  ],

  piiDbWorker: [
    async ({ m2Config }, use) => {
      const db = PiiDb.open(m2Config);
      await use(db);
      await db?.close();
    },
    { scope: 'worker' },
  ],

  piiDb: async ({ piiDbWorker }, use) => {
    if (!piiDbWorker) blockPrereq(PREREQ.db.id, PREREQ.db.reason);
    // Infrastructure, not product: an unreachable DB blocks (with the reason) instead of failing every DB check.
    if (!(await piiDbWorker.reachable())) blockPrereq(PREREQ.dbUnreachable.id, PREREQ.dbUnreachable.reason);
    await use(piiDbWorker);
  },

  log: async ({ m2Config }, use, testInfo) => {
    const logger = new Logger({
      level: m2Config.logging.level,
      toConsole: m2Config.logging.toConsole,
      context: { test: testInfo.title.split(' ')[0] },
    });
    await use(logger);
    await testInfo.attach('api-calls.log', { body: logger.lines().join('\n'), contentType: 'text/plain' });
  },

  m2: async ({ m2Config, log }, use, testInfo) => {
    const recorder = new ExchangeRecorder();
    await use(new M2Client(m2Config, log, recorder));
    const exchanges = recorder.exchanges();
    if (exchanges.length > 0) {
      await testInfo.attach('api-exchanges.json', {
        body: JSON.stringify(exchanges, null, 2),
        contentType: 'application/json',
      });
    }
  },

  observe: async ({}, use, testInfo) => {
    await use((label, res) => {
      // Only what was seen. A server error on a bad credential is NOT annotated as a "known defect" any more (audit
      // fix 2026-10-25): the refusal assertion itself fails on any 5xx and cites M2Q-39 (expectRefusedWithoutPii).
      testInfo.annotations.push({ type: 'observed', description: `${label}: ${shapeOf(res)}` });
    });
  },

  sessions: async ({ accounts }, use) => {
    await use(accounts.sessions);
  },

  data: async ({ m2Config }, use, testInfo) => {
    await use(new M2Data(m2Config.runId, testInfo.workerIndex));
  },
});

export { expect };

/**
 * Mark a case BLOCKED when its design status says it cannot run yet (BLOCKED / NEED DEV CLARIFICATION because of an
 * open question in m2/scripts/m2-questions.ts); WAITING cases are skipped with a "WAITING" reason and NOT APPLICABLE
 * cases with a `not-applicable` annotation. Runnable cases with a waiting part record it and run. The reason (question IDs + topics) is shown in the report and the
 * test body does not run — never a pass, never a failure. A case the design marks NOT RUN always runs; any open
 * question it cites covers only details the test records instead of asserting.
 * Known findings (KNOWN_FINDINGS) are attached as markers: the strict assertion stays and still fails.
 */
export function blockIfOpen(c: AnyCase): void {
  markFinding(c.id);
  if (c.na) notApplicable(c.na.question, c.na.reason);
  if (c.status === 'NOT RUN') {
    for (const q of c.waiting ?? []) waitingPart(q);
    return;
  }
  const open = openDeps(c);
  if (c.status === 'WAITING') {
    // Only an environment change Dev controls is missing (e.g. read gates ON): skipped, shown with the reason.
    const why = open.map((q) => `${q.id} (${q.topic})`).join(', ');
    test.info().annotations.push({
      type: 'blocked',
      description: `${open[0]?.id ?? 'M2'}: WAITING — ${WAITING_TEXT[open[0]?.id ?? ''] ?? why}`,
    });
    test.skip(true, `WAITING (${open.map((q) => q.id).join(', ')}): ${why}`);
  }
  const reason = open.length ? open.map((q) => `${q.id} (${q.topic})`).join(', ') : c.status;
  const first = open[0]?.id ?? 'M2';
  test.info().annotations.push({ type: 'blocked', description: `${first}: waiting for ${reason}` });
  test.fixme(true, `BLOCKED (${open.map((q) => q.id).join(', ') || c.status}): waiting for ${reason}`);
}

/** Plain reasons for "waiting" questions, so reports read the same everywhere. */
const WAITING_TEXT: Record<string, string> = {
  [READ_GATES_ON]: 'read gates are OFF on testa2 (M2Q-02); this runs when Dev enables reads',
};

/**
 * The case cannot occur on this environment (confirmed by the cited answer).
 * Annotation `not-applicable` → report status "Not Applicable" (left out of the pass rate); never a pass, failure or
 * blocked.
 */
export function notApplicable(questionId: string, reason: string): never {
  test.info().annotations.push({ type: 'not-applicable', description: `${questionId}: ${reason}` });
  test.skip(true, `NOT APPLICABLE (${questionId}): ${reason}`);
  throw new Error('unreachable'); // test.skip throws; keeps the type `never`
}

/** Record that part of a runnable case waits for Dev (informational; the rest of the case runs and decides). */
export function waitingPart(questionId: string): void {
  test.info().annotations.push({
    type: 'waiting',
    description: `${questionId}: gate-ON part not run — ${WAITING_TEXT[questionId] ?? 'waiting for Dev'}`,
  });
}

/** Attach the known-finding marker of a case (security finding or known defect), if it has one. */
export function markFinding(caseId: string): void {
  const f = KNOWN_FINDINGS[caseId];
  if (!f) return;
  test.info().annotations.push({
    type: f.security ? 'security-finding' : 'known-defect',
    description: `${f.question}: ${f.text}`,
  });
}

/** Record where an expectation comes from (staging observation / Dev answer) without asserting more than it. */
export function noteEvidence(text: string): void {
  test.info().annotations.push({ type: 'assumption', description: text });
}
