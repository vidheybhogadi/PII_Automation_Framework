import type { TestCaseCatalog } from './types';

const SAVE = 'POST /api/v1/pii-test';
const READ = 'POST /api/v1/pii-test/read';

export const READ_CASES: TestCaseCatalog = {
  'AISLE-RD-001': {
    what: 'Saves a fake name for a new fake test user, then reads the NAME field through the Aisle facade (Aisle’s front door to the PII service).',
    why: 'Reading back exactly what was saved is the basic promise of the service.',
    steps: ['Save a fake name for a new fake user', 'Send a read request asking for NAME', 'Check the reply'],
    expected: '200 OK. Count is 1. The single item has that user ID, field NAME and exactly the saved name.',
    request: `${SAVE} {"user_id":"<new fake user>","field":"NAME","value":"QA Automation User <letters>"} · ${READ} {"user_id":"<same user>","field_names":["NAME"]}`,
    validation: [
      'Status is 200',
      'Reply data has the same user ID and count 1',
      'Exactly one item, with field NAME',
      'The value equals the saved fake name',
    ],
    type: 'Positive',
    priority: 'Critical',
  },
  'AISLE-RD-002': {
    what: 'Saves only a fake name for a new fake test user, then reads NAME and EMAIL together in one request.',
    why: 'Screens often ask for several fields at once. A field that is missing must not hide the ones that exist.',
    steps: [
      'Save a fake name for a new fake user',
      'Send one read request asking for NAME and EMAIL',
      'Check which items come back',
    ],
    expected:
      '200 OK. Count is 1 and only the NAME item is returned, with the saved name. Seen on staging on 2026-10-01.',
    request: `${SAVE} {"user_id":"<new fake user>","field":"NAME","value":"QA Automation User"} · ${READ} {"user_id":"<same user>","field_names":["NAME","EMAIL"]}`,
    validation: [
      'Status is 200 and count is 1',
      'Only a NAME item is returned',
      'The NAME value equals the saved fake name',
    ],
    type: 'Positive',
    priority: 'Medium',
    preconditions:
      'Needs EMAIL access for the Aisle caller (granted on 2026-10-01). If it is refused with 403 (access denied), the test is marked Blocked and the report shows that real reply.',
  },
  'AISLE-RD-003': {
    what: 'Reads the NAME field for a new fake user ID before anything is saved, then saves a fake name for it and reads again.',
    why: 'The app must be able to tell “no data yet” apart from a failure, and a first save must make the data readable.',
    steps: [
      'Make a new fake user ID and read its NAME',
      'Save a fake name for that user',
      'Read the NAME again',
    ],
    expected:
      'The first read gets 404 Not Found with the message “PII value not found” and the error code PII_NOT_FOUND (seen on staging). After the save, the read returns 200 with the saved name.',
    request: `${READ} {"user_id":"<new fake user>","field_names":["NAME"]} · ${SAVE} {"user_id":"<same user>","field":"NAME","value":"QA Automation User"} · ${READ} (again)`,
    validation: [
      'First read: status 404, error code PII_NOT_FOUND, message “PII value not found”, no data',
      'Save succeeds (201)',
      'Second read: status 200 with the saved fake name',
    ],
    type: 'Negative',
    priority: 'High',
  },
  'AISLE-RD-004': {
    what: 'Sends a read for a fake user with an empty list of fields.',
    why: 'A read that asks for nothing must be refused, never answered with someone’s data.',
    steps: ['Send a read with an empty field list', 'Check the reply'],
    expected:
      '422 (refused: the request format is invalid), naming the field list. No values are returned. The minimum of one field was observed from the service’s own validation message (2026-09-29).',
    request: `${READ} {"user_id":"<fake user>","field_names":[]}`,
    validation: ['Empty field list → 422 naming field_names', 'No server error (5xx)'],
    type: 'Negative',
    priority: 'Medium',
  },
  'AISLE-RD-005': {
    what: 'Reads a made-up field name (one the service does not know) for a fake test user.',
    why: 'Only agreed personal fields may be read. The service must refuse anything else.',
    steps: ['Send a read asking for a made-up field name', 'Check the reply'],
    expected:
      '403 Forbidden (refused: access denied) with the error code AUTHORIZATION_DENIED, as seen on staging on 2026-09-29.',
    request: `${READ} {"user_id":"<fake user>","field_names":["QA_AUTOMATION_UNKNOWN_FIELD"]}`,
    validation: ['Status is 403', 'Error code is AUTHORIZATION_DENIED', 'Reply data is empty'],
    type: 'Negative',
    priority: 'Medium',
  },
  'AISLE-RD-006': {
    what: 'Saves a fake name and a fake email for one fake user, then reads both fields in one request.',
    why: 'Apps usually need several details at once. Every requested field must come back with the right value.',
    steps: [
      'Save a fake name and a fake email for a new fake user',
      'Read NAME and EMAIL together',
      'Check both values',
    ],
    expected: '200 OK, count 2, one NAME item and one EMAIL item with the saved values. Seen on 2026-10-01.',
    request: `${READ} {"user_id":"<fake user>","field_names":["NAME","EMAIL"]}`,
    validation: ['Status 200', 'Count is 2', 'NAME and EMAIL values match what was saved'],
    type: 'Positive',
    priority: 'High',
  },
  'AISLE-RD-007': {
    what: 'Saves a fake name, then reads NAME together with a made-up field name.',
    why: 'One bad field name must not quietly return part of the data or reveal anything; the caller must notice the mistake.',
    steps: ['Save a fake name', 'Read NAME plus a made-up field name', 'Check the reply'],
    expected:
      '403 Forbidden with code AUTHORIZATION_DENIED for the whole read, and no data returned (not even the name). Seen on 2026-10-01.',
    request: `${READ} {"user_id":"<fake user>","field_names":["NAME","QA_AUTOMATION_UNKNOWN_FIELD"]}`,
    validation: ['Status 403 AUTHORIZATION_DENIED', 'No data in the reply', 'No server error (5xx)'],
    type: 'Negative',
    priority: 'High',
  },
  'AISLE-RD-008': {
    what: 'Saves a fake name, then reads with the field list ["NAME","NAME"].',
    why: 'Records what the service does with a repeated field, so apps do not double-count data.',
    steps: ['Save a fake name', 'Read with NAME listed twice', 'Check the count and the items'],
    expected:
      '200 OK with the name returned twice (count 2); duplicates are not removed. Seen on 2026-10-01.',
    request: `${READ} {"user_id":"<fake user>","field_names":["NAME","NAME"]}`,
    validation: ['Status 200', 'Count is 2', 'Both items hold the saved name'],
    type: 'Positive',
    priority: 'Low',
  },
  'AISLE-RD-009': {
    what: 'Sends three reads with empty parts: a field list holding null, an empty user ID, and a field list holding an empty field name.',
    why: 'Empty input must be refused, never treated as “any user” or “any field”.',
    steps: ['Read with field_names [null]', 'Read with user ID ""', 'Read with field_names [""]'],
    expected:
      'field_names [null] and user ID "" get 422 Unprocessable Entity (refused: the request format is invalid). field_names [""] gets 403 AUTHORIZATION_DENIED (it is treated as an unknown field) with no data. Seen on 2026-10-01; whether "" should be a 422 is open (question BQ-38).',
    request: `${READ} {"user_id":"<fake user>","field_names":[null]} · {"user_id":"","field_names":["NAME"]} · {"field_names":[""]}`,
    validation: [
      '[null] → 422 naming field_names.0',
      'user ID "" → 422 naming user_id',
      '[""] → 403 with no data',
      'No server error (5xx)',
    ],
    type: 'Negative',
    priority: 'Medium',
  },
};
