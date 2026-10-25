/**
 * Credential variants for the M2 checks. The invalid ones are made up here and can never be a real credential;
 * real credentials (TEST_TOKEN, a user JWT) are passed only as `Secret`s.
 */
import { createHmac, randomBytes } from 'node:crypto';
import type { Secret } from '../../../core/utils/secret';
import type { AuthMode } from '../clients/m2-client';

const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64url');

/**
 * A well-formed JWT that expired a day ago, signed with a random throw-away key (HS256). It looks like a token but
 * no server can accept it: wrong key, wrong algorithm for the app's RS256 tokens, and expired.
 */
export function expiredFormatJwt(now: Date = new Date()): string {
  const iat = Math.floor(now.getTime() / 1000) - 2 * 86_400;
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({ iss: 'qa-m2-invalid', sub: 'qa-m2-invalid', iat, exp: iat + 86_400 }),
  );
  const sig = createHmac('sha256', randomBytes(32)).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export const AUTH = {
  /** No Authorization header at all. */
  none: { kind: 'none' } as AuthMode,
  /** `Authorization: Bearer invalid`. */
  invalidBearer: { kind: 'header', label: 'invalid-bearer', value: 'Bearer invalid' } as AuthMode,
  /** `Authorization: Bearer <expired, wrongly-signed JWT>`. */
  expiredJwt: (): AuthMode => ({
    kind: 'header',
    label: 'expired-format JWT',
    value: `Bearer ${expiredFormatJwt()}`,
  }),
  /** TEST_TOKEN (AISLE_TEST_TOKEN) as a Bearer credential. */
  testToken: (secret: Secret): AuthMode => ({ kind: 'secret', label: 'TEST_TOKEN', secret }),
  /** A user JWT from the session helper. */
  user: (secret: Secret): AuthMode => ({ kind: 'secret', label: 'user JWT', secret }),
  /** A web JWT (ptfrm "web") of a synthetic account — valid, but rejected by the app routes (verify_auth_token). */
  web: (secret: Secret): AuthMode => ({ kind: 'secret', label: 'web JWT', secret }),
};

/** The valid credential of the WRONG type a TOKEN check sends (audit fix 2026-10-25). */
export type WrongCredential = 'web JWT' | 'user JWT' | 'TEST_TOKEN';

/**
 * Which valid-but-wrong credential is meaningful for a route's auth (Dev inventory) — a credential the route can
 * parse, so a refusal proves "wrong type", not "unreadable token" (from code, develop_new 944f76a — confirm with
 * Dev):
 * - app user routes (USER_TOKEN): a web JWT — a real RS256 JWT with ptfrm "web", which verify_auth_token rejects
 *   (authenticatable.rb:303-308). TEST_TOKEN is not a JWT there, so it only reached the decode error (M2Q-39).
 * - web-token routes (WEB_TOKEN), TEST_TOKEN routes and CMS routes: a normal app user JWT (verify_web_token rejects
 *   ptfrm ≠ "web", authenticatable.rb:321-324; the test routes compare TEST_TOKEN; an app JWT names no admin user).
 * - INFOEDGE: TEST_TOKEN (another static shared token — the meaningful mix-up there).
 */
export function wrongCredentialsFor(auth: readonly string[]): WrongCredential[] {
  if (auth.includes('INFOEDGE_PROFILE_API_TOKEN')) return ['TEST_TOKEN'];
  if (auth.includes('USER_TOKEN')) return ['web JWT'];
  if (
    auth.includes('TEST_TOKEN') ||
    auth.includes('WEB_TOKEN') ||
    auth.some((a) => ['ADMIN_TOKEN', 'webcms', 'ADMIN_SESSION_COOKIE'].includes(a))
  )
    return ['user JWT'];
  return ['TEST_TOKEN'];
}

/** The invalid-credential variants every AUTH check sends (Dev design: none, "Bearer invalid", expired-format). */
export const INVALID_VARIANTS = (): AuthMode[] => [AUTH.none, AUTH.invalidBearer, AUTH.expiredJwt()];

export const authLabel = (a: AuthMode) => (a.kind === 'none' ? 'no credential' : a.label);
