import type { TestCaseCatalog } from './types';

const SAVE = 'POST /api/v1/pii-test';
const READ = 'POST /api/v1/pii-test/read';

export const WRITE_CASES: TestCaseCatalog = {
  'AISLE-WR-001': {
    what: 'Saves a fake name (the NAME field) for a brand-new fake test user through the Aisle facade (Aisle’s front door to the PII service).',
    why: 'Saving personal data is the core job of the service. If new users cannot be saved, nothing else works.',
    steps: [
      'Make a new fake user ID and a fake name',
      'Send the save request with the token (the secret pass proving the caller is Aisle’s test app)',
      'Check the reply',
    ],
    expected:
      '201 Created (a new value was saved) with the message “PII write successful”. The reply shows tenant “aisle” (the customer account the data belongs to), the same user ID, field NAME and a key version (the number of the encryption key used) of 1 or more. The name itself is not repeated in the reply.',
    request: `${SAVE} {"user_id":"<new fake user>","field":"NAME","value":"QA Automation User <letters>"}`,
    validation: [
      'Status is 201 and the message is “PII write successful”',
      'Reply data has tenant “aisle”, the same user ID and field NAME',
      'Key version is 1 or more',
      'The fake name is not repeated in the reply',
    ],
    type: 'Positive',
    priority: 'Critical',
  },
  'AISLE-WR-002': {
    what: 'Runs the full life of a saved name for one fake test user: save name A, read it, replace it with name B, read again, then bulk read (one request for several users).',
    why: 'If the old value survived an update, users would see outdated or wrong personal details.',
    steps: [
      'Save fake name A for a new fake user and read it back',
      'Save fake name B for the same user',
      'Read the name again',
      'Bulk read the name for that user',
    ],
    expected:
      'The first read returns name A. The second save returns 200 OK (an existing value was replaced) with “PII write successful” and tenant “aisle”. The second read and the bulk read both return name B, never name A.',
    request: `${SAVE} {"user_id":"<new fake user>","field":"NAME","value":"QA Automation User A"} · ${READ} {"user_id":"<same user>","field_names":["NAME"]} · ${SAVE} {… "value":"QA Automation User B"} · ${READ} (again) · POST /api/v1/pii-test/batch/read {"user_ids":["<same user>"],"fields":["NAME"]}`,
    validation: [
      'First read returns name A',
      'Replace returns 200 with “PII write successful” and tenant “aisle”',
      'Second read returns name B',
      'Bulk read returns exactly one item for that user with name B',
    ],
    type: 'Positive',
    priority: 'Critical',
  },
  'AISLE-WR-003': {
    what: 'Saves a fake name, then sends five broken save requests: no value, no user ID, no field name, a number as the value, and a number as the user ID.',
    why: 'A bug in the app must never overwrite or damage a user’s saved data.',
    steps: [
      'Save a fake name for a new fake user',
      'Send the three saves that each leave out one required part',
      'Send the two saves that use a number where text is expected',
      'Read the name back',
    ],
    expected:
      'Each broken request gets 422 (refused: the request format is invalid) with a list naming the wrong part. Reading afterwards still returns the original fake name.',
    request: `${SAVE} {"user_id":"<fake user>","field":"NAME"} · {"field":"NAME","value":"QA Automation User"} · {"user_id":"<fake user>","value":"QA Automation User"} · {"user_id":"<fake user>","field":"NAME","value":12345} · {"user_id":12345,"field":"NAME","value":"QA Automation User"}`,
    validation: [
      'Missing value → 422 naming value',
      'Missing user ID → 422 naming user_id',
      'Missing field → 422 naming field',
      'Number as value → 422 naming value; number as user ID → 422 naming user_id',
      'The saved name is unchanged afterwards',
    ],
    type: 'Negative',
    priority: 'High',
  },
  'AISLE-WR-004': {
    what: 'Saves a fake name, then sends a save request whose value is empty text.',
    why: 'An empty value would wipe a user’s details without anyone meaning to.',
    steps: ['Save a fake name for a new fake user', 'Send a save with an empty value', 'Read the name back'],
    expected:
      '422 (refused: the request format is invalid) naming the value as too short (the minimum is 1 character). The original fake name is unchanged. Limit observed from the service’s own validation message; to be confirmed by Dev (question BQ-05).',
    request: `${SAVE} {"user_id":"<fake user>","field":"NAME","value":""}`,
    validation: [
      'Status is 422 in the FastAPI “detail” list format',
      'The problem is reported at value',
      'The saved name is unchanged afterwards',
    ],
    type: 'Negative',
    priority: 'Medium',
  },
  'AISLE-WR-005': {
    what: 'Saves a fake name of exactly 1,024 characters for a fake user ID of exactly 128 characters, then reads it back.',
    why: 'Real users can have long names. The service must accept everything up to the allowed maximum.',
    steps: [
      'Make a 128-character fake user ID and a 1,024-character fake name',
      'Save the name',
      'Read it back',
    ],
    expected:
      '201 Created (a new value was saved). Reading returns the full 1,024-character name unchanged. Limit observed from the service’s own validation message; to be confirmed by Dev (question BQ-05).',
    request: `${SAVE} {"user_id":"<128-character fake user>","field":"NAME","value":"<1,024-character fake name>"} · ${READ} {"user_id":"<same user>","field_names":["NAME"]}`,
    validation: [
      'The generated user ID is exactly 128 characters and the name exactly 1,024',
      'Save status is 201 with “PII write successful”',
      'Reading returns the full name unchanged',
    ],
    type: 'Positive',
    priority: 'Medium',
  },
  'AISLE-WR-006': {
    what: 'Saves a normal fake name, then sends a save with a 129-character user ID and another with a 1,025-character name for the first user.',
    why: 'Over-long data could break storage or other systems that read it.',
    steps: [
      'Save a normal fake name for a new fake user',
      'Send a save with a 129-character fake user ID',
      'Send a save with a 1,025-character name for the first user',
      'Read the first user’s name',
    ],
    expected:
      'Both saves get 422 (refused: the request format is invalid), naming the user ID and the value as too long. The first user’s name is unchanged. Limit observed from the service’s own validation message; to be confirmed by Dev (question BQ-05).',
    request: `${SAVE} {"user_id":"<129-character fake user>","field":"NAME","value":"QA Automation User"} · ${SAVE} {"user_id":"<fake user>","field":"NAME","value":"<1,025-character fake name>"}`,
    validation: [
      '129-character user ID → 422 naming user_id',
      '1,025-character name → 422 naming value',
      'The first user’s saved name is unchanged',
    ],
    type: 'Negative',
    priority: 'Medium',
  },
  'AISLE-WR-007': {
    what: 'Saves a fake name, then sends a save request whose body is broken JSON (the text format the service expects), with the closing bracket missing.',
    why: 'Broken input must be refused cleanly, never half-processed.',
    steps: ['Save a fake name for a new fake user', 'Send a save with a broken body', 'Read the name back'],
    expected:
      '400 Bad Request (refused: the body could not be read) with status false, error “Invalid JSON” and message “Request body must be valid JSON”. The name is unchanged.',
    request: `${SAVE} body: {"user_id": "<fake user>", "field": "NAME", "value":   (cut off, not valid JSON)`,
    validation: [
      'Status is 400',
      'Body has status false, error “Invalid JSON” and message “Request body must be valid JSON”',
      'The saved name is unchanged afterwards',
    ],
    type: 'Negative',
    priority: 'Medium',
  },
  'AISLE-WR-008': {
    what: 'Tries to save a fake value under a field name the service does not know (a made-up field name).',
    why: 'Only agreed personal fields may be stored. Unknown fields would be data kept outside the rules.',
    steps: ['Send a save with a made-up field name and a fake value', 'Check the reply'],
    expected:
      '403 Forbidden (refused: access denied) with the error code AUTHORIZATION_DENIED, as seen on staging. Whether this should be a validation error instead is Dev’s call (questions BQ-12 and BQ-27).',
    request: `${SAVE} {"user_id":"<fake user>","field":"QA_AUTOMATION_UNKNOWN_FIELD","value":"QA Automation User"}`,
    validation: ['Status is 403', 'Error code is AUTHORIZATION_DENIED', 'Reply data is empty'],
    type: 'Negative',
    priority: 'Medium',
  },
  'AISLE-WR-009': {
    what: 'Tries to save a fake email that has no “@” in it, then checks nothing was saved.',
    why: 'Broken emails would make password resets and notifications fail without anyone noticing.',
    steps: [
      'Send a save for the EMAIL field with a fake value that has no “@”',
      'Check the reply',
      'Read EMAIL for that user',
    ],
    expected:
      'The save is refused (400 or 422: the value breaks a rule; Dev to confirm which, question BQ-01). Reading EMAIL returns 404 (not found): nothing was saved.',
    request: `${SAVE} {"user_id":"<new fake user>","field":"EMAIL","value":"<fake name>.at.example.test"} · ${READ} {"user_id":"<same user>","field_names":["EMAIL"]}`,
    validation: ['Save status is 400 or 422', 'Reading EMAIL afterwards returns 404 PII_NOT_FOUND'],
    type: 'Negative',
    priority: 'High',
    preconditions:
      'Blocked until Dev gives the Aisle caller access to EMAIL (question BQ-01). Today it returns 403 (access denied) because access is checked before the value (question BQ-14).',
  },
  'AISLE-WR-010': {
    what: 'Saves a messy fake email (capitals and spaces around it) for a new fake test user, then reads the EMAIL field back.',
    why: 'Aisle compares and shows emails. If they are not cleaned up the same way every time, logins and look-ups can fail.',
    steps: [
      'Save a messy fake email for a new fake user',
      'Send a read request for that user asking for EMAIL',
      'Compare the returned value with the expected clean form',
    ],
    expected:
      '200 OK with “PII read successful”. Exactly one item for that user, tenant “aisle” and field EMAIL. The value is the fake email in lower case with the outer spaces removed. This clean-up rule still has to be confirmed by Dev (question BQ-01).',
    request: `${SAVE} {"user_id":"<new fake user>","field":"EMAIL","value":"  QA.Auto.<run>@EXAMPLE.TEST  "} · ${READ} {"user_id":"<same user>","field_names":["EMAIL"]}`,
    validation: [
      'Save and read are not refused (today they are: 403, so the test is blocked)',
      'Read status is 200 with “PII read successful” and count 1',
      'The item has tenant “aisle”, the same user ID and field EMAIL',
      'The value is the fake email in lower case with outer spaces removed',
    ],
    type: 'Positive',
    priority: 'High',
    preconditions:
      'Blocked until Dev gives the Aisle caller access to EMAIL (question BQ-01). Today EMAIL calls return 403 (refused: access denied), and the report shows that real reply.',
  },
};
