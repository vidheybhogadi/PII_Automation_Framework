/**
 * Scenario cases — cross-field (M2-XFLD-*): changes to one field or one user never touch another.
 */
import { scenario } from '../../src/checks/define';
import { blockPrereq, PREREQ } from '../../src/prereq';
import { expect, noteEvidence, test } from '../../src/fixtures/m2-fixtures';
import {
  asUser,
  call,
  devBody,
  editFirstName,
  emailOf,
  expectOk,
  nameOf,
  ownProfile,
  phoneOf,
  piiFirstName,
  profileByRef,
  setDeep,
} from '../../src/scenarios/helpers';

test.describe('M2 scenarios — cross-field', () => {
  scenario('M2-XFLD-001', async (fx) => {
    const p = await fx.accounts.onboarded(0);
    const before = await profileByRef(fx, p, p);
    expectOk(await editFirstName(fx, p, fx.data.firstName()), 'edit name');
    const after = await profileByRef(fx, p, p);
    expect(emailOf(after) === emailOf(before), 'email unchanged').toBe(true);
    expect(phoneOf(after) === phoneOf(before), 'phone unchanged').toBe(true);
  });

  scenario('M2-XFLD-002', async (fx) => {
    const p = await fx.accounts.freshUser();
    const body = devBody(fx, 'API-057', asUser(fx, p), { firstName: fx.data.firstName() });
    setDeep(body, 'personal_email', 'not-an-email');
    await call(fx, 'API-057', asUser(fx, p), { body });
    const app = nameOf(await ownProfile(fx, p));
    expect(app === (await piiFirstName(fx, p.userId!)), 'app and PII first name agree').toBe(true);
  });

  scenario('M2-XFLD-003', async (fx) => {
    const p = await fx.accounts.onboarded(0);
    const own = await profileByRef(fx, p, p);
    await call(fx, 'API-022', asUser(fx, p));
    expect(nameOf(own) === (await piiFirstName(fx, p.userId!)), 'owner name equals the PII name').toBe(true);
    noteEvidence('Owner email / phone vs PII need the facade read for the app user (M2Q-37).');
  });

  scenario('M2-XFLD-004', async (fx) => {
    if (!fx.m2Config.windows.gate) blockPrereq(PREREQ.gateWindow.id, PREREQ.gateWindow.reason);
    const p = await fx.accounts.onboarded(0);
    await call(fx, 'API-013', asUser(fx, p));
  });

  scenario('M2-XFLD-005', async (fx) => {
    const [a, b] = await fx.accounts.connectedPair();
    const snap = async () =>
      JSON.stringify([
        nameOf(await ownProfile(fx, b)),
        emailOf(await ownProfile(fx, b)),
        await piiFirstName(fx, b.userId!),
      ]);
    const before = await snap();
    expectOk(await editFirstName(fx, a, fx.data.firstName()), 'A edits name');
    await call(fx, 'API-032', asUser(fx, a));
    await call(fx, 'API-032', asUser(fx, a)); // hide, then unhide
    expect((await snap()) === before, 'B unchanged (app name, email, PII name)').toBe(true);
    noteEvidence('"A’s account is reset in a separate run" needs a suite-onboarded account (M2Q-36).');
  });
});
