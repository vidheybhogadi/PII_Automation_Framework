/**
 * Scenario cases — end-to-end and integration (M2-INT-*).
 */
import { scenario } from '../../src/checks/define';
import { blockPrereq, PREREQ } from '../../src/prereq';
import { expect, noteEvidence, test } from '../../src/fixtures/m2-fixtures';
import {
  asTestToken,
  asUser,
  call,
  expectOk,
  nameOf,
  ownProfile,
  piiFirstName,
  submitProfile,
  testEmail,
} from '../../src/scenarios/helpers';

const TWINS: [string, string][] = [
  ['API-116', 'API-005'],
  ['API-120', 'API-021'],
  ['API-125', 'API-046'],
  ['API-126', 'API-048'],
];

test.describe('M2 scenarios — integration', () => {
  scenario('M2-INT-001', async (fx) => {
    const a = await fx.accounts.freshUser();
    const b = await fx.accounts.freshUser();
    for (const p of [a, b])
      expectOk(
        await submitProfile(fx, p, { firstName: fx.data.firstName(), email: testEmail(fx, 'int001') }),
        'onboarding',
      );
    noteEvidence(
      'The remaining lifecycle steps (edit, hide, like / accept, chat, delete) follow once onboarding works (M2Q-36).',
    );
  });

  scenario('M2-INT-002', async (fx) => fx.accounts.admin());

  scenario('M2-INT-003', async (fx) => {
    const p = await fx.accounts.onboarded(0);
    const n1 = nameOf(await ownProfile(fx, p));
    const n2 = fx.data.firstName();
    const w = await call(fx, 'API-199', asTestToken(fx), {
      body: { user_id: p.userId, field: 'NAME', value: n2 },
      retry: false,
    });
    expectOk(w, 'facade write');
    expect((await piiFirstName(fx, p.userId!)) === n2, 'PII route returns N2').toBe(true);
    noteEvidence(
      `App own profile ${nameOf(await ownProfile(fx, p)) === n1 ? 'still shows N1' : 'shows a new value'} after the facade write (expiry: M2Q-12).`,
    );
  });

  scenario('M2-INT-004', async () => blockPrereq(PREREQ.outage.id, PREREQ.outage.reason));

  scenario('M2-INT-005', async (fx) => {
    const [a, b] = await fx.accounts.connectedPair();
    for (const [web, app] of TWINS) {
      const w = await call(fx, web, asUser(fx, b, a), { values: { REF: a.ref } });
      const v = await call(fx, app, asUser(fx, b, a), { values: { REF: a.ref } });
      expect(nameOf(w) === nameOf(v), `${web} vs ${app}: same first name`).toBe(true);
    }
  });
});
