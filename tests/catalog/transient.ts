import type { TestCaseCatalog } from './types';

const TRANSIENT_BLOCKED =
  'Blocked until approved test phone numbers are provided (question BQ-03) and Dev gives the Aisle caller temporary-phone access (question BQ-02). Today these calls return 403 (refused: access denied).';

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
    preconditions: TRANSIENT_BLOCKED,
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
    preconditions: TRANSIENT_BLOCKED,
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
    preconditions: TRANSIENT_BLOCKED,
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
    preconditions: TRANSIENT_BLOCKED,
  },
  'AISLE-TR-005': {
    what: 'Creates a temporary phone (a short-lived phone record for someone not yet signed up) with a short lifetime and looks it up after it expires.',
    why: 'Expired temporary phones must disappear, or phone numbers stay readable longer than allowed.',
    steps: ['Create a temporary phone with a short lifetime', 'Wait until it expires', 'Look it up'],
    expected:
      'Blocked: needs approved test phone numbers and the lifetime rules (questions BQ-03, BQ-28). Expected: 404 Not Found after expiry.',
    request:
      'POST /api/v1/pii-test/transient/phones {"phone":"<approved test phone>","ttl_seconds":<short>} · …/resolve',
    validation: ['Blocked until approved phones exist'],
    type: 'Negative',
    priority: 'Medium',
    preconditions: TRANSIENT_BLOCKED,
    endpoint: 'resolveTransientPhone',
  },
  'AISLE-TR-006': {
    what: 'Creates temporary phones with a lifetime of 0, a negative number, or a huge number.',
    why: 'A wrong lifetime could keep a phone number forever or make it unusable.',
    steps: ['Send create with each lifetime', 'Check the replies'],
    expected:
      'Blocked: the allowed lifetime range is unknown (question BQ-28) and approved test phones are missing (question BQ-03).',
    request:
      'POST /api/v1/pii-test/transient/phones {"phone":"<approved test phone>","ttl_seconds":0} (and -1, huge)',
    validation: ['Blocked until the lifetime rules are known'],
    type: 'Negative',
    priority: 'Medium',
    preconditions: TRANSIENT_BLOCKED,
  },
  'AISLE-TR-007': {
    what: 'Tries to promote (turn into the user’s permanent phone) a temporary phone after it has expired.',
    why: 'An expired temporary phone must never become someone’s permanent phone.',
    steps: [
      'Create a short-lived temporary phone',
      'Wait until it expires',
      'Promote it for a fake user',
      'Read the user’s phone',
    ],
    expected:
      'Blocked: needs approved test phone numbers (question BQ-03). Expected: refused, and nothing saved for the user.',
    request:
      'POST /api/v1/pii-test/transient/phones/promote {"transient_id":"<expired ID>","user_id":"<fake user>"}',
    validation: ['Blocked until approved phones exist'],
    type: 'Negative',
    priority: 'Medium',
    preconditions: TRANSIENT_BLOCKED,
    endpoint: 'promoteTransientPhone',
  },
  'AISLE-TR-008': {
    what: 'Promotes a temporary phone onto a fake user who already has a phone.',
    why: 'Records whether the old phone is replaced or the promote is refused, so no number is lost silently.',
    steps: [
      'Save an approved test phone for a fake user',
      'Create and promote another temporary phone for the same user',
      'Read the user’s phone',
    ],
    expected:
      'Blocked: needs approved test phone numbers (question BQ-03); replace-versus-refuse will be observed then.',
    request:
      'POST /api/v1/pii-test/transient/phones/promote {"transient_id":"<ID>","user_id":"<user with a phone>"}',
    validation: ['Blocked until approved phones exist'],
    type: 'Positive',
    priority: 'Medium',
    preconditions: TRANSIENT_BLOCKED,
    endpoint: 'promoteTransientPhone',
  },
  'AISLE-TR-009': {
    what: 'Sends an invalid phone when creating a temporary phone, and a badly formed user ID when promoting one.',
    why: 'Bad input must be refused before anything is stored.',
    steps: ['Create with an invalid phone', 'Promote with a badly formed user ID'],
    expected:
      'Blocked: temporary phones are not probed until approved test phone numbers exist (question BQ-03). Expected: 422 for each.',
    request:
      'POST /api/v1/pii-test/transient/phones {"phone":"not-a-phone",…} · …/promote {"transient_id":"<ID>","user_id":"<badly formed>"}',
    validation: ['Blocked until approved phones exist'],
    type: 'Negative',
    priority: 'Medium',
    preconditions: TRANSIENT_BLOCKED,
    endpoint: 'crossEndpoint',
  },
};
