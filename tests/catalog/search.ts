import type { TestCaseCatalog } from './types';

export const SEARCH_CASES: TestCaseCatalog = {
  'PII-SR-001': {
    what: 'Saves a fake email for a fake user, then searches for that exact email without asking for values.',
    why: 'Search is used to find who owns a detail; by default it must return only user IDs so personal data is not exposed.',
    steps: [
      'Save a fake email for a fake user',
      'Search the EMAIL field for that email with values turned off',
      'Check the matches and scan the whole response for the email',
    ],
    expected:
      '200 OK with message "PII search successful"; count is 1, truncated (a flag saying there were more matches than returned) is false, the only match is our user ID with nothing else, and the email appears nowhere in the response.',
    type: 'Positive',
    priority: 'High',
  },
  'PII-SR-002': {
    what: 'Saves a fake email, then searches for it written in mixed capital letters with extra spaces around it.',
    why: 'Users type emails in many ways; search must clean up (normalise) the input so the same person is still found.',
    steps: [
      'Save a fake email for a fake user',
      'Search for it in mixed capital letters with spaces before and after',
      'Check the matches',
    ],
    expected: '200 OK; the only match is our user ID.',
    type: 'Positive',
    priority: 'Medium',
  },
  'PII-SR-003': {
    what: 'Saves a digits-only phone number, then searches for it written with a plus sign, spaces, brackets and a dash.',
    why: 'Phone numbers are typed in many formats; search must strip the formatting so the stored number is still found.',
    steps: [
      'Save an approved test phone (digits only) for a fake user',
      'Search the PHONE field using a formatted version like +91 (987) 654-3210, limit 100',
      'Check the matches',
    ],
    expected:
      '200 OK; our user ID is among the matches (other test users may share the number) unless the result is truncated, and count equals the number of matches.',
    type: 'Positive',
    priority: 'Medium',
    preconditions: 'Needs approved test phone numbers',
  },
  'PII-SR-004': {
    what: 'Searches for a fake email that nobody has saved.',
    why: 'Callers must get a clear "no match" answer they can handle, not a server error or someone else’s ID.',
    steps: ['Pick a fake email that was never saved', 'Search the EMAIL field for it', 'Check the response'],
    expected:
      'Either 200 OK with count 0, no matches and truncated false, or 404 Not Found with error code PII_NOT_FOUND; both accepted until Dev question Q-08 is answered.',
    type: 'Negative',
    priority: 'High',
  },
  'PII-SR-005': {
    what: 'Saves the same email for 3 different users, then searches for that email.',
    why: 'Shared details (e.g. a family email) are real; search must return every owner, not just the first one found.',
    steps: [
      'Save the same fake email for 3 fake users',
      'Search for that email with a limit of 10',
      'Compare the returned user IDs with the 3 users',
    ],
    expected: '200 OK; count is 3, truncated is false, and the matches are exactly the 3 user IDs.',
    type: 'Positive',
    priority: 'High',
  },
  'PII-SR-006': {
    what: 'Saves the same email for 3 users, then searches with a limit of 2.',
    why: 'The limit protects the service and callers from huge responses; callers must also be told that more matches exist.',
    steps: [
      'Save the same fake email for 3 fake users',
      'Search for that email with a limit of 2',
      'Check the count, the truncated flag and the returned IDs',
    ],
    expected:
      '200 OK; count is 2, truncated (a flag saying there were more matches than returned) is true, and every returned ID is one of the 3 users.',
    type: 'Positive',
    priority: 'Medium',
  },
  'PII-SR-007': {
    what: 'Saves the same email for 2 users, then searches with a limit of exactly 2.',
    why: 'The guide says truncated is set when matches reach the limit; callers depend on this flag to decide whether to search again.',
    steps: [
      'Save the same fake email for 2 fake users',
      'Search for that email with a limit of 2',
      'Check the count and the truncated flag',
    ],
    expected:
      '200 OK; count is 2 and truncated is true (guide wording taken literally; see Dev question Q-09).',
    type: 'Positive',
    priority: 'Medium',
  },
  'PII-SR-008': {
    what: 'Saves the same email for one more user than the default search limit, then searches without giving a limit.',
    why: 'Without a limit, search must fall back to the default so one request cannot return an unbounded list of users.',
    steps: [
      'Read the default search limit for this environment',
      'Save the same fake email for (default limit + 1) fake users',
      'Search for that email without a limit',
      'Check the count and the truncated flag',
    ],
    expected: '200 OK; count equals the default limit and truncated is true.',
    type: 'Positive',
    priority: 'Medium',
    preconditions: 'Uses the environment’s limit (guide value until Dev confirms)',
  },
  'PII-SR-009': {
    what: 'Sends email searches with limits outside the allowed range of 1–100: 0, 101 and -1.',
    why: 'Out-of-range limits could return nothing useful or overload the service, so they must be rejected clearly.',
    steps: ['Search for a fake email with limit 0', 'Repeat with limit 101', 'Repeat with limit -1'],
    expected:
      '422 Unprocessable Entity (request validation error) with a recognised error body for each limit.',
    type: 'Negative',
    priority: 'Medium',
  },
  'PII-SR-010': {
    what: 'Saves a fake email, then searches for it in messy form (mixed capitals, extra spaces) with values turned on.',
    why: 'Apps that ask for values need the correct owner and the stored, cleaned-up value, not the messy text they typed.',
    steps: [
      'Save a fake email for a fake user',
      'Search for it in mixed capitals with extra spaces, asking for values',
      'Check the returned tenant, user, field and value',
    ],
    expected:
      '200 OK; count is 1 and the match has our tenant, user ID, field EMAIL, and a value equal to the saved (clean) email.',
    type: 'Positive',
    priority: 'Medium',
  },
  'PII-SR-011': {
    what: 'Sends three bad email searches: one without a value, one without a tenant ID, and one where "include values" is "maybe" instead of true/false.',
    why: 'Incomplete or wrongly typed requests must be rejected so the service never searches the wrong tenant or guesses the caller’s intent.',
    steps: [
      'Search EMAIL with a tenant ID but no value',
      'Search EMAIL with a value but no tenant ID',
      'Search EMAIL with include values set to "maybe"',
    ],
    expected:
      '422 Unprocessable Entity (request validation error) with a recognised error body for each of the three requests.',
    type: 'Negative',
    priority: 'Medium',
  },
  'PII-SR-012': {
    what: 'Searches a field that is configured as not searchable.',
    why: 'Some personal data must never be looked up by value; the service must refuse such searches.',
    steps: [
      'Take the non-searchable field name from the environment settings',
      'Search that field for any value',
      'Check the response is a rejection',
    ],
    expected:
      'Rejected with 400, 403, 404 or 422 and a recognised error body; any of these accepted until Dev question Q-18 is answered.',
    type: 'Negative',
    priority: 'Medium',
    preconditions:
      'Waiting on Dev question Q-18 (which fields are not searchable) — shows as Not Tested until answered',
  },
};
