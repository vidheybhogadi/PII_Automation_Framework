/**
 * Runtime prerequisite gates. A case whose design is runnable can still lack something only the environment can
 * give (an onboarded account, a CMS admin, the PII DB, an approved contract baseline, a Dev test window). Then the
 * test is marked BLOCKED with the question that would unblock it and a plain reason — never a pass, never a failure.
 */
import { test } from '@playwright/test';

/** Mark the running test BLOCKED (annotation "blocked" → report status Blocked) and stop it. */
export function blockPrereq(questionId: string, reason: string): never {
  test.info().annotations.push({ type: 'blocked', description: `${questionId}: ${reason}` });
  test.skip(true, `BLOCKED (${questionId}): ${reason}`);
  throw new Error('unreachable'); // test.skip throws; keeps the type `never`
}

/** Reasons reused across checks, so reports read the same everywhere. */
export const PREREQ = {
  createAccounts: {
    id: 'M2_CREATE_ACCOUNTS',
    reason:
      'Creating synthetic staging accounts is switched off — set M2_CREATE_ACCOUNTS=true to run this case (accounts are tracked in reports/m2/accounts/)',
  },
  onboarding: {
    id: 'M2Q-36',
    reason:
      'An onboarded synthetic account is needed (M2_CREATE_ACCOUNTS=true onboards one, or set M2_ONBOARDED_ACCOUNTS)',
  },
  moderation: {
    id: 'M2Q-36',
    reason: 'Moderation flagged the synthetic profile (open sub-question of M2Q-36)',
  },
  connected: {
    id: 'M2Q-32',
    reason:
      'Two connected (matched) synthetic accounts are needed — set M2_CONNECTED_ACCOUNTS=<numberA>,<numberB>, or M2_CREATE_ACCOUNTS=true so the suite connects its own accounts by a mutual like',
  },
  approval: {
    id: 'M2Q-32',
    reason:
      'Needs an APPROVED synthetic profile — staging did not auto-approve the suite account in time (approval took 8–20 min in run qa-m2-20261024t134344; window from onboarding: M2_APPROVAL_WAIT_MS, default 15 min)',
  },
  devOnly: {
    id: 'M2Q-45',
    reason:
      'Kept Blocked by the QA lead (2026-10-24): selfie verification and moderation reports are not run from QA accounts until Dev agrees',
  },
  paused: {
    id: 'M2Q-46',
    reason:
      'Paused by the QA lead (2026-10-24) until Dev confirms M2Q-46 — delete_older_account / delete_current_account act on the profile named by ref, and a missing ref fell back to an arbitrary staging member',
  },
  unsafeVariants: {
    id: 'M2Q-46',
    reason:
      'Every variant of this case would remove or blank a target / phone key — not sent (unsafe: would act on an unknown member)',
  },
  web: {
    id: 'M2Q-17',
    reason:
      'Needs a true web JWT (login with device_type "web", from code) — only the payment routes use it, and they need a provider sandbox',
  },
  admin: {
    id: 'M2Q-04',
    reason: 'No CMS test admin (admin JWT + webcms OTP / session cookie) available yet',
  },
  infoedge: { id: 'M2Q-19', reason: 'No INFOEDGE_PROFILE_API_TOKEN for QA yet' },
  provider: { id: 'M2Q-17', reason: 'Needs provider sandbox / genuine signed callback payloads from Dev' },
  db: { id: 'M2Q-16', reason: 'PII DB access not configured here (DB_ENGINE / DB_* settings)' },
  piiUserId: {
    id: 'M2Q-37',
    reason:
      'No app user id to look up in the PII DB (PII user_id = app user id, from code; M2_PII_USER_ID_SOURCE=none disables)',
  },
  dbUnreachable: {
    id: 'M2Q-16',
    reason:
      'The PII DB is configured but not reachable from this machine (a read-only SELECT 1 failed) — check VPN / network',
  },
  states: {
    id: 'M2Q-32',
    reason:
      'Needs a special account state QA cannot create yet (e.g. verified selfie, image-inappropriate profile)',
  },
  outage: {
    id: 'M2Q-10',
    reason: 'Needs an approved PII-service failure window from Dev (set M2_PII_OUTAGE_WINDOW=true)',
  },
  baseline: {
    id: 'M2Q-24',
    reason: 'No approved contract baseline for this case yet (npm run m2:contracts:record, review, approve)',
  },
  webJwt: {
    id: 'M2Q-41',
    reason:
      'Staging issued no web JWT (verify_number_login_v1 with device_type "web" for an onboarded synthetic account) — the wrong-type credential of this TOKEN check is missing',
  },
  /** Audit fix 2026-10-25 (IDOR): nothing of B's can be put into a request that names no user / profile id. */
  noTarget: {
    id: 'M2-NO-TARGET',
    reason:
      'no target in request — the Dev request names no user / profile id (REF, USER_ID, OTHER_*), so B’s identifiers cannot be sent; an IDOR check on other ids (conversation, request) needs its own design',
  },
  /** Audit fix 2026-10-25 (STATE): a status that is the same for every variant proves nothing. */
  statusOnly: {
    id: 'M2-STATUS-ONLY',
    reason:
      'non-discriminating — every variant got the same status and the valid request changed nothing observable in the caller’s or the target’s own view, so "already done" / "wrong target" cannot be told from success',
  },
} as const;
