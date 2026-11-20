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
      'Both bulk reads return 200 OK. The first has count 1 with user A’s name. The second has count 2, and each user’s item carries exactly that user’s name.',
    request: `${SAVE} {"user_id":"<fake user A>","field":"NAME","value":"QA Automation User A"} · ${SAVE} (user B) · ${BULK} {"user_ids":["<A>"],"fields":["NAME"]} · ${BULK} {"user_ids":["<A>","<B>"],"fields":["NAME"]}`,
    validation: [
      'Both bulk reads: status 200',
      'User A alone: count 1, item for user A with user A’s name',
      'Both users: count 2, one item per user',
      'Every item has field NAME and its own user’s name',
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
      'Both get 422 Unprocessable Entity (refused: the request format is invalid) with code REQUEST_VALIDATION_ERROR, naming the user ID list (body.user_ids); for 201 users the kind of error is “too_long”. Seen on 2026-11-19. (The lower bulk-read limit, 50 users today, is checked in AISLE-BR-013.)',
    request: `${BULK} {"user_ids":[],"fields":["NAME"]} · ${BULK} {"user_ids":["<201 fake users>"],"fields":["NAME"]}`,
    validation: ['Empty user list → 422 naming user_ids', '201 user IDs → 422 naming user_ids as too_long'],
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
      '200 OK. Every item belongs to that user and carries the saved name. On staging the same item came back twice (count 2). Whether duplicates should be removed is not decided, so the count is only recorded, not checked.',
    request: `${SAVE} {"user_id":"<fake user>","field":"NAME","value":"QA Automation User"} · ${BULK} {"user_ids":["<same user>","<same user>"],"fields":["NAME"]}`,
    validation: [
      'Status is 200',
      'At least one item is returned',
      'Every item has that user ID, field NAME and the saved name',
      'The returned count is recorded in the report (not checked)',
    ],
    type: 'Positive',
    priority: 'Low',
  },
  'AISLE-BR-006': {
    what: 'Bulk reads a made-up field name (one the service does not know) for a fake test user.',
    why: 'Only agreed personal fields may be read in bulk. The service must refuse anything else.',
    steps: ['Send a bulk read asking for a made-up field name', 'Check the reply'],
    expected:
      '403 Forbidden (refused: access denied) with the error code AUTHORIZATION_DENIED, like save and read of an unknown field. Seen on staging on 2026-10-01.',
    request: `${BULK} {"user_ids":["<fake user>"],"fields":["QA_AUTOMATION_UNKNOWN_FIELD"]}`,
    validation: ['Status is 403', 'Error code is AUTHORIZATION_DENIED', 'Reply data is empty'],
    type: 'Negative',
    priority: 'Medium',
  },
  'AISLE-BR-007': {
    what: 'Saves a fake name, then bulk reads (one request for several users) NAME together with a made-up field name.',
    why: 'One bad field name must not return part of the data silently; the caller must notice.',
    steps: ['Save a fake name', 'Bulk read NAME plus a made-up field', 'Check the reply'],
    expected:
      '403 Forbidden with AUTHORIZATION_DENIED for the whole bulk read, and no data. Seen on 2026-10-01.',
    request: `${BULK} {"user_ids":["<fake user>"],"fields":["NAME","QA_AUTOMATION_UNKNOWN_FIELD"]}`,
    validation: ['Status 403 AUTHORIZATION_DENIED', 'No data in the reply', 'No server error (5xx)'],
    type: 'Negative',
    priority: 'Medium',
  },
  'AISLE-BR-008': {
    what: 'Saves a fake name, then bulk reads with the field list ["NAME","NAME"].',
    why: 'Records how a repeated field is handled, so apps do not double-count data.',
    steps: ['Save a fake name', 'Bulk read with NAME listed twice', 'Check the count'],
    expected: '200 OK with the name returned twice (count 2). Seen on 2026-10-01.',
    request: `${BULK} {"user_ids":["<fake user>"],"fields":["NAME","NAME"]}`,
    validation: ['Status 200', 'Count is 2', 'Both items hold the saved name'],
    type: 'Positive',
    priority: 'Low',
  },
  'AISLE-BR-009': {
    what: 'Sends four bulk reads with empty parts: an empty field list, a field list holding null, a user list holding null, and a user list holding an empty user ID.',
    why: 'Empty input must be refused, never treated as “all users” or “all fields”.',
    steps: [
      'Bulk read with fields []',
      'Bulk read with fields [null] and with user_ids [null]',
      'Bulk read with user_ids [""]',
    ],
    expected:
      'fields [], fields [null] and user_ids [null] get 422 Unprocessable Entity (refused: the request format is invalid) with code REQUEST_VALIDATION_ERROR naming that list (fields [] as “too_short”). user_ids [""] gets 404 PII_NOT_FOUND with no data. Seen on 2026-10-01 and again on 2026-11-19; whether "" should be a 422 is open (question BQ-38).',
    request: `${BULK} {"user_ids":["<fake user>"],"fields":[]} · {"fields":[null]} · {"user_ids":[null],…} · {"user_ids":[""],"fields":["NAME"]}`,
    validation: [
      '[] and [null] → 422 naming the list',
      'user_ids [""] → 404, no data',
      'No server error (5xx)',
    ],
    type: 'Negative',
    priority: 'Medium',
  },
  'AISLE-BR-010': {
    what: 'Saves a different fake email for three fake users, then bulk reads the EMAIL field for all three.',
    why: 'Apps fetch contact details for many people at once; each must get their own email.',
    steps: [
      'Save a fake email for each of three new fake users',
      'Bulk read EMAIL for the three',
      'Check each user’s email',
    ],
    expected: '200 OK, count 3, each user with their own email. Seen on 2026-10-01.',
    request: `${BULK} {"user_ids":["<user 1>","<user 2>","<user 3>"],"fields":["EMAIL"]}`,
    validation: ['Status 200', 'Count is 3', 'Each user has their own email'],
    type: 'Positive',
    priority: 'High',
  },
  'AISLE-BR-011': {
    what: 'Saves only a fake name for user A and only a fake email for user B, then bulk reads NAME and EMAIL for both.',
    why: 'Real users have different fields filled in. The reply must say clearly what each one has.',
    steps: [
      'Save a name for user A and an email for user B',
      'Bulk read NAME and EMAIL for both',
      'Check the items',
    ],
    expected:
      '200 OK with count 2: user A’s name and user B’s email; the missing fields are left out. Seen on 2026-10-01. Note: a user with none of the requested fields makes the whole bulk read fail (404, AISLE-BR-002); whether that difference is intended is open (question BQ-42).',
    request: `${BULK} {"user_ids":["<user A>","<user B>"],"fields":["NAME","EMAIL"]}`,
    validation: ['Status 200', 'Items are A:NAME and B:EMAIL only', 'Values match what was saved'],
    type: 'Positive',
    priority: 'High',
  },
  'AISLE-BR-012': {
    what: 'Saves fake names for three fake users, then bulk reads them twice, listing the user IDs in two different orders.',
    why: 'Apps may match results to their own list by position; the order must be predictable.',
    steps: ['Save names for three fake users', 'Bulk read in order C, A, B', 'Bulk read in order B, C, A'],
    expected: 'Both replies list the items in exactly the requested order. Seen on 2026-10-01.',
    request: `${BULK} {"user_ids":["<C>","<A>","<B>"],"fields":["NAME"]}`,
    validation: ['Item order equals the requested order, both times'],
    type: 'Positive',
    priority: 'Low',
  },
  'AISLE-BR-013': {
    what: 'Saves fake names for 51 fake users, then bulk reads (one request for several users) 1 of them, 50 of them (the limit today), and all 51.',
    why: 'Apps must know how many users one bulk read may carry. The limit also stops anyone from pulling out personal data in bulk.',
    steps: [
      'Save fake names for 51 new fake users',
      'Bulk read 1 user, then 50 users',
      'Bulk read all 51 users',
    ],
    expected:
      '1 and 50 users: 200 OK, and every requested user comes back once. 51 users: 400 Bad Request with error code VALIDATION_ERROR and reason “batch limit exceeded”, with no data. The limit is set by Dev and can change (50 since 2026-11-19, ClickUp 14zmk4dk7z1); the test reads it from the setting AISLE_BATCH_READ_MAX (default 50). More than 200 users is a format error (422), checked in AISLE-BR-003.',
    request: `${BULK} {"user_ids":["<1, 50 or 51 fake users>"],"fields":["NAME"]}`,
    validation: [
      '1 and 50 users → 200 with one item per user, all users returned',
      '51 users → 400 VALIDATION_ERROR, reason “batch limit exceeded”, no data',
    ],
    type: 'Positive',
    priority: 'Low',
    preconditions:
      'Creates 51 fake records per run. The limit comes from AISLE_BATCH_READ_MAX (default 50); change it there if Dev changes the limit.',
  },
};
