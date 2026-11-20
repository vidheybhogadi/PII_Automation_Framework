/**
 * Response assertions.
 *
 * All failure messages are built from SAFE facts only: method, path, status, request ID, error code, and
 * Zod issue paths. They never include response bodies or values, because Playwright copies assertion
 * messages into the HTML report.
 */
import { expect } from '@playwright/test';
import type { z } from 'zod';
import type { ApiResponse } from '../clients/api-response';
import {
  errorEnvelopeSchema,
  requestValidationSchema,
  successEnvelope,
  type ErrorEnvelope,
} from '../models/common.models';
import { scrubText } from '../../../core/utils/redaction';

/** Turn Zod issues into "path: code" lines WITHOUT the received values. */
export function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.length ? issue.path.join('.') : '(root)'}: ${issue.code}`)
    .join('\n');
}

function describe(res: ApiResponse): string {
  const body = res.json() as { error?: { message?: unknown } } | undefined;
  const serverMessage =
    typeof body?.error?.message === 'string' ? ` message="${scrubText(body.error.message)}"` : '';
  return `${res.summary()}${serverMessage}`;
}

/**
 * Cross-cutting rule for every negative / invalid-input test: the facade must answer a bad request itself
 * (4xx) and never crash (5xx — e.g. 500, 502, 522). Checked first, so a server error is reported as such.
 */
export function expectNoServerError(res: ApiResponse, context = ''): void {
  expect(
    res.status < 500,
    `${context ? `${context}: ` : ''}server error (5xx) instead of a clean refusal: ${res.summary()}`,
  ).toBe(true);
}

export function expectStatus(res: ApiResponse, expected: number | readonly number[], context = ''): void {
  const allowed = Array.isArray(expected) ? expected : [expected];
  // Whenever a non-5xx answer is expected (every negative test), a 5xx is reported as a server error first.
  if (allowed.every((st) => st < 500)) expectNoServerError(res, context);
  expect(
    allowed.includes(res.status),
    `${context ? `${context}: ` : ''}expected HTTP ${allowed.join(' or ')} but got ${describe(res)}`,
  ).toBe(true);
}

/**
 * Assert a documented success response and return its validated, typed `data`.
 * @param message optional exact envelope message from the guide (e.g. "PII write successful").
 */
export function expectSuccess<S extends z.ZodType>(
  res: ApiResponse,
  status: number | readonly number[],
  dataSchema: S,
  message?: string,
): z.infer<S> {
  expectStatus(res, status);
  const parsed = successEnvelope(dataSchema).safeParse(res.json());
  if (!parsed.success) {
    throw new Error(
      `Success envelope contract violation for ${res.summary()}:\n${formatZodIssues(parsed.error)}`,
    );
  }
  // Generic zod output types are opaque to TS here; the shape was just validated above.
  const envelope = parsed.data as { message: string; data: z.infer<S> };
  if (message !== undefined) {
    expect(envelope.message, `Envelope message for ${res.summary()}`).toBe(message);
  }
  return envelope.data;
}

/** Assert a documented error envelope with one of the expected error codes. */
export function expectError(
  res: ApiResponse,
  status: number | readonly number[],
  codes: string | readonly string[],
): ErrorEnvelope {
  expectStatus(res, status);
  const parsed = errorEnvelopeSchema.safeParse(res.json());
  if (!parsed.success) {
    throw new Error(
      `Error envelope contract violation for ${res.summary()}:\n${formatZodIssues(parsed.error)}`,
    );
  }
  const allowed = typeof codes === 'string' ? [codes] : codes;
  expect(
    allowed.includes(parsed.data.error.code),
    `Expected error code ${allowed.join(' or ')} but got ${describe(res)}`,
  ).toBe(true);
  expect(parsed.data.data, `Error envelope "data" should be null for ${res.summary()}`).toBeNull();
  return parsed.data;
}

/**
 * HTTP 422 in either known shape: the facade's request-validation body (observed since 2026-11-19, code
 * REQUEST_VALIDATION_ERROR with `error.details`) or the plain error envelope. The old FastAPI `detail` list is
 * no longer accepted.
 */
export function expectRequestValidationError(res: ApiResponse): 'request-validation' | 'error-envelope' {
  expectNoServerError(res);
  expectStatus(res, 422);
  const body = res.json();
  if (requestValidationSchema.safeParse(body).success) return 'request-validation';
  if (errorEnvelopeSchema.safeParse(body).success) return 'error-envelope';
  throw new Error(`422 body is neither the request-validation body nor the error envelope: ${res.summary()}`);
}

/**
 * Aisle token rejected: HTTP 401 with NO data. Observed on staging for a missing, wrong or malformed token:
 * 401, Content-Type text/html, empty body. The body must never contain JSON data (and so no personal data).
 */
export function expectUnauthorized(res: ApiResponse, context = ''): void {
  expectNoServerError(res, context);
  expectStatus(res, 401, context);
  const body = res.json() as { data?: unknown } | undefined;
  expect(
    body === undefined || body.data === undefined || body.data === null,
    `${context ? `${context}: ` : ''}401 response must not contain data (${res.summary()})`,
  ).toBe(true);
}

/** Does any object/array anywhere in `value` have the key `key`? */
function hasKeyDeep(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((v) => hasKeyDeep(v, key));
  if (value !== null && typeof value === 'object')
    return Object.entries(value).some(([k, v]) => k === key || hasKeyDeep(v, key));
  return false;
}

export interface ValidationErrorOptions {
  /** Expected pydantic error type of the entry naming `field` (e.g. "string_too_short"). */
  type?: string;
  /** Submitted values (synthetic markers) that must NOT appear anywhere in the reply. Never printed. */
  notEchoed?: readonly string[];
}

/**
 * HTTP 422 request-validation error (observed 2026-11-19, Dev fix ClickUp 14zmk4dnunb):
 * `{status:false, data:null, error:{code:"REQUEST_VALIDATION_ERROR", details:[{field:"body.<name>", type}]}}`.
 * Optionally checks that at least one entry names `body.<field>` (or a position inside it, e.g.
 * "body.user_ids.unknown") with the given `type`. Entries are currently listed twice (known finding), so
 * uniqueness is NOT asserted. Privacy checks always run: no `tenant_id` and no `input` echo anywhere in the
 * body, and none of `notEchoed` in the raw reply. Messages show field locations and booleans only.
 */
export function expectValidationError(
  res: ApiResponse,
  field?: string,
  options: ValidationErrorOptions = {},
): void {
  expectNoServerError(res);
  expectStatus(res, 422);
  const body = res.json();
  const parsed = requestValidationSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(
      `422 body should be the request-validation body (REQUEST_VALIDATION_ERROR with error.details) for ${res.summary()}:\n${formatZodIssues(parsed.error)}`,
    );
  }
  expect(hasKeyDeep(body, 'tenant_id'), `422 body must not contain tenant_id (${res.summary()})`).toBe(false);
  expect(hasKeyDeep(body, 'input'), `422 body must not echo the submitted input (${res.summary()})`).toBe(
    false,
  );
  if (options.notEchoed?.length) {
    const raw = res.rawText();
    options.notEchoed.forEach((marker, i) =>
      expect(
        raw.includes(marker),
        `422 body must not repeat submitted value #${i + 1} (${res.summary()})`,
      ).toBe(false),
    );
  }
  if (field !== undefined) {
    const loc = `body.${field}`;
    const issues = res.validationIssues;
    const matching = issues.filter((i) => i.startsWith(`${loc}:`) || i.startsWith(`${loc}.`));
    expect(matching.length > 0, `422 should name ${loc}; got [${issues.join(', ')}] (${res.summary()})`).toBe(
      true,
    );
    if (options.type !== undefined) {
      expect(
        matching.some((i) => i.endsWith(`:${options.type}`)),
        `422 should name ${loc} with type ${options.type}; got [${issues.join(', ')}] (${res.summary()})`,
      ).toBe(true);
    }
  }
}

/**
 * For cases where it is known THAT a request must be rejected but not WHICH status (see
 * m1/docs/backend-open-questions.md). Accepts a closed set of statuses and asserts the body is a
 * known error shape. Tighten to a single status once the backend confirms.
 */
export function expectRejected(
  res: ApiResponse,
  allowedStatuses: readonly number[],
  questionRef: string,
): void {
  expectNoServerError(res, `Rejection (${questionRef})`);
  expectStatus(res, allowedStatuses, `Rejection (exact status pending ${questionRef})`);
  if (res.status === 422) {
    expectRequestValidationError(res);
    return;
  }
  const parsed = errorEnvelopeSchema.safeParse(res.json());
  if (!parsed.success) {
    throw new Error(
      `Rejection body is not the documented error envelope for ${res.summary()} (${questionRef})`,
    );
  }
}

/** Strict contract check: an object has exactly the documented keys (no missing, no extra). */
export function expectExactKeys(obj: unknown, documentedKeys: readonly string[], label: string): void {
  expect(obj !== null && typeof obj === 'object', `${label} should be an object`).toBe(true);
  const actual = Object.keys(obj as object).sort();
  const expected = [...documentedKeys].sort();
  const missing = expected.filter((k) => !actual.includes(k));
  const extra = actual.filter((k) => !expected.includes(k));
  // Only key NAMES are reported — never values.
  expect({ missing, extra }, `${label}: keys differ from the documented contract`).toEqual({
    missing: [],
    extra: [],
  });
}

/**
 * A refused request carries no `data` (and so no personal data): the body is empty, not JSON, or has
 * `data` null/absent. Safe message: never prints the body.
 */
export function expectNoData(res: ApiResponse, context = ''): void {
  const body = res.json() as { data?: unknown } | undefined;
  expect(
    body === undefined ||
      typeof body !== 'object' ||
      body === null ||
      body.data === undefined ||
      body.data === null,
    `${context ? `${context}: ` : ''}refused reply must not contain data (${res.summary()})`,
  ).toBe(true);
}
