import type { TestCaseCatalog } from './types';

const SEARCH_ACCESS =
  'Needs EMAIL and search access for the Aisle caller (granted on 2026-10-01). If search is refused with 403 (access denied), the test is marked Blocked and the report shows that real reply.';

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
      '200 OK. The fake user ID is in the results, and no result contains an email value. Seen on staging on 2026-10-01.',
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
      '200 OK. The result for the fake user contains the email in lower case with outer spaces removed. Seen on staging on 2026-10-01.',
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
      '200 OK. Exactly 1 result, and “truncated” is true. Seen on staging on 2026-10-01 (see AISLE-SR-016 for the edge case, question BQ-41).',
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
      'Both get 422 (refused: the request format is invalid), naming the limit as below 1 or above 100. No results are returned. Range seen on staging on 2026-09-29.',
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
      '200 OK. The reply data has exactly these parts: tenant_id, field, matches, count and truncated. The list of matches is empty, the count is 0, and “truncated” (the flag meaning “more results were cut off”) is false. No user ID or email is returned. Seen on staging on 2026-10-01.',
    request:
      'POST /api/v1/pii-test/EMAIL/search {"value":"<never-saved fake email>","limit":10,"include_values":false}',
    validation: [
      'Status is 200',
      'Reply data has exactly tenant_id, field, matches, count, truncated',
      'matches is empty',
      'count is 0',
      'truncated is false',
    ],
    type: 'Negative',
    priority: 'Medium',
    preconditions: SEARCH_ACCESS,
  },
  'AISLE-SR-006': {
    what: 'Saves a fake email for a fake user, then searches with wildcard characters (%, _, *, .*) on their own and inside email-shaped patterns.',
    why: 'If wildcards worked, anyone could list other people’s emails by searching “%”. Search must only find exact matches.',
    steps: [
      'Save a fake email for a new fake user',
      'Search for %, _, *, .* and “start of the email + %”',
      'Search for email-shaped patterns such as “%@example.test”',
      'Check the fake user is never found',
    ],
    expected:
      'Values that are not an email get 400 VALIDATION_ERROR with no data. Email-shaped patterns get 200 OK and never include the fake user. Seen on 2026-10-01.',
    request:
      'POST /api/v1/pii-test/EMAIL/search {"value":"%","limit":100,"include_values":false} · {"value":"%@example.test",…}',
    validation: [
      'Non-email wildcards → 400 VALIDATION_ERROR, no data',
      'Email-shaped wildcards → 200 without the fake user',
      'No server error (5xx)',
    ],
    type: 'Security',
    priority: 'Critical',
    preconditions: SEARCH_ACCESS,
  },
  'AISLE-SR-007': {
    what: 'Saves a fake email, then searches for parts of it: only the name part, only the domain, “@domain”, the first 10 characters and the email without its first 5 characters.',
    why: 'Partial matching would let someone find people from a fragment of their email. Search must be exact.',
    steps: [
      'Save a fake email for a new fake user',
      'Search for each part of the email',
      'Check the fake user is never found',
    ],
    expected:
      'Parts that are not an email get 400 VALIDATION_ERROR. Email-shaped parts (“@domain”, the shortened email) get 200 OK without the fake user. Seen on 2026-10-01.',
    request:
      'POST /api/v1/pii-test/EMAIL/search {"value":"<name part only>",…} · {"value":"@example.test",…}',
    validation: ['Non-email parts → 400 VALIDATION_ERROR', 'Email-shaped parts → 200 without the fake user'],
    type: 'Security',
    priority: 'Critical',
    preconditions: SEARCH_ACCESS,
  },
  'AISLE-SR-008': {
    what: 'Saves fake email A for a fake user, replaces it with fake email B, then searches for A and for B.',
    why: 'After someone changes their email, the old address must no longer lead to them.',
    steps: ['Save email A, then email B for the same fake user', 'Search for email A', 'Search for email B'],
    expected:
      'Search for A: 200 OK without the user. Search for B: 200 OK with the user. Seen on 2026-10-01.',
    request:
      'POST /api/v1/pii-test/EMAIL/search {"value":"<old fake email>",…} · {"value":"<new fake email>",…}',
    validation: ['Old email does not find the user', 'New email finds the user'],
    type: 'Positive',
    priority: 'High',
    preconditions: SEARCH_ACCESS,
  },
  'AISLE-SR-009': {
    what: 'Saves an email-looking text as a fake user’s NAME (not EMAIL), then runs an EMAIL search for that text.',
    why: 'An EMAIL search must only look at emails; mixing fields could expose the wrong data.',
    steps: [
      'Save an email-looking text as NAME',
      'Search the EMAIL field for it',
      'Check the fake user is not found',
    ],
    expected: '200 OK without the fake user. Seen on 2026-10-01.',
    request:
      'POST /api/v1/pii-test {"field":"NAME","value":"<fake email text>"} · POST /api/v1/pii-test/EMAIL/search {"value":"<same text>",…}',
    validation: ['Status 200', 'The fake user is not in the matches'],
    type: 'Negative',
    priority: 'High',
    preconditions: SEARCH_ACCESS,
  },
  'AISLE-SR-010': {
    what: 'Saves the same fake email for two fake users, then searches for it with values switched on (asking for the emails too).',
    why: 'Shared emails (for example a family address) must return every owner, each with the right email.',
    steps: [
      'Save one fake email for two new fake users',
      'Search for it with values on',
      'Check both users and their emails',
    ],
    expected:
      '200 OK with count 2, “truncated” false, both user IDs, and each match has exactly tenant_id, user_id, field and value, the value being the email. Seen on 2026-10-01.',
    request:
      'POST /api/v1/pii-test/EMAIL/search {"value":"<shared fake email>","limit":10,"include_values":true}',
    validation: [
      'Count 2 and both users found',
      'Each match has exactly 4 fields',
      'Each value is the email',
    ],
    type: 'Positive',
    priority: 'Medium',
    preconditions: SEARCH_ACCESS,
  },
  'AISLE-SR-011': {
    what: 'Saves one fake email for two fake users, then searches with limit 1 (the smallest allowed) and limit 100 (the largest).',
    why: 'The edge values of the allowed range must work, not only the middle.',
    steps: ['Save a shared fake email for two users', 'Search with limit 1', 'Search with limit 100'],
    expected: 'Both are 200 OK: limit 1 returns 1 match, limit 100 returns both. Seen on 2026-10-01.',
    request:
      'POST /api/v1/pii-test/EMAIL/search {"value":"<shared fake email>","limit":1,…} · {… "limit":100}',
    validation: ['Limit 1 → 1 match', 'Limit 100 → 2 matches'],
    type: 'Positive',
    priority: 'Medium',
    preconditions: SEARCH_ACCESS,
  },
  'AISLE-SR-013': {
    what: 'Searches for a saved fake email with settings of the wrong type: limit 10.5, limit "10" (text), limit 10.0, and the values switch as "true", "yes" and 1.',
    why: 'Records how strictly the service checks settings, so a typo cannot silently change what is returned.',
    steps: [
      'Save a fake email',
      'Search with limit 10.5',
      'Search with the other wrong-type settings',
      'Check the replies',
    ],
    expected:
      'limit 10.5 → 422 Unprocessable Entity naming the limit. limit "10" and 10.0 are accepted (200). "true", "yes" and 1 switch values on (200 with the email). Seen on 2026-10-01; whether this leniency is intended is open (question BQ-40).',
    request:
      'POST /api/v1/pii-test/EMAIL/search {"value":"<fake email>","limit":10.5,…} · {"limit":"10",…} · {"include_values":"yes",…}',
    validation: [
      '10.5 → 422 naming limit',
      '"10" and 10.0 → 200 with the user',
      '"true" / "yes" / 1 → values returned',
    ],
    type: 'Negative',
    priority: 'Low',
    preconditions: SEARCH_ACCESS,
  },
  'AISLE-SR-014': {
    what: 'Searches with an empty value, a value of only spaces, and a value that is not an email.',
    why: 'Empty or meaningless searches must be refused, never treated as “match everything”.',
    steps: ['Search with ""', 'Search with "   "', 'Search with a non-email text'],
    expected:
      'Empty and blank values get 422 Unprocessable Entity naming the value. The non-email text gets 400 VALIDATION_ERROR with no data. Seen on 2026-10-01.',
    request:
      'POST /api/v1/pii-test/EMAIL/search {"value":"","limit":10,"include_values":false} · {"value":"   "} · {"value":"qa-auto-not-an-email"}',
    validation: [
      '"" and "   " → 422 naming value',
      'Non-email → 400 VALIDATION_ERROR, no data',
      'No server error (5xx)',
    ],
    type: 'Negative',
    priority: 'Medium',
    preconditions: SEARCH_ACCESS,
  },
  'AISLE-SR-015': {
    what: 'Sends the same fake search to the NAME, PHONE and a made-up field instead of EMAIL.',
    why: 'Only the EMAIL search is documented. QA records what the other fields do, so nothing is exposed by accident.',
    steps: [
      'Search the NAME field',
      'Search the PHONE field with an email-like value',
      'Search a made-up field',
    ],
    expected:
      'NAME: 200 OK with field NAME and no matches. PHONE: 400 VALIDATION_ERROR (the value is not a phone) with no data. Made-up field: 403 AUTHORIZATION_DENIED with no data. Seen on 2026-10-01; NAME search is undocumented (question BQ-32).',
    request:
      'POST /api/v1/pii-test/NAME/search {"value":"<fake email>","limit":10,"include_values":false} · /PHONE/search · /QA_AUTOMATION_UNKNOWN_FIELD/search',
    validation: [
      'NAME → 200, field NAME, no matches',
      'PHONE → 400 VALIDATION_ERROR, no data',
      'Made-up field → 403, no data',
    ],
    type: 'Negative',
    priority: 'Low',
  },
  'AISLE-SR-016': {
    what: 'Saves one fake email for two fake users and searches with limit 2, so exactly as many users match as the limit allows.',
    why: '“Truncated” tells apps that more results exist. A wrong flag makes apps ask for pages that do not exist.',
    steps: [
      'Save a shared fake email for two users',
      'Search with limit 2',
      'Check the count and the “truncated” flag',
    ],
    expected:
      'Count 2 and “truncated” false (nothing was cut off). Blocked: on 2026-10-01 the reply said truncated true; Dev must confirm what the flag means (question BQ-41).',
    request:
      'POST /api/v1/pii-test/EMAIL/search {"value":"<shared fake email>","limit":2,"include_values":false}',
    validation: ['Count is 2', '“truncated” is false'],
    type: 'Positive',
    priority: 'Medium',
    preconditions: 'Blocked until Dev confirms what “truncated” means (question BQ-41).',
  },
};
