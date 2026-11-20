/**
 * M2 PII First Name — Aisle read paths (A-R1 single profile, A-R2 lists, A-R5 own name, A-R10 full name, A-H1 hide,
 * A-R9 live audio). Design: m2-pii-firstname/scripts/m2fn-firstname-cases.data.ts (approved 2026-11-11).
 *
 * Every case uses the suite’s own synthetic accounts (+91 10…, never the 106 series): D (Aisle-DB name X, PII name Y),
 * N (no PII name, after reset_profile) and the viewer A (pooled onboarded account 0). CMS writes (approve, selfie)
 * only touch suite-created accounts. Assertion messages never print a name.
 */
import { expect } from '@playwright/test';
import { noteEvidence } from '../../../m2/src/fixtures/m2-fixtures';
import { asTestToken, asUser, call, deepFind, INTERNALS } from '../../../m2/src/scenarios/helpers';
import { blockPrereq } from '../../../m2/src/prereq';
import { scenario } from '../../src/define';
import {
  approveOwn,
  approvedPooled,
  cachedProfileName,
  clearPiiKey,
  connect,
  divergent,
  facadeWriteName,
  getKey,
  hideNameOwn,
  hideState,
  initialOf,
  nameOfRef,
  noPii,
  ownName,
  piiRead,
  profileInfo,
  profileSource,
  record,
  refFor,
  ROUTES,
  uniqueName,
  userIdOf,
} from '../../src/first-name';
import { test } from '../../src/fixtures';
import { bodyOf, piiFirstNameKey, profileKey, redisCall } from '../../src/redis-keys';

test.describe('M2 PII First Name — Aisle read paths', () => {
  // Onboarding / resetting synthetic accounts takes longer than one API call.
  test.describe.configure({ timeout: 300_000 });

  // ---- A-R1 single profile ------------------------------------------------------------------------------------
  scenario('M2FN-PRF-001', async (fx) => {
    const d = await divergent(fx, 'M2FN-D');
    const a = await fx.accounts.onboarded(0);
    const other = await profileInfo(fx, a, d.p);
    expect(other.res.status, `profile_info as A: HTTP ${other.res.status}`).toBe(200);
    expect(other.name === d.y, 'A sees the PII name Y').toBe(true);
    expect(other.name !== d.x, 'A does not see the Aisle-DB name X').toBe(true);
    const self = await profileInfo(fx, d.p, d.p);
    expect(self.name === d.y, 'D’s own ref through profile_info shows Y').toBe(true);
    const src = await profileSource(fx, refFor(d.p));
    expect(
      src.body.profile_response_uses_pii === true,
      'the test aid reports profile_response_uses_pii',
    ).toBe(true);
    expect(src.body.db_first_name_after === d.x, 'the Aisle DB still holds X (test aid report)').toBe(true);
  });

  scenario('M2FN-PRF-002', async (fx) => {
    const d = await divergent(fx, 'M2FN-PRF-002');
    await approveOwn(fx, d.p);
    const ref = refFor(d.p);
    const a = await fx.accounts.onboarded(0);
    const r1 = await profileInfo(fx, a, d.p);
    expect(r1.name === d.y, 'first read shows Y').toBe(true);
    const c1 = await cachedProfileName(fx, ref);
    expect(c1.status, `GET the profile cache key: HTTP ${c1.status}`).toBe(200);
    expect(c1.name === d.y, 'the profile cache holds Y').toBe(true);
    expect(c1.name !== d.x, 'the profile cache does not hold X').toBe(true);
    const r2 = await profileInfo(fx, a, d.p);
    expect(r2.name === d.y, 'cache-hit read shows Y').toBe(true);
    const admin = await fx.cms.admin();
    const del = await redisCall(fx, 'delete', admin, profileKey(ref), fx.scope(), {
      label: 'clear profile cache',
    });
    expect(del.status, `DELETE the profile cache key: HTTP ${del.status}`).toBe(200);
    expect((await getKey(fx, profileKey(ref), 'after delete')).status, 'the profile cache key is gone').toBe(
      404,
    );
    const r3 = await profileInfo(fx, a, d.p);
    expect(r3.name === d.y, 'cache-miss read shows Y').toBe(true);
    const c3 = await cachedProfileName(fx, ref);
    expect(c3.status, `the profile cache is filled again: HTTP ${c3.status}`).toBe(200);
    expect(c3.name === d.y, 'the refilled cache holds Y').toBe(true);
  });

  scenario('M2FN-PRF-003', async (fx) => {
    const d = await divergent(fx, 'M2FN-PRF-003');
    await approveOwn(fx, d.p);
    const ref = refFor(d.p);
    const userId = userIdOf(d.p);
    const a = await fx.accounts.onboarded(0);
    expect((await profileInfo(fx, a, d.p)).name === d.y, 'first read shows Y').toBe(true);
    expect((await cachedProfileName(fx, ref)).name === d.y, 'the profile cache holds Y').toBe(true);
    const z = uniqueName(fx, 'Zx');
    await facadeWriteName(fx, userId, z);
    await clearPiiKey(fx, userId);
    const r = await profileInfo(fx, a, d.p);
    expect(r.name === z, 'the read is hydrated with the new PII value Z').toBe(true);
    const c = await cachedProfileName(fx, ref);
    expect
      .soft(c.name === d.y, 'the profile cache JSON still holds the old Y (not refilled by a hit)')
      .toBe(true);
  });

  scenario('M2FN-PRF-004', async (fx) => {
    const d = await divergent(fx, 'M2FN-PRF-004');
    const userId = userIdOf(d.p);
    const a = await fx.accounts.onboarded(0);
    expect((await profileInfo(fx, a, d.p)).name === d.y, 'first read shows Y').toBe(true);
    const z = uniqueName(fx, 'Zw');
    await facadeWriteName(fx, userId, z);
    const hit = await profileInfo(fx, a, d.p);
    record(
      `After the facade write the read shows ${hit.name === d.y ? 'the old Y (PII field cache hit)' : hit.name === z ? 'the new Z' : 'another value'} — recorded, not judged (M2FNQ-24 answer)`,
    );
    await clearPiiKey(fx, userId);
    const after = await profileInfo(fx, a, d.p);
    expect(after.name === z, 'after the PII key is cleared the read shows Z').toBe(true);
    const key = await getKey(fx, piiFirstNameKey(userId), 'PII key after read');
    expect(key.status, `PII key refilled: HTTP ${key.status}`).toBe(200);
    expect(key.value === z, 'the PII key holds Z').toBe(true);
  });

  scenario('M2FN-PRF-005', async (fx) => {
    const { n, x } = await noPii(fx, 'M2FN-PRF-005');
    const pii = await piiRead(fx, userIdOf(n));
    record(
      `PII read of the reset account: HTTP ${pii.status}, name ${pii.name === null ? 'absent' : 'present'}`,
    );
    expect(pii.name, 'the PII service has no name for the reset account').toBeNull();
    const a = await fx.accounts.onboarded(0);
    const v = await profileInfo(fx, a, n);
    expect(v.res.status, `profile_info of the no-PII user: HTTP ${v.res.status}`).toBe(200);
    expect(v.name === null || v.name === undefined, 'the name is null (code: no fallback)').toBe(true);
    expect(x === undefined || v.name !== x, 'the Aisle-DB copy is not shown').toBe(true);
  });

  scenario('M2FN-PRF-006', async (fx) => {
    const a = await fx.accounts.onboarded(0);
    const res = await call(fx, 'API-011', asUser(fx, a, undefined, 'viewer'), {
      query: { ref: `${fx.m2Config.runId}-noprofile` },
    });
    expect(res.status, `profile_info with an unknown ref: HTTP ${res.status}`).toBe(200);
    expect(deepFind(res.json(), 'deleted'), 'deleted: true').toBe(true);
    expect(deepFind(res.json(), 'first_name'), 'no first_name in the reply').toBeUndefined();
    expect(INTERNALS.test(res.rawText()), 'no stack trace or file path').toBe(false);
  });

  // ---- A-R2 lists ------------------------------------------------------------------------------------------
  scenario('M2FN-LST-001', async (fx) => {
    const d = await divergent(fx, 'M2FN-D');
    const b = await fx.accounts.onboarded(1);
    const { n } = await noPii(fx, 'M2FN-LST-001');
    await clearPiiKey(fx, userIdOf(d.p));
    const bName = (await piiRead(fx, userIdOf(b))).name; // cache hit for B in the batch
    const unknown = `${fx.m2Config.runId}-noprofile`;
    const refs = [refFor(d.p), refFor(b), refFor(n), unknown];
    const res = await call(fx, 'API-003', asTestToken(fx), { body: { refs } });
    expect(res.status, `profile_first_names: HTTP ${res.status}`).toBe(200);
    const body = bodyOf(res);
    const profiles = (body.profiles ?? {}) as Record<string, { first_name?: unknown } | null>;
    expect(profiles[refs[0]!]?.first_name === d.y, 'D → Y (cache miss)').toBe(true);
    expect(profiles[refs[1]!]?.first_name === bName, 'B → its PII name (cache hit)').toBe(true);
    expect(profiles[refs[2]!] !== null && profiles[refs[2]!]?.first_name == null, 'N → first_name null').toBe(
      true,
    );
    expect(profiles[unknown] === null, 'unknown ref → null entry').toBe(true);
    expect(body.requested_ref_count, 'requested_ref_count').toBe(4);
    expect(body.returned_ref_count, 'returned_ref_count').toBe(3);
  });

  scenario('M2FN-LST-002', async (fx) => {
    if (!fx.m2fnConfig.batchAccounts)
      blockPrereq(
        'M2FNQ-30',
        'Opt-in run flag M2FN_BATCH_ACCOUNTS=true is not set (the case creates 51 synthetic accounts)',
      );
    fx.accounts.requireCreate();
    test.setTimeout(60 * 60_000);
    const users: { userId: string; ref: string; name: string }[] = [];
    for (let i = 0; i < 51; i++) {
      const p = await fx.accounts.throwaway(`M2FN-LST-002-${i}`);
      users.push({ userId: userIdOf(p), ref: refFor(p), name: p.known?.firstName ?? '' });
      await clearPiiKey(fx, userIdOf(p));
    }
    const ids = users.map((u) => u.userId);
    const batch = await call(fx, 'API-190', asTestToken(fx), { body: { user_ids: [...ids, ids[0]!] } });
    expect(batch.status, `first_names/batch: HTTP ${batch.status}`).toBe(200);
    const b = bodyOf(batch);
    expect(b.returned_user_count, 'returned_user_count 51 (duplicate removed)').toBe(51);
    const names = (b.first_names ?? {}) as Record<string, unknown>;
    expect(users.filter((u) => names[u.userId] !== u.name).length, 'users with a wrong name (batch)').toBe(0);
    const list = await call(fx, 'API-003', asTestToken(fx), { body: { refs: users.map((u) => u.ref) } });
    const profiles = (bodyOf(list).profiles ?? {}) as Record<string, { first_name?: unknown } | null>;
    expect(
      users.filter((u) => profiles[u.ref]?.first_name !== u.name).length,
      'users with a wrong name (profile_first_names)',
    ).toBe(0);
  });

  scenario('M2FN-LST-003', async (fx) => {
    const a = await approvedPooled(fx, 0);
    const d = await divergent(fx, 'M2FN-LST-003');
    await approveOwn(fx, d.p);
    const pass = await call(fx, 'API-050', asUser(fx, a, d.p, 'A'), { body: { ref: refFor(d.p) } });
    expect(pass.status, `pass_user: HTTP ${pass.status}`).toBeLessThan(300);
    const list = await call(fx, 'API-049', asUser(fx, a, undefined, 'A'));
    expect(list.status, `list_all_passed: HTTP ${list.status}`).toBe(200);
    const shown = nameOfRef(list.json(), d.p.ref);
    if (shown === undefined) noteEvidence('D is not in A’s passed list (reply shape recorded)');
    expect(shown === d.y, 'D’s entry shows Y').toBe(true);
    const ownInfo = deepFind(deepFind(list.json(), 'own_info'), 'first_name');
    const aName = (await piiRead(fx, userIdOf(a))).name;
    expect.soft(ownInfo === aName, 'own_info shows A’s PII name').toBe(true);
  });

  scenario('M2FN-LST-004', async (fx) => {
    const d = await divergent(fx, 'M2FN-LST-004');
    await approveOwn(fx, d.p);
    try {
      await hideNameOwn(fx, d.p, true);
      const res = await call(fx, 'API-003', asTestToken(fx), { body: { refs: [refFor(d.p)] } });
      const shown = ((bodyOf(res).profiles ?? {}) as Record<string, { first_name?: unknown } | null>)[
        refFor(d.p)
      ]?.first_name;
      expect(shown === initialOf(d.y), 'the list shows the initial of Y').toBe(true);
      expect(shown !== initialOf(d.x) || initialOf(d.x) === initialOf(d.y), 'not the initial of X').toBe(
        true,
      );
    } finally {
      if ((await hideState(fx, d.p)) === true) await call(fx, 'API-032', asUser(fx, d.p, undefined, 'owner'));
    }
  });

  scenario('M2FN-LST-005', async (fx) => {
    const p = await fx.accounts.throwaway('M2FN-LST-005');
    await approveOwn(fx, p);
    const userId = userIdOf(p);
    const edit = await call(fx, 'API-058', asUser(fx, p, undefined, 'owner'), {
      synthetic: { firstName: 'Q' },
    });
    expect(edit.status, `rename to a 1-letter name: HTTP ${edit.status}`).toBeLessThan(300);
    const y = uniqueName(fx, 'Qz');
    await facadeWriteName(fx, userId, y);
    await clearPiiKey(fx, userId);
    const cached = await cachedProfileName(fx, refFor(p));
    record(
      `profile cache before the list read: ${cached.status === 200 ? (cached.name === 'Q' ? '"Q"' : 'another value') : `HTTP ${cached.status}`}`,
    );
    const res = await call(fx, 'API-003', asTestToken(fx), { body: { refs: [refFor(p)] } });
    const shown = ((bodyOf(res).profiles ?? {}) as Record<string, { first_name?: unknown } | null>)[refFor(p)]
      ?.first_name;
    record(
      `List shows ${shown === 'Q' ? 'the 1-letter initial "Q" (code prediction: shown as hidden)' : shown === y ? 'the full PII name' : 'another value'} for a user who is not hidden (M2FNQ-14)`,
    );
    expect(shown === 'Q' || shown === y, 'the list shows a value derived from the stored names').toBe(true);
  });

  // ---- A-R5 own name ---------------------------------------------------------------------------------------
  scenario('M2FN-OWN-001', async (fx) => {
    const d = await divergent(fx, 'M2FN-D');
    const own = await ownName(fx, d.p);
    expect(own.res.status, `own profile: HTTP ${own.res.status}`).toBe(200);
    expect(own.name === d.y, 'the own profile shows Y in full').toBe(true);
    expect(own.name !== d.x, 'not the Aisle-DB name X').toBe(true);
    expect(deepFind(own.res.json(), 'hide_first_name'), 'hide_first_name false').toBe(false);
  });

  scenario('M2FN-OWN-002', async (fx) => {
    const d = await divergent(fx, 'M2FN-OWN-002');
    try {
      await hideNameOwn(fx, d.p, true);
      const forms: string[] = [];
      const check = (label: string, v: unknown) => {
        const form =
          v === d.y ? 'full' : v === initialOf(d.y) ? 'initial' : v === undefined ? 'absent' : 'other';
        forms.push(`${label}: ${form}`);
        expect
          .soft(
            (v !== d.x && v !== initialOf(d.x)) || initialOf(d.x) === initialOf(d.y),
            `${label}: not from X`,
          )
          .toBe(true);
      };
      check('verify_user', deepFind((await call(fx, 'API-088', asUser(fx, d.p))).json(), 'first_name'));
      check('fetch_own_info', deepFind((await call(fx, 'API-013', asUser(fx, d.p))).json(), 'first_name'));
      const web = await fx.accounts.sessions.webToken(d.p);
      if (web) {
        const w = await call(
          fx,
          'API-120',
          { ...asUser(fx, d.p), auth: { kind: 'secret', label: 'web JWT', secret: web } },
          { values: { REF: refFor(d.p) } },
        );
        check('web /web/users/:ref', deepFind(w.json(), 'first_name'));
      } else forms.push('web: no web token issued');
      record(`Own-name forms while hidden (M2FNQ-16): ${forms.join('; ')}`);
    } finally {
      if ((await hideState(fx, d.p)) === true) await call(fx, 'API-032', asUser(fx, d.p, undefined, 'owner'));
    }
  });

  scenario('M2FN-OWN-003', async (fx) => {
    const { n, x } = await noPii(fx, 'M2FN-OWN-003');
    for (const [api, label] of [
      ['API-021', 'own profile'],
      ['API-013', 'fetch_own_info'],
      ['API-088', 'verify_user'],
    ] as const) {
      const res = await call(fx, api, asUser(fx, n, undefined, 'owner'), { values: { REF: refFor(n) } });
      expect.soft(res.status, `${label}: HTTP ${res.status}`).toBeLessThan(500);
      const v = deepFind(res.json(), 'first_name');
      expect.soft(v === null || v === undefined, `${label}: first_name is null`).toBe(true);
      expect.soft(x === undefined || v !== x, `${label}: not the Aisle-DB copy`).toBe(true);
    }
  });

  scenario('M2FN-OWN-004', async (fx) => {
    const a = await approvedPooled(fx, 0);
    const d = await divergent(fx, 'M2FN-OWN-004');
    await approveOwn(fx, d.p);
    const conv = await connect(fx, a, d.p);
    const video = await call(fx, 'API-067', asUser(fx, a, d.p), { query: { conversation_id: conv } });
    const text = JSON.stringify(video.json() ?? {});
    expect.soft(text.includes(d.x), 'the video-call text does not carry X').toBe(false);
    record(`can_video_call text ${text.includes(d.y) ? 'contains Y' : 'does not name D'}`);
    const ex = await profileInfo(fx, a, d.p, { conversation_id: conv });
    const t2 = JSON.stringify(ex.res.json() ?? {});
    expect.soft(t2.includes(d.x), 'the exclusivity text does not carry X').toBe(false);
    expect(ex.name === d.y, 'profile_info with conversation_id shows Y').toBe(true);
  });

  // ---- A-R10 full name --------------------------------------------------------------------------------------
  const shareLink = async (
    fx: Parameters<Parameters<typeof scenario>[1]>[0],
    sharer: Parameters<typeof asUser>[1],
    about: { ref?: string | undefined },
  ) =>
    call(fx, 'API-018', asUser(fx, sharer, undefined, 'sharer'), {
      query: { recommended_profile_ref: about.ref ?? '' },
    });

  scenario('M2FN-FUL-001', async (fx) => {
    const d = await divergent(fx, 'M2FN-D');
    const a = await fx.accounts.onboarded(0);
    const res = await shareLink(fx, d.p, a);
    expect(res.status, `get_shareable_link: HTTP ${res.status}`).toBe(200);
    const text = String(deepFind(res.json(), 'preview_text') ?? '');
    expect(text.includes(d.x), 'preview_text does not contain X').toBe(false);
    if (text.includes(d.y)) record('preview_text contains the sharer’s PII name Y');
    else
      record(
        'preview_text contains no sharer name: the staging link_preview_text has no RECOMMENDER placeholder (seen 2026-11-11) — only “no X” is checked',
      );
  });

  scenario('M2FN-FUL-002', async (fx) => {
    const d = await divergent(fx, 'M2FN-FUL-002');
    const a = await fx.accounts.onboarded(0);
    try {
      await hideNameOwn(fx, d.p, true);
      const res = await shareLink(fx, d.p, a);
      const text = String(deepFind(res.json(), 'preview_text') ?? '');
      expect(text.includes(d.x), 'preview_text does not contain X').toBe(false);
      record(
        `Hidden sharer: preview_text ${text.includes(d.y) ? 'contains the FULL name (code prediction, M2FNQ-15)' : text.includes(initialOf(d.y)) ? 'does not contain the full name' : 'names nobody'}`,
      );
    } finally {
      if ((await hideState(fx, d.p)) === true) await call(fx, 'API-032', asUser(fx, d.p, undefined, 'owner'));
    }
  });

  scenario('M2FN-FUL-003', async (fx) => {
    const { n } = await noPii(fx, 'M2FN-FUL-003');
    const a = await fx.accounts.onboarded(0);
    const res = await shareLink(fx, n, a);
    record(`Share link for a sharer without a PII name: HTTP ${res.status} (code prediction 500, M2FNQ-13)`);
    expect(INTERNALS.test(res.rawText()), 'no stack trace or file path in the reply').toBe(false);
  });

  scenario('M2FN-FUL-004', async (fx) => {
    const a = await approvedPooled(fx, 0);
    const d = await divergent(fx, 'M2FN-FUL-004');
    await approveOwn(fx, d.p);
    try {
      await hideNameOwn(fx, d.p, true);
      const conv = await connect(fx, a, d.p);
      const msgs = await call(fx, 'API-069', asUser(fx, a, d.p), { body: { conversation_id: conv } });
      const text = JSON.stringify(msgs.json() ?? {});
      expect.soft(text.includes(d.x), 'chat history does not carry X').toBe(false);
      record(
        `Hidden sender in chat history: ${text.includes(d.y) ? 'FULL name present (code prediction, M2FNQ-15)' : 'full name not present'} (HTTP ${msgs.status})`,
      );
    } finally {
      if ((await hideState(fx, d.p)) === true) await call(fx, 'API-032', asUser(fx, d.p, undefined, 'owner'));
    }
  });

  // ---- A-H1 hide ----------------------------------------------------------------------------------------------
  scenario('M2FN-HID-001', async (fx) => {
    const d = await divergent(fx, 'M2FN-D');
    const t = await call(fx, 'API-032', asUser(fx, d.p, undefined, 'owner'));
    expect(t.status, `toggle_hide_name: HTTP ${t.status}`).toBe(200);
    expect(bodyOf(t).status, 'status true').toBe(true);
    expect(bodyOf(t).first_name === d.y, 'first_name = Y (not hidden)').toBe(true);
    const settings = await fx.m2.callRoute(ROUTES.fetchSettings, {
      auth: { kind: 'secret', label: 'user JWT', secret: d.p.token },
      device: d.p.device,
    });
    fx.observe('FN-AIS-066 fetch_settings', settings);
    expect.soft(settings.status, `fetch_settings: HTTP ${settings.status}`).toBe(200);
    expect.soft(deepFind(settings.json(), 'hide_first_name'), 'settings: hide_first_name false').toBe(false);
    expect(await hideState(fx, d.p), 'own profile: hide_first_name false').toBe(false);
  });

  scenario('M2FN-HID-002', async (fx) => {
    const d = await divergent(fx, 'M2FN-HID-002');
    const a = await fx.accounts.onboarded(0);
    try {
      await hideNameOwn(fx, d.p, true);
      const other = await profileInfo(fx, a, d.p);
      expect(other.name === initialOf(d.y), 'A sees the initial of Y').toBe(true);
      const own = await ownName(fx, d.p);
      expect(own.name === d.y, 'D sees Y in full').toBe(true);
      expect(deepFind(own.res.json(), 'hide_first_name'), 'hide_first_name true').toBe(true);
    } finally {
      if ((await hideState(fx, d.p)) === true) await call(fx, 'API-032', asUser(fx, d.p, undefined, 'owner'));
    }
  });

  // ---- A-R9 live audio ----------------------------------------------------------------------------------------
  scenario('M2FN-LIV-001', async (fx) => {
    const d = await divergent(fx, 'M2FN-D');
    const res = await call(fx, 'API-107', asUser(fx, d.p, undefined, 'owner'));
    const b = res.json();
    const empty = Array.isArray(b) ? b.length === 0 : JSON.stringify(b ?? {}).match(/\[\]/) !== null;
    record(
      `GET /V1/live_audio: HTTP ${res.status}; ${empty ? 'empty list (code prediction)' : 'not empty'} (M2FNQ-21)`,
    );
    expect(JSON.stringify(b ?? {}).includes(d.x), 'no Aisle-DB name in the reply').toBe(false);
  });
});
