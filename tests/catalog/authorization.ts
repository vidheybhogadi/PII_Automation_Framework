import type { TestCaseCatalog } from './types';

const LIMITED = 'Needs a restricted caller (limited) — skipped until configured';
const LIMITED_PHONE =
  'Needs a restricted caller (limited) — skipped until configured; needs approved test phone numbers';

export const AUTHORIZATION_CASES: TestCaseCatalog = {
  'PII-AZ-001': {
    what: 'Tries to save an email using the limited caller (an app that is not allowed to save emails), then checks nothing was stored.',
    why: 'If an app without permission could save emails, it could overwrite or plant personal data it should never touch.',
    steps: [
      'As the limited caller, save a fake email for a new fake user',
      'Check the reply',
      'As the full-permission caller, confirm no email was stored for that user',
    ],
    expected:
      '403 Forbidden with the authorization-denied error code; no email exists for the user afterwards.',
    type: 'Security',
    priority: 'Critical',
    preconditions: LIMITED,
  },
  'PII-AZ-002': {
    what: 'Saves a fake email, then tries to read it using the limited caller, which is not allowed to read emails.',
    why: 'If this worked, any registered app could read users’ email addresses regardless of what it was granted.',
    steps: [
      'As the full-permission caller, save a fake email for a fake user',
      'As the limited caller, read that user’s email',
      'Check the reply',
    ],
    expected: '403 Forbidden with the authorization-denied error code.',
    type: 'Security',
    priority: 'Critical',
    preconditions: LIMITED,
  },
  'PII-AZ-003': {
    what: 'Asks for a user’s name (allowed) and email (not allowed) in one request with the limited caller, and checks the whole request is refused.',
    why: 'If the service returned the allowed part, or all of it, an app could sneak a forbidden field into a request for an allowed one.',
    steps: [
      'As the full-permission caller, save a fake name and email for a fake user',
      'As the limited caller, read NAME and EMAIL together for that user',
      'Check the reply',
    ],
    expected:
      '403 Forbidden with the authorization-denied error code (the whole request is refused, not partly answered).',
    type: 'Security',
    priority: 'Critical',
    preconditions: LIMITED,
  },
  'PII-AZ-004': {
    what: 'Control check: saves a fake name, then reads it with the limited caller, which is allowed to read names.',
    why: 'Proves the limited caller is set up correctly, so the 403s in the other tests are caused by missing permissions and not by a broken caller setup.',
    steps: [
      'As the full-permission caller, save a fake name for a fake user',
      'As the limited caller, read that user’s name',
      'Check the reply',
    ],
    expected: '200 OK; the reply has the expected shape and contains exactly one item.',
    type: 'Positive',
    priority: 'High',
    preconditions: LIMITED,
  },
  'PII-AZ-005': {
    what: 'Control check: saves a fake email, then searches for it with the limited caller without asking for the values back (IDs only).',
    why: 'Proves the limited caller’s search permission works, so failures in other tests are really about missing permissions.',
    steps: [
      'As the full-permission caller, save a fake email for a fake user',
      'As the limited caller, search for that exact email, asking for user IDs only',
      'Check the reply',
    ],
    expected: '200 OK; the matches list contains exactly that one user ID and nothing else.',
    type: 'Positive',
    priority: 'High',
    preconditions: LIMITED,
  },
  'PII-AZ-006': {
    what: 'Searches for an email with the limited caller while asking for the email values back, which also needs read permission it does not have.',
    why: 'If search could return values, an app allowed only to search could use it as a back door to read emails.',
    steps: [
      'As the full-permission caller, save a fake email for a fake user',
      'As the limited caller, search for that email and ask for the values to be included',
      'Check the reply and its full text',
    ],
    expected:
      '403 Forbidden with the authorization-denied error code; the email does not appear anywhere in the reply.',
    type: 'Security',
    priority: 'Critical',
    preconditions: LIMITED,
  },
  'PII-AZ-007': {
    what: 'Searches for a phone number with the limited caller, which has no phone permissions at all.',
    why: 'If this worked, an app with no phone access could find out which users have a given phone number.',
    steps: ['As the limited caller, search for an approved test phone number', 'Check the reply'],
    expected: '403 Forbidden with the authorization-denied error code.',
    type: 'Security',
    priority: 'Critical',
    preconditions: LIMITED_PHONE,
  },
  'PII-AZ-008': {
    what: 'Uses bulk read (reading many users in one request) with the limited caller for names, which it may read one at a time but has no bulk-read permission for.',
    why: 'Bulk read makes it easy to copy lots of data at once; if it ignored its own permission, an app could mass-export personal data.',
    steps: [
      'As the full-permission caller, save a fake name for a fake user',
      'As the limited caller, bulk-read the name for that user',
      'Check the reply',
    ],
    expected: '403 Forbidden with the authorization-denied error code.',
    type: 'Security',
    priority: 'Critical',
    preconditions: LIMITED,
  },
  'PII-AZ-009': {
    what: 'With the limited caller (no phone permission), tries to create a temporary phone record and to promote (turn into a permanent user phone) one made by another caller.',
    why: 'If this worked, an app without phone access could store phone numbers or attach them to users.',
    steps: [
      'As the limited caller, create a temporary phone record and check the reply',
      'As the full-permission caller, create a temporary phone record',
      'As the limited caller, try to promote that record to a user and check the reply',
    ],
    expected:
      'Both attempts return 403 Forbidden with the authorization-denied error code (the permission check happens before the record lookup).',
    type: 'Security',
    priority: 'Critical',
    preconditions: LIMITED_PHONE,
  },
  'PII-AZ-010': {
    what: 'Creates a temporary phone record, then tries to look up its phone number with the limited caller, which may not read phones.',
    why: 'If this worked, an app without phone access could read phone numbers through temporary records.',
    steps: [
      'As the full-permission caller, create a temporary phone record',
      'As the limited caller, look up that record',
      'Check the reply',
    ],
    expected: '403 Forbidden with the authorization-denied error code.',
    type: 'Security',
    priority: 'Critical',
    preconditions: LIMITED_PHONE,
  },
  'PII-AZ-011': {
    endpoint: 'crossEndpoint',
    what: 'With the limited caller, tries to create, read and revoke (switch off) a free-text encryption key (a secret key used to encrypt free text).',
    why: 'If an unpermitted app could read or revoke keys, it could decrypt data or break other apps by disabling their keys.',
    steps: [
      'As the limited caller, create a key and check the reply',
      'As the full-permission caller, create a key',
      'As the limited caller, read that key and check the reply',
      'As the limited caller, revoke that key and check the reply',
    ],
    expected: 'All three attempts return 403 Forbidden with the authorization-denied error code.',
    type: 'Security',
    priority: 'Critical',
    preconditions: LIMITED,
  },
  'PII-AZ-012': {
    what: 'Makes one email read with the limited caller and checks the test framework’s API call log to confirm the request was sent only once.',
    why: 'A "not allowed" answer will not change on retry; retrying it wastes time and floods the service with denied requests.',
    steps: [
      'As the limited caller, read the email of a fake user',
      'Open the framework’s API call log',
      'Count retry lines and read-request lines',
    ],
    expected: 'No retry lines in the log and exactly one read request logged.',
    type: 'Security',
    priority: 'Medium',
    preconditions: LIMITED,
  },
};
