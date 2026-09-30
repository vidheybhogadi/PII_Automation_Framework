import type { TestCaseCatalog } from './types';

const SAVE = 'POST /api/v1/pii-test';
const BULK = 'POST /api/v1/pii-test/batch/read';

export const BATCH_READ_CASES: TestCaseCatalog = {
  'AISLE-BR-001': {
    what: 'Saves fake names for two new fake test users (A and B), bulk reads (one request for several users) user A alone, then both.',
    why: 'Screens that list many users use bulk read. Each user must get exactly their own data, whether asked alone or together.',
    steps: [
      'Save a fake name for user A and for user B',
      'Bulk read NAME for user A only',
      'Bulk read NAME for both users',
      'Match each returned item to its user',
    ],
    expected:
      'Both bulk reads return 200 OK with “PII batch read successful” and tenant “aisle” (the customer account the data belongs to). The first has count 1 with user A’s name. The second has count 2, and each user’s item carries exactly that user’s name.',
    request: `${SAVE} {"user_id":"<fake user A>","field":"NAME","value":"QA Automation User A"} · ${SAVE} (user B) · ${BULK} {"user_ids":["<A>"],"fields":["NAME"]} · ${BULK} {"user_ids":["<A>","<B>"],"fields":["NAME"]}`,
    validation: [
      'Both bulk reads: status 200 with “PII batch read successful”',
      'User A alone: count 1, item for user A with user A’s name',
      'Both users: count 2, one item per user',
      'Every item has tenant “aisle”, field NAME and its own user’s name',
    ],
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
    request: `${SAVE} {"user_id":"<fake user A>","field":"NAME","value":"QA Automation User"} · ${BULK} {"user_ids":["<A>","<never-saved fake user>"],"fields":["NAME"]}`,
    validation: ['Status is 404', 'Error code is PII_NOT_FOUND', 'Reply data is empty'],
    type: 'Negative',
    priority: 'Medium',
  },
  'AISLE-BR-003': {
    what: 'Sends a bulk read with an empty list of user IDs, then one with 201 fake user IDs.',
    why: 'Very large bulk reads could pull out personal data in bulk or overload the service.',
    steps: ['Send a bulk read with no user IDs', 'Send a bulk read with 201 fake user IDs'],
    expected:
      'Both get 422 (refused: the request format is invalid), naming the user ID list as too short or too long. Limits observed from the service’s own validation message; to be confirmed by Dev (question BQ-05). The exact maximum is still open: a bulk read of exactly 200 users returned 403 (access denied) on staging, so it is not checked here (question BQ-18).',
    request: `${BULK} {"user_ids":[],"fields":["NAME"]} · ${BULK} {"user_ids":["<201 fake users>"],"fields":["NAME"]}`,
    validation: ['Empty user list → 422 naming user_ids', '201 user IDs → 422 naming user_ids'],
    type: 'Negative',
    priority: 'Medium',
  },
  'AISLE-BR-004': {
    what: 'Saves a fake name for one fake test user, then bulk reads it with that same user ID listed twice.',
    why: 'Apps may send duplicates by mistake. The reply must still contain only that user’s own data.',
    steps: [
      'Save a fake name for a new fake user',
      'Send a bulk read listing that user ID twice',
      'Check every returned item',
    ],
    expected:
      '200 OK. Every item belongs to that user and carries the saved name. On staging the same item came back twice (count 2). Whether duplicates should be removed is waiting on Dev (question BQ-19), so the count is only recorded, not checked.',
    request: `${SAVE} {"user_id":"<fake user>","field":"NAME","value":"QA Automation User"} · ${BULK} {"user_ids":["<same user>","<same user>"],"fields":["NAME"]}`,
    validation: [
      'Status is 200 with “PII batch read successful”',
      'At least one item is returned',
      'Every item has tenant “aisle”, that user ID, field NAME and the saved name',
      'The returned count is recorded in the report (not checked)',
    ],
    type: 'Positive',
    priority: 'Low',
  },
  'AISLE-BR-005': {
    what: 'Sends a bulk read without the list of user IDs, then one without the list of fields.',
    why: 'Incomplete requests must be refused, never answered with someone’s data.',
    steps: ['Send a bulk read with no user ID list', 'Send a bulk read with no field list'],
    expected:
      'Both get 422 (refused: the request format is invalid), naming the missing list. Not yet seen on staging: expected from how save and read treat missing parts; to be checked on the next run (question BQ-09).',
    request: `${BULK} {"fields":["NAME"]} · ${BULK} {"user_ids":["<fake user>"]}`,
    validation: ['Missing user list → 422 naming user_ids', 'Missing field list → 422 naming fields'],
    type: 'Negative',
    priority: 'Medium',
  },
  'AISLE-BR-006': {
    what: 'Bulk reads a made-up field name (one the service does not know) for a fake test user.',
    why: 'Only agreed personal fields may be read in bulk. The service must refuse anything else.',
    steps: ['Send a bulk read asking for a made-up field name', 'Check the reply'],
    expected:
      '403 Forbidden (refused: access denied) with the error code AUTHORIZATION_DENIED, like save and read of an unknown field. Not yet seen for bulk read; to be checked on the next run (questions BQ-12 and BQ-27).',
    request: `${BULK} {"user_ids":["<fake user>"],"fields":["QA_AUTOMATION_UNKNOWN_FIELD"]}`,
    validation: ['Status is 403', 'Error code is AUTHORIZATION_DENIED', 'Reply data is empty'],
    type: 'Negative',
    priority: 'Medium',
  },
};
