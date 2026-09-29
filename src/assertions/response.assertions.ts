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
  fastApiValidationSchema,
  successEnvelope,
  type ErrorEnvelope,
} from '../models/common.models';
import { scrubText } from '../utils/redaction';

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

export function expectStatus(res: ApiResponse, expected: number | readonly number[], context = ''): void {
  const allowed = Array.isArray(expected) ? expected : [expected];
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

/** HTTP 422 in either known shape (FastAPI `detail` list — observed — or the error envelope). */
export function expectRequestValidationError(res: ApiResponse): 'fastapi-detail' | 'error-envelope' {
  expectStatus(res, 422);
  const body = res.json();
  if (fastApiValidationSchema.safeParse(body).success) return 'fastapi-detail';
  if (errorEnvelopeSchema.safeParse(body).success) return 'error-envelope';
  throw new Error(`422 body is neither FastAPI "detail" nor the service error envelope: ${res.summary()}`);
}

/**
 * Aisle token rejected: HTTP 401 with NO data. Observed on staging for a missing, wrong or malformed token:
 * 401, Content-Type text/html, empty body. The body must never contain JSON data (and so no personal data).
 */
export function expectUnauthorized(res: ApiResponse, context = ''): void {
  expectStatus(res, 401, context);
  const body = res.json() as { data?: unknown } | undefined;
  expect(
    body === undefined || body.data === undefined || body.data === null,
    `${context ? `${context}: ` : ''}401 response must not contain data (${res.summary()})`,
  ).toBe(true);
}

/**
 * HTTP 422 request-validation error in FastAPI format, optionally naming the offending body field.
 * Observed on staging: `{"detail":[{"type","loc":["body","<field>"],"msg","input",…}]}`.
 */
export function expectValidationError(res: ApiResponse, field?: string): void {
  expectStatus(res, 422);
  expect(
    fastApiValidationSchema.safeParse(res.json()).success,
    `422 body should be a FastAPI "detail" list (${res.summary()})`,
  ).toBe(true);
  if (field !== undefined) {
    expect(
      res.validationIssues.some((i) => i.startsWith(`body.${field}:`)),
      `422 should name body.${field}; got [${res.validationIssues.join(', ')}] (${res.summary()})`,
    ).toBe(true);
  }
}

/**
 * For cases where it is known THAT a request must be rejected but not WHICH status (see
 * docs/backend-open-questions.md). Accepts a closed set of statuses and asserts the body is a
 * known error shape. Tighten to a single status once the backend confirms.
 */
export function expectRejected(
  res: ApiResponse,
  allowedStatuses: readonly number[],
  questionRef: string,
): void {
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
