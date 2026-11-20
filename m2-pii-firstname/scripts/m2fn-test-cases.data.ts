/**
 * Test design of the M2 PII First Name suite — Redis key API cases (M2FN-RDK-xxx). These APIs are the test support
 * of the white-box first-name cache tests: they read and clear one test user’s cached first name in Redis.
 *
 * Expected results come only from the quick reference (m2-pii-firstname/docs/redis-key-apis.md), staging
 * observations ("seen on staging 2026-11-09") or the Aisle code ("from code — confirm with Dev"). Open points cite
 * their M2FNQ-xx question (m2fn-questions.ts). The workbook m2-pii-firstname/docs/m2fn-test-cases.xlsx is built from
 * this file (npm run m2fn:docs); every automatable case has exactly one test in m2-pii-firstname/tests (UT-M2FN-001).
 */
import type { Category } from '../../m2/scripts/m2-grouping';

export type Priority = 'Critical' | 'High' | 'Medium' | 'Low';
export type Status =
  'PASS' | 'FAIL' | 'BLOCKED' | 'NEED DEV CLARIFICATION' | 'WAITING' | 'NOT APPLICABLE' | 'NOT RUN';
export type Mode = 'API automation' | 'Manual' | 'Dev-assisted';

export interface M2fnCase {
  id: string;
  module: string;
  apis: string[];
  fields: 'NAME'[];
  name: string;
  category: Category;
  priority: Priority;
  pre: string;
  data: string;
  steps: string[];
  validate: string;
  why: string;
  expected: string;
  /** DB verification for this case (read-only), or why there is none. */
  db: string;
  /** True when the test reads a database (tag @db). */
  dbCheck?: boolean;
  deps: string[];
  /**
   * Design status. "NOT RUN" = judged runnable: it stays runnable while only non-access questions are open (the
   * test records those parts instead of asserting them); any other value follows the open questions.
   */
  status: Status;
  mode: Mode;
  evidence: string;
  /**
   * A decision (not an open question) that keeps the case Blocked, e.g. a QA-lead “no” (M2FNQ-51). Shown as the
   * block reason; the case is never run while it is set.
   */
  blockedReason?: string;
}

// ---- Shared wording ---------------------------------------------------------------------------------------
const MODULE = 'CMS — Redis key APIs';
const RDK =
  'QA’s CMS admin (Redis permission) logged in with webcms: true and CMS OTP verified (a TOTP made from the admin’s secret) — M2FNQ-01, seen on staging 2026-11-09. Only keys of the suite’s own synthetic accounts, or run-unique keys that cannot exist, are read or deleted (key guard).';
const ACC = 'Synthetic app account: +91 number starting with 10 (never the 106 series), login OTP 1234.';
const OWN_ACC =
  'Its own dedicated synthetic account (+91 10…, never 106…), so deleting its cache never disturbs another test.';
const GATE_ON =
  'First-name read and write gates are ON on testa2 (ALLOW_PII_FIRST_NAME_READ / _WRITE = "true", seen on staging 2026-11-09).';
const DOC =
  'Redis key API quick reference (Aisle Engineering, 2026-11-09), m2-pii-firstname/docs/redis-key-apis.md';
const SEEN = 'seen on staging 2026-11-09';
const API_ONLY = 'API-level only.';
const PII_KEY = 'pii:v1:user:<user_id>:first_name';
const NOT_FOUND = 'GET 404 {status:false, message:"Redis key not found"}';

/** Redis key API cases (M2FN-RDK-xxx); the first-name white-box cases are in m2fn-firstname-cases.data.ts. */
export const RDK_CASES: M2fnCase[] = [
  {
    id: 'M2FN-RDK-001',
    module: MODULE,
    apis: ['API-213'],
    fields: ['NAME'],
    name: 'Read a test user’s PII first-name cache key',
    category: 'Functional',
    priority: 'High',
    pre: `${RDK} ${ACC}`,
    data: `The PII field cache key ${PII_KEY} of the synthetic account (M2FNQ-02).`,
    steps: [
      'Read the synthetic user’s first name once through GET /V1/pii_integration/first_name (API-001, TEST_TOKEN) so the PII field cache is filled.',
      `GET /admin/redis-keys?key=${PII_KEY}.`,
    ],
    validate:
      '200 {status:true, key, value}; key is the requested key; value is the plain first name and equals the name API-001 returned.',
    why: 'The white-box first-name tests read the caches through this API to prove which source answered.',
    expected: `200 {status:true, key:<key>, value:<stored string>} (quick reference §1); the PII key holds the plain first name (${SEEN}).`,
    db: 'API-level: the PII DB stores the name encrypted, so the cached value is compared with the PII read (API-001), not with the PII DB.',
    deps: ['M2FNQ-01', 'M2FNQ-02'],
    status: 'NOT RUN',
    mode: 'API automation',
    evidence: `${DOC}; M2FNQ-02 (${SEEN}).`,
  },
  {
    id: 'M2FN-RDK-002',
    module: MODULE,
    apis: ['API-214', 'API-213'],
    fields: ['NAME'],
    name: 'Delete a test user’s cache key, read it again, delete it again',
    category: 'State & idempotency',
    priority: 'High',
    pre: `${RDK} ${OWN_ACC}`,
    data: `The PII field cache key ${PII_KEY} of the case’s own synthetic account, filled by a first-name read (API-001).`,
    steps: [
      'Read the first name once (API-001) so the key exists.',
      'DELETE /admin/redis-keys?key=<key>.',
      'GET the same key.',
      'DELETE the same key again.',
      'Read the first name again (API-001) so the cache is filled again.',
    ],
    validate: 'DELETE 200 deleted:true → GET 404 → DELETE 200 deleted:false.',
    why: 'Every cache-miss test starts by deleting the user’s keys; a second delete must be harmless.',
    expected: `DELETE 200 {status:true, key, deleted:true}; ${NOT_FOUND}; DELETE 200 {status:true, key, deleted:false} (quick reference "Quick test"; ${SEEN}).`,
    db: API_ONLY,
    deps: ['M2FNQ-01', 'M2FNQ-02'],
    status: 'NOT RUN',
    mode: 'API automation',
    evidence: `${DOC}; M2FNQ-02 (${SEEN}).`,
  },
  {
    id: 'M2FN-RDK-003',
    module: MODULE,
    apis: ['API-213', 'API-214'],
    fields: [],
    name: 'Unknown key: GET 404, DELETE 200 deleted:false',
    category: 'Negative & edge case',
    priority: 'Medium',
    pre: RDK,
    data: 'A key that cannot exist: the run id (qa-m2-…) + "-rdk-absent".',
    steps: ['GET the key.', 'DELETE the key.'],
    validate: 'GET 404 {status:false, message}; DELETE 200 {status:true, key, deleted:false}.',
    why: 'Tests rely on a missing key being a normal state, not an error.',
    expected: `${NOT_FOUND}; DELETE 200 {status:true, key, deleted:false} (quick reference §2 and error table; ${SEEN}).`,
    db: API_ONLY,
    deps: ['M2FNQ-01'],
    status: 'NOT RUN',
    mode: 'API automation',
    evidence: `${DOC}; M2FNQ-02 (${SEEN}).`,
  },
  {
    id: 'M2FN-RDK-004',
    module: MODULE,
    apis: ['API-213', 'API-214'],
    fields: [],
    name: 'Missing, blank or non-string key is refused with 400',
    category: 'Validation',
    priority: 'Medium',
    pre: RDK,
    data: 'No key parameter; key=""; key="   "; key[]=<run-unique absent key> (an array — its value cannot exist, so a wrongly accepted request touches no real key).',
    steps: ['Send GET and DELETE with each value.'],
    validate:
      '400 {status:false} for every variant and no value in the body; for no key and key="" also the documented message and details. (Whether something was deleted cannot be seen with keys that cannot exist, so it is not checked.)',
    why: 'Bad input must never reach Redis (a blank or array key could hit the wrong key).',
    expected: `400 {status:false, message:"A non-blank string key is required", details:[{field:"key", message:"Must be a non-blank string"}]} for no key and blank key (${SEEN}); 400 for the whitespace and array variants (quick reference: "Missing, blank, or invalid key").`,
    db: API_ONLY,
    deps: ['M2FNQ-01'],
    status: 'NOT RUN',
    mode: 'API automation',
    evidence: `${DOC}; M2FNQ-02 (${SEEN}).`,
  },
  {
    id: 'M2FN-RDK-005',
    module: MODULE,
    apis: ['API-213'],
    fields: [],
    name: 'GET on a non-string key returns 422',
    category: 'Negative & edge case',
    priority: 'Low',
    pre: RDK,
    data: 'A non-string key (hash / list / set) named by Dev (M2FNQ-03, M2FN_REDIS_NON_STRING_KEY). Read only — never deleted.',
    steps: ['GET the key.'],
    validate: '422; the value is not returned.',
    why: 'Confirms GET only reads strings, as documented.',
    expected: '422 "key holds a non-string Redis value" (quick reference error table).',
    db: API_ONLY,
    deps: ['M2FNQ-01', 'M2FNQ-03'],
    status: 'BLOCKED',
    mode: 'API automation',
    evidence: DOC,
  },
  {
    id: 'M2FN-RDK-006',
    module: MODULE,
    apis: ['API-213', 'API-214'],
    fields: [],
    name: 'No admin token, an app user token, or no OTP verification is refused with 401',
    category: 'Authentication',
    priority: 'Critical',
    pre: `${RDK} ${ACC} The "no OTP" variant logs the admin out (which resets its OTP flag for all of its sessions), logs in again, calls, then verifies the OTP again — the m2fn-api project runs its one spec file in a single worker, in order, so no other suite test uses the admin meanwhile.`,
    data: 'A key that cannot exist (so a wrongly accepted DELETE changes nothing).',
    steps: [
      'GET and DELETE with no Authorization header.',
      'GET and DELETE with a synthetic app user’s JWT.',
      'Log the admin out, log in again (OTP not verified), GET and DELETE, then verify the OTP again.',
    ],
    validate:
      '401 for every variant; no value in the body. The no-OTP admin’s 401 carries Cache-Control: no-store (it passed the permission check and failed the OTP check).',
    why: 'This API can read and delete any Redis key, so authentication is the main control.',
    expected: `401 "Admin token, permissions, device, or OTP check failed" (quick reference error table); admin without OTP: 401 with Cache-Control no-store (${SEEN}).`,
    db: API_ONLY,
    deps: ['M2FNQ-01'],
    status: 'NOT RUN',
    mode: 'API automation',
    evidence: `${DOC}; M2FNQ-01 (${SEEN}).`,
  },
  {
    id: 'M2FN-RDK-007',
    module: MODULE,
    apis: ['API-213', 'API-214'],
    fields: [],
    name: 'An admin without the Redis permission (e.g. associate) is refused with 401',
    category: 'Access control',
    priority: 'High',
    pre: 'QA’s associate CMS login (email + password, webcms: true), without the Redis permission. The permission check runs before the OTP check (Admin::ApiController order, from code — confirm with Dev), so the associate’s OTP state does not matter.',
    data: 'A key that cannot exist.',
    steps: ['GET and DELETE with the associate admin’s token.'],
    validate:
      '401; no value returned, nothing deleted; Cache-Control is not no-store (the request stopped at the permission check, before the response headers are set).',
    why: 'Only admins with the registered Redis permission may use it (quick reference: Postman setup).',
    expected: `401 "permissions … check failed" (quick reference error table); empty body with Cache-Control no-cache (${SEEN}).`,
    db: API_ONLY,
    deps: ['M2FNQ-01'],
    status: 'NOT RUN',
    mode: 'API automation',
    evidence: `${DOC}; M2FNQ-01 (${SEEN}).`,
  },
  {
    id: 'M2FN-RDK-008',
    module: MODULE,
    apis: ['API-214', 'API-213'],
    fields: ['NAME'],
    name: 'A wildcard key is taken literally (no pattern delete)',
    category: 'Negative & edge case',
    priority: 'High',
    pre: `${RDK} ${OWN_ACC}`,
    data: 'The case’s own account’s PII key, filled by a first-name read; pattern key "pii:v1:user:<that user_id>:*" — so even a wrong expansion only touches this test user.',
    steps: [
      'Read the first name once (API-001) so the real key exists.',
      'DELETE the pattern key.',
      'GET the user’s real PII key.',
    ],
    validate: 'DELETE 200 deleted:false; the real key still returns 200.',
    why: 'A pattern delete on the shared staging Redis would wipe other users’ caches.',
    expected:
      'DELETE 200 {status:true, deleted:false}; the real key is untouched (quick reference: "Wildcards are literal; deletion does not expand patterns").',
    db: API_ONLY,
    deps: ['M2FNQ-01', 'M2FNQ-02'],
    status: 'NOT RUN',
    mode: 'API automation',
    evidence: DOC,
  },
  {
    id: 'M2FN-RDK-009',
    module: MODULE,
    apis: ['API-214', 'API-213', 'API-001', 'API-011'],
    fields: ['NAME'],
    name: 'Cleared caches are rebuilt on the next profile read (cache miss, then hit)',
    category: 'Integration & consistency',
    priority: 'Critical',
    pre: `${RDK} ${ACC} ${GATE_ON} An APPROVED synthetic profile: the app caches only pending / approved / disapproved / vip_disapproved profiles (from code, profile_state.rb:88) and a new profile is pending_not_verified (seen on staging 2026-11-09). Staging auto-approval is not running, so the suite approves its own account through POST /admin/approve_and_edit (M2FNQ-07 answer, QA lead 2026-11-11; RDK-009 changes confirmed). Read-only Aisle DB (aisleweb) access, limited to the suite’s own accounts.`,
    data: 'The synthetic account’s profile cache key AISLE_staging_profile_<ref> and PII key pii:v1:user:<user_id>:first_name (M2FNQ-02).',
    steps: [
      'DELETE both keys of the user.',
      'GET both keys (expect 404).',
      'Open the user’s profile through GET /V1/users/profile_info?ref=<own ref> (API-011, the route that fills the profile cache) and read the first name (API-001).',
      'GET both keys again.',
      'Read profiles.first_name of the user in the Aisle DB (read-only).',
    ],
    validate:
      'After the reads both keys exist again; the PII key holds the API-001 name; the profile cache JSON holds first_name equal to the API-011 name; with the read gate ON all of them equal the PII name, and the Aisle DB profiles.first_name holds the same name.',
    why: 'Core white-box check of the first-name caches: a miss fills them, later reads are served from them.',
    expected: `Both keys 404 after the delete, 200 after the reads (PII key refill ${SEEN}); the profile cache is filled by profile_info (Dev inventory API-011: "profile_details cache hydration"; code: Profile#fetch_profile_info → profile_details → fill_cache!, profile.rb — confirm with Dev). The own-profile route GET /V1/users/:ref does not fill it (seen on staging 2026-11-09).`,
    db: 'Aisle DB (aisleweb, read-only, suite account only): profiles.first_name equals the name (boolean query, m2-pii-firstname/config/db-queries.json).',
    dbCheck: true,
    deps: ['M2FNQ-01', 'M2FNQ-02', 'M2FNQ-07'],
    status: 'NOT RUN',
    mode: 'API automation',
    evidence: `${DOC}; M2FNQ-02 (${SEEN}); M2FNQ-07 answer; m2-pii-firstname/docs/firstname-inventory.xlsx (from code — confirm with Dev).`,
  },
  {
    id: 'M2FN-RDK-010',
    module: MODULE,
    apis: ['API-213', 'API-214'],
    fields: [],
    name: 'Redis unavailable returns 503 without details',
    category: 'Resilience',
    priority: 'Low',
    pre: 'Dev makes Redis unavailable for the service on a test environment for an agreed window (M2FNQ-04); QA sets M2FN_REDIS_OUTAGE_WINDOW=true for that run.',
    data: 'A key that cannot exist.',
    steps: ['GET and DELETE the key while Redis is down.'],
    validate:
      '503; no key value, stack trace or file path in the body. The exact 503 body is recorded until Dev confirms it (M2FNQ-04).',
    why: 'Failure must be clear to the tester and leak nothing.',
    expected: '503 "Redis operation unavailable" (quick reference error table).',
    db: API_ONLY,
    deps: ['M2FNQ-01', 'M2FNQ-04'],
    status: 'BLOCKED',
    mode: 'Dev-assisted',
    evidence: DOC,
  },
  {
    id: 'M2FN-RDK-011',
    module: MODULE,
    apis: ['API-213', 'API-214'],
    fields: ['NAME'],
    name: 'Any Redis key, including decrypted PII names, is readable by a permitted admin',
    category: 'PII exposure',
    priority: 'High',
    pre: `${RDK} ${ACC}`,
    data: 'The synthetic account’s PII first-name key, filled by a first-name read (API-001).',
    steps: ['GET the key with the permitted admin token.', 'Check the response headers.'],
    validate:
      'The plain synthetic first name is returned (documented: "returns the stored string unchanged"); Cache-Control: no-store is set (from code — confirm with Dev). Whether this scope is intended is recorded, not judged, until Dev answers M2FNQ-05.',
    why: 'The API gives any permitted admin every value in Redis (also other users’ decrypted names) and can delete any key; scope is a Dev decision.',
    expected:
      '200 with the plain name and Cache-Control no-store; to be confirmed: whether reads/deletes should be limited to test keys or staging only (M2FNQ-05).',
    db: API_ONLY,
    deps: ['M2FNQ-01', 'M2FNQ-02', 'M2FNQ-05'],
    status: 'NOT RUN',
    mode: 'API automation',
    evidence: `${DOC}; redis_keys_controller.rb (develop_new @ bd85044): show returns REDIS.get(params[:key]); set_header sets Cache-Control: no-store; audit logs only the key's SHA-256.`,
  },
];
