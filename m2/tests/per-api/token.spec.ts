/**
 * Per-API TOKEN checks (workbook check "TOKEN" — Wrong credential type refused), generated from the M2 design.
 *
 * Dev doc "Request setup": "Tokens are different credentials and are not interchangeable". Each test sends the
 * API with a VALID credential of the WRONG type, plus the headers the Dev cURL uses, and no body ({} for non-GET).
 * Audit fix 2026-10-25: the wrong credential is one the route can PARSE, so a refusal proves "wrong type" and not
 * "unreadable token" (wrongCredentialsFor, from code — confirm with Dev):
 *   - app user routes: a web JWT (ptfrm "web") of a suite account — verify_auth_token rejects it;
 *   - web-token, TEST_TOKEN and CMS routes: a normal app user JWT of a new synthetic account;
 *   - INFOEDGE: TEST_TOKEN (shown only as $AISLE_TEST_TOKEN).
 * Pass = every variant refused with a 4xx (400–499) and no personal data. A 5xx is a FAILURE (defect M2Q-39, from
 * code), never a "known defect" pass. The browser-only admin page may refuse with its 302 to the admin login page.
 * The web JWT is sent with its own device id (not an app device), so a refusal never logs a suite device out.
 */
import { AUTH, wrongCredentialsFor, type WrongCredential } from '../../src/auth/credentials';
import type { AuthMode, Device } from '../../src/clients/m2-client';
import { expectRefusedWithoutPii } from '../../src/assertions/pii.assertions';
import { requireTestToken } from '../../src/config/m2-config';
import { apiById, casesFor, titleOf } from '../../src/design';
import { blockIfOpen, test } from '../../src/fixtures/m2-fixtures';

const CASES = casesFor('TOKEN');

test.describe('M2 per-API checks — wrong credential type refused (TOKEN)', () => {
  for (const c of CASES) {
    test(titleOf(c), { tag: c.tags }, async ({ m2, m2Config, accounts, observe }) => {
      blockIfOpen(c);
      const api = apiById(c.apis[0]!);
      const cookieRoute = api.auth.includes('ADMIN_SESSION_COOKIE');

      /** The wrong-type credential and the device it is sent with (never a suite account's app device). */
      const credential = async (kind: WrongCredential): Promise<{ auth: AuthMode; device?: Device }> => {
        if (kind === 'TEST_TOKEN') return { auth: AUTH.testToken(requireTestToken(m2Config)) };
        if (kind === 'web JWT')
          return {
            auth: AUTH.web(await accounts.webJwt()),
            device: { deviceType: 'web', uniqueIdentifier: `${m2Config.runId}-token-check-web` },
          };
        accounts.requireCreate();
        const user = await accounts.newUser();
        return { auth: AUTH.user(user.token), device: user.device };
      };

      for (const kind of wrongCredentialsFor(api.auth)) {
        const label = `${api.id} ${kind}`;
        const { auth, device } = await credential(kind);
        const res = await test.step(`Send ${label}`, () =>
          m2.call(api.id, { auth, ...(device ? { device } : {}) }));
        observe(label, res);
        await test.step(`Check ${label} is refused (4xx) without personal data`, () =>
          expectRefusedWithoutPii(res, label, {}, { loginRedirectOk: cookieRoute }));
      }
    });
  }
});
