import type { TestCaseCatalog } from './types';

export const WRITE_CASES: TestCaseCatalog = {
  'PII-WR-001': {
    what: 'Saves a brand-new email address for a fake test user and checks the service confirms it was stored.',
    why: 'Saving personal data is the most basic job of the PII service; if this fails, no other feature can work.',
    steps: [
      'Create a fake test user and a fake email address',
      'Send a signed save request for the EMAIL field',
      'Check the reply',
    ],
    expected:
      '201 Created; the reply confirms the same tenant, user and field EMAIL, and gives the encryption key version used (a whole number).',
    type: 'Positive',
    priority: 'High',
  },
  'PII-WR-002': {
    what: 'Saves a new email for a user who already has one, then reads it back to check the old value was replaced.',
    why: 'Users change their details; if a second save did not replace the first, other apps would keep getting the outdated email.',
    steps: [
      'Save an "old" email for a fake test user',
      'Save a "new" email for the same user and field',
      'Read the EMAIL field back',
    ],
    expected:
      '200 OK on the second save (not 201, because the field already existed); reading returns exactly one item whose value is the new email.',
    type: 'Positive',
    priority: 'High',
  },
  'PII-WR-003': {
    what: 'Saves an email using the field name written in mixed case ("eMail") and checks the service treats it as EMAIL.',
    why: 'Caller apps may not all spell field names the same way; the service must store them under one standard name so they can be found again.',
    steps: [
      'Send a save request with the field name "eMail"',
      'Check the field name in the reply',
      'Read the EMAIL field back and check its field name',
    ],
    expected:
      '201 Created; the reply shows field EMAIL (upper case), and reading it back also shows field EMAIL.',
    type: 'Positive',
    priority: 'Medium',
  },
  'PII-WR-004': {
    what: 'For each required part of a save request (tenant_id, user_id, field, value), sends a request with that part left out.',
    why: 'An incomplete request must never create a half-filled record; otherwise stored data would be broken or belong to no one.',
    steps: [
      'Build a valid save request for a NAME',
      'Remove one required part (tenant_id, user_id, field or value)',
      'Send the request',
      'When field or value was removed, try to read the NAME back',
    ],
    expected:
      '422 (the service\'s "request is incomplete or malformed" code) for every missing part; when field or value is missing, reading NAME returns 404 PII_NOT_FOUND, so nothing is saved.',
    type: 'Negative',
    priority: 'High',
  },
  'PII-WR-005': {
    what: 'For each of user_id, field and value, sends a save request where that part is an empty text ("").',
    why: 'An empty user, field name or value is meaningless; accepting it would store junk records that no one can use.',
    steps: [
      'Build a valid save request for a NAME',
      'Replace one part (user_id, field or value) with empty text',
      'Send the request',
    ],
    expected: '422 (the service\'s "request is incomplete or malformed" code) for every empty part.',
    type: 'Negative',
    priority: 'Medium',
  },
  'PII-WR-005b': {
    what: 'Sends a save request where the tenant_id (the customer/organisation the user belongs to) is an empty text.',
    why: 'Every record must belong to a tenant; data saved without one could leak between customers or be lost.',
    steps: ['Build a valid save request for a NAME', 'Set tenant_id to empty text', 'Send the request'],
    expected: '422 (the service\'s "request is incomplete or malformed" code).',
    type: 'Negative',
    priority: 'Medium',
  },
  'PII-WR-006': {
    what: 'Sends save requests where one part is one character longer than its documented maximum (tenant_id 65, user_id 129, field 65, value 1025 characters).',
    why: 'Size limits protect the service and its storage; if over-long values slipped through they could break other apps or the database.',
    steps: [
      'Build a valid save request for a NAME',
      'Make tenant_id, then user_id, then field, then value one character too long (one at a time)',
      'Send each request',
      'Try to read the NAME back',
    ],
    expected:
      '422 (the service\'s "request is incomplete or malformed" code) for each over-long part; reading NAME returns 404 PII_NOT_FOUND, so nothing is saved.',
    type: 'Negative',
    priority: 'Low',
  },
  'PII-WR-007': {
    what: 'Saves a NAME of exactly 1024 characters for a user ID of exactly 128 characters (the documented maximums) and reads it back.',
    why: 'Values right at the limit are allowed by the rules; rejecting or cutting them short would lose real customer data.',
    steps: [
      'Create a user ID of exactly 128 characters and a name of exactly 1024 characters',
      'Send a save request for the NAME field',
      'Read the NAME back',
    ],
    expected: '201 Created; reading returns the full 1024-character name unchanged.',
    type: 'Positive',
    priority: 'Low',
  },
  'PII-WR-008': {
    what: 'Tries to save an EMAIL value that has no "@" sign.',
    why: 'If invalid emails were accepted, other apps would later receive unusable data.',
    steps: [
      'Send a save request for EMAIL with a value that has no "@"',
      'Check the reply',
      'Try to read the EMAIL back',
    ],
    expected:
      '400 with error code VALIDATION_ERROR; reading EMAIL returns 404 PII_NOT_FOUND, so nothing is saved.',
    type: 'Negative',
    priority: 'High',
  },
  'PII-WR-009': {
    what: 'Tries to save PHONE values that do not have 8–15 digits after clean-up: 7 digits, 16 digits and no digits at all.',
    why: 'Phone numbers outside the allowed length cannot be real numbers; storing them would send unusable data to apps that call or text users.',
    steps: [
      'Send a save request for PHONE with a 7-digit value',
      'Send one with a 16-digit value',
      'Send one with no digits ("not-a-phone")',
      'Try to read the PHONE back',
    ],
    expected:
      '400 with error code VALIDATION_ERROR for each value; reading PHONE returns 404 PII_NOT_FOUND, so nothing is saved.',
    type: 'Negative',
    priority: 'High',
  },
  'PII-WR-010': {
    what: 'Tries to save a value under a field name the service does not support (taken from the test settings).',
    why: 'Only known kinds of personal data should be stored; accepting any field name would let apps store data nobody has approved.',
    steps: [
      'Pick the unsupported field name from the test settings',
      'Send a save request with that field name',
      'Check the reply',
    ],
    expected:
      'Rejected with 400, 403, 404 or 422 and a proper error body; exact status still to be confirmed, question Q-07.',
    type: 'Negative',
    priority: 'Medium',
  },
  'PII-WR-011': {
    what: 'Sends save requests where one part has the wrong data type: value as a number, tenant_id as null (empty), user_id as a list, field as an object.',
    why: 'The service must only accept text in these parts; wrong types could crash it or store garbage.',
    steps: [
      'Build a valid save request for a NAME',
      'Replace one part at a time with a wrong type (number, null, list, object)',
      'Send each request',
    ],
    expected: '422 (the service\'s "request is incomplete or malformed" code) for each wrong type.',
    type: 'Negative',
    priority: 'Medium',
  },
  'PII-WR-012': {
    what: 'Sends a correctly signed save request whose body is broken, cut-off JSON (the text format requests are written in).',
    why: 'A valid signature must not make the service trust a damaged request; it must refuse it cleanly instead of crashing or saving half the data.',
    steps: [
      'Prepare a request body that is cut off mid-way',
      'Sign and send it as a save request',
      'Check the reply',
    ],
    expected: '422 (the service\'s "request is incomplete or malformed" code).',
    type: 'Negative',
    priority: 'Low',
  },
  'PII-WR-013': {
    what: 'Tries to save a NAME made only of spaces, which becomes empty after clean-up.',
    why: 'A blank name is not real data; storing it would give other apps an empty value that looks like a real one.',
    steps: [
      'Send a save request for NAME with a value of five spaces',
      'Check the reply',
      'Try to read the NAME back',
    ],
    expected:
      'Rejected with 400 or 422; exact status still to be confirmed, question Q-10. Reading NAME returns 404 PII_NOT_FOUND, so nothing is saved.',
    type: 'Negative',
    priority: 'Medium',
  },
};
