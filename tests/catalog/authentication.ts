import type { TestCaseCatalog } from './types';

export const AUTHENTICATION_CASES: TestCaseCatalog = {
  'AISLE-AUTH-001': {
    what: 'Saves a fake name with the token (the secret pass proving the caller is Aisle’s test app), then tries to change it with no Authorization header (the header that carries the token).',
    why: 'Without this check, anyone on the network could change users’ personal data.',
    steps: [
      'Save fake name A for a new fake user with the token',
      'Send a save of fake name B with no Authorization header',
      'Read the name with the token',
    ],
    expected:
      '401 Unauthorized (refused: not signed in) with no data in the reply. Reading afterwards still returns name A.',
    request:
      'POST /api/v1/pii-test {"user_id":"<fake user>","field":"NAME","value":"QA Automation User A"} (with token) · POST /api/v1/pii-test {… "value":"QA Automation User B"} (no Authorization header)',
    validation: [
      'Save without token → 401',
      'The 401 reply contains no data',
      'Reading afterwards still returns name A',
    ],
    type: 'Security',
    priority: 'Critical',
  },
  'AISLE-AUTH-002': {
    what: 'Saves a fake name, then tries to read it using a made-up token (the secret pass that proves who is calling).',
    why: 'A guessed or old token must never give access to personal data.',
    steps: [
      'Save a fake name for a new fake user with the real token',
      'Read it with a made-up token',
      'Check the reply',
    ],
    expected:
      '401 Unauthorized (refused: not signed in). The reply contains no data and does not contain the name.',
    request:
      'POST /api/v1/pii-test/read {"user_id":"<fake user>","field_names":["NAME"]} with Authorization: Bearer qa-auto-not-a-real-token',
    validation: ['Status is 401', 'The reply contains no data', 'The fake name is not in the reply'],
    type: 'Security',
    priority: 'Critical',
  },
  'AISLE-AUTH-003': {
    what: 'Sends read requests with three badly formed Authorization headers (the header that carries the token): “Token abc”, the word “Bearer” with nothing after it, and a “Basic” user-and-password header with made-up details.',
    why: 'Careless checking of this header is a common way to get around sign-in.',
    steps: ['Send the three reads with the badly formed headers', 'Check each reply'],
    expected:
      'All three get 401 Unauthorized (refused: not signed in) with no data. Not covered here: the facade also accepts the real token without the word “Bearer” or with lower-case “bearer”; whether that is intended is waiting on Dev (question BQ-17).',
    request:
      'POST /api/v1/pii-test/read {"user_id":"<fake user>","field_names":["NAME"]} with Authorization: “Token abc” · “Bearer ” (empty) · “Basic Zm9vOmJhcg==”',
    validation: ['Each of the three headers → 401', 'No reply contains data'],
    type: 'Security',
    priority: 'High',
  },
  'AISLE-AUTH-004': {
    what: 'Calls all 11 Aisle facade endpoints (the service’s web addresses) with no token and harmless fake request bodies (no real phone numbers or IDs).',
    why: 'One unprotected endpoint would be enough to leak personal data.',
    steps: [
      'For each endpoint, send a request with no Authorization header (the header that carries the token)',
      'Collect every endpoint that did not answer 401',
    ],
    expected:
      'Every endpoint answers 401 Unauthorized (refused: not signed in) with no data. Seen on staging for health, read and save; this run confirms the others (question BQ-09).',
    request:
      'Every facade endpoint (health, save, read, EMAIL search, bulk read, 3 temporary-phone, 3 free-text-key) with a harmless fake body and no Authorization header',
    validation: [
      'Every endpoint answers 401',
      'No reply contains data',
      'Any endpoint that does not is listed by name',
    ],
    type: 'Security',
    priority: 'Critical',
    endpoint: 'crossEndpoint',
  },
};
