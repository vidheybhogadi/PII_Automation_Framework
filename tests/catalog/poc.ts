import type { TestCaseCatalog } from './types';

export const POC_CASES: TestCaseCatalog = {
  'POC-001': {
    what: 'Saves a messy fake email (mixed case, spaces around it) for a brand-new fake test user through the Aisle facade (Aisle’s front door to the PII service).',
    why: 'Email is the first real personal field Aisle will store. If saving fails or the email is attached to the wrong user, sign-up and profile features break.',
    steps: [
      'Make a new fake user ID and a fake email for this run',
      'Send the save request for the EMAIL field with the token (the secret pass proving the caller is Aisle’s test app)',
      'Check the reply',
    ],
    expected:
      '201 Created (a new value was saved) with the message “PII write successful”. The reply names tenant “aisle” (the customer account the data belongs to), the same user ID, the field EMAIL and a key version (the number of the encryption key used) of 1 or more. The email itself is not repeated in the reply.',
    type: 'Positive',
    priority: 'Critical',
    preconditions:
      'Blocked until Dev gives the Aisle caller access to EMAIL (question BQ-01). Today the save returns 403 (refused: access denied), and the report shows that real reply.',
  },
  'POC-002': {
    what: 'Saves a messy fake email for a new fake test user, then reads the EMAIL field back through the Aisle facade (Aisle’s front door to the PII service).',
    why: 'Aisle compares and shows emails. If the stored email is not cleaned up the same way every time, logins and look-ups can fail.',
    steps: [
      'Save a messy fake email (capitals and spaces around it) for a new fake user',
      'Send a read request for that user asking for EMAIL',
      'Compare the returned value with the expected clean form',
    ],
    expected:
      '200 OK with the message “PII read successful”. Exactly one item (count 1) for that user, tenant “aisle” (the customer account the data belongs to) and field EMAIL. The value is the fake email in lower case with the outer spaces removed. This clean-up rule still has to be confirmed by Dev (question BQ-01).',
    type: 'Positive',
    priority: 'Critical',
    preconditions:
      'Blocked until Dev gives the Aisle caller access to EMAIL (question BQ-01). Today EMAIL calls return 403 (refused: access denied).',
  },
  'POC-003': {
    what: 'Saves a messy fake email, then looks up the stored record with an approved read-only database query (it can only look, never change anything).',
    why: 'If the email were stored as readable text, anyone with database access could read users’ emails.',
    steps: [
      'Save a messy fake email for a new fake user',
      'Run the read-only query for that user and the EMAIL field',
      'Check the user, field, tenant (the customer account) and key version (the number of the encryption key used)',
      'Search the stored value for the email as plain text, hex and Base64 (common ways to write text as characters)',
    ],
    expected:
      'Exactly one record for that user and EMAIL, under the same tenant as the save reply. Its key version matches the save reply (if the database stores one). Neither the typed nor the cleaned email appears in any readable form. This only shows the email is not readable. It does not prove it is encrypted; the encryption format is still waiting on Dev (question BQ-04).',
    type: 'Database',
    priority: 'Critical',
    preconditions:
      'Blocked until QA gets read-only database access and the table layout (question BQ-04), and EMAIL access is granted (question BQ-01).',
  },
};
