/**
 * Who calls an API in a check, with which credential, device and placeholder values — decided from the Dev
 * inventory's auth for that route and the profile state its controller requires. Anything the environment cannot
 * provide yet blocks the test (prereq.ts). Every request passes the safety guard (safety.ts) before it is sent.
 */
import { test } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import type { ApiResponse } from '../../../core/http/api-response';
import type { InventoryApi } from '../../scripts/m2-inventory';
import { groupOf } from '../../scripts/m2-inventory';
import { PAUSED_APIS } from '../../scripts/m2-all-cases';
import { isWebRoute, NEW_USER_OK } from '../../scripts/m2-baseline';
import {
  APPROVED_FIRST,
  DEACTIVATING,
  FRESH_ACCOUNT,
  ROUTE_STATE,
  suiteStateFor,
} from '../../scripts/m2-code-evidence';
import {
  DEACTIVATION_KEY,
  DELETING_APIS,
  RESETTING_APIS,
  type Accounts,
  type Profile,
} from '../accounts/accounts';
import { AUTH } from '../auth/credentials';
import type { UserSession } from '../auth/session';
import { TEST_OTP } from '../auth/test-phone';
import type { AuthMode, Device, M2Client, M2CallOptions } from '../clients/m2-client';
import { IDENTITY_PLACEHOLDERS, requireTestToken, type M2Config } from '../config/m2-config';
import type { M2Data } from '../data';
import { blockPrereq, PREREQ } from '../prereq';
import { catalogueValue } from './catalogue';
import { BODY_ADDITIONS, buildRequest, placeholdersIn, type Synthetic, type Values } from './request-builder';
import { missingProtectedIn, UNSAFE_QUESTION, UnsafeRequestError, unsafeIdsIn } from './safety';

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

/**
 * Placeholder values an account provides (its own ids; OTHER_* from a second account) plus the environment's
 * M2_VALUE_<NAME> catalogue values. Only keys with a value are set, so nothing defined elsewhere is overwritten.
 */
export function valuesFor(
  config: M2Config,
  self?: UserSession | Profile,
  other?: UserSession | Profile,
): Values {
  const v: Values = { ...config.values, OTP: TEST_OTP };
  if (self?.userId) v.USER_ID = self.userId;
  if (self && isProfile(self) && self.ref) v.REF = self.ref;
  if (other?.userId) v.OTHER_USER_ID = other.userId;
  if (other && isProfile(other) && other.ref) v.OTHER_REF = other.ref;
  return v;
}

export function syntheticFor(fx: CheckFixtures, self?: UserSession | Profile): Synthetic {
  const domain = (process.env.AISLE_TEST_EMAIL_DOMAIN || 'example.test').toLowerCase();
  const gender = self && isProfile(self) ? self.gender : undefined;
  return {
    firstName: fx.data.firstName(),
    email: `${fx.data.userId('email').replace(/[^a-z0-9-]/g, '')}@${domain}`,
    freeText: `FT_${fx.m2Config.runId} synthetic text`,
    ...(self ? { mobileNumber: self.mobileNumber } : {}),
    ...(gender ? { gender } : {}),
  };
}

/** A 17-digit chat time token (epoch milliseconds × 10 000), built as a string — it exceeds JS's safe integers. */
export const timeToken = (now = Date.now()) => `${now}0000`;

/** A public user name for POST /V1/users/user_name: ^[a-zA-Z0-9._-]{3,20}$, unique per use (qa_m2_<6 hex>). */
export const publicUserName = () => `qa_m2_${randomBytes(3).toString('hex')}`;

/**
 * Fill the placeholders `api` still needs (user decision 2026-10-24, sources in M2Q-36's answer):
 * catalogue ids (catalogue.ts), OTHER_* (a second suite account), generated values (public user name, chat time
 * tokens), the caller's own photos / audio, and ids the suite's own accounts create (conversation, invite). A value
 * that cannot be provided stays empty, so buildRequest blocks with its question — never guessed.
 */
export async function completeValues(
  api: InventoryApi,
  fx: CheckFixtures,
  session: UserSession | Profile | undefined,
  values: Values,
): Promise<Values> {
  const out: Values = { ...values };
  const need = placeholdersIn(api).filter((n) => out[n] === undefined);
  if (!need.length) return out;
  const self = session && isProfile(session) ? session : undefined;
  const callerAuth = session
    ? { auth: AUTH.user(session.token), device: session.device }
    : { auth: AUTH.none as AuthMode };
  let photosTried = false;
  for (const name of need) {
    if (out[name] !== undefined) continue;
    if (name in fx.m2Config.defaultValues || name in fx.m2Config.values) {
      out[name] = await catalogueValue(name, fx.m2Config, fx.m2, callerAuth);
      continue;
    }
    switch (name) {
      case 'OTHER_REF':
      case 'OTHER_USER_ID': {
        const other = await fx.accounts.otherFor(session);
        if (other.ref) out.OTHER_REF ??= other.ref;
        if (other.userId) out.OTHER_USER_ID ??= other.userId;
        break;
      }
      case 'PUBLIC_USER_NAME':
        out[name] = publicUserName();
        break;
      case 'MESSAGE_TIME_TOKEN':
      case 'ACTION_TIME_TOKEN':
        // Chat routes send to a CONNECTED member: make sure the suite pair is connected first (blocks if it cannot be).
        if (name === 'MESSAGE_TIME_TOKEN' && fx.accounts.canCreate && session) await fx.accounts.suitePair();
        out[name] = timeToken();
        break;
      case 'PHOTO_URL_1':
      case 'PHOTO_URL_2':
      case 'PHOTO_ID_1':
      case 'PHOTO_ID_2': {
        if (!self || photosTried) break;
        photosTried = true;
        if (need.includes('PHOTO_ID_1') || need.includes('PHOTO_ID_2')) {
          // Edit routes: the caller's OWN photos (submit_profile copies photos to new URLs, so the hosted URL
          // would not match the photo_id).
          const own = await fx.accounts.ownPhotos(self);
          if (own) {
            out.PHOTO_URL_1 = own[0]!.url;
            out.PHOTO_ID_1 = own[0]!.id;
            out.PHOTO_URL_2 = own[1]!.url;
            out.PHOTO_ID_2 = own[1]!.id;
          }
        } else if (self.gender) {
          // Submit routes: the hosted photo set of the caller's own gender (moderation compares faces and gender).
          const set = fx.m2Config.onboardingPhotos[self.gender];
          out.PHOTO_URL_1 = set[0];
          out.PHOTO_URL_2 = set[1];
        }
        break;
      }
      case 'AUDIO_URL':
        if (self) {
          const url = await fx.accounts.audioUrl(self);
          if (url) out[name] = url;
        }
        break;
      case 'CONVERSATION_ID': {
        if (!fx.accounts.canCreate || !session) break;
        const pair = await fx.accounts.suitePair();
        if ([pair.a, pair.b].some((p) => p.mobileNumber === session.mobileNumber))
          out[name] = pair.conversationId;
        break;
      }
      case 'REQUEST_ID':
        // A dedicated, approved invite sender of the opposite gender (Accounts.requestId); the caller receives.
        if (self) out[name] = await fx.accounts.requestId(self);
        break;
      default:
        break;
    }
  }
  return out;
}

const ADMIN_AUTH = ['ADMIN_TOKEN', 'webcms', 'ADMIN_SESSION_COOKIE'];

/**
 * Routes that delete, reset, deactivate or report an account. They are only ever sent for a THROWAWAY account the
 * suite created and onboarded for that API (Accounts.throwaway) — never for Dev-provided or pooled accounts.
 * Moderation reports (API-098 / API-135) stay Blocked (QA lead decision 2026-10-24, M2Q-45).
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
 * Paused by the QA lead (2026-10-24) until Dev confirms M2Q-46: delete_older_account / delete_current_account act on
 * the profile named by `ref` (user.rb:696-723, from code) — a missing ref fell back to an arbitrary staging member.
 * The design gives their cases the M2Q-46 dependency; this runtime guard also covers any other caller.
 */
export const PAUSED = PAUSED_APIS;

/**
 * Routes that consume their throwaway account on success (delete / reset). PARAM and BODY variants each take the
 * API's throwaway again (a fresh one once the previous was consumed), so later variants do not only hit 401.
 */
export const FRESH_PER_VARIANT = ['API-059', 'API-131', 'API-198'];

/** Profile (re-)submission routes: a throwaway account per API, so pooled accounts never change gender / photos. */
export const SUBMIT_PROFILE = ['API-057', 'API-061', 'API-129'];
/** Settable once per account (public user name): a throwaway account per test case. */
export const ONCE_PER_ACCOUNT = ['API-042'];
/** Kept Blocked by the QA lead (2026-10-24): selfie verification and moderation reports (M2Q-45). */
export const KEPT_BLOCKED = ['API-031', 'API-098', 'API-135'];

/** The user account that calls `api` in role A (or B), by the state the route needs (m2-code-evidence.ts). */
async function userFor(
  api: InventoryApi,
  fx: CheckFixtures,
  role: 'A' | 'B',
): Promise<UserSession | Profile> {
  const state = suiteStateFor(api.id);
  const key = role === 'A' ? api.id : `${api.id}:B`;
  if (DESTRUCTIVE.includes(api.id)) {
    // Deactivating routes re-activate and re-use their throwaway; it must be approved first (APPROVED_FIRST, item 4).
    const reactivate = DEACTIVATING.includes(api.id);
    const p = await fx.accounts.throwaway(key, { reactivate });
    return state === 'approved' || APPROVED_FIRST[api.id] ? fx.accounts.waitApproved(p, key) : p;
  }
  // Invite sending (item 4): an approved caller with daily requests left (its receiver: inviteReceiver below).
  if (api.id === 'API-004') return fx.accounts.approvedWithRequestsLeft(role === 'A' ? [0, 2] : [2, 0]);
  // One shared deactivation throwaway per role (pre-onboarded by warmUp so its approval clock starts early).
  if (state === 'deactivated')
    return fx.accounts.deactivated(role === 'A' ? DEACTIVATION_KEY : `${DEACTIVATION_KEY}:B`);
  if (ONCE_PER_ACCOUNT.includes(api.id)) return fx.accounts.throwaway(`${key}:${test.info().testId}`);
  if (SUBMIT_PROFILE.includes(api.id)) return fx.accounts.throwaway(key);
  if (NEW_USER_OK.includes(api.id)) return fx.accounts.newUser(role);
  // Approved-state routes: account 0 (A) or 2 (B) — both male, the gender staging was seen to auto-approve.
  if (state === 'approved') return fx.accounts.approved(role === 'A' ? 0 : 2);
  return fx.accounts.onboarded(role === 'A' ? 0 : 1);
}

/** Per test case: the fresh invite receiver of API-004 and the fresh pre-login account of FRESH_ACCOUNT routes. */
const perTest = new Map<string, Promise<UserSession | Profile>>();
function memoPerTest<T extends UserSession | Profile>(key: string, make: () => Promise<T>): Promise<T> {
  const k = `${test.info().testId}:${key}`;
  let p = perTest.get(k);
  if (!p) {
    p = make();
    perTest.set(k, p);
    const pending = p;
    pending.catch(() => {
      if (perTest.get(k) === pending) perTest.delete(k);
    });
  }
  return p as Promise<T>;
}

const inviteReceiver = (fx: CheckFixtures, sender: Profile) =>
  memoPerTest(`invite-receiver:${sender.mobileNumber}`, () =>
    fx.accounts.partner(sender, 'invite receiver (API-004)'),
  );

const freshPerTest = (fx: CheckFixtures, role: string) =>
  memoPerTest(`fresh:${role}`, () => fx.accounts.freshUser());

/**
 * The account that calls `api` in role A (or B). New-user routes use a new account; routes that need a finished
 * profile use a suite-onboarded (or Dev-provided) account; destructive / submit routes a throwaway account;
 * approved / deactivated routes an account in that state (made by the suite). CMS, web, INFOEDGE and callbacks block
 * with their question. Every placeholder the request needs is filled here (completeValues).
 */
export async function callerFor(
  api: InventoryApi,
  fx: CheckFixtures,
  role: 'A' | 'B' = 'A',
): Promise<Caller> {
  if (api.auth.some((a) => ADMIN_AUTH.includes(a))) return fx.accounts.admin();
  if (api.auth.includes('INFOEDGE_PROFILE_API_TOKEN'))
    return blockPrereq(PREREQ.infoedge.id, PREREQ.infoedge.reason);
  if (isWebRoute(api)) return fx.accounts.web(); // true web JWT (payment routes only)
  if (KEPT_BLOCKED.includes(api.id)) blockPrereq(PREREQ.devOnly.id, `${api.id}: ${PREREQ.devOnly.reason}`);
  if (PAUSED.includes(api.id)) blockPrereq(PREREQ.paused.id, `${api.id}: ${PREREQ.paused.reason}`);
  if (suiteStateFor(api.id) === 'image_inappropriate')
    blockPrereq(
      PREREQ.states.id,
      `${api.id} needs an image_inappropriate profile (from code: ${ROUTE_STATE[api.id]!.ref})`,
    );
  if (api.auth.includes('USER_TOKEN')) {
    const s = await userFor(api, fx, role);
    // Invite sending (item 4): the receiver is a fresh approved account of the opposite gender with no invite, like or
    // connection with the caller — one per test case, so its valid request really creates an invite.
    const receiver =
      api.id === 'API-004' && role === 'A' && isProfile(s) ? await inviteReceiver(fx, s) : undefined;
    return {
      label: `user ${role}`,
      auth: AUTH.user(s.token),
      device: s.device,
      session: s,
      values: await completeValues(api, fx, s, valuesFor(fx.m2Config, s, receiver)),
    };
  }
  if (api.auth.includes('TEST_TOKEN')) {
    const auth = AUTH.testToken(requireTestToken(fx.m2Config));
    if (groupOf(api.id).key === 'G1') {
      // A valid request names EXISTING app users: the write route only works for them (M2Q-40, from code), and a
      // contract recording should show a real reply, not the error / empty reply for a made-up id.
      const p = await fx.accounts.onboarded(role === 'A' ? 0 : 1);
      const other = await fx.accounts.onboarded(role === 'A' ? 1 : 0);
      return {
        label: 'TEST_TOKEN',
        auth,
        session: p,
        values: await completeValues(api, fx, p, {
          ...valuesFor(fx.m2Config, p, other),
          USER_ID: p.userId,
        }),
      };
    }
    const p = await fx.accounts.onboarded(role === 'A' ? 0 : 1);
    // The profile the request is about travels with the caller (IDOR / "unchanged" checks read it).
    return {
      label: 'TEST_TOKEN',
      auth,
      session: p,
      values: await completeValues(api, fx, p, valuesFor(fx.m2Config, p)),
    };
  }
  if (groupOf(api.id).key === 'G9') return blockPrereq(PREREQ.provider.id, PREREQ.provider.reason);
  // Pre-login routes (no credential): a new account's number / user id — a brand-new one per case for the login
  // response route (FRESH_ACCOUNT, item 4: the is_new_user flow on an account never reset or reused).
  const s = FRESH_ACCOUNT.includes(api.id) ? await freshPerTest(fx, role) : await fx.accounts.newUser(role);
  return {
    label: 'no credential (pre-login)',
    auth: AUTH.none,
    device: s.device,
    session: s,
    values: await completeValues(api, fx, s, valuesFor(fx.m2Config, s)),
  };
}

/**
 * Refuse (before sending) any id-like value that does not belong to the suite, a missing / blank target, phone or
 * login-OTP key of the Dev request, and any phone value that is not a synthetic test number (safety.ts).
 */
function assertSafe(
  api: InventoryApi,
  fx: CheckFixtures,
  values: Values,
  req: {
    body?: unknown;
    query?: Record<string, string> | undefined;
    pathParams?: Record<string, string>;
    rawBody?: boolean;
  },
): void {
  const catalogue = new Set<string>(Object.values(fx.m2Config.defaultValues));
  for (const [k, v] of Object.entries(values))
    if (v !== undefined && !IDENTITY_PLACEHOLDERS.includes(k)) catalogue.add(String(v));
  const phoneCodeId = values.PHONE_CODE_ID ?? fx.m2Config.defaultValues.PHONE_CODE_ID;
  const input = { apiId: api.id, ...req, phoneCodeId };
  const where = [...missingProtectedIn(api, input), ...unsafeIdsIn(input, fx.accounts.suiteIds(), catalogue)];
  if (where.length) throw new UnsafeRequestError(api.id, where, UNSAFE_QUESTION);
}

/**
 * Put an account's first name back after a case that sent invalid / oversized names to it (fix 2026-10-25): a write
 * the app refused can still have reached the PII service (staging 2026-10-24/25: 256 characters → HTTP 500 while the
 * PII name changed), which left the shared onboarded account with app name ≠ PII name and failed later cases. The G1
 * test write route POST /V1/pii_integration/first_name (TEST_TOKEN) writes the PII service AND the app profile (M2Q-35
 * answer, from code — confirm with Dev), so both stores hold `name` again. Never fails the case: the outcome is noted.
 */
export async function restoreFirstName(
  fx: CheckFixtures,
  account: { userId?: string | undefined } | undefined,
  name: unknown,
): Promise<void> {
  const note = (description: string) => test.info().annotations.push({ type: 'observed', description });
  if (!account?.userId || typeof name !== 'string' || !name.trim() || !fx.m2Config.testToken) {
    note('First-name restore skipped (no user id, no previous name or no TEST_TOKEN).');
    return;
  }
  const res = await fx.m2.call('API-002', {
    auth: AUTH.testToken(requireTestToken(fx.m2Config)),
    body: { user_id: account.userId, first_name: name },
    retry: false,
  });
  fx.observe('restore the previous first name (API-002)', res);
}

/**
 * Login routes answer with a fresh auth_token that is not registered as a secret yet, so they are sent through the
 * session helper's NON-recording client (only status and key names are kept, via observe()).
 */
export const TOKEN_REPLY_APIS = ['API-060', 'API-062'];

/** Send `api` as `caller` with its Dev request (placeholders filled, synthetic PII). Never sends unsafe ids. */
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
  const merged = { ...caller.values, ...extra.values };
  const values = overridden ? merged : await completeValues(api, fx, caller.session, merged);
  const req = buildRequest(overridden ? { ...api, curl: [] } : api, values, {
    ...syntheticFor(fx, caller.session),
    ...extra.synthetic,
  });
  const { values: _v, synthetic: _s, noDevBody, ...rest } = extra;
  if (noDevBody) delete req.body;
  const body = rest.body !== undefined ? rest.body : req.body;
  const query = rest.query ?? req.query;
  const pathParams = rest.pathParams ?? req.pathParams;
  assertSafe(api, fx, values, {
    body: rest.rawBody ? undefined : body,
    query,
    pathParams,
    rawBody: rest.rawBody !== undefined,
  });
  const addition = BODY_ADDITIONS[api.id];
  if (addition && !overridden && !noDevBody)
    test.info().annotations.push({ type: 'assumption', description: `${api.id}: ${addition.evidence}` });
  const client = TOKEN_REPLY_APIS.includes(api.id) ? fx.accounts.sessions.client : fx.m2;
  const res = await client.call(api.id, {
    auth: caller.auth,
    ...(caller.device ? { device: caller.device } : {}),
    ...rest,
    ...(body !== undefined ? { body } : {}),
    ...(query ? { query } : {}),
    pathParams,
  });
  // A deleting route that succeeded for a suite account: record the deletion from this reply (never by logging in
  // again — a login to a deleted number creates a new account).
  if (DELETING_APIS.includes(api.id) && caller.session && res.status >= 200 && res.status < 300)
    await fx.accounts.recordDeletedBy(caller.session, api.id, res.status);
  // A successful reset consumes the throwaway (a reset account answers 406 to the next reset): fresh one next time.
  if (RESETTING_APIS.includes(api.id) && caller.session && res.status >= 200 && res.status < 300)
    fx.accounts.markConsumed(caller.session, api.id, res.status);
  return res;
}
