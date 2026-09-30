import type { TestCaseCatalog } from './types';

export const HEALTH_CASES: TestCaseCatalog = {
  'AISLE-HLT-001': {
    what: 'Calls the health endpoint of the Aisle facade (Aisle’s front door to the PII service) with the token (the secret pass proving the caller is Aisle’s test app).',
    why: 'Every other test depends on the service being up. This is the first thing to check when a run fails.',
    steps: ['Send the health request with the token', 'Check the status code and the reply'],
    expected:
      '200 OK. The reply says status true, message “Service is ready”, data status “ready” and no error. The first call after a quiet period can take about 15 seconds, so the test allows up to 30 seconds (question BQ-15). If the service is unavailable, every test is reported as Not Tested with that reason.',
    request: 'GET /api/v1/pii-test/health/ready (Authorization: Bearer <test token>)',
    validation: [
      'Status is 200',
      'Reply status is true and the message is “Service is ready”',
      'Data status is “ready”',
      'Error is empty',
    ],
    type: 'Positive',
    priority: 'High',
  },
};
