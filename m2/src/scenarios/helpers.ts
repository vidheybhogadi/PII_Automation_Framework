/**
 * Building blocks for the hand-written M2 scenario cases (m2/tests/scenarios, m2/tests/g1). Every call goes through
 * the inventory client with Dev's request shape and the run's synthetic values; anything the environment cannot
 * provide yet blocks the test with its question (prereq.ts).
 */
import { expect } from '@playwright/test';
import type { ApiResponse } from '../../../core/http/api-response';
import type { Profile } from '../accounts/accounts';
import { isSuccess } from '../assertions/pii.assertions';
import { AUTH } from '../auth/credentials';
import type { UserSession } from '../auth/session';
import { requireTestToken } from '../config/m2-config';
import {
  callerFor,
  completeValues,
  send,
  syntheticFor,
  valuesFor,
  type Caller,
  type CheckFixtures,
} from '../checks/context';
import { buildRequest } from '../checks/request-builder';
import { blockPrereq, PREREQ } from '../prereq';
import type { Synthetic, Values } from '../checks/request-builder';
import { apiById } from '../design';

export type Fx = CheckFixtures;

/** A user account as a caller (its own ids; OTHER_* from `other`). */
export function asUser(
  fx: Fx,
  self: UserSession | Profile,
  other?: UserSession | Profile,
  label = 'user',
): Caller {
  return {
    label,
    auth: AUTH.user(self.token),
    device: self.device,
    session: self,
    values: valuesFor(fx.m2Config, self, other),
  };
}

/** TEST_TOKEN as a caller (G1 routes). */
export const asTestToken = (fx: Fx, values: Values = {}): Caller => ({
  label: 'TEST_TOKEN',
  auth: AUTH.testToken(requireTestToken(fx.m2Config)),
  values: { ...valuesFor(fx.m2Config), ...values },
});

/** Call an inventory API with its Dev request shape. */
export async function call(
  fx: Fx,
  apiId: string,
  caller: Caller,
  extra: {
    values?: Values;
    synthetic?: Partial<Synthetic>;
    body?: unknown;
    query?: Record<string, string>;
    retry?: boolean;
  } = {},
): Promise<ApiResponse> {
  const res = await send(apiById(apiId), fx, caller, extra);
  fx.observe(`${apiId} ${caller.label}`, res);
  return res;
}

/** The default caller of an API (from its auth) — blocks when that account type is not available. */
export const defaultCaller = (fx: Fx, apiId: string, role: 'A' | 'B' = 'A') =>
  callerFor(apiById(apiId), fx, role);

export function expectOk(res: ApiResponse, what: string): void {
  expect(isSuccess(res.status), `${what}: ${res.summary()} — expected success`).toBe(true);
}

/** First value under `key` anywhere in a JSON body. */
export function deepFind(body: unknown, key: string): unknown {
  if (!body || typeof body !== 'object') return undefined;
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (k === key) return v;
    const inner = deepFind(v, key);
    if (inner !== undefined) return inner;
  }
  return undefined;
}

/** First name stored in the PII service for a user (G1 read route, TEST_TOKEN). */
export async function piiFirstName(fx: Fx, userId: string): Promise<unknown> {
  const res = await call(fx, 'API-001', asTestToken(fx), { query: { user_id: userId } });
  expect(res.status, `PII first-name read: ${res.summary()}`).toBe(200);
  return (res.json() as { first_name?: unknown } | undefined)?.first_name ?? null;
}

/** The owner's own profile (fetch_own_info). */
export async function ownProfile(fx: Fx, p: UserSession | Profile): Promise<ApiResponse> {
  const res = await call(fx, 'API-013', asUser(fx, p, undefined, 'owner'));
  expectOk(res, 'own profile');
  return res;
}

/** A profile viewed by ref (GET /V1/users/:ref). */
export async function profileByRef(
  fx: Fx,
  viewer: UserSession | Profile,
  target: Profile,
): Promise<ApiResponse> {
  const res = await call(fx, 'API-021', asUser(fx, viewer, target, 'viewer'), {
    values: { REF: target.ref },
  });
  expectOk(res, 'profile by ref');
  return res;
}

/** Edit the own first name through the app edit route (Dev cURL body, first_name = name). */
export async function editFirstName(
  fx: Fx,
  p: Profile,
  name: string,
  apiId = 'API-058',
): Promise<ApiResponse> {
  return call(fx, apiId, asUser(fx, p, undefined, 'owner'), { synthetic: { firstName: name } });
}

/** Onboard (submit_profile) with a given name / email — needs the onboarding catalogue (M2Q-36). */
export async function submitProfile(
  fx: Fx,
  p: UserSession | Profile,
  values: Partial<Synthetic>,
  apiId = 'API-057',
): Promise<ApiResponse> {
  return call(fx, apiId, asUser(fx, p, undefined, 'owner'), { synthetic: values });
}

export const nameOf = (res: ApiResponse) => deepFind(res.json(), 'first_name');
export const emailOf = (res: ApiResponse) =>
  deepFind(res.json(), 'email') ?? deepFind(res.json(), 'personal_email');
export const phoneOf = (res: ApiResponse) =>
  deepFind(res.json(), 'phone_number') ?? deepFind(res.json(), 'mobile_number');

/** Synthetic email on the approved non-deliverable test domain. */
export const testEmail = (fx: Fx, label: string) =>
  `${fx.data.userId(label).replace(/[^a-z0-9-]/g, '')}@${(process.env.AISLE_TEST_EMAIL_DOMAIN || 'example.test').toLowerCase()}`;

/**
 * Dev's request body for an API as `caller`, ready to mutate. Placeholders are filled like every other request
 * (completeValues: catalogue values, the caller's own photos / audio, suite-made ids); blocks when one has no value.
 */
export async function devBody(
  fx: Fx,
  apiId: string,
  caller: Caller,
  synthetic: Partial<Synthetic> = {},
): Promise<Record<string, unknown>> {
  const api = apiById(apiId);
  const values = await completeValues(api, fx, caller.session, caller.values);
  const req = buildRequest(api, values, {
    ...syntheticFor(fx, caller.session),
    ...synthetic,
  });
  return (req.body ?? {}) as Record<string, unknown>;
}

/** Set `key` wherever it occurs in a body (deep) — e.g. general_information.first_name. */
export function setDeep(body: unknown, key: string, value: unknown): void {
  if (!body || typeof body !== 'object') return;
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (k === key) (body as Record<string, unknown>)[k] = value;
    else setDeep(v, key, value);
  }
}

/** Delete `key` wherever it occurs in a body (deep). */
export function deleteDeep(body: unknown, key: string): void {
  if (!body || typeof body !== 'object') return;
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (k === key) delete (body as Record<string, unknown>)[k];
    else deleteDeep(v, key);
  }
}

/** Ref of a profile as returned by its own-profile read (fallback when the account carries none). */
export async function refOf(fx: Fx, p: UserSession | Profile): Promise<string | undefined> {
  if ('ref' in p && p.ref) return p.ref;
  const r = deepFind((await ownProfile(fx, p)).json(), 'ref');
  return r === undefined || r === null ? undefined : String(r);
}

/** Destructive cases (reset / delete) run only on accounts the suite created AND onboarded itself. */
export function requireOwnOnboardedAccount(): never {
  return blockPrereq(
    PREREQ.onboarding.id,
    'Needs an account the suite created and onboarded itself (Dev-provided accounts are never reset or deleted) — onboarding is not possible yet',
  );
}

/** Text that reveals internals in an error body (stack traces, framework classes, file paths). */
export const INTERNALS =
  /\.rb:\d+|backtrace|ActiveRecord|NoMethodError|NameError|\/app\/|Traceback|Exception:/;

/** The first name of the profile whose `ref` equals `ref`, anywhere in a body (first_name or general_information). */
export function nameForRef(body: unknown, ref: string | undefined): unknown {
  if (!ref || !body || typeof body !== 'object') return undefined;
  const o = body as Record<string, unknown>;
  if (String(o.ref ?? '') === ref) {
    const gi = o.general_information as Record<string, unknown> | undefined;
    if (o.first_name !== undefined) return o.first_name;
    if (gi?.first_name !== undefined) return gi.first_name;
  }
  for (const v of Object.values(o)) {
    const found = nameForRef(v, ref);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * How ANOTHER user sees a profile: GET /V1/users/profile_info?ref=<target>. (GET /V1/users/:ref is the caller's OWN
 * profile — users#show → current_profile.get_specific_user ignores :ref; app/controllers/v1/users_controller.rb:113-120,
 * app/models/profile.rb:2046-2067, develop_new 944f76a.) Returns the requested profile's first name
 * (user.general_information.first_name), or undefined when the reply does not carry it.
 */
export async function otherUsersView(
  fx: Fx,
  viewer: UserSession | Profile,
  target: Profile,
): Promise<unknown> {
  const res = await call(fx, 'API-011', asUser(fx, viewer, target, 'viewer'), {
    query: { ref: target.ref ?? '' },
  });
  expectOk(res, 'profile_info (another user’s view)');
  // profile_info answers {user: <the requested profile>, …}; its own name, not a nested profile's.
  const user = (res.json() as { user?: Record<string, unknown> } | undefined)?.user;
  const gi = user?.general_information as Record<string, unknown> | undefined;
  return gi?.first_name ?? user?.first_name ?? nameForRef(res.json(), target.ref);
}
