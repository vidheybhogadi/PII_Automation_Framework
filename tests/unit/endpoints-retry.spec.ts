/** UNIT — endpoint inventory (vs. the guide) and retry policy. */
import { expect, test } from '@playwright/test';
import { ENDPOINTS, ENDPOINT_KEYS, buildPath } from '../../src/clients/endpoints';
import { CleanupRegistry } from '../../src/utils/cleanup';
import { backoffDelayMs, withRetry } from '../../src/utils/retry';

test.describe('UNIT endpoint inventory & utilities', () => {
  test('UT-END-001 The endpoint list matches the guide: 11 endpoints, 10 signed plus 1 health check', () => {
    expect(ENDPOINT_KEYS).toHaveLength(11);
    const authenticated = Object.values(ENDPOINTS).filter((e) => e.authenticated);
    expect(authenticated).toHaveLength(10);
    authenticated.forEach((e) => expect(e.path.startsWith('/api/v1/')).toBe(true));
    expect(ENDPOINTS.healthReady).toMatchObject({
      method: 'GET',
      path: '/health/ready',
      authenticated: false,
    });
    expect(
      Object.values(ENDPOINTS)
        .map((e) => `${e.method} ${e.path}`)
        .sort(),
    ).toEqual(
      [
        'GET /health/ready',
        'POST /api/v1/pii',
        'POST /api/v1/pii/read',
        'POST /api/v1/pii/{field}/search',
        'POST /api/v1/pii/batch/read',
        'POST /api/v1/transient/phones',
        'POST /api/v1/transient/phones/resolve',
        'POST /api/v1/transient/phones/promote',
        'POST /api/v1/free-text/keys',
        'POST /api/v1/free-text/keys/read',
        'POST /api/v1/free-text/keys/revoke',
      ].sort(),
    );
  });

  test('UT-END-002 The endpoints that must not be cached match the guide', () => {
    const noStore = Object.values(ENDPOINTS)
      .filter((e) => e.noStore)
      .map((e) => e.key)
      .sort();
    expect(noStore).toEqual(['createFreeTextKey', 'readFreeTextKey', 'resolveTransientPhone']);
  });

  test('UT-END-003 URLs are built with encoded, required parameters', () => {
    expect(buildPath('/api/v1/pii/{field}/search', { field: 'EMAIL' })).toBe('/api/v1/pii/EMAIL/search');
    expect(() => buildPath('/api/v1/pii/{field}/search')).toThrow(/field/);
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
