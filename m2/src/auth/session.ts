/**
 * Session helper — phone login for synthetic M2 app accounts, as the Aisle app does it (flow from the Aisle UI
 * automation team, verified by QA on staging 2026-10-23; see m2/docs/onboarding-flow.md):
 *
 *   1. POST /V1/sessions/login_with_phone_number
 *        {mobile_number, phone_code_id: 242, device_type, app_version, unique_identifier, signature_v1}
 *      signature_v1 is the app's static value from .env (M2_LOGIN_SIGNATURE_V1) — a SECRET: registered with the
 *      scrubber, never logged, recorded or printed. Device fields travel in the BODY (headers are optional).
 *   2. POST /V1/sessions/verify_number_login_v1 {phone_code_id: 242, mobile_number, otp: "1234"}
 *        → auth_token, id, ref, application_stage, profile_state (top level OR under "data" — both are read).
 *      Errors: "The entered OTP is invalid." / "No OTP has been generated for this user or number."
 *
 * The auth_token is an RS256 JWT (~168 h) bound to the device (claims uid, did, ptfrm, phone_id): every later call
 * must send the SAME unique_identifier and device_type as the login. It is held in memory as a Secret, registered as
 * `$M2_USER_TOKEN`, and never logged. Login calls use a client WITHOUT an exchange recorder (the replies carry the
 * token, the requests the signature).
 *
 * Numbers: +91 10… only, never the 106 series (the UI team's fixed accounts live there).
 */
import type { ApiResponse } from '../../../core/http/api-response';
import { registerSecretValue } from '../../../core/utils/redaction';
import { Secret } from '../../../core/utils/secret';
import type { Logger } from '../../../core/utils/logger';
import type { M2Config } from '../config/m2-config';
import { M2Client, type Device, type ExtraRoute } from '../clients/m2-client';
import { AUTH } from './credentials';
import { isAllowedTestNumber, TEST_OTP, testPhoneNumber } from './test-phone';

/** Routes of the login / onboarding flow that are not in the Dev PII inventory (not PII-affected). */
export const LOGIN_WITH_PHONE_NUMBER: ExtraRoute = {
  key: 'loginWithPhoneNumber',
  method: 'POST',
  path: '/V1/sessions/login_with_phone_number',
  headers: ['Accept', 'Content-Type'],
};
export const COMMUNITY_AGREED: ExtraRoute = {
  key: 'updateCommunityMessageAgreed',
  method: 'POST',
  path: '/V1/account_journey/update_community_message_agreed',
  headers: ['Accept', 'Content-Type', 'device_type', 'app_version', 'unique_identifier'],
};
export const VERIFY_LOGIN_API = 'API-060';
export const DELETE_ACCOUNT_API = 'API-059';
export const USER_TOKEN_PLACEHOLDER = '$M2_USER_TOKEN';
export const WEB_TOKEN_PLACEHOLDER = '$M2_WEB_TOKEN';

export interface UserSession {
  /** App user id from the verify response (synthetic account). */
  readonly userId: string | undefined;
  readonly mobileNumber: string;
  /** The device the token is bound to — send it on every call with this token. */
  readonly device: Device;
  readonly token: Secret;
  readonly applicationStage: string | undefined;
  /** Profile ref and state from the verify response, when the account has a profile. */
  readonly ref?: string | undefined;
  readonly profileState?: string | undefined;
  /** Key names of the verify reply (value-free), for the login POS check. */
  readonly loginShape: readonly string[];
}

export class SessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionError';
  }
}

/** A field of a verify / profile reply: top level or under "data". */
export function field(body: unknown, key: string): unknown {
  const b = body as Record<string, unknown> | undefined;
  const top = b?.[key];
  if (top !== undefined) return top;
  return (b?.data as Record<string, unknown> | undefined)?.[key];
}
const str = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : String(v));

export class SessionHelper {
  readonly client: M2Client;
  private counter = 0;

  /**
   * @param workerIndex Playwright worker index: part of the number seed, so a worker restarted after a failure never
   * reuses (and re-creates) a number an earlier worker of the same run already used.
   */
  constructor(
    private readonly config: M2Config,
    private readonly log: Logger,
    private readonly workerIndex = 0,
  ) {
    // No recorder: login replies contain the token and requests the signature (see file header).
    this.client = new M2Client(config, log);
  }

  /** The next run-unique test number (+91 10…, never 106…) and its device id — not used yet. */
  nextNumber(): { mobileNumber: string; deviceId: string } {
    const index = this.workerIndex * 1000 + this.counter++;
    return {
      mobileNumber: testPhoneNumber(this.config.runId, index),
      deviceId: `${this.config.runId}-dev-${index}`,
    };
  }

  /** The device a session for `deviceId` is bound to (the login device type / app version). */
  device(deviceId: string): Device {
    return {
      deviceType: this.config.login.deviceType,
      appVersion: this.config.login.appVersion,
      uniqueIdentifier: deviceId,
    };
  }

  /**
   * Log into the account of a synthetic number (creates the account when the number is new). The device id
   * defaults to one per number and run.
   */
  async loginWithNumber(mobileNumber: string, deviceId?: string): Promise<UserSession> {
    if (!isAllowedTestNumber(mobileNumber)) throw new SessionError('Not an allowed synthetic test number');
    const device = this.device(deviceId ?? `${this.config.runId}-dev-${mobileNumber.slice(-4)}`);
    const otp = await this.requestOtp(mobileNumber, device);
    if (otp.status !== 200) throw new SessionError(`OTP request refused: HTTP ${otp.status}`);
    const verify = await this.verify(mobileNumber, TEST_OTP, device);
    const body = verify.json();
    const token = field(body, 'auth_token');
    if (verify.status !== 200 || typeof token !== 'string' || token.length === 0) {
      throw new SessionError(`OTP verification did not return a token: HTTP ${verify.status}`);
    }
    registerSecretValue(token, USER_TOKEN_PLACEHOLDER);
    const keys = new Set(Object.keys((body as object) ?? {}));
    const data = (body as { data?: unknown } | undefined)?.data;
    if (data && typeof data === 'object') for (const k of Object.keys(data)) keys.add(k);
    const session: UserSession = {
      userId: str(field(body, 'id')),
      mobileNumber,
      device,
      token: new Secret(token),
      applicationStage: str(field(body, 'application_stage')),
      ref: str(field(body, 'ref')),
      profileState: str(field(body, 'profile_state')),
      loginShape: [...keys],
    };
    this.log.info('Synthetic account session', { stage: session.applicationStage ?? '—' });
    return session;
  }

  /** Step 1 of the login: request an OTP (no credential; device fields + signature in the body). */
  requestOtp(mobileNumber: string, device: Device): Promise<ApiResponse> {
    const login = this.config.login;
    return this.client.callRoute(LOGIN_WITH_PHONE_NUMBER, {
      auth: AUTH.none,
      body: {
        mobile_number: mobileNumber,
        phone_code_id: login.phoneCodeId,
        device_type: device.deviceType,
        app_version: device.appVersion ?? login.appVersion,
        unique_identifier: device.uniqueIdentifier,
        ...(login.signature ? { signature_v1: login.signature.reveal() } : {}),
      },
      device,
      retry: false,
    });
  }

  /**
   * Step 2: verify the OTP. The reply may carry a token, so this goes through the helper's NON-recording client;
   * callers must only look at status / key names, and register any token before logging.
   */
  verify(mobileNumber: string, otp: string, device: Device): Promise<ApiResponse> {
    return this.client.call(VERIFY_LOGIN_API, {
      auth: AUTH.none,
      body: { phone_code_id: this.config.login.phoneCodeId, mobile_number: mobileNumber, otp },
      device,
      retry: false,
    });
  }

  /**
   * A WEB JWT (ptfrm "web") for an existing synthetic account WITH a profile, for the TOKEN checks (valid credential
   * of the wrong type). From code (develop_new 944f76a — confirm with Dev): verify_number_login_v1 with device_type
   * "web" answers create_login_web_response, whose auth_token is generate_web_auth_token (ptfrm "web") — and it
   * returns before DeviceInfo::UserDetail.set_data, so the account's app device and app token are not touched
   * (user.rb:143-163, authenticatable.rb:41-55, 242-261). The OTP is requested with the account's own device; the
   * verify carries device_type "web" (header — standardize_params copies it into params — and body) and a separate
   * device id. The token is registered as `$M2_WEB_TOKEN` at once and never logged. undefined = no token issued.
   */
  async webToken(s: UserSession): Promise<Secret | undefined> {
    if (!isAllowedTestNumber(s.mobileNumber)) throw new SessionError('Not an allowed synthetic test number');
    const otp = await this.requestOtp(s.mobileNumber, s.device);
    if (otp.status !== 200) return undefined;
    const web: Device = {
      deviceType: 'web',
      appVersion: s.device.appVersion ?? this.config.login.appVersion,
      uniqueIdentifier: `${s.device.uniqueIdentifier}-web`,
    };
    const verify = await this.client.call(VERIFY_LOGIN_API, {
      auth: AUTH.none,
      body: {
        phone_code_id: this.config.login.phoneCodeId,
        mobile_number: s.mobileNumber,
        otp: TEST_OTP,
        device_type: 'web',
        unique_identifier: web.uniqueIdentifier,
      },
      device: web,
      retry: false,
    });
    const token = field(verify.json(), 'auth_token');
    if (verify.status !== 200 || typeof token !== 'string' || !token) return undefined;
    registerSecretValue(token, WEB_TOKEN_PLACEHOLDER);
    return new Secret(token);
  }

  /**
   * Delete an account (POST /V1/user/delete {id: <ref>, reason_id: 1, note}) — staging 2026-10-23: 200 with
   * reason_id, 500 with {id} alone. The old token is dead afterwards.
   */
  deleteAccount(s: UserSession, ref: string): Promise<ApiResponse> {
    return this.client.call(DELETE_ACCOUNT_API, {
      auth: AUTH.user(s.token),
      body: { id: ref, reason_id: 1, note: 'Synthetic QA account' },
      device: s.device,
      retry: false,
    });
  }
}
