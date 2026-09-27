import type { TestCaseCatalog } from './types';

export const RESPONSE_SECURITY_CASES: TestCaseCatalog = {
  'PII-SEC-001': {
    what: 'Sends an invalid email value and checks the error reply does not repeat that value back.',
    why: 'Error replies often end up in logs and screens; if they echoed personal data, it would leak outside the secure store.',
    steps: [
      'Save an EMAIL field with a value that is not a valid email',
      'Check the reply status and error code',
      'Search the reply text for the value that was sent',
    ],
    expected:
      '400 Bad Request with the validation error code; the sent value does not appear anywhere in the reply.',
    type: 'Security',
    priority: 'High',
  },
  'PII-SEC-002': {
    what: 'Sends a save request whose body is exactly one byte over the configured size limit.',
    why: 'Without a size limit, anyone could overload the service by sending huge requests.',
    steps: [
      'Build a save-name request that is one byte bigger than the maximum body size',
      'Send it once, with no automatic retry',
      'Check the reply',
    ],
    expected: '413 Payload Too Large with the BODY_TOO_LARGE error code.',
    type: 'Security',
    priority: 'Medium',
    preconditions:
      'Waiting on Dev question Q-22 (the maximum request body size for this environment) — shows as Not Tested until answered',
  },
  'PII-SEC-003': {
    endpoint: 'crossEndpoint',
    what: 'Calls the development-only signing helper page (/docs/signature, a tool that signs requests for you) and checks it is not usable.',
    why: 'If this helper were left on outside development, anyone could use it to create valid signed requests and bypass caller authentication.',
    steps: ['Call the /docs/signature helper', 'Check the reply status'],
    expected: 'The reply is not a success (not a 2xx status).',
    type: 'Security',
    priority: 'High',
    preconditions:
      'Waiting on Dev question Q-23 (confirmation that this environment must have the helper switched off) — shows as Not Tested until answered',
  },
  'PII-SEC-004': {
    endpoint: 'crossEndpoint',
    what: 'Runs a full flow (save, read, search, temporary phone, encryption key) and then scans the test framework’s API call log for personal data and secrets.',
    why: 'Logs are widely readable; if personal data, keys or signatures ended up there, they could leak to anyone with log access.',
    steps: [
      'Save a fake email and name for a fake user, then read and search them',
      'Create and look up a temporary phone record',
      'Create a free-text encryption key',
      'Scan every line of the API call log',
    ],
    expected:
      'At least 7 log lines exist; none contains the email, phone number, name or key value, and none contains a request-signature-shaped value.',
    type: 'Security',
    priority: 'High',
    preconditions: 'Needs approved test phone numbers',
  },
};
