/**
 * M2 PII First Name — Aisle CMS paths: member views (A-R2…A-R6), name search (A-S1 PII / A-S2 Aisle-DB bypass) and
 * name writes (A-W1 / A-W4 / A-W5). Design: m2-pii-firstname/scripts/m2fn-firstname-cases.data.ts (approved
 * 2026-11-11).
 *
 * CMS reads and writes name ONLY the suite’s own synthetic accounts: every member search also sends the account’s
 * ref (or a run-unique name), so no other member can appear in a reply; CMS writes are refused for anything that is
 * not a suite-created account (requireOwnAccount). Queue-dependent cases stay Blocked (M2FNQ-22).
 */
import { expect } from '@playwright/test';
import { ownState } from '../../../m2/src/accounts/onboarding';
import type { ExtraRoute } from '../../../m2/src/clients/m2-client';
import { blockPrereq } from '../../../m2/src/prereq';
import { asUser, call, INTERNALS } from '../../../m2/src/scenarios/helpers';
import { scenario, type Fx } from '../../src/define';
import {
  adminCaller,
  adminEditBody,
  approveOwn,
  approvedPooled,
  connect,
  divergent,
  entryFor,
  expectDbName,
  ownName,
  piiRead,
  record,
  refFor,
  requireOwnAccount,
  uniqueName,
  userIdOf,
} from '../../src/first-name';
import { test } from '../../src/fixtures';
import { bodyOf } from '../../src/redis-keys';

const DOWNLOAD_ACCOUNT_DATA: ExtraRoute = {
  key: 'FN-CMS-018',
  method: 'GET',
  path: '/admin/members/download_account_data',
  headers: ['webcms'],
};

const text = (b: unknown) => JSON.stringify(b ?? {});

/** The member search (API-160) for one suite account: always filtered by its ref. */
/**
 * The member search (API-160) for one suite account: always filtered by its ref AND its own synthetic phone number
 * (the request safety guard requires the Dev cURL’s phone_number to be a suite test number), so no other member can
 * appear in the reply.
 */
async function memberSearch(
  fx: Fx,
  about: { ref?: string | undefined; mobileNumber: string },
  extra: Record<string, string> = {},
  who: 'admin' | 'associate' = 'admin',
) {
  return call(fx, 'API-160', await adminCaller(fx, undefined, who), {
    query: { ref: refFor(about), phone_number: about.mobileNumber, page: '1', ...extra },
  });
}

test.describe('M2 PII First Name — Aisle CMS', () => {
  test.describe.configure({ timeout: 300_000 });

  // ---- Member views ------------------------------------------------------------------------------------------
  scenario('M2FN-CMS-001', async (fx) => {
    const d = await divergent(fx, 'M2FN-D');
    const res = await memberSearch(fx, d.p);
    expect(res.status, `member search: HTTP ${res.status}`).toBe(200);
    const e = entryFor(res.json(), refFor(d.p));
    expect(e, 'D is in the result').toBeDefined();
    const shown = e?.name ?? e?.first_name;
    expect(shown === d.y, 'the result shows Y').toBe(true);
    expect(text(res.json()).includes(d.x), 'X appears nowhere in the reply').toBe(false);
  });

  scenario('M2FN-CMS-002', async (fx) => {
    const d = await divergent(fx, 'M2FN-D');
    const admin = await adminCaller(fx, d.p);
    const ref = refFor(d.p);
    const views = [
      ['fetch_complete_info', await call(fx, 'API-163', admin, { query: { ref, page: '1' } })],
      ['/admin/users/:ref', await call(fx, 'API-138', admin, { values: { REF: ref } })],
      ['download_profile_details', await call(fx, 'API-179', admin, { query: { ref, page: '1' } })],
    ] as const;
    for (const [label, res] of views) {
      expect.soft(res.status, `${label}: HTTP ${res.status}`).toBe(200);
      expect.soft(text(res.json()).includes(d.y), `${label}: shows Y`).toBe(true);
      expect.soft(text(res.json()).includes(d.x), `${label}: does not show X`).toBe(false);
    }
  });

  scenario('M2FN-CMS-003', async (fx) => {
    const d = await divergent(fx, 'M2FN-D');
    const assoc = await adminCaller(fx, d.p, 'associate');
    const ref = refFor(d.p);
    const replies = [
      ['member search', await memberSearch(fx, d.p, {}, 'associate')],
      ['fetch_complete_info', await call(fx, 'API-163', assoc, { query: { ref, page: '1' } })],
      ['/admin/users/:ref', await call(fx, 'API-138', assoc, { values: { REF: ref } })],
    ] as const;
    record(`Associate (M2FNQ-23): ${replies.map(([l, r]) => `${l} HTTP ${r.status}`).join('; ')}`);
    for (const [label, r] of replies) {
      expect.soft(r.rawText().includes(d.x), `${label}: never shows X`).toBe(false);
      if (r.status === 200) expect.soft(r.rawText().includes(d.y), `${label}: allowed → shows Y`).toBe(true);
    }
  });

  scenario('M2FN-CMS-004', async () => {
    blockPrereq('M2FNQ-22', 'Needs a report between two own accounts (kept blocked)');
  });

  scenario('M2FN-CMS-005', async (fx) => {
    const a = await approvedPooled(fx, 0);
    const d = await divergent(fx, 'M2FN-CMS-005');
    await approveOwn(fx, d.p);
    await connect(fx, a, d.p);
    const res = await call(fx, 'API-163', await adminCaller(fx, a), { query: { ref: refFor(a), page: '1' } });
    expect(res.status, `fetch_complete_info of A: HTTP ${res.status}`).toBe(200);
    const e = entryFor(res.json(), refFor(d.p));
    expect(e, 'D is listed among A’s connections').toBeDefined();
    expect((e?.first_name ?? e?.name) === d.y, 'the connection shows Y').toBe(true);
    expect(text(res.json()).includes(d.x), 'X appears nowhere').toBe(false);
  });

  scenario('M2FN-CMS-006', async () => {
    blockPrereq('M2FNQ-22', 'Needs an own account with a pending auto image update');
  });

  scenario('M2FN-CMS-007', async (fx) => {
    const a = await fx.accounts.onboarded(0);
    const d = await divergent(fx, 'M2FN-CMS-007');
    await approveOwn(fx, d.p);
    const like = await call(fx, 'API-046', asUser(fx, d.p, a, 'D'), { body: { ref: refFor(a) } });
    record(`D likes A: HTTP ${like.status}`);
    const res = await call(fx, 'API-166', await adminCaller(fx, d.p), {
      query: { ref: refFor(d.p), filter: 'likes_sent', page: '1' },
    });
    record(`likes_sent filter: HTTP ${res.status} (code prediction 500, M2FNQ-19)`);
    expect.soft(INTERNALS.test(res.rawText()), 'no stack trace or file path').toBe(false);
    if (res.status === 200) {
      const aName = (await piiRead(fx, userIdOf(a))).name;
      expect.soft(aName === null || text(res.json()).includes(aName), 'A’s PII name is listed').toBe(true);
    }
  });

  scenario('M2FN-CMS-008', async (fx) => {
    const a = await fx.accounts.onboarded(0);
    const d = await divergent(fx, 'M2FN-CMS-008');
    await approveOwn(fx, d.p);
    const res = await call(fx, 'API-166', await adminCaller(fx, a), {
      query: { ref: refFor(a), filter: 'sparks_received', page: '1' },
    });
    if (
      !text(res.json()).includes(refFor(d.p)) &&
      !text(res.json()).includes(d.y) &&
      !text(res.json()).includes(d.x)
    )
      blockPrereq(
        'M2FN-SPARK',
        'No spark from D to A: sending a spark needs a spark balance and its request is not in the Dev inventory',
      );
    record(
      `sparks_received shows ${text(res.json()).includes(d.x) ? 'X (Aisle DB — bypass, M2FNQ-20)' : 'not X'}`,
    );
  });

  scenario('M2FN-CMS-009', async (fx) => {
    const d = await divergent(fx, 'M2FN-D');
    const admin = await fx.cms.admin();
    const res = await fx.m2.callRoute(DOWNLOAD_ACCOUNT_DATA, {
      auth: admin,
      query: { ref: refFor(d.p) },
      retry: false,
    });
    fx.observe('FN-CMS-018 download_account_data (admin)', res);
    record(
      `account-data export (admin): HTTP ${res.status}, keys ${Object.keys(bodyOf(res)).join(', ') || '(none)'} (M2FNQ-26)`,
    );
    expect.soft(res.rawText().includes(d.x), 'the export reply does not carry X').toBe(false);
    const assoc = await fx.cms.associate();
    const r2 = await fx.m2.callRoute(DOWNLOAD_ACCOUNT_DATA, {
      auth: assoc,
      query: { ref: refFor(d.p) },
      retry: false,
    });
    fx.observe('FN-CMS-018 download_account_data (associate)', r2);
    record(`account-data export (associate): HTTP ${r2.status}`);
    expect.soft(r2.rawText().includes(d.x), 'the associate reply does not carry X').toBe(false);
  });

  // ---- Search -------------------------------------------------------------------------------------------------
  scenario('M2FN-SRC-001', async (fx) => {
    const d = await divergent(fx, 'M2FN-D');
    const byY = await memberSearch(fx, d.p, { first_name: d.y });
    expect(byY.status, `search by Y: HTTP ${byY.status}`).toBe(200);
    expect(entryFor(byY.json(), refFor(d.p)), 'search by the PII name finds D').toBeDefined();
    const byX = await memberSearch(fx, d.p, { first_name: d.x });
    expect(byX.status, `search by X: HTTP ${byX.status}`).toBe(200);
    expect(entryFor(byX.json(), refFor(d.p)), 'search by the Aisle-DB name does not find D').toBeUndefined();
  });

  scenario('M2FN-SRC-002', async (fx) => {
    const d = await divergent(fx, 'M2FN-D');
    const admin = await adminCaller(fx, d.p);
    const byX = await call(fx, 'API-178', admin, { query: { first_name: d.x, page: '1' } });
    const byY = await call(fx, 'API-178', admin, { query: { first_name: d.y, page: '1' } });
    const foundX = entryFor(byX.json(), refFor(d.p));
    const foundY = entryFor(byY.json(), refFor(d.p));
    record(
      `search_profiles: by X ${foundX ? 'finds D (Aisle-DB match)' : 'does not find D'}; by Y ${foundY ? 'finds D' : 'does not find D'} (M2FNQ-18)`,
    );
    expect.soft(byX.status, `search by X: HTTP ${byX.status}`).toBe(200);
    if (foundX)
      expect.soft((foundX.first_name ?? foundX.name) === d.y, 'a found D is displayed with Y').toBe(true);
  });

  scenario('M2FN-SRC-003', async (fx) => {
    const p = await fx.accounts.throwaway('M2FN-SRC-003');
    const name = 'देवी';
    const edit = await call(fx, 'API-058', asUser(fx, p, undefined, 'owner'), {
      synthetic: { firstName: name },
    });
    expect(edit.status, `rename: HTTP ${edit.status}`).toBe(200);
    const pii = await piiRead(fx, userIdOf(p));
    if (pii.name !== name) record('the PII name differs from the input (clean-up rule)');
    const res = await memberSearch(fx, p, { first_name: pii.name ?? name });
    expect(res.status, `search: HTTP ${res.status}`).toBe(200);
    expect(entryFor(res.json(), refFor(p)), 'the account is found by its non-Latin name').toBeDefined();
  });

  // ---- Writes -------------------------------------------------------------------------------------------------
  scenario('M2FN-CMW-001', async (fx) => {
    const d = await divergent(fx, 'M2FN-CMW-001');
    requireOwnAccount(fx, d.p);
    const z = uniqueName(fx, 'Zq');
    const res = await call(fx, 'API-140', await adminCaller(fx, d.p), { body: adminEditBody(fx, d.p, z) });
    expect(res.status, `update_profile: HTTP ${res.status}`).toBe(200);
    expect(bodyOf(res).status, 'status true').toBe(true);
    expect((await piiRead(fx, userIdOf(d.p))).name === z, 'PII holds Z').toBe(true);
    expect((await ownName(fx, d.p)).name === z, 'D’s own profile shows Z').toBe(true);
    await expectDbName(fx, userIdOf(d.p), z, 'Aisle DB = Z');
  });

  scenario('M2FN-CMW-002', async (fx) => {
    const d = await divergent(fx, 'M2FN-CMW-002');
    requireOwnAccount(fx, d.p);
    const z = uniqueName(fx, 'Zp');
    const res = await call(fx, 'API-140', await adminCaller(fx, d.p, 'associate'), {
      body: adminEditBody(fx, d.p, z),
    });
    record(`associate update_profile: HTTP ${res.status}, status ${String(bodyOf(res).status)} (M2FNQ-23)`);
    expect((await piiRead(fx, userIdOf(d.p))).name === d.y, 'PII still holds Y').toBe(true);
    await expectDbName(fx, userIdOf(d.p), d.x, 'Aisle DB still holds X');
  });

  scenario('M2FN-CMW-003', async (fx) => {
    const p = await fx.accounts.throwaway('M2FN-CMW-003');
    requireOwnAccount(fx, p);
    const z = uniqueName(fx, 'Zo');
    const res = await call(fx, 'API-139', await adminCaller(fx, p), { body: adminEditBody(fx, p, z) });
    expect(res.status, `approve_and_edit: HTTP ${res.status}`).toBe(200);
    expect(bodyOf(res).status, 'status true').toBe(true);
    const st = await ownState(fx.accounts.sessions, p);
    expect(st.profileState, 'profile state approved').toBe('approved');
    expect((await piiRead(fx, userIdOf(p))).name === z, 'PII holds Z').toBe(true);
    await expectDbName(fx, userIdOf(p), z, 'Aisle DB = Z');
  });

  for (const [id, why] of [
    ['M2FN-CMW-004', 'Needs an own account in the VIP / curation queue'],
    ['M2FN-CMW-005', 'Needs an own account in the HNI queue'],
    ['M2FN-CMW-006', 'Needs an own account in the autofeed'],
  ] as const)
    scenario(id, async () => {
      blockPrereq('M2FNQ-22', why);
    });
});
