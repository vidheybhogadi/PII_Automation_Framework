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
};
