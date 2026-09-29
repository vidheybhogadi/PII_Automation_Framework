import type { TestCaseCatalog } from './types';

export const NORMALIZATION_CASES: TestCaseCatalog = {
  'AISLE-NRM-001': {
    what: 'Saves a fake name with spaces around it and several spaces between the words, then reads it back.',
    why: 'Names cleaned up the same way every time avoid duplicates and untidy display in the app.',
    steps: ['Save the messy fake name for a new fake user', 'Read the NAME field back'],
    expected:
      '200 OK. The value has the outer spaces removed and each run of inner spaces turned into one space. Capital letters are kept exactly as typed.',
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
    type: 'Negative',
    priority: 'Medium',
    preconditions:
      'Blocked: PHONE access and the phone length rule are not confirmed for the facade (question BQ-03).',
  },
};
