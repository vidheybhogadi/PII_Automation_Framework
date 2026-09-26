/**
 * Zod schema for environment variables.
 *
 * Why Zod? process.env values are all `string | undefined`. Zod converts them into typed values
 * (numbers, booleans, enums, URLs) and gives precise error messages when a value is malformed.
 *
 * Rules:
 *  - Nothing here is required at parse time. Unit tests must run without any .env file.
 *    "Required for integration tests" checks live in config.ts (`require*` helpers) so the error
 *    message can explain exactly what to set and where to get it.
 *  - Empty strings are treated as "not set" (common with copied .env.example files).
 */
import { z } from 'zod';

/** Treat '' / whitespace-only as undefined so `.optional()` behaves intuitively. */
const blankToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalString = z.preprocess(blankToUndefined, z.string().trim().optional());

const optionalInt = (min: number, max: number = Number.MAX_SAFE_INTEGER) =>
  z.preprocess(blankToUndefined, z.coerce.number().int().min(min).max(max).optional());

const intWithDefault = (fallback: number, min: number, max: number = Number.MAX_SAFE_INTEGER) =>
  z.preprocess(blankToUndefined, z.coerce.number().int().min(min).max(max).default(fallback));

const boolWithDefault = (fallback: boolean) =>
  z.preprocess(
    blankToUndefined,
    z
      .enum(['true', 'false', '1', '0', 'yes', 'no'])
      .default(fallback ? 'true' : 'false')
      .transform((v) => v === 'true' || v === '1' || v === 'yes'),
  );

const csvList = z.preprocess(
  blankToUndefined,
  z
    .string()
    .optional()
    .transform((v) =>
      (v ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
);

export const CALLER_ROLES = ['primary', 'secondary', 'limited'] as const;
export type CallerRole = (typeof CALLER_ROLES)[number];

export const envSchema = z.object({
  // ---- Target service -------------------------------------------------------------------------
  PII_ENVIRONMENT: z.preprocess(blankToUndefined, z.enum(['local', 'dev', 'qa', 'staging']).default('local')),
  PII_BASE_URL: z.preprocess(blankToUndefined, z.url({ protocol: /^https?$/ }).optional()),
  PII_HTTP_TIMEOUT_MS: intWithDefault(15_000, 100, 300_000),
  /** Extra attempts for retry-safe (read-only) endpoints on HTTP 503. 0 disables retries. */
  PII_RETRY_MAX_ATTEMPTS: intWithDefault(2, 0, 5),
  PII_RETRY_BASE_DELAY_MS: intWithDefault(250, 0, 10_000),
  /** Comma-separated endpoint keys (see src/clients/endpoints.ts) or "all". */
  PII_ENDPOINTS_IN_SCOPE: optionalString,

  // ---- Calling-service identities (Ed25519) ---------------------------------------------------
  PII_CALLER_PRIMARY_ID: optionalString,
  PII_CALLER_PRIMARY_PRIVATE_KEY_FILE: optionalString,
  PII_CALLER_PRIMARY_PRIVATE_KEY: optionalString,
  PII_CALLER_SECONDARY_ID: optionalString,
  PII_CALLER_SECONDARY_PRIVATE_KEY_FILE: optionalString,
  PII_CALLER_SECONDARY_PRIVATE_KEY: optionalString,
  PII_CALLER_LIMITED_ID: optionalString,
  PII_CALLER_LIMITED_PRIVATE_KEY_FILE: optionalString,
  PII_CALLER_LIMITED_PRIVATE_KEY: optionalString,

  // ---- Test data ------------------------------------------------------------------------------
  PII_TEST_TENANT_ID: z.preprocess(blankToUndefined, z.string().trim().min(1).max(64).optional()),
  PII_TEST_TENANT_ID_SECONDARY: z.preprocess(blankToUndefined, z.string().trim().min(1).max(64).optional()),
  PII_TEST_RUN_PREFIX: z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^[a-z0-9-]{2,20}$/, 'must be 2-20 chars of lowercase letters, digits or "-"')
      .default('qa-auto'),
  ),
  /** Set automatically by playwright.config.ts; override to reproduce a run. */
  PII_TEST_RUN_ID: optionalString,
  PII_TEST_EMAIL_DOMAIN: z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^[a-z0-9.-]+\.[a-z0-9-]+$/i, 'must be a bare domain such as qa.example')
      .optional(),
  ),
  /** Team-approved test phone numbers (any formatting). Comma-separated. */
  PII_TEST_PHONES: csvList,
  PII_TEST_PHONE_8_DIGITS: z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^\d{8}$/)
      .optional(),
  ),
  PII_TEST_PHONE_15_DIGITS: z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^\d{15}$/)
      .optional(),
  ),
  PII_UNSUPPORTED_FIELD: z.preprocess(
    blankToUndefined,
    z.string().min(1).max(64).default('QA_AUTOMATION_UNKNOWN_FIELD'),
  ),
  PII_NON_SEARCHABLE_FIELD: optionalString,

  // ---- Server-side limits (documented development defaults) -----------------------------------
  PII_BATCH_MAX_ITEMS: intWithDefault(50, 1, 10_000),
  PII_SEARCH_DEFAULT_LIMIT: intWithDefault(10, 1, 100),
  PII_TRANSIENT_TTL_MIN_SECONDS: intWithDefault(300, 1),
  PII_TRANSIENT_TTL_MAX_SECONDS: intWithDefault(604_800, 1),
  PII_MAX_BODY_BYTES: optionalInt(1),
  PII_CLOCK_SKEW_TOLERANCE_SECONDS: intWithDefault(120, 0, 3_600),

  // ---- Feature switches -----------------------------------------------------------------------
  PII_ENABLE_TTL_EXPIRY_TEST: boolWithDefault(false),
  PII_SIGNATURE_HELPER_MUST_BE_DISABLED: boolWithDefault(false),

  // ---- Database (technology NOT documented — see docs/database-setup.md) ----------------------
  DB_ENGINE: z.preprocess(blankToUndefined, z.enum(['none', 'postgres', 'mysql']).default('none')),
  DB_HOST: optionalString,
  DB_PORT: optionalInt(1, 65_535),
  DB_NAME: optionalString,
  DB_USER: optionalString,
  DB_PASSWORD: optionalString,
  DB_SSL: boolWithDefault(true),
  DB_QUERIES_FILE: optionalString,
  DB_CONNECT_TIMEOUT_MS: intWithDefault(10_000, 100, 120_000),

  // ---- Logging --------------------------------------------------------------------------------
  LOG_LEVEL: z.preprocess(blankToUndefined, z.enum(['debug', 'info', 'warn', 'error']).default('info')),
  PII_LOG_TO_CONSOLE: boolWithDefault(false),
});

export type RawEnv = z.infer<typeof envSchema>;
