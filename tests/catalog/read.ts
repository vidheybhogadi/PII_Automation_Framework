import type { TestCaseCatalog } from './types';

export const READ_CASES: TestCaseCatalog = {
  'PII-RD-001': {
    what: 'Saves a fake email for a fake user, then reads it back through the read endpoint.',
    why: 'Other apps rely on getting back exactly what they stored; a wrong or missing value would break sign-in, messaging and more.',
    steps: [
      'Save a fake email for a fake user',
      'Send a signed read request for the EMAIL field',
      'Compare the returned value with what was saved',
    ],
    expected:
      '200 OK with message "PII read successful"; count is 1, the one item has the same tenant, user and EMAIL field, and its value equals the saved email.',
    type: 'Positive',
    priority: 'High',
  },
  'PII-RD-002': {
    what: 'Saves an email, phone and name for one user, then reads all three fields in a single request.',
    why: 'Apps often need several details at once; every requested value must come back correctly in one call.',
    steps: [
      'Save a fake email, phone and name for a fake user',
      'Send one read request for EMAIL, PHONE and NAME',
      'Check each returned value against what was saved',
    ],
    expected:
      '200 OK; count is 3, the fields returned are exactly EMAIL, NAME and PHONE, and each value equals the saved one.',
    type: 'Positive',
    priority: 'High',
    preconditions: 'Needs approved test phone numbers',
  },
  'PII-RD-003': {
    what: 'Saves an email and a name for a user, then asks only for the name.',
    why: 'Returning more personal data than asked for leaks information the caller did not need or may not be allowed to see.',
    steps: [
      'Save a fake email and name for a fake user',
      'Send a read request for the NAME field only',
      'Check which fields come back',
    ],
    expected: '200 OK; only the NAME field is returned and count is 1 (no EMAIL).',
    type: 'Positive',
    priority: 'Medium',
  },
  'PII-RD-004': {
    what: 'Saves only an email for a user, then asks for email, phone and name together.',
    why: 'A user missing some details is normal; the service should return what it has instead of failing the whole request.',
    steps: [
      'Save only a fake email for a fake user',
      'Send a read request for EMAIL, PHONE and NAME',
      'Check which fields come back',
    ],
    expected:
      '200 OK; only EMAIL is returned and count is 1; the missing PHONE and NAME are simply left out.',
    type: 'Positive',
    priority: 'High',
  },
  'PII-RD-005': {
    what: 'Saves only an email for a user, then asks for phone and name, which the user does not have.',
    why: 'Callers need a clear "nothing found" answer rather than an empty success or a crash, so they can handle the missing data properly.',
    steps: [
      'Save only a fake email for a fake user',
      'Send a read request for PHONE and NAME only',
      'Check the error returned',
    ],
    expected: '404 Not Found with error code PII_NOT_FOUND.',
    type: 'Negative',
    priority: 'High',
  },
  'PII-RD-006': {
    what: 'Reads the email of a user ID that was never saved.',
    why: 'Asking about an unknown user must give a clear "not found", not someone else’s data or a server error.',
    steps: [
      'Pick a fake user ID that has never been saved',
      'Send a read request for its EMAIL field',
      'Check the error returned',
    ],
    expected: '404 Not Found with error code PII_NOT_FOUND.',
    type: 'Negative',
    priority: 'High',
  },
  'PII-RD-007': {
    what: 'Sends a read request with an empty list of fields to read.',
    why: 'A request that asks for nothing is a caller mistake and should be rejected clearly rather than silently accepted.',
    steps: [
      'Build a read request for a fake user with no field names',
      'Send it',
      'Check the error returned',
    ],
    expected: '422 Unprocessable Entity (request validation error) with a recognised error body.',
    type: 'Negative',
    priority: 'Medium',
  },
  'PII-RD-008': {
    what: 'Sends three read requests, each missing one required part: the tenant ID, the user ID, or the list of fields.',
    why: 'Incomplete requests must be rejected up front so the service never guesses which tenant or user was meant.',
    steps: [
      'Build a complete read request',
      'Send it without the tenant ID',
      'Send it without the user ID',
      'Send it without the field names',
    ],
    expected:
      '422 Unprocessable Entity (request validation error) with a recognised error body for each of the three requests.',
    type: 'Negative',
    priority: 'Medium',
  },
  'PII-RD-009': {
    what: 'Saves an email and a name for a user, reads both, and checks the response is self-consistent.',
    why: 'If the count disagrees with the items, or an item carries another tenant or user, callers could mix up people’s data.',
    steps: [
      'Save a fake email and name for a fake user',
      'Send a read request for EMAIL and NAME',
      'Compare the count with the number of items',
      'Check the tenant and user on every item',
    ],
    expected:
      '200 OK; count equals the number of items, and every item has the requested tenant and user ID.',
    type: 'Positive',
    priority: 'Low',
  },
};
