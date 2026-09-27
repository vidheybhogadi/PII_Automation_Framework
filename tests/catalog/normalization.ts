import type { TestCaseCatalog } from './types';

export const NORMALIZATION_CASES: TestCaseCatalog = {
  'PII-NRM-001': {
    what: 'Saves an email with extra spaces around it and mixed upper/lower case letters, then reads it back.',
    why: 'The same email typed differently must be stored the same way; otherwise searches and matching would miss users.',
    steps: [
      'Create a fake email and add spaces around it and upper-case letters',
      'Save it as the EMAIL field',
      'Read the EMAIL back',
    ],
    expected:
      '201 Created on save; 200 OK on read with exactly one item whose value is the email trimmed and in lower case.',
    type: 'Positive',
    priority: 'Medium',
  },
  'PII-NRM-002': {
    what: 'Saves a phone number written with "+", brackets, spaces and a dash, then reads it back.',
    why: 'Phones arrive in many formats; storing digits only means every app gets one consistent format it can dial or match.',
    steps: [
      'Take an approved test phone number',
      'Format it like "+91 (987) 654-3210"',
      'Save it as the PHONE field',
      'Read the PHONE back',
    ],
    expected: '201 Created on save; 200 OK on read with exactly one item whose value is digits only.',
    type: 'Positive',
    priority: 'Medium',
    preconditions: 'Needs approved test phone numbers',
  },
  'PII-NRM-003': {
    what: 'Saves a name with extra spaces at the start, end and between words, then reads it back.',
    why: "Stray spaces make the same name look different; they should be tidied, but the person's capital letters must be kept.",
    steps: [
      'Create a fake mixed-case name and add extra spaces around and between the words',
      'Save it as the NAME field',
      'Read the NAME back',
    ],
    expected:
      '201 Created on save; 200 OK on read with exactly one item whose value has single spaces between words, no spaces at the ends, and the original upper/lower case.',
    type: 'Positive',
    priority: 'Medium',
  },
  'PII-NRM-004': {
    what: 'Saves formatted phone numbers with exactly 8 and exactly 15 digits (the smallest and largest allowed) and reads each back.',
    why: 'Numbers right at the allowed limits are valid; rejecting them would block real customers with short or long numbers.',
    steps: [
      'Take the approved 8-digit test number and format it with "+", brackets, spaces and a dash',
      'Save it as PHONE and read it back',
      'Repeat with the approved 15-digit number',
    ],
    expected:
      '201 Created on each save; 200 OK on each read with exactly one item whose value is the original digits only.',
    type: 'Positive',
    priority: 'Low',
    preconditions:
      'Optional: needs approved 8-digit and 15-digit test numbers — skipped because the team tests with 10-digit numbers only',
  },
  'PII-NRM-005': {
    what: 'Saves an email that is already trimmed and lower case, then reads it back.',
    why: 'Clean-up must not change values that are already correct; otherwise good data would be damaged.',
    steps: ['Create a fake, already-clean email', 'Save it as the EMAIL field', 'Read the EMAIL back'],
    expected:
      '201 Created on save; 200 OK on read with exactly one item whose value is exactly the email that was sent.',
    type: 'Positive',
    priority: 'Medium',
  },
};
