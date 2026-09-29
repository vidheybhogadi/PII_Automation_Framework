import type { TestCaseCatalog } from './types';

export const CONTRACT_CASES: TestCaseCatalog = {
  'AISLE-CON-001': {
    what: 'Calls health, save, read and bulk read (one request for several users) with fake data, and compares the field names in each reply with the list seen on staging.',
    why: 'Apps break without warning when reply fields appear, disappear or get renamed.',
    steps: [
      'Call health, save a fake name, read it, and bulk read two fake users',
      'Compare each reply’s field names with the agreed list',
    ],
    expected:
      'Every reply has exactly status, message, data and error. The data has exactly the fields seen today (for example, a save has tenant_id, user_id, field and key_version). The tenant (customer account) is always “aisle”. Only field names are compared, never values.',
    type: 'Contract',
    priority: 'High',
    endpoint: 'crossEndpoint',
  },
  'AISLE-CON-002': {
    what: 'Triggers three kinds of error (a read with no token, a save with a broken body and a save with an empty value) and records the format of each reply.',
    why: 'Apps must read error replies reliably. This catches format changes early.',
    steps: [
      'Send a read with no token and check the 401 reply',
      'Send a save with a broken body and check the 400 reply',
      'Send a save with an empty value and check the 422 reply',
    ],
    expected:
      '401 (refused: not signed in): empty body, sent as a web page (text/html). 400 (refused: body could not be read): exactly status false, error “Invalid JSON” and message “Request body must be valid JSON”. 422 (refused: request format invalid): only a “detail” list of problems. These are today’s formats; the intended single format is waiting on Dev (question BQ-09).',
    type: 'Contract',
    priority: 'Medium',
    endpoint: 'crossEndpoint',
  },
};
