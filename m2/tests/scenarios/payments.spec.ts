/**
 * Scenario cases — payments (M2-PAY-*). Provider requests are sent ONLY against Dev-confirmed sandboxes
 * (M2_PAYMENT_SANDBOX=true, M2Q-17) — never a live provider, never a real user. The provider payload itself is
 * inspected with Dev (Dev-assisted); the test checks the app's reply and records it.
 */
import { scanResponse } from '../../src/assertions/pii.assertions';
import { scenario } from '../../src/checks/define';
import { blockPrereq, PREREQ } from '../../src/prereq';
import { expect, noteEvidence, test } from '../../src/fixtures/m2-fixtures';
import { asUser, call, editFirstName, expectOk, type Fx } from '../../src/scenarios/helpers';

function requireSandbox(): void {
  if (process.env.M2_PAYMENT_SANDBOX !== 'true') blockPrereq(PREREQ.provider.id, PREREQ.provider.reason);
}

async function requests(fx: Fx, apis: string[]) {
  const p = await fx.accounts.onboarded(0);
  for (const apiId of apis) {
    const res = await call(fx, apiId, asUser(fx, p));
    const foreign = scanResponse(res, { known: fx.accounts.numbersExcept(p) }).filter(
      (f) => f.kind === 'known test value',
    );
    expect(foreign, `${apiId}: no other account’s phone in the reply`).toEqual([]);
  }
  noteEvidence(
    'Provider customer payload (name / email / phone) is checked with Dev in the sandbox (Dev-assisted).',
  );
}

test.describe('M2 scenarios — payments (sandbox only)', () => {
  scenario('M2-PAY-001', async (fx) => {
    requireSandbox();
    await requests(fx, ['API-073', 'API-074', 'API-189', 'API-104', 'API-077', 'API-078', 'API-193']);
  });

  scenario('M2-PAY-002', async (fx) => {
    requireSandbox();
    await requests(fx, ['API-076']);
  });

  scenario('M2-PAY-003', async (fx) => {
    requireSandbox();
    const p = await fx.accounts.onboarded(0);
    expectOk(await editFirstName(fx, p, fx.data.firstName()), 'edit name');
    await requests(fx, ['API-073', 'API-076']);
  });

  scenario('M2-PAY-004', async () => {
    requireSandbox();
    blockPrereq(PREREQ.states.id, `${PREREQ.states.reason} — an unmigrated profile with blank PII`);
  });
});
