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
    what: 'Saves approved test phone 1 (a number the team confirmed is nobody’s real phone) for a new fake user, once written with “+”, spaces, brackets and dashes, and once as “+” plus digits. Reads each back.',
    why: 'People type phone numbers in many styles. The service must store one clean form, or searches and comparisons fail.',
    steps: [
      'Save approved test phone 1 written as “+NN (NNN) NNN-NNNN” for a new fake user',
      'Save it written as “+” and digits for another new fake user',
      'Read each phone back',
    ],
    expected:
      'Both saves succeed and both reads return the phone as digits only. Seen on staging on 2026-10-01.',
    request:
      'POST /api/v1/pii-test {"user_id":"<new fake user>","field":"PHONE","value":"<approved test phone 1, formatted>"} · POST /api/v1/pii-test/read {"field_names":["PHONE"]}',
    validation: ['Both saves succeed', 'Both reads return digits only'],
    type: 'Positive',
    priority: 'High',
    preconditions:
      'Needs the team-approved test phone numbers in AISLE_TEST_PHONES (never a real person’s number). Without them the test is marked Blocked (CONFIG).',
  },
  'AISLE-NRM-003': {
    what: 'Tries to save made-up invalid phone values for new fake users: 5 digits, 7 digits, 16 digits, and only symbols (no digits).',
    why: 'A phone that is too short, too long or empty after clean-up can never reach anyone; storing it would be wrong data.',
    steps: [
      'Send each invalid value as a PHONE save for a new fake user',
      'Check each reply',
      'Read each user',
    ],
    expected:
      'Each save gets 400 VALIDATION_ERROR (the value breaks a rule) with no data, never a server error, and nothing is saved (404 on read). Seen on staging on 2026-10-01. Only made-up values are used, never a number that could be someone’s.',
    request:
      'POST /api/v1/pii-test {"user_id":"<new fake user>","field":"PHONE","value":"12345"} · {"value":"1234567"} · {"value":"1234567890123456"} · {"value":"+-() "}',
    validation: [
      'Each save is 400 VALIDATION_ERROR with no data',
      'No server error (5xx)',
      'Nothing saved (404)',
    ],
    type: 'Negative',
    priority: 'High',
  },
  'AISLE-NRM-004': {
    what: 'Saves five fake names that each hide one invisible character between two words: a tab, a line break, a carriage return, a non-breaking space and a zero-width space. Reads each back.',
    why: 'Names copied from documents often carry hidden characters. They decide whether two names look equal and whether searches match.',
    steps: [
      'Save a fake name with one hidden character between two words',
      'Read it back',
      'Repeat for each of the five hidden characters',
    ],
    expected:
      'Tab, line break, carriage return and non-breaking space are turned into a normal space. The zero-width space is kept unchanged. Seen on 2026-10-01; Dev still to confirm the rule (question BQ-36).',
    request:
      'POST /api/v1/pii-test {"user_id":"<new fake user>","field":"NAME","value":"QA\\tAutomation User <letters>"} (one per hidden character)',
    validation: [
      'Tab, line break, carriage return, non-breaking space → a normal space',
      'Zero-width space → kept as sent',
    ],
    type: 'Positive',
    priority: 'Medium',
  },
  'AISLE-NRM-005': {
    what: 'Saves an accented letter (é) written in its two Unicode forms (one combined character, or “e” plus a separate accent mark) and checks that saving and searching treat them as the same text.',
    why: 'Different keyboards and phones produce different forms of the same letter. If they are not treated the same, a person can fail to be found.',
    steps: [
      'Save a fake name and a fake email with é written as one character',
      'Read and search them using e + accent mark',
      'Compare the results',
    ],
    expected:
      'Blocked: on 2026-10-01 names were stored exactly as sent (no conversion), and an email saved with é as one character was NOT found when searched with e + accent mark. Dev must decide whether they should match (question BQ-36).',
    request:
      'POST /api/v1/pii-test {"field":"NAME","value":"QA José …"} · POST /api/v1/pii-test/EMAIL/search {"value":"<email with e + accent mark>"}',
    validation: ['Blocked until Dev decides the Unicode rule'],
    type: 'Positive',
    priority: 'Low',
    preconditions: 'Blocked until Dev decides whether both Unicode forms must match (question BQ-36).',
    endpoint: 'crossEndpoint',
  },
};
