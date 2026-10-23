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
};

/** The invalid-credential variants every AUTH check sends (Dev design: none, "Bearer invalid", expired-format). */
export const INVALID_VARIANTS = (): AuthMode[] => [AUTH.none, AUTH.invalidBearer, AUTH.expiredJwt()];

export const authLabel = (a: AuthMode) => (a.kind === 'none' ? 'no credential' : a.label);
