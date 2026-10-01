/**
 * Static catalog: what the suite is DESIGNED to test through the Aisle PII facade
 * (QA automation → Aisle PII facade → PII service → PII DB), derived from the integration guide, the Aisle
 * curl collection and the test suite (docs/requirements-traceability.md, docs/test-scenarios.md).
 *
 * This is knowledge about test DESIGN, never about results. Results always come from executed runs.
 * Test references are display IDs ("PII-WR-001") or prefix patterns ("PII-NRM-*").
 */
import type { AreaInfo, AreaKey, Requirement, Severity, TestRef } from './types';

export const AREAS: AreaInfo[] = [
  {
    key: 'health',
    label: 'Health',
    description: 'Service readiness endpoint',
    severity: 'low',
    security: false,
    db: false,
  },
  {
    key: 'contract',
    label: 'Contract',
    description: 'OpenAPI drift and exact response keys',
    severity: 'medium',
    security: false,
    db: false,
  },
  {
    key: 'write',
    label: 'PII Write',
    description: 'Create / replace (upsert) PII fields',
    severity: 'high',
    security: false,
    db: false,
  },
  {
    key: 'read',
    label: 'PII Read',
    description: 'Read selected fields for one user',
    severity: 'high',
    security: false,
    db: false,
  },
  {
    key: 'search',
    label: 'Search',
    description: 'Exact normalized search',
    severity: 'medium',
    security: false,
    db: false,
  },
  {
    key: 'batch',
    label: 'Batch Read',
    description: 'Users × fields set-based read',
    severity: 'medium',
    security: false,
    db: false,
  },
  {
    key: 'normalization',
    label: 'Normalization',
    description: 'Email, phone and name normalization',
    severity: 'medium',
    security: false,
    db: false,
  },
  {
    key: 'transient',
    label: 'Transient Phone',
    description: 'Create / resolve / promote temporary phone mappings',
    severity: 'high',
    security: false,
    db: false,
  },
  {
    key: 'freeText',
    label: 'Free-Text Keys',
    description: 'AES-256-GCM key create / read / revoke',
    severity: 'high',
    security: false,
    db: false,
  },
  {
    key: 'authentication',
    label: 'Authentication',
    description: 'Bearer token checks on the Aisle facade',
    severity: 'critical',
    security: true,
    db: false,
  },
  {
    key: 'authorization',
    label: 'Authorization',
    description: 'Per-field READ / WRITE / SEARCH / BULK_READ',
    severity: 'critical',
    security: true,
    db: false,
  },
  {
    key: 'tenantIsolation',
    label: 'Tenant Isolation',
    description: '(tenant, user) identity separation',
    severity: 'critical',
    security: true,
    db: false,
  },
  {
    key: 'responseSecurity',
    label: 'Response Security',
    description: 'Leak checks, body limits, dev helpers',
    severity: 'critical',
    security: true,
    db: false,
  },
  {
    key: 'database',
    label: 'Database',
    description: 'Read-only persistence & encryption-at-rest checks',
    severity: 'critical',
    security: true,
    db: true,
  },
  {
    key: 'poc',
    label: 'End-to-end POC',
    description: 'Write → DB → Read proof of concept',
    severity: 'critical',
    security: true,
    db: true,
  },
  {
    key: 'framework',
    label: 'Framework Self-tests',
    description: 'Client wire, redaction, config (no service)',
    severity: 'low',
    security: false,
    db: false,
  },
  {
    key: 'other',
    label: 'Other',
    description: 'Tests without a recognised ID prefix',
    severity: 'medium',
    security: false,
    db: false,
  },
];

/**
 * ID prefix → area. Live tests use `AISLE-<AREA>-NNN` (and `POC-NNN`); the `PII-*` prefixes remain only so the
 * synthetic demo dataset (reporting/fixtures) keeps working — `PII-AZ-*` / `PII-TI-*` exist only there.
 */
const PREFIX_TO_AREA: [RegExp, AreaKey][] = [
  [/^(?:PII|AISLE)-HLT-/, 'health'],
  [/^(?:PII|AISLE)-CON-/, 'contract'],
  [/^(?:PII|AISLE)-WR-/, 'write'],
  [/^(?:PII|AISLE)-RD-/, 'read'],
  [/^(?:PII|AISLE)-SR-/, 'search'],
  [/^(?:PII|AISLE)-BR-/, 'batch'],
  [/^(?:PII|AISLE)-NRM-/, 'normalization'],
  [/^(?:PII|AISLE)-TR-/, 'transient'],
  [/^(?:PII|AISLE)-FT-/, 'freeText'],
  [/^(?:PII|AISLE)-AUTH-/, 'authentication'],
  [/^PII-AZ-/, 'authorization'],
  [/^PII-TI-/, 'tenantIsolation'],
  [/^(?:PII|AISLE)-SEC-/, 'responseSecurity'],
  [/^(?:PII|AISLE)-DB-/, 'database'],
  [/^POC-/, 'poc'],
  [/^UT-/, 'framework'],
];

export function areaForId(id: string): AreaKey {
  return PREFIX_TO_AREA.find(([re]) => re.test(id))?.[1] ?? 'other';
}

export function areaInfo(key: AreaKey): AreaInfo {
  return AREAS.find((a) => a.key === key) ?? (AREAS[AREAS.length - 1] as AreaInfo);
}

export function severityFor(area: AreaKey): Severity {
  return areaInfo(area).severity;
}

// ---- Endpoint under test per test ID ----------------------------------------------------------------

const ALL_AUTHENTICATED = [
  'writePii',
  'readPii',
  'searchPii',
  'batchReadPii',
  'createTransientPhone',
  'resolveTransientPhone',
  'promoteTransientPhone',
  'createFreeTextKey',
  'readFreeTextKey',
  'revokeFreeTextKey',
];

const AREA_DEFAULT_ENDPOINTS: Partial<Record<AreaKey, string[]>> = {
  health: ['healthReady'],
  write: ['writePii'],
  read: ['readPii'],
  search: ['searchPii'],
  batch: ['batchReadPii'],
  normalization: ['writePii', 'readPii'],
  authentication: ['writePii'],
  poc: ['writePii', 'readPii'],
  transient: ['createTransientPhone'],
  freeText: ['createFreeTextKey'],
};

const T = { c: 'createTransientPhone', r: 'resolveTransientPhone', p: 'promoteTransientPhone' };
const K = { c: 'createFreeTextKey', r: 'readFreeTextKey', v: 'revokeFreeTextKey' };

const ENDPOINT_OVERRIDES: Record<string, string[]> = {
  // ---- Aisle facade tests (first endpoint = the one the test mainly checks) ----
  'POC-002': ['readPii', 'writePii'],
  'POC-003': ['writePii'],
  'AISLE-WR-002': ['writePii', 'readPii'],
  'AISLE-TR-002': [T.r, T.c],
  'AISLE-TR-003': [T.p, T.r],
  'AISLE-TR-004': [T.r],
  'AISLE-FT-002': [K.r, K.c],
  'AISLE-FT-003': [K.r, K.v],
  'AISLE-FT-004': [K.v],
  'AISLE-FT-006': [K.r, K.v],
  'AISLE-FT-007': [K.v],
  'AISLE-SEC-003': ['writePii', 'readPii'],
  'AISLE-DB-001': ['writePii'],
  'AISLE-DB-002': ['writePii'],
  'AISLE-DB-004': ['writePii'],
  'AISLE-DB-005': ['writePii'],
  // ---- Legacy direct-PII IDs: kept only for the demo report data (reporting/fixtures) ----
  'PII-CON-001': [],
  'PII-CON-002': [],
  'PII-CON-003': ['writePii', 'readPii', 'searchPii', 'batchReadPii'],
  'PII-CON-004': [T.c, T.r, T.p],
  'PII-CON-005': [K.c, K.r, K.v],
  'PII-TR-001': [T.c],
  'PII-TR-002': [T.r],
  'PII-TR-003': [T.r, T.p],
  'PII-TR-004': [T.r, T.p],
  'PII-TR-005': [T.r, T.p],
  'PII-TR-006': [T.p, T.r],
  'PII-TR-007': [T.p],
  'PII-TR-008': [T.c],
  'PII-TR-009': [T.c],
  'PII-TR-010': [T.c],
  'PII-TR-011': [T.c],
  'PII-TR-012': [T.r, T.p],
  'PII-FT-001': [K.c],
  'PII-FT-002': [K.r],
  'PII-FT-003': [K.v, K.r],
  'PII-FT-004': [K.v],
  'PII-FT-005': [K.r, K.v],
  'PII-FT-006': [K.r, K.v],
  'PII-FT-007': [K.r, K.c],
  'PII-FT-008': [K.c],
  'PII-FT-009': [K.c],
  'PII-FT-010': [K.c, K.r],
  'PII-AUTH-020': ALL_AUTHENTICATED,
  'PII-AZ-001': ['writePii'],
  'PII-AZ-002': ['readPii'],
  'PII-AZ-003': ['readPii'],
  'PII-AZ-004': ['readPii'],
  'PII-AZ-005': ['searchPii'],
  'PII-AZ-006': ['searchPii'],
  'PII-AZ-007': ['searchPii'],
  'PII-AZ-008': ['batchReadPii'],
  'PII-AZ-009': [T.c, T.p],
  'PII-AZ-010': [T.r],
  'PII-AZ-011': [K.c, K.r, K.v],
  'PII-AZ-012': ['readPii'],
  'PII-TI-001': ['writePii', 'readPii'],
  'PII-TI-002': ['readPii'],
  'PII-TI-003': ['searchPii'],
  'PII-TI-004': ['batchReadPii'],
  'PII-TI-005': ['writePii', 'readPii'],
  'PII-TI-006': ['readPii'],
  'PII-SEC-001': ['writePii'],
  'PII-SEC-002': ['writePii'],
  'PII-SEC-003': [],
  'PII-SEC-004': ['writePii', 'readPii', 'searchPii', T.c, T.r, K.c],
  'PII-DB-001': ['writePii'],
  'PII-DB-002': ['writePii'],
  'PII-DB-003': ['writePii'],
  'PII-DB-004': ['writePii'],
  'PII-DB-005': [T.c, T.p],
  'PII-DB-006': [K.c, K.v],
  'PII-DB-007': ['batchReadPii'],
};

export function endpointsForId(id: string, area: AreaKey): string[] {
  return ENDPOINT_OVERRIDES[id] ?? AREA_DEFAULT_ENDPOINTS[area] ?? [];
}

/** Which suite a test belongs to: Smoke (tagged @smoke — the quick, most important checks) or Regression. */
export type Suite = 'Smoke' | 'Regression';
export const suiteOf = (tags: readonly string[]): Suite =>
  tags.some((t) => t === '@smoke' || t === 'smoke') ? 'Smoke' : 'Regression';

/** Group key for tests that exercise several (3+) or no specific endpoints, e.g. "every endpoint rejects…". */
export const CROSS_ENDPOINT = 'crossEndpoint';

/** Display order of endpoint groups: the guide's endpoint order, then cross-endpoint. */
export const ENDPOINT_GROUP_ORDER = [
  'healthReady',
  'writePii',
  'readPii',
  'searchPii',
  'batchReadPii',
  'createTransientPhone',
  'resolveTransientPhone',
  'promoteTransientPhone',
  'createFreeTextKey',
  'readFreeTextKey',
  'revokeFreeTextKey',
  CROSS_ENDPOINT,
] as const;

/**
 * The endpoint a test belongs under: its first mapped endpoint (the one it mainly tests), or CROSS_ENDPOINT
 * when it spans 3+ endpoints or none. Used by the report and by docs/test-cases.xlsx so both group alike.
 */
export function primaryEndpoint(endpoints: readonly string[]): string {
  return endpoints.length === 0 || endpoints.length > 2 ? CROSS_ENDPOINT : (endpoints[0] as string);
}

/** Resolve a TestRef against a set of known IDs. */
export function matchesRef(id: string, ref: TestRef): boolean {
  return ref.endsWith('*') ? id.startsWith(ref.slice(0, -1)) : id === ref;
}

// ---- Requirements (machine-readable version of docs/requirements-traceability.md) --------------------

const req = (
  id: string,
  group: string,
  title: string,
  type: Requirement['type'],
  source: string,
  endpoints: string[],
  tests: TestRef[],
  openQuestion?: string,
): Requirement => ({
  id,
  group,
  title,
  type,
  source,
  endpoints,
  tests,
  ...(openQuestion ? { openQuestion } : {}),
});

/**
 * Requirements for the Aisle PII facade. Source of truth: behaviour OBSERVED on staging (2026-09-29) and the
 * backend questions in docs/backend-open-questions.md (BQ-xx). Type: Derived = observed behaviour we rely on ·
 * Policy = security expectation. "(blocked)" = every test for it is blocked today.
 */
const OBS = 'Staging, observed 2026-09-29';
const OBS2 = 'Staging, observed 2026-10-01';
const ALL_FACADE = ['healthReady', ...ALL_AUTHENTICATED];
const TR = [T.c, T.r, T.p];
const FT = [K.c, K.r, K.v];

export const REQUIREMENTS: Requirement[] = [
  req(
    'FR-AUTH-01',
    'Authentication',
    'Every endpoint requires the Aisle token; a missing, wrong or malformed token gets 401 with no data — out of scope: facade-only (no test)',
    'Policy',
    'Out of scope — facade-only (QA decision 2026-10-01)',
    ALL_FACADE,
    [],
  ),
  req(
    'FR-AUTH-02',
    'Authentication',
    'An expired token gets 401 — out of scope: facade-only, the test token is QA-only and the facade is temporary (no test)',
    'Policy',
    'Out of scope — facade-only (QA decision 2026-10-01)',
    ['readPii'],
    [],
  ),
  req(
    'FR-ISO-01',
    'Isolation',
    'The tenant is always set by Aisle; a tenant sent by the client never takes effect — out of scope: facade-only (no test)',
    'Policy',
    'Out of scope — facade-only (QA decision 2026-10-01)',
    ['writePii', 'readPii'],
    [],
  ),
  req(
    'FR-ISO-02',
    'Isolation',
    'The QA token’s reach over other users’ data — out of scope: facade-only, about the QA token (no test)',
    'Policy',
    'Out of scope — facade-only (QA decision 2026-10-01)',
    ['readPii'],
    [],
  ),
  req(
    'FR-ISO-03',
    'Isolation',
    'A user ID is matched exactly (after trimming spaces): an ID in capitals or with one extra letter is a different user',
    'Derived',
    OBS2,
    ['writePii', 'readPii'],
    ['AISLE-WR-012'],
    'BQ-34',
  ),
  req(
    'FR-WR-01',
    'PII Save',
    'A new field is saved with 201, a repeat save replaces it with 200; the reply has tenant, user, field and key version',
    'Derived',
    OBS,
    ['writePii'],
    ['AISLE-WR-001', 'AISLE-WR-002', 'AISLE-WR-020', 'AISLE-WR-027', 'AISLE-CON-001', 'POC-001'],
    'BQ-29',
  ),
  req(
    'FR-WR-02',
    'PII Save',
    'Invalid requests are refused (422 list of problems), never with a server error, and change nothing',
    'Derived',
    OBS,
    ['writePii'],
    ['AISLE-WR-003', 'AISLE-WR-004', 'AISLE-WR-011', 'AISLE-WR-017', 'AISLE-CON-002'],
  ),
  req(
    'FR-WR-03',
    'PII Save',
    'Length limits: user ID 1–128 characters, value 1–1,024 characters (counted in characters, not bytes)',
    'Derived',
    OBS,
    ['writePii'],
    ['AISLE-WR-004', 'AISLE-WR-005', 'AISLE-WR-006', 'AISLE-WR-015', 'AISLE-WR-016'],
  ),
  req(
    'FR-WR-04',
    'PII Save',
    'An unknown field name is refused (403) on save, read and bulk read, also when mixed with known fields',
    'Derived',
    OBS,
    ['writePii', 'readPii', 'batchReadPii'],
    ['AISLE-WR-008', 'AISLE-RD-005', 'AISLE-RD-007', 'AISLE-BR-006', 'AISLE-BR-007'],
  ),
  req(
    'FR-WR-05',
    'PII Save',
    'Text is stored exactly as sent: any alphabet or emoji, and attack-looking text is never run as code; field names are not case-sensitive',
    'Derived',
    OBS2,
    ['writePii', 'readPii'],
    ['AISLE-WR-013', 'AISLE-WR-014', 'AISLE-WR-018'],
    'BQ-35',
  ),
  req(
    'FR-WR-06',
    'PII Save',
    'Saves sent at the same moment all succeed and leave one consistent value per user and field',
    'Derived',
    OBS2,
    ['writePii'],
    ['AISLE-WR-021', 'AISLE-WR-029'],
  ),
  req(
    'FR-RD-01',
    'PII Read',
    'Reading returns exactly the saved value for that user and field, for every requested field',
    'Derived',
    OBS,
    ['readPii'],
    ['AISLE-RD-001', 'AISLE-RD-006'],
  ),
  req(
    'FR-RD-02',
    'PII Read',
    'A user with no saved value gets 404 PII_NOT_FOUND',
    'Derived',
    OBS,
    ['readPii'],
    ['AISLE-RD-003'],
  ),
  req(
    'FR-RD-03',
    'PII Read',
    'The field list must not be empty, and the user ID and field names must be real text (422 / 403)',
    'Derived',
    OBS,
    ['readPii'],
    ['AISLE-RD-004', 'AISLE-RD-009'],
    'BQ-38',
  ),
  req(
    'FR-RD-04',
    'PII Read',
    'Fields the user has not saved are left out of the reply',
    'Derived',
    OBS2,
    ['readPii'],
    ['AISLE-RD-002'],
  ),
  req(
    'FR-RD-05',
    'PII Read',
    'A field name asked for twice is returned twice (no de-duplication) on read and bulk read',
    'Derived',
    OBS2,
    ['readPii', 'batchReadPii'],
    ['AISLE-RD-008', 'AISLE-BR-008'],
  ),
  req(
    'FR-BR-01',
    'Bulk read',
    'A bulk read returns every requested user × field, in the requested user order',
    'Derived',
    OBS,
    ['batchReadPii'],
    ['AISLE-BR-001', 'AISLE-BR-004', 'AISLE-BR-010', 'AISLE-BR-012'],
  ),
  req(
    'FR-BR-02',
    'Bulk read',
    'If any requested user has none of the fields, the whole bulk read gets 404; fields a user lacks are left out',
    'Derived',
    OBS,
    ['batchReadPii'],
    ['AISLE-BR-002', 'AISLE-BR-011'],
    'BQ-42',
  ),
  req(
    'FR-BR-03',
    'Bulk read',
    'The user list must hold 1–200 real IDs and the field list at least one real field (422 outside)',
    'Derived',
    OBS,
    ['batchReadPii'],
    ['AISLE-BR-003', 'AISLE-BR-009', 'AISLE-BR-013'],
    'BQ-18',
  ),
  req(
    'FR-BR-04',
    'Bulk read',
    'A bulk read needs both the user list and the field list (422 when missing) — out of scope: facade-only, the facade rebuilds the body (no test)',
    'Derived',
    'Out of scope — facade-only (QA decision 2026-10-01)',
    ['batchReadPii'],
    [],
  ),
  req(
    'FR-NRM-01',
    'Normalization',
    'Names are trimmed and runs of spaces collapsed (tabs and line breaks become spaces); capitals are kept',
    'Derived',
    OBS,
    ['writePii', 'readPii'],
    ['AISLE-NRM-001', 'AISLE-NRM-004', 'AISLE-NRM-005', 'POC-002'],
    'BQ-36',
  ),
  req(
    'FR-NRM-02',
    'Normalization',
    'Emails are trimmed and lower-cased',
    'Derived',
    OBS2,
    ['writePii', 'readPii'],
    ['AISLE-WR-010'],
  ),
  req(
    'FR-NRM-03',
    'Normalization',
    'Phones are stored as digits only, invalid phones are refused, and a phone can be replaced next to other fields',
    'Derived',
    OBS2,
    ['writePii', 'readPii'],
    ['AISLE-NRM-002', 'AISLE-NRM-003', 'AISLE-WR-028'],
  ),
  req(
    'FR-EML-01',
    'Email flow',
    'An email can be saved, replaced and read back cleaned up; badly formed or over-long emails are refused',
    'Derived',
    OBS2,
    ['writePii', 'readPii'],
    [
      'AISLE-WR-009',
      'AISLE-WR-010',
      'AISLE-WR-022',
      'AISLE-WR-023',
      'AISLE-WR-024',
      'AISLE-WR-025',
      'AISLE-WR-026',
    ],
    'BQ-37',
  ),
  req(
    'FR-SR-01',
    'Search',
    'Email search finds users, returns values only when asked, marks cut-off results and handles no match (200, count 0)',
    'Derived',
    OBS2,
    ['searchPii'],
    [
      'AISLE-SR-001',
      'AISLE-SR-002',
      'AISLE-SR-003',
      'AISLE-SR-005',
      'AISLE-SR-008',
      'AISLE-SR-010',
      'AISLE-SR-016',
    ],
    'BQ-41',
  ),
  req(
    'FR-SR-02',
    'Search',
    'Search settings are checked: limit 1–100 (422 outside), wrong types handled predictably, empty or non-email values refused',
    'Derived',
    OBS,
    ['searchPii'],
    ['AISLE-SR-004', 'AISLE-SR-011', 'AISLE-SR-013', 'AISLE-SR-014'],
    'BQ-40',
  ),
  req(
    'FR-SR-03',
    'Search',
    'Search only finds exact matches in the EMAIL field: wildcards, partial values and other fields never find a user',
    'Derived',
    OBS2,
    ['searchPii'],
    ['AISLE-SR-006', 'AISLE-SR-007', 'AISLE-SR-009'],
  ),
  req(
    'FR-SR-04',
    'Search',
    'Search on fields other than EMAIL (NAME, PHONE, unknown) behaves predictably',
    'Derived',
    OBS2,
    ['searchPii'],
    ['AISLE-SR-015'],
    'BQ-32',
  ),
  req(
    'FR-TR-01',
    'Temporary phone',
    'A temporary phone can be created, resolved and promoted once (also onto a user who has a phone), has a lifetime of 300 s–7 days, expires on time (blocked) and refuses bad input',
    'Derived',
    OBS2,
    TR,
    ['AISLE-TR-*'],
    'BQ-28',
  ),
  req(
    'FR-FT-01',
    'Free-text keys',
    'A free-text key can be created, read and revoked; every key is unique; revoked or unknown keys are gone; bad key IDs are refused',
    'Derived',
    OBS2,
    FT,
    ['AISLE-FT-*'],
    'BQ-33',
  ),
  req(
    'FR-CON-01',
    'Contract',
    'The data part of EMAIL, search and free-text-key replies has exactly the agreed fields',
    'Derived',
    OBS2,
    ['writePii', 'readPii', 'batchReadPii', 'searchPii', ...FT],
    ['AISLE-CON-003'],
  ),
  req(
    'FR-SEC-01',
    'Security',
    'Error replies do not repeat the submitted personal value or internal details (known finding BQ-08, low priority, no active test)',
    'Policy',
    'BQ-08',
    ['writePii'],
    [],
    'BQ-08',
  ),
  req(
    'FR-SEC-02',
    'Security',
    'Test logs and reports never contain the Aisle token (shown as $AISLE_TEST_TOKEN); the call log holds no personal data; reports show fake test data by design',
    'Policy',
    'QA security rules',
    ['writePii', 'readPii'],
    ['AISLE-SEC-003', 'UT-RED-*'],
  ),
  req(
    'FR-SEC-03',
    'Security',
    'Error replies reveal no internal service details (stack traces, internal hosts, server or database names)',
    'Policy',
    'BQ-29',
    ['writePii', 'readPii'],
    ['AISLE-SEC-005'],
    'BQ-29',
  ),
  req(
    'FR-SEC-04',
    'Security',
    'Replies with personal data tell browsers and proxies not to keep a copy (no-store) (blocked)',
    'Policy',
    'BQ-39',
    ['readPii', 'batchReadPii', 'searchPii'],
    ['AISLE-SEC-006'],
    'BQ-39',
  ),
  req(
    'FR-DB-01',
    'Storage',
    'Saved values are stored once per user and field and are not readable; refused saves leave nothing; encryption not yet proven (blocked)',
    'Policy',
    'BQ-04',
    ['writePii'],
    ['AISLE-DB-*', 'POC-003'],
    'BQ-04',
  ),
  req(
    'FR-HLT-01',
    'Health',
    'The health check with the token reports the service ready',
    'Derived',
    OBS,
    ['healthReady'],
    ['AISLE-HLT-001'],
  ),
];

export const ENDPOINT_DESCRIPTIONS: Record<string, string> = {
  healthReady: 'Readiness check (requires the Aisle token)',
  writePii: 'Create or replace one PII field',
  readPii: 'Read selected PII fields for one user',
  searchPii: 'Exact normalized search on a searchable field',
  batchReadPii: 'Read fields for multiple users in one set-based query',
  createTransientPhone: 'Create a temporary encrypted phone mapping',
  resolveTransientPhone: 'Resolve an owned, unexpired mapping',
  promoteTransientPhone: 'Store a transient phone as permanent user PII',
  createFreeTextKey: 'Create a caller-owned free-text encryption key',
  readFreeTextKey: 'Retrieve an active caller-owned key',
  revokeFreeTextKey: 'Revoke a caller-owned key',
};
