/**
 * Bounded exponential backoff with full jitter.
 *
 * Guide, integration checklist item 9: "Retry transient 503 responses with bounded exponential backoff and
 * jitter." Item 8: "retries will not fix invalid credentials or permissions" — so 401/403 are never retried.
 *
 * The API client only uses this for endpoints marked `retrySafe` (read-only operations). Writes are not
 * retried because the guide does not document idempotency guarantees for them.
 */

export interface RetryPolicy {
  /** Extra attempts after the first one. 0 = no retries. */
  maxRetries: number;
  /** Base delay in ms; attempt n waits a random time in [0, base * 2^n]. */
  baseDelayMs: number;
  /** Upper bound for a single wait. */
  maxDelayMs?: number;
}

export function backoffDelayMs(
  attempt: number,
  policy: RetryPolicy,
  random: () => number = Math.random,
): number {
  const cap = policy.maxDelayMs ?? 5_000;
  const exponential = Math.min(cap, policy.baseDelayMs * 2 ** attempt);
  return Math.floor(random() * exponential);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `operation` until `shouldRetry(result)` is false or attempts are exhausted.
 * `onRetry` lets the caller log each retry (with a fresh request ID).
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  shouldRetry: (result: T) => boolean,
  policy: RetryPolicy,
  onRetry?: (attempt: number, delayMs: number, result: T) => void,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    const result = await operation(attempt);
    if (attempt >= policy.maxRetries || !shouldRetry(result)) return result;
    const delay = backoffDelayMs(attempt, policy);
    onRetry?.(attempt + 1, delay, result);
    await sleep(delay);
    attempt += 1;
  }
}
