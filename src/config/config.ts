/**
 * Typed framework configuration built from environment variables.
 *
 * - `loadConfig()` parses and validates FORMAT only. It never fails because something is missing, so
 *   unit tests work without a .env file.
 * - `require*()` helpers enforce PRESENCE at the moment a test actually needs a value, and throw a
 *   ConfigError that names the variable, explains why it is needed and where to obtain it.
 *
 * Secrets (the Aisle test token, the DB password) are wrapped in `Secret` so they cannot leak through
 * logs, reports, error messages or `console.log(config)`.
 */
import path from 'node:path';
import { ENDPOINT_KEYS, type EndpointKey } from '../clients/endpoints';
import { registerSecretValue } from '../utils/redaction';
import { Secret } from '../utils/secret';
import { envSchema, type RawEnv } from './env-schema';
import { withoutPlaceholders } from './placeholders';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface FrameworkConfig {
  readonly environment: RawEnv['PII_ENVIRONMENT'];
  /** Aisle PII facade base URL, e.g. https://testa2.aisle.co/V1 (no trailing slash). */
  readonly baseUrl: string;
  /** The Aisle test token (Bearer). */
  readonly token: Secret | undefined;
  readonly http: { timeoutMs: number; retryMaxAttempts: number; retryBaseDelayMs: number };
  readonly endpointsInScope: readonly EndpointKey[];
  readonly testData: {
    runPrefix: string;
    runId: string | undefined;
    /** Optional fixed test users (normally tests generate their own). */
    userId: string | undefined;
    otherUserId: string | undefined;
    emailDomain: string;
    phones: readonly string[];
    unsupportedField: string;
  };
  readonly db: {
    engine: RawEnv['DB_ENGINE'];
    host: string | undefined;
    port: number | undefined;
    database: string | undefined;
    user: string | undefined;
    password: Secret | undefined;
    ssl: boolean;
    queriesFile: string | undefined;
    connectTimeoutMs: number;
  };
  readonly logging: { level: RawEnv['LOG_LEVEL']; toConsole: boolean };
}

/** Where to get each value — reused in error messages and docs/setup-guide.md. */
export const ENV_HELP: Record<string, string> = {
  AISLE_BASE_URL: 'Aisle PII facade base URL (default https://testa2.aisle.co/V1, the verified staging).',
  AISLE_TEST_TOKEN:
    'The Aisle testing token, sent as "Authorization: Bearer …" (Aisle backend team). Keep it in .env or a CI secret.',
  AISLE_TEST_EMAIL_DOMAIN:
    'Approved non-deliverable email domain for synthetic emails (default example.test).',
  AISLE_TEST_PHONES:
    'Comma-separated list of team-approved TEST phone numbers (QA lead / Aisle backend team).',
  AISLE_TEST_USER_ID: 'Optional approved test user ID, only if Dev asks QA to use a fixed user.',
  AISLE_TEST_OTHER_USER_ID: 'Optional second approved test user ID, for the cross-user test.',
  DB_ENGINE: 'Database technology of the PII DB: postgres | mysql (Aisle / PII backend team).',
  DB_QUERIES_FILE:
    'Path to the read-only SQL catalog JSON (see config/db-queries.example.json and docs/database-setup.md).',
};

function describeVar(name: string): string {
  const help = ENV_HELP[name];
  return help ? `${name} — ${help}` : name;
}

function parseEndpointScope(raw: string | undefined): EndpointKey[] {
  if (!raw || raw.toLowerCase() === 'all') return [...ENDPOINT_KEYS];
  const requested = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const unknown = requested.filter((k) => !(ENDPOINT_KEYS as string[]).includes(k));
  if (unknown.length > 0) {
    throw new ConfigError(
      `PII_ENDPOINTS_IN_SCOPE contains unknown endpoint key(s): ${unknown.join(', ')}. ` +
        `Valid keys: ${ENDPOINT_KEYS.join(', ')} (or "all").`,
    );
  }
  return requested as EndpointKey[];
}

/**
 * Wrap a secret and teach the scrubber its exact value, so it is removed wherever it might appear. In captured
 * requests it is shown as `placeholder` (e.g. "$AISLE_TEST_TOKEN"), so a copied curl works with your own .env.
 */
function secret(value: string | undefined, placeholder?: string): Secret | undefined {
  if (value === undefined) return undefined;
  registerSecretValue(value, placeholder);
  return new Secret(value);
}

/**
 * Parse and validate environment variables. Pure function of `env` so it is unit-testable.
 * @param baseDir directory used to resolve the relative DB queries file path (default: project root).
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  baseDir: string = process.cwd(),
): FrameworkConfig {
  // PENDING_… dummies (values still owed by the backend team) count as unset.
  const parsed = envSchema.safeParse(withoutPlaceholders(env));
  if (!parsed.success) {
    // Report variable names and the rule that failed — never the received value (it may be a secret).
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new ConfigError(`Invalid environment configuration:\n${problems}`);
  }
  const e = parsed.data;

  return {
    environment: e.PII_ENVIRONMENT,
    baseUrl: e.AISLE_BASE_URL.replace(/\/+$/, ''),
    token: secret(e.AISLE_TEST_TOKEN, '$AISLE_TEST_TOKEN'),
    http: {
      timeoutMs: e.PII_HTTP_TIMEOUT_MS,
      retryMaxAttempts: e.PII_RETRY_MAX_ATTEMPTS,
      retryBaseDelayMs: e.PII_RETRY_BASE_DELAY_MS,
    },
    endpointsInScope: parseEndpointScope(e.PII_ENDPOINTS_IN_SCOPE),
    testData: {
      runPrefix: e.PII_TEST_RUN_PREFIX,
      runId: e.PII_TEST_RUN_ID,
      userId: e.AISLE_TEST_USER_ID,
      otherUserId: e.AISLE_TEST_OTHER_USER_ID,
      emailDomain: e.AISLE_TEST_EMAIL_DOMAIN.toLowerCase(),
      phones: e.AISLE_TEST_PHONES,
      unsupportedField: e.PII_UNSUPPORTED_FIELD,
    },
    db: {
      engine: e.DB_ENGINE,
      host: e.DB_HOST,
      port: e.DB_PORT,
      database: e.DB_NAME,
      user: e.DB_USER,
      password: secret(e.DB_PASSWORD),
      ssl: e.DB_SSL,
      queriesFile: e.DB_QUERIES_FILE ? path.resolve(baseDir, e.DB_QUERIES_FILE) : undefined,
      connectTimeoutMs: e.DB_CONNECT_TIMEOUT_MS,
    },
    logging: { level: e.LOG_LEVEL, toConsole: e.PII_LOG_TO_CONSOLE },
  };
}

// ------------------------------------------------------------------------------------------------
// Presence checks. Each throws an actionable ConfigError instead of letting a test fail obscurely.
// ------------------------------------------------------------------------------------------------

/** Values every live (Aisle staging) test needs. Reports ALL missing values at once. */
export function assertIntegrationConfig(config: FrameworkConfig): void {
  const missing: string[] = [];
  if (!config.token) missing.push('AISLE_TEST_TOKEN');
  if (missing.length > 0) {
    throw new ConfigError(
      'Aisle API tests cannot run — required configuration is missing:\n' +
        missing.map((m) => `  - ${describeVar(m)}`).join('\n') +
        '\nCopy .env.example to .env and fill in the values (see docs/setup-guide.md). ' +
        'Run `npm run check-env` to validate.',
    );
  }
}

export function requireToken(config: FrameworkConfig): Secret {
  if (!config.token) throw new ConfigError(`Missing ${describeVar('AISLE_TEST_TOKEN')}`);
  return config.token;
}

/** Generic helper: fail with an actionable message when an optional value is required by a test. */
export function requireValue<T>(value: T | undefined, envVar: string, purpose: string): T {
  if (value === undefined || (Array.isArray(value) && value.length === 0)) {
    throw new ConfigError(`${purpose} requires ${describeVar(envVar)}`);
  }
  return value;
}

/** True when read-only DB validation is configured (engine, connection and query catalog). */
export function isDbConfigured(config: FrameworkConfig): boolean {
  const d = config.db;
  return Boolean(d.engine !== 'none' && d.host && d.database && d.user && d.password && d.queriesFile);
}
