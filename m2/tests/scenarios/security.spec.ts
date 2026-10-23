/**
 * Scenario cases — security (M2-SEC-*): public reads, partner API, error echo, admin permissions, logs.
 */
import { isSuccess, scanResponse } from '../../src/assertions/pii.assertions';
import { scenario } from '../../src/checks/define';
import { blockPrereq, PREREQ } from '../../src/prereq';
import { expect, test } from '../../src/fixtures/m2-fixtures';
import { asTestToken, asUser, call, devBody, INTERNALS, setDeep } from '../../src/scenarios/helpers';

test.describe('M2 scenarios — security', () => {
  scenario('M2-SEC-004', async () => {
    blockPrereq(
      PREREQ.infoedge.id,
      'Public-profile visibility rules and a public synthetic profile are needed (M2Q-19)',
    );
  });

  scenario('M2-SEC-005', async () => {
    blockPrereq(PREREQ.infoedge.id, PREREQ.infoedge.reason);
  });

  scenario('M2-SEC-006', async (fx) => {
    const marker = `QaEcho${fx.data.firstName()}`;
    const p = await fx.accounts.onboarded(0);
    const cases: [
      string,
      ReturnType<typeof asUser> | ReturnType<typeof asTestToken>,
      Record<string, unknown>,
    ][] = [];
    for (const apiId of ['API-057', 'API-058']) {
      const body = devBody(fx, apiId, asUser(fx, p));
      setDeep(body, 'first_name', `${marker}${'x'.repeat(300)}`);
      setDeep(body, 'personal_email', `${marker}@`);
      cases.push([apiId, asUser(fx, p), body]);
    }
    cases.push(['API-002', asTestToken(fx), { user_id: '', first_name: marker }]);
    for (const [apiId, caller, body] of cases) {
      const res = await call(fx, apiId, caller, { body, retry: false });
      if (isSuccess(res.status)) continue;
      const echoed = scanResponse(res, { known: [marker] }).filter((f) => f.kind === 'known test value');
      expect(echoed, `${apiId}: the error does not echo the submitted value (locations only)`).toEqual([]);
      expect(
        INTERNALS.test(res.rawText()),
        `${apiId}: the error shows no internals (stack trace, classes, paths)`,
      ).toBe(false);
    }
  });

  scenario('M2-SEC-007', async (fx) => {
    fx.accounts.admin();
  });

  scenario('M2-SEC-009', async () => {
    blockPrereq('M2Q-26', 'Read access to application logs is needed to search for plaintext PII');
  });
});
