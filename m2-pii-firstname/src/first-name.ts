/**
 * Building blocks of the first-name white-box cases (m2fn-firstname-cases.data.ts). Everything works on the suite’s
 * own synthetic accounts only (+91 10…, never the 106 series):
 *
 *  - divergent(): D — Aisle-DB name X (its onboarding name), PII name Y written with the test aid
 *    POST /V1/pii_integration/profile_first_name_source {ref, first_name} (TEST_TOKEN; PII only, clears the profile
 *    cache — pii_integration_controller.rb, develop_new bd85044, from code).
 *  - noPii(): N — a throwaway account after POST /V1/user/reset_profile (DB name copied, no PII name; user.rb:618-635).
 *  - approveOwn() / verifySelfieOwn(): CMS admin writes on a SUITE-CREATED account only (M2FNQ-07 / M2FNQ-06 answers,
 *    QA lead 2026-11-11). approve_and_edit also sets gender / date of birth and runs update_phone_number with the
 *    posted phone (admin_user.rb:100-127, user.rb:463-478), so the account’s OWN values are echoed — the phone update
 *    is then a no-op (same phone_number_id) and nothing else changes.
 *  - facadeWriteName(): the M1 facade write POST /V1/api/v1/pii-test {user_id, field: NAME, value} on a suite account
 *    (M2FNQ-24 answer) — a PII change that Aisle’s caches do not hear about.
 *
 * Assertion messages never print a name; names travel only in recorded exchanges (synthetic data).
 */
import { expect, test } from '@playwright/test';
import type { ApiResponse } from '../../core/http/api-response';
import type { Profile } from '../../m2/src/accounts/accounts';
import { ownState } from '../../m2/src/accounts/onboarding';
import { AUTH } from '../../m2/src/auth/credentials';
import type { UserSession } from '../../m2/src/auth/session';
import type { AppDb } from '../../m2/src/db/app-db';
import { isAllowedTestNumber } from '../../m2/src/auth/test-phone';
import { valuesFor, type Caller } from '../../m2/src/checks/context';
import type { AuthMode, ExtraRoute } from '../../m2/src/clients/m2-client';
import { requireTestToken } from '../../m2/src/config/m2-config';
import { blockPrereq, PREREQ } from '../../m2/src/prereq';
import { asTestToken, asUser, call, deepFind, refOf } from '../../m2/src/scenarios/helpers';
import type { Fx } from './define';
import { bodyOf, piiFirstNameKey, profileKey, redisCall } from './redis-keys';

export const DOB = '1996-01-15'; // onboarding date_of_birth_v1 15/01/1996 (m2/src/accounts/onboarding.ts)

export const ROUTES = {
  facadeWrite: { key: 'FN-AIS-105', method: 'POST', path: '/V1/api/v1/pii-test', headers: [] },
  fetchSettings: {
    key: 'FN-AIS-066',
    method: 'GET',
    path: '/V1/users/fetch_settings',
    headers: ['device_type', 'app_version', 'unique_identifier'],
  },
} satisfies Record<string, ExtraRoute>;

// ---- Names ------------------------------------------------------------------------------------------------
const toLetters = (n: number) => {
  let s = '';
  do {
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26);
  } while (n > 0);
  return s;
};
let counter = 0;

/**
 * A run-unique fake first name, letters only (so the app’s clean-up keeps it unchanged), starting with `first`.
 * Onboarding names start with "Qa", so the default "Zy…" always differs in its first letter.
 */
export function uniqueName(fx: Pick<Fx, 'm2Config'>, first = 'Zy'): string {
  const tail = fx.m2Config.runId.replace(/[^a-z0-9]/gi, '').slice(-6);
  const letters = tail.replace(/\d/g, (d) => String.fromCharCode(97 + Number(d)));
  counter += 1;
  return `${first}${letters}${toLetters(Date.now() % 100_000)}${toLetters(counter)}`.replace(
    /[^A-Za-z]/g,
    '',
  );
}

// ---- PII reads / writes -------------------------------------------------------------------------------------
/** GET /V1/pii_integration/first_name (TEST_TOKEN): the PII name (fills the PII field cache). */
export async function piiRead(fx: Fx, userId: string): Promise<{ status: number; name: string | null }> {
  const res = await call(fx, 'API-001', asTestToken(fx), { query: { user_id: userId } });
  const v = (res.json() as { first_name?: unknown } | undefined)?.first_name;
  return { status: res.status, name: typeof v === 'string' ? v : null };
}

/** The test aid: PII-only write (with `name`) or a read-only source report (without). */
export async function profileSource(
  fx: Fx,
  ref: string,
  name?: string,
): Promise<{ res: ApiResponse; body: Record<string, unknown> }> {
  const res = await call(fx, 'API-208', asTestToken(fx), {
    body: name === undefined ? { ref } : { ref, first_name: name },
  });
  return { res, body: bodyOf(res) };
}

/** M1 facade write of NAME for a suite account (M2FNQ-24 answer). */
export async function facadeWriteName(fx: Fx, userId: string, value: string): Promise<ApiResponse> {
  if (!fx.accounts.ownDbIds().userIds.has(userId))
    throw new Error('Facade write refused: not a suite-created account');
  const res = await fx.m2.callRoute(ROUTES.facadeWrite, {
    auth: AUTH.testToken(requireTestToken(fx.m2Config)),
    body: { user_id: userId, field: 'NAME', value },
    retry: false,
  });
  fx.observe('FN-AIS-105 M1 facade NAME write', res);
  // M1 observed 201 on /api/v1/pii-test; through the app’s /V1 prefix staging answered 200 (2026-11-11).
  expect(res.status >= 200 && res.status < 300, `M1 facade NAME write: HTTP ${res.status}`).toBe(true);
  return res;
}

export function userIdOf(p: { userId?: string | undefined }): string {
  if (!p.userId || !/^\d+$/.test(p.userId)) blockPrereq(PREREQ.piiUserId.id, PREREQ.piiUserId.reason);
  return p.userId;
}

export function refFor(p: { ref?: string | undefined }): string {
  if (!p.ref) blockPrereq(PREREQ.onboarding.id, 'The synthetic account has no profile ref');
  return p.ref;
}

// ---- Fixtures D and N -----------------------------------------------------------------------------------------
export interface Divergent {
  p: Profile;
  /** Aisle-DB name (the onboarding name). */
  x: string;
  /** PII name. */
  y: string;
}

/** D: a throwaway account (key) with Aisle-DB name X and PII name Y. */
export async function divergent(fx: Fx, key: string): Promise<Divergent> {
  const p = await fx.accounts.throwaway(key);
  const ref = refFor(p);
  userIdOf(p);
  const before = await profileSource(fx, ref);
  expect(before.res.status, `profile_first_name_source (read): HTTP ${before.res.status}`).toBe(200);
  const x = before.body.db_first_name_before;
  if (typeof x !== 'string' || !x)
    blockPrereq(PREREQ.onboarding.id, 'The synthetic account has no Aisle-DB first name');
  const y = uniqueName(fx, x.startsWith('Z') ? 'Wv' : 'Zy');
  const w = await profileSource(fx, ref, y);
  expect(w.res.status, `profile_first_name_source (PII-only write): HTTP ${w.res.status}`).toBe(200);
  expect(w.body.pii_only_write_performed === true, 'the test aid wrote the PII value').toBe(true);
  expect(w.body.pii_first_name === y, 'PII now holds Y').toBe(true);
  expect(w.body.db_first_name_after === x, 'the Aisle DB still holds X').toBe(true);
  return { p, x, y };
}

/** N: a throwaway account after reset_profile (new user id, Aisle-DB name copied, no PII name). */
export async function noPii(
  fx: Fx,
  key: string,
): Promise<{ n: Profile; x: string | undefined; reset: ApiResponse }> {
  const p = await fx.accounts.throwaway(key);
  const reset = await call(fx, 'API-198', asUser(fx, p, undefined, 'owner'));
  if (reset.status < 200 || reset.status >= 300)
    blockPrereq(PREREQ.onboarding.id, `reset_profile did not succeed (HTTP ${reset.status})`);
  const s = await fx.accounts.returningLogin(p);
  const ref = (await refOf(fx, s)) ?? s.ref;
  const n: Profile = { ...s, ref, gender: p.gender ?? 'Male', known: p.known };
  if (!n.userId || n.userId === p.userId)
    blockPrereq(PREREQ.onboarding.id, 'reset_profile did not give the account a new user id');
  return { n, x: p.known?.firstName, reset };
}

// ---- CMS -----------------------------------------------------------------------------------------------------
export async function adminCaller(
  fx: Fx,
  about?: Profile,
  who: 'admin' | 'associate' = 'admin',
): Promise<Caller> {
  const auth: AuthMode = who === 'admin' ? await fx.cms.admin() : await fx.cms.associate();
  return {
    label: who === 'admin' ? 'CMS admin' : 'CMS associate',
    auth,
    values: valuesFor(fx.m2Config, about),
  };
}

/** Refuse a CMS write on anything that is not a suite-created synthetic account. */
export function requireOwnAccount(fx: Fx, p: UserSession | Profile): void {
  if (!p.userId || !fx.accounts.ownDbIds().userIds.has(p.userId) || !isAllowedTestNumber(p.mobileNumber))
    throw new Error('CMS write refused: not a suite-created synthetic account');
}

/** The admin profile-edit body with the account’s OWN values (only `firstName` may differ). */
export function adminEditBody(fx: Fx, p: Profile, firstName: string): Record<string, unknown> {
  return {
    ref: refFor(p),
    first_name: firstName,
    gender: p.gender ?? 'Male',
    date_of_birth: DOB,
    phone_code_id: fx.m2Config.defaultValues.PHONE_CODE_ID,
    fetch_only_number: p.mobileNumber,
    about: '',
  };
}

/** Approve a suite-created account through POST /admin/approve_and_edit (M2FNQ-07 answer). Returns the state. */
export async function approveOwn(fx: Fx, p: Profile): Promise<Profile> {
  requireOwnAccount(fx, p);
  const st = await ownState(fx.accounts.sessions, p);
  if (st.profileState === 'approved') return p;
  const current = (await piiRead(fx, userIdOf(p))).name ?? p.known?.firstName;
  if (!current) blockPrereq(PREREQ.approval.id, 'No current first name known for the approval request');
  const res = await call(fx, 'API-139', await adminCaller(fx, p), { body: adminEditBody(fx, p, current) });
  expect(res.status, `approve_and_edit: HTTP ${res.status}`).toBe(200);
  for (let i = 0; i < 6; i++) {
    const now = await ownState(fx.accounts.sessions, p);
    if (now.profileState === 'approved') return p;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return blockPrereq(PREREQ.approval.id, 'approve_and_edit answered but the profile is not approved');
}

/** Approve the suite’s onboarded account i (pooled) through the CMS. */
export async function approvedPooled(fx: Fx, i: number): Promise<Profile> {
  const p = await fx.accounts.onboarded(i);
  if (!fx.accounts.isOwnOnboarded(i)) return fx.accounts.approved(i);
  await approveOwn(fx, p);
  return fx.accounts.approved(i);
}

/** Mark a suite-created account selfie-verified (M2FNQ-06 answer); blocks when the toggle stays inactive. */
export async function hideNameOwn(fx: Fx, p: Profile, hidden = true): Promise<ApiResponse> {
  requireOwnAccount(fx, p);
  if (hidden) {
    const v = await call(fx, 'API-155', await adminCaller(fx, p), { body: { ref: refFor(p) } });
    if (v.status !== 200)
      blockPrereq(
        'M2FNQ-06',
        `mark_selfie_verified answered HTTP ${v.status}: the account has no selfie record to verify (verification.rb:141-146, from code)`,
      );
  }
  if ((await hideState(fx, p)) === hidden) return call(fx, 'API-021', asUser(fx, p, undefined, 'owner'));
  const t = await call(fx, 'API-032', asUser(fx, p, undefined, 'owner'));
  expect(t.status, `toggle_hide_name: HTTP ${t.status}`).toBe(200);
  if ((await hideState(fx, p)) !== hidden)
    blockPrereq(
      'M2FNQ-06',
      'toggle_hide_name did not change hide_first_name: the selfie is not verified (no selfie record to verify — verification.rb:141-146, from code)',
    );
  return t;
}

export async function hideState(fx: Fx, p: Profile): Promise<boolean | undefined> {
  const own = await call(fx, 'API-021', asUser(fx, p, undefined, 'owner'));
  const h = deepFind(own.json(), 'hide_first_name');
  return typeof h === 'boolean' ? h : undefined;
}

// ---- Redis ---------------------------------------------------------------------------------------------------
export async function clearPiiKey(fx: Fx, userId: string): Promise<void> {
  const admin = await fx.cms.admin();
  const del = await redisCall(fx, 'delete', admin, piiFirstNameKey(userId), fx.scope(), {
    label: 'clear PII key',
  });
  expect(del.status, `DELETE the PII field cache key: HTTP ${del.status}`).toBe(200);
}

export async function getKey(
  fx: Fx,
  key: string,
  label: string,
): Promise<{ status: number; value: unknown }> {
  const admin = await fx.cms.admin();
  const res = await redisCall(fx, 'get', admin, key, fx.scope(), { label });
  return { status: res.status, value: bodyOf(res).value };
}

/** The first_name inside the profile cache JSON of `ref` (undefined when absent / unreadable). */
export async function cachedProfileName(fx: Fx, ref: string): Promise<{ status: number; name: unknown }> {
  const { status, value } = await getKey(fx, profileKey(ref), 'profile cache');
  if (status !== 200 || typeof value !== 'string') return { status, name: undefined };
  try {
    const gi = (JSON.parse(value) as { general_information?: { first_name?: unknown } }).general_information;
    return { status, name: gi?.first_name };
  } catch {
    return { status, name: undefined };
  }
}

// ---- Views ---------------------------------------------------------------------------------------------------------
/** How `viewer` sees `target` through GET /V1/users/profile_info (another user’s view). */
export async function profileInfo(
  fx: Fx,
  viewer: UserSession | Profile,
  target: { ref?: string | undefined },
  extraQuery: Record<string, string> = {},
): Promise<{ res: ApiResponse; name: unknown }> {
  const res = await call(fx, 'API-011', asUser(fx, viewer, undefined, 'viewer'), {
    query: { ref: target.ref ?? '', ...extraQuery },
  });
  const user = (res.json() as { user?: Record<string, unknown> } | undefined)?.user;
  const gi = user?.general_information as Record<string, unknown> | undefined;
  return { res, name: gi?.first_name ?? user?.first_name };
}

/** D’s own first name through GET /V1/users/:ref. */
export async function ownName(fx: Fx, p: Profile): Promise<{ res: ApiResponse; name: unknown }> {
  const res = await call(fx, 'API-021', asUser(fx, p, undefined, 'owner'), { values: { REF: refFor(p) } });
  return { res, name: deepFind(res.json(), 'first_name') };
}

/** profiles.first_name of a suite account equals `name` (Aisle DB, read-only). */
export async function dbNameIs(fx: Fx, app: AppDb, userId: string, name: string): Promise<boolean> {
  const rows = await app.query<{ first_name_is_value: boolean }>(
    'm2fnProfileFirstNameIs',
    [[userId], name],
    fx.accounts.ownDbIds(),
  );
  return rows.length === 1 && rows[0]!.first_name_is_value === true;
}

export const initialOf = (name: string) => name.charAt(0).toUpperCase();

/**
 * Aisle-DB check of a case (read-only, suite accounts only): soft-asserts profiles.first_name = `name` when the app
 * DB is configured and reachable; otherwise the DB part is noted as not checked (the API parts still run).
 */
export async function expectDbName(
  fx: Fx,
  userId: string,
  name: string,
  what: string,
): Promise<boolean | undefined> {
  const db = fx.appDbWorker;
  if (!db || !(await db.reachable())) {
    test.info().annotations.push({
      type: 'assumption',
      description: `Aisle DB not configured / reachable here — “${what}” not checked (${PREREQ.db.id})`,
    });
    return undefined;
  }
  const ok = await dbNameIs(fx, db, userId, name);
  expect.soft(ok, what).toBe(true);
  return ok;
}

/** Record an observation (shown in the report) — for the parts a case records instead of asserting. */
export function record(text: string): void {
  test.info().annotations.push({ type: 'observed', description: text });
}

/** Find the entry (any depth) whose ref is `ref`. */
export function entryFor(body: unknown, ref: string): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object') return undefined;
  if (Array.isArray(body)) {
    for (const x of body) {
      const f = entryFor(x, ref);
      if (f) return f;
    }
    return undefined;
  }
  const o = body as Record<string, unknown>;
  const gi = o.general_information as Record<string, unknown> | undefined;
  if (String(o.ref ?? o.ref_id ?? gi?.ref_id ?? '') === ref) return o;
  for (const v of Object.values(o)) {
    const f = entryFor(v, ref);
    if (f) return f;
  }
  return undefined;
}

/**
 * Connect two approved suite accounts by a mutual like (POST /V1/like {ref} both ways) and return their
 * conversation id from A’s chat list (polled up to 60 s). Blocks (M2FNQ-07) when the connection does not appear.
 */
export async function connect(fx: Fx, a: Profile, b: Profile): Promise<string> {
  for (const [from, to] of [
    [a, b],
    [b, a],
  ] as const) {
    const res = await call(fx, 'API-046', asUser(fx, from, to, 'liker'), { body: { ref: refFor(to) } });
    record(`like ${from === a ? 'A → D' : 'D → A'}: HTTP ${res.status}`);
  }
  const start = Date.now();
  for (;;) {
    const list = await call(fx, 'API-063', asUser(fx, a, undefined, 'A'), {
      query: { page: '1', items_per_page: '10' },
    });
    const e = entryFor(list.json(), refFor(b));
    const id = e?.conversation_id ?? (e ? deepFind(e, 'conversation_id') : undefined);
    if (id !== undefined && id !== null && id !== '') {
      // A conversation between two suite accounts: an id the suite’s own accounts made (allowed in requests).
      fx.accounts.addOwnedId(String(id));
      return String(id);
    }
    if (Date.now() - start > 60_000)
      return blockPrereq(
        'M2FNQ-07',
        'The two approved accounts were liked both ways but no conversation was listed',
      );
    await new Promise((r) => setTimeout(r, 5_000));
  }
}

/** The first name of the entry whose ref (ref / ref_id / general_information.ref_id) is `ref`, anywhere in a body. */
export function nameOfRef(body: unknown, ref: string | undefined): unknown {
  if (!ref) return undefined;
  const e = entryFor(body, ref);
  if (!e) return undefined;
  const gi = e.general_information as Record<string, unknown> | undefined;
  return e.first_name ?? gi?.first_name ?? e.name;
}
