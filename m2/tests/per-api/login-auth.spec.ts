/**
 * Login AUTH checks (API-060 verify_number_login_v1, API-062 fetch_login_response): the credential on these
 * pre-login routes is number + OTP, so the AUTH check sends invalid OTP / number variants.
 *
 * Staging facts (2026-10-23): any +91 10… number (never 106…) gets OTP 1234. So "expired", "reused" and "OTP of
 * another number" cannot be produced with the fixed OTP shortcut — they are recorded as not testable, not guessed.
 * Pass = every invalid variant is refused: NO auth_token issued and no personal data in the reply. Staging answers a
 * refused OTP verify with HTTP 200 and an error message (observed 2026-10-23: wrong OTP → 200 with "The entered OTP
 * is invalid.", no token), so the HTTP status is recorded, not asserted, for verify; fetch_login_response must not
 * answer 2xx for another account. Replies are read through the session helper's non-recording client (a wrongly
 * accepted login would carry a token).
 * Needs M2_CREATE_ACCOUNTS=true: a defective server could create an account, which must be tracked in the ledger.
 */
import { expectRefusedWithoutPii, scanResponse } from '../../src/assertions/pii.assertions';
import { testPhoneNumber } from '../../src/auth/test-phone';
import { caseById, titleOf } from '../../src/design';
import { blockIfOpen, expect, noteEvidence, test } from '../../src/fixtures/m2-fixtures';
import type { ApiResponse } from '../../../core/http/api-response';

/** No personal data in a refused verify reply (value-free message). */
function expectNoPii(res: ApiResponse, label: string): void {
  expect(scanResponse(res), `${label}: the refusal contains no personal data (locations only)`).toEqual([]);
}

const noToken = (res: ApiResponse) =>
  typeof (res.json() as { auth_token?: unknown } | undefined)?.auth_token !== 'string';

test.describe('M2 per-API checks — login credential (number + OTP) refused when invalid (AUTH)', () => {
  const c60 = caseById('M2-API-060-AUTH');
  test(titleOf(c60), { tag: c60.tags }, async ({ accounts, sessions, m2Config, observe }) => {
    blockIfOpen(c60);
    accounts.requireCreate();
    const device = sessions.device(`${m2Config.runId}-login-auth`);
    const fresh = testPhoneNumber(m2Config.runId, 9000);
    const entry = accounts.track(
      fresh,
      device.uniqueIdentifier,
      'wrong-OTP check — must not create an account',
    );

    const otp = await sessions.requestOtp(fresh, device);
    observe('request OTP for a fresh test number', otp);
    const wrong = await sessions.verify(fresh, '0000', device);
    observe('verify with a wrong OTP', wrong);
    // No token issued → no account to clean up (never logged into again; counted as "never created").
    if (noToken(wrong)) accounts.markNeverCreated(entry, 'wrong OTP refused — no token issued');
    expect(noToken(wrong), 'wrong OTP: no auth_token issued').toBe(true);
    expectNoPii(wrong, 'wrong OTP');
    expect(
      wrong.rawText().includes('The entered OTP is invalid.'),
      'wrong OTP: "The entered OTP is invalid." (observed 2026-10-23)',
    ).toBe(true);

    for (const [label, number] of [
      ['too short number', '10123'],
      ['letters instead of digits', 'abcdefghij'],
      ['empty number', ''],
    ] as const) {
      const res = await sessions.verify(number, '1234', device);
      observe(`verify with ${label}`, res);
      expect(noToken(res), `${label}: no auth_token issued`).toBe(true);
      expectNoPii(res, label);
    }
    noteEvidence(
      'Expired / reused OTP and "OTP of another number" are not testable with the fixed staging OTP 1234; "no user / PHONE record created" needs the PII user_id mapping (M2Q-37).',
    );
  });

  const c62 = caseById('M2-API-062-AUTH');
  test(titleOf(c62), { tag: c62.tags }, async ({ accounts, sessions, m2Config, data, observe }) => {
    blockIfOpen(c62);
    const a = await accounts.newUser('A');
    const device = sessions.device(`${m2Config.runId}-login-auth-62`);
    for (const [label, body] of [
      ['unknown user_id', { user_id: data.userId('unknown'), is_new_user: false }],
      ['another account’s user_id without credential', { user_id: a.userId, is_new_user: false }],
      ['no user_id', { is_new_user: false }],
    ] as const) {
      const res = await sessions.client.call('API-062', {
        auth: { kind: 'none' },
        body,
        device,
        retry: false,
      });
      observe(`fetch_login_response with ${label}`, res);
      expectRefusedWithoutPii(res, label);
      expect(noToken(res), `${label}: no auth_token issued`).toBe(true);
    }
  });
});
