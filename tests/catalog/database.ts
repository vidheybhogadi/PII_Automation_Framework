import type { TestCaseCatalog } from './types';

const DB_BLOCKED =
  'Blocked until QA gets read-only database access and the table layout (question BQ-04). Only look-up (SELECT) queries are ever run.';

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
  'AISLE-DB-003': {
    what: 'Sends a save of a fake name for a new fake user with no token (the secret pass proving the caller is Aisle’s test app), then looks in the database for that user.',
    why: 'A refused request must leave nothing behind.',
    steps: ['Send a save with no token', 'Check it is refused with 401', 'Look up that user in the database'],
    expected: '401 Unauthorized (refused: not signed in), and no record exists for that user.',
    request:
      'POST /api/v1/pii-test {"user_id":"<new fake user>","field":"NAME","value":"QA Automation User"} without Authorization header · database query for that user',
    validation: ['The save gets 401 with no data', 'No stored record exists for that user'],
    type: 'Database',
    priority: 'High',
    preconditions: DB_BLOCKED,
  },
};
