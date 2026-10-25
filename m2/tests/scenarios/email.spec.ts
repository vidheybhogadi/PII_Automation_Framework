/**
 * Scenario cases — email (M2-EMAIL-*). Synthetic emails use the approved non-deliverable test domain
 * (AISLE_TEST_EMAIL_DOMAIN, default example.test). Blocked first by design status, then by missing prerequisites.
 */
import { isSuccess, scanResponse } from '../../src/assertions/pii.assertions';
import { scenario } from '../../src/checks/define';
import { blockPrereq, PREREQ } from '../../src/prereq';
import { expect, noteEvidence, test } from '../../src/fixtures/m2-fixtures';
import {
  asUser,
  call,
  devBody,
  emailOf,
  expectOk,
  ownProfile,
  profileByRef,
  setDeep,
  submitProfile,
  testEmail,
} from '../../src/scenarios/helpers';

test.describe('M2 scenarios — email', () => {
  // Gate OFF (M2Q-02): the onboarding email is returned to the owner; the gate-ON half waits for Dev (M2Q-43).
  scenario('M2-EMAIL-001', async (fx) => {
    const email = testEmail(fx, 'email001');
    // A new account onboarded through the verified onboarding flow (submit_profile is the write under test).
    const p = await fx.accounts.onboardFresh({ firstName: fx.data.firstName(), email });
    const own = await profileByRef(fx, p, p);
    expect(emailOf(own) === email, 'the owner’s profile returns the onboarding email').toBe(true);
    noteEvidence(
      'EMAIL in the PII service is recorded only: there is no PII email read route for app users.',
    );
  });

  scenario('M2-EMAIL-002', async (fx) => {
    const p = await fx.accounts.onboarded(0);
    const e1 = emailOf(await profileByRef(fx, p, p));
    await submitProfile(fx, p, { email: testEmail(fx, 'email002') });
    expect(emailOf(await profileByRef(fx, p, p)) === e1, 'email stays E1').toBe(true);
  });

  scenario('M2-EMAIL-003', async (fx) => {
    const p = await fx.accounts.onboarded(0);
    const e1 = emailOf(await profileByRef(fx, p, p));
    for (const apiId of ['API-058', 'API-130']) {
      const body = await devBody(fx, apiId, asUser(fx, p));
      setDeep(body, 'personal_email', testEmail(fx, 'email003'));
      await call(fx, apiId, asUser(fx, p), { body });
      expect(
        emailOf(await profileByRef(fx, p, p)) === e1,
        `${apiId}: personal_email in the edit body is ignored`,
      ).toBe(true);
    }
  });

  scenario('M2-EMAIL-004', async (fx) => {
    for (const [label, value] of [
      ['null', null],
      ['empty', ''],
      ['whitespace', '   '],
      ['no at-sign', 'no-at-sign'],
      ['no domain', 'a@'],
      ['no local part', '@b.com'],
      ['255+ characters', `${'q'.repeat(250)}@example.test`],
    ] as const) {
      const p = await fx.accounts.freshUser();
      const body = await devBody(fx, 'API-057', asUser(fx, p));
      setDeep(body, 'personal_email', value);
      const res = await call(fx, 'API-057', asUser(fx, p), { body });
      expect(res.status < 500, `${label}: no server error`).toBe(true);
      if (!isSuccess(res.status))
        noteEvidence(`${label}: refused (HTTP ${res.status}); stored value per M2Q-07.`);
    }
  });

  scenario('M2-EMAIL-005', async (fx) => {
    const a = await fx.accounts.freshUser();
    const b = await fx.accounts.freshUser();
    const email = testEmail(fx, 'email005');
    expectOk(await submitProfile(fx, a, { firstName: fx.data.firstName(), email }), 'A onboards');
    const aBefore = emailOf(await ownProfile(fx, a));
    await submitProfile(fx, b, { firstName: fx.data.firstName(), email: email.toUpperCase() }, 'API-061');
    expect(
      emailOf(await ownProfile(fx, a)) === aBefore,
      'A is never affected by B using the same email',
    ).toBe(true);
  });

  scenario('M2-EMAIL-006', async () => {
    blockPrereq(
      PREREQ.states.id,
      `${PREREQ.states.reason} — a profile with a PII email but no local email_id`,
    );
  });

  // Gate-OFF half (M2Q-02); gate-ON half waits for Dev (M2Q-43).
  scenario('M2-EMAIL-007', async (fx) => {
    const email = testEmail(fx, 'email007');
    const p = await fx.accounts.onboardFresh({ firstName: fx.data.firstName(), email });
    const byRef = await call(fx, 'API-021', asUser(fx, p), { values: { REF: p.ref } });
    expectOk(byRef, 'own /V1/users/:ref');
    expect(emailOf(byRef) === email, '/V1/users/:ref returns the onboarding email').toBe(true);
    const about = await call(fx, 'API-022', asUser(fx, p));
    expectOk(about, '/V1/users/about');
    const shown = emailOf(about);
    if (shown !== undefined)
      expect(shown === email, '/V1/users/about returns the onboarding email').toBe(true);
    else noteEvidence('/V1/users/about carries no email key (recorded).');
  });

  scenario('M2-EMAIL-008', async (fx) => {
    const p = await fx.accounts.newUser('A');
    for (const apiId of ['API-062', 'API-089']) {
      const res = await call(fx, apiId, asUser(fx, p));
      expectOk(res, `${apiId} for a normal account`);
      expect(
        scanResponse(res, { known: fx.accounts.numbersExcept(p) }).filter(
          (f) => f.kind === 'known test value',
        ),
      ).toEqual([]);
    }
    noteEvidence(
      'upload_images_v2 needs an image-inappropriate profile (M2Q-32); nil-email behaviour per M2Q-05.',
    );
  });

  scenario('M2-EMAIL-009', async () => {
    blockPrereq('M2Q-18', 'Emails cannot be captured on staging yet (test mailbox / provider sandbox)');
  });
});
