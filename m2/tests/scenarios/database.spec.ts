/**
 * Scenario cases — database (M2-DB-*), read-only PII DB. Snapshots compare counts, md5 hashes of the ciphertext and
 * updated times — never values. App users need the PII user_id mapping (M2Q-37); aisleweb (app DB) access is
 * M2Q-33 and is never queried without it.
 */
import { dbScenario, scenario } from '../../src/checks/define';
import { expectUnchanged, piiUserIdFor } from '../../src/checks/db';
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

  scenario('M2-DB-004', async () => appDb('local compatibility columns'));

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
    const body = devBody(fx, 'API-058', asUser(fx, p));
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
  scenario('M2-DB-011', async () => appDb('the migrated-cohort aggregate is a Dev-run query'));
  scenario('M2-DB-012', async () => blockPrereq(PREREQ.outage.id, PREREQ.outage.reason));
  scenario('M2-DB-013', async () =>
    blockPrereq('M2Q-12', 'Read access to the profile / FieldStore cache entries is needed'),
  );
  scenario('M2-DB-014', async () =>
    blockPrereq('M2Q-34', 'Read access to the Mongo audit trail is needed (deferred)'),
  );
  scenario('M2-DB-015', async () => appDb('chat message rows'));
  scenario('M2-DB-016', async () => appDb('bio columns'));
  scenario('M2-DB-017', async () => appDb('legacy free-text aggregate (Dev-run)'));
  scenario('M2-DB-018', async () => appDb('text rows after key revoke / delete'));
});
