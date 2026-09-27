import type { TestCaseCatalog } from './types';

export const FREE_TEXT_CASES: TestCaseCatalog = {
  'PII-FT-001': {
    what: 'Asks the service for a new free-text encryption key and checks it is an active AES-256-GCM key (a standard strong encryption method) of exactly 256 bits.',
    why: 'Apps use this key to encrypt users’ notes; a weak, wrong-sized or cacheable key would put that data at risk.',
    steps: [
      'Request a new encryption key for our tenant',
      'Check the reply fields and the response headers',
      'Decode the key and check its length',
    ],
    expected:
      '201 Created; tenant matches, algorithm AES-256-GCM, status ACTIVE; key decodes to exactly 32 bytes; Cache-Control: no-store (a header telling other systems not to keep a copy).',
    type: 'Positive',
    priority: 'High',
  },
  'PII-FT-002': {
    what: 'Reads back an active encryption key and checks it is exactly the key that was created.',
    why: 'Apps must get the same key later to decrypt notes they encrypted earlier; a different key would make the data unreadable.',
    steps: [
      'Create a new encryption key',
      'Read it using its key ID',
      'Compare the reply with the create reply',
    ],
    expected:
      '200 OK; Cache-Control: no-store; tenant, key ID, status ACTIVE, algorithm AES-256-GCM, creation time and key value all match the created key.',
    type: 'Positive',
    priority: 'High',
  },
  'PII-FT-003': {
    what: 'Revokes (permanently switches off) an encryption key and then tries to read it.',
    why: 'If a key is compromised, revoking it must stop anyone from getting it again.',
    steps: ['Create a new encryption key', 'Revoke it', 'Try to read it'],
    expected:
      'Revoke returns 200 OK with status REVOKED and a revoke time not earlier than the creation time; the read returns 404 FREE_TEXT_KEY_NOT_FOUND.',
    type: 'Positive',
    priority: 'High',
  },
  'PII-FT-004': {
    what: 'Revokes an encryption key, then tries to revoke the same key a second time.',
    why: 'A revoked key must stay revoked and be treated as gone; a second revoke must not bring it back or pretend it still exists.',
    steps: ['Create a new encryption key', 'Revoke it', 'Send a second revoke for the same key'],
    expected: 'The first revoke returns 200 OK; the second returns 404 FREE_TEXT_KEY_NOT_FOUND.',
    type: 'Negative',
    priority: 'Medium',
  },
  'PII-FT-005': {
    what: 'Has a second registered app (caller) try to read and revoke an encryption key created by our app.',
    why: 'A key belongs only to the app that created it; another app reading it could decrypt our users’ notes, and revoking it would break our app.',
    steps: [
      'Create a key as the main caller',
      'As the second caller, try to read it',
      'As the second caller, try to revoke it',
      'As the main caller, read it again',
    ],
    expected:
      'Both attempts by the second caller return 404 FREE_TEXT_KEY_NOT_FOUND; the owner can still read the key (200 OK).',
    type: 'Security',
    priority: 'Critical',
    preconditions: 'Needs a second registered caller (secondary) — skipped until configured',
  },
  'PII-FT-006': {
    what: 'Tries to read and revoke an encryption key using a different tenant (customer organisation) than the one it was created in.',
    why: 'Keys from one tenant must never be reachable or changeable from another tenant.',
    steps: [
      'Create a key in our tenant',
      'Try to read it with the second tenant',
      'Try to revoke it with the second tenant',
    ],
    expected: 'Both requests return 404 FREE_TEXT_KEY_NOT_FOUND.',
    type: 'Security',
    priority: 'Critical',
    preconditions: 'Needs a second test tenant',
  },
  'PII-FT-007': {
    what: 'Reads a key with a random ID that does not exist, reads with an ID that is not a valid UUID (the standard ID format), and creates a key without a tenant.',
    why: 'The service must clearly separate “not found” from “bad request” and not crash on bad input.',
    steps: [
      'Read a random, never-created key ID',
      'Read with the key ID "not-a-uuid"',
      'Send a create-key request with no tenant',
    ],
    expected:
      'Unknown ID returns 404 FREE_TEXT_KEY_NOT_FOUND; the bad ID and the missing tenant each return 422 with a validation error body.',
    type: 'Negative',
    priority: 'Medium',
  },
  'PII-FT-008': {
    what: 'Creates two encryption keys and checks they have different IDs and different key values.',
    why: 'If keys repeated, one app’s or note’s key could decrypt another’s data.',
    steps: ['Create a first key', 'Create a second key', 'Compare their IDs and key values'],
    expected: 'Both creates succeed; the key IDs differ and the key values differ.',
    type: 'Security',
    priority: 'High',
  },
  'PII-FT-009': {
    what: 'Uses a newly created key to encrypt a sample text with AES-256-GCM and decrypts it again.',
    why: 'A key that looks right but cannot actually encrypt and decrypt would leave apps unable to protect notes.',
    steps: [
      'Create a new encryption key',
      'Encrypt a synthetic text with it locally',
      'Decrypt the result with the same key',
    ],
    expected: 'Key creation succeeds and the decrypted text exactly matches the original.',
    type: 'Positive',
    priority: 'Medium',
  },
  'PII-FT-010': {
    what: 'Creates and reads a key, then scans the test’s API call log and report notes for the key value.',
    why: 'A key written into logs or reports could be copied by anyone who can see them, exposing all notes encrypted with it.',
    steps: [
      'Create a new encryption key',
      'Read it back',
      'Search the API call log for both key values',
      'Search the report notes for the key value',
    ],
    expected:
      'The read returns 200 OK; neither key value appears (in any readable form) in the API call log or report notes.',
    type: 'Security',
    priority: 'Critical',
  },
};
