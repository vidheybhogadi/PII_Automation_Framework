import type { TestCaseCatalog } from './types';

export const RESPONSE_SECURITY_CASES: TestCaseCatalog = {
  'AISLE-SEC-001': {
    what: 'Saves a fake name while also sending a made-up tenant (customer account) in the request, then reads it back with and without that made-up tenant.',
    why: 'If a caller could choose the tenant, Aisle could write into or read another customer’s data.',
    steps: [
      'Send a save of a fake name with an extra made-up tenant',
      'Check the reply',
      'Read the name with the made-up tenant added',
      'Read the name normally',
    ],
    expected:
      'Either the save is refused and nothing is saved, or (as seen on staging) it succeeds and every reply shows tenant “aisle”, never the made-up tenant. The normal read returns the fake name under “aisle”. Ignoring versus refusing is Dev’s call (question BQ-06).',
    type: 'Security',
    priority: 'Critical',
  },
  'AISLE-SEC-002': {
    what: 'Sends a save with the user ID left out, so it fails the format check while it contains a unique fake name, then searches the error reply for that name.',
    why: 'Error replies end up in logs and monitoring tools. They must not spread personal data or internal details.',
    steps: [
      'Send a save of a fake name with the user ID left out',
      'Check the reply is 422 (refused: the request format is invalid)',
      'Search the reply for the fake name and for the internal tenant field',
    ],
    expected:
      'The reply is 422 and contains neither the fake name nor the internal “tenant_id” field. KNOWN SECURITY FINDING: today the reply repeats both, so this test fails until Dev fixes it (question BQ-08).',
    type: 'Security',
    priority: 'High',
  },
  'AISLE-SEC-003': {
    what: 'Saves and reads a fake name, sends one request that is refused, then scans our own test log and report notes for the token (the secret pass proving the caller is Aisle’s test app) and the fake name.',
    why: 'QA reports are shared widely. A leaked token or personal value in them would be a security incident.',
    steps: [
      'Save and read a fake name',
      'Send one save without a token (it is refused with 401)',
      'Scan the test log and report notes for the token and the fake name',
    ],
    expected:
      'Neither the token nor the fake name is found anywhere. Request IDs (tracking numbers for each call) are still visible, so problems can be traced.',
    type: 'Security',
    priority: 'Critical',
  },
  'AISLE-SEC-004': {
    what: 'Tries to read the NAME of the configured “other” test user (a synthetic account, not a real person) with our test token (the secret pass that proves who is calling).',
    why: 'If any token can read any user, one leaked token exposes everyone.',
    steps: ['Send a read for the other test user’s NAME', 'Check the reply'],
    expected: 'Refused and no data returned. The exact status is waiting on Dev (question BQ-07).',
    type: 'Security',
    priority: 'Critical',
    preconditions:
      'Blocked: today any made-up user ID can be read and written with the same token. Whether that is intended is Dev’s decision (question BQ-07).',
  },
};
