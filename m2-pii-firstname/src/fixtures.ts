/**
 * Playwright fixtures of the M2 PII First Name suite (project m2fn-api, live staging). It reuses the Milestone 2
 * building blocks by import — the business-API client with its exchange recorder, the synthetic account pool
 * (+91 10… numbers, never the 106 series; created only with M2_CREATE_ACCOUNTS=true and deleted at the end of the
 * run by the shared global teardown), the read-only DB adapters — and adds:
 *
 * - `m2fnConfig` CMS admin / associate logins and Redis settings (src/config.ts).
 * - `cms`        CMS admin sessions (login + TOTP OTP) for the Redis key APIs (src/cms-admin.ts).
 * - `scope`      what the Redis key guard allows: this run’s id and the suite accounts’ ids (src/redis-keys.ts).
 * - `appDb`      read-only aisleweb, suite accounts only, with this suite’s own SQL catalog
 *                (m2-pii-firstname/config/db-queries.json); Blocked when not configured or reachable.
 *
 * Nothing in m2/ imports from here.
 */
import { test as base, expect } from '@playwright/test';
import type { ApiResponse } from '../../core/http/api-response';
import { ExchangeRecorder } from '../../core/utils/exchange-recorder';
import { Logger } from '../../core/utils/logger';
import { Accounts } from '../../m2/src/accounts/accounts';
import { shapeOf } from '../../m2/src/assertions/pii.assertions';
import { M2Client } from '../../m2/src/clients/m2-client';
import { loadM2Config, type M2Config } from '../../m2/src/config/m2-config';
import { M2Data } from '../../m2/src/data';
import { AppDb } from '../../m2/src/db/app-db';
import { blockPrereq, PREREQ } from '../../m2/src/prereq';
import { CmsAdmins } from './cms-admin';
import { loadM2fnConfig, type M2fnConfig } from './config';
import type { KeyScope } from './redis-keys';

export const M2FN_DB_QUERIES = 'm2-pii-firstname/config/db-queries.json';

export interface M2fnTestFixtures {
  log: Logger;
  m2: M2Client;
  observe: (label: string, res: ApiResponse) => void;
  data: M2Data;
  /** The Redis key guard’s scope, read fresh for each call (suite accounts are made during the test). */
  scope: () => KeyScope;
  appDb: AppDb;
}
export interface M2fnWorkerFixtures {
  m2Config: M2Config;
  m2fnConfig: M2fnConfig;
  accounts: Accounts;
  cms: CmsAdmins;
  appDbWorker: AppDb | undefined;
}

export const test = base.extend<M2fnTestFixtures, M2fnWorkerFixtures>({
  m2Config: [
    async ({}, use) => {
      await use(loadM2Config());
    },
    { scope: 'worker' },
  ],

  m2fnConfig: [
    async ({}, use) => {
      await use(loadM2fnConfig());
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

  cms: [
    async ({ m2Config, m2fnConfig }, use) => {
      const log = new Logger({ level: m2Config.logging.level, toConsole: m2Config.logging.toConsole });
      // No logout at the end: logging out resets the admin’s OTP flag for every session of that admin.
      await use(new CmsAdmins(m2fnConfig, m2Config, log));
    },
    { scope: 'worker' },
  ],

  appDbWorker: [
    async ({ m2Config }, use) => {
      const db = AppDb.open({ ...m2Config, db: { ...m2Config.db, queriesFile: M2FN_DB_QUERIES } });
      await use(db);
      await db?.close();
    },
    { scope: 'worker' },
  ],

  appDb: async ({ appDbWorker }, use) => {
    if (!appDbWorker) blockPrereq(PREREQ.db.id, PREREQ.db.reason);
    if (!(await appDbWorker.reachable()))
      blockPrereq(PREREQ.appDbUnreachable.id, PREREQ.appDbUnreachable.reason);
    await use(appDbWorker);
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
    if (exchanges.length > 0)
      await testInfo.attach('api-exchanges.json', {
        body: JSON.stringify(exchanges, null, 2),
        contentType: 'application/json',
      });
  },

  observe: async ({}, use, testInfo) => {
    await use((label, res) => {
      testInfo.annotations.push({ type: 'observed', description: `${label}: ${shapeOf(res)}` });
    });
  },

  data: async ({ m2Config }, use, testInfo) => {
    await use(new M2Data(m2Config.runId, testInfo.workerIndex));
  },

  scope: async ({ m2Config, m2fnConfig, accounts }, use) => {
    await use(() => ({
      runId: m2Config.runId,
      suiteIds: accounts.suiteIds(),
      nonStringKey: m2fnConfig.nonStringKey,
    }));
  },
});

export { expect };
