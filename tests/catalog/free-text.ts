import type { TestCaseCatalog } from './types';

const FREE_TEXT_ACCESS =
  'Needs free-text key access for the Aisle caller (granted on 2026-10-01). If a call is refused with 403 (access denied), the test is marked Blocked and the report shows that real reply.';

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
      '201 Created with a key ID and a 256-bit key (32 bytes, written in Base64 characters). The header “Cache-Control: no-store” (tells browsers and proxies not to keep a copy) is present. The key does not appear in our logs. Seen on staging on 2026-10-01.',
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
      '200 OK with the same key, and the header “Cache-Control: no-store” (tells browsers and proxies not to keep a copy). Seen on staging on 2026-10-01.',
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
    why: 'Revoking must really switch a key off, for example after it leaked. Asking for a key that does not exist must not return anything. Revoking is also expected to be how free text is erased (crypto-shredding: the encrypted text stays in Aisle’s database, but can never be decrypted again because the key is gone); to be confirmed by Dev (question BQ-47).',
    steps: [
      'Create a fake key',
      'Revoke it and check the reply',
      'Try to read the revoked key',
      'Try to read a made-up key ID',
    ],
    expected:
      'Revoke returns 200 OK with status REVOKED. Reading the revoked key returns 404 Not Found (the key is gone). Reading the made-up key ID also returns 404 Not Found. Seen on staging on 2026-10-01. Revoking the same key a second time is checked separately in AISLE-FT-004.',
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
  'AISLE-FT-005': {
    what: 'Creates two free-text keys (secrets used to encrypt notes) one after the other and compares them without printing them.',
    why: 'If two keys were the same, opening one person’s notes would open another’s.',
    steps: ['Create a key', 'Create a second key', 'Compare their key IDs and keys'],
    expected: 'Both creates succeed; the two key IDs differ and the two keys differ. Seen on 2026-10-01.',
    request: 'POST /api/v1/pii-test/free-text/keys {} (twice)',
    validation: ['Key IDs differ', 'Keys differ'],
    type: 'Security',
    priority: 'High',
    preconditions: FREE_TEXT_ACCESS,
  },
  'AISLE-FT-006': {
    what: 'Reads and revokes keys using a key ID that is badly formed, empty, or a number.',
    why: 'Bad key IDs must be refused clearly, never matched to some other key.',
    steps: ['Send read with each bad key ID', 'Send revoke with each bad key ID', 'Check the replies'],
    expected:
      'Every request gets 422 Unprocessable Entity (refused: the request format is invalid) naming key_id. Seen on 2026-10-01.',
    request:
      'POST /api/v1/pii-test/free-text/keys/read {"key_id":"not-a-uuid"} · {"key_id":""} · {"key_id":123} (and the same for /revoke)',
    validation: ['Each is 422 naming key_id', 'No server error (5xx)'],
    type: 'Negative',
    priority: 'Medium',
    preconditions: FREE_TEXT_ACCESS,
  },
  'AISLE-FT-007': {
    what: 'Revokes a made-up key ID (a valid-looking ID that never existed).',
    why: 'Revoking something that does not exist must say so, not pretend it worked.',
    steps: ['Make a random key ID', 'Send the revoke request', 'Check the reply'],
    expected:
      '404 Not Found with code FREE_TEXT_KEY_NOT_FOUND and the message “Free-text key not found”. Seen on 2026-10-01.',
    request: 'POST /api/v1/pii-test/free-text/keys/revoke {"key_id":"<random ID>"}',
    validation: ['Status 404 FREE_TEXT_KEY_NOT_FOUND', 'Message “Free-text key not found”'],
    type: 'Negative',
    priority: 'Medium',
    preconditions: FREE_TEXT_ACCESS,
  },
  'AISLE-FT-008': {
    what: 'Creates a free-text key (a secret used to encrypt long texts such as a bio). On the test machine, uses it to encrypt a fake bio with AES-256-GCM (the encryption method named in the reply) and a fresh random 12-byte nonce (a number used once). Then reads the key again by its key ID and decrypts the fake bio with the key it got back.',
    why: 'This is how Aisle will protect long texts: encrypt with the key now, and decrypt later with the same key fetched from the service. If the key returned later did not work, users’ texts could never be shown again.',
    steps: [
      'Create a free-text key and check the reply',
      'Encrypt a fake bio on the test machine with that key',
      'Read the key again by its key ID',
      'Decrypt the fake bio with the re-read key',
      'Compare the result with the original fake bio',
    ],
    expected:
      'Create gets 201 Created with algorithm AES-256-GCM. Read gets 200 OK. Decryption succeeds (the tamper seal, which rejects wrong keys or changed data, is accepted), and the text equals the original fake bio exactly. The key is never printed; it is only compared through a hash. The encryption is done by the test, not by the service: this proves the key the service hands out is usable and stays the same. Create and read were seen on staging on 2026-10-01.',
    request:
      'POST /api/v1/pii-test/free-text/keys {} · POST /api/v1/pii-test/free-text/keys/read {"key_id":"<key ID>"}',
    validation: [
      'Create is 201 with algorithm AES-256-GCM',
      'Read is 200',
      'Decryption with the re-read key succeeds',
      'The decrypted text equals the original fake bio',
    ],
    type: 'Positive',
    priority: 'Medium',
    preconditions: FREE_TEXT_ACCESS,
    endpoint: 'readFreeTextKey',
  },
};
