import type { TestCaseCatalog } from './types';

export const WRITE_CASES: TestCaseCatalog = {
  'AISLE-WR-001': {
    what: 'Saves a fake name (the NAME field) for a brand-new fake test user through the Aisle facade (Aisle’s front door to the PII service).',
    why: 'Saving personal data is the core job of the service. If new users cannot be saved, nothing else works.',
    steps: [
      'Make a new fake user ID and a fake name',
      'Send the save request with the token (the secret pass proving the caller is Aisle’s test app)',
      'Check the reply',
    ],
    expected:
      '201 Created (a new value was saved) with the message “PII write successful”. The reply shows tenant “aisle” (the customer account the data belongs to), the same user ID, field NAME and a key version (the number of the encryption key used) of 1 or more. The name itself is not repeated in the reply.',
    type: 'Positive',
    priority: 'Critical',
  },
  'AISLE-WR-002': {
    what: 'Saves fake name A for a fake test user, then saves fake name B for the same user. Reads the name back with a normal read and with a bulk read (one request for several users).',
    why: 'If the old value survived an update, users would see outdated or wrong personal details.',
    steps: [
      'Save fake name A for a new fake user',
      'Save fake name B for the same user',
      'Read the name',
      'Bulk read the name for that user',
    ],
    expected:
      'The second save returns 200 OK (an existing value was replaced) with “PII write successful” and tenant “aisle”. The normal read and the bulk read both return name B, never name A.',
    type: 'Positive',
    priority: 'Critical',
  },
  'AISLE-WR-003': {
    what: 'Saves a fake name, then sends three broken save requests: one without a value, one without a user ID, and one with a number instead of text as the value.',
    why: 'A bug in the app must never overwrite or damage a user’s saved data.',
    steps: [
      'Save a fake name for a new fake user',
      'Send a save with no value',
      'Send a save with no user ID',
      'Send a save with a number as the value',
      'Read the name back',
    ],
    expected:
      'Each broken request gets 422 (refused: the request format is invalid) with a list naming the wrong field. Reading afterwards still returns the original fake name.',
    type: 'Negative',
    priority: 'High',
  },
  'AISLE-WR-004': {
    what: 'Saves a fake name, then sends a save request whose value is empty text.',
    why: 'An empty value would wipe a user’s details without anyone meaning to.',
    steps: ['Save a fake name for a new fake user', 'Send a save with an empty value', 'Read the name back'],
    expected:
      '422 (refused: the request format is invalid) naming the value as too short (the minimum is 1 character). The original fake name is unchanged.',
    type: 'Negative',
    priority: 'Medium',
  },
  'AISLE-WR-005': {
    what: 'Saves a fake name of exactly 1,024 characters for a fake user ID of exactly 128 characters, then reads it back.',
    why: 'Real users can have long names. The service must accept everything up to the allowed maximum.',
    steps: [
      'Make a 128-character fake user ID and a 1,024-character fake name',
      'Save the name',
      'Read it back',
    ],
    expected:
      '201 Created (a new value was saved). Reading returns the full 1,024-character name unchanged. These limits were seen on staging and still need Dev’s confirmation (question BQ-05).',
    type: 'Positive',
    priority: 'Medium',
  },
  'AISLE-WR-006': {
    what: 'Saves a normal fake name, then sends a save with a 129-character user ID and another with a 1,025-character name for the first user.',
    why: 'Over-long data could break storage or other systems that read it.',
    steps: [
      'Save a normal fake name for a new fake user',
      'Send a save with a 129-character fake user ID',
      'Send a save with a 1,025-character name for the first user',
      'Read the first user’s name',
    ],
    expected:
      'Both saves get 422 (refused: the request format is invalid), naming the user ID and the value as too long. The first user’s name is unchanged. Limits seen on staging; Dev to confirm (question BQ-05).',
    type: 'Negative',
    priority: 'Medium',
  },
  'AISLE-WR-007': {
    what: 'Saves a fake name, then sends a save request whose body is broken JSON (the text format the service expects), with the closing bracket missing.',
    why: 'Broken input must be refused cleanly, never half-processed.',
    steps: ['Save a fake name for a new fake user', 'Send a save with a broken body', 'Read the name back'],
    expected:
      '400 Bad Request (refused: the body could not be read) with status false, error “Invalid JSON” and message “Request body must be valid JSON”. The name is unchanged.',
    type: 'Negative',
    priority: 'Medium',
  },
  'AISLE-WR-008': {
    what: 'Tries to save a fake value under a field name the service does not know (a made-up field name).',
    why: 'Only agreed personal fields may be stored. Unknown fields would be data kept outside the rules.',
    steps: ['Send a save with a made-up field name and a fake value', 'Check the reply'],
    expected:
      '403 Forbidden (refused: access denied) with the error code AUTHORIZATION_DENIED, as seen on staging. Whether this should be a validation error instead is Dev’s call (question BQ-12).',
    type: 'Negative',
    priority: 'Medium',
  },
  'AISLE-WR-009': {
    what: 'Tries to save a fake email that has no “@” in it, then checks nothing was saved.',
    why: 'Broken emails would make password resets and notifications fail without anyone noticing.',
    steps: [
      'Send a save for the EMAIL field with a fake value that has no “@”',
      'Check the reply',
      'Read EMAIL for that user',
    ],
    expected:
      'The save is refused (400 or 422: the value breaks a rule; Dev to confirm which, question BQ-01). Reading EMAIL returns 404 (not found): nothing was saved.',
    type: 'Negative',
    priority: 'High',
    preconditions:
      'Blocked until Dev gives the Aisle caller access to EMAIL (question BQ-01). Today it returns 403 (access denied) because access is checked before the value (question BQ-14).',
  },
};
