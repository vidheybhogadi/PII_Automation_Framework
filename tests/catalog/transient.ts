import type { TestCaseCatalog } from './types';

export const TRANSIENT_CASES: TestCaseCatalog = {
  'PII-TR-001': {
    what: 'Stores a phone number temporarily with the shortest allowed lifetime (TTL, how long the service keeps it) and checks the reply.',
    why: 'Apps rely on the returned ID and expiry time to know how long they can use the temporary number; a wrong expiry means numbers vanish too early or live too long.',
    steps: [
      'Send a formatted test phone number with the minimum lifetime',
      'Note the time before and after the request',
      'Check the returned tenant and expiry time',
    ],
    expected:
      '201 Created with a valid body (including an ID); tenant matches ours; expiry time equals now + lifetime, within the allowed clock difference.',
    type: 'Positive',
    priority: 'High',
    preconditions: 'Needs approved test phone numbers',
  },
  'PII-TR-002': {
    what: 'Looks up (resolves) a temporary phone by its ID and checks the number comes back in cleaned-up (normalized, standard) form.',
    why: 'Apps need to get the real number back to use it, and a phone number must not be kept in caches along the way.',
    steps: [
      'Store a formatted test phone number temporarily',
      'Look it up using the returned ID',
      'Compare the number, tenant, ID and expiry time with what was stored',
    ],
    expected:
      '200 OK; Cache-Control: no-store (a header telling other systems not to keep a copy); tenant, ID and expiry match the create reply; phone equals the normalized number.',
    type: 'Positive',
    priority: 'High',
    preconditions: 'Needs approved test phone numbers',
  },
  'PII-TR-003': {
    what: 'Has a second registered app (caller) try to look up and promote a temporary phone created by our app.',
    why: 'A temporary phone belongs only to the app that created it; another app must not read it or turn it into someone’s permanent number.',
    steps: [
      'Store a phone number temporarily as the main caller',
      'As the second caller, try to look it up',
      'As the second caller, try to promote it',
      'As the main caller, look it up again',
    ],
    expected:
      'Both attempts by the second caller return 404 TRANSIENT_PHONE_NOT_FOUND; the owner can still look it up (200 OK), so the attempts did not use it up.',
    type: 'Security',
    priority: 'Critical',
    preconditions:
      'Needs approved test phone numbers. Needs a second registered caller (secondary) — skipped until configured',
  },
  'PII-TR-004': {
    what: 'Tries to look up and promote a temporary phone using a different tenant (customer organisation) than the one it was created in.',
    why: 'Data from one tenant must never be reachable from another tenant.',
    steps: [
      'Store a phone number temporarily in our tenant',
      'Try to look it up with the second tenant',
      'Try to promote it with the second tenant',
    ],
    expected: 'Both requests return 404 TRANSIENT_PHONE_NOT_FOUND.',
    type: 'Security',
    priority: 'Critical',
    preconditions: 'Needs approved test phone numbers. Needs a second test tenant',
  },
  'PII-TR-005': {
    what: 'Looks up a temporary phone with a random ID that does not exist, then looks up and promotes with an ID that is not a valid UUID (the standard ID format).',
    why: 'The service must clearly separate “not found” from “bad request” and not crash on bad input.',
    steps: [
      'Look up a random, never-created ID',
      'Look up with the ID "not-a-uuid"',
      'Promote with the ID "not-a-uuid"',
    ],
    expected:
      'Unknown ID returns 404 TRANSIENT_PHONE_NOT_FOUND; both badly formed IDs return 422 with a validation error body.',
    type: 'Negative',
    priority: 'Medium',
  },
  'PII-TR-006': {
    what: 'Promotes a temporary phone to become a user’s permanent PHONE, then checks it can be read and the temporary one is used up.',
    why: 'Promotion is the main way a verified temporary number becomes permanent; it must save the right number and only work once.',
    steps: [
      'Store a formatted test phone number temporarily',
      'Promote it for a new user',
      'Read the user’s PHONE',
      'Try to look up and promote the temporary ID again',
    ],
    expected:
      '200 OK with field PHONE, created=true and consumed=true; reading PHONE returns the normalized number; later lookup and repeat promote both return 404 TRANSIENT_PHONE_NOT_FOUND.',
    type: 'Positive',
    priority: 'High',
    preconditions: 'Needs approved test phone numbers',
  },
  'PII-TR-007': {
    what: 'Promotes a temporary phone for a user who already has a permanent PHONE, and checks the old number is replaced.',
    why: 'When a user changes their number, promotion must overwrite the old one rather than keep a stale number.',
    steps: [
      'Save a first test number as the user’s PHONE',
      'Store a second test number temporarily',
      'Promote it for the same user',
      'Read the user’s PHONE',
    ],
    expected: '200 OK with created=false and consumed=true; reading PHONE returns the second (new) number.',
    type: 'Positive',
    priority: 'High',
    preconditions: 'Needs approved test phone numbers (at least 2, otherwise skipped)',
  },
  'PII-TR-008': {
    what: 'Creates temporary phones with lifetimes exactly at the allowed minimum and maximum, then one second below and above them.',
    why: 'The service must enforce its lifetime limits so numbers are not kept too briefly or for too long.',
    steps: [
      'Create with the minimum lifetime',
      'Create with the maximum lifetime',
      'Create with minimum minus 1 second',
      'Create with maximum plus 1 second',
    ],
    expected: 'Minimum and maximum return 201 Created; values just outside return 400 VALIDATION_ERROR.',
    type: 'Negative',
    priority: 'Medium',
    preconditions:
      'Needs approved test phone numbers. Uses the environment’s lifetime limits (guide values until Dev confirms)',
  },
  'PII-TR-009': {
    what: 'Tries to create temporary phones with a lifetime of 0, -1 and the text "abc".',
    why: 'The lifetime must be a positive whole number; nonsense values must be refused instead of creating broken records.',
    steps: ['Create with lifetime 0', 'Create with lifetime -1', 'Create with lifetime "abc"'],
    expected:
      '0 and -1 are rejected with 400 or 422 and an error body (exact status pending Dev question Q-11); "abc" returns 422 with a validation error body.',
    type: 'Negative',
    priority: 'Medium',
    preconditions: 'Needs approved test phone numbers',
  },
  'PII-TR-010': {
    what: 'Tries to create temporary phones with invalid numbers: too short, too long, and with no digits.',
    why: 'Storing numbers that are not real phone numbers would break later SMS or calls and pollute data.',
    steps: ['Create with "123-4567"', 'Create with "+1234 5678 9012 3456"', 'Create with "no digits"'],
    expected: 'Each request returns 400 VALIDATION_ERROR.',
    type: 'Negative',
    priority: 'Medium',
  },
  'PII-TR-011': {
    what: 'Sends temporary-phone create requests each missing one required field: tenant, phone or lifetime.',
    why: 'Incomplete requests must be refused clearly instead of creating partial records.',
    steps: ['Send a create request without tenant', 'Send one without phone', 'Send one without lifetime'],
    expected: 'Each request returns 422 with a validation error body.',
    type: 'Negative',
    priority: 'Medium',
    preconditions: 'Needs approved test phone numbers',
  },
  'PII-TR-012': {
    what: 'Stores a phone temporarily with the minimum lifetime, waits until it has expired, then tries to look it up and promote it.',
    why: 'Expired temporary numbers must really disappear; otherwise data is kept longer than promised.',
    steps: [
      'Store a phone number temporarily with the minimum lifetime',
      'Wait for the lifetime plus the allowed clock difference',
      'Try to look it up',
      'Try to promote it',
    ],
    expected: 'Both requests return 404 TRANSIENT_PHONE_NOT_FOUND.',
    type: 'Negative',
    priority: 'Medium',
    preconditions:
      'Needs a QA environment where temporary phones expire quickly (Dev question Q-12) — shows as Not Tested until available',
  },
};
