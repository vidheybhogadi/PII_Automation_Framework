/**
 * Deletes the synthetic accounts the M2 suite created and has not deleted yet (git-ignored ledger
 * reports/m2/accounts/*.json): logs in again with the number (OTP 1234), onboards a bare account if needed, then
 * POST /V1/user/delete {id: ref, reason_id: 1}. Disabled profiles are marked unusable. Prints counts only:
 * deleted, left behind (real: the account exists, with reasons), never created (wrong-OTP checks / refused login
 * variants — never logged into), already deleted (also by the deleting route's own test), unusable.
 *
 *   npm run m2:accounts:cleanup
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { Logger } from '../../core/utils/logger';
import { cleanupLedgers } from '../src/accounts/accounts';
import { SessionHelper } from '../src/auth/session';
import { loadM2Config } from '../src/config/m2-config';

const ROOT = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(ROOT, process.env.ENV_FILE ?? '.env'), quiet: true });

async function main() {
  const config = loadM2Config();
  const r = await cleanupLedgers(config, new SessionHelper(config, new Logger({ level: 'warn' }), 998));
  console.log(
    `M2 account clean-up: ${r.deleted} deleted, ${r.leftBehind} left behind (real — the account exists), ${r.neverCreated} never created, ${r.alreadyDeleted} already deleted, ${r.unusable} unusable (disabled).`,
  );
  for (const [reason, n] of Object.entries(r.leftBehindReasons))
    console.log(`  left behind: ${n} × ${reason}`);
}

main().catch((e) => {
  console.error((e as Error).name);
  process.exit(1);
});
