/**
 * Per-API AUTH checks (workbook check "AUTH" — Missing / invalid credential refused), generated from the M2 design:
 * one test per inventory API, titled with its workbook ID (M2-API-013-AUTH …).
 *
 * Each test sends the API with no credential, with "Bearer invalid" and with an expired, wrongly-signed JWT, and no
 * request body ({} for non-GET), so a route that wrongly accepted the call would have nothing to act on.
 * Pass = every reply is refused with a 4xx (400–499) and carries no personal data; a 5xx is a FAILURE, not a refusal
 * (defect M2Q-39, from code); the browser-only admin page may refuse with its 302 to the admin login page. Where
 * staging recorded the exact refusal
 * (m2-inventory.ts OBSERVED_NO_CREDENTIAL), the no-credential reply must match it exactly. Every reply's status and
 * body shape is recorded ("observed").
 *
 * In scope: cases with no dependency, and cases still waiting for an open question (shown as Blocked). The login
 * routes (API-060 / API-062, OTP variants) need live accounts and come in Step 2.
 */
import { AUTH, INVALID_VARIANTS, authLabel } from '../../src/auth/credentials';
import { expectObservedRefusal, expectRefusedWithoutPii } from '../../src/assertions/pii.assertions';
import { apiById, casesFor, openDeps, titleOf } from '../../src/design';
import { blockIfOpen, noteEvidence, test } from '../../src/fixtures/m2-fixtures';
import { OBSERVED_NO_CREDENTIAL } from '../../scripts/m2-inventory';

const CASES = casesFor('AUTH').filter((c) => c.deps.length === 0 || openDeps(c).length > 0);

test.describe('M2 per-API checks — missing / invalid credential refused (AUTH)', () => {
  for (const c of CASES) {
    test(titleOf(c), { tag: c.tags }, async ({ m2, observe }) => {
      blockIfOpen(c);
      const apiId = c.apis[0]!;
      const cookieRoute = apiById(apiId).auth.includes('ADMIN_SESSION_COOKIE');
      // Browser-cookie routes: the session cookie name is unknown (M2Q-04), so no invalid-cookie variant.
      const variants = cookieRoute ? [AUTH.none, AUTH.invalidBearer] : INVALID_VARIANTS();
      if (cookieRoute)
        noteEvidence('Invalid-cookie variant not sent: the admin session cookie name is unknown (M2Q-04).');

      const replies = [];
      for (const auth of variants) {
        const label = `${apiId} ${authLabel(auth)}`;
        const res = await test.step(`Send ${label}`, () => m2.call(apiId, { auth }));
        observe(label, res);
        replies.push({ auth, label, res });
      }

      const observed = OBSERVED_NO_CREDENTIAL[apiId];
      for (const { auth, label, res } of replies) {
        await test.step(`Check ${label} is refused without personal data`, () => {
          if (auth.kind === 'none' && observed) expectObservedRefusal(res, observed, label);
          expectRefusedWithoutPii(res, label, {}, { loginRedirectOk: cookieRoute });
        });
      }
    });
  }
});
