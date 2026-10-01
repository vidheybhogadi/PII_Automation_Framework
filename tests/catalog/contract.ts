import type { TestCaseCatalog } from './types';

export const CONTRACT_CASES: TestCaseCatalog = {
  'AISLE-CON-001': {
    what: 'Saves a fake name, reads it, and bulk reads (one request for several users) two fake users, then compares the field names inside the data part of each reply with the list seen on staging.',
    why: 'Apps break without warning when data fields appear, disappear or get renamed.',
    steps: [
      'Save a fake name, read it, and bulk read two fake users',
      'Compare the field names in each reply’s data part with the agreed list',
    ],
    expected:
      'Save data has exactly tenant_id, user_id, field and key_version. Read data has tenant_id, user_id, items and count; bulk-read data has tenant_id, items and count; every item has tenant_id, user_id, field and value. Only field names are compared, never values. The envelope around the data and the tenant value are set by the facade and are not checked.',
    request:
      'POST /api/v1/pii-test (fake name) · POST /api/v1/pii-test/read · POST /api/v1/pii-test/batch/read (two fake users)',
    validation: [
      'Save data has exactly tenant_id, user_id, field, key_version',
      'Read and bulk-read data and items have exactly the observed fields',
    ],
    type: 'Contract',
    priority: 'High',
    endpoint: 'crossEndpoint',
  },
  'AISLE-CON-002': {
    what: 'Sends a save of a fake name with an empty value, which the PII service refuses, and checks the shape of the refusal.',
    why: 'Apps read the list of problems to tell the user what to fix. If the format changed, error handling in every app would break.',
    steps: [
      'Send a save with an empty value for a new fake user',
      'Check the reply is 422',
      'Check the shape of the list of problems',
    ],
    expected:
      '422 Unprocessable Entity (refused: the request format is invalid). The body has exactly one part, “detail”: a list of problems, and each problem names its location (loc), a message (msg) and an error type (type). Seen on staging on 2026-10-01.',
    request: 'POST /api/v1/pii-test {"user_id":"<new fake user>","field":"NAME","value":""}',
    validation: [
      'Status is 422 naming body.value',
      'The body has exactly the key “detail”',
      'Every problem has loc, msg and type',
    ],
    type: 'Contract',
    priority: 'Medium',
    endpoint: 'writePii',
  },
  'AISLE-CON-003': {
    what: 'Saves, reads and bulk reads a fake email, searches it (with and without values), and creates, reads and revokes a free-text key. Checks the field names inside the “data” part of every reply.',
    why: 'Apps read these exact fields. A renamed, missing or extra field breaks them, or leaks data nobody asked for.',
    steps: [
      'Save, read and bulk read a fake email',
      'Search it with values on and off',
      'Create, read and revoke a free-text key',
      'Compare the field names in each reply’s data with the agreed list',
    ],
    expected:
      'Save data: tenant_id, user_id, field, key_version. Read data: tenant_id, user_id, items, count; each item: tenant_id, user_id, field, value. Bulk read data: tenant_id, items, count. Search data: tenant_id, field, matches, count, truncated; matches have the 4 item fields with values on, only user_id with values off. Key data: tenant_id, key_id, key, algorithm, status, created_at; revoke: tenant_id, key_id, status, revoked_at. Seen on 2026-10-01.',
    request:
      'POST /api/v1/pii-test (EMAIL) · …/read · …/batch/read · …/EMAIL/search · …/free-text/keys · …/keys/read · …/keys/revoke',
    validation: ['Every data part has exactly the listed fields (names only are compared, never values)'],
    type: 'Contract',
    priority: 'Medium',
    endpoint: 'crossEndpoint',
  },
};
