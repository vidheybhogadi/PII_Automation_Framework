/**
 * Settings of the vernac first-name cases (names only in .env.example; values in .env):
 *
 * - M2FN_VN_RUN=true — opt-in switch: without it, every case that writes on a team account (rename, hide toggle,
 *   selfie mark, CMS edit) is Blocked with that reason. Read-only cases run without it.
 * - M2FN_VN_BASE_URL — default https://testapp.koode.co (the guard refuses any other host).
 * - M2FN_VN_APPS — comma list, default Arike,Anbe,Neetho,Neene (HeyDil is always refused).
 * - M2FN_VN_DB_NAME — the vernac app DB, default desiapp_production (vernac TEST data; QA lead 2026-11-11), on the
 *   server of .env DB_*; M2FN_VN_PII_DB_NAME — the PII DB, default pii. Read-only, suite users only.
 * - M2FN_VN_CMS_ADMIN_EMAIL / _PASSWORD / _TOTP_SECRET, M2FN_VN_CMS_ASSOCIATE_EMAIL / _PASSWORD — vernac CMS logins.
 * - M2FN_VN_REDIS_ENV (default staging) / M2FN_VN_PII_CALLER_ID (default desiapp-rails) — key name parts, seen on
 *   staging 2026-11-11 (M2FNQ-33).
 * - M2FN_VN_FLAG_WINDOW=<App>:read_off | <App>:write_off and M2FN_VN_PII_OUTAGE_WINDOW=<App> — only during a
 *   Dev-agreed window (M2FNQ-47). QA never changes app_features.
 */
import { registerSecretValue } from '../../../core/utils/redaction';
import { Secret } from '../../../core/utils/secret';
import { isVnApp, VN_APP_NAMES, VN_HOST, type VnApp } from './guard';

export interface VnLogin {
  readonly email: Secret;
  readonly password: Secret;
}

export interface VnConfig {
  readonly run: boolean;
  readonly baseUrl: string;
  readonly apps: VnApp[];
  readonly dbName: string;
  readonly piiDbName: string;
  readonly redisEnv: string;
  readonly piiCallerId: string;
  readonly admin: (VnLogin & { readonly totpSecret: Secret }) | undefined;
  readonly associate: VnLogin | undefined;
  readonly flagWindow: { app: VnApp; mode: 'read_off' | 'write_off' } | undefined;
  readonly piiOutageApp: VnApp | undefined;
}

function secret(env: NodeJS.ProcessEnv, name: string): Secret | undefined {
  const v = env[name]?.trim();
  if (!v) return undefined;
  registerSecretValue(v, `$${name}`);
  return new Secret(v);
}

export function loadVnConfig(env: NodeJS.ProcessEnv = process.env): VnConfig {
  const adminEmail = secret(env, 'M2FN_VN_CMS_ADMIN_EMAIL');
  const adminPassword = secret(env, 'M2FN_VN_CMS_ADMIN_PASSWORD');
  const totpSecret = secret(env, 'M2FN_VN_CMS_ADMIN_TOTP_SECRET');
  const assocEmail = secret(env, 'M2FN_VN_CMS_ASSOCIATE_EMAIL');
  const assocPassword = secret(env, 'M2FN_VN_CMS_ASSOCIATE_PASSWORD');
  const apps = (env.M2FN_VN_APPS ?? VN_APP_NAMES.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(isVnApp);
  const fw = /^([A-Za-z]+):(read_off|write_off)$/.exec(env.M2FN_VN_FLAG_WINDOW?.trim() ?? '');
  const outage = env.M2FN_VN_PII_OUTAGE_WINDOW?.trim();
  return {
    run: env.M2FN_VN_RUN === 'true',
    baseUrl: (env.M2FN_VN_BASE_URL?.trim() || VN_HOST).replace(/\/+$/, ''),
    apps: apps.length ? apps : [...VN_APP_NAMES],
    dbName: env.M2FN_VN_DB_NAME?.trim() || 'desiapp_production',
    piiDbName: env.M2FN_VN_PII_DB_NAME?.trim() || 'pii',
    redisEnv: env.M2FN_VN_REDIS_ENV?.trim() || 'staging',
    piiCallerId: env.M2FN_VN_PII_CALLER_ID?.trim() || 'desiapp-rails',
    admin:
      adminEmail && adminPassword && totpSecret
        ? { email: adminEmail, password: adminPassword, totpSecret }
        : undefined,
    associate: assocEmail && assocPassword ? { email: assocEmail, password: assocPassword } : undefined,
    flagWindow: fw && isVnApp(fw[1]) ? { app: fw[1], mode: fw[2] as 'read_off' | 'write_off' } : undefined,
    piiOutageApp: isVnApp(outage) ? outage : undefined,
  };
}
