/**
 * The Redis key APIs (API-213 GET / API-214 DELETE /admin/redis-keys?key=…) with a key guard in front of every call.
 *
 * The routes read and delete ANY key on the shared staging Redis (M2FNQ-05), so the suite sends only:
 *  - a run-unique key that cannot exist: <run id (qa-m2…)>-rdk-<label>;
 *  - the PII first-name cache key of a suite account: pii:v1:user:<user_id>:first_name (M2FNQ-02);
 *  - the profile cache key of a suite account: AISLE_staging_profile_<ref> (M2FNQ-02);
 *  - DELETE only, M2FN-RDK-008 only: that user’s own namespace pattern pii:v1:user:<user_id>:* (the delimiter before
 *    the * means even a wrong pattern expansion could only touch this test user);
 *  - GET only: the one non-string key Dev named (M2FNQ-03, M2FN_REDIS_NON_STRING_KEY).
 * Everything else — a bare or leading wildcard, glob characters, config keys such as
 * AISLE_staging_configuration_constant, other users’ ids — is refused before anything is sent (RedisKeyGuardError).
 * Suite accounts are the +91 10… accounts the M2 account pool created or was given (never the 106 series).
 *
 * Replies are recorded like every M2 call (synthetic data only); assertion messages never contain a value.
 */
import type { ApiResponse } from '../../core/http/api-response';
import type { AuthMode, ExtraRoute, M2Client } from '../../m2/src/clients/m2-client';

export const REDIS_ROUTES = {
  get: { key: 'API-213', method: 'GET', path: '/admin/redis-keys', headers: ['webcms'] },
  delete: { key: 'API-214', method: 'DELETE', path: '/admin/redis-keys', headers: ['webcms'] },
} satisfies Record<string, ExtraRoute>;

export type RedisOp = keyof typeof REDIS_ROUTES;

/** Key names on testa2 (M2FNQ-02, seen on staging 2026-11-09; code: constants.rb:6, cache/key.rb, pii/field_cache.rb). */
export const piiFirstNameKey = (userId: string) => `pii:v1:user:${userId}:first_name`;
export const profileKey = (ref: string) => `AISLE_staging_profile_${ref}`;
export const userPattern = (userId: string) => `pii:v1:user:${userId}:*`;
/** A key that cannot exist: run-unique (the run id starts with qa-m2). */
export const absentKey = (runId: string, label: string) =>
  `${runId}-rdk-${label.replace(/[^a-z0-9-]/gi, '')}`;

export class RedisKeyGuardError extends Error {
  constructor(message: string) {
    super(`Redis key refused (not sent): ${message}`);
    this.name = 'RedisKeyGuardError';
  }
}

export interface KeyScope {
  /** The run id (qa-m2…). */
  runId: string;
  /** User ids and refs of the suite’s own synthetic accounts. */
  suiteIds: ReadonlySet<string>;
  /** The Dev-named non-string key (read only), if configured. */
  nonStringKey?: string | undefined;
}

const GLOB = /[*?[\]\\]/;
const RUN_ID = /^qa-m2[a-z0-9-]*$/i;
const PII_KEY = /^pii:v1:user:(\d+):first_name$/;
const PROFILE_KEY = /^AISLE_staging_profile_([A-Za-z0-9_-]+)$/;
const PATTERN_KEY = /^pii:v1:user:(\d+):\*$/;

/** Why `key` may not be sent with `op`, or undefined when it may. Never echoes the key. */
export function refusal(
  key: unknown,
  op: RedisOp,
  scope: KeyScope,
  opts: { pattern?: boolean } = {},
): string | undefined {
  if (typeof key !== 'string' || !key.trim()) return 'empty or not a string';
  if (key !== key.trim()) return 'leading / trailing spaces';
  if (!RUN_ID.test(scope.runId)) return 'the run id does not start with qa-m2';
  if (opts.pattern) {
    if (op !== 'delete') return 'a pattern key is only sent to DELETE';
    const m = PATTERN_KEY.exec(key);
    if (!m) return 'a pattern must be pii:v1:user:<suite user id>:*';
    return scope.suiteIds.has(m[1]!)
      ? undefined
      : 'the pattern names a user id that is not a suite account’s';
  }
  if (GLOB.test(key)) return 'glob characters (* ? [ ] \\) are never sent';
  if (key.startsWith(`${scope.runId}-rdk-`)) return undefined;
  const pii = PII_KEY.exec(key);
  if (pii) return scope.suiteIds.has(pii[1]!) ? undefined : 'not a suite account’s user id';
  const profile = PROFILE_KEY.exec(key);
  if (profile) return scope.suiteIds.has(profile[1]!) ? undefined : 'not a suite account’s ref';
  if (scope.nonStringKey && key === scope.nonStringKey)
    return op === 'get' ? undefined : 'the Dev-named non-string key is read only';
  return 'not a suite account’s key and not a run-unique absent key';
}

export function assertSafeKey(
  key: unknown,
  op: RedisOp,
  scope: KeyScope,
  opts: { pattern?: boolean } = {},
): void {
  const why = refusal(key, op, scope, opts);
  if (why) throw new RedisKeyGuardError(why);
}

/**
 * The bad-input variants of M2FN-RDK-004, checked the same way: no key, "", "   ", or key[] = one run-unique absent
 * key. Anything else is refused.
 */
export function assertSafeValidationQuery(query: Record<string, string> | undefined, scope: KeyScope): void {
  const entries = Object.entries(query ?? {});
  if (entries.length === 0) return;
  if (entries.length > 1) throw new RedisKeyGuardError('one parameter per validation variant');
  const [name, value] = entries[0]!;
  if (name === 'key' && value.trim() === '') return;
  if (name === 'key[]' && !refusal(value, 'get', { runId: scope.runId, suiteIds: new Set() })) return;
  throw new RedisKeyGuardError(
    'validation variants are no key, a blank key or key[] = a run-unique absent key',
  );
}

export interface RedisFx {
  m2: M2Client;
  observe: (label: string, res: ApiResponse) => void;
}

/** GET / DELETE one guarded key. */
export async function redisCall(
  fx: RedisFx,
  op: RedisOp,
  auth: AuthMode,
  key: string,
  scope: KeyScope,
  opts: { pattern?: boolean; label?: string } = {},
): Promise<ApiResponse> {
  assertSafeKey(key, op, scope, opts);
  const route = REDIS_ROUTES[op];
  const res = await fx.m2.callRoute(route, { auth, query: { key }, retry: false, noBody: true });
  fx.observe(`${route.key} ${op.toUpperCase()} ${opts.label ?? authName(auth)}`, res);
  return res;
}

/** GET / DELETE with one validation variant (M2FN-RDK-004). */
export async function redisCallRaw(
  fx: RedisFx,
  op: RedisOp,
  auth: AuthMode,
  query: Record<string, string> | undefined,
  scope: KeyScope,
  label: string,
): Promise<ApiResponse> {
  assertSafeValidationQuery(query, scope);
  const route = REDIS_ROUTES[op];
  const res = await fx.m2.callRoute(route, { auth, ...(query ? { query } : {}), retry: false, noBody: true });
  fx.observe(`${route.key} ${op.toUpperCase()} ${label}`, res);
  return res;
}

const authName = (a: AuthMode) => (a.kind === 'none' ? 'no credential' : a.label);

/** The JSON body as an object (empty object when the body is not an object). */
export function bodyOf(res: ApiResponse): Record<string, unknown> {
  const b = res.json();
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}

/** True when the reply carries a `value` (a refusal must never carry one). */
export const hasValue = (res: ApiResponse) => 'value' in bodyOf(res);

export const cacheControl = (res: ApiResponse) => (res.header('cache-control') ?? '').toLowerCase();
