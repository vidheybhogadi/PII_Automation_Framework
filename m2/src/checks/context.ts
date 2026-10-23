/**
 * Who calls an API in a check, with which credential, device and placeholder values — decided from the Dev
 * inventory's auth for that route. Anything the environment cannot provide yet blocks the test (prereq.ts).
 */
import type { ApiResponse } from '../../../core/http/api-response';
import type { InventoryApi } from '../../scripts/m2-inventory';
import { groupOf } from '../../scripts/m2-inventory';
import { NEW_USER_OK } from '../../scripts/m2-baseline';
import type { Accounts, Profile } from '../accounts/accounts';
import { AUTH } from '../auth/credentials';
import type { UserSession } from '../auth/session';
import { TEST_OTP } from '../auth/test-phone';
import type { AuthMode, Device, M2Client, M2CallOptions } from '../clients/m2-client';
import { requireTestToken, type M2Config } from '../config/m2-config';
import type { M2Data } from '../data';
import { blockPrereq, PREREQ } from '../prereq';
import { buildRequest, type Synthetic, type Values } from './request-builder';

export interface CheckFixtures {
  m2: M2Client;
  m2Config: M2Config;
  accounts: Accounts;
  data: M2Data;
  observe: (label: string, res: ApiResponse) => void;
}

export interface Caller {
  label: string;
  auth: AuthMode;
  device?: Device;
  session?: UserSession | Profile;
  values: Values;
}

const isProfile = (s: UserSession | Profile): s is Profile => 'ref' in s;

/** Placeholder values an account provides (its own ids; OTHER_* from a second account). */
export function valuesFor(
  config: M2Config,
  self?: UserSession | Profile,
  other?: UserSession | Profile,
): Values {
  return {
    ...config.values,
    OTP: TEST_OTP,
    USER_ID: self?.userId,
    REF: self && isProfile(self) ? self.ref : undefined,
    OTHER_USER_ID: other?.userId,
    OTHER_REF: other && isProfile(other) ? other.ref : undefined,
  };
}

export function syntheticFor(fx: CheckFixtures, self?: UserSession): Synthetic {
  const domain = (process.env.AISLE_TEST_EMAIL_DOMAIN || 'example.test').toLowerCase();
  return {
    firstName: fx.data.firstName(),
    email: `${fx.data.userId('email').replace(/[^a-z0-9-]/g, '')}@${domain}`,
    freeText: `FT_${fx.m2Config.runId} synthetic text`,
    ...(self ? { mobileNumber: self.mobileNumber } : {}),
  };
}

const ADMIN_AUTH = ['ADMIN_TOKEN', 'webcms', 'ADMIN_SESSION_COOKIE'];

/**
 * Routes that delete, reset, deactivate or report an account. They are only ever sent for an account the suite
 * created and onboarded itself — never for Dev-provided accounts — so today they block (onboarding: M2Q-36).
 */
export const DESTRUCTIVE = [
  'API-029',
  'API-059',
  'API-098',
  'API-123',
  'API-131',
  'API-135',
  'API-196',
  'API-197',
  'API-198',
];

/**
 * The account that calls `api` in role A (or B). New-user routes use a new account; routes that need a finished
 * profile use a Dev-provided onboarded account (M2Q-36); CMS, web, INFOEDGE and callbacks block with their question.
 */
export async function callerFor(
  api: InventoryApi,
  fx: CheckFixtures,
  role: 'A' | 'B' = 'A',
): Promise<Caller> {
  if (api.auth.some((a) => ADMIN_AUTH.includes(a))) return fx.accounts.admin();
  if (api.auth.includes('INFOEDGE_PROFILE_API_TOKEN'))
    return blockPrereq(PREREQ.infoedge.id, PREREQ.infoedge.reason);
  if (api.auth.includes('WEB_TOKEN')) return fx.accounts.web();
  if (api.auth.includes('USER_TOKEN')) {
    if (DESTRUCTIVE.includes(api.id))
      blockPrereq(
        PREREQ.onboarding.id,
        `${api.id} deletes / resets / deactivates / reports an account: only for an account the suite created and onboarded itself (not possible yet)`,
      );
    const s = NEW_USER_OK.includes(api.id)
      ? await fx.accounts.newUser(role)
      : await fx.accounts.onboarded(role === 'A' ? 0 : 1);
    return {
      label: `user ${role}`,
      auth: AUTH.user(s.token),
      device: s.device,
      session: s,
      values: valuesFor(fx.m2Config, s),
    };
  }
  if (api.auth.includes('TEST_TOKEN')) {
    const auth = AUTH.testToken(requireTestToken(fx.m2Config));
    if (groupOf(api.id).key === 'G1')
      return {
        label: 'TEST_TOKEN',
        auth,
        values: { ...valuesFor(fx.m2Config), USER_ID: fx.data.userId(role) },
      };
    const p = await fx.accounts.onboarded(role === 'A' ? 0 : 1);
    return { label: 'TEST_TOKEN', auth, values: valuesFor(fx.m2Config, p) };
  }
  if (groupOf(api.id).key === 'G9') return blockPrereq(PREREQ.provider.id, PREREQ.provider.reason);
  // Pre-login routes (no credential): a new account's number / user id.
  const s = await fx.accounts.newUser(role);
  return {
    label: 'no credential (pre-login)',
    auth: AUTH.none,
    device: s.device,
    session: s,
    values: valuesFor(fx.m2Config, s),
  };
}

/**
 * Login routes answer with a fresh auth_token that is not registered as a secret yet, so they are sent through the
 * session helper's NON-recording client (only status and key names are kept, via observe()).
 */
export const TOKEN_REPLY_APIS = ['API-060', 'API-062'];

/** Send `api` as `caller` with its Dev request (placeholders filled, synthetic PII). */
export async function send(
  api: InventoryApi,
  fx: CheckFixtures,
  caller: Caller,
  extra: Partial<M2CallOptions> & {
    values?: Values;
    synthetic?: Partial<Synthetic>;
    noDevBody?: boolean;
  } = {},
): Promise<ApiResponse> {
  // An explicit body / query replaces Dev's example, so its placeholders are not needed.
  const overridden = extra.body !== undefined || extra.query !== undefined;
  const req = buildRequest(
    overridden ? { ...api, curl: [] } : api,
    { ...caller.values, ...extra.values },
    { ...syntheticFor(fx, caller.session), ...extra.synthetic },
  );
  const { values: _v, synthetic: _s, noDevBody, ...rest } = extra;
  if (noDevBody) delete req.body;
  const client = TOKEN_REPLY_APIS.includes(api.id) ? fx.accounts.sessions.client : fx.m2;
  return client.call(api.id, {
    auth: caller.auth,
    ...(caller.device ? { device: caller.device } : {}),
    ...(req.body !== undefined ? { body: req.body } : {}),
    ...(req.query ? { query: req.query } : {}),
    pathParams: req.pathParams,
    ...rest,
  });
}
