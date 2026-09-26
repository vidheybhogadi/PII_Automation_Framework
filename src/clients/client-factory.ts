import { Ed25519Signer } from '../auth/ed25519-signer';
import { requireBaseUrl, requireCaller, type CallerRole, type FrameworkConfig } from '../config/config';
import type { Logger } from '../utils/logger';
import type { SigningIdentity } from './base-api-client';
import { PiiClient } from './pii-client';

/** Signers are cached per role: parsing a PEM once per process is enough. */
const signerCache = new Map<string, Ed25519Signer>();

export function identityFor(config: FrameworkConfig, role: CallerRole): SigningIdentity {
  const creds = requireCaller(config, role);
  const cacheKey = `${role}:${creds.callerId}`;
  let signer = signerCache.get(cacheKey);
  if (!signer) {
    signer = Ed25519Signer.fromPem(creds.privateKeyPem, role);
    signerCache.set(cacheKey, signer);
  }
  return { callerId: creds.callerId, signer };
}

/** Build a PiiClient for a configured caller role, or an unauthenticated one (`role: null`). */
export function createPiiClient(
  config: FrameworkConfig,
  logger: Logger,
  role: CallerRole | null = 'primary',
): PiiClient {
  return new PiiClient({
    baseUrl: requireBaseUrl(config),
    timeoutMs: config.http.timeoutMs,
    retryPolicy: { maxRetries: config.http.retryMaxAttempts, baseDelayMs: config.http.retryBaseDelayMs },
    logger: role ? logger.child({ caller: role }) : logger,
    identity: role ? identityFor(config, role) : undefined,
  });
}
