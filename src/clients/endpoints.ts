/**
 * ENDPOINT INVENTORY — the single source of truth for every endpoint the framework knows about.
 *
 * Source: "PII Service API Integration Guide", section "Endpoint summary".
 * The guide lists 11 endpoints: 1 unauthenticated readiness check + 10 signed /api/v1/* endpoints.
 * (See docs/endpoint-inventory.md for the "10 endpoints" scope discussion.)
 *
 * Which endpoints are exercised in a run is configurable via PII_ENDPOINTS_IN_SCOPE (see config.ts).
 * Nothing here is invented: method, path, auth requirement and permission come from the guide.
 */

export type HttpMethod = 'GET' | 'POST';

/** Permission names from the guide ("Field authorization"). */
export type Permission = 'READ' | 'WRITE' | 'SEARCH' | 'BULK_READ';

export interface EndpointDefinition {
  /** Stable key used in code, config and docs. */
  readonly key: EndpointKey;
  readonly method: HttpMethod;
  /** Path template. `{field}` is the only documented path parameter. */
  readonly path: string;
  /** Whether the Ed25519 signature headers are required (all /api/v1/* endpoints). */
  readonly authenticated: boolean;
  /** Documented permission requirement, human readable (used in docs/traceability). */
  readonly permission: string;
  /** Documented success status code(s). */
  readonly successStatus: readonly number[];
  /**
   * Safe to retry automatically on HTTP 503?
   * Only read-only operations. Writes/creates/promote/revoke are NOT retried because the guide does not
   * document idempotency, and a retry could turn an expected 201 into 200 or consume a transient mapping.
   */
  readonly retrySafe: boolean;
  /** The response must carry `Cache-Control: no-store` (documented). */
  readonly noStore: boolean;
}

export const ENDPOINTS = {
  healthReady: {
    key: 'healthReady',
    method: 'GET',
    path: '/health/ready',
    authenticated: false,
    permission: 'none (no authentication)',
    successStatus: [200],
    retrySafe: true,
    noStore: false,
  },
  writePii: {
    key: 'writePii',
    method: 'POST',
    path: '/api/v1/pii',
    authenticated: true,
    permission: 'WRITE on {field}',
    successStatus: [201, 200],
    retrySafe: false,
    noStore: false,
  },
  readPii: {
    key: 'readPii',
    method: 'POST',
    path: '/api/v1/pii/read',
    authenticated: true,
    permission: 'READ on every requested field',
    successStatus: [200],
    retrySafe: true,
    noStore: false,
  },
  searchPii: {
    key: 'searchPii',
    method: 'POST',
    path: '/api/v1/pii/{field}/search',
    authenticated: true,
    permission: 'SEARCH on {field}; + READ on {field} when include_values=true',
    successStatus: [200],
    retrySafe: true,
    noStore: false,
  },
  batchReadPii: {
    key: 'batchReadPii',
    method: 'POST',
    path: '/api/v1/pii/batch/read',
    authenticated: true,
    permission: 'BULK_READ on every requested field',
    successStatus: [200],
    retrySafe: true,
    noStore: false,
  },
  createTransientPhone: {
    key: 'createTransientPhone',
    method: 'POST',
    path: '/api/v1/transient/phones',
    authenticated: true,
    permission: 'WRITE on PHONE',
    successStatus: [201],
    retrySafe: false,
    noStore: false,
  },
  resolveTransientPhone: {
    key: 'resolveTransientPhone',
    method: 'POST',
    path: '/api/v1/transient/phones/resolve',
    authenticated: true,
    permission: 'READ on PHONE',
    successStatus: [200],
    retrySafe: true,
    noStore: true,
  },
  promoteTransientPhone: {
    key: 'promoteTransientPhone',
    method: 'POST',
    path: '/api/v1/transient/phones/promote',
    authenticated: true,
    permission: 'WRITE on PHONE',
    successStatus: [200],
    retrySafe: false,
    noStore: false,
  },
  createFreeTextKey: {
    key: 'createFreeTextKey',
    method: 'POST',
    path: '/api/v1/free-text/keys',
    authenticated: true,
    permission: 'WRITE on FREE_TEXT capability',
    successStatus: [201],
    retrySafe: false,
    noStore: true,
  },
  readFreeTextKey: {
    key: 'readFreeTextKey',
    method: 'POST',
    path: '/api/v1/free-text/keys/read',
    authenticated: true,
    permission: 'READ on FREE_TEXT capability',
    successStatus: [200],
    retrySafe: true,
    noStore: true,
  },
  revokeFreeTextKey: {
    key: 'revokeFreeTextKey',
    method: 'POST',
    path: '/api/v1/free-text/keys/revoke',
    authenticated: true,
    permission: 'WRITE on FREE_TEXT capability',
    successStatus: [200],
    retrySafe: false,
    noStore: false,
  },
} as const satisfies Record<string, Omit<EndpointDefinition, 'key'> & { key: string }>;

export type EndpointKey = keyof typeof ENDPOINTS;

export const ENDPOINT_KEYS = Object.keys(ENDPOINTS) as EndpointKey[];

/**
 * Public, unauthenticated documentation endpoints (guide: "Public documentation endpoints").
 * They are not part of the functional inventory, but the contract/security suites use them.
 */
export const DOC_ENDPOINTS = {
  openApi: { method: 'GET', path: '/openapi.json' },
  swaggerUi: { method: 'GET', path: '/docs' },
  redoc: { method: 'GET', path: '/redoc' },
  /** Development-only signing helper — must not be exposed outside development. */
  signatureHelper: { method: 'POST', path: '/docs/signature' },
} as const;

/** Builds a concrete path from a template, URL-encoding path parameters. */
export function buildPath(template: string, params: Record<string, string> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(`Missing path parameter "${name}" for endpoint template ${template}`);
    }
    return encodeURIComponent(value);
  });
}
