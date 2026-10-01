import type { TestCaseCatalog } from './types';

const FREE_TEXT_ACCESS =
  'Needs free-text key access for the Aisle caller (granted on 2026-10-01, question BQ-02). If a call is refused with 403 (access denied), the test is marked Blocked and the report shows that real reply.';

export const FREE_TEXT_CASES: TestCaseCatalog = {
  'AISLE-FT-001': {
    what: 'Creates a free-text key (a secret used to encrypt free-text notes) through the Aisle facade (Aisle’s front door to the PII service).',
    why: 'Notes are encrypted with this key. It must be the right strength, must never be kept in caches and must never end up in our logs.',
    steps: [
      'Send the create-key request',
      'Check the reply and its headers (extra information sent with the reply)',
      'Search our test log for the key',
    ],
    expected:
      '201 Created with a key ID and a 256-bit key (32 bytes, written in Base64 characters). The header “Cache-Control: no-store” (tells browsers and proxies not to keep a copy) is present. The key does not appear in our logs. To be confirmed by Dev (question BQ-02).',
    request: 'POST /api/v1/pii-test/free-text/keys {}',
    validation: [
      'Status is 201',
      'Reply has a key ID and a 256-bit key in Base64',
      'Header “Cache-Control: no-store” is present',
      'The key does not appear in the test log',
    ],
    type: 'Positive',
    priority: 'High',
    preconditions: FREE_TEXT_ACCESS,
  },
  'AISLE-FT-002': {
    what: 'Creates a free-text key (a secret used to encrypt notes), then reads it again by its key ID.',
    why: 'Encrypted notes can only be opened again with exactly the same key.',
    steps: ['Create a key', 'Send the read-key request with its key ID', 'Compare the two keys'],
    expected:
      '200 OK with the same key, and the header “Cache-Control: no-store” (tells browsers and proxies not to keep a copy). To be confirmed by Dev (question BQ-02).',
    request:
      'POST /api/v1/pii-test/free-text/keys {} · POST /api/v1/pii-test/free-text/keys/read {"key_id":"<key ID>"}',
    validation: [
      'Read status is 200',
      'The key equals the one created',
      'Header “Cache-Control: no-store” is present',
    ],
    type: 'Positive',
    priority: 'High',
    preconditions: FREE_TEXT_ACCESS,
  },
  'AISLE-FT-003': {
    what: 'Creates a fake free-text key (a secret used to encrypt notes) and revokes it (switches it off for good). Then tries to read that key, and also tries to read a made-up key ID that never existed.',
    why: 'Revoking must really switch a key off, for example after it leaked. Asking for a key that does not exist must not return anything.',
    steps: [
      'Create a fake key',
      'Revoke it and check the reply',
      'Try to read the revoked key',
      'Try to read a made-up key ID',
    ],
    expected:
      'Revoke returns 200 OK with status REVOKED. Reading the revoked key returns 404 Not Found (the key is gone). Reading the made-up key ID also returns 404 Not Found. Seen on staging on 2026-10-01; Dev still to confirm it is intended (question BQ-02). Revoking the same key a second time is checked separately in AISLE-FT-004.',
    request:
      'POST /api/v1/pii-test/free-text/keys {} · POST /api/v1/pii-test/free-text/keys/revoke {"key_id":"<key ID>"} · POST /api/v1/pii-test/free-text/keys/read {"key_id":"<same key ID>"} · POST /api/v1/pii-test/free-text/keys/read {"key_id":"<made-up ID>"}',
    validation: [
      'Revoke status is 200 with status REVOKED',
      'Reading the revoked key → 404',
      'Reading a made-up key ID → 404',
    ],
    type: 'Positive',
    priority: 'High',
    preconditions: FREE_TEXT_ACCESS,
  },
  'AISLE-FT-004': {
    what: 'Creates a fake free-text key (a secret used to encrypt notes), revokes it (switches it off for good), then sends the same revoke request a second time.',
    why: 'Apps may repeat a revoke, for example after a network error. The reply must be predictable, so a repeat is not mistaken for a failure, or a failure for success.',
    steps: [
      'Create a fake key',
      'Revoke it and check the reply is 200 with status REVOKED',
      'Revoke the same key again',
      'Check the reply to the second revoke',
    ],
    expected:
      'Not decided yet. On 2026-10-01 staging answered the second revoke with 200 OK. Dev must say whether that is intended (200: “already revoked, nothing to do”) or whether it should be 404 Not Found. Blocked until Dev answers question BQ-33.',
    request:
      'POST /api/v1/pii-test/free-text/keys {} · POST /api/v1/pii-test/free-text/keys/revoke {"key_id":"<key ID>"} (twice)',
    validation: [
      'First revoke: status 200 with status REVOKED',
      'Second revoke: the status agreed with Dev (added once question BQ-33 is answered)',
    ],
    type: 'Negative',
    priority: 'Medium',
    preconditions:
      'Blocked until Dev answers question BQ-33 (should revoking an already-revoked key return 404 or 200?).',
  },
};
