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

/**
 * HTTP 422 "FastAPI validation response". The guide does not say whether 422 bodies use the service error
 * envelope or FastAPI's default `{ "detail": [...] }` (Q-05), so both documented shapes are accepted — but
 * the body MUST be one of them.
 */
export function expectRequestValidationError(res: ApiResponse): 'fastapi-detail' | 'error-envelope' {
  expectStatus(res, 422);
  const body = res.json();
  if (fastApiValidationSchema.safeParse(body).success) return 'fastapi-detail';
  if (errorEnvelopeSchema.safeParse(body).success) return 'error-envelope';
  throw new Error(`422 body is neither FastAPI "detail" nor the service error envelope: ${res.summary()}`);
}

/**
 * For cases where the guide defines THAT a request must be rejected but not WHICH status (see
 * docs/known-gaps-and-questions.md). Accepts a closed set of statuses and asserts the body is a
 * documented error shape. Tighten to a single status once the backend confirms.
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
