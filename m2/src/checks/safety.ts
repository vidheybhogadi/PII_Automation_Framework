/**
 * Request safety for M2 (incident 2026-10-24, M2Q-42 evidence): a BODY "wrong type" variant once turned the string
 * user_id of POST /V1/sessions/fetch_login_response into the number 12345 — a user that is NOT a suite account — and
 * is_new_user into a truthy string. Two rules make that impossible:
 *
 * 1. wrongTypeValue(): a wrong-type value for an id-like key can never be cast to another record's id
 *    (string → an object, number → a non-numeric string); a `false` flag becomes null (still falsy in Ruby).
 * 2. unsafeIdsIn(): checked by send() before EVERY request. A value under an id-like key must be a suite-owned id
 *    (or, for catalogue ids, a configured value), a run-prefixed made-up value ("qa…", never castable to a number),
 *    null or empty. Anything else is refused BEFORE it is sent (the test fails with value-free locations).
 *
 * Incident 2026-10-24 (M2Q-46): a MISSING target has no value, so rule 2 never saw it. In the Aisle code
 * (origin/develop_new) `Profile.by_ref` is `where(...) if ref.present?` (app/models/profile.rb:128), so a missing /
 * blank ref matches every profile and `get_profile_by_ref(nil)` returns `Profile.not_deleted.first`
 * (profile.rb:855-856) — an arbitrary staging member. PARAM "without ref" variants liked / passed / messaged that
 * member, read its profile (API-011, API-119) and, on API-196 / API-197, may have deleted it or returned its login.
 * The BODY wrong-type swap of API-060 also sent mobile_number 12345 (not a synthetic number). Three more rules:
 *
 * 3. variantSafety(): a PARAM / BODY variant never removes or blanks a TARGET key (one that names another member —
 *    ref, refs, *_ref(s), receiver_profile, user_id(s), *_user_id(s), or any key whose Dev value is $REF / $OTHER_REF /
 *    $USER_ID / $OTHER_USER_ID), a phone key, phone_code_id, or the OTP of a login route. Such a variant is NOT SENT
 *    and recorded as Blocked (M2Q-46). A run-prefixed unknown value ("qa…") stays allowed: a present ref filters to
 *    no profile (profile.rb:128, 855). A wrong-type `ref` stays an object (by_ref calls ref.upcase → error, no lookup;
 *    observed 500); every other target key's wrong-type variant is not sent.
 * 4. missingProtectedIn(): checked by send() before EVERY request — a target / phone / login-OTP key of the Dev request
 *    that is missing, null or blank in the outgoing request is refused (fail closed, covers scenarios too).
 *    Exception (2026-10-24, BLANK_REFUSED_READS): the TEST_TOKEN READ routes of /V1/pii_integration reject a blank
 *    user_id / user_ids / refs with 400 "Missing required parameter" BEFORE any lookup (required_param /
 *    array_param raise on value.blank?, pii_integration_controller.rb:6, 21, 61, 134-147, develop_new 944f76a — from
 *    code, confirm with Dev), and they only read. Only these keys of only these routes may be blank; every write
 *    route (incl. API-002) stays fail-closed.
 * 5. unsafeIdsIn() also checks phone keys: only an allowed synthetic number (10xxxxxxxx, never 106; isAllowedTestNumber,
 *    with or without +91) or a non-numeric "qa…" value; phone_code_id only the configured India id or "qa…".
 */
import { isAllowedTestNumber } from '../auth/test-phone';

/** Keys that name a record: id, ids, ref, refs, *_id(s), *_ref(s), receiver_profile. */
export const ID_KEY = /^(id|ids|ref|refs|receiver_profile|.+_ids?|.+_refs?)$/i;

/**
 * Id-like keys that name a USER or something a user owns — only suite-owned values are allowed there. A bare
 * `id` / `ids` counts only at the top level of the body, query or path (e.g. accept_request {id: <invite id>});
 * nested inside an object it is an option id (faith: {id}) and follows the catalogue rule.
 */
export const USER_ID_KEY =
  /^(id|ids|ref|refs|receiver_profile|user_ids?|.+_user_ids?|.+_refs?|conversation_ids?|request_ids?|photo_ids?)$/i;

/** Keys that name another member (a missing / blank one falls back to an arbitrary profile, M2Q-46). */
export const TARGET_KEY = /^(ref|refs|receiver_profile|.+_refs?|user_ids?|.+_user_ids?)$/i;

/** Keys that carry a phone number (never anything but an allowed synthetic number or a non-numeric "qa…"). */
export const PHONE_KEY =
  /^(mobile_number|mobile|phone|phone_number|number|contact_number|.+_phone|.+_mobile)$/i;

/** Login routes: their OTP is never removed or replaced by a number. */
export const LOGIN_APIS = ['API-060', 'API-062'];

/** Placeholders that name a member: a key whose Dev value is one of them is a target key. */
const MEMBER_PLACEHOLDER = /^\$\{?(REF|OTHER_REF|USER_ID|OTHER_USER_ID)\b/;

/** Blocked reason of a variant that is never sent (M2Q-46). */
export const UNSAFE_QUESTION = 'M2Q-46';
export const UNSAFE_REASON = 'unsafe: would act on an unknown member (M2Q-46)';
const UNSAFE_PHONE_REASON =
  'unsafe: would log in / write with a number that is not a synthetic test number (M2Q-46)';

/** The cURL example of an API (only what the safety rules need). */
export interface CurlApi {
  id: string;
  method: string;
  path: string;
  curl: string[];
}

/** Key → raw Dev value of the first cURL example (body keys at any depth, GET/POST query keys). */
export function devKeyValues(api: CurlApi): [string, string][] {
  const curl = api.curl[0] ?? '';
  const body =
    curl.match(/<<JSON\n([\s\S]*?)\nJSON/)?.[1] ?? curl.match(/--data-binary '([^']*)'/)?.[1] ?? '';
  const out: [string, string][] = [];
  if (api.method !== 'GET')
    for (const m of body.matchAll(/"([a-zA-Z_0-9]+)"\s*:\s*(\[?\s*"?[^,\n}\]]*)/g))
      out.push([m[1]!, m[2]!.replace(/^\[?\s*"?/, '')]);
  for (const m of curl.matchAll(/--data-urlencode "([^=]+)=([^"]*)"/g)) out.push([m[1]!, m[2]!]);
  return out;
}

export type ProtectedKind = 'target' | 'phone' | 'phone_code_id' | 'otp';

/** Keys of the Dev request that a variant may never remove or blank, with why. */
export function protectedKeys(api: CurlApi): Map<string, ProtectedKind> {
  const out = new Map<string, ProtectedKind>();
  for (const [k, v] of devKeyValues(api)) {
    const name = k.replace(/^.*\[([^\]]+)\]$/, '$1'); // events[0][user_id] → user_id
    if (/^("|null|)$/.test(v.trim())) continue; // blank in Dev's own example: names no one
    if (TARGET_KEY.test(name) || MEMBER_PLACEHOLDER.test(v)) out.set(k, 'target');
    else if (name === 'phone_code_id') out.set(k, 'phone_code_id');
    else if (PHONE_KEY.test(name)) out.set(k, 'phone');
    else if (name === 'otp' && LOGIN_APIS.includes(api.id)) out.set(k, 'otp');
  }
  return out;
}

/**
 * Rule 3: the Blocked reason of a PARAM ("without <key>") or BODY ("<key> with the wrong type") variant that must not
 * be sent, or undefined when it is safe.
 */
export function variantSafety(api: CurlApi, kind: 'without' | 'wrong type', key: string): string | undefined {
  const p = protectedKeys(api).get(key);
  if (!p) return undefined;
  if (kind === 'without') return p === 'target' ? UNSAFE_REASON : UNSAFE_PHONE_REASON;
  // Wrong type: phone / OTP become non-numeric "qa-…" strings (wrongTypeValue); a ref becomes an object, which
  // by_ref cannot use (ref.upcase raises, profile.rb:128 — observed 500, from code — confirm with Dev).
  if (p === 'phone' || p === 'otp') return undefined;
  if (p === 'target' && key === 'ref') return undefined;
  return p === 'target' ? UNSAFE_REASON : UNSAFE_PHONE_REASON;
}

/** Rule 3 by recorded variant label ("without k" / "k with the wrong type"); undefined = safe or another variant. */
export function unsafeVariantLabel(api: CurlApi, label: string): string | undefined {
  const without = label.match(/^without (.+)$/);
  if (without) return variantSafety(api, 'without', without[1]!);
  const wrong = label.match(/^(.+) with the wrong type$/);
  if (wrong) return variantSafety(api, 'wrong type', wrong[1]!);
  return undefined;
}

const blank = (v: unknown) =>
  v === undefined ||
  v === null ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0);

/** Every value under `key` anywhere in a body. */
function valuesOf(body: unknown, key: string, out: unknown[] = []): unknown[] {
  if (Array.isArray(body)) body.forEach((b) => valuesOf(b, key, out));
  else if (body && typeof body === 'object')
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      if (k === key) out.push(v);
      valuesOf(v, key, out);
    }
  return out;
}

/**
 * READ routes that refuse a blank target key with 400 before any lookup (rule 4 exception, from code — confirm with
 * Dev): GET /V1/pii_integration/first_name (user_id), POST …/profile_first_names (refs), POST …/first_names/batch
 * (user_ids). Writes are never listed here.
 */
export const BLANK_REFUSED_READS: Readonly<Record<string, readonly string[]>> = {
  'API-001': ['user_id'],
  'API-003': ['refs'],
  'API-190': ['user_ids'],
};

/**
 * Rule 4: locations (never values) of protected Dev keys that are missing, null or blank in the outgoing request.
 * A raw body (invalid JSON / multipart) is not inspected. Only BLANK_REFUSED_READS may be blank.
 */
export function missingProtectedIn(api: CurlApi, req: SafetyInput & { rawBody?: boolean }): string[] {
  const out: string[] = [];
  const queryKeys = new Set(
    [...(api.curl[0] ?? '').matchAll(/--data-urlencode "([^=]+)=/g)].map((m) => m[1]!),
  );
  const blankAllowed = BLANK_REFUSED_READS[api.id] ?? [];
  for (const [key, kind] of protectedKeys(api)) {
    if (blankAllowed.includes(key)) continue; // refused with 400 before any lookup (read-only route)
    const what =
      kind === 'target' ? 'would act on an unknown member' : 'would log in / write with no synthetic number';
    if (queryKeys.has(key)) {
      if (blank(req.query?.[key])) out.push(`$query.${key}: missing or blank — ${what}`);
      continue;
    }
    if (req.rawBody) continue;
    const found = valuesOf(req.body, key);
    if (!found.length || found.every(blank)) out.push(`$body.${key}: missing or blank — ${what}`);
  }
  return out;
}

/** Flags that must never be truthy for an API (side effects outside Aisle, e.g. attribution "joined" events). */
export const NEVER_TRUTHY: Record<string, string[]> = { 'API-062': ['is_new_user'] };

/** The wrong-type value the BODY check sends for `key` (original value `v`). */
export function wrongTypeValue(key: string, v: unknown): unknown {
  // A phone / OTP never becomes a number: a non-numeric made-up value cannot be anyone's phone (rule 3).
  if (PHONE_KEY.test(key)) return 'qa-not-a-phone';
  if (key === 'otp') return 'qa-not-an-otp';
  if (ID_KEY.test(key)) {
    if (typeof v === 'number') return 'qa-not-a-number';
    return { qa: 'wrong-type' };
  }
  if (typeof v === 'boolean') return v ? 'qa-not-a-number' : null;
  if (typeof v === 'string') return 12345;
  if (typeof v === 'number') return 'qa-not-a-number';
  return null;
}

/** A made-up value that cannot name a real record: run-prefixed ("qa…"), so never castable to a number. */
const MADE_UP = /^qa/i;

export interface SafetyInput {
  apiId: string;
  body?: unknown;
  query?: Record<string, string> | undefined;
  pathParams?: Record<string, string> | undefined;
  /** The configured India phone_code_id (the only one ever sent besides a made-up "qa…"). */
  phoneCodeId?: string | undefined;
}

/** True for a phone value the suite may send: an allowed synthetic number (± +91 / 91) or a non-numeric "qa…". */
export function isSafePhoneValue(v: unknown): boolean {
  if (typeof v !== 'string' && typeof v !== 'number') return false;
  const s = String(v).trim();
  if (MADE_UP.test(s) && !/\d{3}/.test(s)) return true;
  const digits = s.replace(/[\s-]/g, '').replace(/^\+?91(?=\d{10}$)/, '');
  return isAllowedTestNumber(digits);
}

/**
 * Locations (never values) of id-like values that do not belong to the suite.
 * `suiteIds`: user ids, refs and ids the suite's own accounts created. `catalogue`: configured catalogue values.
 */
export function unsafeIdsIn(req: SafetyInput, suiteIds: Set<string>, catalogue: Set<string>): string[] {
  const out: string[] = [];
  const check = (key: string, v: unknown, at: string, nested: boolean) => {
    if (v === null || v === undefined || v === '') return;
    if (v === 0 || v === '0') return; // never a real record id (the app's own option objects send 0)
    if (typeof v === 'boolean') {
      out.push(`${at}: a true/false value under an id key`);
      return;
    }
    if (typeof v !== 'string' && typeof v !== 'number') return;
    const s = String(v).trim();
    if (suiteIds.has(s)) return;
    const userKey = USER_ID_KEY.test(key) && !(nested && /^ids?$/i.test(key));
    if (!userKey && catalogue.has(s)) return;
    if (typeof v === 'string' && MADE_UP.test(s)) return;
    out.push(`${at}: not a suite account’s id`);
  };
  const phone = (key: string, v: unknown, at: string) => {
    if (key === 'phone_code_id') {
      const s = typeof v === 'string' || typeof v === 'number' ? String(v).trim() : undefined;
      if (s === undefined || !(s === req.phoneCodeId || (MADE_UP.test(s) && !/\d/.test(s))))
        out.push(`${at}: phone_code_id is not the configured India id`);
    } else if (!isSafePhoneValue(v)) out.push(`${at}: not a synthetic test number`);
  };
  const walk = (v: unknown, key: string | undefined, at: string, depth: number) => {
    if (key && (PHONE_KEY.test(key) || key === 'phone_code_id') && !Array.isArray(v)) {
      if (v !== null && v !== undefined && v !== '') phone(key, v, at);
      else if (key === 'phone_code_id' && v !== undefined) phone(key, v, at);
      return;
    }
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, key, `${at}[${i}]`, depth));
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, k, `${at}.${k}`, depth + 1);
    else if (key && ID_KEY.test(key)) check(key, v, at, depth > 1);
  };
  walk(req.body, undefined, '$body', 0);
  walk(req.query ?? {}, undefined, '$query', 0);
  walk(req.pathParams ?? {}, undefined, '$path', 0);
  const body = req.body as Record<string, unknown> | undefined;
  for (const flag of NEVER_TRUTHY[req.apiId] ?? []) {
    const v = body && typeof body === 'object' ? body[flag] : undefined;
    if (v !== undefined && v !== null && v !== false) out.push(`$body.${flag}: must never be truthy`);
  }
  return out;
}

export class UnsafeRequestError extends Error {
  constructor(apiId: string, where: string[], question?: string) {
    super(
      `SAFETY: ${apiId} request NOT sent — ${where.join('; ')} (only the suite’s own synthetic accounts and test numbers may be named${question ? `; ${question}` : ''})`,
    );
    this.name = 'UnsafeRequestError';
  }
}
