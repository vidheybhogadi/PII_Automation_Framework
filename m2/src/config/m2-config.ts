/**
 * Milestone 2 configuration, read from the environment (.env is loaded by playwright.config.ts).
 *
 * Parsing never fails because a value is missing, so the offline self-tests (project m2-unit) run without .env.
 * Live tests call `requireTestToken()` when they need TEST_TOKEN. Secrets are wrapped in `Secret` and registered with
 * the scrubber, so they appear in reports only as their placeholder (`$AISLE_TEST_TOKEN`).
 */
import { randomBytes } from 'node:crypto';
import { withoutPlaceholders } from '../../../core/config/placeholders';
import { registerSecretValue } from '../../../core/utils/redaction';
import { Secret } from '../../../core/utils/secret';
import type { DbSettings } from '../../../core/db/db-client';
import type { LogLevel } from '../../../core/utils/logger';

/** Verified staging host. M2 paths already start with /V1, so the base URL is the origin only. */
export const DEFAULT_M2_BASE_URL = 'https://testa2.aisle.co';
/** Staging accepted 10.0.0 and 99.99.99 on 2026-10-23 (both replies carry show_update_app:true, which does not block auth). */
export const DEFAULT_APP_VERSION = '10.0.0';
export const DEFAULT_DEVICE_TYPE = 'android';

export interface M2Config {
  readonly baseUrl: string;
  /** TEST_TOKEN (the existing AISLE_TEST_TOKEN), for /V1/pii_integration/* and wrong-credential checks. */
  readonly testToken: Secret | undefined;
  readonly appVersion: string;
  readonly deviceType: string;
  /** Unique per run: prefixes every synthetic id the run creates, e.g. qa-m2-20261023t101500-9f3a. */
  readonly runId: string;
  readonly http: { timeoutMs: number; retryMaxAttempts: number; retryBaseDelayMs: number };
  readonly logging: { level: LogLevel; toConsole: boolean };
  /** Create new synthetic staging accounts (phone login). Default OFF — cases that need one are Blocked. */
  readonly createAccounts: boolean;
  /** Pre-onboarded synthetic accounts (+91 10… numbers, never 106…) once Dev provides them (M2Q-36). */
  readonly onboardedNumbers: readonly string[];
  /** Two pre-connected synthetic accounts (M2Q-36). */
  readonly connectedNumbers: readonly string[];
  /** How the PII user_id is derived for an app user (M2Q-37: app user id, from code); undefined → DB checks Blocked. */
  readonly piiUserIdSource: 'app-id' | undefined;
  /** Tenant the app writes under (M2Q-37); default "aisle", as observed for the facade in M1. */
  readonly piiTenant: string;
  /** Read-only PII DB (same DB_* settings as M1) and the M2 SELECT catalog. */
  readonly db: DbSettings & { queriesFile: string };
  /**
   * Database name of the Aisle app DB (aisleweb) on the same server, with the same read-only credentials (M2Q-33
   * answer). Queried only for the suite's own accounts (m2/src/db/app-db.ts).
   */
  readonly appDbName: string;
  /**
   * Dev test windows (Dev-assisted cases). Read gates are OFF on testa2 and QA cannot switch them (M2Q-02, QA lead
   * 2026-10-24) — gate-ON parts wait for Dev (M2Q-43), so there is no gate window setting.
   */
  readonly windows: { piiOutage: boolean };
  /**
   * Values for Dev cURL placeholders set in the environment (M2_VALUE_<NAME>). They win over the defaults below.
   * Identity placeholders (IDENTITY_PLACEHOLDERS) are never taken from here — they always come from suite accounts.
   */
  readonly values: Readonly<Record<string, string>>;
  /** Default catalogue values for Dev cURL placeholders (DEFAULT_VALUES + PHONE_CODE_ID), checked live at run time. */
  readonly defaultValues: Readonly<Record<string, string>>;
  /**
   * How long staging may take to auto-approve a suite account, counted from its onboarding (M2_APPROVAL_WAIT_MS,
   * default 15 min — approval took 8–20 min in run qa-m2-20261024t134344).
   */
  readonly approvalWaitMs: number;
  /** Contract recording mode (npm run m2:contracts:record only). */
  readonly recordContracts: boolean;
  /**
   * Phone login as the Aisle app sends it (UI automation team, verified 2026-10-23): phone_code_id 242 (+91),
   * device fields in the OTP-request body, and the app's static signature_v1 — a SECRET from .env
   * (M2_LOGIN_SIGNATURE_V1), registered with the scrubber and never logged, recorded or printed.
   */
  readonly login: {
    phoneCodeId: number;
    deviceType: string;
    appVersion: string;
    signature: Secret | undefined;
  };
  /** CDN photo URLs per gender the UI automation team's onboarding uses (not secret). */
  readonly onboardingPhotos: Readonly<Record<'Male' | 'Female', readonly string[]>>;
  /**
   * Optional: a SYNTHETIC, non-person test image to upload (POST /V1/images) instead of the hosted set
   * (M2_ONBOARDING_UPLOAD_IMAGE=<path>). Never real people's photos. Default: hosted gender set.
   */
  readonly onboardingUploadImage: string | undefined;
}

/**
 * Aisle CDN photos used by the UI automation team's onboarding, PER GENDER (2026-10-23 correction): moderation
 * compares faces with the declared gender, so a profile only ever gets the set of its own gender, and no photo
 * repeats within a profile.
 */
const cdn = (hash: string) => `https://prodimages.aisle.co/${hash}.png`;
export const ONBOARDING_PHOTOS: Readonly<Record<'Male' | 'Female', readonly string[]>> = {
  Male: [
    'ab862be76d93aac0b4a4a36cb6c77057198492254279',
    '08e2dec21c7a757b04ba2662a0b5395f198492251394',
    '1c385625599c22b22d4827927a020cfb198492255090',
    'f9da5cdf031c000ff2f84a3d962529e1198492251671',
  ].map(cdn),
  Female: [
    '6deac2e3156fcd8390f37d2c7bf346a7198492255740',
    '72f2d4c7af8cbed8f5ae844a1e668fbd198492259247',
    'e64b0a6f9c69f8ffe04d48d9c2fd18e9198492255187',
    'e64b0a6f9c69f8ffe04d48d9c2fd18e9198492257154',
  ].map(cdn),
};

/**
 * Default catalogue ids for Dev cURL placeholders (user decision 2026-10-24: config defaults, not .env; an
 * M2_VALUE_<NAME> setting overrides them). Sources — "from code / our own staging accounts, confirm with Dev":
 * FAITH_ID, LANGUAGE_ID, RELATIONSHIP_GOAL_ID: the verified onboarding body (m2/src/accounts/onboarding.ts);
 * DELETE_REASON_ID: the verified delete call (M2Q-36 answer); the others: option ids seen on staging for the suite's
 * own accounts. At run time m2/src/checks/catalogue.ts checks each against the live option list where one exists.
 */
export const DEFAULT_VALUES: Readonly<Record<string, string>> = {
  FAITH_ID: '6',
  LANGUAGE_ID: '1',
  RELATIONSHIP_GOAL_ID: '2',
  INTEREST_ID: '1',
  INTEREST_V2_ID: '31',
  TRAIT_ID: '121',
  PREFERENCE_ID: '14',
  SETTLE_ID: '3',
  MBTI_ID: '8',
  QUESTION_ID: '156',
  AUDIO_QUESTION_ID: '165',
  DELETE_REASON_ID: '1',
};

/**
 * Placeholders that name an account or something owned by one. They are filled only from the suite's own synthetic
 * accounts — never from M2_VALUE_<NAME> — so a request can never point at another (real) user.
 */
export const IDENTITY_PLACEHOLDERS = [
  'REF',
  'OTHER_REF',
  'USER_ID',
  'OTHER_USER_ID',
  'CONVERSATION_ID',
  'REQUEST_ID',
  'PHOTO_ID_1',
  'PHOTO_ID_2',
];

export class M2ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'M2ConfigError';
  }
}

const int = (raw: string | undefined, fallback: number) => {
  const n = raw === undefined || raw.trim() === '' ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
};

/** Origin of a URL ("https://testa2.aisle.co/V1" → "https://testa2.aisle.co"); undefined when not a URL. */
export function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

export function generateM2RunId(now: Date = new Date()): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, '')
    .toLowerCase();
  return `qa-m2-${stamp}-${randomBytes(2).toString('hex')}`;
}

const list = (raw: string | undefined) =>
  (raw ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

export function loadM2Config(env: NodeJS.ProcessEnv = process.env): M2Config {
  const e = withoutPlaceholders(env);
  const dbPassword = e.DB_PASSWORD?.trim() || undefined;
  if (dbPassword) registerSecretValue(dbPassword);
  const engine = (e.DB_ENGINE ?? 'none').trim() as DbSettings['engine'];
  const signature = e.M2_LOGIN_SIGNATURE_V1 || undefined;
  if (signature) registerSecretValue(signature, '$M2_LOGIN_SIGNATURE_V1');
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(e))
    if (k.startsWith('M2_VALUE_') && v && !IDENTITY_PLACEHOLDERS.includes(k.slice(9))) values[k.slice(9)] = v;
  const phoneCodeId = int(e.M2_PHONE_CODE_ID, 242);
  const token = e.AISLE_TEST_TOKEN?.trim() || undefined;
  if (token) registerSecretValue(token, '$AISLE_TEST_TOKEN');
  const level = (e.LOG_LEVEL ?? 'info') as LogLevel;
  return {
    baseUrl: (e.M2_BASE_URL?.trim() || originOf(e.AISLE_BASE_URL) || DEFAULT_M2_BASE_URL).replace(/\/+$/, ''),
    testToken: token ? new Secret(token) : undefined,
    appVersion: e.M2_APP_VERSION?.trim() || DEFAULT_APP_VERSION,
    deviceType: e.M2_DEVICE_TYPE?.trim() || DEFAULT_DEVICE_TYPE,
    runId: e.M2_TEST_RUN_ID?.trim() || generateM2RunId(),
    http: {
      timeoutMs: int(e.PII_HTTP_TIMEOUT_MS, 30_000),
      retryMaxAttempts: int(e.PII_RETRY_MAX_ATTEMPTS, 2),
      retryBaseDelayMs: int(e.PII_RETRY_BASE_DELAY_MS, 250),
    },
    logging: {
      level: ['debug', 'info', 'warn', 'error'].includes(level) ? level : 'info',
      toConsole: e.PII_LOG_TO_CONSOLE === 'true',
    },
    createAccounts: e.M2_CREATE_ACCOUNTS === 'true',
    onboardedNumbers: list(e.M2_ONBOARDED_ACCOUNTS),
    connectedNumbers: list(e.M2_CONNECTED_ACCOUNTS),
    // M2Q-37 answered from code: PII user_id = app user id. M2_PII_USER_ID_SOURCE=none switches the DB checks off.
    piiUserIdSource: e.M2_PII_USER_ID_SOURCE === 'none' ? undefined : 'app-id',
    piiTenant: e.M2_PII_TENANT?.trim() || 'aisle',
    db: {
      engine: ['postgres', 'mysql'].includes(engine) ? engine : 'none',
      host: e.DB_HOST || undefined,
      port: e.DB_PORT ? Number(e.DB_PORT) : undefined,
      database: e.DB_NAME || undefined,
      user: e.DB_USER || undefined,
      password: dbPassword ? new Secret(dbPassword) : undefined,
      ssl: e.DB_SSL !== 'false', // default true, as in M1
      connectTimeoutMs: int(e.DB_CONNECT_TIMEOUT_MS, 10_000),
      queriesFile: e.M2_DB_QUERIES_FILE?.trim() || 'm2/config/db-queries.json',
    },
    appDbName: e.M2_APP_DB_NAME?.trim() || 'aisleweb',
    windows: {
      piiOutage: e.M2_PII_OUTAGE_WINDOW === 'true',
    },
    values,
    defaultValues: { ...DEFAULT_VALUES, PHONE_CODE_ID: String(phoneCodeId) },
    approvalWaitMs: int(e.M2_APPROVAL_WAIT_MS, 900_000),
    recordContracts: e.M2_CONTRACTS_RECORD === 'true',
    login: {
      phoneCodeId,
      deviceType: e.M2_LOGIN_DEVICE_TYPE?.trim() || 'ios',
      appVersion: e.M2_LOGIN_APP_VERSION?.trim() || '7.9.15',
      signature: signature ? new Secret(signature) : undefined,
    },
    onboardingPhotos: ONBOARDING_PHOTOS,
    onboardingUploadImage: e.M2_ONBOARDING_UPLOAD_IMAGE?.trim() || undefined,
  };
}

export function requireTestToken(config: M2Config): Secret {
  if (!config.testToken) {
    throw new M2ConfigError(
      'Missing AISLE_TEST_TOKEN — the Aisle testing token (TEST_TOKEN). Keep it in .env or a CI secret ' +
        '(see docs/setup-guide.md).',
    );
  }
  return config.testToken;
}
