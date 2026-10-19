import { requireToken, type FrameworkConfig } from '../config/config';
import type { ExchangeRecorder } from '../utils/exchange-recorder';
import type { Logger } from '../utils/logger';
import { AislePiiClient } from './aisle-pii-client';

/**
 * Build the Aisle PII facade client. By default it authenticates with AISLE_TEST_TOKEN; pass
 * `{ authenticated: false }` for a client that never sends the token (e.g. the unit-test wire checks).
 */
export function createAisleClient(
  config: FrameworkConfig,
  logger: Logger,
  { authenticated = true, recorder }: { authenticated?: boolean; recorder?: ExchangeRecorder } = {},
): AislePiiClient {
  return new AislePiiClient({
    baseUrl: config.baseUrl,
    timeoutMs: config.http.timeoutMs,
    retryPolicy: { maxRetries: config.http.retryMaxAttempts, baseDelayMs: config.http.retryBaseDelayMs },
    logger,
    token: authenticated ? requireToken(config) : undefined,
    ...(recorder ? { recorder } : {}),
  });
}
