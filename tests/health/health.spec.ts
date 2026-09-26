/** Guide §1 — GET /health/ready (no authentication). */
import { expectExactKeys, expectSuccess } from '../../src/assertions/response.assertions';
import { blockedBy, expect, onlyIfInScope, test } from '../../src/fixtures/test-fixtures';
import { ENVELOPE_KEYS, healthReadyDataSchema } from '../../src/models/common.models';

test.describe('Health / readiness', { tag: ['@regression'] }, () => {
  onlyIfInScope('healthReady');

  test(
    'PII-HLT-001 Health check returns 200 when the service is ready, without needing a signature',
    { tag: '@smoke' },
    async ({ pii }) => {
      const res = await pii.healthReady(); // health is never signed (see UT-CLI-005)
      const data = expectSuccess(res, 200, healthReadyDataSchema, 'Service is ready');
      expect(data.status).toBe('ready');
      expectExactKeys(res.json(), ENVELOPE_KEYS, 'health envelope');
      expectExactKeys(data, ['status'], 'health data');
    },
  );

  test('PII-HLT-002 Health check returns 503 SERVICE_NOT_READY when the service is not ready', async () => {
    blockedBy(
      'Q-17',
      'A not-ready state cannot be induced safely from automation; needs a test hook or dedicated instance.',
    );
  });
});
