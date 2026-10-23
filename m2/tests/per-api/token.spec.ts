/**
 * Per-API TOKEN checks (workbook check "TOKEN" — Wrong credential type refused), generated from the M2 design.
 *
 * Dev doc "Request setup": "Tokens are different credentials and are not interchangeable". Each test sends the
 * API with a VALID credential of the WRONG type, plus the headers the Dev cURL uses, and no body ({} for non-GET):
 *   - user / web / INFOEDGE routes: TEST_TOKEN (shown only as $AISLE_TEST_TOKEN);
 *   - TEST_TOKEN routes: a normal user JWT (a new synthetic account — needs M2_CREATE_ACCOUNTS=true);
 *   - CMS routes: TEST_TOKEN, then a normal user JWT.
 * Pass = every variant refused (not 2xx) and no personal data. The observed status and body shape are recorded;
 * a server error instead of 401 is marked as the known defect pattern M2Q-39.
 * Note (staging 2026-10-23): even a valid token of a NEW onboarding-stage user gets 401 on some routes, so a refusal
 * proves "not accepted", not "refused because of the token type".
 */
import { AUTH } from '../../src/auth/credentials';
import { expectRefusedWithoutPii } from '../../src/assertions/pii.assertions';
import { requireTestToken } from '../../src/config/m2-config';
import { apiById, casesFor, titleOf } from '../../src/design';
import { blockIfOpen, test } from '../../src/fixtures/m2-fixtures';
import { blockPrereq, PREREQ } from '../../src/prereq';

const CASES = casesFor('TOKEN');

test.describe('M2 per-API checks — wrong credential type refused (TOKEN)', () => {
  for (const c of CASES) {
    test(titleOf(c), { tag: c.tags }, async ({ m2, m2Config, accounts, observe }) => {
      blockIfOpen(c);
      const api = apiById(c.apis[0]!);
      const admin = api.auth.some((a) => ['ADMIN_TOKEN', 'webcms', 'ADMIN_SESSION_COOKIE'].includes(a));
      const testTokenRoute = api.auth.includes('TEST_TOKEN');

      if (!testTokenRoute) {
        const label = `${api.id} TEST_TOKEN`;
        const res = await test.step(`Send ${label}`, () =>
          m2.call(api.id, { auth: AUTH.testToken(requireTestToken(m2Config)) }));
        observe(label, res);
        await test.step(`Check ${label} is refused without personal data`, () =>
          expectRefusedWithoutPii(res, label));
        if (!admin) return;
      }

      // Second (or only) variant: a normal user JWT.
      if (!accounts.canCreate)
        blockPrereq(
          PREREQ.createAccounts.id,
          `${admin ? 'TEST_TOKEN variant refused without PII (checked); ' : ''}the user-JWT variant needs a new synthetic account — set M2_CREATE_ACCOUNTS=true`,
        );
      const user = await accounts.newUser();
      const label = `${api.id} user JWT`;
      const res = await test.step(`Send ${label}`, () =>
        m2.call(api.id, { auth: AUTH.user(user.token), device: user.device }));
      observe(label, res);
      await test.step(`Check ${label} is refused without personal data`, () =>
        expectRefusedWithoutPii(res, label));
    });
  }
});
