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
    request:
      'POST /api/v1/pii-test {"user_id":"<new fake user>","field":"NAME","value":"QA Automation User","tenant_id":"qa-auto-fake-tenant"} · POST /api/v1/pii-test/read {… "tenant_id":"qa-auto-fake-tenant"} · POST /api/v1/pii-test/read {"user_id":"<same user>","field_names":["NAME"]}',
    validation: [
      'Either the save is refused and nothing is saved, or it succeeds',
      'Save reply tenant is “aisle”',
      'Read replies and items show tenant “aisle”, never the made-up tenant',
      'The normal read returns the fake name',
    ],
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
    request:
      'POST /api/v1/pii-test {"field":"NAME","value":"QA Automation User <unique letters>"} (user ID left out)',
    validation: [
      'Status is 422 naming user_id',
      'The reply does not contain the fake name',
      'The reply does not contain “tenant_id”',
    ],
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
    request:
      'POST /api/v1/pii-test (fake name) · POST /api/v1/pii-test/read (same user) · POST /api/v1/pii-test without Authorization header',
    validation: [
      'The calls were logged, with request IDs',
      'Neither the token nor the fake name is in the test log',
      'Neither is in the report notes or attachments',
    ],
    type: 'Security',
    priority: 'Critical',
  },
  'AISLE-SEC-004': {
    what: 'Tries to read the NAME of the configured “other” test user (a synthetic account, not a real person) with our test token (the secret pass that proves who is calling).',
    why: 'If any token can read any user, one leaked token exposes everyone.',
    steps: ['Send a read for the other test user’s NAME', 'Check the reply'],
    expected: 'Refused and no data returned. The exact status is waiting on Dev (question BQ-07).',
    request: 'POST /api/v1/pii-test/read {"user_id":"<configured other test user>","field_names":["NAME"]}',
    validation: ['The read is refused', 'No data is returned'],
    type: 'Security',
    priority: 'Critical',
    preconditions:
      'Blocked: today any made-up user ID can be read and written with the same token. Whether that is intended is Dev’s decision (question BQ-07).',
  },
  'AISLE-SEC-005': {
    what: 'Triggers five kinds of error reply (no token, broken body, unknown field, never-saved user, missing value) and searches each reply for signs of the service’s insides.',
    why: 'Error replies that show stack traces (the internal code path of a crash), internal addresses, server versions or database names help attackers plan an attack.',
    steps: [
      'Send a read with no token, a save with a broken body, a save with a made-up field, a read for a never-saved fake user and a save with no value',
      'Check the five replies have the expected status codes',
      'Search each reply for internal details',
    ],
    expected:
      'The replies are 401, 400, 403, 404 and 422. None contains a stack trace, an exception name, a private network address, “localhost”, an internal host name such as “pii-service”, a server name with a version (for example nginx or uvicorn) or a database driver name. Whether tenant and key version belong in success replies is a separate open question and is not judged here (question BQ-29).',
    request:
      'POST /api/v1/pii-test/read without Authorization header · POST /api/v1/pii-test with a broken body · POST /api/v1/pii-test {"user_id":"<fake user>","field":"QA_AUTOMATION_UNKNOWN_FIELD","value":"QA Automation User"} · POST /api/v1/pii-test/read {"user_id":"<never-saved fake user>","field_names":["NAME"]} · POST /api/v1/pii-test {"user_id":"<fake user>","field":"NAME"}',
    validation: [
      'Statuses are 401, 400, 403, 404 and 422, in that order',
      'No reply contains a stack trace (“Traceback” or “File … line”) or an exception class name',
      'No reply contains a private IP address, “localhost” or “127.0.0.1”',
      'No reply contains an internal host name (“pii-service”, “pii_service”)',
      'No reply contains a server banner (uvicorn, gunicorn, nginx/<version>, Apache/<version>) or a database driver name (sqlalchemy, psycopg, postgres)',
      'Only the kind of detail and which reply is reported, never the reply text',
    ],
    type: 'Security',
    priority: 'High',
    endpoint: 'crossEndpoint',
  },
};
