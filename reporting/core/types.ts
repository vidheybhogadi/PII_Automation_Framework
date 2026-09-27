/**
 * PII Sentinel — report data model.
 *
 * Two layers, deliberately decoupled from Playwright internals:
 *   CollectedRun  — written by the Playwright collector reporter after every run (reports/latest/run-data.json)
 *   ReportData    — CollectedRun enriched with the static catalog, config and history by the generator;
 *                   the ONLY input the dashboard consumes (qa-report/data/report-data.js).
 *
 * This file is browser-safe (no Node imports) — shared by the generator and the dashboard bundle.
 */

export const SCHEMA_VERSION = 1 as const;

/** Unified status model. Colour is never the only signal: every status also has an icon + label. */
export type TestStatus = 'PASS' | 'FAIL' | 'SKIPPED' | 'BLOCKED' | 'FIXME' | 'UNKNOWN';
export const TEST_STATUSES: readonly TestStatus[] = [
  'PASS',
  'FAIL',
  'SKIPPED',
  'BLOCKED',
  'FIXME',
  'UNKNOWN',
];

/** REAL = produced by an actual test execution. DEMO = synthetic fixture for UI development only. */
export type DataSource = 'REAL' | 'DEMO';

export interface ApiCallRecord {
  /** Endpoint key from the inventory (e.g. writePii) or the raw path for documentation endpoints. */
  endpoint: string;
  method: string;
  path: string;
  /** HTTP status, or null when no response was received (transport failure). */
  status: number | null;
  errorCode?: string;
  durationMs: number;
  /** Correlation ID (random UUID, not sensitive) — lets backend find the server-side log line. */
  requestId?: string;
  /** Caller role label (primary/secondary/limited) or caller ID — never key material. */
  caller?: string;
  transportError?: string;
  /**
   * Why the call was made: `test` = the behaviour under test; `setup` = seeding data; `verify` = a follow-up
   * check (e.g. "nothing was persisted"); `preflight` = the per-worker readiness check. Absent in older data (= test).
   */
  phase?: CallPhase;
}

export type CallPhase = 'test' | 'setup' | 'verify' | 'preflight';

export interface TestStep {
  title: string;
  durationMs: number;
  failed: boolean;
}

export interface TestError {
  message: string;
  location?: string;
}

export interface Annotation {
  type: string;
  description?: string;
}

export interface CollectedTest {
  /** Stable unique key (project + file + title path). Used for history matching. */
  key: string;
  /** Display ID parsed from the title, e.g. "PII-WR-001" or "UT-SIG-003". */
  id: string;
  title: string;
  suite: string;
  file: string;
  line: number;
  project: string;
  tags: string[];
  status: TestStatus;
  /** Raw Playwright status: passed | failed | timedOut | skipped | interrupted. */
  rawStatus: string;
  outcome: 'expected' | 'unexpected' | 'flaky' | 'skipped';
  durationMs: number;
  startedAt: string | null;
  workerIndex: number;
  parallelIndex: number;
  retries: number;
  annotations: Annotation[];
  errors: TestError[];
  steps: TestStep[];
  apiCalls: ApiCallRecord[];
  cleanup?: { performed: number; failed: number; leftBehind: number };
}

export interface RunInfo {
  runId: string;
  label: string;
  environment: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  playwrightStatus: string;
  workers: number;
  projects: string[];
  retries: number;
  timeoutMs: number;
  command: string;
  /**
   * Run profile — which projects and filters produced this run (e.g. "projects=api · grep=@smoke").
   * Trends and comparisons only compare runs with the same profile. Absent in older data.
   */
  profile?: string;
  git: { commit: string | null; branch: string | null };
  ci: { provider: string; runNumber: string | null; runUrl: string | null; build: string | null } | null;
}

export interface EnvironmentInfo {
  node: string;
  os: string;
  arch: string;
  playwright: string;
  framework: string;
  frameworkVersion: string;
  /** Masked unless REPORT_SHOW_SERVICE_URL=true. */
  serviceUrl: string | null;
  runtime: string;
  timezone: string;
}

export interface CollectedRun {
  schemaVersion: typeof SCHEMA_VERSION;
  dataSource: DataSource;
  run: RunInfo;
  environment: EnvironmentInfo;
  tests: CollectedTest[];
  diagnostics: string[];
}

// ---- Catalog (static knowledge about the suite, from the integration guide) ----------------------

export type AreaKey =
  | 'health'
  | 'contract'
  | 'write'
  | 'read'
  | 'search'
  | 'batch'
  | 'normalization'
  | 'transient'
  | 'freeText'
  | 'authentication'
  | 'authorization'
  | 'tenantIsolation'
  | 'responseSecurity'
  | 'database'
  | 'poc'
  | 'framework'
  | 'other';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface AreaInfo {
  key: AreaKey;
  label: string;
  description: string;
  severity: Severity;
  security: boolean;
  db: boolean;
}

export interface EndpointInfo {
  key: string;
  method: string;
  path: string;
  description: string;
  authenticated: boolean;
  permission: string;
  noStore: boolean;
}

/** A reference to tests: exact IDs ("PII-WR-001") or prefix patterns ending in "*" ("PII-NRM-*"). */
export type TestRef = string;

export interface Requirement {
  id: string;
  title: string;
  group: string;
  type: 'Documented' | 'Derived' | 'Policy';
  source: string;
  endpoints: string[];
  tests: TestRef[];
  openQuestion?: string;
}

// ---- Configuration ------------------------------------------------------------------------------

export interface GateRule {
  key: string;
  label: string;
  areas: AreaKey[];
  critical: boolean;
  /** Blocked/fixme/skipped tests in the gate produce a WARNING (not PASS). */
  warnOnNotExecuted: boolean;
}

export interface HealthConfig {
  weights: { passRate: number; criticalPassRate: number; completion: number; endpointCoverage: number };
  /** Upper bound applied when any critical-severity test failed. */
  capOnCriticalFailure: number;
  bands: { label: string; min: number }[];
}

export interface ReportConfig {
  gates: GateRule[];
  health: HealthConfig;
  historyLimit: number;
}

// ---- History ------------------------------------------------------------------------------------

export interface Counts {
  total: number;
  PASS: number;
  FAIL: number;
  SKIPPED: number;
  BLOCKED: number;
  FIXME: number;
  UNKNOWN: number;
}

export interface HistoryEntry {
  runId: string;
  label: string;
  startedAt: string;
  durationMs: number;
  environment: string;
  dataSource: DataSource;
  /** Run profile (see RunInfo.profile). */
  profile?: string;
  /** Counts and pass rate over the run's SCOPE: service (integration) tests when present, otherwise all tests. */
  counts: Counts;
  passRate: number | null;
  scope?: 'service' | 'all';
  /** Records created by tests that could not be removed (no delete API). */
  dataLeftBehind?: number;
  latency: { avg: number; p50: number; p95: number } | null;
  endpointPassRate: Record<string, number | null>;
  /** Per-test compact result keyed by CollectedTest.key. */
  tests: Record<string, { id: string; s: TestStatus; d: number; r: number }>;
}

// ---- Final report --------------------------------------------------------------------------------

/** Plain-English description of a test (from tests/catalog), shown in the report and the Excel sheet. */
export interface TestDescription {
  what: string;
  why: string;
  steps: string[];
  expected: string;
  type: 'Positive' | 'Negative' | 'Security' | 'Database' | 'Contract';
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  preconditions?: string;
}

export interface ReportTest extends CollectedTest {
  area: AreaKey;
  endpoints: string[];
  severity: Severity;
  kind: 'integration' | 'unit';
  milestone: string;
  /** What the test does and why — absent only when no description has been written yet. */
  info?: TestDescription;
  /** True for tests that exist in the suite but were not part of this run (shown as "Not Tested"). */
  notRun?: boolean;
}

export interface ReportData {
  schemaVersion: typeof SCHEMA_VERSION;
  meta: {
    product: string;
    subtitle: string;
    reportVersion: string;
    generatedAt: string;
    dataSource: DataSource;
    pdfFile: string | null;
    /** The styled test-case workbook next to the report (same design as docs/test-cases.xlsx), if built. */
    excelFile?: string | null;
  };
  run: RunInfo;
  environment: EnvironmentInfo;
  tests: ReportTest[];
  endpoints: EndpointInfo[];
  config: ReportConfig;
  history: HistoryEntry[];
  diagnostics: string[];
}
