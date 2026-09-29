import type { TestCaseCatalog } from './types';

export const READ_CASES: TestCaseCatalog = {
  'AISLE-RD-001': {
    what: 'Saves a fake name for a new fake test user, then reads the NAME field through the Aisle facade (Aisle’s front door to the PII service).',
    why: 'Reading back exactly what was saved is the basic promise of the service.',
    steps: ['Save a fake name for a new fake user', 'Send a read request asking for NAME', 'Check the reply'],
    expected:
      '200 OK with the message “PII read successful”. Count is 1. The single item has tenant “aisle” (the customer account the data belongs to), that user ID, field NAME and exactly the saved name.',
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
    type: 'Positive',
    priority: 'Medium',
    preconditions:
      'Blocked until Dev gives the Aisle caller access to EMAIL (question BQ-01). Today this read returns 403 (refused: access denied).',
  },
  'AISLE-RD-003': {
    what: 'Reads the NAME field for a fake user ID that was never used.',
    why: 'The app must be able to tell “no data yet” apart from a failure.',
    steps: ['Make a fake user ID that was never saved', 'Send a read request for its NAME'],
    expected:
      '404 Not Found with the message “PII value not found” and the error code PII_NOT_FOUND. No values are returned.',
    type: 'Negative',
    priority: 'High',
  },
  'AISLE-RD-004': {
    what: 'Sends two broken read requests: one asking for an empty list of fields, one with no user ID.',
    why: 'Broken requests must be refused, never answered with someone’s data.',
    steps: ['Send a read with an empty field list', 'Send a read with no user ID'],
    expected:
      'Both get 422 (refused: the request format is invalid), naming the field list and the user ID respectively. No values are returned.',
    type: 'Negative',
    priority: 'Medium',
  },
};
