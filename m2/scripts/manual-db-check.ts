/**
 * Manual-testing helper: shows the DB rows behind ONE synthetic test account, read-only.
 *
 *   npx tsx m2/scripts/manual-db-check.ts <10-digit test number>      e.g. 1012345678
 *
 * - Only allowed test numbers (+91 10xxxxxxxx, never the 106 series) are accepted — anything else is refused before
 *   any query, so the Aisle DB (which holds real users' data) is only ever read for the tester's own accounts.
 * - Aisle DB (aisleweb): users → phone row, profile (name / email / hide-name / state columns) and the account_emails
 *   row. Values are synthetic test data, so they are shown.
 * - PII DB: the user's user_pii_field_value rows — field, key version, timestamps, ciphertext LENGTH and a short md5
 *   (the ciphertext itself is never printed), plus a check that the plaintext value is NOT inside the ciphertext.
 * - Every query runs in its own BEGIN READ ONLY transaction (core/db). Credentials are never printed.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { createDbAdapter } from '../../core/db/db-client';
import type { DbAdapter } from '../../core/db/db-adapter';
import { isAllowedTestNumber } from '../src/auth/test-phone';
import { loadM2Config } from '../src/config/m2-config';

const ROOT = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(ROOT, process.env.ENV_FILE ?? '.env'), quiet: true });

/** Columns worth showing from `profiles` (only those that exist are printed). */
const PROFILE_COLS = [
  'id',
  'user_id',
  'ref',
  'first_name',
  'hide_first_name',
  'profile_state',
  'email_id',
  'gender',
  'is_selfie_verified',
  'created_at',
  'updated_at',
];
const PII_PATTERN = /(name|email|phone|mobile|number|story|about)/i;

type Row = Record<string, unknown>;

function show(title: string, rows: Row[]): void {
  console.log(`\n=== ${title} (${rows.length} row${rows.length === 1 ? '' : 's'})`);
  if (rows.length) console.table(rows);
}

async function columnsOf(db: DbAdapter, table: string): Promise<string[]> {
  const rows = await db.query<{ column_name: string }>(
    'SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position',
    [table],
  );
  return rows.map((r) => r.column_name);
}

async function main(): Promise<void> {
  const number = (process.argv[2] ?? '').replace(/^\+?91/, '').trim();
  if (!isAllowedTestNumber(number)) {
    console.error('Refused: give a synthetic test number 10xxxxxxxx (never the 106 series).');
    process.exit(2);
  }
  const config = loadM2Config();
  if (config.db.engine === 'none' || !config.db.host) {
    console.error('DB is not configured in .env (DB_* settings).');
    process.exit(2);
  }
  const app = createDbAdapter({ db: { ...config.db, database: config.appDbName } });
  const pii = createDbAdapter({ db: config.db });
  try {
    // 1. Aisle DB — the account(s) behind this number (a deleted account may leave an older row).
    const users = await app.query<Row>(
      `SELECT u.id::text AS user_id, n.id AS phone_row_id, n.number
         FROM users u JOIN sms_notification_phone_numbers n ON n.id = u.phone_number_id
        WHERE n.number = ANY($1::text[]) ORDER BY u.id`,
      [[number, `+91${number}`, `91${number}`]],
    );
    show(`Aisle DB · users for ${number.slice(0, 4)}xxxx${number.slice(-2)}`, users);
    if (!users.length) {
      console.log('No account found for this number (not created yet, or stored in another format).');
      return;
    }
    const profileCols = await columnsOf(app, 'profiles');
    const wanted = [...new Set([...PROFILE_COLS, ...profileCols.filter((c) => PII_PATTERN.test(c))])].filter(
      (c) => profileCols.includes(c) && !/^encrypted_/.test(c),
    );
    const encCols = profileCols.filter((c) => /^encrypted_/.test(c));

    for (const u of users) {
      const userId = String(u.user_id);
      // 2. Aisle DB — profile + email row (synthetic values).
      const select = [
        ...wanted.map((c) => `p.${c}`),
        ...encCols.map((c) => `(p.${c} IS NOT NULL AND p.${c}::text <> '') AS ${c}_present`),
      ].join(', ');
      const profiles = await app.query<Row>(`SELECT ${select} FROM profiles p WHERE p.user_id = $1::bigint`, [
        userId,
      ]);
      show(`Aisle DB · profiles (user ${userId})`, profiles);
      const emailId = profiles[0]?.email_id;
      if (emailId !== undefined && emailId !== null) {
        const emails = await app.query<Row>(
          `SELECT e.id, e.name AS email,
                  (e.encrypted_name IS NOT NULL AND e.encrypted_name::text <> '') AS encrypted_name_present
             FROM account_emails e WHERE e.id = $1`,
          [emailId],
        );
        show('Aisle DB · account_emails', emails);
      }

      // 3. PII DB — encrypted rows (never the ciphertext itself).
      const plain = {
        name: String(profiles[0]?.first_name ?? ''),
        email: String(
          (await app.query<Row>('SELECT name FROM account_emails WHERE id = $1', [emailId ?? -1]))[0]?.name ??
            '',
        ),
        phone: number,
      };
      const rows = await pii.query<Row>(
        `SELECT field_name, key_version,
                length(ciphertext::text) AS ciphertext_len,
                left(md5(ciphertext::text), 10) AS ciphertext_md5,
                (nonce IS NOT NULL) AS nonce_present, (auth_tag IS NOT NULL) AS auth_tag_present,
                (lookup_token IS NOT NULL) AS lookup_token_present,
                (($2 <> '' AND position(lower($2) IN lower(ciphertext::text)) > 0)
                  OR ($3 <> '' AND position(lower($3) IN lower(ciphertext::text)) > 0)
                  OR position($4 IN ciphertext::text) > 0) AS plaintext_visible,
                created_at, updated_at
           FROM user_pii_field_value
          WHERE tenant_id = 'aisle' AND user_id::text = $1
          ORDER BY field_name, updated_at`,
        [userId, plain.name, plain.email, plain.phone],
      );
      show(`PII DB · user_pii_field_value (tenant aisle, user ${userId})`, rows);
      const fields = rows.map((r) => String(r.field_name));
      const dupes = fields.filter((f, i) => fields.indexOf(f) !== i);
      console.log(
        `\nSummary user ${userId}: PII fields = [${[...new Set(fields)].join(', ') || 'none'}]` +
          `${dupes.length ? ` · DUPLICATE rows for ${[...new Set(dupes)].join(', ')}` : ' · no duplicates'}` +
          ` · plaintext inside ciphertext: ${rows.some((r) => r.plaintext_visible === true) ? 'YES (check!)' : 'no'}`,
      );
    }
  } finally {
    await app.close();
    await pii.close();
  }
}

main().catch((err: Error) => {
  console.error(`DB check failed: ${err.message.replace(/postgres(ql)?:\/\/\S+/gi, '[connection]')}`);
  console.error('Is the VPN on? (the DB is only reachable on the VPN)');
  process.exit(1);
});
