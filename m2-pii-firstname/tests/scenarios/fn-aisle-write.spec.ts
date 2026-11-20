/**
 * M2 PII First Name — Aisle write paths and cross-path cases: A-W1 name write, A-W2 reset profile, A-R8 chat-list
 * cache, A-H1 unhide vs chat list, read / write gate windows and PII errors.
 * Design: m2-pii-firstname/scripts/m2fn-firstname-cases.data.ts (approved 2026-11-11).
 *
 * Synthetic accounts only (+91 10…, never the 106 series); every rename targets the case’s own throwaway account.
 * Gate / outage cases run only inside a Dev window (M2FN_FLAG_WINDOW, M2FN_PII_OUTAGE_WINDOW) — QA never changes
 * flags or AISLE_staging_configuration_constant. Chat-list cases stay Blocked until the conversation cache key and its
 * key-guard permission are known (M2FNQ-10).
 */
import { expect } from '@playwright/test';
import { blockPrereq } from '../../../m2/src/prereq';
import { asTestToken, asUser, call, deepFind, INTERNALS } from '../../../m2/src/scenarios/helpers';
import { scenario } from '../../src/define';
import {
  adminCaller,
  cachedProfileName,
  clearPiiKey,
  divergent,
  expectDbName,
  getKey,
  noPii,
  ownName,
  piiRead,
  profileInfo,
  profileSource,
  record,
  refFor,
  uniqueName,
  userIdOf,
} from '../../src/first-name';
import { test } from '../../src/fixtures';
import { bodyOf, piiFirstNameKey } from '../../src/redis-keys';

const CLEANUP: [string, string][] = [
  ['Anne-Marie', 'AnneMarie'],
  ['José', 'Jos'],
  ['José', 'Jose'],
  [' Ravi ', 'Ravi'],
  ['O’Neil', 'ONeil'],
  ['Mary Ann', 'MaryAnn'],
  ['Ravi2', 'Ravi'],
  ['123', '123'],
  ['देवी', 'देवी'],
  ['李', '李'],
  ['😀', '😀'],
  ['Q', 'Q'],
];

test.describe('M2 PII First Name — Aisle writes, reset, chat list and gates', () => {
  test.describe.configure({ timeout: 300_000 });

  // ---- A-W1 name write -----------------------------------------------------------------------------------------
  scenario('M2FN-WRT-001', async (fx) => {
    const d = await divergent(fx, 'M2FN-WRT-001');
    const userId = userIdOf(d.p);
    const z = uniqueName(fx, 'Zv');
    const edit = await call(fx, 'API-058', asUser(fx, d.p, undefined, 'owner'), {
      synthetic: { firstName: z },
    });
    expect(edit.status, `user/edit: HTTP ${edit.status}`).toBe(200);
    expect.soft(deepFind(edit.json(), 'first_name') === z, 'the edit reply shows Z').toBe(true);
    expect((await ownName(fx, d.p)).name === z, 'own profile shows Z').toBe(true);
    const a = await fx.accounts.onboarded(0);
    expect((await profileInfo(fx, a, d.p)).name === z, 'A sees Z').toBe(true);
    expect((await piiRead(fx, userId)).name === z, 'the PII service holds Z').toBe(true);
    const key = await getKey(fx, piiFirstNameKey(userId), 'PII key after the edit');
    expect(key.value === z, 'the PII field cache holds Z').toBe(true);
    const cached = await cachedProfileName(fx, refFor(d.p));
    record(
      `profile cache after the edit: ${cached.status === 200 ? (cached.name === z ? 'holds Z' : 'holds another value') : `HTTP ${cached.status} (pending profiles are not cached)`}`,
    );
    if (cached.status === 200) expect.soft(cached.name === z, 'the profile cache holds Z').toBe(true);
    await expectDbName(fx, userId, z, 'Aisle DB profiles.first_name = Z');
  });

  scenario('M2FN-WRT-002', async (fx) => {
    const p = await fx.accounts.throwaway('M2FN-WRT-002');
    const userId = userIdOf(p);
    const notes: string[] = [];
    for (const [input, rule] of CLEANUP) {
      const edit = await call(fx, 'API-058', asUser(fx, p, undefined, 'owner'), {
        synthetic: { firstName: input },
      });
      const pii = await piiRead(fx, userId);
      const label = `value ${CLEANUP.findIndex((c) => c[0] === input) + 1}`;
      if (edit.status >= 300) {
        notes.push(`${label}: edit HTTP ${edit.status}`);
        continue;
      }
      if (typeof pii.name === 'string') {
        const db = await expectDbName(fx, userId, pii.name, `${label}: PII = Aisle DB`);
        notes.push(
          `${label}: ${pii.name === rule ? 'matches the code rule' : 'differs from the code rule'}${db === undefined ? '' : db ? ', PII = DB' : ', PII ≠ DB'}`,
        );
      } else notes.push(`${label}: no PII name after the edit`);
    }
    record(`Clean-up results (M2FNQ-17): ${notes.join('; ')}`);
  });

  scenario('M2FN-WRT-003', async (fx) => {
    const p = await fx.accounts.throwaway('M2FN-WRT-003');
    const userId = userIdOf(p);
    const known = (await piiRead(fx, userId)).name;
    expect(typeof known === 'string', 'the account has a PII name').toBe(true);
    for (const v of ['', '   ', known as string]) {
      const edit = await call(fx, 'API-058', asUser(fx, p, undefined, 'owner'), {
        synthetic: { firstName: v },
      });
      record(
        `edit with a ${v === '' ? 'blank' : v.trim() === '' ? 'spaces-only' : 'unchanged'} name: HTTP ${edit.status}`,
      );
      expect((await piiRead(fx, userId)).name === known, 'the PII name is unchanged').toBe(true);
    }
  });

  scenario('M2FN-WRT-004', async (fx) => {
    const p = await fx.accounts.throwaway('M2FN-WRT-004');
    const userId = userIdOf(p);
    const known = (await piiRead(fx, userId)).name;
    const res = await call(fx, 'API-057', asUser(fx, p, undefined, 'owner'), {
      synthetic: { firstName: uniqueName(fx, 'Zu'), gender: p.gender ?? 'Male' },
    });
    record(`second submit_profile: HTTP ${res.status}`);
    expect((await piiRead(fx, userId)).name === known, 'the PII name is unchanged').toBe(true);
  });

  scenario('M2FN-WRT-005', async (fx) => {
    if (fx.m2fnConfig.flagWindow !== 'write_off')
      blockPrereq('M2FNQ-08', 'Needs Dev’s write-gate-OFF window (set M2FN_FLAG_WINDOW=write_off during it)');
    const p = await fx.accounts.throwaway('M2FN-WRT-005');
    const userId = userIdOf(p);
    const old = (await piiRead(fx, userId)).name;
    const z = uniqueName(fx, 'Zt');
    const edit = await call(fx, 'API-058', asUser(fx, p, undefined, 'owner'), {
      synthetic: { firstName: z },
    });
    record(`edit while the write gate is off: HTTP ${edit.status}`);
    await expectDbName(fx, userId, z, 'Aisle DB = Z');
    const pii = await piiRead(fx, userId);
    expect.soft(pii.name === old, 'PII keeps the old name').toBe(true);
    const own = await ownName(fx, p);
    record(
      `own profile shows ${own.name === old ? 'the OLD PII name (M2FNQ-25)' : own.name === z ? 'Z' : 'another value'}`,
    );
  });

  scenario('M2FN-WRT-006', async (fx) => {
    if (!fx.m2fnConfig.piiOutageWindow)
      blockPrereq('M2FNQ-09', 'Needs Dev’s PII-error window (set M2FN_PII_OUTAGE_WINDOW=true during it)');
    const p = await fx.accounts.throwaway('M2FN-WRT-006');
    const userId = userIdOf(p);
    const z = uniqueName(fx, 'Zs');
    const edit = await call(fx, 'API-058', asUser(fx, p, undefined, 'owner'), {
      synthetic: { firstName: z },
    });
    record(`edit during the PII error window: HTTP ${edit.status}`);
    expect(INTERNALS.test(edit.rawText()), 'no stack trace or file path').toBe(false);
    const db = await expectDbName(fx, userId, z, 'Aisle DB = Z (code prediction)');
    record(
      `Aisle DB ${db === undefined ? 'not checked' : db ? 'holds Z' : 'does not hold Z'}; PII is read after the window`,
    );
  });

  // ---- A-W2 reset ------------------------------------------------------------------------------------------------
  scenario('M2FN-RST-001', async (fx) => {
    const { n, x } = await noPii(fx, 'M2FN-RST-001');
    const userId = userIdOf(n);
    const pii = await piiRead(fx, userId);
    expect(pii.name, 'no PII name for the new account').toBeNull();
    if (x) await expectDbName(fx, userId, x, 'Aisle DB holds the copied name');
    const own = await ownName(fx, n);
    expect.soft(own.res.status, `own profile: HTTP ${own.res.status}`).toBeLessThan(500);
    const a = await fx.accounts.onboarded(0);
    const other = await profileInfo(fx, a, n);
    record(
      `after reset: own name ${own.name == null ? 'null' : 'present'}, A’s view ${other.name == null ? 'null' : 'present'} (M2FNQ-12)`,
    );
    expect
      .soft(x === undefined || (own.name !== x && other.name !== x), 'no view shows the Aisle-DB copy')
      .toBe(true);
  });

  scenario('M2FN-RST-002', async (fx) => {
    const { n } = await noPii(fx, 'M2FN-RST-002');
    const userId = userIdOf(n);
    const z = uniqueName(fx, 'Zr');
    const edit = await call(fx, 'API-058', asUser(fx, n, undefined, 'owner'), {
      synthetic: { firstName: z },
    });
    expect(edit.status, `user/edit after the reset: HTTP ${edit.status}`).toBe(200);
    expect((await piiRead(fx, userId)).name === z, 'PII holds Z').toBe(true);
    expect((await ownName(fx, n)).name === z, 'own profile shows Z').toBe(true);
    const a = await fx.accounts.onboarded(0);
    expect((await profileInfo(fx, a, n)).name === z, 'A sees Z').toBe(true);
  });

  // ---- A-R8 chat list / A-H1 unhide (Blocked until M2FNQ-10) ---------------------------------------------------------
  for (const id of ['M2FN-CHT-001', 'M2FN-CHT-002', 'M2FN-CHT-003', 'M2FN-CHT-004', 'M2FN-HID-003'])
    scenario(id, async () => {
      blockPrereq(
        'M2FNQ-10',
        'The conversation cache key name and the key-guard permission for the suite’s own conversation are not known yet',
      );
    });

  // ---- Gates / PII errors --------------------------------------------------------------------------------------------
  scenario('M2FN-FLG-001', async (fx) => {
    if (fx.m2fnConfig.flagWindow !== 'read_off')
      blockPrereq('M2FNQ-08', 'Needs Dev’s read-gate-OFF window (set M2FN_FLAG_WINDOW=read_off during it)');
    const d = await divergent(fx, 'M2FN-D');
    const a = await fx.accounts.onboarded(0);
    expect.soft((await profileInfo(fx, a, d.p)).name === d.x, 'profile_info answers X').toBe(true);
    const list = await call(fx, 'API-003', asTestToken(fx), { body: { refs: [refFor(d.p)] } });
    const entry = ((bodyOf(list).profiles ?? {}) as Record<string, { first_name?: unknown } | null>)[
      refFor(d.p)
    ];
    expect.soft(entry?.first_name === d.x, 'profile_first_names answers X').toBe(true);
    expect.soft((await ownName(fx, d.p)).name === d.x, 'own profile answers X').toBe(true);
    expect
      .soft((await piiRead(fx, userIdOf(d.p))).name === d.y, 'the PII read route still answers Y')
      .toBe(true);
    const search = await call(fx, 'API-160', await adminCaller(fx, d.p), {
      query: { first_name: d.y, ref: refFor(d.p), phone_number: d.p.mobileNumber, page: '1' },
    });
    expect
      .soft(
        JSON.stringify(search.json() ?? {}).includes(refFor(d.p)),
        'the CMS PII search still finds D by Y',
      )
      .toBe(true);
    const src = await profileSource(fx, refFor(d.p));
    expect.soft(src.body.profile_response_uses_pii === false, 'profile_response_uses_pii false').toBe(true);
  });

  scenario('M2FN-ERR-001', async (fx) => {
    if (!fx.m2fnConfig.piiOutageWindow)
      blockPrereq('M2FNQ-09', 'Needs Dev’s PII-error window (set M2FN_PII_OUTAGE_WINDOW=true during it)');
    const d = await divergent(fx, 'M2FN-ERR-001');
    await clearPiiKey(fx, userIdOf(d.p));
    const a = await fx.accounts.onboarded(0);
    const replies = [
      ['profile_info', (await profileInfo(fx, a, d.p)).res],
      ['profile_first_names', await call(fx, 'API-003', asTestToken(fx), { body: { refs: [refFor(d.p)] } })],
      ['PII read route', await call(fx, 'API-001', asTestToken(fx), { query: { user_id: userIdOf(d.p) } })],
      [
        'CMS name search',
        await call(fx, 'API-160', await adminCaller(fx, d.p), {
          query: { first_name: d.y, ref: refFor(d.p), phone_number: d.p.mobileNumber, page: '1' },
        }),
      ],
    ] as const;
    record(`PII error window: ${replies.map(([l, r]) => `${l} HTTP ${r.status}`).join('; ')}`);
    for (const [label, r] of replies) {
      expect.soft(INTERNALS.test(r.rawText()), `${label}: no stack trace or file path`).toBe(false);
      expect.soft(r.rawText().includes(d.x), `${label}: no Aisle-DB name in the body`).toBe(false);
    }
  });
});
