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
      'Tab, line break, carriage return and non-breaking space are turned into a normal space. The zero-width space is kept unchanged. Seen on 2026-10-01. Apart from this, values are kept exactly as sent (no Unicode conversion — Dev / user decision, 2026-11-19).',
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
    what: 'Saves a fake name ending in “José” with é written as one character. Then searches the NAME field with exactly that form, and with é written as “e” plus a separate accent mark (the other Unicode form, which looks the same on screen), and reads the name back.',
    why: 'Values are stored and searched exactly as sent; there is no Unicode conversion (Dev / user decision, not a bug). Apps that let users type names must send them in the same form they were saved in, or the person will not be found.',
    steps: [
      'Save a fake name with é written as one character',
      'Read the name back',
      'Search NAME with the same one-character form',
      'Search NAME with e + accent mark',
    ],
    expected:
      'The save is 201 Created and the read returns the name unchanged, still with é as one character. The search with the same form is 200 OK with count 1 (the fake user). The search with e + accent mark is 200 OK with count 0 (no match: it is different text). Seen on staging on 2026-11-19.',
    request:
      'POST /api/v1/pii-test {"field":"NAME","value":"QA Automation User … José"} · POST /api/v1/pii-test/read · POST /api/v1/pii-test/NAME/search {"value":"<same name, é as one character>"} and {"value":"<same name, e + accent mark>"}',
    validation: [
      'Read returns the one-character form unchanged',
      'Search with the same form → 200, count 1, the fake user',
      'Search with e + accent mark → 200, count 0',
    ],
    type: 'Positive',
    priority: 'Low',
    endpoint: 'crossEndpoint',
  },
};
