/**
 * M2 PII First Name — vernac backend paths (V1 single profile, V2 lists, V3 conversations, V4 own name, V5 / VX7 hide,
 * VW1 app write, VX2 PII field cache, per-app check, flag / outage windows). Design:
 * m2-pii-firstname/scripts/m2fn-vernac-cases.data.ts (approved 2026-11-11).
 *
 * Team accounts only (the nine team numbers, testapp.koode.co); every change is restored in teardown (src/vn/fixtures).
 * Relations that already exist among the team users are used first (M2FNQ-34). Since 2026-11-12 (QA lead) the list
 * cases may create ONE like between two team users of the same app and VHID-003 may send ONE fake chat message in a
 * team-only conversation (src/vn/setup.ts); both cannot be undone and are recorded as "irreversible".
 */
import { blockPrereq } from '../../../m2/src/prereq';
import { record } from '../../src/first-name';
import {
  byId,
  firstNames,
  initial,
  mainPair,
  makeDivergent,
  VN,
  vnName,
  vnNameOf,
  vnParamScenario,
  vnScenario,
} from '../../src/vn/define';
import { expect, VN_BLOCK, type VnCtx } from '../../src/vn/fixtures';
import { VN_APP_NAMES, type VnApp } from '../../src/vn/guard';
import { vnConversationKey, vnPiiNameKey, vnProfileKey, vnRedis } from '../../src/vn/redis';
import { createTeamLike, ensureMessageFrom, readChat } from '../../src/vn/setup';
import { usable, writable, type TeamUser } from '../../src/vn/team';

const bodyName = (b: unknown): unknown => {
  const o = b as Record<string, unknown> | undefined;
  const user = o?.user as Record<string, unknown> | undefined;
  const gi = (user?.general_information ?? o?.general_information) as Record<string, unknown> | undefined;
  return gi?.first_name ?? o?.first_name ?? user?.first_name;
};

async function profileOf(vn: VnCtx, viewer: TeamUser, about: TeamUser) {
  const res = await vn.asUser(viewer, VN.profile, { query: { ref: about.ref! } });
  expect(res.status, 'fetch_profile HTTP status').toBe(200);
  return bodyName(res.json());
}

async function cacheName(vn: VnCtx, key: string): Promise<{ status: number; name: unknown }> {
  const res = await vnRedis(vn.client, 'get', await vn.admin(), key, vn.keyScope());
  if (res.status !== 200) return { status: res.status, name: undefined };
  const v = (res.json() as { value?: unknown }).value;
  try {
    const j = JSON.parse(String(v)) as Record<string, unknown>;
    return {
      status: 200,
      name: (j.general_information as Record<string, unknown> | undefined)?.first_name ?? j.first_name,
    };
  } catch {
    return { status: 200, name: v };
  }
}

const profileKeyOf = (vn: VnCtx, u: TeamUser) => vnProfileKey(vn.cfg.redisEnv, u.ref!);
const piiKeyOf = (vn: VnCtx, u: TeamUser) =>
  vnPiiNameKey(vn.cfg.redisEnv, vn.cfg.piiCallerId, vn.team.tenants[u.app]!, u.userId);

// ---- Setup -------------------------------------------------------------------------------------------------------------
vnScenario('M2FN-VSET-001', async (vn) => {
  const t = vn.team;
  record(
    `team users: ${t.users.map((u) => `${u.app} ${u.label} ${u.state ?? 'no profile'}${u.hasPiiName ? ' PII' : ''}${u.selfieVerified ? ' selfie' : ''}`).join('; ')}`,
  );
  record(`skipped (out of scope): ${t.skipped.map((s) => `app ${s.app} ${s.label}`).join(', ') || 'none'}`);
  record(
    `relations among team users: ${t.likes.length} likes, ${t.passes.length} passes, ${t.invites.length} invites, ${t.blocks.length} blocks, ${t.conversations.length} conversations`,
  );
  expect(t.testNumbers, 'the nine numbers are registered test numbers').toBe(9);
  for (const app of vn.cfg.apps) {
    const users = t.users.filter((u) => u.app === app && usable(u));
    expect.soft(users.length, `${app}: at least one usable team user`).toBeGreaterThan(0);
    expect.soft(t.flags[app], `${app}: both name flags enabled`).toEqual({ read: true, write: true });
    expect.soft(Boolean(t.tenants[app]), `${app}: PII tenant set`).toBe(true);
    const u = users.find((x) => x.state === 'approved') ?? users[0];
    if (!u) continue;
    const res = await vn.asUser(u, VN.appLaunch);
    expect.soft(res.status, `${app}: app_launch after login`).toBe(200);
    expect
      .soft(
        typeof (res.json() as Record<string, unknown> | undefined)?.first_name,
        `${app}: first_name in app_launch`,
      )
      .toBe('string');
  }
});

// ---- V1 ------------------------------------------------------------------------------------------------------------------
vnScenario('M2FN-VPRF-001', async (vn) => {
  const { d, a } = mainPair(vn);
  const div = await makeDivergent(vn, d);
  const name = await profileOf(vn, a, d);
  expect(name, 'another member sees the PII form').toBe(div.pii);
  expect(name === div.db, 'never the Postgres double-space form').toBe(false);
  expect((await vn.dbName(d, div.db)).isValue, 'Postgres keeps the double-space form').toBe(true);
});

vnScenario('M2FN-VPRF-002', async (vn) => {
  const { d, a } = mainPair(vn);
  const div = await makeDivergent(vn, d);
  const admin = await vn.admin();
  const del = await vnRedis(vn.client, 'delete', admin, profileKeyOf(vn, d), vn.keyScope());
  expect(del.status, 'DELETE profile key').toBe(200);
  expect((await cacheName(vn, profileKeyOf(vn, d))).status, 'key gone').toBe(404);
  expect(await profileOf(vn, a, d), 'cache miss read').toBe(div.pii);
  const cached = await cacheName(vn, profileKeyOf(vn, d));
  expect(cached.status, 'key refilled').toBe(200);
  expect(cached.name, 'refilled cache holds the PII form').toBe(div.pii);
  expect(await profileOf(vn, a, d), 'cache hit read').toBe(div.pii);
});

vnScenario('M2FN-VPRF-003', async (vn) => {
  const { a } = mainPair(vn);
  const fake = `QX${vnName(vn, 'Q').toUpperCase().slice(-6)}`;
  const res = await vn.asUser(a, VN.profile, { query: { ref: fake } });
  expect(res.status, 'fetch_profile with an unknown ref').toBe(200);
  expect(firstNames(res.json()), 'no first_name in the reply').toEqual([]);
});

// ---- V2 ------------------------------------------------------------------------------------------------------------------
interface ListCase {
  route: typeof VN.passed;
  viewer: TeamUser;
  about: TeamUser;
  what: string;
}

/** Existing relations whose listed member may be made divergent (writable), in order of preference. */
function listCases(vn: VnCtx, needVerified = false): ListCase[] {
  const out: ListCase[] = [];
  const ok = (u: TeamUser | undefined) => u && writable(u) && (!needVerified || u.selfieVerified);
  for (const l of vn.team.likes.filter((x) => !x.likedBack && !x.passed)) {
    const viewer = byId(vn, l.a);
    const about = byId(vn, l.b);
    if (viewer && usable(viewer) && ok(about))
      out.push({ route: VN.requestSent, viewer, about: about!, what: 'sent-likes list' });
  }
  for (const p of vn.team.passes) {
    const viewer = byId(vn, p.a);
    const about = byId(vn, p.b);
    if (viewer && usable(viewer) && ok(about))
      out.push({ route: VN.passed, viewer, about: about!, what: 'passed list' });
  }
  return out;
}

async function listedName(vn: VnCtx, lc: ListCase): Promise<unknown> {
  const res = await vn.asUser(lc.viewer, lc.route);
  expect(res.status, `${lc.what} HTTP status`).toBe(200);
  return vnNameOf(res.json(), lc.about.ref!);
}

/**
 * The first relation whose viewer’s list shows the member. When no existing like or pass does, create one like
 * between two team users of the same app (QA lead 2026-11-12; once per run, later cases find it as existing).
 */
async function firstListed(vn: VnCtx, needVerified = false): Promise<ListCase> {
  for (const lc of listCases(vn, needVerified)) {
    // Only viewers whose list holds team users alone (no likes / passes to non-team members, DB count).
    const counts =
      (
        await vn.db.appQuery<Record<string, unknown>>('foreignRelationCounts', [
          [...vn.db.suite],
          lc.viewer.userId,
        ])
      )[0] ?? {};
    if (Number(lc.route === VN.passed ? (counts.passes ?? 1) : (counts.likes_sent ?? 1)) !== 0) {
      record(`${lc.what}: ${lc.viewer.label} also lists non-team members — not called`);
      continue;
    }
    if ((await listedName(vn, lc)) !== undefined) return lc;
    record(`${lc.what}: ${lc.viewer.label} → ${lc.about.label} is not listed (relation state)`);
  }
  const { viewer, about } = await createTeamLike(vn, { needVerified });
  const lc: ListCase = { route: VN.requestSent, viewer, about, what: 'sent-likes list' };
  if ((await listedName(vn, lc)) === undefined)
    blockPrereq(
      VN_BLOCK.state,
      `The new like ${viewer.label} → ${about.label} (${viewer.app}) is not in the viewer’s sent-likes list`,
    );
  return lc;
}

vnScenario('M2FN-VLST-001', async (vn) => {
  const lc = await firstListed(vn);
  await vn.setHide(lc.about, false);
  const div = await makeDivergent(vn, lc.about);
  const name = await listedName(vn, lc);
  expect(name, `${lc.what} shows the PII form`).toBe(div.pii);
});

vnScenario('M2FN-VLST-002', async (vn) => {
  const lc = await firstListed(vn);
  await vn.setHide(lc.about, false);
  const div = await makeDivergent(vn, lc.about);
  const key = profileKeyOf(vn, lc.about);
  expect(
    (await vnRedis(vn.client, 'delete', await vn.admin(), key, vn.keyScope())).status,
    'DELETE profile key',
  ).toBe(200);
  expect(await listedName(vn, lc), 'the list reply shows the PII form').toBe(div.pii);
  const cached = await cacheName(vn, key);
  expect(cached.status, 'list fill wrote the cache').toBe(200);
  expect(cached.name, 'the list fill stores the Postgres double-space form (VX1)').toBe(div.db);
});

vnScenario('M2FN-VLST-004', async (vn) => {
  const lc = await firstListed(vn, true);
  const div = await makeDivergent(vn, lc.about);
  await vn.setHide(lc.about, true);
  expect((await vn.dbHide(lc.about)).hide, 'hide is on').toBe(true);
  expect(await listedName(vn, lc), 'the list shows the initial of the PII name').toBe(initial(div.pii));
});

// ---- V3 ------------------------------------------------------------------------------------------------------------------
function conversationPair(vn: VnCtx, needVerified = false, preferFull = false) {
  const convs = preferFull
    ? [...vn.team.conversations].sort((x, y) => Number(y.full) - Number(x.full))
    : vn.team.conversations;
  for (const c of convs) {
    for (const [dId, aId] of [
      [c.b, c.a],
      [c.a, c.b],
    ] as const) {
      const d = byId(vn, dId);
      const a = byId(vn, aId);
      if (d && a && writable(d) && usable(a) && (!needVerified || d.selfieVerified)) return { d, a, conv: c };
    }
  }
  return blockPrereq(
    'M2FNQ-34',
    'No existing conversation between two team users where one has a PII name (no new relations, QA lead 2026-11-11)',
  );
}

async function chatName(vn: VnCtx, viewer: TeamUser, about: TeamUser, route = VN.combined) {
  const res = await vn.asUser(viewer, route);
  expect(res.status, `${route.path} HTTP status`).toBe(200);
  return vnNameOf(res.json(), about.ref!);
}

vnScenario('M2FN-VCHT-001', async (vn) => {
  const { d, a } = conversationPair(vn);
  const before = await chatName(vn, a, d);
  if (before === undefined)
    blockPrereq('M2FNQ-34', 'The existing conversation is not in the partner’s combined chat list');
  const div = await makeDivergent(vn, d);
  const after = await chatName(vn, a, d);
  expect(after, 'the chat list shows the new PII form').toBe(div.pii);
});

vnScenario('M2FN-VCHT-002', async (vn) => {
  const { d, a, conv } = conversationPair(vn, true);
  const key = vnConversationKey(vn.cfg.redisEnv, conv.id);
  const div = await makeDivergent(vn, d);
  if ((await chatName(vn, a, d)) === undefined)
    blockPrereq('M2FNQ-34', 'The existing conversation is not in the partner’s combined chat list');
  const admin = await vn.admin();
  const before = await vnRedis(vn.client, 'get', admin, key, vn.keyScope());
  record(`conversation cache key before the toggle: HTTP ${before.status}`);
  expect(before.status, 'conversation cache present after the list read').toBe(200);
  expect((await vn.toggleHide(d)).status, 'toggle_hide_name').toBe(200);
  expect(
    (await vnRedis(vn.client, 'get', admin, key, vn.keyScope())).status,
    'the toggle cleared the conversation cache',
  ).toBe(404);
  expect(await chatName(vn, a, d), 'the chat list shows the initial').toBe(initial(div.pii));
});

// ---- V4 ------------------------------------------------------------------------------------------------------------------
vnScenario('M2FN-VOWN-001', async (vn) => {
  const { d } = mainPair(vn);
  const div = await makeDivergent(vn, d);
  const launch = await vn.asUser(d, VN.appLaunch);
  expect(launch.status).toBe(200);
  expect((launch.json() as Record<string, unknown>).first_name, 'app_launch first_name').toBe(div.pii);
  const own = await vn.asUser(d, VN.ownProfile);
  expect(own.status).toBe(200);
  expect(bodyName(own.json()), 'fetch_own_profile first_name').toBe(div.pii);
  expect(
    typeof (own.json() as Record<string, unknown>).hide_first_name,
    'hide_first_name returned as a flag',
  ).toBe('boolean');
  expect((await vn.dbName(d, div.db)).isValue, 'Postgres keeps the double-space form').toBe(true);
});

vnScenario('M2FN-VOWN-002', async (vn) => {
  const res = await vn.client.call(VN.fetchLoginResponse, { app: mainPair(vn).app, body: {} });
  vn.observe('fetch_login_response (no credential)', res);
  record(`fetch_login_response answered HTTP ${res.status} (from code: 500, M2FNQ-40)`);
  expect(firstNames(res.json()), 'no first_name in the reply').toEqual([]);
});

vnScenario('M2FN-VOWN-003', async (vn) => {
  const { a, app } = mainPair(vn);
  const other = VN_APP_NAMES.find((x) => x !== app)!;
  const own = await vn.asUser(a, VN.appLaunch);
  const cross = await vn.asUser(a, VN.appLaunch, {}, other);
  expect(own.status).toBe(200);
  expect(cross.status).toBe(200);
  const o = own.json() as Record<string, unknown>;
  const x = cross.json() as Record<string, unknown>;
  expect(x.ref, 'same member').toBe(o.ref);
  expect(x.first_name, 'same name (the app comes from the token)').toBe(o.first_name);
});

vnScenario('M2FN-VOWN-004', async (vn) => {
  let pick: { u: TeamUser; viewer: TeamUser } | undefined;
  for (const u of vn.team.users.filter((x) => usable(x) && !x.hasPiiName && x.state === 'approved')) {
    const viewer = vn.team.users.find(
      (x) => x.app === u.app && x !== u && usable(x) && x.state === 'approved',
    );
    if (viewer) {
      pick = { u, viewer };
      break;
    }
  }
  if (!pick)
    return blockPrereq(VN_BLOCK.state, 'Every approved team user already has a PII name (no fallback case)');
  const launch = await vn.asUser(pick.u, VN.appLaunch);
  expect(launch.status).toBe(200);
  const own = (launch.json() as Record<string, unknown>).first_name;
  expect(typeof own, 'own name present').toBe('string');
  expect((await vn.dbName(pick.u, String(own))).isValue, 'own name = Postgres value (fallback)').toBe(true);
  expect(await profileOf(vn, pick.viewer, pick.u), 'others see the same Postgres value').toBe(own);
});

// ---- V5 / VX7 ---------------------------------------------------------------------------------------------------------------
vnScenario('M2FN-VHID-001', async (vn) => {
  const u =
    vn.team.users.find((x) => usable(x) && !x.selfieVerified && x.state === 'approved' && writable(x)) ??
    vn.team.users.find((x) => usable(x) && !x.selfieVerified && x.state === 'approved');
  if (!u) return blockPrereq(VN_BLOCK.state, 'No approved team user without a verified selfie');
  const before = (await vn.dbHide(u)).hide;
  // Saved for the restore of the hide flag; the name is never changed here (users without a PII name are not renamed).
  if (writable(u)) await vn.save(u);
  else if (!vn.cfg.run) blockPrereq(VN_BLOCK.run, 'Runs only with M2FN_VN_RUN=true');
  const res = await vn.asUser(u, VN.toggleHide, { body: {} });
  expect(res.status).toBe(200);
  expect((res.json() as Record<string, unknown>).status, 'status true').toBe(true);
  const after = (await vn.dbHide(u)).hide;
  if (after !== before && !writable(u)) {
    // Not expected from code; put the flag back at once (the user is not in the restore registry).
    await vn.asUser(u, VN.toggleHide, { body: {} });
  }
  expect(after, 'hide flag unchanged').toBe(before);
  const info = await vn.asUser(u, VN.ownInfo);
  expect((info.json() as Record<string, unknown>).hide_first_name, 'fetch_own_info hide flag unchanged').toBe(
    before,
  );
});

vnScenario('M2FN-VHID-002', async (vn) => {
  const { d, a } = mainPair(vn, { dVerified: true });
  const div = await makeDivergent(vn, d);
  const t = await vn.toggleHide(d);
  expect(t.status).toBe(200);
  expect((t.json() as Record<string, unknown>).first_name, 'toggle reply: the initial').toBe(
    initial(div.pii),
  );
  expect(await profileOf(vn, a, d), 'another member sees the initial').toBe(initial(div.pii));
  const launch = await vn.asUser(d, VN.appLaunch);
  expect((launch.json() as Record<string, unknown>).first_name, 'owner: full PII name').toBe(div.pii);
  const info = (await vn.asUser(d, VN.ownInfo)).json() as Record<string, unknown>;
  expect(info.first_name, 'fetch_own_info: full name').toBe(div.pii);
  expect(info.hide_first_name, 'fetch_own_info: hide on').toBe(true);
  const cached = await cacheName(vn, profileKeyOf(vn, d));
  expect(cached.name, 'profile cache holds the initial').toBe(initial(div.pii));
  const h = await vn.dbHide(d);
  expect(h.hide, 'DB hide on').toBe(true);
  expect(h.timeSet, 'DB hide update time set').toBe(true);
});

vnScenario('M2FN-VHID-003', async (vn) => {
  // A full (active) conversation first: a message there needs no change of the conversation state.
  const { d, a, conv } = conversationPair(vn, true, true);
  await vn.save(d);
  const name = await vn.cmsName(d);
  await ensureMessageFrom(vn, d, a, conv);
  await vn.setHide(d, true);
  const { status, messages } = await readChat(vn, a, conv.id);
  record(`chat_messages answered HTTP ${status} (route defined without an action, M2FNQ-54)`);
  if (status !== 200) return blockPrereq('M2FNQ-54', `POST /v1/chat/chat_messages answered HTTP ${status}`);
  const fromD = messages.filter((m) => m.sender_ref_id === d.ref);
  if (!fromD.length) return blockPrereq(VN_BLOCK.state, `No message from ${d.label} in the conversation`);
  const full = fromD.some((m) => m.sender_name === name);
  const masked = fromD.some((m) => name !== undefined && m.sender_name === initial(name));
  record(
    `hidden sender ${d.label} (${d.app}): ${fromD.length} message(s); shown with the full PII name: ${full}; with the initial: ${masked} (possible defect M2FNQ-38)`,
  );
});

// ---- VW1 (app) -------------------------------------------------------------------------------------------------------------
vnScenario('M2FN-VWRT-001', async (vn) => {
  const { d } = mainPair(vn);
  const o = await vn.save(d);
  const fake = vnName(vn, 'Qa');
  const res = await vn.asUser(d, VN.updateProfile, { body: { general_information: { first_name: fake } } });
  expect(res.status, 'update_profile HTTP status').toBe(200);
  expect((res.json() as Record<string, unknown>).first_name, 'the reply shows the old name').toBe(
    o.firstName,
  );
  expect(await vn.cmsName(d), 'PII name unchanged').toBe(o.firstName);
  expect((await vn.dbName(d, o.firstName)).isValue, 'Postgres unchanged').toBe(true);
});

// ---- VX2 PII field cache ---------------------------------------------------------------------------------------------------
vnScenario('M2FN-VCAC-001', async (vn) => {
  const { d, a } = mainPair(vn);
  const o = await vn.save(d);
  const key = piiKeyOf(vn, d);
  await profileOf(vn, a, d);
  const first = await cacheName(vn, key);
  expect(first.status, 'PII field cache filled by a read').toBe(200);
  expect(first.name, 'cached value = the current name').toBe(o.firstName);
  const fake = vnName(vn, 'Qa');
  expect((await vn.rename(d, fake)).status, 'CMS rename').toBe(200);
  expect((await cacheName(vn, key)).status, 'the rename cleared the PII field cache').toBe(404);
  expect(await profileOf(vn, a, d), 'read after the rename').toBe(fake);
  const again = await cacheName(vn, key);
  expect(again.status, 'refilled').toBe(200);
  expect(again.name, 'refilled with the new name').toBe(fake);
});

// ---- Every app -------------------------------------------------------------------------------------------------------------
for (const app of VN_APP_NAMES)
  vnParamScenario('M2FN-VAPP-001', app, async (vn) => {
    if (!vn.cfg.apps.includes(app as VnApp))
      return blockPrereq(VN_BLOCK.state, `${app} is not in M2FN_VN_APPS`);
    // A member whose name is not hidden first; a hidden one is un-hidden for the case (restored in teardown).
    const d = vn.team.users
      .filter((u) => u.app === app && writable(u) && u.state === 'approved')
      .sort((x, y) => Number(x.hide) - Number(y.hide) || y.number.localeCompare(x.number))[0];
    const a = d && vn.team.users.find((u) => u.app === app && u !== d && usable(u) && u.state === 'approved');
    if (!d || !a)
      return blockPrereq(
        VN_BLOCK.state,
        `${app}: no approved team user with a PII name plus a second approved user (a rename would create a PII name, which cannot be undone)`,
      );
    await vn.setHide(d, false);
    const div = await makeDivergent(vn, d);
    expect(await profileOf(vn, a, d), `${app}: another member sees the PII form`).toBe(div.pii);
    const launch = await vn.asUser(d, VN.appLaunch);
    expect((launch.json() as Record<string, unknown>).first_name, `${app}: own name`).toBe(div.pii);
  });

// ---- Flag / outage windows (Dev windows only, M2FNQ-47) -------------------------------------------------------------------
vnScenario('M2FN-VFLG-001', async (vn) => {
  const w = vn.cfg.flagWindow;
  if (!w || w.mode !== 'read_off')
    return blockPrereq('M2FNQ-47', 'No read-off window (M2FN_VN_FLAG_WINDOW=<App>:read_off)');
  const d = vn.team.users.find((u) => u.app === w.app && writable(u));
  const a = d && vn.team.users.find((u) => u.app === w.app && u !== d && usable(u));
  if (!d || !a) return blockPrereq(VN_BLOCK.state, `${w.app}: no writable team user and viewer`);
  const div = await makeDivergent(vn, d);
  expect(await profileOf(vn, a, d), 'Postgres form with the read flag off').toBe(div.db);
});

vnScenario('M2FN-VFLG-002', async (vn) => {
  const w = vn.cfg.flagWindow;
  if (!w || w.mode !== 'write_off')
    return blockPrereq('M2FNQ-47', 'No write-off window (M2FN_VN_FLAG_WINDOW=<App>:write_off)');
  const d = vn.team.users.find((u) => u.app === w.app && writable(u));
  if (!d) return blockPrereq(VN_BLOCK.state, `${w.app}: no writable team user`);
  const o = await vn.save(d);
  const before = await vn.piiRow(d);
  const fake = vnName(vn, 'Qa');
  expect((await vn.rename(d, fake)).status).toBe(200);
  expect((await vn.dbName(d, fake)).isValue, 'Postgres changed').toBe(true);
  expect((await vn.piiRow(d))?.hash, 'PII row unchanged').toBe(before?.hash);
  expect(await vn.cmsName(d), 'views keep the old PII name').toBe(o.firstName);
});

vnScenario('M2FN-VERR-001', async (vn) => {
  const app = vn.cfg.piiOutageApp;
  if (!app) return blockPrereq('M2FNQ-47', 'No PII outage window (M2FN_VN_PII_OUTAGE_WINDOW=<App>)');
  const d = vn.team.users.find((u) => u.app === app && writable(u));
  if (!d) return blockPrereq(VN_BLOCK.state, `${app}: no writable team user`);
  const o = await vn.save(d);
  const launch = await vn.asUser(d, VN.appLaunch);
  expect(
    (await vn.dbName(d, String((launch.json() as Record<string, unknown>).first_name))).isValue,
    'read falls back to Postgres',
  ).toBe(true);
  const res = await vn.rename(d, vnName(vn, 'Qa'));
  expect(res.status, 'rename during the outage').toBe(503);
  expect((await vn.dbName(d, o.firstName)).isValue, 'Postgres unchanged').toBe(true);
});

// ---- Blocked by design (shown so their reasons are reported) --------------------------------------------------------------
for (const id of ['M2FN-VLST-003', 'M2FN-VHID-004', 'M2FN-VWRT-002'])
  vnScenario(id, async () => {
    blockPrereq('M2FN-VN', 'Blocked by design (see the case’s questions / decision)');
  });
