import type { TestCaseCatalog } from './types';

export const RESPONSE_SECURITY_CASES: TestCaseCatalog = {
  'AISLE-SEC-003': {
    what: 'Saves and reads a fake name, sends one request that is refused, then scans our call log, report notes and attachments for the token (the secret pass proving the caller is Aisle’s test app), and the call log for the fake name.',
    why: 'Reports show the exact requests and replies, with the fake test data, so failures can be debugged. The token must never appear anywhere, or anyone reading a report could call the service as Aisle. The short call log is kept free of personal data.',
    steps: [
      'Save and read a fake name',
      'Send one save without a token (it is refused with 401)',
      'Scan the call log for the token and the fake name',
      'Scan the report notes and attachments for the token',
    ],
    expected:
      'The token is found nowhere: reports show it only as $AISLE_TEST_TOKEN. The call log (the redacted list of calls) contains no fake name, but still shows request IDs (tracking numbers for each call), so problems can be traced. Report attachments may show the fake name in the exact requests and replies; that is intended.',
    request:
      'POST /api/v1/pii-test (fake name) · POST /api/v1/pii-test/read (same user) · POST /api/v1/pii-test without Authorization header',
    validation: [
      'The calls were logged, with request IDs',
      'Neither the token nor the fake name is in the call log',
      'The token is not in the report notes or attachments',
      'The exact request/response attachment is checked for the real token by the report self-check',
    ],
    type: 'Security',
    priority: 'Critical',
  },
  'AISLE-SEC-005': {
    what: 'Triggers three error replies that come from the PII service (unknown field, never-saved user, empty value) and searches each one for signs of the service’s insides.',
    why: 'Error replies that show stack traces (the internal code path of a crash), internal addresses, server versions or database names help attackers plan an attack.',
    steps: [
      'Send a save with a made-up field, a read for a never-saved fake user and a save with an empty value',
      'Check the three replies have the expected status codes',
      'Search each reply for internal details',
    ],
    expected:
      'The replies are 403, 404 and 422. None contains a stack trace, an exception name, a private network address, “localhost”, an internal host name such as “pii-service”, a server name with a version (for example nginx or uvicorn) or a database driver name. Whether tenant and key version belong in success replies is a separate open question and is not judged here (question BQ-29).',
    request:
      'POST /api/v1/pii-test {"user_id":"<fake user>","field":"QA_AUTOMATION_UNKNOWN_FIELD","value":"QA Automation User"} · POST /api/v1/pii-test/read {"user_id":"<never-saved fake user>","field_names":["NAME"]} · POST /api/v1/pii-test {"user_id":"<fake user>","field":"NAME","value":""}',
    validation: [
      'Statuses are 403, 404 and 422, in that order',
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
  'AISLE-SEC-006': {
    what: 'Checks that replies containing personal data (read, bulk read, search with values) carry the header “Cache-Control: no-store” (tells browsers and proxies not to keep a copy).',
    why: 'A cached copy of personal data can be read later by someone else using the same computer or proxy. Note: it is not confirmed whether the PII service or the facade sets this header (question BQ-39).',
    steps: [
      'Read a fake user’s data',
      'Bulk read and search with values',
      'Check the Cache-Control header of each reply',
    ],
    expected:
      'Each reply carries “no-store”. Blocked: on 2026-10-01 these replies carried “max-age=0, private, must-revalidate” (no “no-store”), while free-text-key replies do carry it. It is not known whether the PII service or the facade sets this header (question BQ-39).',
    request: 'POST /api/v1/pii-test/read · …/batch/read · …/EMAIL/search {"include_values":true}',
    validation: ['Blocked until Dev says which layer sets the header'],
    type: 'Security',
    priority: 'Medium',
    preconditions: 'Blocked until Dev answers question BQ-39.',
    endpoint: 'crossEndpoint',
  },
};
