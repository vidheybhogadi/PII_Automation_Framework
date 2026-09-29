import type { TestCaseCatalog } from './types';

const FREE_TEXT_BLOCKED =
  'Blocked until Dev gives the Aisle caller free-text key access (question BQ-02). Today these calls return 403 (refused: access denied).';

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
    type: 'Positive',
    priority: 'High',
    preconditions: FREE_TEXT_BLOCKED,
  },
  'AISLE-FT-002': {
    what: 'Creates a free-text key (a secret used to encrypt notes), then reads it again by its key ID.',
    why: 'Encrypted notes can only be opened again with exactly the same key.',
    steps: ['Create a key', 'Send the read-key request with its key ID', 'Compare the two keys'],
    expected:
      '200 OK with the same key, and the header “Cache-Control: no-store” (tells browsers and proxies not to keep a copy). To be confirmed by Dev (question BQ-02).',
    type: 'Positive',
    priority: 'High',
    preconditions: FREE_TEXT_BLOCKED,
  },
  'AISLE-FT-003': {
    what: 'Creates and revokes (permanently switches off) a free-text key, then tries to read it and revoke it again. Also reads a made-up key ID.',
    why: 'Revoking must really switch a key off, for example after it leaked.',
    steps: ['Create a key', 'Revoke it', 'Read it and revoke it again', 'Read a made-up key ID'],
    expected:
      'Revoke returns 200 OK with status REVOKED. The later read, the second revoke and the made-up key ID all return 404 (not found). To be confirmed by Dev (question BQ-02).',
    type: 'Positive',
    priority: 'High',
    preconditions: FREE_TEXT_BLOCKED,
  },
};
