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
  'AISLE-AUTH-002': ['readPii'],
  'AISLE-AUTH-003': ['readPii'],
  'AISLE-AUTH-005': ['readPii'],
  'AISLE-TR-002': [T.r, T.c],
  'AISLE-TR-003': [T.p, T.r],
  'AISLE-TR-004': [T.r],
  'AISLE-FT-002': [K.r, K.c],
  'AISLE-FT-003': [K.v, K.r],
  'AISLE-SEC-001': ['writePii', 'readPii'],
  'AISLE-SEC-002': ['writePii'],
  'AISLE-SEC-003': ['writePii', 'readPii'],
  'AISLE-SEC-004': ['readPii'],
  'AISLE-DB-001': ['writePii'],
  'AISLE-DB-002': ['writePii'],
  'AISLE-DB-003': ['writePii'],
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
const ALL_FACADE = ['healthReady', ...ALL_AUTHENTICATED];
const TR = [T.c, T.r, T.p];
const FT = [K.c, K.r, K.v];

export const REQUIREMENTS: Requirement[] = [
  req(
    'FR-AUTH-01',
    'Authentication',
    'Every endpoint requires the Aisle token; a missing, wrong or malformed token gets 401 with no data',
    'Derived',
    OBS,
    ALL_FACADE,
    ['AISLE-AUTH-001', 'AISLE-AUTH-002', 'AISLE-AUTH-003', 'AISLE-AUTH-004'],
    'BQ-09',
  ),
  req(
    'FR-AUTH-02',
    'Authentication',
    'An expired token gets 401 (blocked)',
    'Policy',
    'BQ-11',
    ['readPii'],
    ['AISLE-AUTH-005'],
    'BQ-11',
  ),
  req(
    'FR-ISO-01',
    'Isolation',
    'The tenant is always set by Aisle; a tenant sent by the client never takes effect',
    'Policy',
    OBS,
    ['writePii', 'readPii'],
    ['AISLE-SEC-001'],
    'BQ-06',
  ),
  req(
    'FR-ISO-02',
    'Isolation',
    'One user’s data is protected from other users through the facade (blocked)',
    'Policy',
    'BQ-07',
    ['readPii'],
    ['AISLE-SEC-004'],
    'BQ-07',
  ),
  req(
    'FR-WR-01',
    'PII Save',
    'A new field is saved with 201, a repeat save replaces it with 200; the reply has tenant, user, field and key version',
    'Derived',
    OBS,
    ['writePii'],
    ['AISLE-WR-001', 'AISLE-WR-002', 'AISLE-CON-001', 'POC-001'],
  ),
  req(
    'FR-WR-02',
    'PII Save',
    'Invalid requests are refused (422 list of problems; broken JSON 400) and change nothing',
    'Derived',
    OBS,
    ['writePii'],
    ['AISLE-WR-003', 'AISLE-WR-004', 'AISLE-WR-007', 'AISLE-CON-002'],
    'BQ-09',
  ),
  req(
    'FR-WR-03',
    'PII Save',
    'Length limits: user ID 1–128 characters, value 1–1,024 characters',
    'Derived',
    OBS,
    ['writePii'],
    ['AISLE-WR-004', 'AISLE-WR-005', 'AISLE-WR-006'],
    'BQ-05',
  ),
  req(
    'FR-WR-04',
    'PII Save',
    'An unknown field name is refused (403) on save, read and bulk read',
    'Derived',
    OBS,
    ['writePii', 'readPii', 'batchReadPii'],
    ['AISLE-WR-008', 'AISLE-RD-005', 'AISLE-BR-006'],
    'BQ-12',
  ),
  req(
    'FR-RD-01',
    'PII Read',
    'Reading returns exactly the saved value for that user and field',
    'Derived',
    OBS,
    ['readPii'],
    ['AISLE-RD-001'],
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
    'The field list must not be empty and the user ID is required (422)',
    'Derived',
    OBS,
    ['readPii'],
    ['AISLE-RD-004'],
    'BQ-05',
  ),
  req(
    'FR-RD-04',
    'PII Read',
    'Fields the user has not saved are left out of the reply (blocked)',
    'Derived',
    'BQ-01',
    ['readPii'],
    ['AISLE-RD-002'],
    'BQ-01',
  ),
  req(
    'FR-BR-01',
    'Bulk read',
    'A bulk read returns every requested user × field',
    'Derived',
    OBS,
    ['batchReadPii'],
    ['AISLE-BR-001', 'AISLE-BR-004'],
    'BQ-19',
  ),
  req(
    'FR-BR-02',
    'Bulk read',
    'If any requested user has no value, the whole bulk read gets 404',
    'Derived',
    OBS,
    ['batchReadPii'],
    ['AISLE-BR-002'],
  ),
  req(
    'FR-BR-03',
    'Bulk read',
    'The user list must hold 1–200 IDs (422 outside)',
    'Derived',
    OBS,
    ['batchReadPii'],
    ['AISLE-BR-003'],
    'BQ-18',
  ),
  req(
    'FR-BR-04',
    'Bulk read',
    'A bulk read needs both the user list and the field list (422 when missing)',
    'Derived',
    'Inferred from save/read behaviour; to verify on staging',
    ['batchReadPii'],
    ['AISLE-BR-005'],
    'BQ-09',
  ),
  req(
    'FR-NRM-01',
    'Normalization',
    'Names are trimmed and runs of spaces collapsed; capitals are kept',
    'Derived',
    OBS,
    ['writePii', 'readPii'],
    ['AISLE-NRM-001', 'POC-002'],
  ),
  req(
    'FR-NRM-02',
    'Normalization',
    'Emails are trimmed and lower-cased (blocked)',
    'Derived',
    'BQ-01',
    ['writePii', 'readPii'],
    ['AISLE-WR-010'],
    'BQ-01',
  ),
  req(
    'FR-NRM-03',
    'Normalization',
    'Phones are stored as digits only and invalid phones are refused (blocked)',
    'Derived',
    'BQ-03',
    ['writePii', 'readPii'],
    ['AISLE-NRM-002', 'AISLE-NRM-003'],
    'BQ-03',
  ),
  req(
    'FR-EML-01',
    'Email flow',
    'An email can be saved and read back cleaned up, and an invalid email is refused (blocked)',
    'Derived',
    'BQ-01',
    ['writePii', 'readPii'],
    ['AISLE-WR-009', 'AISLE-WR-010'],
    'BQ-01',
  ),
  req(
    'FR-SR-01',
    'Search',
    'Email search finds users, returns values only when asked, marks cut-off results and handles no match (blocked)',
    'Derived',
    'BQ-01',
    ['searchPii'],
    ['AISLE-SR-001', 'AISLE-SR-002', 'AISLE-SR-003', 'AISLE-SR-005'],
    'BQ-01',
  ),
  req(
    'FR-SR-02',
    'Search',
    'The search limit must be 1–100 (422 outside), checked before access',
    'Derived',
    OBS,
    ['searchPii'],
    ['AISLE-SR-004'],
    'BQ-05',
  ),
  req(
    'FR-TR-01',
    'Temporary phone',
    'A temporary phone can be created, resolved and promoted once (blocked)',
    'Derived',
    'BQ-02',
    TR,
    ['AISLE-TR-*'],
    'BQ-02',
  ),
  req(
    'FR-FT-01',
    'Free-text keys',
    'A free-text key can be created, read and revoked; revoked keys are gone (blocked)',
    'Derived',
    'BQ-02',
    FT,
    ['AISLE-FT-*'],
    'BQ-02',
  ),
  req(
    'FR-SEC-01',
    'Security',
    'Error replies do not repeat the submitted personal value or internal details (known finding)',
    'Policy',
    'BQ-08',
    ['writePii'],
    ['AISLE-SEC-002'],
    'BQ-08',
  ),
  req(
    'FR-SEC-02',
    'Security',
    'Test logs and reports never contain the token or personal data',
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
    'FR-DB-01',
    'Storage',
    'Saved values are stored once per user and field and are not readable; encryption not yet proven (blocked)',
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
    'BQ-15',
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
