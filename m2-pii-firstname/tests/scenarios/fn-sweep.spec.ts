/**
 * M2FN-SWP-001 — the sweep: one test per callable Aisle / Aisle CMS inventory row that has no deep case of its own
 * (m2-pii-firstname/scripts/m2fn-sweep.ts). Each calls the row’s API with the Dev request shape for (or as) the
 * divergent synthetic user D (Aisle-DB name X, PII name Y) and checks that the name it returns is Y — never X.
 * Write rows write a new run-unique fake name and compare the PII read, the Aisle DB and the reply.
 *
 * Rows that cannot be called are listed (with their reason) on the workbook’s "Sweep Rows" sheet, not as tests.
 * A 4xx reply, a reply without a first name, or a relation the suite cannot make blocks that row with the reason —
 * never a pass. A 5xx reply fails.
 */
import { expect } from '@playwright/test';
import type { ApiResponse } from '../../../core/http/api-response';
import type { Profile } from '../../../m2/src/accounts/accounts';
import { AUTH } from '../../../m2/src/auth/credentials';
import { valuesFor, type Caller } from '../../../m2/src/checks/context';
import { blockPrereq } from '../../../m2/src/prereq';
import { asTestToken, asUser, call, deepFind } from '../../../m2/src/scenarios/helpers';
import { fnRows } from '../../scripts/m2fn-design';
import { RELATION_BLOCK, SWEEP, type SweepRow } from '../../scripts/m2fn-sweep';
import { rowScenario, type Fx } from '../../src/define';
import {
  adminCaller,
  approveOwn,
  approvedPooled,
  connect,
  divergent,
  expectDbName,
  nameOfRef,
  piiRead,
  record,
  refFor,
  ROUTES,
  uniqueName,
  userIdOf,
  type Divergent,
} from '../../src/first-name';
import { test } from '../../src/fixtures';

const ROWS = new Map(fnRows().map((r) => [r.id, r]));
const BLOCK = 'M2FN-SWEEP';

// Per worker: the approved pair and the relations already made (likes / connection).
const made = new Map<string, Promise<unknown>>();
const once = <T>(key: string, make: () => Promise<T>): Promise<T> => {
  let p = made.get(key) as Promise<T> | undefined;
  if (!p) {
    p = make();
    made.set(key, p);
    p.catch(() => made.delete(key));
  }
  return p;
};

async function webCaller(fx: Fx, p: Profile, about?: Profile): Promise<Caller> {
  const token = await once(`web:${p.mobileNumber}`, () => fx.accounts.sessions.webToken(p));
  if (!token) blockPrereq(BLOCK, 'Staging issued no web token for the synthetic account');
  return { ...asUser(fx, p, about, 'web'), auth: AUTH.web(token) };
}

/** Values that point the Dev request at D (the profile the row is about). */
const aboutD = (fx: Fx, viewer: Profile | undefined, d: Divergent) => ({
  ...valuesFor(fx.m2Config, viewer, d.p),
  REF: refFor(d.p),
  OTHER_REF: refFor(d.p),
});

function judge(res: ApiResponse, shown: unknown, d: Divergent, what: string): void {
  expect(res.status, `${what}: HTTP ${res.status} (server error)`).toBeLessThan(500);
  if (res.status >= 300)
    blockPrereq(BLOCK, `${what} answered HTTP ${res.status} for the synthetic caller — name not observable`);
  if (shown === undefined) blockPrereq(BLOCK, `${what}: the reply carries no first name of D`);
  expect(shown !== d.x, `${what}: not the Aisle-DB name X`).toBe(true);
  expect(shown === d.y, `${what}: the PII name Y`).toBe(true);
}

async function sendRow(
  fx: Fx,
  s: SweepRow,
  caller: Caller,
  extra: Parameters<typeof call>[3] = {},
): Promise<ApiResponse> {
  if (s.api) return call(fx, s.api, caller, extra);
  const [method, path] = s.route!;
  const res = await fx.m2.callRoute(
    {
      key: s.row,
      method: method as 'GET',
      path,
      headers: ['device_type', 'app_version', 'unique_identifier'],
    },
    {
      auth: caller.auth,
      ...(caller.device ? { device: caller.device } : {}),
      retry: false,
      ...(method === 'GET' ? {} : { body: {} }),
    },
  );
  fx.observe(`${s.row} ${caller.label}`, res);
  return res;
}

async function runRow(fx: Fx, s: SweepRow): Promise<void> {
  const what = `${s.row} (${s.api ?? s.route?.join(' ')})`;
  // ---- Write rows: own throwaway, new run-unique name -----------------------------------------------------------
  if (s.how === 'write') {
    const z = uniqueName(fx, 'Zk');
    let p: Profile;
    let res: ApiResponse;
    if (s.api === 'API-057') {
      // Onboarding IS the submit_profile write under test.
      p = await fx.accounts.onboardFresh({
        firstName: z,
        email: `${fx.m2Config.runId}-swp-${Date.now() % 100000}@${(process.env.AISLE_TEST_EMAIL_DOMAIN || 'example.test').toLowerCase()}`,
      });
      const pii = await piiRead(fx, userIdOf(p));
      expect(pii.name === z, `${what}: PII holds the onboarding name`).toBe(true);
      await expectDbName(fx, userIdOf(p), z, `${what}: Aisle DB holds the onboarding name`);
      return;
    }
    if (s.api === 'API-061')
      blockPrereq(
        BLOCK,
        `${what}: writes only for a brand-new web account without a profile — the web onboarding flow is not part of the suite`,
      );
    p = await fx.accounts.throwaway(`M2FN-SWP-W-${s.row}`);
    if (s.api === 'API-002')
      res = await call(fx, s.api, asTestToken(fx), { body: { user_id: userIdOf(p), first_name: z } });
    else if (s.api === 'API-130' || s.api === 'API-129')
      res = await call(fx, s.api, await webCaller(fx, p), { synthetic: { firstName: z } });
    else res = await call(fx, s.api!, asUser(fx, p, undefined, 'owner'), { synthetic: { firstName: z } });
    expect(res.status, `${what}: HTTP ${res.status} (server error)`).toBeLessThan(500);
    if (res.status >= 300) blockPrereq(BLOCK, `${what} answered HTTP ${res.status} for the synthetic caller`);
    const pii = (await piiRead(fx, userIdOf(p))).name;
    if (s.api === 'API-129') {
      record(
        `${what}: web submit on an existing profile ${pii === z ? 'changed' : 'did not change'} the name (code: only when it has none)`,
      );
      return;
    }
    expect(pii === z, `${what}: PII holds the new name`).toBe(true);
    await expectDbName(fx, userIdOf(p), z, `${what}: Aisle DB holds the new name`);
    const replied = deepFind(res.json(), 'first_name');
    if (replied !== undefined) expect.soft(replied === z, `${what}: the reply shows the new name`).toBe(true);
    return;
  }

  // ---- Read rows ---------------------------------------------------------------------------------------------
  const approved = s.cls === 'approved';
  const d = approved
    ? await (async () => {
        const dd = await divergent(fx, 'M2FN-SWP-DA');
        await once(`approved:${dd.p.mobileNumber}`, () => approveOwn(fx, dd.p));
        return dd;
      })()
    : await divergent(fx, 'M2FN-SWP-D');
  const a = approved ? await approvedPooled(fx, 0) : await fx.accounts.onboarded(0);
  if (approved && s.relation) {
    if (s.relation === 'like' || s.relation === 'connection')
      await once(`like:${d.p.mobileNumber}`, () =>
        call(fx, 'API-046', asUser(fx, d.p, a, 'D'), { body: { ref: refFor(a) } }),
      );
    if (s.relation === 'connection') await once(`conn:${d.p.mobileNumber}`, () => connect(fx, a, d.p));
  }
  const listed = (res: ApiResponse) => {
    const v = nameOfRef(res.json(), d.p.ref);
    if (v === undefined && approved && s.relation && RELATION_BLOCK[s.relation])
      blockPrereq(BLOCK, `${what}: ${RELATION_BLOCK[s.relation]}`);
    if (v === undefined && approved)
      blockPrereq(BLOCK, `${what}: D is not listed in A’s reply (relation ${s.relation})`);
    return v;
  };
  switch (s.how) {
    case 'own': {
      const res = await sendRow(fx, s, asUser(fx, d.p, a, 'D'));
      return judge(res, deepFind(res.json(), 'first_name'), d, what);
    }
    case 'web-own': {
      const res = await sendRow(fx, s, await webCaller(fx, d.p, a), { values: { REF: refFor(d.p) } });
      return judge(res, deepFind(res.json(), 'first_name'), d, what);
    }
    case 'other': {
      const res = await sendRow(fx, s, { ...asUser(fx, a, d.p, 'A'), values: aboutD(fx, a, d) });
      return judge(res, res.status < 300 ? listed(res) : undefined, d, what);
    }
    case 'web-other': {
      const w = await webCaller(fx, a, d.p);
      const res = await sendRow(fx, s, { ...w, values: aboutD(fx, a, d) });
      return judge(res, res.status < 300 ? listed(res) : undefined, d, what);
    }
    case 'unauth': {
      const res = await sendRow(fx, s, {
        label: 'no credential',
        auth: AUTH.none,
        values: aboutD(fx, undefined, d),
      });
      return judge(
        res,
        res.status < 300 ? (nameOfRef(res.json(), d.p.ref) ?? deepFind(res.json(), 'first_name')) : undefined,
        d,
        what,
      );
    }
    case 'test-token': {
      const res = await call(fx, s.api!, asTestToken(fx), { query: { user_id: userIdOf(d.p) } });
      return judge(res, deepFind(res.json(), 'first_name'), d, what);
    }
    case 'cms': {
      const c = await adminCaller(fx, d.p);
      const res = await sendRow(
        fx,
        s,
        { ...c, values: aboutD(fx, undefined, d) },
        // user_activity_v1: the row’s own filter, not the Dev example’s likes_sent (that is M2FN-CMS-007).
        s.query ? { query: { ref: refFor(d.p), page: '1', ...s.query } } : {},
      );
      expect(res.status, `${what}: HTTP ${res.status} (server error)`).toBeLessThan(500);
      if (res.status >= 300) blockPrereq(BLOCK, `${what} answered HTTP ${res.status}`);
      expect(res.rawText().includes(d.x), `${what}: X appears nowhere`).toBe(false);
      const shown = nameOfRef(res.json(), d.p.ref);
      if (shown === undefined && approved && s.relation && RELATION_BLOCK[s.relation])
        blockPrereq(BLOCK, `${what}: ${RELATION_BLOCK[s.relation]}`);
      if (shown !== undefined) expect(shown === d.y, `${what}: D is shown with Y`).toBe(true);
      else
        record(`${what}: the reply does not list D by ref (no connections / no entry) — only “no X” checked`);
      return;
    }
    case 'static': {
      const res = await sendRow(fx, s, asTestToken(fx));
      expect(res.status, `${what}: HTTP ${res.status}`).toBeLessThan(500);
      expect(
        res.rawText().includes(d.x) || res.rawText().includes(d.y),
        `${what}: no suite name in fixed sample data`,
      ).toBe(false);
      return;
    }
    case 'flag': {
      const res = await fx.m2.callRoute(ROUTES.fetchSettings, {
        auth: AUTH.user(d.p.token),
        device: d.p.device,
      });
      fx.observe(`${s.row} fetch_settings`, res);
      expect(res.status, `${what}: HTTP ${res.status}`).toBe(200);
      expect(deepFind(res.json(), 'hide_first_name'), `${what}: hide_first_name false`).toBe(false);
      expect(res.rawText().includes(d.x), `${what}: no Aisle-DB name`).toBe(false);
      return;
    }
    default:
      return blockPrereq(BLOCK, `${what}: no caller defined for this row`);
  }
}

test.describe('M2 PII First Name — sweep over every other Aisle / CMS row', () => {
  test.describe.configure({ timeout: 300_000 });
  for (const s of SWEEP.filter((r) => r.cls !== 'cannot')) {
    const r = ROWS.get(s.row)!;
    rowScenario('M2FN-SWP-001', { row: s.row, method: r.method, route: r.route }, (fx) => runRow(fx, s));
  }
});
