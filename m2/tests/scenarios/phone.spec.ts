/**
 * Scenario cases — phone (M2-PHONE-*). Login writes the PHONE record for a NEW user only (Dev doc API-060).
 * Test numbers are +91 10… (never the 106 series); accepted login variants are tracked in the account ledger.
 */
import { scenario, dbScenario } from '../../src/checks/define';
import { expectUnchanged, piiUserIdFor } from '../../src/checks/db';
import { phoneForms } from '../../src/checks/per-api';
import { scanResponse } from '../../src/assertions/pii.assertions';
import { testPhoneNumber } from '../../src/auth/test-phone';
import { snapshotSummary } from '../../src/db/pii-db';
import { blockPrereq, PREREQ } from '../../src/prereq';
import { expect, notApplicable, noteEvidence, test } from '../../src/fixtures/m2-fixtures';
import { asUser, call, phoneOf, profileByRef, testEmail } from '../../src/scenarios/helpers';

test.describe('M2 scenarios — phone', () => {
  // Gate OFF (M2Q-02): the login wrote PHONE at creation; the owner sees the login number. Gate ON waits (M2Q-43).
  scenario('M2-PHONE-001', async (fx) => {
    // New login (the PHONE write) + onboarding, so the owner's profile can be read (a new user gets 401).
    const s = await fx.accounts.onboardFresh({
      firstName: fx.data.firstName(),
      email: testEmail(fx, 'phone001'),
    });
    const phone = phoneOf(await profileByRef(fx, s, s));
    expect(
      phone !== undefined && phoneForms(s.mobileNumber).includes(String(phone)),
      'owner profile shows the login number',
    ).toBe(true);
    noteEvidence(
      'PHONE in the PII service is recorded only: there is no PII phone read route for app users.',
    );
  });

  dbScenario('M2-PHONE-002', async (fx, db) => {
    const s = await fx.accounts.freshUser();
    const id = piiUserIdFor(s, fx.m2Config);
    const before = await db.snapshot(id);
    await fx.accounts.returningLogin(s);
    const after = await db.snapshot(id);
    noteEvidence(
      `PHONE records before ${snapshotSummary(before)}, after returning login ${snapshotSummary(after)}.`,
    );
    expect(
      before.PHONE?.count ?? 0,
      'the new user has a PHONE record before the returning login',
    ).toBeGreaterThan(0);
    expectUnchanged(before, after, ['PHONE'], 'returning login');
  });

  // NOT APPLICABLE on staging: no pre-integration (unmigrated) account exists (M2Q-05).
  scenario('M2-PHONE-003', async (_fx, c) => notApplicable(c.na!.question, c.na!.reason));

  scenario('M2-PHONE-004', async (fx) => {
    fx.accounts.admin();
  });

  scenario('M2-PHONE-005', async (fx) => {
    const base = testPhoneNumber(fx.m2Config.runId, 9100);
    for (const [label, raw] of [
      ['spaces', `${base.slice(0, 5)} ${base.slice(5)}`],
      ['dashes', `${base.slice(0, 5)}-${base.slice(5)}`],
      ['+91 prefix', `+91${base}`],
      ['leading 0', `0${base}`],
      ['too short', base.slice(0, 7)],
      ['too long', `${base}9`],
      ['letters', 'abcdefghij'],
    ] as const) {
      const { verify } = await fx.accounts.loginVariant(raw, label.replace(/\W+/g, '-'));
      fx.observe(`verify with ${label}`, verify);
      expect(verify.status < 500, `${label}: no server error`).toBe(true);
    }
    noteEvidence(
      'Accepted variants and the stored national number are recorded (rule: M2Q-06 extended to phone).',
    );
  });

  scenario('M2-PHONE-006', async (fx) => {
    const [a, b] = await fx.accounts.connectedPair();
    for (const apiId of ['API-005', 'API-006', 'API-007', 'API-008', 'API-063', 'API-068', 'API-116']) {
      const res = await call(fx, apiId, asUser(fx, b, a));
      const leaks = scanResponse(res, { known: phoneForms(a.mobileNumber) }).filter(
        (f) => f.kind === 'known test value',
      );
      expect(leaks, `${apiId}: A’s phone never appears in B’s list (locations only)`).toEqual([]);
    }
  });

  scenario('M2-PHONE-007', async (fx) => {
    const [a, b] = await fx.accounts.connectedPair();
    await call(fx, 'API-103', asUser(fx, a, b));
    noteEvidence('Speed-dating feedback needs an event both accounts joined (M2_VALUE_EVENT_ID, M2Q-25).');
  });

  scenario('M2-PHONE-008', async () => {
    blockPrereq(PREREQ.provider.id, PREREQ.provider.reason);
  });

  scenario('M2-PHONE-009', async (fx) => {
    fx.accounts.admin();
  });
});
