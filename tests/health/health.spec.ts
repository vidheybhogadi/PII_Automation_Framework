/** Aisle facade readiness — GET /api/v1/pii-test/health/ready (Bearer token required). */
import { expectSuccess } from '../../src/assertions/response.assertions';
import { expect, noteAssumption, onlyIfInScope, test } from '../../src/fixtures/test-fixtures';
import { healthReadyDataSchema } from '../../src/models/common.models';

test.describe('Aisle facade health', () => {
  onlyIfInScope('healthReady');

  test(
    'AISLE-HLT-001 The health check with a valid token says the service is ready',
    { tag: ['@smoke', '@phase1'] },
    async ({ aisle }) => {
      noteAssumption('BQ-15', 'the first call after a quiet period can take ~14 s; the time limit is 30 s');
      const res = await aisle.healthReady();
      const data = expectSuccess(res, 200, healthReadyDataSchema, 'Service is ready');
      expect(data.status).toBe('ready');
    },
  );
});
