import type { TestCaseCatalog } from './types';

const DB_BLOCKED =
  'Blocked until QA gets read-only database access and the table layout (question BQ-04). Only look-up (SELECT) queries are ever run.';

const DESIGN_BLOCKED =
  'Blocked until QA gets read-only access to the PII service’s own database (not the Aisle app database) and Dev confirms the table layout (question BQ-04). The QA database user must be able to read the encrypted-value, nonce and auth-tag columns. Only look-up (SELECT) queries are ever run.';

const AUDIT_BLOCKED =
  'Blocked until QA gets read-only access to the PII service’s audit trail (MongoDB “audit_trails”) and Dev confirms what it records and how to find a request’s entry (question BQ-30). Only look-ups are ever run.';

export const DATABASE_CASES: TestCaseCatalog = {
  'AISLE-DB-001': {
    what: 'Saves a fake name, then checks the stored record with a read-only database query (it can only look, never change anything).',
    why: 'The database must hold data for the right owner, and not as readable text; otherwise anyone with database access could read it.',
    steps: [
      'Save a fake name for a new fake user',
      'Run the read-only query for that user and the NAME field',
      'Check the user, field, tenant (customer account) and key version (the number of the encryption key used)',
      'Search the stored value for the name as plain text, hex and Base64 (common ways to write text as characters)',
    ],
    expected:
      'Exactly one record for that user and NAME, under the same tenant as the save reply. The key version matches the save reply (if the database stores one). The name is not readable in the stored value. This alone does not prove encryption; the encryption format is waiting on Dev (question BQ-04).',
    request:
      'POST /api/v1/pii-test {"user_id":"<new fake user>","field":"NAME","value":"QA Automation User"} · read-only database query “findPiiRecords” (tenant, user, NAME)',
    validation: [
      'Exactly one stored record',
      'Stored user, field and tenant match the save reply',
      'Stored key version matches the save reply (when present)',
      'The name is not readable in the stored value',
    ],
    type: 'Database',
    priority: 'Critical',
    preconditions: DB_BLOCKED,
  },
  'AISLE-DB-002': {
    what: 'Saves fake name A, then fake name B for the same fake user, checking the stored record after each save.',
    why: 'Updates must not leave old personal data behind in extra records.',
    steps: [
      'Save name A and look up the stored record',
      'Save name B and look up the stored record again',
      'Compare the two',
    ],
    expected:
      'There is still exactly one record, and its stored bytes changed. Name B is not readable in it. Encryption format waiting on Dev (question BQ-04).',
    request:
      'POST /api/v1/pii-test (name A) · database query · POST /api/v1/pii-test (name B) · database query',
    validation: [
      'One record after each save',
      'The stored bytes changed after the replace',
      'Name B is not readable in the stored value',
    ],
    type: 'Database',
    priority: 'High',
    preconditions: DB_BLOCKED,
  },
  'AISLE-DB-004': {
    what: 'Saves a fake email through the facade, then looks it up directly in the database (read-only).',
    why: 'Emails must be stored for the right person only, and never as readable text in the database.',
    steps: [
      'Save a fake email for a new fake user',
      'Look up that user’s EMAIL record in the database',
      'Check the stored value',
    ],
    expected:
      'Exactly one record for that user and field EMAIL, under the same tenant as the save reply, and the stored value does not contain the email in readable form.',
    request:
      'POST /api/v1/pii-test {"user_id":"<new fake user>","field":"EMAIL","value":"<fake email>"} · read-only database lookup',
    validation: ['One record', 'Right user, field and tenant', 'Email not stored as readable text'],
    type: 'Database',
    priority: 'High',
    preconditions: DB_BLOCKED,
  },
  'AISLE-DB-005': {
    what: 'Sends a save with a value of only spaces (refused with 422), then looks for that user in the database (read-only).',
    why: 'A refused save must leave nothing behind, not even a half-written record.',
    steps: [
      'Send a save with value "   " for a new fake user',
      'Check it is refused (422)',
      'Look up the user in the database',
    ],
    expected: 'The save gets 422 Unprocessable Entity, and the database holds no record for that user.',
    request:
      'POST /api/v1/pii-test {"user_id":"<new fake user>","field":"NAME","value":"   "} · read-only database lookup',
    validation: ['Save is 422', 'No database record for the user'],
    type: 'Database',
    priority: 'Medium',
    preconditions: DB_BLOCKED,
  },
  'AISLE-DB-006': {
    what: 'Saves a fake name for a new fake user. Then looks at the stored record with a read-only database query (it can only look, never change anything) and checks the parts of the encrypted value.',
    why: 'The design says every value is encrypted with AES-256-GCM (a standard, strong encryption method). If a stored part has the wrong size or points to the wrong key, the value may not really be encrypted, or it may never be readable again.',
    steps: [
      'Save a fake name for a new fake user',
      'Run the read-only query for that user’s NAME record',
      'Check the size of the nonce (a random number used once per encryption) and of the auth tag (a tamper seal: decryption fails if the stored bytes are changed)',
      'Check the key version (the number of the encryption key used) and that the encrypted value is not empty',
      'Search the stored value for the name as plain text, hex and Base64 (common ways to write data as characters)',
    ],
    expected:
      'The save gets 201 Created. There is exactly one record for that user and NAME. The nonce is exactly 12 bytes and the auth tag exactly 16 bytes. The encrypted value is not empty. The key version is 1 or higher and equals the key version in the save reply. The name is not readable in any form. Per the PII-service design (tech doc v3); to be confirmed by Dev (question BQ-04).',
    request:
      'POST /api/v1/pii-test {"user_id":"<new fake user>","field":"NAME","value":"<fake name>"} · read-only database query “findPiiRecords” (user, NAME)',
    validation: [
      'Save status is 201',
      'Exactly one stored record',
      'Nonce is exactly 12 bytes',
      'Auth tag is exactly 16 bytes',
      'Encrypted value is not empty',
      'Key version is 1 or higher and equals the save reply',
      'The name is not readable (plain, hex or Base64)',
    ],
    type: 'Database',
    priority: 'Critical',
    preconditions: DESIGN_BLOCKED,
  },
  'AISLE-DB-007': {
    what: 'Saves fake name X for a new fake user and looks up the stored record. Then saves exactly the same name again and looks it up again.',
    why: 'If the same name always produced the same stored bytes, anyone with database access could spot which users share a name, or tell when a value did not change. The design requires a fresh random nonce (a number used once) on every save.',
    steps: [
      'Save a fake name and look up the stored record (its nonce, encrypted bytes and last-updated time are compared only as fingerprints, never printed)',
      'Save the same fake name again',
      'Look up the record again',
      'Compare the two',
    ],
    expected:
      'The first save gets 201 Created and the second 200 OK (replaced), as seen on staging. There is still exactly one record. The nonce changed and the encrypted bytes changed. The last-updated time is later than before. Per the PII-service design; to be confirmed by Dev (question BQ-04).',
    request:
      'POST /api/v1/pii-test {"user_id":"<new fake user>","field":"NAME","value":"<fake name X>"} (twice) · read-only database query after each save',
    validation: [
      'Statuses are 201, then 200',
      'One record after each save',
      'The nonce changed',
      'The encrypted bytes changed',
      'The last-updated time moved forward',
    ],
    type: 'Database',
    priority: 'High',
    preconditions: DESIGN_BLOCKED,
  },
  'AISLE-DB-008': {
    what: 'Saves one of the team-approved test phone numbers (fake numbers reserved for testing, never a real person’s) as the PHONE of a new fake user. Then looks up the stored record.',
    why: 'A phone number is a direct way to contact a person. It must never be readable by someone who can see the database.',
    steps: [
      'Save an approved test phone for a new fake user',
      'Look up that user’s PHONE record',
      'Search the stored value for the number as typed, as digits only, and in international E.164 form (“+91” followed by the number), each as plain text, hex and Base64',
    ],
    expected:
      'The save gets 201 Created. There is exactly one PHONE record for that user. Its key version (the number of the encryption key used) matches the save reply. The number is not readable in any of these forms. Per the PII-service design; to be confirmed by Dev (question BQ-04).',
    request:
      'POST /api/v1/pii-test {"user_id":"<new fake user>","field":"PHONE","value":"<approved test phone>"} · read-only database query (user, PHONE)',
    validation: [
      'Save status is 201',
      'Exactly one PHONE record for the user',
      'Key version matches the save reply',
      'The number is not readable as typed, as digits only, or as +91 and the digits',
    ],
    type: 'Database',
    priority: 'High',
    preconditions: `${DESIGN_BLOCKED} Also needs the approved test phones in AISLE_TEST_PHONES; without them the test is marked Blocked (CONFIG).`,
  },
  'AISLE-DB-009': {
    what: 'Saves the same fake email for fake users A and B (B types it in capitals), a different fake email for user C, and a fake name for user A. Then reads the search fingerprint of each record. The fingerprint (lookup token) is a one-way code made from the cleaned-up value, so users can be found by email without decrypting anything.',
    why: 'Search relies on this fingerprint. Equal emails must give equal fingerprints, otherwise search misses people. Different emails must differ, otherwise search returns the wrong person. Names are not searchable, so they must have no fingerprint at all.',
    steps: [
      'Save fake email E for user A, and the same email in capitals for user B',
      'Save a different fake email for user C',
      'Save a fake name for user A',
      'Look up the four records and compare their fingerprints without printing them',
    ],
    expected:
      'All saves get 201 Created. A’s and B’s EMAIL fingerprints are present and equal (the fingerprint is taken after the email is cleaned up to lower case, as seen in AISLE-SR-001). C’s fingerprint is present and different. A’s NAME record has no fingerprint (empty). Per the PII-service design; to be confirmed by Dev (question BQ-04). This fits the staging observation that a shared email finds both owners (AISLE-SR-010).',
    request:
      'POST /api/v1/pii-test (EMAIL for users A, B and C; NAME for user A) · read-only database query for each record',
    validation: [
      'All saves are 201',
      'A and B have the same fingerprint',
      'C has a different fingerprint',
      'A’s NAME record has no fingerprint',
    ],
    type: 'Database',
    priority: 'High',
    preconditions: DESIGN_BLOCKED,
  },
  'AISLE-DB-010': {
    what: 'Creates a temporary phone (a short-lived phone record not yet tied to a user) from an approved test number. Then promotes it, which makes it the permanent phone of a new fake user, and looks up that user’s PHONE record.',
    why: 'Promote is a second way phones get into storage. It must store them as safely as a normal save, otherwise phones added this way would be readable in the database.',
    steps: [
      'Create a temporary phone from an approved test number, with a 300-second lifetime',
      'Promote it to a new fake user',
      'Look up the user’s PHONE record',
      'Check the parts of the encrypted value and search the stored value for the number',
    ],
    expected:
      'Create gets 201 Created and promote 200 OK (seen on staging; the reply format is still to be confirmed, question BQ-02). There is exactly one PHONE record. The key version (the number of the encryption key used) is 1 or higher. The nonce (a number used once) is 12 bytes and the auth tag (a tamper seal) 16 bytes. A search fingerprint is present, because PHONE is searchable. The number is not readable as typed, as digits only, or as “+91” and the digits. Per the PII-service design; to be confirmed by Dev (question BQ-04).',
    request:
      'POST /api/v1/pii-test/transient/phones {"phone":"<approved test phone>","ttl_seconds":300} · POST /api/v1/pii-test/transient/phones/promote {"transient_id":"<ID>","user_id":"<new fake user>"} · read-only database query (user, PHONE)',
    validation: [
      'Create is 201 and promote is 200',
      'Exactly one PHONE record',
      'Key version is 1 or higher',
      'Nonce is 12 bytes and auth tag is 16 bytes',
      'A search fingerprint is present',
      'The number is not readable in any form',
    ],
    type: 'Database',
    priority: 'Medium',
    preconditions: `${DESIGN_BLOCKED} Also needs the approved test phones (otherwise Blocked: CONFIG), and is marked Blocked if temporary-phone access is refused with 403 (question BQ-02).`,
    endpoint: 'promoteTransientPhone',
  },
  'AISLE-DB-011': {
    what: 'Saves a fake name. Then reads only the key-number and status columns of the key list (the database table that lists the encryption keys), never the keys themselves, and compares them with the saved record.',
    why: 'If no key, or two keys, were active, saves could fail or use the wrong key. A record pointing to a key that does not exist could never be decrypted, so the data would be lost.',
    steps: [
      'Save a fake name for a new fake user',
      'Read the key list (key number and status only)',
      'Look up the user’s NAME record',
      'Compare the record’s key version (the number of the key used) with the list',
    ],
    expected:
      'The save gets 201 Created. Exactly one key has status ACTIVE. Every status is READY, ACTIVE or READ_ONLY. The record’s key version is in the list, and it is the ACTIVE key, because a new save always uses the active key. Per the PII-service design; to be confirmed by Dev (question BQ-04).',
    request:
      'POST /api/v1/pii-test {"user_id":"<new fake user>","field":"NAME","value":"<fake name>"} · read-only database queries “findKeyRegistry” (key number and status only) and “findPiiRecords”',
    validation: [
      'Exactly one ACTIVE key',
      'Every status is READY, ACTIVE or READ_ONLY',
      'The record’s key version is in the key list',
      'The record uses the ACTIVE key',
    ],
    type: 'Database',
    priority: 'Medium',
    preconditions: `${DESIGN_BLOCKED} The QA database user may read only the key-number and status columns of the key list.`,
  },
  'AISLE-DB-012': {
    what: 'Saves a fake name and a fake email for a new fake user and notes the stored records. Then reads them, bulk-reads them (reads several users in one request) and searches for the email with values on, and looks at the records again.',
    why: 'A read must only look. If reading re-wrote records, a simple lookup could damage or re-encrypt data, and the timestamps would no longer show when data really changed.',
    steps: [
      'Save a fake name and a fake email for a new fake user',
      'Note both stored records (as fingerprints only)',
      'Read, bulk-read and search for the user’s data',
      'Look up the records again and compare',
    ],
    expected:
      'Read, bulk read and search each get 200 OK (seen on staging). For both records the encrypted bytes, the nonce (a number used once), the key version and the last-updated time are unchanged. Per the PII-service design; to be confirmed by Dev (question BQ-04).',
    request:
      'POST /api/v1/pii-test (NAME, EMAIL) · POST /api/v1/pii-test/read · POST /api/v1/pii-test/batch/read · POST /api/v1/pii-test/EMAIL/search {"value":"<fake email>","limit":10,"include_values":true} · read-only database queries before and after',
    validation: [
      'Read, bulk read and search are 200',
      'Encrypted bytes unchanged',
      'Nonce unchanged',
      'Key version unchanged',
      'Last-updated time unchanged',
    ],
    type: 'Database',
    priority: 'Low',
    preconditions: DESIGN_BLOCKED,
    endpoint: 'crossEndpoint',
  },
  'AISLE-DB-013': {
    what: 'Creates a free-text key (a secret Aisle will use to encrypt long texts such as a bio). Looks up its stored record in the PII database (read-only). Then revokes the key (switches it off for good) and looks again.',
    why: 'Anyone who could read the raw key in the database could decrypt users’ free text. The database must also really record a revoke, otherwise a “revoked” key might still be handed out.',
    steps: [
      'Create a free-text key',
      'Look up its stored record by key ID',
      'Check the status is ACTIVE and the raw key is not in the stored data',
      'Revoke the key',
      'Look up the record again',
    ],
    expected:
      'Create gets 201 Created and revoke 200 OK with status REVOKED (seen on staging). Before the revoke there is one record with status ACTIVE. The raw key does not appear in the stored data, as raw bytes, Base64 or hex. After the revoke the status is REVOKED and the revoked time is set. The table and storage format are unknown; to be confirmed by Dev (questions BQ-04 and BQ-45). If Dev says keys are stored raw, this test stays strict and fails as a security finding.',
    request:
      'POST /api/v1/pii-test/free-text/keys {} · read-only database query “findFreeTextKey” · POST /api/v1/pii-test/free-text/keys/revoke {"key_id":"<key ID>"} · the same query again',
    validation: [
      'One stored record with status ACTIVE',
      'The raw key is not stored (raw bytes, Base64 or hex)',
      'Revoke is 200 with status REVOKED',
      'After the revoke the stored status is REVOKED and the revoked time is set',
    ],
    type: 'Database',
    priority: 'High',
    preconditions:
      'Blocked until QA gets read-only access to the PII service’s own database (question BQ-04) and Dev says which table stores free-text keys and whether the key is stored encrypted (question BQ-45). Only look-up (SELECT) queries are ever run.',
    endpoint: 'createFreeTextKey',
  },
  'AISLE-DB-014': {
    what: 'Saves a fake email for a new fake user, reads it and searches for it. Then looks up the audit trail (the service’s log of who did what, kept for 7 days) for each of the three requests.',
    why: 'DPDP (India’s data-protection law) requires knowing who accessed personal data and when. The audit log itself must not become another copy of that data.',
    steps: [
      'Save a fake email for a new fake user',
      'Read it',
      'Search for it, with values off (asking for user IDs only)',
      'Look up the audit entry of each request by its request ID',
      'Search all three entries for the email',
    ],
    expected:
      'Save gets 201 Created, read 200 OK and search 200 OK. There is exactly one audit entry per request, with the actions PII_WRITE, PII_READ and PII_SEARCH. Each entry has status SUCCESS and names the EMAIL field. The save and read entries list the fake user. The search entry has a result count of 1 or more. Each entry has a created time and an expiry time 7 days later. The email (as typed and as cleaned up) and the search term appear nowhere in any entry. Per the PII-service design; to be confirmed by Dev (question BQ-30). Also open: whether the request ID QA sends is the one stored in the audit trail.',
    request:
      'POST /api/v1/pii-test {"field":"EMAIL",…} · POST /api/v1/pii-test/read · POST /api/v1/pii-test/EMAIL/search {"value":"<fake email>","limit":10,"include_values":false} · read-only audit look-up by request ID',
    validation: [
      'Exactly one audit entry per request',
      'Actions PII_WRITE, PII_READ and PII_SEARCH',
      'Status SUCCESS and the EMAIL field on each',
      'Save and read entries list the fake user; the search entry has a result count of 1 or more',
      'Each entry expires 7 days after it was created',
      'The email and the search term appear nowhere',
    ],
    type: 'Database',
    priority: 'High',
    preconditions: AUDIT_BLOCKED,
    endpoint: 'crossEndpoint',
  },
  'AISLE-DB-015': {
    what: 'Sends a save with a field name that does not exist, which staging refuses with 403 AUTHORIZATION_DENIED (access denied). Then looks up the audit entry (the service’s log of who did what) for that request.',
    why: 'Refused attempts are what investigators look for after misuse. If refusals were not logged, misuse would go unnoticed.',
    steps: [
      'Send a save with an unknown field name and a fake name',
      'Check the reply is 403',
      'Look up the audit entry by the request ID',
      'Check the entry and search it for the fake name',
    ],
    expected:
      'The save gets 403 Forbidden with code AUTHORIZATION_DENIED (seen on staging). There is one audit entry with action AUTHZ_FAILURE (authorization failure) and status DENIED. The fake name appears nowhere in it. Per the PII-service design; Dev must confirm which action and status this refusal records (question BQ-30).',
    request:
      'POST /api/v1/pii-test {"user_id":"<new fake user>","field":"<unknown field>","value":"<fake name>"} · read-only audit look-up by request ID',
    validation: [
      'Save is 403 AUTHORIZATION_DENIED',
      'One audit entry for the request',
      'Action AUTHZ_FAILURE and status DENIED',
      'The fake name appears nowhere in the entry',
    ],
    type: 'Database',
    priority: 'Medium',
    preconditions: AUDIT_BLOCKED,
  },
};
