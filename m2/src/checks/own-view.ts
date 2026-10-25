/**
 * A user's own view for "nothing changed" and "what changed" checks (audit fix 2026-10-25).
 *
 * The old check compared only status + first_name + stage, so a route that changed has_selected_mbti (API-039
 * PARAM) or deleted the bio (API-022 PARAM) still passed. The view is now the WHOLE own-profile reply
 * (fetch_own_info for profiles, verify_user for new accounts) minus fields that change on their own, plus the own
 * about / story text from GET /V1/users/:ref.
 *
 * Pure helpers only (unit-tested in UT-M2-030); the calls live in per-api.ts. Diffs name KEYS only, never values.
 */

/** Keys that change without any action of the caller: timers, server texts / messages, pop-up flags, catalogues. */
export const VOLATILE_KEYS: readonly RegExp[] = [
  /timer/,
  /_time$/,
  /message/,
  /_text$/,
  /popup|pop_up/,
  /^show_/,
  /^success_stories$/,
  /^icebreaker_questions$/,
  /^zendesk_url$/,
  /^is_boost_active$/,
  /refresh/,
];

/**
 * Counters other members (or the daily reset) can change: likes / invites / connections counts and the daily
 * allowances. Left out of the "own profile unchanged" view; KEPT in the state view (STATE checks need them).
 */
export const COUNT_KEYS: readonly RegExp[] = [/^daily_.*_left$/, /_count$/];

/** Keys the "unchanged" view must always carry when the reply has them (audit: these were missed before). */
export const REQUIRED_VIEW_KEYS = [
  'profile_state',
  'has_selected_mbti',
  'percentage_profile_complete',
  'hide_first_name',
  'verification_status',
] as const;

/** Name of the extra key that holds the own about / story text (GET /V1/users/:ref → user.about). */
export const ABOUT_KEY = 'about (GET /V1/users/:ref)';

const isVolatile = (k: string, keepCounts: boolean) =>
  VOLATILE_KEYS.some((re) => re.test(k)) || (!keepCounts && COUNT_KEYS.some((re) => re.test(k)));

/**
 * Normalise a value for comparison: URL query strings dropped (signed image URLs change per request), lists sorted
 * (the server returns e.g. preferences in a random order — staging 2026-10-25), object keys sorted.
 */
export function normalizeValue(v: unknown): unknown {
  if (typeof v === 'string') return /^https?:\/\//.test(v) ? v.split('?')[0] : v;
  if (Array.isArray(v))
    return v
      .map(normalizeValue)
      .map((x) => [JSON.stringify(x), x] as const)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, x]) => x);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.keys(v as object)
        .sort()
        .map((k) => [k, normalizeValue((v as Record<string, unknown>)[k])]),
    );
  return v;
}

/**
 * The comparable part of an own-profile reply: every top-level key except the volatile ones (and the counters,
 * unless `keepCounts`), values normalised. A reply that is not a JSON object gives {}.
 */
export function stableView(body: unknown, opts: { keepCounts?: boolean } = {}): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>))
    if (!isVolatile(k, Boolean(opts.keepCounts))) out[k] = normalizeValue(v);
  return out;
}

/** A user's own view: HTTP status of the own-profile read plus its stable keys (and the about text, if read). */
export interface OwnView {
  status: number;
  view: Record<string, unknown>;
}

/** Keys whose value differs between two views ("status" when the read status changed). Names only. */
export function viewDiff(before: OwnView, after: OwnView): string[] {
  const out: string[] = [];
  if (before.status !== after.status) out.push('status');
  for (const k of [...new Set([...Object.keys(before.view), ...Object.keys(after.view)])].sort())
    if (JSON.stringify(before.view[k]) !== JSON.stringify(after.view[k])) out.push(k);
  return out;
}

/** The about / story text of an own GET /V1/users/:ref reply (user.about), or null. */
export function aboutOf(body: unknown): unknown {
  const user = (body as { user?: unknown } | undefined)?.user;
  if (!user || typeof user !== 'object') return null;
  return (user as { about?: unknown }).about ?? null;
}
