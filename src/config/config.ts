/**
 * Typed framework configuration built from environment variables.
 *
 * - `loadConfig()` parses and validates FORMAT only. It never fails because something is missing, so
 *   unit tests work without a .env file.
 * - `require*()` helpers enforce PRESENCE at the moment a test actually needs a value, and throw a
 *   ConfigError that names the variable, explains why it is needed and where to obtain it.
 *
 * Secrets (private keys, DB password) are wrapped in `Secret` so they cannot leak through logs/reports.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ENDPOINT_KEYS, type EndpointKey } from '../clients/endpoints';
import { Secret } from '../utils/secret';
import { CALLER_ROLES, envSchema, type CallerRole, type RawEnv } from './env-schema';

export type { CallerRole } from './env-schema';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface CallerCredentials {
  readonly role: CallerRole;
  readonly callerId: string;
  readonly privateKeyPem: Secret;
}

export interface FrameworkConfig {
  readonly environment: RawEnv['PII_ENVIRONMENT'];
  readonly baseUrl: string | undefined;
  readonly http: { timeoutMs: number; retryMaxAttempts: number; retryBaseDelayMs: number };
  readonly endpointsInScope: readonly EndpointKey[];
  readonly callers: Readonly<Partial<Record<CallerRole, CallerCredentials>>>;
  readonly tenants: { primary: string | undefined; secondary: string | undefined };
  readonly testData: {
    runPrefix: string;
    runId: string | undefined;
    emailDomain: string | undefined;
    phones: readonly string[];
    phone8Digits: string | undefined;
    phone15Digits: string | undefined;
    unsupportedField: string;
    nonSearchableField: string | undefined;
  };
  readonly limits: {
    batchMaxItems: number;
    searchDefaultLimit: number;
    transientTtlMinSeconds: number;
    transientTtlMaxSeconds: number;
    maxBodyBytes: number | undefined;
    clockSkewToleranceSeconds: number;
  };
  readonly features: { ttlExpiryTest: boolean; signatureHelperMustBeDisabled: boolean };
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
  PII_BASE_URL: 'PII service base URL for the target environment (backend/DevOps team).',
  PII_CALLER_PRIMARY_ID:
    'Registered caller/service ID for the automation caller with full test permissions (PII backend team).',
  PII_CALLER_SECONDARY_ID:
    'A SECOND registered caller ID with the same permissions as primary; used for caller-ownership isolation tests.',
  PII_CALLER_LIMITED_ID:
    'A registered caller ID with the restricted permission set described in docs/setup-guide.md §4.',
  PII_TEST_TENANT_ID: 'Dedicated non-production tenant approved for automation (PII backend team / QA lead).',
  PII_TEST_TENANT_ID_SECONDARY: 'A second approved non-production tenant, used for tenant-isolation tests.',
  PII_TEST_EMAIL_DOMAIN:
    'Approved non-deliverable email domain for synthetic emails (e.g. a reserved .example domain).',
  PII_TEST_PHONES: 'Comma-separated list of team-approved TEST phone numbers (QA lead / compliance).',
  PII_TEST_PHONE_8_DIGITS: 'An approved test phone number that has exactly 8 digits (boundary test).',
  PII_TEST_PHONE_15_DIGITS: 'An approved test phone number that has exactly 15 digits (boundary test).',
  PII_MAX_BODY_BYTES: "The service's configured maximum request body size in bytes (PII backend team).",
  PII_NON_SEARCHABLE_FIELD: 'A field-catalog field that is NOT searchable (PII backend team).',
  DB_ENGINE: 'Database technology used by the PII service: postgres | mysql (PII backend team / DBA).',
  DB_QUERIES_FILE:
    'Path to the SQL catalog JSON (see config/db-queries.example.json and docs/database-setup.md).',
};

function describeVar(name: string): string {
  const help = ENV_HELP[name];
  return help ? `${name} — ${help}` : name;
}

/**
 * Accepts a private key as (a) PEM text, (b) PEM text with literal "\n" sequences (common in CI secret
 * stores and .env files), or (c) base64-encoded PEM text. The documented format is PEM (the guide's Python
 * example uses `load_pem_private_key(..., password=None)`), i.e. an unencrypted PKCS#8 PEM Ed25519 key.
 */
export function normalizePrivateKeyText(raw: string): string {
  let text = raw.trim();
  if (!text.includes('-----BEGIN')) {
    const decoded = Buffer.from(text, 'base64').toString('utf8');
    if (decoded.includes('-----BEGIN')) text = decoded.trim();
  }
  return text.replace(/\\n/g, '\n').trim();
}

function resolveCaller(role: CallerRole, env: RawEnv, baseDir: string): CallerCredentials | undefined {
  const upper = role.toUpperCase() as Uppercase<CallerRole>;
  const idVar = `PII_CALLER_${upper}_ID` as const;
  const fileVar = `PII_CALLER_${upper}_PRIVATE_KEY_FILE` as const;
  const inlineVar = `PII_CALLER_${upper}_PRIVATE_KEY` as const;

  const callerId = env[idVar];
  const keyFile = env[fileVar];
  const inlineKey = env[inlineVar];

  if (!callerId && !keyFile && !inlineKey) return undefined;
  if (!callerId) {
    throw new ConfigError(`${fileVar}/${inlineVar} is set but ${idVar} is missing. ${describeVar(idVar)}`);
  }
  if (keyFile && inlineKey) {
    throw new ConfigError(`Set only one of ${fileVar} or ${inlineVar} for caller "${role}", not both.`);
  }
  if (!keyFile && !inlineKey) {
    throw new ConfigError(
      `${idVar} is set but no private key was provided. Set ${fileVar} (path to an unencrypted PKCS#8 PEM ` +
        `Ed25519 private key) or ${inlineVar} (PEM text or base64 of the PEM). Obtain it from your secret manager.`,
    );
  }

  let pemText: string;
  if (keyFile) {
    const resolved = path.resolve(baseDir, keyFile);
    try {
      pemText = readFileSync(resolved, 'utf8');
    } catch {
      // Only the path is reported — never file contents.
      throw new ConfigError(`${fileVar} points to "${resolved}", which could not be read.`);
    }
  } else {
    pemText = inlineKey as string;
  }
  return { role, callerId, privateKeyPem: new Secret(normalizePrivateKeyText(pemText)) };
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
 * Parse and validate environment variables. Pure function of `env` so it is unit-testable.
 * @param baseDir directory used to resolve relative key/queries file paths (default: project root).
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  baseDir: string = process.cwd(),
): FrameworkConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    // Report variable names and the rule that failed — never the received value (it may be a secret).
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new ConfigError(`Invalid environment configuration:\n${problems}`);
  }
  const e = parsed.data;

  if (e.PII_TRANSIENT_TTL_MIN_SECONDS > e.PII_TRANSIENT_TTL_MAX_SECONDS) {
    throw new ConfigError(
      'PII_TRANSIENT_TTL_MIN_SECONDS must not be greater than PII_TRANSIENT_TTL_MAX_SECONDS.',
    );
  }

  const callers: Partial<Record<CallerRole, CallerCredentials>> = {};
  for (const role of CALLER_ROLES) {
    const creds = resolveCaller(role, e, baseDir);
    if (creds) callers[role] = creds;
  }

  return {
    environment: e.PII_ENVIRONMENT,
    baseUrl: e.PII_BASE_URL?.replace(/\/+$/, ''),
    http: {
      timeoutMs: e.PII_HTTP_TIMEOUT_MS,
      retryMaxAttempts: e.PII_RETRY_MAX_ATTEMPTS,
      retryBaseDelayMs: e.PII_RETRY_BASE_DELAY_MS,
    },
    endpointsInScope: parseEndpointScope(e.PII_ENDPOINTS_IN_SCOPE),
    callers,
    tenants: { primary: e.PII_TEST_TENANT_ID, secondary: e.PII_TEST_TENANT_ID_SECONDARY },
    testData: {
      runPrefix: e.PII_TEST_RUN_PREFIX,
      runId: e.PII_TEST_RUN_ID,
      emailDomain: e.PII_TEST_EMAIL_DOMAIN?.toLowerCase(),
      phones: e.PII_TEST_PHONES,
      phone8Digits: e.PII_TEST_PHONE_8_DIGITS,
      phone15Digits: e.PII_TEST_PHONE_15_DIGITS,
      unsupportedField: e.PII_UNSUPPORTED_FIELD,
      nonSearchableField: e.PII_NON_SEARCHABLE_FIELD,
    },
    limits: {
      batchMaxItems: e.PII_BATCH_MAX_ITEMS,
      searchDefaultLimit: e.PII_SEARCH_DEFAULT_LIMIT,
      transientTtlMinSeconds: e.PII_TRANSIENT_TTL_MIN_SECONDS,
      transientTtlMaxSeconds: e.PII_TRANSIENT_TTL_MAX_SECONDS,
      maxBodyBytes: e.PII_MAX_BODY_BYTES,
      clockSkewToleranceSeconds: e.PII_CLOCK_SKEW_TOLERANCE_SECONDS,
    },
    features: {
      ttlExpiryTest: e.PII_ENABLE_TTL_EXPIRY_TEST,
      signatureHelperMustBeDisabled: e.PII_SIGNATURE_HELPER_MUST_BE_DISABLED,
    },
    db: {
      engine: e.DB_ENGINE,
      host: e.DB_HOST,
      port: e.DB_PORT,
      database: e.DB_NAME,
      user: e.DB_USER,
      password: e.DB_PASSWORD === undefined ? undefined : new Secret(e.DB_PASSWORD),
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

/** Values every integration (live service) test needs. Reports ALL missing values at once. */
export function assertIntegrationConfig(config: FrameworkConfig): void {
  const missing: string[] = [];
  if (!config.baseUrl) missing.push('PII_BASE_URL');
  if (!config.callers.primary) missing.push('PII_CALLER_PRIMARY_ID (+ PII_CALLER_PRIMARY_PRIVATE_KEY_FILE)');
  if (!config.tenants.primary) missing.push('PII_TEST_TENANT_ID');
  if (!config.testData.emailDomain) missing.push('PII_TEST_EMAIL_DOMAIN');
  if (missing.length > 0) {
    throw new ConfigError(
      'Integration tests cannot run — required configuration is missing:\n' +
        missing.map((m) => `  - ${describeVar(m.split(' ')[0] as string)}`).join('\n') +
        '\nCopy .env.example to .env and fill in the values (see docs/setup-guide.md). ' +
        'Run `npm run check-env` to validate.',
    );
  }
}

export function requireBaseUrl(config: FrameworkConfig): string {
  if (!config.baseUrl) throw new ConfigError(`Missing ${describeVar('PII_BASE_URL')}`);
  return config.baseUrl;
}

export function requireCaller(config: FrameworkConfig, role: CallerRole): CallerCredentials {
  const creds = config.callers[role];
  if (!creds) {
    const upper = role.toUpperCase();
    throw new ConfigError(
      `This test needs the "${role}" caller, which is not configured. Set PII_CALLER_${upper}_ID and ` +
        `PII_CALLER_${upper}_PRIVATE_KEY_FILE. ${ENV_HELP[`PII_CALLER_${upper}_ID`] ?? ''}`,
    );
  }
  return creds;
}

export function requireTenant(config: FrameworkConfig, which: 'primary' | 'secondary'): string {
  const tenant = config.tenants[which];
  if (!tenant) {
    const name = which === 'primary' ? 'PII_TEST_TENANT_ID' : 'PII_TEST_TENANT_ID_SECONDARY';
    throw new ConfigError(`Missing ${describeVar(name)}`);
  }
  if (which === 'secondary' && tenant === config.tenants.primary) {
    throw new ConfigError('PII_TEST_TENANT_ID_SECONDARY must differ from PII_TEST_TENANT_ID.');
  }
  return tenant;
}

/** Generic helper: fail with an actionable message when an optional value is required by a test. */
export function requireValue<T>(value: T | undefined, envVar: string, purpose: string): T {
  if (value === undefined || (Array.isArray(value) && value.length === 0)) {
    throw new ConfigError(`${purpose} requires ${describeVar(envVar)}`);
  }
  return value;
}

let cached: FrameworkConfig | undefined;

/** Process-wide cached config (each Playwright worker is a separate process). */
export function getConfig(): FrameworkConfig {
  cached ??= loadConfig();
  return cached;
}
