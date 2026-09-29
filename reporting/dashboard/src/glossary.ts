/** Plain-English explanations for technical terms (tooltips, Report Guide and glossary). */
export const GLOSSARY: Record<string, string> = {
  PII: 'Personally Identifiable Information — data that identifies a person, such as an email address, phone number or name. The PII service is the only system allowed to store or reveal it.',
  READ: 'Permission to decrypt and return a field (e.g. read a user’s EMAIL).',
  WRITE: 'Permission to create or replace a field.',
  SEARCH: 'Permission to find users by an exact value without necessarily seeing the value.',
  BULK_READ: 'Permission to read many users × fields in one batch request.',
  Tenant:
    'A separate data namespace. The same user ID in two tenants is two different people; data must never cross tenants.',
  Normalization:
    'Making values consistent before storage: emails lower-cased and trimmed, phones reduced to digits, names with single spaces.',
  Encryption: 'Locking a value with a key so the database only ever holds unreadable ciphertext.',
  key_version: 'Which version of the data-encryption key (DEK) protected a value — lets keys rotate safely.',
  P50: 'Median: half of the API responses were faster than this.',
  P95: '95% of API responses were faster than this; the slowest 5% took longer. A common view of “tail latency”.',
  P99: '99% of API responses were faster than this.',
  Latency:
    'How long the Aisle PII API took to answer one HTTP request (measured by the client). Different from test duration, which includes setup and several requests.',
  Retry:
    'Automatically repeating a request after a temporary 503. Only read-only operations are retried; writes never are.',
  Fixme: 'A test marked as known-not-runnable. Shown separately — never counted as passed.',
  Blocked:
    'A test that cannot run until Dev answers an open question or grants access (BQ-xx / Q-xx). Never counted as passed, and not counted as a failure.',
  'Security finding':
    'A test that fails on a known, reported security issue (BQ-xx). Expected to fail until Dev fixes it; still counted as a failure for the verdict.',
  Skipped: 'A test deliberately not run in this execution (out of scope or a data prerequisite missing).',
  'Quality gate':
    'A pass/fail checkpoint for one area (e.g. Authentication). The run is only “PASSED” if every critical gate passes.',
  'Health score':
    'A transparent 0–100 summary combining pass rate, critical pass rate, execution completeness and endpoint coverage. See the methodology.',
  'Request ID':
    'A random correlation ID sent with every call (X-Request-Id). Give it to backend engineers to find the matching server log. It contains no personal data.',
  'No-store':
    'An HTTP header (Cache-Control: no-store) telling browsers and proxies never to cache sensitive responses such as decrypted values or keys.',
  Flaky:
    'A test that passes and fails intermittently without code changes. Only flagged as “potentially flaky” after enough runs.',
  'Transient phone':
    'A short-lived encrypted phone mapping (e.g. during sign-up) that can later be promoted to permanent PII.',
  'Free-text key':
    'A 256-bit AES key the PII service issues so a calling service can encrypt free text itself.',
};
