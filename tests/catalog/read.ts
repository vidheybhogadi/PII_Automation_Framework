import type { TestCaseCatalog } from './types';

const SAVE = 'POST /api/v1/pii-test';
const READ = 'POST /api/v1/pii-test/read';

export const READ_CASES: TestCaseCatalog = {
  'AISLE-RD-001': {
    what: 'Saves a fake name for a new fake test user, then reads the NAME field through the Aisle facade (Aisle’s front door to the PII service).',
    why: 'Reading back exactly what was saved is the basic promise of the service.',
    steps: ['Save a fake name for a new fake user', 'Send a read request asking for NAME', 'Check the reply'],
    expected:
      '200 OK with the message “PII read successful”. Count is 1. The single item has tenant “aisle” (the customer account the data belongs to), that user ID, field NAME and exactly the saved name.',
    request: `${SAVE} {"user_id":"<new fake user>","field":"NAME","value":"QA Automation User <letters>"} · ${READ} {"user_id":"<same user>","field_names":["NAME"]}`,
    validation: [
      'Status is 200 and the message is “PII read successful”',
      'Reply data has tenant “aisle”, the same user ID and count 1',
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
      '200 OK. Count is 1 and only the NAME item is returned, with the saved name. Dev still has to confirm that missing fields are simply left out (question BQ-01).',
    request: `${SAVE} {"user_id":"<new fake user>","field":"NAME","value":"QA Automation User"} · ${READ} {"user_id":"<same user>","field_names":["NAME","EMAIL"]}`,
    validation: [
      'Status is 200 and count is 1',
      'Only a NAME item is returned',
      'The NAME value equals the saved fake name',
    ],
    type: 'Positive',
    priority: 'Medium',
    preconditions:
      'Blocked until Dev gives the Aisle caller access to EMAIL (question BQ-01). Today this read returns 403 (refused: access denied).',
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
    what: 'Sends three broken read requests: one with an empty list of fields, one with no field list at all, and one with no user ID.',
    why: 'Broken requests must be refused, never answered with someone’s data.',
    steps: [
      'Send a read with an empty field list',
      'Send a read with no field list',
      'Send a read with no user ID',
    ],
    expected:
      'All three get 422 (refused: the request format is invalid), naming the field list or the user ID. No values are returned. The minimum of one field was observed from the service’s own validation message; to be confirmed by Dev (question BQ-05).',
    request: `${READ} {"user_id":"<fake user>","field_names":[]} · ${READ} {"user_id":"<fake user>"} · ${READ} {"field_names":["NAME"]}`,
    validation: [
      'Empty field list → 422 naming field_names',
      'Missing field list → 422 naming field_names',
      'Missing user ID → 422 naming user_id',
    ],
    type: 'Negative',
    priority: 'Medium',
  },
  'AISLE-RD-005': {
    what: 'Reads a made-up field name (one the service does not know) for a fake test user.',
    why: 'Only agreed personal fields may be read. The service must refuse anything else.',
    steps: ['Send a read asking for a made-up field name', 'Check the reply'],
    expected:
      '403 Forbidden (refused: access denied) with the error code AUTHORIZATION_DENIED, as seen on staging on 2026-09-29. Whether this should be a validation error instead is Dev’s call (questions BQ-12 and BQ-27).',
    request: `${READ} {"user_id":"<fake user>","field_names":["QA_AUTOMATION_UNKNOWN_FIELD"]}`,
    validation: ['Status is 403', 'Error code is AUTHORIZATION_DENIED', 'Reply data is empty'],
    type: 'Negative',
    priority: 'Medium',
  },
};
