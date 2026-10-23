/**
 * Deletes the synthetic accounts the M2 suite created and has not deleted yet (git-ignored ledger
 * reports/m2/accounts/*.json): logs in again with the number (OTP 1234), onboards a bare account if needed, then
 * POST /V1/user/delete {id: ref, reason_id: 1}. Disabled profiles are marked unusable. Prints counts only.
 *
 *   npm run m2:accounts:cleanup
 */
import dotenv from 'dotenv';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Logger } from '../../core/utils/logger';
import { ACCOUNTS_DIR, deleteOwnAccount, type LedgerEntry } from '../src/accounts/accounts';
import { isAllowedTestNumber } from '../src/auth/test-phone';
import { SessionHelper } from '../src/auth/session';
import { loadM2Config } from '../src/config/m2-config';

const ROOT = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(ROOT, process.env.ENV_FILE ?? '.env'), quiet: true });

async function main() {
  const config = loadM2Config();
  const sessions = new SessionHelper(config, new Logger({ level: 'warn' }));
  const dir = path.join(ROOT, ACCOUNTS_DIR);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  let deleted = 0;
  let left = 0;
  let skipped = 0;
  for (const f of files) {
    const file = path.join(dir, f);
    const ledger = JSON.parse(readFileSync(file, 'utf8')) as { runId: string; accounts: LedgerEntry[] };
    for (const e of ledger.accounts) {
      if (e.deleted === true || e.unusable || !isAllowedTestNumber(e.mobileNumber)) {
        skipped++;
        continue;
      }
      try {
        const s = await sessions.loginWithNumber(e.mobileNumber, e.deviceId);
        e.ref = e.ref ?? s.ref;
        if (s.applicationStage === 'completed') e.onboarded = true;
        if ((await deleteOwnAccount(sessions, config, s, e)) === true) deleted++;
        else left++;
      } catch (err) {
        e.note = `clean-up failed: ${(err as Error).name}`;
        left++;
      }
      writeFileSync(file, JSON.stringify(ledger, null, 2));
    }
  }
  console.log(
    `M2 account clean-up: ${deleted} deleted, ${left} left behind, ${skipped} already deleted / unusable / not created.`,
  );
}

main().catch((e) => {
  console.error((e as Error).name);
  process.exit(1);
});
