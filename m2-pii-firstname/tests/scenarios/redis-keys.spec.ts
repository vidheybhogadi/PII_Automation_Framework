/**
 * M2 PII First Name — Redis key API cases (M2FN-RDK-xxx): GET / DELETE /admin/redis-keys?key=… (API-213 / API-214)
 * with QA’s CMS admin (login + TOTP OTP, webcms: true). Every key goes through the key guard (src/redis-keys.ts):
 * only the suite’s own synthetic accounts’ cache keys or run-unique keys that cannot exist are ever sent.
 *
 * Expected results: the quick reference (m2-pii-firstname/docs/redis-key-apis.md) and what was seen on staging on
 * 2026-11-09 (M2FNQ-01 / M2FNQ-02 answers). Assertion messages never contain a cached value.
 *
 * The m2fn-api project runs in one worker, in order (npm run m2fn:test uses --workers=1): M2FN-RDK-006 logs the
 * admin out, which resets its OTP flag for all of its sessions (it verifies the OTP again before the next test).
 */
import { expect } from '@playwright/test';
import { AUTH } from '../../../m2/src/auth/credentials';
import type { Profile } from '../../../m2/src/accounts/accounts';
import { noteEvidence } from '../../../m2/src/fixtures/m2-fixtures';
import { blockPrereq, PREREQ } from '../../../m2/src/prereq';
import { ownState } from '../../../m2/src/accounts/onboarding';
import { deepFind, INTERNALS, otherUsersView, piiFirstName } from '../../../m2/src/scenarios/helpers';
import { appDbScenario, scenario, type Fx } from '../../src/define';
import { approvedPooled } from '../../src/first-name';
import { test } from '../../src/fixtures';
import {
  absentKey,
  bodyOf,
  cacheControl,
  hasValue,
  piiFirstNameKey,
  profileKey,
  redisCall,
  redisCallRaw,
  userPattern,
  type RedisOp,
} from '../../src/redis-keys';

const OPS: RedisOp[] = ['get', 'delete'];
const NOT_FOUND = 'Redis key not found';
const BLANK_KEY = 'A non-blank string key is required';
/** Profile states the app writes to the profile cache (Fields::ProfileState, profile_state.rb:88 — from code). */
const CACHED_STATES = ['pending', 'disapproved', 'approved', 'vip_disapproved'];

function userIdOf(p: Profile): string {
  if (!p.userId || !/^\d+$/.test(p.userId)) blockPrereq(PREREQ.piiUserId.id, PREREQ.piiUserId.reason);
  return p.userId;
}

/** Read the first name through the PII read route (API-001, TEST_TOKEN) — this also fills the PII field cache. */
async function readPiiName(fx: Fx, userId: string): Promise<string> {
  const name = await piiFirstName(fx, userId);
  expect(typeof name === 'string' && name.length > 0, 'the PII read returned a first name').toBe(true);
  return name as string;
}

test.describe('M2 PII First Name — Redis key APIs', () => {
  // Onboarding a synthetic account (first use in a worker) takes longer than one API call.
  test.describe.configure({ timeout: 240_000 });

  scenario('M2FN-RDK-001', async (fx) => {
    const admin = await fx.cms.admin();
    const userId = userIdOf(await fx.accounts.onboarded(0));
    const name = await readPiiName(fx, userId);
    const key = piiFirstNameKey(userId);
    const res = await redisCall(fx, 'get', admin, key, fx.scope());
    expect(res.status, `GET the PII first-name key: HTTP ${res.status}`).toBe(200);
    const b = bodyOf(res);
    expect(b.status === true, 'status is true').toBe(true);
    expect(b.key === key, 'key is the requested key').toBe(true);
    expect(b.value === name, 'value is the plain first name the PII read returned').toBe(true);
  });

  scenario('M2FN-RDK-002', async (fx) => {
    const admin = await fx.cms.admin();
    const userId = userIdOf(await fx.accounts.throwaway('M2FN-RDK-002'));
    await readPiiName(fx, userId);
    const key = piiFirstNameKey(userId);
    try {
      const del = await redisCall(fx, 'delete', admin, key, fx.scope(), { label: 'first delete' });
      expect(del.status, `first DELETE: HTTP ${del.status}`).toBe(200);
      expect(bodyOf(del), 'first DELETE body').toEqual({ status: true, key, deleted: true });
      const get = await redisCall(fx, 'get', admin, key, fx.scope(), { label: 'after delete' });
      expect(get.status, `GET after the delete: HTTP ${get.status}`).toBe(404);
      expect(bodyOf(get), 'GET after the delete body').toEqual({ status: false, message: NOT_FOUND });
      const again = await redisCall(fx, 'delete', admin, key, fx.scope(), { label: 'second delete' });
      expect(again.status, `second DELETE: HTTP ${again.status}`).toBe(200);
      expect(bodyOf(again), 'second DELETE body').toEqual({ status: true, key, deleted: false });
    } finally {
      await piiFirstName(fx, userId); // fill the cache again (not asserted)
    }
  });

  scenario('M2FN-RDK-003', async (fx) => {
    const admin = await fx.cms.admin();
    const key = absentKey(fx.m2Config.runId, 'absent');
    const get = await redisCall(fx, 'get', admin, key, fx.scope());
    expect(get.status, `GET an absent key: HTTP ${get.status}`).toBe(404);
    expect(bodyOf(get), 'GET body').toEqual({ status: false, message: NOT_FOUND });
    const del = await redisCall(fx, 'delete', admin, key, fx.scope());
    expect(del.status, `DELETE an absent key: HTTP ${del.status}`).toBe(200);
    expect(bodyOf(del), 'DELETE body').toEqual({ status: true, key, deleted: false });
  });

  scenario('M2FN-RDK-004', async (fx) => {
    const admin = await fx.cms.admin();
    const variants: { label: string; query: Record<string, string> | undefined; documented: boolean }[] = [
      { label: 'no key parameter', query: undefined, documented: true },
      { label: 'key=""', query: { key: '' }, documented: true },
      { label: 'key="   "', query: { key: '   ' }, documented: false },
      {
        label: 'key[] (array)',
        query: { 'key[]': absentKey(fx.m2Config.runId, 'array') },
        documented: false,
      },
    ];
    for (const v of variants)
      for (const op of OPS) {
        const res = await redisCallRaw(fx, op, admin, v.query, fx.scope(), v.label);
        const what = `${op.toUpperCase()} with ${v.label}`;
        expect.soft(res.status, `${what}: HTTP ${res.status}`).toBe(400);
        const b = bodyOf(res);
        expect.soft(b.status === false, `${what}: status is false`).toBe(true);
        expect.soft(hasValue(res), `${what}: no value in the body`).toBe(false);
        if (v.documented)
          expect.soft(b, `${what}: documented 400 body (seen on staging 2026-11-09)`).toEqual({
            status: false,
            message: BLANK_KEY,
            details: [{ field: 'key', message: 'Must be a non-blank string' }],
          });
      }
  });

  scenario('M2FN-RDK-005', async (fx) => {
    const admin = await fx.cms.admin();
    const key = fx.m2fnConfig.nonStringKey;
    if (!key) blockPrereq('M2FNQ-03', 'No non-string key named by Dev yet (set M2FN_REDIS_NON_STRING_KEY)');
    const res = await redisCall(fx, 'get', admin, key, fx.scope(), { label: 'non-string key' });
    expect(res.status, `GET a non-string key: HTTP ${res.status}`).toBe(422);
    expect(hasValue(res), 'no value in the body').toBe(false);
  });

  scenario('M2FN-RDK-006', async (fx) => {
    const user = await fx.accounts.onboarded(0);
    const key = absentKey(fx.m2Config.runId, 'auth');
    const refused = async (auth: Parameters<typeof redisCall>[2], label: string) => {
      for (const op of OPS) {
        const res = await redisCall(fx, op, auth, key, fx.scope(), { label });
        expect.soft(res.status, `${op.toUpperCase()} with ${label}: HTTP ${res.status}`).toBe(401);
        expect.soft(hasValue(res), `${op.toUpperCase()} with ${label}: no value in the body`).toBe(false);
        if (label === 'admin, OTP not verified')
          expect
            .soft(
              cacheControl(res).includes('no-store'),
              `${op.toUpperCase()} with ${label}: Cache-Control no-store`,
            )
            .toBe(true);
      }
    };
    await refused(AUTH.none, 'no Authorization header');
    await refused(AUTH.user(user.token), 'app user JWT');
    await fx.cms.withUnverifiedAdmin((auth) => refused(auth, 'admin, OTP not verified'));
  });

  scenario('M2FN-RDK-007', async (fx) => {
    const associate = await fx.cms.associate();
    const key = absentKey(fx.m2Config.runId, 'associate');
    for (const op of OPS) {
      const res = await redisCall(fx, op, associate, key, fx.scope(), { label: 'associate' });
      const what = `${op.toUpperCase()} with the associate`;
      expect.soft(res.status, `${what}: HTTP ${res.status}`).toBe(401);
      expect.soft(hasValue(res), `${what}: no value in the body`).toBe(false);
      expect
        .soft(
          cacheControl(res).includes('no-store'),
          `${what}: stopped before the response headers (no no-store)`,
        )
        .toBe(false);
      noteEvidence(
        `${what}: body ${res.rawText().trim() ? 'not empty' : 'empty'}; Cache-Control "${cacheControl(res)}"`,
      );
    }
  });

  scenario('M2FN-RDK-008', async (fx) => {
    const admin = await fx.cms.admin();
    const userId = userIdOf(await fx.accounts.throwaway('M2FN-RDK-008'));
    const name = await readPiiName(fx, userId);
    const key = piiFirstNameKey(userId);
    const pattern = userPattern(userId);
    try {
      const del = await redisCall(fx, 'delete', admin, pattern, fx.scope(), {
        pattern: true,
        label: 'pattern',
      });
      expect(del.status, `DELETE the pattern key: HTTP ${del.status}`).toBe(200);
      expect(bodyOf(del), 'DELETE the pattern key body').toEqual({
        status: true,
        key: pattern,
        deleted: false,
      });
      const get = await redisCall(fx, 'get', admin, key, fx.scope(), {
        label: 'real key after pattern delete',
      });
      expect(get.status, `GET the real key afterwards: HTTP ${get.status}`).toBe(200);
      expect(bodyOf(get).value === name, 'the real key still holds the first name').toBe(true);
    } finally {
      await piiFirstName(fx, userId); // refill in case a wrong expansion removed it (not asserted)
    }
  });

  scenario('M2FN-RDK-010', async (fx) => {
    if (!fx.m2fnConfig.redisOutageWindow)
      blockPrereq(
        'M2FNQ-04',
        'Needs a Dev-agreed Redis outage window (set M2FN_REDIS_OUTAGE_WINDOW=true during it)',
      );
    const admin = await fx.cms.admin();
    const key = absentKey(fx.m2Config.runId, 'outage');
    for (const op of OPS) {
      const res = await redisCall(fx, op, admin, key, fx.scope(), { label: 'Redis down' });
      const what = `${op.toUpperCase()} while Redis is down`;
      expect.soft(res.status, `${what}: HTTP ${res.status}`).toBe(503);
      expect.soft(hasValue(res), `${what}: no value in the body`).toBe(false);
      expect.soft(INTERNALS.test(res.rawText()), `${what}: no stack trace or file path`).toBe(false);
      noteEvidence(
        `${what}: body keys ${Object.keys(bodyOf(res)).join(', ') || '(none)'} (M2FNQ-04: body to confirm)`,
      );
    }
  });

  scenario('M2FN-RDK-011', async (fx) => {
    const admin = await fx.cms.admin();
    const userId = userIdOf(await fx.accounts.onboarded(0));
    const name = await readPiiName(fx, userId);
    const res = await redisCall(fx, 'get', admin, piiFirstNameKey(userId), fx.scope(), {
      label: 'decrypted name',
    });
    expect(res.status, `GET the PII key: HTTP ${res.status}`).toBe(200);
    expect(bodyOf(res).value === name, 'the plain synthetic first name is returned').toBe(true);
    expect(
      cacheControl(res).includes('no-store'),
      'Cache-Control: no-store (from code — confirm with Dev)',
    ).toBe(true);
    noteEvidence(
      'M2FNQ-05 (scope) is open: a permitted admin can read this decrypted name — recorded for Dev, not judged here.',
    );
  });
  // Last in the file: it approves the pooled account onboarded by the first test (CMS, M2FNQ-07).
  appDbScenario('M2FN-RDK-009', async (fx, app) => {
    const admin = await fx.cms.admin();
    // A new profile is pending_not_verified, which the app does not cache; staging auto-approval is not running, so
    // the suite approves its own account through the CMS (M2FNQ-07 answer, QA lead 2026-11-11).
    const p = await approvedPooled(fx, 0);
    const userId = userIdOf(p);
    if (!p.ref) blockPrereq(PREREQ.onboarding.id, 'The synthetic account has no profile ref');
    const state = (await ownState(fx.accounts.sessions, p)).profileState;
    if (!state || !CACHED_STATES.includes(state))
      blockPrereq(
        PREREQ.states.id,
        `The app caches only ${CACHED_STATES.join(' / ')} profiles (from code, profile_state.rb:88); the synthetic profile is ${state ?? 'unknown'}`,
      );
    const keys = { pii: piiFirstNameKey(userId), profile: profileKey(p.ref) };
    for (const [label, key] of Object.entries(keys)) {
      const del = await redisCall(fx, 'delete', admin, key, fx.scope(), { label: `clear ${label} cache` });
      expect(del.status, `DELETE the ${label} cache key: HTTP ${del.status}`).toBe(200);
      const miss = await redisCall(fx, 'get', admin, key, fx.scope(), {
        label: `${label} cache after clear`,
      });
      expect(miss.status, `GET the ${label} cache key after the delete: HTTP ${miss.status}`).toBe(404);
    }
    // profile_info (API-011) fills the profile cache; the own-profile route API-021 does not (seen 2026-11-09).
    const profileName = await otherUsersView(fx, p, p);
    const piiName = await readPiiName(fx, userId);
    expect(profileName === piiName, 'read gate ON: the profile shows the PII first name').toBe(true);

    const pii = await redisCall(fx, 'get', admin, keys.pii, fx.scope(), { label: 'pii cache after reads' });
    expect(pii.status, `GET the PII key after the reads: HTTP ${pii.status}`).toBe(200);
    expect(bodyOf(pii).value === piiName, 'the PII key holds the PII first name').toBe(true);

    const prof = await redisCall(fx, 'get', admin, keys.profile, fx.scope(), {
      label: 'profile cache after reads',
    });
    expect(prof.status, `GET the profile cache key after the profile read: HTTP ${prof.status}`).toBe(200);
    const raw = bodyOf(prof).value;
    let cached: unknown;
    try {
      cached = typeof raw === 'string' ? JSON.parse(raw) : undefined;
    } catch {
      cached = undefined;
    }
    expect(cached !== undefined, 'the profile cache holds a JSON string').toBe(true);
    expect(
      deepFind(cached, 'first_name') === profileName,
      'the profile cache holds the profile’s first name',
    ).toBe(true);

    const rows = await app.query<{ user_id: string; first_name_is_value: boolean }>(
      'm2fnProfileFirstNameIs',
      [[userId], piiName],
      fx.accounts.ownDbIds(),
    );
    expect(rows.length, 'one profiles row for the suite account').toBe(1);
    expect(
      rows[0]!.first_name_is_value === true,
      'Aisle DB profiles.first_name equals the PII first name',
    ).toBe(true);
  });
});
