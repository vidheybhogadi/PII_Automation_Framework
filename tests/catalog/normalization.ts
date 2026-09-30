import type { TestCaseCatalog } from './types';

export const NORMALIZATION_CASES: TestCaseCatalog = {
  'AISLE-NRM-001': {
    what: 'Saves a fake name with spaces around it and several spaces between the words, then reads it back.',
    why: 'Names cleaned up the same way every time avoid duplicates and untidy display in the app.',
    steps: ['Save the messy fake name for a new fake user', 'Read the NAME field back'],
    expected:
      '200 OK. The value has the outer spaces removed and each run of inner spaces turned into one space. Capital letters are kept exactly as typed.',
    request:
      'POST /api/v1/pii-test {"user_id":"<new fake user>","field":"NAME","value":"   QA   Automation   User <letters>  "} · POST /api/v1/pii-test/read {"user_id":"<same user>","field_names":["NAME"]}',
    validation: [
      'Save succeeds',
      'Read status is 200',
      'The value equals “QA Automation User <letters>”: trimmed, single spaces, capitals kept',
    ],
    type: 'Positive',
    priority: 'High',
  },
  'AISLE-NRM-002': {
    what: 'Saves an approved test phone number (a number Dev confirmed is nobody’s real phone) written with spaces, dashes and brackets, then reads it back.',
    why: 'Phones typed in different formats must match the same stored number.',
    steps: [
      'Take an approved test phone from the settings',
      'Save it with formatting for a new fake user',
      'Read the PHONE field back',
    ],
    expected: '200 OK. The value is digits only.',
    request:
      'POST /api/v1/pii-test {"user_id":"<new fake user>","field":"PHONE","value":"<approved test phone with spaces, dashes, brackets>"} · POST /api/v1/pii-test/read {"user_id":"<same user>","field_names":["PHONE"]}',
    validation: ['Save succeeds', 'Read status is 200', 'The value contains digits only'],
    type: 'Positive',
    priority: 'High',
    preconditions:
      'Blocked: no approved test phone numbers yet, and PHONE access and the phone clean-up rule are not confirmed (question BQ-03).',
  },
  'AISLE-NRM-003': {
    what: 'Tries to save a 5-digit and a 16-digit value as a phone. Neither can be a real phone number (real international numbers have at most 15 digits).',
    why: 'Invalid phones would make texts and calls fail.',
    steps: ['Save a 5-digit phone for a new fake user', 'Save a 16-digit phone', 'Check both replies'],
    expected: 'Both are refused and nothing is saved. The exact status is waiting on Dev (question BQ-03).',
    request:
      'POST /api/v1/pii-test {"user_id":"<new fake user>","field":"PHONE","value":"12345"} · {… "value":"<16 digits>"}',
    validation: ['Both saves are refused', 'Nothing is saved for the user'],
    type: 'Negative',
    priority: 'Medium',
    preconditions:
      'Blocked: PHONE access and the phone length rule are not confirmed for the facade (question BQ-03).',
  },
};
