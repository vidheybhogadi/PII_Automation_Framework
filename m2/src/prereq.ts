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
      'Two connected (matched) synthetic accounts are needed — matching needs approved, discoverable profiles; set M2_CONNECTED_ACCOUNTS=<numberA>,<numberB>',
  },
  web: {
    id: 'M2Q-41',
    reason: 'How a web JWT (WEB_TOKEN) is issued is unknown (the UI team has no web app)',
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
      'Unknown which PII user_id the app uses for an app user (set M2_PII_USER_ID_SOURCE=app-id once Dev confirms)',
  },
  states: {
    id: 'M2Q-32',
    reason:
      'Needs a special account state QA cannot create (verified selfie / unmigrated / deactivated profile)',
  },
  gateWindow: {
    id: 'M2Q-02',
    reason: 'Needs a Dev window that switches the PII read gates (set M2_GATE_WINDOW=off|on)',
  },
  outage: {
    id: 'M2Q-10',
    reason: 'Needs an approved PII-service failure window from Dev (set M2_PII_OUTAGE_WINDOW=true)',
  },
  baseline: {
    id: 'M2Q-24',
    reason: 'No approved contract baseline for this case yet (npm run m2:contracts:record, review, approve)',
  },
} as const;
