/**
 * Shared response models of the Aisle PII facade. The envelope `{status, message, data, error}`, the
 * 422 request-validation body and the error codes marked OBSERVED were seen on staging (2026-09-29).
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
 * The facade's 422 body (OBSERVED 2026-11-19, Dev fix ClickUp 14zmk4dnunb):
 * `{status:false, message:"Request validation failed", data:null, error:{code:"REQUEST_VALIDATION_ERROR",
 * message, details:[{field:"body.value", type:"string_too_short"}, …]}}`. `field` is "body.<name>" (names outside
 * Dev's allow-list and list positions appear as "unknown"); `type` is the pydantic error type. Submitted values
 * and tenant_id never appear. Known finding (19 Nov 2026): every detail entry is listed twice — uniqueness is
 * deliberately not asserted.
 */
export const requestValidationSchema = z.object({
  status: z.literal(false),
  message: z.string(),
  data: z.null(),
  error: z.object({
    code: z.literal('REQUEST_VALIDATION_ERROR'),
    message: z.string(),
    details: z
      .array(
        z.looseObject({
          field: z.string().min(1),
          type: z.string().min(1),
        }),
      )
      .min(1),
  }),
});

/**
 * Error codes. OBSERVED on staging: AUTHORIZATION_DENIED (403), PII_NOT_FOUND (404). The others are
 * PROVISIONAL (from the PII Service guide) and must be confirmed through the facade before being asserted.
 */
export const ERROR_CODES = {
  AUTHORIZATION_DENIED: 'AUTHORIZATION_DENIED',
  PII_NOT_FOUND: 'PII_NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  REQUEST_VALIDATION_ERROR: 'REQUEST_VALIDATION_ERROR',
  TRANSIENT_PHONE_NOT_FOUND: 'TRANSIENT_PHONE_NOT_FOUND',
  FREE_TEXT_KEY_NOT_FOUND: 'FREE_TEXT_KEY_NOT_FOUND',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Readiness payload (OBSERVED): `{"status":true,"message":"Service is ready","data":{"status":"ready"}}`. */
export const healthReadyDataSchema = z.object({ status: z.literal('ready') });

/** Documented top-level keys of every envelope — used by the strict contract tests. */
export const ENVELOPE_KEYS = ['data', 'error', 'message', 'status'] as const;
