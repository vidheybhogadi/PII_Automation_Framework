/**
 * Shared contract models — taken verbatim from the guide's "Success envelope", "Error envelope" and
 * "Common statuses" sections.
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
 * FastAPI's default 422 body. The guide lists 422 as "FastAPI validation response" without saying whether
 * it is wrapped in the error envelope — see docs/known-gaps-and-questions.md Q-05. Both shapes are accepted.
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

/** Error codes documented in "Common statuses". */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  AUTHORIZATION_DENIED: 'AUTHORIZATION_DENIED',
  PII_NOT_FOUND: 'PII_NOT_FOUND',
  TRANSIENT_PHONE_NOT_FOUND: 'TRANSIENT_PHONE_NOT_FOUND',
  FREE_TEXT_KEY_NOT_FOUND: 'FREE_TEXT_KEY_NOT_FOUND',
  BODY_TOO_LARGE: 'BODY_TOO_LARGE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DECRYPTION_FAILED: 'DECRYPTION_FAILED',
  KEY_UNAVAILABLE: 'KEY_UNAVAILABLE',
  KEY_VERSION_NOT_FOUND: 'KEY_VERSION_NOT_FOUND',
  DATABASE_ERROR: 'DATABASE_ERROR',
  SERVICE_NOT_READY: 'SERVICE_NOT_READY',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** 401 may carry either code (guide: "AUTHENTICATION_FAILED / INVALID_SIGNATURE"). See Q-06. */
export const AUTH_ERROR_CODES: readonly ErrorCode[] = [
  ERROR_CODES.AUTHENTICATION_FAILED,
  ERROR_CODES.INVALID_SIGNATURE,
];

/** Readiness payloads (section 1). */
export const healthReadyDataSchema = z.object({ status: z.literal('ready') });
export const healthNotReadyDataSchema = z.object({ status: z.literal('not_ready') });

/** Documented top-level keys of every envelope — used by the strict contract tests. */
export const ENVELOPE_KEYS = ['data', 'error', 'message', 'status'] as const;
