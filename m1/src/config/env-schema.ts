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

/** The verified Aisle staging facade (testa3 does not resolve). Overridable per environment. */
export const DEFAULT_AISLE_BASE_URL = 'https://testa2.aisle.co/V1';

export const envSchema = z.object({
  // ---- Target: the Aisle PII facade ---------------------------------------------------------------
  /** Label for reports: which Aisle environment was tested. */
  PII_ENVIRONMENT: z.preprocess(
    blankToUndefined,
    z.enum(['local', 'dev', 'qa', 'staging']).default('staging'),
  ),
  AISLE_BASE_URL: z.preprocess(
    blankToUndefined,
    z.url({ protocol: /^https?$/ }).default(DEFAULT_AISLE_BASE_URL),
  ),
  /** The Aisle test token (sent as "Authorization: Bearer …"). SECRET — .env / CI secret only. */
  AISLE_TEST_TOKEN: optionalString,
  /** Generous by default: the first health call on staging took ~14 s (cold start). */
  PII_HTTP_TIMEOUT_MS: intWithDefault(30_000, 100, 300_000),
  /** Extra attempts for retry-safe (read-only) endpoints on HTTP 503. 0 disables retries. */
  PII_RETRY_MAX_ATTEMPTS: intWithDefault(2, 0, 5),
  PII_RETRY_BASE_DELAY_MS: intWithDefault(250, 0, 10_000),
  /** Comma-separated endpoint keys (see src/clients/endpoints.ts) or "all". */
  PII_ENDPOINTS_IN_SCOPE: optionalString,

  // ---- Test data ------------------------------------------------------------------------------
  PII_TEST_RUN_PREFIX: z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^[a-z0-9-]{2,20}$/, 'must be 2-20 chars of lowercase letters, digits or "-"')
      .default('qa-auto'),
  ),
  /** Set automatically by playwright.config.ts; override to reproduce a run. */
  PII_TEST_RUN_ID: optionalString,
  /**
   * Optional fixed test users. Staging accepts made-up user IDs, so tests normally generate their own;
   * set these only if Dev asks QA to use specific approved (non-production) test users.
   */
  AISLE_TEST_USER_ID: z.preprocess(blankToUndefined, z.string().trim().min(1).max(128).optional()),
  AISLE_TEST_OTHER_USER_ID: z.preprocess(blankToUndefined, z.string().trim().min(1).max(128).optional()),
  /** Approved non-deliverable domain for synthetic emails (e.g. example.test). */
  AISLE_TEST_EMAIL_DOMAIN: z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^[a-z0-9.-]+\.[a-z0-9-]+$/i, 'must be a bare domain such as example.test')
      .default('example.test'),
  ),
  /** Team-approved test phone numbers (any formatting). Comma-separated. Never invent real numbers. */
  AISLE_TEST_PHONES: csvList,
  /** A field name the facade does not support (unknown-field test). */
  PII_UNSUPPORTED_FIELD: z.preprocess(
    blankToUndefined,
    z.string().min(1).max(64).default('QA_AUTOMATION_UNKNOWN_FIELD'),
  ),

  // ---- Database (read-only validation; schema supplied by Dev — see docs/database-setup.md) --------
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
