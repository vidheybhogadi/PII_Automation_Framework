import type { TestCaseCatalog } from './types';

export const POC_CASES: TestCaseCatalog = {
  'POC-001': {
    what: 'Saves a fake name (the NAME field) for a brand-new fake test user through the Aisle facade (Aisle’s front door to the PII service).',
    why: 'NAME is the field Aisle can store today. If saving fails or the name is attached to the wrong user, profile features break.',
    steps: [
      'Make a new fake user ID and a fake name for this run',
      'Send the save request for the NAME field with the token (the secret pass proving the caller is Aisle’s test app)',
      'Check the reply',
    ],
    expected:
      '201 Created (a new value was saved) with the message “PII write successful”. The reply names tenant “aisle” (the customer account the data belongs to), the same user ID, the field NAME and a key version (the number of the encryption key used) of 1 or more. The name itself is not repeated in the reply.',
    request:
      'POST /api/v1/pii-test {"user_id":"<new fake user>","field":"NAME","value":"QA Automation User <letters>"}',
    validation: [
      'Status is 201 and the message is “PII write successful”',
      'Reply data has tenant “aisle”, the same user ID and field NAME',
      'Key version is a whole number of 1 or more',
      'The fake name does not appear anywhere in the reply',
    ],
    type: 'Positive',
    priority: 'Critical',
  },
  'POC-002': {
    what: 'Saves a messy fake name (spaces around it and several spaces between words) for a new fake test user, then reads the NAME field back.',
    why: 'Names are shown and compared across Aisle. If they are not cleaned up the same way every time, users see untidy or duplicate names.',
    steps: [
      'Save a messy fake name for a new fake user',
      'Send a read request for that user asking for NAME',
      'Compare the returned value with the expected clean form',
    ],
    expected:
      '200 OK with the message “PII read successful”. Exactly one item (count 1) for that user, tenant “aisle” (the customer account the data belongs to) and field NAME. The value has the outer spaces removed and each run of inner spaces turned into one space, as seen on staging.',
    request:
      'POST /api/v1/pii-test {"user_id":"<new fake user>","field":"NAME","value":"   QA   Automation   User <letters>  "} · POST /api/v1/pii-test/read {"user_id":"<same user>","field_names":["NAME"]}',
    validation: [
      'Read status is 200 and the message is “PII read successful”',
      'Count is 1',
      'The item has tenant “aisle”, the same user ID and field NAME',
      'The value equals the clean name (trimmed, single spaces, capitals kept)',
    ],
    type: 'Positive',
    priority: 'Critical',
  },
  'POC-003': {
    what: 'Saves a messy fake name, then looks up the stored record with an approved read-only database query (it can only look, never change anything).',
    why: 'If the name were stored as readable text, anyone with database access could read users’ personal details.',
    steps: [
      'Save a messy fake name for a new fake user',
      'Run the read-only query for that user and the NAME field',
      'Check the user, field, tenant (the customer account) and key version (the number of the encryption key used)',
      'Search the stored value for the name as plain text, hex and Base64 (common ways to write text as characters)',
    ],
    expected:
      'Exactly one record for that user and NAME, under the same tenant as the save reply. Its key version matches the save reply (if the database stores one). Neither the typed nor the cleaned name appears in any readable form. This only shows the name is not readable. It does not prove it is encrypted; the encryption format is still waiting on Dev (question BQ-04).',
    request:
      'POST /api/v1/pii-test {"user_id":"<new fake user>","field":"NAME","value":"   QA   Automation   User <letters>  "} · read-only database query “findPiiRecords” (tenant, user, NAME)',
    validation: [
      'Exactly one stored record for that user and NAME',
      'Stored user, field and tenant match the save reply',
      'Stored key version matches the save reply (when the database has one)',
      'Neither the typed nor the cleaned name is readable in the stored value',
    ],
    type: 'Database',
    priority: 'Critical',
    preconditions: 'Blocked until QA gets read-only database access and the table layout (question BQ-04).',
  },
};
