/**
 * Pure decision helpers of the per-API runners (audit fixes 2026-10-25), kept separate so the unit self-tests can
 * prove them without staging (UT-M2-029 … UT-M2-033). Every result names keys / labels only — never values.
 */
import { viewDiff, type OwnView } from './own-view';

/**
 * IDOR: the request must carry an id that can name another user — REF, USER_ID or any OTHER_* placeholder. Without
 * one, nothing of B's can be put into the request and the case must not pass.
 */
export const hasIdorTarget = (placeholders: readonly string[]) =>
  placeholders.some((n) => n === 'REF' || n === 'USER_ID' || n.startsWith('OTHER_'));

/**
 * EXPOSE: whether a reply shows the account at all — its ref or app user id as a value (string or number) or as a
 * key of an id-keyed map; its ref INSIDE a text value (item 2, 2026-10-25: generate_agora_token's channel_name
 * "channel_<B ref>_<A ref>"); or its current first name inside a text value (video_call_message names A). Without
 * it, "A's email / phone not in the reply" proves nothing. User ids are matched exactly (digits occur in many values).
 */
export function mentionsAccount(
  body: unknown,
  p: { ref?: string | undefined; userId?: string | undefined; firstName?: string | undefined },
): boolean {
  const ids = [p.ref, p.userId].filter((x): x is string => Boolean(x));
  const inText = [p.ref, p.firstName].filter(
    (x): x is string => typeof x === 'string' && x.trim().length >= 3,
  );
  if (!ids.length && !inText.length) return false;
  const walk = (v: unknown): boolean => {
    if (typeof v === 'number') return ids.includes(String(v));
    if (typeof v === 'string') return ids.includes(v) || inText.some((t) => v.includes(t));
    if (Array.isArray(v)) return v.some(walk);
    if (v && typeof v === 'object')
      return Object.entries(v as Record<string, unknown>).some(([k, x]) => ids.includes(k) || walk(x));
    return false;
  };
  return walk(body);
}

/** A reply that carries only a status flag / message (e.g. {status: true}) — no data to compare. */
export function isStatusOnlyReply(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const keys = Object.keys(body as object);
  return keys.length > 0 && keys.every((k) => ['status', 'success', 'message'].includes(k));
}

/** Several users' views as one (keys prefixed with the role, e.g. "caller.profile_state", "target.status"). */
export function combineViews(parts: Record<string, OwnView | undefined>): OwnView {
  const view: Record<string, unknown> = {};
  for (const [role, v] of Object.entries(parts)) {
    if (!v) continue;
    view[`${role}.status`] = v.status;
    for (const [k, x] of Object.entries(v.view)) view[`${role}.${k}`] = x;
  }
  return { status: 0, view };
}

export interface StateViews {
  before: OwnView;
  afterValid: OwnView;
  afterAgain: OwnView;
  afterWrong: OwnView;
}

export interface StateVerdict {
  /** Keys the valid request changed (its observable effect). */
  effect: string[];
  /** Value-free failure texts. */
  failures: string[];
  /** No observable effect AND every variant answered the same status: the status proves nothing. */
  nonDiscriminating: boolean;
}

/**
 * STATE by state, not by status:
 * - "action already done (sent again)" must not change anything more than the valid request did — for a TOGGLE the
 *   second send flips the setting back, so the views must equal the start;
 * - "wrong target (unknown ids)" must change nothing at all.
 */
export function stateVerdict(
  v: StateViews,
  statuses: readonly number[],
  toggle: boolean,
  /** A target-less toggle: "wrong target" is the same request a third time and flips the setting again. */
  wrongFlipsAgain = false,
): StateVerdict {
  const effect = viewDiff(v.before, v.afterValid);
  const failures: string[] = [];
  const again = viewDiff(toggle ? v.before : v.afterValid, v.afterAgain);
  if (again.length)
    failures.push(
      toggle
        ? `toggle sent twice did not return to the start (changed: ${again.join(', ')})`
        : `"action already done" changed state again (changed: ${again.join(', ')})`,
    );
  const wrong = viewDiff(wrongFlipsAgain ? v.afterValid : v.afterAgain, v.afterWrong);
  if (wrong.length)
    failures.push(
      wrongFlipsAgain
        ? `toggle sent a third time did not flip like the first (changed: ${wrong.join(', ')})`
        : `"wrong target" changed state (changed: ${wrong.join(', ')})`,
    );
  const nonDiscriminating = effect.length === 0 && new Set(statuses).size <= 1;
  return { effect, failures, nonDiscriminating };
}
