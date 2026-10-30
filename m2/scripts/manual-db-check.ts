/**
 * Manual-testing helper: shows the DB rows behind ONE synthetic test account, read-only.
 *
 *   npx tsx m2/scripts/manual-db-check.ts <10-digit test number>      e.g. 1012345678
 *   npx tsx m2/scripts/manual-db-check.ts <number> story,chat         + extra sections (or "all"):
 *     story · icebreakers · comments · chat · cms (admin_logs) · selfie
 *
 * - Free-text sections show the plaintext column with chars / bytes / non-ASCII (emoji loss shows up), and for the
 *   encrypted copy only present / length / md5 / "plaintext visible inside it". Text that belongs to another account
 *   is shown only when that account is also a synthetic test number; otherwise it is hidden.
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

/** Extra sections (2nd argument): free-text and CMS tables for the same account. */
const SECTIONS = ['story', 'icebreakers', 'comments', 'chat', 'cms', 'selfie'] as const;
type Section = (typeof SECTIONS)[number];

/** Encrypted free-text copy: present / length / short md5 / "plaintext visible inside it" — never the value. */
const enc = (col: string, plain: string) => `
  (${col} IS NOT NULL AND ${col} <> '') AS encrypted_present,
  length(${col}) AS encrypted_len, left(md5(${col}), 10) AS encrypted_md5,
  (${plain} <> '' AND ${col} IS NOT NULL AND position(${plain} IN ${col}) > 0) AS plaintext_visible`;

/** Text stats that make emoji / Unicode loss visible (characters vs bytes, any non-ASCII). */
const stats = (col: string) => `
  char_length(${col}) AS chars, octet_length(${col}) AS bytes, (${col} ~ '[^\\x01-\\x7F]') AS has_non_ascii`;

/** user ids (as text) of the other accounts that are also synthetic test numbers — only their text is shown. */
async function testAccountIds(app: DbAdapter, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await app.query<{ id: string; number: string }>(
    `SELECT u.id::text AS id, n.number FROM users u JOIN sms_notification_phone_numbers n ON n.id = u.phone_number_id
      WHERE u.id = ANY($1::bigint[])`,
    [ids],
  );
  return new Set(rows.filter((r) => isAllowedTestNumber(r.number.replace(/^\+?91/, ''))).map((r) => r.id));
}

/** Blank out text that belongs to (or was sent by) an account that is not one of our test numbers. */
function maskOthers(
  rows: Row[],
  textCols: string[],
  ownerCol: string,
  allowed: Set<string>,
  self: string,
): Row[] {
  return rows.map((r) => {
    const owner = String(r[ownerCol]);
    if (owner === self || allowed.has(owner)) return r;
    const copy = { ...r };
    for (const c of textCols) copy[c] = '[not a test account — hidden]';
    return copy;
  });
}

async function extraSections(app: DbAdapter, userId: string, sections: Section[]): Promise<void> {
  if (sections.includes('story')) {
    show(
      'Aisle DB · account_stories (My Story)',
      await app.query<Row>(
        `SELECT id, about, ${stats('about')}, ${enc('encrypted_free_text_about', 'about')}, created_at, updated_at
           FROM account_stories WHERE user_id = $1::bigint`,
        [userId],
      ),
    );
  }
  if (sections.includes('icebreakers')) {
    show(
      'Aisle DB · intro_answers (icebreakers)',
      await app.query<Row>(
        `SELECT a.intro_question_id AS question_id, a.position, a.answer, ${stats('a.answer')},
                ${enc('a.encrypted_free_text_answer', 'a.answer')}, a.updated_at
           FROM intro_answers a WHERE a.user_id = $1::bigint ORDER BY a.position`,
        [userId],
      ),
    );
  }
  if (sections.includes('comments')) {
    const rows = await app.query<Row>(
      `SELECT id, CASE WHEN sender_id = $1::bigint THEN 'sent' ELSE 'received' END AS direction,
              sender_id::text AS sender_id, receiver_id::text AS receiver_id, status, reply_message,
              ${stats('reply_message')}, created_at, updated_at
         FROM chat_requests WHERE sender_id = $1::bigint OR receiver_id = $1::bigint
        ORDER BY updated_at DESC LIMIT 20`,
      [userId],
    );
    const others = rows
      .flatMap((r) => [String(r.sender_id), String(r.receiver_id)])
      .filter((id) => id !== userId);
    const allowed = await testAccountIds(app, [...new Set(others)]);
    show(
      'Aisle DB · chat_requests (comments / invites, last 20)',
      maskOthers(rows, ['reply_message'], 'sender_id', allowed, userId),
    );
  }
  if (sections.includes('chat')) {
    // Own messages first (indexed by user_id), then the other side of those conversations.
    const own = await app.query<Row>(
      `WITH m AS MATERIALIZED (SELECT * FROM chat_messages WHERE user_id = $1::bigint)
       SELECT id, conversation_id, user_id::text AS sender_id, content, ${stats('content')},
              ${enc('encrypted_free_text_content', 'content')}, previous_message,
              (encrypted_free_text_previous_message IS NOT NULL) AS encrypted_previous_present, created_at
         FROM m ORDER BY id DESC LIMIT 20`,
      [userId],
    );
    const convIds = [...new Set(own.map((r) => Number(r.conversation_id)))];
    const theirs = convIds.length
      ? await app.query<Row>(
          `WITH m AS MATERIALIZED (SELECT * FROM chat_messages WHERE conversation_id = ANY($1::int[]))
           SELECT id, conversation_id, user_id::text AS sender_id, content, ${stats('content')},
                  ${enc('encrypted_free_text_content', 'content')}, previous_message, created_at
             FROM m WHERE user_id <> $2::bigint ORDER BY id DESC LIMIT 20`,
          [convIds, userId],
        )
      : [];
    const allowed = await testAccountIds(app, [...new Set(theirs.map((r) => String(r.sender_id)))]);
    show('Aisle DB · chat_messages sent by this account (last 20)', own);
    show(
      'Aisle DB · chat_messages received in those chats (last 20)',
      maskOthers(theirs, ['content', 'previous_message'], 'sender_id', allowed, userId),
    );
    if (convIds.length) {
      show(
        'Aisle DB · chat_conversations (chat-list preview)',
        await app.query<Row>(
          `SELECT id, last_message, ${stats('last_message')}, ${enc('encrypted_free_text_last_message', 'last_message')},
                  updated_at
             FROM chat_conversations WHERE id = ANY($1::int[])`,
          [convIds],
        ),
      );
    }
  }
  if (sections.includes('cms')) {
    show(
      'Aisle DB · admin_logs (CMS actions on this account, last 20)',
      await app.query<Row>(
        `SELECT id, admin_id, activity_type, cms_tab, left(data::text, 120) AS data, created_at
           FROM admin_logs WHERE user_id = $1::bigint ORDER BY id DESC LIMIT 20`,
        [userId],
      ),
    );
  }
  if (sections.includes('selfie')) {
    show(
      'Aisle DB · selfie_verifications',
      await app.query<Row>(
        `SELECT s.id, s.status, (s.encrypted_free_text_selfie_url IS NOT NULL) AS encrypted_selfie_url_present,
                (s.encrypted_free_text_modified_selfie_url IS NOT NULL) AS encrypted_modified_url_present,
                s.created_at, s.updated_at
           FROM selfie_verifications s JOIN profiles p ON p.id = s.profile_id WHERE p.user_id = $1::bigint`,
        [userId],
      ),
    );
  }
}

async function main(): Promise<void> {
  const arg = (process.argv[3] ?? '').toLowerCase();
  const sections: Section[] =
    arg === 'all'
      ? [...SECTIONS]
      : (arg.split(',').filter((s) => (SECTIONS as readonly string[]).includes(s)) as Section[]);
  if (arg && arg !== 'all' && !sections.length) {
    console.error(
      `Unknown section "${arg}". Use one of: ${SECTIONS.join(', ')}, all (comma-separated is fine).`,
    );
    process.exit(2);
  }
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
      if (sections.length) await extraSections(app, userId, sections);
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
