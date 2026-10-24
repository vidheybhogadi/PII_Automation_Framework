/**
 * G1 — PII integration routes (/V1/pii_integration/*, TEST_TOKEN). Scenario cases M2-PIIR-*.
 *
 * Evidence: staging observations (2026-10-19 / 10-23) and the Aisle app code (develop_new 944f76a, answers recorded
 * on M2Q-01, M2Q-06, M2Q-35, M2Q-37, M2Q-40 — "from code, confirm with Dev"):
 *   - POST first_name writes only for an EXISTING app user (it loads the profile by user_id; a non-numeric id is an
 *     unhandled 500, an unknown numeric id 404). So the write cases use suite-created onboarded accounts
 *     (M2_CREATE_ACCOUNTS=true), whose app user id is also their PII user_id (M2Q-37); they are deleted at teardown.
 *   - write → 200 {status:true, user_id, ref, first_name:<normalised>}; missing / blank params → 400
 *     "Missing required parameter: <name>"; batch ids are de-duplicated; no batch size limit.
 *   - Name normalisation (assign_first_name): blank → ignored; stripped; reduced to A–Z letters when it contains any.
 *     Lossy cases ("José" → "Jos", "D'Souza" → "DSouza") are recorded as a possible defect, not asserted as correct.
 */
import type { ApiResponse } from '../../../core/http/api-response';
import { normalizeFirstName } from '../../scripts/m2-code-evidence';
import { AUTH } from '../../src/auth/credentials';
import { requireTestToken, type M2Config } from '../../src/config/m2-config';
import type { M2Client } from '../../src/clients/m2-client';
import { scenario } from '../../src/checks/define';
import { caseById, titleOf } from '../../src/design';
import { blockIfOpen, expect, noteEvidence, test } from '../../src/fixtures/m2-fixtures';
import { asTestToken, call, expectOk, nameOf, ownProfile, piiFirstName } from '../../src/scenarios/helpers';

const READ = 'API-001';
const WRITE = 'API-002';
const PROFILE_NAMES = 'API-003';
const BATCH = 'API-190';
const NAME_SOURCE = 'API-208';

type ReadBody = { status?: unknown; user_id?: unknown; first_name?: unknown } | undefined;

const token = (config: M2Config) => AUTH.testToken(requireTestToken(config));

async function write(
  m2: M2Client,
  config: M2Config,
  userId: string,
  firstName: unknown,
): Promise<ApiResponse> {
  return m2.call(WRITE, {
    auth: token(config),
    body: { user_id: userId, first_name: firstName },
    retry: false,
  });
}

async function read(m2: M2Client, config: M2Config, userId: string): Promise<ApiResponse> {
  return m2.call(READ, { auth: token(config), query: { user_id: userId } });
}

/** Observed read shape (2026-10-19): 200 {status:true, user_id, first_name}. Value-free messages. */
function expectRead(res: ApiResponse, userId: string, firstName: string | null, what: string) {
  const body = res.json() as ReadBody;
  expect(res.status, `${what}: ${res.summary()}`).toBe(200);
  expect(body?.status === true, `${what}: status:true`).toBe(true);
  expect(body?.user_id === userId, `${what}: the reply is for the requested user_id`).toBe(true);
  expect(
    body?.first_name === firstName,
    `${what}: first_name is ${firstName === null ? 'null' : 'the name written for this user'}`,
  ).toBe(true);
}

/** From code (M2Q-35): 200 {status:true, user_id, ref, first_name:<normalised>}. */
function expectWrite(res: ApiResponse, userId: string, firstName: string, what: string) {
  const body = res.json() as
    { status?: unknown; user_id?: unknown; ref?: unknown; first_name?: unknown } | undefined;
  expect(res.status, `${what}: ${res.summary()}`).toBe(200);
  expect(
    body?.status === true && body?.user_id === userId,
    `${what}: status:true for the requested user_id`,
  ).toBe(true);
  expect(typeof body?.ref === 'string' && body.ref.length > 0, `${what}: the profile ref is returned`).toBe(
    true,
  );
  expect(body?.first_name === normalizeFirstName(firstName), `${what}: the normalised name is returned`).toBe(
    true,
  );
}

test.describe('M2 G1 — PII integration routes (TEST_TOKEN)', () => {
  const c1 = caseById('M2-PIIR-001');
  test(titleOf(c1), { tag: c1.tags }, async ({ m2, m2Config, accounts, data, observe }) => {
    blockIfOpen(c1);
    const userId = (await accounts.onboarded(0)).userId!;
    const name = data.firstName();
    const w = await test.step('Save a fake first name with POST /V1/pii_integration/first_name', () =>
      write(m2, m2Config, userId, name));
    observe('write', w);
    expectWrite(w, userId, name, 'write');
    const r = await test.step('Read it back with GET /V1/pii_integration/first_name', () =>
      read(m2, m2Config, userId));
    observe('read', r);
    expectRead(r, userId, normalizeFirstName(name)!, 'read after write');
  });

  const c2 = caseById('M2-PIIR-002');
  test(titleOf(c2), { tag: c2.tags }, async ({ m2, m2Config, accounts, data, observe }) => {
    blockIfOpen(c2);
    const userId = (await accounts.onboarded(0)).userId!;
    const n1 = data.firstName();
    const n2 = data.firstName();
    for (const [label, n] of [
      ['write N1', n1],
      ['write N2', n2],
    ] as const) {
      const w = await write(m2, m2Config, userId, n);
      observe(label, w);
      expectWrite(w, userId, n, label);
    }
    expectRead(await read(m2, m2Config, userId), userId, n2, 'read after replacing N1 with N2');
    const again = await write(m2, m2Config, userId, n2);
    observe('repeat write N2', again);
    expectWrite(again, userId, n2, 'repeat write N2');
    expectRead(await read(m2, m2Config, userId), userId, n2, 'read after repeating N2');
  });

  const c3 = caseById('M2-PIIR-003');
  test(titleOf(c3), { tag: c3.tags }, async ({ m2, m2Config, data, observe }) => {
    blockIfOpen(c3);
    const userId = data.userId('never-written');
    const r = await test.step('Read the first name of a fake user who never saved one', () =>
      read(m2, m2Config, userId));
    observe('read', r);
    expectRead(r, userId, null, 'read for a never-written user');
  });

  const c4 = caseById('M2-PIIR-004');
  test(titleOf(c4), { tag: c4.tags }, async ({ m2, m2Config, data, observe }) => {
    blockIfOpen(c4);
    const auth = token(m2Config);
    const expect400 = (res: ApiResponse, what: string, text?: string) => {
      observe(what, res);
      expect(res.status, `${what}: ${res.summary()} — 400`).toBe(400);
      if (text) expect(res.rawText().includes(text), `${what}: error text "${text}"`).toBe(true);
    };
    expect400(
      await m2.call(READ, { auth }),
      'GET first_name without user_id',
      'Missing required parameter: user_id',
    );
    expect400(await m2.call(PROFILE_NAMES, { auth, body: { refs: [] } }), 'POST profile_first_names refs:[]');
    expect400(await m2.call(BATCH, { auth, body: { user_ids: [] } }), 'POST first_names/batch user_ids:[]');
    expect400(
      await m2.call(NAME_SOURCE, { auth, body: {} }),
      'POST profile_first_name_source {}',
      'Missing required parameter: user_id or ref',
    );
    // From code (M2Q-35): required_param raises before the profile lookup.
    expect400(
      await m2.call(WRITE, { auth, body: { first_name: data.firstName() }, retry: false }),
      'POST first_name without user_id',
      'Missing required parameter: user_id',
    );
    expect400(
      await m2.call(WRITE, { auth, body: { user_id: data.userId('piir004-noname') }, retry: false }),
      'POST first_name without first_name',
      'Missing required parameter: first_name',
    );
  });

  const c7 = caseById('M2-PIIR-007');
  test(titleOf(c7), { tag: c7.tags }, async ({ m2, m2Config, accounts, data, observe }) => {
    blockIfOpen(c7);
    const a = (await accounts.onboarded(0)).userId!;
    const b = (await accounts.onboarded(1)).userId!;
    const never = data.userId('piir007-c');
    const na = data.firstName();
    const nb = data.firstName();
    await test.step('Save fake names for users A and B', async () => {
      expectWrite(await write(m2, m2Config, a, na), a, na, 'write A');
      expectWrite(await write(m2, m2Config, b, nb), b, nb, 'write B');
    });
    const res = await test.step('Batch-read [A, B, never-written C, A again]', () =>
      m2.call(BATCH, { auth: token(m2Config), body: { user_ids: [a, b, never, a] } }));
    observe('batch read', res);
    const body = res.json() as
      | {
          first_names?: Record<string, unknown>;
          requested_user_count?: unknown;
          returned_user_count?: unknown;
        }
      | undefined;
    expect(res.status, `batch read: ${res.summary()} (observed 200, 2026-10-19)`).toBe(200);
    const names = body?.first_names ?? {};
    expect(names[a] === na, 'first_names maps A to A’s own name').toBe(true);
    expect(names[b] === nb, 'first_names maps B to B’s own name').toBe(true);
    expect(names[never] === undefined || names[never] === null, 'never-written C is absent or null').toBe(
      true,
    );
    expect(body?.requested_user_count, 'requested_user_count counts unique ids (from code, M2Q-35)').toBe(3);
  });
});

// ---- Remaining G1 scenarios ---------------------------------------------------------------------------------
test.describe('M2 G1 — PII integration routes: validation, batches, profiles', () => {
  scenario('M2-PIIR-005', async (fx) => {
    const tt = asTestToken(fx);
    const userId = (await fx.accounts.onboarded(0)).userId!;
    const seed = fx.data.firstName();
    expectOk(
      await call(fx, WRITE, tt, { body: { user_id: userId, first_name: seed }, retry: false }),
      'seed write',
    );
    for (const [label, value] of [
      ['null', null],
      ['empty', ''],
      ['whitespace', '   '],
    ] as const) {
      const res = await call(fx, WRITE, tt, { body: { user_id: userId, first_name: value }, retry: false });
      expect(res.status, `${label}: 400 "Missing required parameter: first_name" (from code)`).toBe(400);
      expect((await piiFirstName(fx, userId)) === seed, `${label}: the stored name is unchanged`).toBe(true);
    }
    // Code: no maximum length (profile validates presence only). Staging 2026-10-24: 256 characters → 500, which
    // wins over the code reading — the evidenced requirement is "no server error on input" (possible defect).
    const long = 'Q'.repeat(256);
    const res = await call(fx, WRITE, tt, { body: { user_id: userId, first_name: long }, retry: false });
    expect(res.status < 500, `256 characters: ${res.summary()} — no server error`).toBe(true);
    if (res.status === 200)
      expect((await piiFirstName(fx, userId)) === long, '256 characters: stored in full').toBe(true);
    else
      expect((await piiFirstName(fx, userId)) === seed, '256 characters refused: name unchanged').toBe(true);
    for (const [_label, value] of [
      ['number', 123],
      ['array', ['a']],
      ['object', { a: 1 }],
    ] as const)
      await call(fx, WRITE, tt, { body: { user_id: userId, first_name: value }, retry: false });
    noteEvidence(
      'Numbers / arrays / objects are converted to text by the app (from code) — recorded, not asserted.',
    );
  });

  scenario('M2-PIIR-006', async (fx) => {
    const tt = asTestToken(fx);
    const userId = (await fx.accounts.onboarded(0)).userId!;
    // Asserted: values the normalisation keeps intact. Recorded: lossy ones (possible defect, see report).
    for (const value of ['  Qa  ', 'qa', 'QA', 'देवा', 'தமிழ்']) {
      expectOk(
        await call(fx, WRITE, tt, { body: { user_id: userId, first_name: value }, retry: false }),
        'write',
      );
      expect(
        (await piiFirstName(fx, userId)) === normalizeFirstName(value),
        'stored as the normalised value',
      ).toBe(true);
    }
    for (const value of ['Qa  Test', 'José', 'José', "D'Souza", 'Anne-Marie']) {
      await call(fx, WRITE, tt, { body: { user_id: userId, first_name: value }, retry: false });
      const stored = await piiFirstName(fx, userId);
      noteEvidence(
        `Lossy normalisation (possible defect): a ${value.length}-character input was stored as ${String(stored).length} characters (expected by code: ${normalizeFirstName(value)?.length}).`,
      );
    }
  });

  scenario('M2-PIIR-008', async (fx) => {
    const tt = asTestToken(fx);
    const empty = await call(fx, BATCH, tt, { body: { user_ids: [] } });
    expect(empty.status, 'empty user_ids → 400 (observed 2026-10-19)').toBe(400);
    for (const [label, ids] of [
      ['string instead of list', 'abc,def'],
      ['null entries', [null, 'abc']],
      ['numbers', [1, 2, 3]],
      ['100 ids', Array.from({ length: 100 }, (_, i) => fx.data.userId(`b${i}`))],
    ] as const) {
      for (const [apiId, key] of [
        [BATCH, 'user_ids'],
        [PROFILE_NAMES, 'refs'],
      ] as const) {
        const res = await call(fx, apiId, tt, { body: { [key]: ids } });
        expect(res.status, `${apiId} ${label}: 200 (from code: no limit, list normalised)`).toBe(200);
      }
    }
  });

  scenario('M2-PIIR-009', async (fx) => {
    const a = await fx.accounts.onboarded(0);
    const b = await fx.accounts.onboarded(1);
    const unknown = `${fx.m2Config.runId}-none`;
    const res = await call(fx, PROFILE_NAMES, asTestToken(fx), { body: { refs: [a.ref, b.ref, unknown] } });
    expect(res.status, `profile_first_names: ${res.summary()}`).toBe(200);
    const profiles =
      (res.json() as { profiles?: Record<string, { first_name?: unknown } | null> } | undefined)?.profiles ??
      {};
    for (const [p, label] of [
      [a, 'A'],
      [b, 'B'],
    ] as const) {
      const own = nameOf(await ownProfile(fx, p));
      expect(profiles[p.ref!]?.first_name === own, `${label}’s ref maps to ${label}’s own first name`).toBe(
        true,
      );
    }
    expect(
      profiles[unknown] === null || profiles[unknown] === undefined,
      'unknown ref → null (observed shape)',
    ).toBe(true);
  });

  scenario('M2-PIIR-010', async (fx) => {
    const tt = asTestToken(fx);
    const unknown = await call(fx, NAME_SOURCE, tt, { body: { ref: `${fx.m2Config.runId}-none` } });
    expect(unknown.status, 'unknown ref → 404 (observed 2026-10-19)').toBe(404);
    expect(unknown.rawText().includes('Profile not found'), 'error text "Profile not found"').toBe(true);
    const p = await fx.accounts.onboarded(0);
    for (const body of [{ ref: p.ref }, { user_id: p.userId }]) {
      const res = await call(fx, NAME_SOURCE, tt, { body });
      expect(res.status, `profile_first_name_source: ${res.summary()} (from code, M2Q-01)`).toBe(200);
      const keys = Object.keys((res.json() as object) ?? {}).sort();
      expect(keys, 'success keys as in the code (M2Q-01)').toEqual(
        [
          'db_first_name_after',
          'db_first_name_before',
          'hide_first_name',
          'pii_first_name',
          'pii_only_write_performed',
          'profile_response_first_name',
          'profile_response_uses_pii',
          'ref',
          'status',
          'user_id',
        ].sort(),
      );
    }
  });
});
