/**
 * Scenario cases — database (M2-DB-*), read-only PII DB. Snapshots compare counts, md5 hashes of the ciphertext and
 * updated times — never values. App users need the PII user_id mapping (M2Q-37).
 *
 * aisleweb (app DB, M2Q-33 answer: same server and read-only credentials, database aisleweb, the suite's own synthetic
 * accounts only): queried through m2/src/db/app-db.ts, which refuses any query without the suite-id filter and any id
 * that is not a suite-created account's. Tables / columns from the Aisle code (db/schema.rb, develop_new 944f76a) —
 * from code, confirm with Dev. Queries return booleans and counts only; the fake values are bound for comparison.
 * A local column that still holds the fake value in plaintext is a FINDING: the test fails (expect.soft, so every
 * column is reported), it is never relaxed.
 */
import { appDbScenario, dbScenario, scenario } from '../../src/checks/define';
import { expectUnchanged, piiUserIdFor } from '../../src/checks/db';
import { timeToken } from '../../src/checks/context';
import { extendTestTimeout, type Profile } from '../../src/accounts/accounts';
import { isTrue } from '../../src/db/app-db';
import { snapshotSummary, type PiiDb } from '../../src/db/pii-db';
import { blockPrereq, PREREQ } from '../../src/prereq';
import { expect, noteEvidence, test } from '../../src/fixtures/m2-fixtures';
import {
  asTestToken,
  asUser,
  call,
  devBody,
  editFirstName,
  expectOk,
  nameOf,
  ownProfile,
  requireOwnOnboardedAccount,
  setDeep,
  submitProfile,
  testEmail,
} from '../../src/scenarios/helpers';
import type { Fx } from '../../src/scenarios/helpers';
import type { UserSession } from '../../src/auth/session';

const appDb = (what: string) =>
  blockPrereq('M2Q-33', `Read access to the app DB (aisleweb) is needed — ${what}`);

async function snap(fx: Fx, db: PiiDb, s: UserSession) {
  return db.snapshot(piiUserIdFor(s, fx.m2Config));
}

/** Messages are saved asynchronously (ChatMessageWorker, Dev doc API-187): poll aisleweb up to 30 s. */
const CHAT_SAVE_WAIT_MS = 30_000;

/** A UTC time as "YYYY-MM-DD HH:MM:SS" — Rails stores chat_messages.created_at as UTC without a zone (from code). */
const sqlUtc = (ms: number) =>
  new Date(ms)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, '');

/** A sends one chat message to B (Dev cURL shape of API-187, unique chat time tokens). */
async function sendMessage(fx: Fx, a: Profile, b: Profile, text: string, n: number) {
  const token = timeToken(Date.now() + n);
  return call(fx, 'API-187', asUser(fx, a, b), {
    values: { REF: b.ref, MESSAGE_TIME_TOKEN: token, ACTION_TIME_TOKEN: token },
    synthetic: { freeText: text },
  });
}

const n = (v: unknown) => Number(v ?? 0);

test.describe('M2 scenarios — database', () => {
  dbScenario('M2-DB-001', async (fx, db) => {
    const s = await fx.accounts.freshUser();
    const id = piiUserIdFor(s, fx.m2Config);
    const first = await db.snapshot(id);
    noteEvidence(`After the new-user login: ${snapshotSummary(first)}.`);
    expect(first.PHONE?.count ?? 0, 'exactly one PHONE record for the new user').toBe(1);
    await fx.accounts.returningLogin(s);
    expectUnchanged(first, await db.snapshot(id), ['PHONE'], 'returning login');
  });

  dbScenario('M2-DB-002', async (fx, db) => {
    const s = await fx.accounts.freshUser();
    expectOk(
      await submitProfile(fx, s, { firstName: fx.data.firstName(), email: testEmail(fx, 'db002') }),
      'onboarding',
    );
    const after = await snap(fx, db, s);
    expect(after.NAME?.count ?? 0, 'one NAME record').toBe(1);
    expect(after.EMAIL?.count ?? 0, 'one EMAIL record').toBe(1);
  });

  dbScenario('M2-DB-003', async (fx, db) => {
    const p = await fx.accounts.onboarded(0);
    const before = await snap(fx, db, p);
    for (let i = 0; i < 2; i++) expectOk(await editFirstName(fx, p, fx.data.firstName()), 'edit');
    const after = await snap(fx, db, p);
    expect(after.NAME?.count ?? 0, 'still one NAME record').toBe(1);
    expect(after.NAME?.hashes[0] !== before.NAME?.hashes[0], 'NAME replaced with a new ciphertext').toBe(
      true,
    );
  });

  appDbScenario('M2-DB-004', async (fx, db, app) => {
    // A fresh suite account: onboarded with a fake name and email, then the name is edited once.
    const onboardedWith = { firstName: fx.data.firstName(), email: testEmail(fx, 'db004') };
    const p = await fx.accounts.onboardFresh(onboardedWith, 'Male');
    const name = fx.data.firstName();
    expectOk(await editFirstName(fx, p, name), 'name edit');

    // App view (read gates are OFF on testa2, M2Q-02) and PII DB: the edited name, one record per field.
    const view = nameOf(await ownProfile(fx, p));
    expect(
      String(view ?? '').toLowerCase() === name.toLowerCase(),
      'the app view shows the edited fake first name',
    ).toBe(true);
    const pii = await db.snapshot(piiUserIdFor(p, fx.m2Config));
    noteEvidence(`PII DB after onboarding + edit: ${snapshotSummary(pii)}.`);
    for (const f of ['NAME', 'EMAIL', 'PHONE'])
      expect(pii[f]?.count ?? 0, `one ${f} record (ciphertext) in the PII DB`).toBe(1);

    // aisleweb local compatibility columns of this account (booleans only).
    const rows = await app.query<Record<string, unknown>>(
      'localCompatibilityColumns',
      [[String(p.userId)], name, onboardedWith.firstName, onboardedWith.email, p.mobileNumber],
      fx.accounts.ownDbIds(),
    );
    expect(rows.length, 'one aisleweb profiles row for the suite account').toBe(1);
    const r = rows[0]!;
    const b = (k: string) => (isTrue(r[k]) ? 'yes' : 'no');
    noteEvidence(
      `aisleweb (tables from code — confirm with Dev): profiles.first_name filled ${b('first_name_filled')}, ` +
        `= the edited fake name ${b('first_name_is_current_value')}, = the onboarding name ${b('first_name_is_previous_value')}; ` +
        `account_emails.name linked ${b('email_linked')}, filled ${b('email_filled')}, = the fake email ${b('email_is_value')}, ` +
        `encrypted_name filled ${b('email_pgcrypto_filled')}; sms_notification_phone_numbers.number linked ${b('phone_linked')}, ` +
        `filled ${b('phone_filled')}, = the fake number ${b('phone_is_value')}.`,
    );
    // The local copy must at least agree with the app / PII write: never the stale onboarding name.
    expect(
      isTrue(r.first_name_is_previous_value),
      'profiles.first_name still holds the stale onboarding name (local copy out of step with the PII write)',
    ).toBe(false);
    // Plaintext copies next to the PII service are findings (DPDP: personal data outside the PII store).
    expect
      .soft(
        isTrue(r.first_name_is_current_value),
        'FINDING: profiles.first_name holds the fake first name in plaintext',
      )
      .toBe(false);
    expect
      .soft(isTrue(r.email_is_value), 'FINDING: account_emails.name holds the fake email in plaintext')
      .toBe(false);
    expect
      .soft(
        isTrue(r.phone_is_value),
        'FINDING: sms_notification_phone_numbers.number holds the fake phone number in plaintext',
      )
      .toBe(false);
  });

  dbScenario('M2-DB-005', async (fx, db) => {
    const p = await fx.accounts.onboarded(0);
    const before = await snap(fx, db, p);
    expectOk(await editFirstName(fx, p, fx.data.firstName()), 'name edit');
    expectUnchanged(before, await snap(fx, db, p), ['EMAIL', 'PHONE'], 'single-field update');
  });

  dbScenario('M2-DB-006', async (fx, db) => {
    const p = await fx.accounts.onboarded(0);
    const userIdG1 = fx.data.userId('db006');
    const [beforeApp, beforeG1] = [await snap(fx, db, p), await db.snapshot(userIdG1)];
    const body = await devBody(fx, 'API-058', asUser(fx, p));
    setDeep(body, 'first_name', { not: 'a string' });
    await call(fx, 'API-058', asUser(fx, p), { body, retry: false });
    await call(fx, 'API-057', { ...asUser(fx, p), auth: { kind: 'none' } }, { retry: false });
    await call(fx, 'API-002', asTestToken(fx), {
      body: { user_id: userIdG1, first_name: null },
      retry: false,
    });
    expectUnchanged(beforeApp, await snap(fx, db, p), 'all', 'refused app requests');
    expectUnchanged(beforeG1, await db.snapshot(userIdG1), 'all', 'refused test-route request');
    noteEvidence('Admin refusals (API-139 / API-149) need a CMS admin (M2Q-04).');
  });

  dbScenario('M2-DB-007', async (fx, db) => {
    const [a, b] = await fx.accounts.connectedPair();
    const before = await snap(fx, db, b);
    expectOk(await editFirstName(fx, a, fx.data.firstName()), 'A edits');
    expectUnchanged(before, await snap(fx, db, b), 'all', 'user B');
  });

  scenario('M2-DB-008', async (fx) => fx.accounts.admin());
  scenario('M2-DB-009', async () => requireOwnOnboardedAccount());
  scenario('M2-DB-010', async () => requireOwnOnboardedAccount());
  // Kept Blocked (2026-10-26): an aggregate over the migrated cohort reads real users' data, and the suite's own
  // accounts are all created after the integration, so re-scoping it to them would not test migration at all.
  scenario('M2-DB-011', async () => blockPrereq(PREREQ.cohortAggregate.id, PREREQ.cohortAggregate.reason));
  scenario('M2-DB-012', async () => blockPrereq(PREREQ.outage.id, PREREQ.outage.reason));
  scenario('M2-DB-013', async () =>
    blockPrereq('M2Q-12', 'Read access to the profile / FieldStore cache entries is needed'),
  );
  scenario('M2-DB-014', async () =>
    blockPrereq('M2Q-34', 'Read access to the Mongo audit trail is needed (deferred)'),
  );
  appDbScenario('M2-DB-015', async (fx, _db, app) => {
    // Only the suite's OWN pair: aisleweb is read for accounts the suite created.
    const conversationId = await fx.accounts.pairConversationId();
    if (!conversationId) blockPrereq(PREREQ.ownPair.id, PREREQ.ownPair.reason);
    const { a, b } = await fx.accounts.suitePair();
    const since = sqlUtc(Date.now() - 30_000); // margin for clock skew between this machine and the DB
    const marker = `FT_${fx.data.userId('db015')}`;
    const text = `${marker} identical synthetic text`;
    for (let i = 0; i < 2; i++) expectOk(await sendMessage(fx, a, b, text, i), `A sends message ${i + 1}`);

    const args = [[String(a.userId), String(b.userId)], conversationId, since, marker];
    extendTestTimeout(CHAT_SAVE_WAIT_MS + 15_000);
    const start = Date.now();
    let r: Record<string, unknown> = {};
    for (;;) {
      r = (await app.query('chatMessageStorage', args, fx.accounts.ownDbIds()))[0] ?? {};
      if (n(r.messages) >= 2 || Date.now() - start >= CHAT_SAVE_WAIT_MS) break;
      await new Promise((res) => setTimeout(res, 3_000));
    }
    noteEvidence(
      `aisleweb chat_messages of the suite pair since the test started (columns from code — confirm with Dev): ` +
        `${n(r.messages)} rows, ${n(r.with_ciphertext)} with encrypted_free_text_content, ${n(r.with_key_id)} naming a ` +
        `free_text_key_id, ${n(r.distinct_ciphertexts)} distinct ciphertexts; plaintext content filled ${n(r.content_filled)}, ` +
        `marker in content ${n(r.marker_in_content)}, previous_message filled ${n(r.previous_message_filled)} ` +
        `(encrypted ${n(r.previous_with_ciphertext)}), marker in previous_message ${n(r.marker_in_previous_message)}.`,
    );
    expect(n(r.messages), 'the two messages are saved in chat_messages within 30 s').toBeGreaterThanOrEqual(
      2,
    );
    expect(n(r.with_ciphertext), 'every message row has encrypted_free_text_content').toBe(n(r.messages));
    expect(n(r.with_key_id), 'every ciphertext names its free_text_key_id').toBe(n(r.messages));
    expect(n(r.distinct_ciphertexts), 'identical texts are stored as different ciphertexts').toBe(
      n(r.with_ciphertext),
    );
    expect(n(r.marker_in_ciphertext), 'the run marker is not readable inside the ciphertext').toBe(0);
    // Plaintext left in the legacy columns is a finding (from code, M2Q-27: the legacy column is not cleared).
    expect.soft(n(r.marker_in_content), 'FINDING: the message text is stored in plaintext (content)').toBe(0);
    expect
      .soft(
        n(r.content_filled),
        'FINDING: the plaintext content column is still filled for the pair’s messages',
      )
      .toBe(0);
    expect
      .soft(n(r.marker_in_previous_message), 'FINDING: the message text is in plaintext previous_message')
      .toBe(0);
    expect
      .soft(n(r.previous_message_filled), 'FINDING: the plaintext previous_message column is still filled')
      .toBe(0);
  });
  scenario('M2-DB-016', async () => appDb('bio columns'));
  scenario('M2-DB-017', async () => appDb('legacy free-text aggregate (Dev-run)'));
  scenario('M2-DB-018', async () => appDb('text rows after key revoke / delete'));
});
