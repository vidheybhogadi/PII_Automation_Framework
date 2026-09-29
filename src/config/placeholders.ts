/**
 * Dummy placeholders for values the backend team has not provided yet.
 *
 * Any setting whose value starts with `PENDING_` (e.g. `DB_HOST=PENDING_DB_HOST`) is treated exactly
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

/** A copy of `env` without placeholder values. */
export function withoutPlaceholders(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(env)) if (!isPending(v)) out[k] = v;
  return out;
}
