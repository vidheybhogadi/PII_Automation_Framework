/**
 * Dummy placeholders for values the PII backend team has not provided yet.
 *
 * Any setting whose value starts with `PENDING_` (e.g. `PII_BASE_URL=PENDING_PII_BASE_URL`) is treated exactly
 * like an unset variable: it is never sent to the service or the database, and tests that need it fail with
 * the usual "missing setting" message. The full list lives in PENDING-PLACEHOLDERS.md (npm run docs:pending).
 */
export const PENDING_PREFIX = 'PENDING_';

export const isPending = (value: unknown): boolean =>
  typeof value === 'string' && value.trim().startsWith(PENDING_PREFIX);

/** Names of the settings that still hold a placeholder, sorted. */
export function pendingSettings(env: NodeJS.ProcessEnv): string[] {
  return Object.keys(env)
    .filter((k) => isPending(env[k]))
    .sort();
}

/**
 * A copy of `env` without placeholder values. When a caller's ID is still a placeholder, that caller's key
 * settings are dropped too, so a pending caller counts as "not configured" rather than as a broken one.
 */
export function withoutPlaceholders(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(env)) if (!isPending(v)) out[k] = v;
  for (const role of ['PRIMARY', 'SECONDARY', 'LIMITED']) {
    if (isPending(env[`PII_CALLER_${role}_ID`])) {
      delete out[`PII_CALLER_${role}_PRIVATE_KEY_FILE`];
      delete out[`PII_CALLER_${role}_PRIVATE_KEY`];
    }
  }
  return out;
}
