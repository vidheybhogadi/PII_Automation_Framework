import type { TestCaseCatalog } from './types';

export const DATABASE_CASES: TestCaseCatalog = {
  'PII-DB-001': {
    what: 'Saves a fake test email for a user, then saves a different one for the same user, and checks the database still has one row whose encrypted value has changed.',
    why: 'If a second save added a new row instead of replacing the old one, the service could return stale or duplicate personal data.',
    steps: [
      'Save a first fake test email for a fake test user and check the database has one row',
      'Save a second fake test email for the same user and field',
      'Check the database row again',
    ],
    expected:
      'Second save returns 200; still exactly one row; its encrypted value differs from before, does not contain the new email in readable form, and (if exposed) its key version matches the save reply.',
    type: 'Database',
    priority: 'High',
    preconditions: 'Needs read-only database access.',
  },
  'PII-DB-002': {
    what: 'Saves a fake phone number and a fake name for a test user and checks neither appears in readable form in the database.',
    why: 'Personal data must be encrypted at rest (when stored); if it were readable, anyone with database access could see it.',
    steps: [
      'Save a fake test phone number (as typed) and a fake test name for a fake test user',
      'Read the stored PHONE and NAME rows directly from the database',
      'Look for the cleaned-up phone number and the name in the stored values',
    ],
    expected:
      'Neither the cleaned-up phone number nor the name is found in readable form in the stored values.',
    type: 'Database',
    priority: 'Critical',
    preconditions: 'Needs read-only database access and approved test phone numbers.',
  },
  'PII-DB-003': {
    what: 'Saves an email for the same user ID under two different tenants (separate customer organisations) and checks the database keeps two separate rows, each tied to its own tenant.',
    why: 'If rows from different tenants were merged or mixed up, one customer could see or overwrite another customer’s data.',
    steps: [
      'Save a fake test email for a user ID in the main test tenant',
      'Save a different fake test email for the same user ID in a second test tenant',
      'Look up the rows for each tenant in the database',
    ],
    expected: 'Each tenant has exactly one row for that user, and it carries that tenant’s ID only.',
    type: 'Security',
    priority: 'Critical',
    preconditions: 'Needs read-only database access and a second test tenant.',
  },
  'PII-DB-004': {
    what: 'Sends two save requests that must be refused — one signed by an unregistered caller, one whose content was changed after signing (a signature is a cryptographic stamp proving who sent the request) — and checks nothing was stored.',
    why: 'If a refused request still wrote data, an attacker could plant or change personal data without being authorised.',
    steps: [
      'Send a save request for a fake test email signed by an unregistered caller',
      'Send a save request whose content was altered after it was signed',
      'Look in the database for either user ID',
    ],
    expected:
      'Both requests return 401 with an authentication error code; the database has no row for either the original or the altered user ID.',
    type: 'Security',
    priority: 'Critical',
    preconditions: 'Needs read-only database access.',
  },
  'PII-DB-005': {
    what: 'Creates a temporary phone record, checks the database stores it encrypted under the right tenant with the right expiry, then links it to a fake user and checks it is marked used (or removed) and the user now has a phone.',
    why: 'Temporary phones hold personal data too; they must be encrypted, expire on time, and not be reusable after being linked to a user.',
    steps: [
      'Create a temporary phone record with an approved fake test phone number and the shortest allowed lifetime',
      'Check its database row: tenant, not used yet, phone not readable, expiry matches the reply',
      'Promote (link) it to a fake test user',
      'Check the temporary row again and the user’s PHONE row',
    ],
    expected:
      'Row exists with the right tenant, not marked used, phone not in readable form, expiry within the allowed clock difference; promote returns 200; afterwards the temporary row is marked used or gone, and the user has exactly one PHONE row.',
    type: 'Database',
    priority: 'High',
    preconditions:
      'Needs read-only database access and approved test phone numbers. Accepting “marked used” or “deleted” is an assumption noted against Dev question Q-25.',
  },
  'PII-DB-006': {
    what: 'Creates an encryption key for free text, checks the database stores it ACTIVE for the right tenant without the key itself being readable, then revokes it and checks it is marked REVOKED with a revoke time.',
    why: 'If a key were stored readable, anyone with database access could decrypt data; if revoking did not stick, a withdrawn key could still be used.',
    steps: [
      'Create a new encryption key for the test tenant',
      'Check its database row: tenant, status ACTIVE, and the key not stored in readable form',
      'Revoke the key',
      'Check the database row again',
    ],
    expected:
      'Row belongs to the test tenant with status ACTIVE and no readable copy of the key (in either text or raw form); revoke returns 200; the row then shows status REVOKED and a revoke time.',
    type: 'Security',
    priority: 'Critical',
    preconditions:
      'Needs read-only database access. If the database does not expose the stored key column, the readable-key check is skipped and noted against Dev question Q-16.',
  },
  'PII-DB-007': {
    what: 'Will do a bulk read (reading several fields or users in one request) and check exactly one audit record (a log entry of who read what) of type PII_BATCH_READ is written for it.',
    why: 'Every access to personal data must leave an audit trail; if bulk reads were not recorded, data access could go unnoticed.',
    steps: [
      'Save a fake test email for a fake test user',
      'Bulk-read the EMAIL and NAME fields for that user',
      'Find the audit records for that request’s ID',
    ],
    expected:
      'Bulk read returns 200; exactly one audit record of type PII_BATCH_READ exists for that request.',
    type: 'Security',
    priority: 'High',
    preconditions:
      'Waiting on Dev question Q-26 — the audit trail is in MongoDB, so read-only MongoDB access and a Mongo check in the framework (Q-35) are needed; shows as Not Tested until then.',
  },
};
