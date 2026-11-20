/**
 * Settings of the M2 PII First Name suite (on top of the Milestone 2 settings it reuses: base URL, TEST_TOKEN,
 * synthetic accounts, DB). Names only are documented in .env.example; values live in .env / CI secrets.
 *
 * - M2FN_CMS_ADMIN_EMAIL / M2FN_CMS_ADMIN_PASSWORD / M2FN_CMS_ADMIN_TOTP_SECRET — QA’s CMS admin with the Redis
 *   permission; the TOTP secret makes the CMS OTP (POST /admin/authenticate_rotp) in code.
 * - M2FN_CMS_ASSOCIATE_EMAIL / M2FN_CMS_ASSOCIATE_PASSWORD — QA’s associate CMS login (no Redis permission).
 * - M2FN_REDIS_NON_STRING_KEY — the one non-string key Dev names for the 422 case (M2FNQ-03), read only.
 * - M2FN_REDIS_OUTAGE_WINDOW=true — only during a Dev-agreed Redis outage window (M2FNQ-04).
 * - M2FN_FLAG_WINDOW=read_off | write_off — only while Dev has switched that first-name gate off on testa2 (M2FNQ-08).
 *   QA never changes the flags and never touches AISLE_staging_configuration_constant.
 * - M2FN_PII_OUTAGE_WINDOW=true — only during a Dev-agreed PII-service error window for Aisle (M2FNQ-09).
 * - M2FN_BATCH_ACCOUNTS=true — opt-in: M2FN-LST-002 creates 51 synthetic accounts (M2FNQ-30). Off by default.
 *
 * Every password, secret and email is registered with the scrubber, so reports and logs show only its placeholder.
 */
import { registerSecretValue } from '../../core/utils/redaction';
import { Secret } from '../../core/utils/secret';

export interface CmsLogin {
  readonly email: Secret;
  readonly password: Secret;
}

export interface M2fnConfig {
  readonly admin: (CmsLogin & { readonly totpSecret: Secret }) | undefined;
  readonly associate: CmsLogin | undefined;
  readonly nonStringKey: string | undefined;
  readonly redisOutageWindow: boolean;
  /** Which first-name gate Dev has switched off right now (M2FNQ-08), if any. */
  readonly flagWindow: 'read_off' | 'write_off' | undefined;
  readonly piiOutageWindow: boolean;
  readonly batchAccounts: boolean;
}

function secret(env: NodeJS.ProcessEnv, name: string): Secret | undefined {
  const v = env[name]?.trim();
  if (!v) return undefined;
  registerSecretValue(v, `$${name}`);
  return new Secret(v);
}

export function loadM2fnConfig(env: NodeJS.ProcessEnv = process.env): M2fnConfig {
  const adminEmail = secret(env, 'M2FN_CMS_ADMIN_EMAIL');
  const adminPassword = secret(env, 'M2FN_CMS_ADMIN_PASSWORD');
  const totpSecret = secret(env, 'M2FN_CMS_ADMIN_TOTP_SECRET');
  const assocEmail = secret(env, 'M2FN_CMS_ASSOCIATE_EMAIL');
  const assocPassword = secret(env, 'M2FN_CMS_ASSOCIATE_PASSWORD');
  return {
    admin:
      adminEmail && adminPassword && totpSecret
        ? { email: adminEmail, password: adminPassword, totpSecret }
        : undefined,
    associate: assocEmail && assocPassword ? { email: assocEmail, password: assocPassword } : undefined,
    nonStringKey: env.M2FN_REDIS_NON_STRING_KEY?.trim() || undefined,
    redisOutageWindow: env.M2FN_REDIS_OUTAGE_WINDOW === 'true',
    flagWindow:
      env.M2FN_FLAG_WINDOW === 'read_off' || env.M2FN_FLAG_WINDOW === 'write_off'
        ? env.M2FN_FLAG_WINDOW
        : undefined,
    piiOutageWindow: env.M2FN_PII_OUTAGE_WINDOW === 'true',
    batchAccounts: env.M2FN_BATCH_ACCOUNTS === 'true',
  };
}
