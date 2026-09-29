/**
 * ENDPOINT INVENTORY — the single source of truth for every endpoint the framework calls.
 *
 * Architecture:  QA automation → Aisle PII facade → PII service → PII DB
 *
 * QA calls ONLY the Aisle PII facade (base URL e.g. https://testa2.aisle.co/V1). Every facade endpoint —
 * including health — is protected by the Aisle test token (`Authorization: Bearer …`). Aisle sets the tenant
 * and signs the request to the PII service internally; none of that is visible to or controlled by QA.
 *
 * Source: the Aisle "PII Test API Curl Collection" plus behaviour observed on staging (2026-09-29).
 * `successStatus` lists only statuses actually observed or shown in the collection.
 */

export type HttpMethod = 'GET' | 'POST';

/** Common prefix of every Aisle PII facade endpoint. */
export const FACADE_PREFIX = '/api/v1/pii-test';

export interface EndpointDefinition {
  /** Stable key used in code, config, reports and the Excel sheet. */
  readonly key: EndpointKey;
  readonly method: HttpMethod;
  /** Path template relative to the Aisle base URL. `{field}` is the only path parameter. */
  readonly path: string;
  /** Needs the Aisle Bearer token (true for every facade endpoint). */
  readonly authenticated: boolean;
  /** Success status code(s) observed on staging or shown in the curl collection. */
  readonly successStatus: readonly number[];
  /**
   * Safe to retry automatically on HTTP 503? Only read-only operations. Writes/creates/promote/revoke are
   * never retried: a retry could turn a 201 into a 200 or consume a temporary phone twice.
   */
  readonly retrySafe: boolean;
}

export const ENDPOINTS = {
  healthReady: {
    key: 'healthReady',
    method: 'GET',
    path: `${FACADE_PREFIX}/health/ready`,
    authenticated: true,
    successStatus: [200],
    retrySafe: true,
  },
  writePii: {
    key: 'writePii',
    method: 'POST',
    path: FACADE_PREFIX,
    authenticated: true,
    successStatus: [201, 200],
    retrySafe: false,
  },
  readPii: {
    key: 'readPii',
    method: 'POST',
    path: `${FACADE_PREFIX}/read`,
    authenticated: true,
    successStatus: [200],
    retrySafe: true,
  },
  searchPii: {
    key: 'searchPii',
    method: 'POST',
    path: `${FACADE_PREFIX}/{field}/search`,
    authenticated: true,
    successStatus: [200],
    retrySafe: true,
  },
  batchReadPii: {
    key: 'batchReadPii',
    method: 'POST',
    path: `${FACADE_PREFIX}/batch/read`,
    authenticated: true,
    successStatus: [200],
    retrySafe: true,
  },
  createTransientPhone: {
    key: 'createTransientPhone',
    method: 'POST',
    path: `${FACADE_PREFIX}/transient/phones`,
    authenticated: true,
    successStatus: [201],
    retrySafe: false,
  },
  resolveTransientPhone: {
    key: 'resolveTransientPhone',
    method: 'POST',
    path: `${FACADE_PREFIX}/transient/phones/resolve`,
    authenticated: true,
    successStatus: [200],
    retrySafe: true,
  },
  promoteTransientPhone: {
    key: 'promoteTransientPhone',
    method: 'POST',
    path: `${FACADE_PREFIX}/transient/phones/promote`,
    authenticated: true,
    successStatus: [200],
    retrySafe: false,
  },
  createFreeTextKey: {
    key: 'createFreeTextKey',
    method: 'POST',
    path: `${FACADE_PREFIX}/free-text/keys`,
    authenticated: true,
    successStatus: [201],
    retrySafe: false,
  },
  readFreeTextKey: {
    key: 'readFreeTextKey',
    method: 'POST',
    path: `${FACADE_PREFIX}/free-text/keys/read`,
    authenticated: true,
    successStatus: [200],
    retrySafe: true,
  },
  revokeFreeTextKey: {
    key: 'revokeFreeTextKey',
    method: 'POST',
    path: `${FACADE_PREFIX}/free-text/keys/revoke`,
    authenticated: true,
    successStatus: [200],
    retrySafe: false,
  },
} as const satisfies Record<string, Omit<EndpointDefinition, 'key'> & { key: string }>;

export type EndpointKey = keyof typeof ENDPOINTS;

export const ENDPOINT_KEYS = Object.keys(ENDPOINTS) as EndpointKey[];

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
