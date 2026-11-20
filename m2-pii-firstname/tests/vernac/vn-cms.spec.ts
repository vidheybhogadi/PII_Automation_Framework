/**
 * M2 PII First Name — vernac CMS paths: member views (V4), activity lists (V6), name writes (VW1), name search (VS1,
 * Postgres bypass), the Redis key API (VX6), the sparks activity bypass (VX9) and provider egress (VX4, blocked).
 * Design: m2-pii-firstname/scripts/m2fn-vernac-cases.data.ts (approved 2026-11-11).
 *
 * CMS reads name ONLY team users: member searches always filter by the member’s ref (or a run-unique name), activity
 * lists are called only when the listed user has no relation with a non-team member (DB counts). Every rename is
 * restored in teardown. Queue / state-changing routes are never called (M2FNQ-53).
 */
import { blockPrereq } from '../../../m2/src/prereq';
import { record } from '../../src/first-name';
import {
  byId,
  mainPair,
  makeDivergent,
  VN,
  vnMalayalamName,
  vnName,
  vnNameOf,
  vnScenario,
} from '../../src/vn/define';
import { expect, VN_BLOCK, type VnCtx } from '../../src/vn/fixtures';
import { vnAbsentKey, vnPiiNameKey, vnProfileKey, vnRedis, vnRedisRaw } from '../../src/vn/redis';
import { usable, writable, type TeamUser } from '../../src/vn/team';

const obj = (b: unknown) => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {});
const hasValue = (b: unknown) => 'value' in obj(b);

async function appViewName(vn: VnCtx, viewer: TeamUser, about: TeamUser) {
  const res = await vn.asUser(viewer, VN.profile, { query: { ref: about.ref! } });
  const gi = obj(obj(obj(res.json()).user).general_information);
  return gi.first_name;
}

// ---- V4 member views -------------------------------------------------------------------------------------------------------
vnScenario('M2FN-VCMS-001', async (vn) => {
  const { d } = mainPair(vn);
  const div = await makeDivergent(vn, d);
  const info = await vn.asAdmin(VN.cmsCompleteInfo, d.app, { query: { ref: d.ref! } });
  expect(info.status).toBe(200);
  const ib = obj(info.json());
  const infoName = ib.first_name ?? ib.name ?? vnNameOf(ib, d.ref!);
  expect(infoName, 'fetch_complete_info name').toBe(div.pii);
  expect(await vn.cmsName(d), '/admin/users/:ref first_name').toBe(div.pii);
  const s = await vn.asAdmin(VN.cmsSearch, d.app, { query: { ref: d.ref!, page: '1' } });
  expect(s.status).toBe(200);
  expect(vnNameOf(s.json(), d.ref!), 'member/search name').toBe(div.pii);
});

vnScenario('M2FN-VCMS-002', async (vn) => {
  const { d } = mainPair(vn);
  const o = await vn.save(d);
  const assoc = await vn.associate();
  const view = await vn.client.call(VN.cmsUser, { app: d.app, auth: assoc, pathParams: { ref: d.ref! } });
  vn.observe('associate GET users/:ref', view);
  expect(view.status, 'associate member view').toBe(401);
  expect(JSON.stringify(view.json() ?? {}).includes(o.firstName), 'no name in the refusal').toBe(false);
  const edit = await vn.client.call(VN.cmsUpdateProfile, {
    app: d.app,
    auth: assoc,
    body: {
      ref: o.ref,
      first_name: vnName(vn, 'Qa'),
      gender: o.gender,
      date_of_birth: o.dateOfBirth,
      phone_code_id: o.phoneCodeId,
      fetch_only_number: o.number,
    },
  });
  vn.observe('associate POST update_profile', edit);
  expect(edit.status, 'associate rename').toBe(401);
  expect(await vn.cmsName(d), 'name unchanged').toBe(o.firstName);
});

// ---- V6 activity lists ---------------------------------------------------------------------------------------------------------
vnScenario('M2FN-VPRJ-001', async (vn) => {
  const cand: { owner: TeamUser; d: TeamUser; filter: string; count: string }[] = [];
  const add = (ownerId: string, dId: string, filter: string, count: string) => {
    const owner = byId(vn, ownerId);
    const d = byId(vn, dId);
    if (owner && d && usable(owner) && writable(d)) cand.push({ owner, d, filter, count });
  };
  for (const b of vn.team.blocks) add(b.a, b.b, 'blocked_self', 'blocks');
  for (const l of vn.team.likes) add(l.a, l.b, 'likes_sent', 'likes_sent');
  for (const l of vn.team.likes) add(l.b, l.a, 'likes_received', 'likes_received');
  for (const p of vn.team.passes) add(p.a, p.b, 'user_passed', 'passes');
  for (const c of cand) {
    const counts =
      (
        await vn.db.appQuery<Record<string, number>>('foreignRelationCounts', [
          [...vn.db.suite],
          c.owner.userId,
        ])
      )[0] ?? {};
    if (Number(counts[c.count] ?? 1) !== 0) {
      record(`${c.filter} of ${c.owner.label}: also lists non-team members — not called`);
      continue;
    }
    const div = await makeDivergent(vn, c.d);
    const res = await vn.asAdmin(VN.cmsActivity, c.owner.app, {
      query: { ref: c.owner.ref!, filter: c.filter, page: '1' },
    });
    expect(res.status, `user_activity_v1 ${c.filter}`).toBe(200);
    const name = vnNameOf(res.json(), c.d.ref!);
    if (name === undefined) {
      record(`${c.filter} of ${c.owner.label}: ${c.d.label} not listed`);
      continue;
    }
    expect(name, `${c.filter}: the counterpart’s PII form`).toBe(div.pii);
    return;
  }
  blockPrereq(
    'M2FNQ-34',
    'No existing relation among team users gives a CMS activity list with only team members that lists a member with a PII name',
  );
});

// ---- VW1 CMS writes --------------------------------------------------------------------------------------------------------------
vnScenario('M2FN-VCMW-001', async (vn) => {
  const { d, a } = mainPair(vn);
  await vn.save(d);
  const before = await vn.piiRow(d);
  const fake = vnName(vn, 'Qa');
  const res = await vn.rename(d, fake);
  expect(res.status, 'update_profile').toBe(200);
  expect(obj(res.json()).status, 'status true').toBe(true);
  expect(await appViewName(vn, a, d), 'another member’s view').toBe(fake);
  const launch = await vn.asUser(d, VN.appLaunch);
  expect(obj(launch.json()).first_name, 'own app_launch').toBe(fake);
  expect(await vn.cmsName(d), 'CMS view').toBe(fake);
  const cache = await vnRedis(
    vn.client,
    'get',
    await vn.admin(),
    vnProfileKey(vn.cfg.redisEnv, d.ref!),
    vn.keyScope(),
  );
  if (cache.status === 200) {
    const j = JSON.parse(String(obj(cache.json()).value)) as Record<string, unknown>;
    expect(obj(j.general_information).first_name, 'profile cache').toBe(fake);
  } else record(`profile cache key after the rename: HTTP ${cache.status}`);
  expect((await vn.dbName(d, fake)).isValue, 'Postgres').toBe(true);
  const after = await vn.piiRow(d);
  expect(after, 'PII NAME row exists').toBeDefined();
  expect(after!.hash === before?.hash, 'PII row rewritten (ciphertext changed)').toBe(false);
  expect(await vn.piiNotPlaintext(d, fake), 'ciphertext does not contain the plain name').toBe(true);
});

vnScenario('M2FN-VCMW-002', async (vn) => {
  const { d } = mainPair(vn);
  const div = await makeDivergent(vn, d);
  const db = await vn.dbName(d, div.db);
  record(`Postgres keeps the double inner space: ${db.isValue && db.double} (possible defect M2FNQ-36)`);
  expect(await vn.cmsName(d), 'CMS view (PII getter): single-space form').toBe(div.pii);
  const launch = await vn.asUser(d, VN.appLaunch);
  expect(obj(launch.json()).first_name, 'app view: single-space form').toBe(div.pii);
});

vnScenario('M2FN-VCMW-003', async (vn) => {
  const { d } = mainPair(vn);
  const o = await vn.save(d);
  for (const bad of ['', '   ']) {
    const res = await vn.rename(d, bad);
    expect(res.status, `blank name ${JSON.stringify(bad)}`).toBe(422);
    const b = obj(res.json());
    expect(b.status, 'status false').toBe(false);
    expect(b.message).toBe('Unable to save or retrieve this information. Please try again.');
    expect(b.is_backend_error).toBe(true);
    expect(await vn.cmsName(d), 'name unchanged').toBe(o.firstName);
    expect((await vn.dbName(d, o.firstName)).isValue, 'Postgres unchanged').toBe(true);
  }
});

vnScenario('M2FN-VCMW-004', async (vn) => {
  const { d } = mainPair(vn);
  const o = await vn.save(d);
  const before = await vn.piiRow(d);
  expect(before, 'PII NAME row').toBeDefined();
  const res = await vn.rename(d, o.firstName);
  expect(res.status).toBe(200);
  const after = await vn.piiRow(d);
  expect(after?.updatedAt, 'PII row update time unchanged').toBe(before!.updatedAt);
  expect(after?.hash, 'PII ciphertext unchanged').toBe(before!.hash);
});

vnScenario('M2FN-VCMW-005', async (vn) => {
  const d = vn.team.users
    .filter((u) => writable(u) && u.state === 'approved')
    .sort((x, y) => y.number.localeCompare(x.number))[0];
  if (!d)
    return blockPrereq(
      'M2FNQ-53',
      'No APPROVED team user with a PII name (approve_and_edit is never used on other users)',
    );
  if ((await vn.dbHide(d)).state !== 1)
    return blockPrereq('M2FNQ-53', 'The user is no longer approved (DB) — not used');
  await vn.save(d);
  const fake = vnName(vn, 'Qa');
  const res = await vn.rename(d, fake, VN.cmsApproveAndEdit);
  expect(res.status, 'approve_and_edit').toBe(200);
  expect(await vn.cmsName(d), 'new name').toBe(fake);
  expect((await vn.dbName(d, fake)).isValue, 'Postgres').toBe(true);
  expect((await vn.dbHide(d)).state, 'profile_state still approved').toBe(1);
});

vnScenario('M2FN-VCMW-006', async (vn) => {
  const { d, a } = mainPair(vn);
  await vn.save(d);
  const ml = vnMalayalamName(vn);
  expect((await vn.rename(d, ml)).status).toBe(200);
  expect(await vn.cmsName(d), 'CMS view').toBe(ml);
  expect(await appViewName(vn, a, d), 'app view').toBe(ml);
  expect((await vn.dbName(d, ml)).isValue, 'Postgres').toBe(true);
});

vnScenario('M2FN-VCMW-007', async (vn) => {
  let pick: { x: TeamUser; y: TeamUser } | undefined;
  for (const x of vn.team.users.filter((u) => writable(u))) {
    const y = vn.team.users.find((u) => u.number === x.number && u.app !== x.app && usable(u));
    if (y) {
      pick = { x, y };
      break;
    }
  }
  if (!pick)
    return blockPrereq(
      VN_BLOCK.state,
      'No team number with a writable user in one app and a user in another in-scope app',
    );
  const yName = await vn.cmsName(pick.y);
  expect(typeof yName, 'the other app’s user has a name').toBe('string');
  await vn.save(pick.x);
  expect((await vn.rename(pick.x, vnName(vn, 'Qa'))).status).toBe(200);
  expect(await vn.cmsName(pick.y), `${pick.y.app} user keeps its name`).toBe(yName);
  expect((await vn.dbName(pick.y, String(yName))).isValue, `${pick.y.app} Postgres unchanged`).toBe(true);
});

// ---- VS1 search ---------------------------------------------------------------------------------------------------------------------
vnScenario('M2FN-VSRC-001', async (vn) => {
  const { d } = mainPair(vn);
  const div = await makeDivergent(vn, d);
  const dbForm = await vn.asAdmin(VN.cmsSearch, d.app, {
    query: { ref: d.ref!, first_name: div.db, page: '1' },
  });
  const piiForm = await vn.asAdmin(VN.cmsSearch, d.app, {
    query: { ref: d.ref!, first_name: div.pii, page: '1' },
  });
  expect(dbForm.status).toBe(200);
  expect(piiForm.status).toBe(200);
  const byDb = vnNameOf(dbForm.json(), d.ref!);
  const byPii = vnNameOf(piiForm.json(), d.ref!);
  record(
    `search by the Postgres form finds D: ${byDb !== undefined}; by the PII form: ${byPii !== undefined} (M2FNQ-36)`,
  );
  for (const n of [byDb, byPii])
    if (n !== undefined) expect(n, 'a listed D shows the PII form').toBe(div.pii);
});

vnScenario('M2FN-VSRC-002', async (vn) => {
  const { d } = mainPair(vn);
  const div = await makeDivergent(vn, d);
  const res = { db: '', pii: '' } as Record<'db' | 'pii', string>;
  for (const k of ['db', 'pii'] as const) {
    const r = await vn.asAdmin(VN.cmsSearchProfiles, d.app, { query: { first_name: div[k], page: '1' } });
    expect(r.status).toBe(200);
    const list = (obj(r.json()).profile_list as unknown[] | undefined) ?? [];
    const names = list.map((p) => obj(p).first_name);
    res[k] = `${list.length} result(s)`;
    for (const n of names) expect(n, 'a listed member shows the PII form').toBe(div.pii);
  }
  record(`search_profiles: Postgres form → ${res.db}; PII form → ${res.pii} (M2FNQ-36)`);
});

// ---- VX6 Redis key API ------------------------------------------------------------------------------------------------------------
vnScenario('M2FN-VRDK-001', async (vn) => {
  const admin = await vn.admin();
  const key = vnAbsentKey(vn.runId, 'absent');
  const g = await vnRedis(vn.client, 'get', admin, key, vn.keyScope());
  expect(g.status).toBe(404);
  expect(obj(g.json())).toEqual({ status: false, message: 'Redis key not found' });
  expect((g.header('cache-control') ?? '').toLowerCase()).toContain('no-store');
  const del = await vnRedis(vn.client, 'delete', admin, key, vn.keyScope());
  expect(del.status).toBe(200);
  expect(obj(del.json())).toMatchObject({ status: true, deleted: false });
  for (const q of [undefined, { key: '' }]) {
    const r = await vnRedisRaw(vn.client, 'get', admin, q);
    expect(r.status, `GET with ${q ? 'a blank key' : 'no key'}`).toBe(400);
    const b = obj(r.json());
    expect(b.status).toBe(false);
    expect(JSON.stringify(b.details ?? [])).toContain('"field":"key"');
  }
});

vnScenario('M2FN-VRDK-002', async (vn) => {
  const { d } = mainPair(vn);
  const key = vnProfileKey(vn.cfg.redisEnv, d.ref!);
  const assoc = await vnRedis(vn.client, 'get', await vn.associate(), key, vn.keyScope());
  expect(assoc.status, 'associate').toBe(401);
  expect(hasValue(assoc.json()), 'no value for the associate').toBe(false);
  await vn.w.cms.withUnverifiedAdmin(async (auth) => {
    if (auth.kind !== 'secret') throw new Error('no admin token');
    const r = await vnRedis(vn.client, 'get', auth.secret, key, vn.keyScope());
    expect(r.status, 'admin without the authenticator code').toBe(401);
    expect(hasValue(r.json()), 'no value without OTP').toBe(false);
  });
});

vnScenario('M2FN-VRDK-003', async (vn) => {
  const { d, a } = mainPair(vn);
  await appViewName(vn, a, d);
  const key = vnPiiNameKey(vn.cfg.redisEnv, vn.cfg.piiCallerId, vn.team.tenants[d.app]!, d.userId);
  const r = await vnRedis(vn.client, 'get', await vn.admin(), key, vn.keyScope());
  expect(r.status, 'admin reads the PII field cache key').toBe(200);
  expect(obj(r.json()).value, 'the plain name the app shows').toBe(await vn.cmsName(d));
  record('A permitted vernac admin reads a member’s decrypted first name (M2FNQ-05)');
});

// ---- Blocked by design (shown so their reasons are reported) --------------------------------------------------------------------
for (const id of ['M2FN-VSPK-001', 'M2FN-VEGR-001', 'M2FN-VEGR-002'])
  vnScenario(id, async () => {
    blockPrereq('M2FN-VN', 'Blocked by design (see the case’s questions)');
  });
