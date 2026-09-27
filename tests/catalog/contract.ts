import type { TestCaseCatalog } from './types';

export const CONTRACT_CASES: TestCaseCatalog = {
  'PII-CON-001': {
    endpoint: 'crossEndpoint',
    what: 'Downloads the service’s machine-readable API description (OpenAPI — a file listing every address the service offers) and checks every endpoint in our documentation is in it.',
    why: 'If a documented endpoint is missing, the service and its documentation have drifted apart and callers built from the documentation would break.',
    steps: [
      'Request the OpenAPI description from the service',
      'Compare its list of endpoints with the endpoints in our documentation',
      'List any documented endpoint that is missing',
    ],
    expected:
      '200 OK; every documented endpoint (method and path) appears in the OpenAPI description, so the missing list is empty.',
    type: 'Contract',
    priority: 'Low',
    preconditions:
      'Needs the OpenAPI description to be exposed; if the service answers 404, the test waits on Dev question Q-24 and shows as Not Tested.',
  },
  'PII-CON-002': {
    endpoint: 'crossEndpoint',
    what: 'Checks the OpenAPI description does not list any /api/v1 endpoint that is missing from our documentation.',
    why: 'An undocumented endpoint is untested and may expose personal data in ways nobody has reviewed.',
    steps: [
      'Request the OpenAPI description from the service',
      'Collect every /api/v1 endpoint (method and path) it lists',
      'List any that are not in our documentation',
    ],
    expected: 'No extra /api/v1 endpoints: the list of undocumented operations is empty.',
    type: 'Contract',
    priority: 'Low',
    preconditions:
      'Needs the OpenAPI description to be exposed; if the service answers 404, the test waits on Dev question Q-24 and shows as Not Tested.',
  },
  'PII-CON-003': {
    endpoint: 'crossEndpoint',
    what: 'Saves a fake test email, then reads it, searches for it (with and without values) and bulk-reads it, checking each reply contains exactly the documented fields — nothing missing, nothing extra.',
    why: 'An extra field in a personal-data reply could leak information, and a missing one breaks callers; either is treated as a failure.',
    steps: [
      'Save a fake test email for a fake test user',
      'Read it back, then search for it by value (IDs only, then with values)',
      'Bulk-read it for that user',
      'Compare the fields of every reply with the documentation',
    ],
    expected:
      'Save 201, read/search/bulk-read 200; the outer reply, the data, each item and each search match contain exactly the documented fields (an IDs-only search match holds only user_id).',
    type: 'Contract',
    priority: 'Medium',
  },
  'PII-CON-004': {
    endpoint: 'crossEndpoint',
    what: 'Creates a temporary phone record (a short-lived phone entry not yet linked to a user), looks it up, then links it to a fake test user, checking each reply has exactly the documented fields.',
    why: 'Phone numbers are personal data; extra fields could leak them and missing fields break the callers that use temporary phones.',
    steps: [
      'Create a temporary phone record with an approved fake test phone number and the shortest allowed lifetime',
      'Look up the temporary phone by its ID',
      'Promote (link) it to a fake test user',
      'Compare the fields of each reply with the documentation',
    ],
    expected:
      'Create succeeds; look-up and promote return 200; each reply’s data contains exactly the documented fields.',
    type: 'Contract',
    priority: 'Medium',
    preconditions: 'Needs approved test phone numbers.',
  },
  'PII-CON-005': {
    endpoint: 'crossEndpoint',
    what: 'Creates, reads and revokes an encryption key for free text, then reads it again, checking every reply — including the error — has exactly the documented fields.',
    why: 'Key replies must not expose anything undocumented, and error replies must keep one fixed shape so callers can handle them.',
    steps: [
      'Create a new encryption key for the test tenant',
      'Read the key, then revoke it',
      'Read the revoked key again',
      'Compare the fields of each reply with the documentation',
    ],
    expected:
      'Read and revoke return 200 with exactly the documented fields; the final read returns 404 with exactly the documented outer fields and an error object holding only "code" and "message".',
    type: 'Contract',
    priority: 'Medium',
  },
};
