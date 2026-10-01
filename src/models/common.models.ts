/**
 * Shared response models of the Aisle PII facade. The envelope `{status, message, data, error}`, the
 * FastAPI 422 `detail` list and the error codes marked OBSERVED were seen on staging (2026-09-29).
 *
 * TypeScript + Zod pattern used throughout /models:
 *   const fooSchema = z.object({...});      // runtime validator
 *   type Foo = z.infer<typeof fooSchema>;    // compile-time type derived from the same definition
 * One definition gives both a type for the editor and a validator for the test.
 */
import { z } from 'zod';

/** ISO-8601 timestamp; accepts "Z" or a numeric offset (FastAPI may emit "+00:00"). */
export const isoDateTime = z.iso.datetime({ offset: true });

/** `{ status: true, message, data, error: null }` */
export function successEnvelope<T extends z.ZodType>(data: T) {
  return z.object({
    status: z.literal(true),
    message: z.string(),
    data,
    error: z.null(),
  });
}

export const errorBodySchema = z.object({
  code: z.string().min(1),
  message: z.string(),
});

/** `{ status: false, message, data: null, error: { code, message } }` (health not-ready uses non-null data). */
export const errorEnvelopeSchema = z.object({
  status: z.literal(false),
  message: z.string(),
  data: z.unknown(),
  error: errorBodySchema,
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/**
 * FastAPI's default 422 body (OBSERVED). Note: each `detail` entry also carries an `input` echo of what was
 * sent — including the value and the internal tenant_id — which is known finding BQ-08 (low priority, no active test).
 */
export const fastApiValidationSchema = z.object({
  detail: z.array(
    z.looseObject({
      loc: z.array(z.union([z.string(), z.number()])),
      msg: z.string(),
      type: z.string(),
    }),
  ),
});

/**
 * Error codes. OBSERVED on staging: AUTHORIZATION_DENIED (403), PII_NOT_FOUND (404). The others are
 * PROVISIONAL (from the PII Service guide) and must be confirmed through the facade before being asserted.
 */
export const ERROR_CODES = {
  AUTHORIZATION_DENIED: 'AUTHORIZATION_DENIED',
  PII_NOT_FOUND: 'PII_NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  TRANSIENT_PHONE_NOT_FOUND: 'TRANSIENT_PHONE_NOT_FOUND',
  FREE_TEXT_KEY_NOT_FOUND: 'FREE_TEXT_KEY_NOT_FOUND',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Readiness payload (OBSERVED): `{"status":true,"message":"Service is ready","data":{"status":"ready"}}`. */
export const healthReadyDataSchema = z.object({ status: z.literal('ready') });

/** Documented top-level keys of every envelope — used by the strict contract tests. */
export const ENVELOPE_KEYS = ['data', 'error', 'message', 'status'] as const;
