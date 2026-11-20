/**
 * Manual-testing helper: shows the Aisle Redis cache of ONE synthetic test account through the Redis key API, read-only.
 *
 *   npx tsx m2/scripts/manual-redis-check.ts <10-digit test number>      e.g. 1012345678
 *   npx tsx m2/scripts/manual-redis-check.ts <106xxxxxxx> --allow-106
 *
 * - Uses GET /admin/redis-keys?key=… (m2-pii-firstname/docs/redis-key-apis.md) as QA's CMS admin: login + OTP from
 *   M2FN_CMS_ADMIN_EMAIL / _PASSWORD / _TOTP_SECRET in .env. Never calls DELETE and never logs out (a logout resets
 *   the admin's OTP for every session).
 * - Only allowed test numbers (+91 10xxxxxxxx, never the 106 series) are accepted. The user id and ref are looked up
 *   in the Aisle DB (read-only); only that user's keys are read (the suite's key guard checks each one):
 *   pii:v1:user:<id>:first_name and AISLE_staging_profile_<ref> (name fields only are shown).
 * - The API returns no TTL. Values are synthetic test data, so they are shown; the token is never printed.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { createDbAdapter } from '../../core/db/db-client';
import { Logger } from '../../core/utils/logger';
import { CmsAdmins } from '../../m2-pii-firstname/src/cms-admin';
import { loadM2fnConfig } from '../../m2-pii-firstname/src/config';
import {
  assertSafeKey,
  piiFirstNameKey,
  profileKey,
  REDIS_ROUTES,
} from '../../m2-pii-firstname/src/redis-keys';
import { isAllowedTestNumber } from '../src/auth/test-phone';
import { M2Client } from '../src/clients/m2-client';
import { loadM2Config } from '../src/config/m2-config';

const ROOT = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(ROOT, process.env.ENV_FILE ?? '.env'), quiet: true });

const NAME_FIELDS = /first_name|hide/i;

/** Name-related fields of the cached profile JSON (nested objects searched one level down). */
function nameFields(raw: string): Record<string, unknown> | string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return `[not JSON, ${raw.length} chars]`;
  }
  const out: Record<string, unknown> = {};
  const visit = (obj: unknown, prefix: string, depth: number) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    for (const [k, v] of Object.entries(obj)) {
      if (NAME_FIELDS.test(k) && (v === null || typeof v !== 'object')) out[prefix + k] = v;
      else if (depth < 2) visit(v, `${prefix}${k}.`, depth + 1);
    }
  };
  visit(parsed, '', 0);
  return out;
}

async function main(): Promise<void> {
  // --allow-106: tester-approved manual check of a reserved 106-series team account (still read-only).
  const allow106 = process.argv.includes('--allow-106');
  const number = (process.argv.slice(2).find((a) => a !== '--allow-106') ?? '').replace(/^\+?91/, '').trim();
  if (!isAllowedTestNumber(number) && !(allow106 && /^106\d{7}$/.test(number))) {
    console.error('Refused: give a synthetic test number 10xxxxxxxx (never the 106 series).');
    process.exit(2);
  }
  const config = loadM2Config();
  if (config.db.engine === 'none' || !config.db.host) {
    console.error('DB is not configured in .env (DB_* settings) — needed to look up the user id.');
    process.exit(2);
  }
  const app = createDbAdapter({ db: { ...config.db, database: config.appDbName } });
  let users: { user_id: string; ref: string | null }[];
  try {
    users = await app.query<{ user_id: string; ref: string | null }>(
      `SELECT u.id::text AS user_id, p.ref
         FROM users u JOIN sms_notification_phone_numbers n ON n.id = u.phone_number_id
         LEFT JOIN profiles p ON p.user_id = u.id
        WHERE n.number = ANY($1::text[]) ORDER BY u.id`,
      [[number, `+91${number}`, `91${number}`]],
    );
  } finally {
    await app.close();
  }
  if (!users.length) {
    console.log('No account found for this number.');
    return;
  }

  const scope = {
    runId: 'qa-m2-manual',
    suiteIds: new Set(users.flatMap((u) => [String(u.user_id), ...(u.ref ? [u.ref] : [])])),
  };
  const log = new Logger();
  const auth = await new CmsAdmins(loadM2fnConfig(), config, log).admin();
  const client = new M2Client(config, log);

  console.log(`checked at ${new Date().toISOString()} · Redis key API (GET only) · ${config.baseUrl}`);
  for (const u of users) {
    const keys = [piiFirstNameKey(String(u.user_id)), ...(u.ref ? [profileKey(u.ref)] : [])];
    const rows = [];
    for (const key of keys) {
      assertSafeKey(key, 'get', scope);
      const res = await client.callRoute(REDIS_ROUTES.get, {
        auth,
        query: { key },
        retry: false,
        noBody: true,
      });
      const body = (res.json() ?? {}) as { value?: unknown; message?: unknown; error?: unknown };
      const value =
        res.status !== 200 || typeof body.value !== 'string'
          ? res.status === 404
            ? '— (key absent)'
            : `[${String(body.message ?? body.error ?? 'no value')}]`
          : key.startsWith('pii:')
            ? body.value
            : JSON.stringify(nameFields(body.value));
      rows.push({ key, http: res.status, value });
    }
    console.log(`\n=== Redis · user ${u.user_id} · ref ${u.ref ?? '—'}`);
    console.table(rows);
  }
}

main().catch((err: Error) => {
  console.error(`Redis check failed: ${err.message.replace(/postgres(ql)?:\/\/\S+/gi, '[connection]')}`);
  process.exit(1);
});
