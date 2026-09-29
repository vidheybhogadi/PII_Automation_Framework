import type { TestCaseCatalog } from './types';

export const BATCH_READ_CASES: TestCaseCatalog = {
  'AISLE-BR-001': {
    what: 'Saves fake names for two new fake test users, then reads both in one bulk read (one request for several users).',
    why: 'Screens that list many users use bulk read. Each user must get exactly their own data.',
    steps: [
      'Save a fake name for user A and for user B',
      'Send one bulk read for NAME for both users',
      'Match each returned item to its user',
    ],
    expected:
      '200 OK with the message “PII batch read successful” and tenant “aisle” (the customer account the data belongs to). Count is 2. Each user’s item carries exactly that user’s name.',
    type: 'Positive',
    priority: 'High',
  },
  'AISLE-BR-002': {
    what: 'Bulk reads NAME for one fake user who has a saved name and one fake user ID that was never used.',
    why: 'The rule seen on staging is all-or-nothing, so callers never get a silently incomplete list.',
    steps: [
      'Save a fake name for user A',
      'Send one bulk read for NAME for user A and an unused fake user ID',
    ],
    expected:
      '404 Not Found with the error code PII_NOT_FOUND for the whole request. No values are returned.',
    type: 'Negative',
    priority: 'Medium',
  },
  'AISLE-BR-003': {
    what: 'Sends a bulk read with an empty list of user IDs, then one with 201 fake user IDs.',
    why: 'Very large bulk reads could pull out personal data in bulk or overload the service.',
    steps: ['Send a bulk read with no user IDs', 'Send a bulk read with 201 fake user IDs'],
    expected:
      'Both get 422 (refused: the request format is invalid), naming the user ID list as too short or too long. The exact maximum is still open: a bulk read of exactly 200 users returned 403 (access denied) on staging, so it is not checked here (question BQ-18).',
    type: 'Negative',
    priority: 'Medium',
  },
};
