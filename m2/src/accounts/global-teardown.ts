/**
 * Playwright global teardown: at the END of a run that created M2 accounts (M2_CREATE_ACCOUNTS=true), delete every
 * account of this run's ledger (reports/m2/accounts/<run>-*.json). Doing it once at the end — not per worker — means a
 * worker restarted after a failure can re-use the run's accounts instead of creating new ones. Counts only are printed.
 */
import { Logger } from '../../../core/utils/logger';
import { SessionHelper } from '../auth/session';
import { loadM2Config } from '../config/m2-config';
import { cleanupLedgers } from './accounts';

export default async function globalTeardown(): Promise<void> {
  if (process.env.M2_CREATE_ACCOUNTS !== 'true' || !process.env.M2_TEST_RUN_ID) return;
  const config = loadM2Config();
  const sessions = new SessionHelper(config, new Logger({ level: 'warn' }), 999);
  const r = await cleanupLedgers(config, sessions, config.runId);
  if (r.deleted + r.leftBehind > 0)
    // eslint-disable-next-line no-console
    console.log(
      `M2 accounts of this run: ${r.deleted} deleted, ${r.leftBehind} left behind (see reports/m2/accounts/).`,
    );
}
