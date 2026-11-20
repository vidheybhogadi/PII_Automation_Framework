/**
 * CMS admin sessions for the Redis key APIs (M2FNQ-01, seen on staging 2026-11-09):
 *   POST /admin/login {email, encrypted_password: <plain password>} (webcms: true) → {auth_token, qr_code_url, access_level}
 *   POST /admin/authenticate_rotp {otp} (Bearer + webcms)                       → {otp_verification_passed: true}
 *   POST /admin/logout (Bearer + webcms) — resets the admin’s OTP flag for ALL of its sessions.
 * The OTP is a TOTP made from M2FN_CMS_ADMIN_TOTP_SECRET. With webcms no device header is needed.
 *
 * These calls go through a NON-recording client: the login body carries the password and the reply carries a fresh
 * token and the OTP set-up URL. Only the status is kept. Every token is registered with the scrubber
 * ($M2FN_CMS_ADMIN_TOKEN / $M2FN_CMS_ASSOCIATE_TOKEN) before it is used, so recorded Redis calls show the placeholder.
 */
import { setTimeout as sleep } from 'node:timers/promises';
import type { ApiResponse } from '../../core/http/api-response';
import type { Logger } from '../../core/utils/logger';
import { registerSecretValue } from '../../core/utils/redaction';
import { Secret } from '../../core/utils/secret';
import { M2Client, type AuthMode, type ExtraRoute } from '../../m2/src/clients/m2-client';
import type { M2Config } from '../../m2/src/config/m2-config';
import { blockPrereq } from '../../m2/src/prereq';
import type { CmsLogin, M2fnConfig } from './config';
import { msToNextStep, totp } from './totp';

export const CMS_ROUTES = {
  login: { key: 'CMS-LOGIN', method: 'POST', path: '/admin/login', headers: ['webcms'] },
  otp: { key: 'CMS-OTP', method: 'POST', path: '/admin/authenticate_rotp', headers: ['webcms'] },
  logout: { key: 'CMS-LOGOUT', method: 'POST', path: '/admin/logout', headers: ['webcms'] },
} satisfies Record<string, ExtraRoute>;

export const CMS_PREREQ = {
  admin: {
    id: 'M2FN-CMS-ADMIN',
    reason:
      'No CMS admin login configured here — set M2FN_CMS_ADMIN_EMAIL, M2FN_CMS_ADMIN_PASSWORD and M2FN_CMS_ADMIN_TOTP_SECRET (QA’s admin with the Redis permission)',
  },
  associate: {
    id: 'M2FN-CMS-ASSOCIATE',
    reason:
      'No associate CMS login configured here — set M2FN_CMS_ASSOCIATE_EMAIL and M2FN_CMS_ASSOCIATE_PASSWORD',
  },
} as const;

type Who = 'admin' | 'associate';
const PLACEHOLDER: Record<Who, string> = {
  admin: '$M2FN_CMS_ADMIN_TOKEN',
  associate: '$M2FN_CMS_ASSOCIATE_TOKEN',
};

/** Which CMS a CmsAdmins serves: its token placeholders and the reasons when a login is missing. */
export interface CmsTarget {
  placeholder: Record<Who, string>;
  prereq: { admin: { id: string; reason: string }; associate: { id: string; reason: string } };
}
export const AISLE_CMS: CmsTarget = { placeholder: PLACEHOLDER, prereq: CMS_PREREQ };

export const adminAuth = (token: Secret, label = 'CMS admin JWT'): AuthMode => ({
  kind: 'secret',
  label,
  secret: token,
});

export class CmsAdmins {
  private readonly client: M2Client;
  private adminToken: Promise<Secret> | undefined;
  private associateToken: Promise<Secret> | undefined;

  constructor(
    private readonly config: M2fnConfig,
    m2Config: M2Config,
    log: Logger,
    private readonly target: CmsTarget = AISLE_CMS,
  ) {
    this.client = new M2Client(m2Config, log); // no recorder: password and fresh tokens never reach a report
  }

  /** Bearer credential of QA’s admin, logged in and OTP-verified (once per worker). */
  async admin(): Promise<AuthMode> {
    this.adminToken ??= this.freshVerifiedAdmin();
    const pending = this.adminToken;
    pending.catch(() => {
      if (this.adminToken === pending) this.adminToken = undefined;
    });
    return adminAuth(await pending);
  }

  /** Bearer credential of QA’s associate (logged in; no OTP secret, refused at the permission check anyway). */
  async associate(): Promise<AuthMode> {
    const login = this.config.associate;
    if (!login) blockPrereq(this.target.prereq.associate.id, this.target.prereq.associate.reason);
    this.associateToken ??= this.login('associate', login);
    const pending = this.associateToken;
    pending.catch(() => {
      if (this.associateToken === pending) this.associateToken = undefined;
    });
    return adminAuth(await pending, 'CMS associate JWT');
  }

  /**
   * Run `fn` with an admin token whose OTP is NOT verified: log out (resets the admin’s OTP flag for all of its
   * sessions), log in again, call `fn`, then verify the OTP on that token so the admin is usable again. Only for the
   * "no OTP" variant of M2FN-RDK-006; the m2fn-api project runs its spec in one worker, in order, so no other suite
   * test uses the admin meanwhile. Manual sessions of the same admin need a new OTP afterwards.
   */
  async withUnverifiedAdmin<T>(fn: (auth: AuthMode) => Promise<T>): Promise<T> {
    const login = this.requireAdmin();
    const current = await (this.adminToken ?? this.login('admin', login));
    const out = await this.send(CMS_ROUTES.logout, {
      kind: 'secret',
      label: 'CMS admin JWT',
      secret: current,
    });
    if (out.status >= 300) throw new Error(`CMS admin logout: HTTP ${out.status}`);
    this.adminToken = undefined;
    const token = await this.login('admin', login);
    try {
      return await fn(adminAuth(token, 'CMS admin JWT (OTP not verified)'));
    } finally {
      const verified = this.verifyOtp(token, login.totpSecret).then(() => token);
      this.adminToken = verified;
      await verified;
    }
  }

  private requireAdmin(): CmsLogin & { totpSecret: Secret } {
    const login = this.config.admin;
    if (!login) blockPrereq(this.target.prereq.admin.id, this.target.prereq.admin.reason);
    return login;
  }

  private async freshVerifiedAdmin(): Promise<Secret> {
    const login = this.requireAdmin();
    const token = await this.login('admin', login);
    await this.verifyOtp(token, login.totpSecret);
    return token;
  }

  private async login(who: Who, login: CmsLogin): Promise<Secret> {
    const res = await this.send(
      CMS_ROUTES.login,
      { kind: 'none' },
      { email: login.email.reveal(), encrypted_password: login.password.reveal() },
    );
    const body = res.json() as { auth_token?: unknown; qr_code_url?: unknown } | undefined;
    // The OTP set-up URL can carry the TOTP secret: scrubbed even though this client records nothing.
    if (typeof body?.qr_code_url === 'string') registerSecretValue(body.qr_code_url, '[CMS_QR_CODE_URL]');
    const token = typeof body?.auth_token === 'string' ? body.auth_token : '';
    if (res.status !== 200 || !token)
      throw new Error(`CMS ${who} login: HTTP ${res.status}${token ? '' : ', no auth_token in the reply'}`);
    registerSecretValue(token, this.target.placeholder[who]);
    return new Secret(token);
  }

  /** POST /admin/authenticate_rotp; one retry in the next 30-second step (a code may be accepted only once). */
  private async verifyOtp(token: Secret, totpSecret: Secret): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await sleep(msToNextStep() + 500);
      const res = await this.send(CMS_ROUTES.otp, adminAuth(token), { otp: totp(totpSecret.reveal()) });
      const passed = (res.json() as { otp_verification_passed?: unknown } | undefined)
        ?.otp_verification_passed;
      if (res.status === 200 && passed === true) return;
      if (attempt)
        throw new Error(`CMS admin OTP verification: HTTP ${res.status}, passed=${String(passed)}`);
    }
  }

  private send(route: ExtraRoute, auth: AuthMode, body?: unknown): Promise<ApiResponse> {
    return this.client.callRoute(route, { auth, retry: false, ...(body ? { body } : { noBody: true }) });
  }
}
