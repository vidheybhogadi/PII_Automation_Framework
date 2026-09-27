import type { TestCaseCatalog } from './types';

export const BATCH_READ_CASES: TestCaseCatalog = {
  'PII-BR-001': {
    what: 'Saves an email and a name for 2 fake users, then reads both fields for both users in one bulk request.',
    why: 'Bulk read lets apps fetch many people’s details at once; every user-field pair must come back with the right value.',
    steps: [
      'Save a fake email and name for 2 fake users',
      'Send one bulk read for both users and fields EMAIL and NAME',
      'Check each returned value against what was saved',
    ],
    expected:
      '200 OK with message "PII batch read successful"; tenant matches, count is 4, the 4 user-field pairs are exactly the expected ones, and each value equals the saved one.',
    type: 'Positive',
    priority: 'High',
  },
  'PII-BR-002': {
    what: 'Saves an email and name for one user but only an email for a second, then bulk reads both fields for both.',
    why: 'Users often lack some details; bulk read should return what exists without failing or inventing empty values.',
    steps: [
      'Save an email and name for user 1',
      'Save only an email for user 2',
      'Bulk read EMAIL and NAME for both users',
      'Check which pairs come back',
    ],
    expected:
      '200 OK; count is 3 and the pairs are user 1 EMAIL, user 1 NAME and user 2 EMAIL (user 2 NAME is left out).',
    type: 'Positive',
    priority: 'High',
  },
  'PII-BR-003': {
    what: 'Bulk reads the email of two users, where only the first user has any saved data.',
    why: 'The service treats a user with no requested data as a failure of the whole request; callers must get a clear not-found answer.',
    steps: [
      'Save a fake email for user 1',
      'Leave user 2 with no saved data',
      'Bulk read EMAIL for both users',
      'Check the error returned',
    ],
    expected: '404 Not Found with error code PII_NOT_FOUND.',
    type: 'Negative',
    priority: 'High',
  },
  'PII-BR-004': {
    what: 'Saves an email for as many users as the maximum bulk size, then bulk reads EMAIL for all of them.',
    why: 'Apps must be able to use the full allowed bulk size; a request right at the limit must not be wrongly rejected.',
    steps: [
      'Read the maximum bulk size (users × fields) for this environment',
      'Save an email for that many fake users',
      'Bulk read EMAIL for all of them',
      'Check the count',
    ],
    expected: '200 OK; count equals the maximum bulk size. Skipped if the limit is above 200 users.',
    type: 'Positive',
    priority: 'Medium',
    preconditions: 'Uses the environment’s limit (guide value until Dev confirms)',
  },
  'PII-BR-005': {
    what: 'Saves an email for one more user than the maximum bulk size, then bulk reads EMAIL for all of them.',
    why: 'The size limit protects the service from overload; a request just over it must be refused.',
    steps: [
      'Read the maximum bulk size for this environment',
      'Save an email for (maximum + 1) fake users so none are missing',
      'Bulk read EMAIL for all of them',
      'Check the response is a rejection',
    ],
    expected:
      'Rejected with 400, 413 or 422 and a recognised error body; any of these accepted until Dev question Q-19 is answered. Skipped if maximum + 1 is above 200 users.',
    type: 'Negative',
    priority: 'Medium',
    preconditions: 'Uses the environment’s limit (guide value until Dev confirms)',
  },
  'PII-BR-006': {
    what: 'Saves an email for a user, then bulk reads with the same user ID twice and the EMAIL field twice.',
    why: 'Repeated entries must not produce duplicate results, which could confuse callers or double-count people.',
    steps: [
      'Save a fake email for a fake user',
      'Bulk read with that user ID listed twice and EMAIL listed twice',
      'Check how many items come back',
    ],
    expected:
      '200 OK; count is 1 and the only item is that user’s EMAIL (whether repeats count toward the size limit is Dev question Q-20, not checked here).',
    type: 'Positive',
    priority: 'Low',
  },
  'PII-BR-007': {
    what: 'Sends four invalid bulk reads: no user IDs, no fields, 201 user IDs (over 200), and 65 fields (over 64).',
    why: 'Empty or oversized bulk requests are caller mistakes or abuse and must be rejected before any data is read.',
    steps: [
      'Bulk read with an empty user list',
      'Bulk read with an empty field list',
      'Bulk read EMAIL for 201 user IDs',
      'Bulk read 65 made-up fields for one user',
    ],
    expected:
      'Empty lists: 422 Unprocessable Entity (request validation error). Too many users or fields: rejected with 400, 413 or 422 and a recognised error body (exact status is Dev question Q-19).',
    type: 'Negative',
    priority: 'Medium',
  },
};
