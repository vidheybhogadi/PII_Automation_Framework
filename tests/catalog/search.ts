import type { TestCaseCatalog } from './types';

const SEARCH_ACCESS =
  'Needs EMAIL and search access for the Aisle caller (granted on 2026-10-01, question BQ-01). If search is refused with 403 (access denied), the test is marked Blocked and the report shows that real reply.';

export const SEARCH_CASES: TestCaseCatalog = {
  'AISLE-SR-001': {
    what: 'Saves a fake email for a new fake test user, then searches for it written in capitals with extra spaces, with values switched off (asking for user IDs only).',
    why: 'Aisle looks users up by email. Search must ignore case and spacing, and must not hand out emails nobody asked for.',
    steps: [
      'Save a fake email for a new fake user',
      'Search the EMAIL field for the same email in capitals with spaces around it, with values off',
      'Check the results',
    ],
    expected:
      '200 OK. The fake user ID is in the results, and no result contains an email value. The reply format and the case/space rule still need Dev’s confirmation (question BQ-01).',
    request:
      'POST /api/v1/pii-test {"user_id":"<new fake user>","field":"EMAIL","value":"qa.auto.<run>@example.test"} · POST /api/v1/pii-test/EMAIL/search {"value":"  QA.AUTO.<RUN>@EXAMPLE.TEST  ","limit":10,"include_values":false}',
    validation: [
      'Search status is 200',
      'The fake user ID is among the matches',
      'No match contains a value (user IDs only)',
    ],
    type: 'Positive',
    priority: 'High',
    preconditions: SEARCH_ACCESS,
  },
  'AISLE-SR-002': {
    what: 'Saves a fake email for a new fake test user, then searches for it with values switched on.',
    why: 'Callers that are allowed to see values must get the clean stored form.',
    steps: [
      'Save a fake email for a new fake user',
      'Search the EMAIL field with values on',
      'Check the result',
    ],
    expected:
      '200 OK. The result for the fake user contains the email in lower case with outer spaces removed. Reply format to be confirmed by Dev (question BQ-01).',
    request:
      'POST /api/v1/pii-test (fake email) · POST /api/v1/pii-test/EMAIL/search {"value":"qa.auto.<run>@example.test","limit":10,"include_values":true}',
    validation: [
      'Search status is 200',
      'The fake user is among the matches',
      'Its value equals the fake email in lower case, trimmed',
    ],
    type: 'Positive',
    priority: 'Medium',
    preconditions: SEARCH_ACCESS,
  },
  'AISLE-SR-003': {
    what: 'Saves the same fake email for two new fake test users, then searches with a limit (the most results to return) of 1.',
    why: 'The limit keeps results small and safe. The caller must be told that more matches exist.',
    steps: [
      'Save one fake email for two new fake users',
      'Search for that email with limit 1',
      'Check the number of results and the “truncated” flag (a yes/no that says results were cut off)',
    ],
    expected:
      '200 OK. Exactly 1 result, and “truncated” is true. The meaning of “truncated” still needs Dev’s confirmation (question BQ-01).',
    request:
      'POST /api/v1/pii-test (same fake email for users A and B) · POST /api/v1/pii-test/EMAIL/search {"value":"<that email>","limit":1,"include_values":false}',
    validation: ['Search status is 200', 'Exactly 1 match', '“truncated” is true'],
    type: 'Positive',
    priority: 'Medium',
    preconditions: SEARCH_ACCESS,
  },
  'AISLE-SR-004': {
    what: 'Searches for a fake email with a limit (the most results to return) of 0, then of 101.',
    why: 'Unlimited searches could be used to pull out large amounts of personal data.',
    steps: ['Search with limit 0', 'Search with limit 101'],
    expected:
      'Both get 422 (refused: the request format is invalid), naming the limit as below 1 or above 100. No results are returned. This runs today: the format check happens before the access check (question BQ-14). Range seen on staging; Dev to confirm (question BQ-05).',
    request:
      'POST /api/v1/pii-test/EMAIL/search {"value":"<fake email>","limit":0,"include_values":false} · POST /api/v1/pii-test/EMAIL/search {… "limit":101}',
    validation: ['Limit 0 → 422 naming limit', 'Limit 101 → 422 naming limit'],
    type: 'Negative',
    priority: 'Medium',
  },
  'AISLE-SR-005': {
    what: 'Makes a fake email address that has never been saved (unique to this test run) and searches the EMAIL field for it, with values switched off (asking for user IDs only).',
    why: '“Nobody found” is a normal answer. The app must get a clean, empty reply, not an error and not someone else’s data.',
    steps: [
      'Make a fake email that was never saved',
      'Search the EMAIL field for it, with values off',
      'Check the reply is 200 with an empty list and a count of 0',
    ],
    expected:
      '200 OK with the message “PII search successful”. The reply data has exactly these parts: tenant_id, field, matches, count and truncated. The list of matches is empty, the count is 0, and “truncated” (the flag meaning “more results were cut off”) is false. No user ID or email is returned. Seen on staging on 2026-10-01; Dev still to confirm it is intended (question BQ-13).',
    request:
      'POST /api/v1/pii-test/EMAIL/search {"value":"<never-saved fake email>","limit":10,"include_values":false}',
    validation: [
      'Status is 200 with message “PII search successful”',
      'Reply data has exactly tenant_id, field, matches, count, truncated',
      'matches is empty',
      'count is 0',
      'truncated is false',
    ],
    type: 'Negative',
    priority: 'Medium',
    preconditions: SEARCH_ACCESS,
  },
};
