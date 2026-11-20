/**
 * Vernac Redis keys and the key guard for GET / DELETE /admin/redis-keys on testapp.koode.co.
 *
 * Key names (code: cache/key.rb:287-289, constant.rb:6, services/pii/cache.rb:14-18; seen on staging 2026-11-11,
 * M2FNQ-33): profile cache DESIAPP_<env>_profile_<ref>, conversation cache DESIAPP_<env>_conversation_<id>, PII field
 * cache pii:v1:<b64(env)>:<b64(caller id)>:<b64(tenant)>:<b64("user")>:<b64(user id)>:<b64("NAME")> (each segment
 * base64url without padding; env = staging, caller id = desiapp-rails).
 *
 * The guard allows ONLY: those keys for a suite team user / ref / suite conversation, or a run-unique key that cannot
 * exist. Never a glob, never *_config_constants or any other key. The refusal never echoes the key.
 */
import type { ApiResponse } from '../../../core/http/api-response';
import type { Secret } from '../../../core/utils/secret';
import { VN, type VnClient } from './client';
import type { VnApp } from './guard';

export interface VnKeyScope {
  runId: string;
  env: string;
  callerId: string;
  tenants: ReadonlySet<string>;
  userIds: ReadonlySet<string>;
  refs: ReadonlySet<string>;
  conversations: ReadonlySet<string>;
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s: string) => Buffer.from(s, 'base64url').toString('utf8');

export const vnProfileKey = (env: string, ref: string) => `DESIAPP_${env}_profile_${ref}`;
export const vnConversationKey = (env: string, id: string) => `DESIAPP_${env}_conversation_${id}`;
export const vnPiiNameKey = (env: string, callerId: string, tenant: string, userId: string) =>
  `pii:v1:${[env, callerId, tenant, 'user', userId, 'NAME'].map(b64).join(':')}`;
export const vnAbsentKey = (runId: string, label: string) =>
  `${runId}-vrdk-${label.replace(/[^a-z0-9-]/gi, '')}`;

export class VnKeyGuardError extends Error {
  constructor(message: string) {
    super(`Vernac Redis key refused (not sent): ${message}`);
    this.name = 'VnKeyGuardError';
  }
}

/** Why `key` may not be sent, or undefined when it may. */
export function vnKeyRefusal(key: unknown, scope: VnKeyScope): string | undefined {
  if (typeof key !== 'string' || !key.trim()) return 'empty or not a string';
  if (key !== key.trim()) return 'leading / trailing spaces';
  if (!/^qa-m2[a-z0-9-]*$/i.test(scope.runId)) return 'the run id does not start with qa-m2';
  if (/[*?[\]\\]/.test(key)) return 'glob characters are never sent';
  if (/config_constants/i.test(key)) return 'configuration keys are never sent';
  if (key.startsWith(`${scope.runId}-vrdk-`)) return undefined;
  const profile = new RegExp(`^DESIAPP_${scope.env}_profile_([A-Za-z0-9]+)$`).exec(key);
  if (profile) return scope.refs.has(profile[1]!) ? undefined : 'not a suite team user’s ref';
  const conv = new RegExp(`^DESIAPP_${scope.env}_conversation_(\\d+)$`).exec(key);
  if (conv)
    return scope.conversations.has(conv[1]!) ? undefined : 'not a conversation among the suite team users';
  const pii =
    /^pii:v1:([A-Za-z0-9_-]+):([A-Za-z0-9_-]+):([A-Za-z0-9_-]+):([A-Za-z0-9_-]+):([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)$/.exec(
      key,
    );
  if (pii) {
    const [env, caller, tenant, kind, user, field] = pii.slice(1).map(unb64);
    if (env !== scope.env || caller !== scope.callerId) return 'another environment or caller';
    if (!scope.tenants.has(tenant!)) return 'not an in-scope vernac tenant';
    if (kind !== 'user' || field !== 'NAME') return 'only the NAME field key';
    return scope.userIds.has(user!) ? undefined : 'not a suite team user’s id';
  }
  return 'not a suite team user’s key and not a run-unique absent key';
}

export function assertVnKey(key: unknown, scope: VnKeyScope): void {
  const why = vnKeyRefusal(key, scope);
  if (why) throw new VnKeyGuardError(why);
}

/** GET / DELETE one guarded key (app-name of the key’s app; the Redis route ignores it). */
export async function vnRedis(
  client: VnClient,
  op: 'get' | 'delete',
  auth: Secret | undefined,
  key: string,
  scope: VnKeyScope,
  app: VnApp = 'Arike',
): Promise<ApiResponse> {
  assertVnKey(key, scope);
  return client.call(op === 'get' ? VN.redisGet : VN.redisDelete, { app, auth, query: { key } });
}

/** The validation variants (no key / blank key) — nothing else is sent without the guard. */
export async function vnRedisRaw(
  client: VnClient,
  op: 'get' | 'delete',
  auth: Secret | undefined,
  query: Record<string, string> | undefined,
): Promise<ApiResponse> {
  const entries = Object.entries(query ?? {});
  if (
    entries.length > 1 ||
    (entries.length === 1 && (entries[0]![0] !== 'key' || entries[0]![1].trim() !== ''))
  )
    throw new VnKeyGuardError('validation variants are no key or a blank key');
  return client.call(op === 'get' ? VN.redisGet : VN.redisDelete, {
    app: 'Arike',
    auth,
    ...(query ? { query } : {}),
  });
}
