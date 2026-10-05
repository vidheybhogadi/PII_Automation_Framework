import type { TestCaseCatalog } from './types';

const TRANSIENT_PHONES =
  'Needs the team-approved test phone numbers in AISLE_TEST_PHONES (never a real person’s number). Without them the test is marked Blocked (CONFIG). Response format observed 2026-10-01; Dev to confirm (question BQ-02).';

export const TRANSIENT_CASES: TestCaseCatalog = {
  'AISLE-TR-001': {
    what: 'Stores an approved test phone number (a number Dev confirmed is nobody’s real phone) as a temporary phone: a short-lived record for someone who has not signed up yet.',
    why: 'Sign-up flows hold a phone before the user exists. The record must be created and must expire.',
    steps: [
      'Take an approved test phone from the settings',
      'Send the create request with the phone and a lifetime of 15 minutes',
      'Check the reply',
    ],
    expected:
      '201 Created with a temporary ID and an expiry time in the future. The phone is not repeated in the reply. Reply format and allowed lifetimes to be confirmed by Dev (question BQ-02).',
    request: 'POST /api/v1/pii-test/transient/phones {"phone":"<approved test phone>","ttl_seconds":900}',
    validation: [
      'Status is 201',
      'Reply has a temporary ID and an expiry time in the future',
      'The phone is not repeated in the reply',
    ],
    type: 'Positive',
    priority: 'High',
    preconditions: TRANSIENT_PHONES,
  },
  'AISLE-TR-002': {
    what: 'Creates a temporary phone from an approved test number, then looks it up by its temporary ID.',
    why: 'The app must get the phone back, and browsers or proxies must not keep a copy of it.',
    steps: [
      'Create a temporary phone',
      'Send the look-up (resolve) request with its temporary ID',
      'Check the reply and its headers (extra information sent with the reply)',
    ],
    expected:
      '200 OK. The phone is returned as digits only, with the same temporary ID. The header “Cache-Control: no-store” (tells browsers and proxies not to keep a copy) is present. To be confirmed by Dev (question BQ-02).',
    request:
      'POST /api/v1/pii-test/transient/phones (approved test phone) · POST /api/v1/pii-test/transient/phones/resolve {"transient_id":"<temporary ID>"}',
    validation: [
      'Resolve status is 200 with the same temporary ID',
      'The phone is returned as digits only',
      'Header “Cache-Control: no-store” is present',
    ],
    type: 'Positive',
    priority: 'High',
    preconditions: TRANSIENT_PHONES,
  },
  'AISLE-TR-003': {
    what: 'Creates a temporary phone, promotes it (turns it into the permanent PHONE of a new fake test user), then tries to look it up and promote it again.',
    why: 'A temporary number must become permanent only once, so it cannot be reused or stolen later.',
    steps: [
      'Create a temporary phone',
      'Promote it to a new fake user',
      'Read that user’s PHONE field',
      'Look up and promote the same temporary ID again',
    ],
    expected:
      'Promote returns 200 OK for that user and field PHONE. Reading PHONE returns the digits. The second look-up and second promote both return 404 (not found). To be confirmed by Dev (question BQ-02).',
    request:
      'POST /api/v1/pii-test/transient/phones (approved test phone) · POST /api/v1/pii-test/transient/phones/promote {"transient_id":"<temporary ID>","user_id":"<new fake user>"} · POST /api/v1/pii-test/read {"user_id":"<same user>","field_names":["PHONE"]} · POST /api/v1/pii-test/transient/phones/resolve and /promote again',
    validation: [
      'Promote status is 200 for that user and field PHONE',
      'Reading PHONE returns the digits',
      'Second resolve returns 404',
      'Second promote returns 404',
    ],
    type: 'Positive',
    priority: 'High',
    preconditions: TRANSIENT_PHONES,
  },
  'AISLE-TR-004': {
    what: 'Looks up a made-up but correctly formed temporary ID, then a badly formed one.',
    why: 'Guessing IDs must not reveal anything.',
    steps: ['Send a look-up with an unknown temporary ID', 'Send a look-up with a badly formed ID'],
    expected:
      'The unknown ID gets 404 (not found). The badly formed ID gets 422 (refused: the request format is invalid). No phone is returned. To be confirmed by Dev (question BQ-02).',
    request:
      'POST /api/v1/pii-test/transient/phones/resolve {"transient_id":"<made-up ID>"} · POST /api/v1/pii-test/transient/phones/resolve {"transient_id":"not-a-valid-id"}',
    validation: ['Unknown ID → 404', 'Badly formed ID → 422 naming transient_id', 'No phone is returned'],
    type: 'Negative',
    priority: 'Medium',
    preconditions: TRANSIENT_PHONES,
  },
  'AISLE-TR-005': {
    what: 'Creates a temporary phone (a short-lived phone record for someone not yet signed up) for approved test phone 1 with the shortest allowed lifetime (300 seconds), checks it can be looked up, waits until it has expired, then looks it up again.',
    why: 'Expired temporary phones must disappear, or phone numbers stay readable longer than allowed.',
    steps: [
      'Create a temporary phone with a lifetime of 300 seconds',
      'Look it up and check it is found (200)',
      'Wait until its expiry time plus about 12 seconds',
      'Look it up again',
    ],
    expected:
      'Before expiry: 200 OK. After expiry: 404 Not Found with code TRANSIENT_PHONE_NOT_FOUND and no data, never a server error. Seen on staging on 2026-10-05. Slow test (about 5½ minutes, tag @slow).',
    request:
      'POST /api/v1/pii-test/transient/phones {"phone":"<approved test phone 1>","ttl_seconds":300} · POST /api/v1/pii-test/transient/phones/resolve {"transient_id":"<ID>"} (before and after expiry)',
    validation: [
      'Lookup before expiry → 200',
      'Lookup after expiry → 404 TRANSIENT_PHONE_NOT_FOUND, no data',
      'The expiry time is no more than about 6 minutes away (otherwise the test stops instead of waiting)',
    ],
    type: 'Negative',
    priority: 'Medium',
    preconditions: `${TRANSIENT_PHONES} Takes about 5½ minutes (tag @slow).`,
    endpoint: 'resolveTransientPhone',
  },
  'AISLE-TR-006': {
    what: 'Creates temporary phones for approved test phone 1 with lifetimes of 0, −1, 299 seconds, 604,801 seconds and 1,000,000,000 seconds, and with exactly 300 seconds and 604,800 seconds (7 days).',
    why: 'A wrong lifetime could keep a phone number forever or make it unusable. The edges of the allowed range must work.',
    steps: [
      'Create with lifetime 0 and −1',
      'Create with 299, 604,801 and 1,000,000,000 seconds',
      'Create with 300 and 604,800 seconds and check the expiry time',
    ],
    expected:
      '0 and −1 get 422 Unprocessable Entity naming ttl_seconds. 299, 604,801 and 1,000,000,000 get 400 VALIDATION_ERROR with no data. 300 and 604,800 get 201 Created with an expiry time that many seconds away. Seen on staging on 2026-10-01; Dev still to confirm the range (question BQ-28).',
    request:
      'POST /api/v1/pii-test/transient/phones {"phone":"<approved test phone 1>","ttl_seconds":0} (and the other lifetimes)',
    validation: [
      '0 / −1 → 422 naming ttl_seconds',
      '299 / 604,801 / 10⁹ → 400 VALIDATION_ERROR, no data',
      '300 / 604,800 → 201, expiry about that far away',
      'No server error (5xx)',
    ],
    type: 'Negative',
    priority: 'Medium',
    preconditions:
      'Needs the team-approved test phone numbers in AISLE_TEST_PHONES (never a real person’s number). Without them the test is marked Blocked (CONFIG).',
  },
  'AISLE-TR-007': {
    what: 'Creates a temporary phone for approved test phone 2 with the shortest allowed lifetime (300 seconds), checks it can be looked up, waits until it has expired, then tries to promote it (make it the permanent phone) for a new fake user.',
    why: 'An expired temporary phone must never become someone’s permanent phone.',
    steps: [
      'Create a temporary phone with a lifetime of 300 seconds and check it is found (200)',
      'Wait until its expiry time plus about 12 seconds',
      'Promote it for a new fake user',
      'Read that user’s phone',
    ],
    expected:
      'The promote gets 404 Not Found with code TRANSIENT_PHONE_NOT_FOUND and no data, never a server error. Reading the user’s phone gets 404 (nothing was saved). Seen on staging on 2026-10-05. Slow test (about 5½ minutes, tag @slow).',
    request:
      'POST /api/v1/pii-test/transient/phones {"phone":"<approved test phone 2>","ttl_seconds":300} · POST /api/v1/pii-test/transient/phones/promote {"transient_id":"<expired ID>","user_id":"<new fake user>"} · POST /api/v1/pii-test/read {"field_names":["PHONE"]}',
    validation: [
      'Lookup before expiry → 200',
      'Promote after expiry → 404 TRANSIENT_PHONE_NOT_FOUND, no data',
      'The user has no saved phone (404)',
    ],
    type: 'Negative',
    priority: 'Medium',
    preconditions: `${TRANSIENT_PHONES} Takes about 5½ minutes (tag @slow).`,
    endpoint: 'promoteTransientPhone',
  },
  'AISLE-TR-008': {
    what: 'Saves approved test phone 1 for a new fake user, then creates a temporary phone for approved test phone 2 and promotes it onto that user.',
    why: 'A promote must replace the old phone cleanly and say so, so no number is lost silently.',
    steps: [
      'Save approved test phone 1 for a new fake user',
      'Create a temporary phone for approved test phone 2',
      'Promote it onto the user',
      'Read the user’s phone and look up the temporary phone again',
    ],
    expected:
      '200 OK with created false (an existing phone was replaced) and consumed true. The user’s phone is now phone 2 (digits only). Looking up the temporary phone afterwards gets 404 TRANSIENT_PHONE_NOT_FOUND. Seen on staging on 2026-10-01.',
    request:
      'POST /api/v1/pii-test {"field":"PHONE","value":"<approved test phone 1>"} · POST /api/v1/pii-test/transient/phones {"phone":"<approved test phone 2>","ttl_seconds":900} · …/promote {"transient_id":"<ID>","user_id":"<same user>"}',
    validation: [
      'Promote 200 with created false and consumed true',
      'User’s phone is phone 2',
      'Lookup afterwards → 404 TRANSIENT_PHONE_NOT_FOUND',
    ],
    type: 'Positive',
    priority: 'High',
    preconditions:
      'Needs the team-approved test phone numbers in AISLE_TEST_PHONES (never a real person’s number). Without them the test is marked Blocked (CONFIG).',
    endpoint: 'promoteTransientPhone',
  },
  'AISLE-TR-009': {
    what: 'Creates temporary phones with made-up invalid phones (5 digits, 16 digits, letters), then promotes a valid temporary phone with bad user IDs (empty, a number, null, 129 characters).',
    why: 'Bad input must be refused before anything is stored, and a refused promote must not use up the temporary phone.',
    steps: [
      'Create with each made-up invalid phone',
      'Create a temporary phone for approved test phone 1',
      'Promote it with each bad user ID',
      'Look the temporary phone up again',
    ],
    expected:
      'Invalid phones get 400 VALIDATION_ERROR with no data. Each bad user ID gets 422 Unprocessable Entity naming user_id. The temporary phone can still be looked up (200) afterwards. Seen on staging on 2026-10-01.',
    request:
      'POST /api/v1/pii-test/transient/phones {"phone":"12345","ttl_seconds":900} · …/promote {"transient_id":"<ID>","user_id":""}',
    validation: [
      'Invalid phones → 400 VALIDATION_ERROR, no data',
      'Bad user IDs → 422 naming user_id',
      'Lookup afterwards → 200',
      'No server error (5xx)',
    ],
    type: 'Negative',
    priority: 'Medium',
    preconditions:
      'Needs the team-approved test phone numbers in AISLE_TEST_PHONES (never a real person’s number). Without them the test is marked Blocked (CONFIG).',
    endpoint: 'crossEndpoint',
  },
};
