/**
 * G1 — PII integration routes (/V1/pii_integration/*, TEST_TOKEN). Scenario cases M2-PIIR-001/002/003/004/007.
 *
 * Expected results come only from staging observations (2026-10-19) and the QA lead's answer to M2Q-20
 * (2026-10-23: synthetic non-numeric user_ids may be written). Details still open in M2Q-35 (write response,
 * missing-field errors, duplicate handling) are RECORDED as "observed", never asserted.
 * There is no delete route: written first names stay in the PII DB under run-prefixed synthetic ids (like M1).
 */
import type { ApiResponse } from '../../../core/http/api-response';
import { maskIdentifier } from '../../../core/utils/redaction';
import { AUTH } from '../../src/auth/credentials';
import { requireTestToken } from '../../src/config/m2-config';
import type { M2Client } from '../../src/clients/m2-client';
import { caseById, titleOf } from '../../src/design';
import { blockIfOpen, expect, noteEvidence, test } from '../../src/fixtures/m2-fixtures';
import type { M2Config } from '../../src/config/m2-config';
import { scenario } from '../../src/checks/define';
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
  firstName: string,
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

function leftBehind(userId: string) {
  test.info().annotations.push({
    type: 'cleanup',
    description: `First name for ${maskIdentifier(userId)} left behind (no delete route for /V1/pii_integration)`,
  });
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

test.describe('M2 G1 — PII integration routes (TEST_TOKEN)', () => {
  const c1 = caseById('M2-PIIR-001');
  test(titleOf(c1), { tag: c1.tags }, async ({ m2, m2Config, data, observe }) => {
    blockIfOpen(c1);
    const userId = data.userId('piir001');
    const name = data.firstName();
    leftBehind(userId);
    const w = await test.step('Save a fake first name with POST /V1/pii_integration/first_name', () =>
      write(m2, m2Config, userId, name));
    observe('write response (contract open: M2Q-35)', w);
    const r = await test.step('Read it back with GET /V1/pii_integration/first_name', () =>
      read(m2, m2Config, userId));
    observe('read', r);
    expectRead(r, userId, name, 'read after write');
  });

  const c2 = caseById('M2-PIIR-002');
  test(titleOf(c2), { tag: c2.tags }, async ({ m2, m2Config, data, observe }) => {
    blockIfOpen(c2);
    const userId = data.userId('piir002');
    const n1 = data.firstName();
    const n2 = data.firstName();
    leftBehind(userId);
    observe('write N1 (contract open: M2Q-35)', await write(m2, m2Config, userId, n1));
    observe('write N2 (contract open: M2Q-35)', await write(m2, m2Config, userId, n2));
    expectRead(await read(m2, m2Config, userId), userId, n2, 'read after replacing N1 with N2');
    observe('repeat write N2 (contract open: M2Q-35)', await write(m2, m2Config, userId, n2));
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
      expect(res.status, `${what}: ${res.summary()} — observed 400 on 2026-10-19`).toBe(400);
      if (text)
        expect(res.rawText().includes(text), `${what}: error text "${text}" (observed 2026-10-19)`).toBe(
          true,
        );
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
    // Contract still open (M2Q-35): recorded, not asserted.
    noteEvidence('POST first_name without user_id / without first_name: recorded only (M2Q-35).');
    observe(
      'POST first_name without user_id (M2Q-35)',
      await m2.call(WRITE, { auth, body: { first_name: data.firstName() }, retry: false }),
    );
    const noName = data.userId('piir004-noname');
    observe(
      'POST first_name without first_name (M2Q-35)',
      await m2.call(WRITE, { auth, body: { user_id: noName }, retry: false }),
    );
  });

  const c7 = caseById('M2-PIIR-007');
  test(titleOf(c7), { tag: c7.tags }, async ({ m2, m2Config, data, observe }) => {
    blockIfOpen(c7);
    const a = data.userId('piir007-a');
    const b = data.userId('piir007-b');
    const never = data.userId('piir007-c');
    const na = data.firstName();
    const nb = data.firstName();
    leftBehind(a);
    leftBehind(b);
    await test.step('Save fake names for users A and B', async () => {
      observe('write A (contract open: M2Q-35)', await write(m2, m2Config, a, na));
      observe('write B (contract open: M2Q-35)', await write(m2, m2Config, b, nb));
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
    noteEvidence(
      `Duplicate handling recorded only (M2Q-35): requested_user_count=${String(body?.requested_user_count)}, returned_user_count=${String(body?.returned_user_count)}, keys=${Object.keys(names).length}.`,
    );
  });
});

// ---- Remaining G1 scenarios (B2) — blocked per design until their questions are answered -----------------
test.describe('M2 G1 — PII integration routes: validation, batches, profiles', () => {
  scenario('M2-PIIR-005', async (fx) => {
    const tt = asTestToken(fx);
    const userId = fx.data.userId('piir005');
    const seed = await call(fx, 'API-002', tt, {
      body: { user_id: userId, first_name: fx.data.firstName() },
      retry: false,
    });
    expectOk(seed, 'seed write');
    const stored = await piiFirstName(fx, userId);
    for (const [label, value] of [
      ['null', null],
      ['empty', ''],
      ['whitespace', '   '],
      ['256 characters', 'Q'.repeat(256)],
      ['number', 123],
      ['array', ['a']],
      ['object', { a: 1 }],
    ] as const) {
      const res = await call(fx, 'API-002', tt, {
        body: { user_id: userId, first_name: value },
        retry: false,
      });
      if (!(res.status >= 200 && res.status < 300))
        expect(
          (await piiFirstName(fx, userId)) === stored,
          `${label}: refused value leaves the stored name unchanged`,
        ).toBe(true);
    }
  });

  scenario('M2-PIIR-006', async (fx) => {
    const tt = asTestToken(fx);
    for (const value of [
      '  Qa  ',
      'Qa  Test',
      'qa',
      'QA',
      'José',
      'José',
      'देवा',
      'தமிழ்',
      "D'Souza",
      'Anne-Marie',
    ]) {
      const userId = fx.data.userId('piir006');
      const w = await call(fx, 'API-002', tt, { body: { user_id: userId, first_name: value }, retry: false });
      if (w.status >= 200 && w.status < 300)
        expect(typeof (await piiFirstName(fx, userId)), 'an accepted name is stored and readable').toBe(
          'string',
        );
    }
    noteEvidence('Normalisation rule (trim, case, NFC/NFD) is recorded, not asserted (M2Q-06).');
  });

  scenario('M2-PIIR-008', async (fx) => {
    const tt = asTestToken(fx);
    const empty = await call(fx, 'API-190', tt, { body: { user_ids: [] } });
    expect(empty.status, 'empty user_ids → 400 (observed 2026-10-19)').toBe(400);
    for (const [label, body] of [
      ['string instead of list', { user_ids: 'abc' }],
      ['null entries', { user_ids: [null, null] }],
      ['numbers', { user_ids: [1, 2, 3] }],
      ['100 ids', { user_ids: Array.from({ length: 100 }, (_, i) => fx.data.userId(`b${i}`)) }],
    ] as const) {
      await call(fx, 'API-190', tt, { body });
      await call(fx, 'API-003', tt, { body: { refs: (body as { user_ids: unknown }).user_ids } });
      noteEvidence(`Batch "${label}": recorded (limit and malformed-list contract: M2Q-35).`);
    }
  });

  scenario('M2-PIIR-009', async (fx) => {
    const a = await fx.accounts.onboarded(0);
    const b = await fx.accounts.onboarded(1);
    const unknown = `${fx.m2Config.runId}-none`;
    const res = await call(fx, 'API-003', asTestToken(fx), { body: { refs: [a.ref, b.ref, unknown] } });
    expect(res.status, `profile_first_names: ${res.summary()}`).toBe(200);
    const profiles = (res.json() as { profiles?: Record<string, unknown> } | undefined)?.profiles ?? {};
    for (const [p, label] of [
      [a, 'A'],
      [b, 'B'],
    ] as const) {
      const own = nameOf(await ownProfile(fx, p));
      expect(profiles[p.ref!] === own, `${label}’s ref maps to ${label}’s own first name`).toBe(true);
    }
    expect(
      profiles[unknown] === null || profiles[unknown] === undefined,
      'unknown ref → null (observed shape)',
    ).toBe(true);
  });

  scenario('M2-PIIR-010', async (fx) => {
    const tt = asTestToken(fx);
    const unknown = await call(fx, 'API-208', tt, { body: { ref: `${fx.m2Config.runId}-none` } });
    expect(unknown.status, 'unknown ref → 404 (observed 2026-10-19)').toBe(404);
    expect(unknown.rawText().includes('Profile not found'), 'error text "Profile not found"').toBe(true);
    const p = await fx.accounts.onboarded(0);
    await call(fx, 'API-208', tt, { body: { ref: p.ref } });
    await call(fx, 'API-208', tt, { body: { user_id: p.userId } });
    noteEvidence('Success response of profile_first_name_source is recorded (M2Q-01).');
  });
});
