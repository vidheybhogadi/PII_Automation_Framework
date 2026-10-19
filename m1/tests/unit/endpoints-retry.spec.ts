/** UNIT — endpoint inventory (Aisle facade) and retry policy. */
import { expect, test } from '@playwright/test';
import { ENDPOINTS, ENDPOINT_KEYS, FACADE_PREFIX, buildPath } from '../../src/clients/endpoints';
import { CleanupRegistry } from '../../src/utils/cleanup';
import { backoffDelayMs, withRetry } from '../../src/utils/retry';

test.describe('UNIT endpoint inventory & utilities', () => {
  test('UT-END-001 The endpoint list is the Aisle facade: 11 endpoints, all under /api/v1/pii-test, all need the token', () => {
    expect(ENDPOINT_KEYS).toHaveLength(11);
    Object.values(ENDPOINTS).forEach((e) => {
      expect(e.authenticated, `${e.key} must require the Aisle Bearer token`).toBe(true);
      expect(e.path.startsWith(FACADE_PREFIX)).toBe(true);
    });
    expect(
      Object.values(ENDPOINTS)
        .map((e) => `${e.method} ${e.path}`)
        .sort(),
    ).toEqual(
      [
        'GET /api/v1/pii-test/health/ready',
        'POST /api/v1/pii-test',
        'POST /api/v1/pii-test/read',
        'POST /api/v1/pii-test/{field}/search',
        'POST /api/v1/pii-test/batch/read',
        'POST /api/v1/pii-test/transient/phones',
        'POST /api/v1/pii-test/transient/phones/resolve',
        'POST /api/v1/pii-test/transient/phones/promote',
        'POST /api/v1/pii-test/free-text/keys',
        'POST /api/v1/pii-test/free-text/keys/read',
        'POST /api/v1/pii-test/free-text/keys/revoke',
      ].sort(),
    );
  });

  test('UT-END-002 Only read-only endpoints may be retried automatically', () => {
    const retrySafe = Object.values(ENDPOINTS)
      .filter((e) => e.retrySafe)
      .map((e) => e.key)
      .sort();
    expect(retrySafe).toEqual(
      [
        'batchReadPii',
        'healthReady',
        'readFreeTextKey',
        'readPii',
        'resolveTransientPhone',
        'searchPii',
      ].sort(),
    );
  });

  test('UT-END-003 URLs are built with encoded, required parameters', () => {
    expect(buildPath('/api/v1/pii-test/{field}/search', { field: 'EMAIL' })).toBe(
      '/api/v1/pii-test/EMAIL/search',
    );
    expect(buildPath('/api/v1/pii-test/{field}/search', { field: 'A/B' })).toBe(
      '/api/v1/pii-test/A%2FB/search',
    );
    expect(() => buildPath('/api/v1/pii-test/{field}/search')).toThrow(/field/);
  });

  test('UT-RTY-001 Retry waits grow each time, are capped, and are slightly randomised', () => {
    const policy = { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 300 };
    expect(backoffDelayMs(0, policy, () => 0.999)).toBe(99);
    expect(backoffDelayMs(1, policy, () => 0.999)).toBe(199);
    expect(backoffDelayMs(5, policy, () => 0.999)).toBe(299); // capped
    expect(backoffDelayMs(2, policy, () => 0)).toBe(0);
  });

  test('UT-RTY-002 Retrying stops on success or when attempts run out', async () => {
    let calls = 0;
    const res = await withRetry(
      async () => ++calls,
      (n) => n < 2,
      { maxRetries: 5, baseDelayMs: 0 },
    );
    expect(res).toBe(2);
    calls = 0;
    await withRetry(
      async () => ++calls,
      () => true,
      { maxRetries: 2, baseDelayMs: 0 },
    );
    expect(calls).toBe(3);
  });

  test('UT-CLN-001 Clean-up runs newest-first and honestly records failures and data left behind', async () => {
    const order: string[] = [];
    const registry = new CleanupRegistry();
    registry.register('first', async () => void order.push('first'));
    registry.register('second', async () => void order.push('second'));
    registry.register('broken', async () => {
      throw new Error('boom');
    });
    registry.leaveBehind('PII EMAIL', 'tenant-a/qa-auto-20260926t101500-9f3a-w0-1-email');
    const summary = await registry.run();
    expect(order).toEqual(['second', 'first']);
    expect(summary.failed).toEqual(['broken: Error']);
    expect(summary.leftBehind[0]).toContain('no approved deletion API');
    expect(summary.leftBehind[0]).not.toContain('qa-auto-20260926t101500-9f3a-w0-1');
  });
});
