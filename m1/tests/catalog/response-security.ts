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
    what: 'Saves a fake name and a fake email for a new fake user, then reads it, bulk reads it (one request for several users) and searches the email with and without values. Checks the “Cache-Control” header (the instruction to browsers and proxies about keeping copies) of each reply.',
    why: 'A cached copy of personal data can be read later by someone else using the same computer or proxy (a server that passes traffic on and may keep copies).',
    steps: [
      'Save a fake name and a fake email for a new fake user',
      'Read the name and bulk read it',
      'Search the email with values and without values',
      'Check the Cache-Control header of each reply',
    ],
    expected:
      'Every reply is 200 OK and its Cache-Control header contains “no-store” (do not keep any copy). Seen on staging on 2026-11-19: “no-store, no-cache, must-revalidate, max-age=0”, after the facade fix of 16 Nov.',
    request:
      'POST /api/v1/pii-test/read · POST /api/v1/pii-test/batch/read · POST /api/v1/pii-test/EMAIL/search {"include_values":true} and {"include_values":false}',
    validation: [
      'Read, bulk read and both searches are 200',
      'Each reply’s Cache-Control header contains “no-store”',
    ],
    type: 'Security',
    priority: 'Medium',
    endpoint: 'crossEndpoint',
  },
  'AISLE-SEC-007': {
    what: 'Sends three bad requests, each carrying a unique fake marker text: a save with a fake name that is too long, a read with an extra unknown key, and a bulk read with 201 fake users. Then checks that none of the refusals repeats the marker or the tenant (the customer account the data belongs to — always “aisle” here).',
    why: 'Error replies end up in the caller’s logs. If they repeated what was sent, personal data would leak into places no one protects.',
    steps: [
      'Send a save with a too-long fake name that starts with a unique marker',
      'Send a read with an extra unknown key holding a marker, and a bulk read of 201 fake users with a marker user ID',
      'Check each reply is 422 REQUEST_VALIDATION_ERROR naming the right field',
      'Check no reply contains its marker, “tenant_id” or “input”',
    ],
    expected:
      '422 Unprocessable Entity (refused: the request format is invalid) each time, with code REQUEST_VALIDATION_ERROR: the save names body.value as string_too_long, the read names body.unknown as extra_forbidden (a key that is not allowed), and the bulk read names body.user_ids as too_long. No reply contains the marker, a tenant_id or an “input” echo. Seen on staging on 2026-11-19, after Dev’s fix (ClickUp 14zmk4dnunb).',
    request:
      'POST /api/v1/pii-test {"user_id":"<fake user>","field":"NAME","value":"<marker> xxx…(1,024+)"} · POST /api/v1/pii-test/read {…,"qa_extra_key":"<marker>"} · POST /api/v1/pii-test/batch/read {"user_ids":["<marker>", "<200 fake users>"],"fields":["NAME"]}',
    validation: [
      'Each reply is 422 REQUEST_VALIDATION_ERROR naming the expected field and error type',
      'No reply contains its marker value',
      'No reply contains tenant_id or an input echo',
    ],
    type: 'Security',
    priority: 'Medium',
    endpoint: 'crossEndpoint',
  },
};
