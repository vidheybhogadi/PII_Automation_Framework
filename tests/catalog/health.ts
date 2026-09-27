import type { TestCaseCatalog } from './types';

export const HEALTH_CASES: TestCaseCatalog = {
  'PII-HLT-001': {
    what: 'Calls the service’s health check (a simple “are you up and ready?” address) without any signature and checks it answers “ready”.',
    why: 'Monitoring and deployments rely on this check to know the service can take traffic; if it failed or demanded a signature, a healthy service could be taken offline or a broken one kept live.',
    steps: [
      'Send an unsigned request to the readiness health check',
      'Check the status code and the reply message',
      'Check the reply contains only the documented fields',
    ],
    expected:
      '200 OK with the message "Service is ready"; the data says status "ready", and both the outer reply and the data contain exactly the documented fields (data has only "status").',
    type: 'Positive',
    priority: 'High',
  },
  'PII-HLT-002': {
    what: 'Will check that the health check answers 503 SERVICE_NOT_READY when the service is not ready (for example, its database is down).',
    why: 'If a broken service still reported “ready”, traffic would be sent to it and real requests would fail.',
    steps: [
      'Put a test instance of the service into a not-ready state (for example, database unavailable)',
      'Call the readiness health check',
      'Check the status code and reply body',
    ],
    expected: '503 Service Unavailable with SERVICE_NOT_READY and the agreed reply shape.',
    type: 'Negative',
    priority: 'Medium',
    preconditions:
      'Waiting on Dev question Q-17 — a safe way to make the service not ready (a test hook or a dedicated instance) is needed; shows as Not Tested until answered.',
  },
};
