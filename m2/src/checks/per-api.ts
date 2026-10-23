/**
 * Generic runners for the per-API checks of the M2 design (m2/scripts/m2-baseline.ts RULES). Each runner asserts
 * only what the case's expected result evidences; parts that depend on an open question are recorded
 * ("observed" / "assumption" annotations), never guessed. Prerequisites the environment cannot provide block the
 * test (prereq.ts).
 */
import { expect } from '@playwright/test';
import type { ApiResponse } from '../../../core/http/api-response';
import type { AnyCase } from '../../scripts/m2-all-cases';
import { PII_INPUT } from '../../scripts/m2-baseline';
import { groupOf } from '../../scripts/m2-inventory';
import type { Profile } from '../accounts/accounts';
import { isSuccess, PII_KEYS, scanResponse } from '../assertions/pii.assertions';
import { AUTH } from '../auth/credentials';
import { testPhoneNumber } from '../auth/test-phone';
import type { UserSession } from '../auth/session';
import type { PiiDb } from '../db/pii-db';
import { snapshotSummary } from '../db/pii-db';
import { noteEvidence } from '../fixtures/m2-fixtures';
import { blockPrereq, PREREQ } from '../prereq';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  observe as observeShape,
  requireBaseline,
  shapeDiff,
  withBaseline,
  type Variant,
} from '../baseline/baseline';
import { apiById, ROOT } from '../design';
import { callerFor, send, syntheticFor, valuesFor, type Caller, type CheckFixtures } from './context';
import { buildRequest } from './request-builder';
import { DB_FIELD, expectUnchanged, piiUserIdFor } from './db';

export const apiOf = (c: AnyCase) => apiById(c.apis[0]!);

/** No PII of OTHER known test accounts in a reply (own PII keys are allowed). Value-free message. */
export function expectNoForeignPii(
  res: ApiResponse,
  fx: CheckFixtures,
  self: { mobileNumber: string } | undefined,
  label: string,
) {
  const findings = scanResponse(res, { allowKeys: PII_KEYS, known: fx.accounts.numbersExcept(self) }).filter(
    (f) => f.kind === 'known test value',
  );
  expect(findings, `${label}: no other test account’s phone number in the reply (locations only)`).toEqual(
    [],
  );
}

/** PII-bearing keys present in a reply (names only) — recorded for review. */
export function piiKeysIn(res: ApiResponse): string[] {
  const keys = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (PII_KEYS.includes(k.toLowerCase()) && x !== null && x !== '') keys.add(k);
        walk(x);
      }
  };
  walk(res.json());
  return [...keys].sort();
}

// ---- POS — valid request succeeds with correct PII -------------------------------------------------------
export async function runPos(c: AnyCase, fx: CheckFixtures): Promise<void> {
  const api = apiOf(c);
  if (api.id === 'API-060') {
    // The login itself: request OTP + verify (staging 2026-10-23). The reply is not recorded (it holds the token).
    const s = await fx.accounts.freshUser();
    for (const key of ['id', 'auth_token', 'application_stage'])
      expect(
        s.loginShape.includes(key),
        `verify_number_login_v1 reply has "${key}" (observed 2026-10-23)`,
      ).toBe(true);
    noteEvidence(
      `Login reply keys: ${s.loginShape.join(', ')}; application_stage ${s.applicationStage ?? '—'}.`,
    );
    return;
  }
  const caller = await callerFor(api, fx);
  const res = await send(api, fx, caller);
  fx.observe(`${api.id} ${caller.label}`, res);
  expect(isSuccess(res.status), `${api.id}: ${res.summary()} — a valid request must succeed`).toBe(true);
  expectNoForeignPii(res, fx, caller.session, api.id);
  noteEvidence(
    `PII keys in the reply: ${piiKeysIn(res).join(', ') || 'none'}. Values vs the PII service: compared once the app user → PII user_id mapping is known (M2Q-37).`,
  );
}

/** A user's own view (for "B unchanged" checks): verify_user for new accounts, fetch_own_info for profiles. */
async function selfView(fx: CheckFixtures, s: UserSession | Profile): Promise<string> {
  const id = 'ref' in s ? 'API-013' : 'API-088';
  const res = await fx.m2.call(id, { auth: AUTH.user(s.token), device: s.device });
  const body = res.json() as Record<string, unknown> | undefined;
  return JSON.stringify({
    status: res.status,
    first_name: body?.first_name ?? null,
    stage: body?.application_stage ?? null,
  });
}

// ---- IDOR — cannot act on / read another user --------------------------------------------------------------
export async function runIdor(c: AnyCase, fx: CheckFixtures): Promise<void> {
  const api = apiOf(c);
  const a = await callerFor(api, fx, 'A');
  const b = await callerFor(api, fx, 'B');
  if (!a.session || !b.session)
    blockPrereq(
      PREREQ.createAccounts.id,
      `${api.id}: IDOR needs two of the suite's own synthetic accounts and only ${a.session || b.session ? 'one' : 'none'} could be provided`,
    );
  const before = await selfView(fx, b.session);
  const other = valuesFor(fx.m2Config, b.session);
  const res = await send(api, fx, a, {
    values: { USER_ID: other.USER_ID, REF: other.REF, OTHER_USER_ID: other.USER_ID, OTHER_REF: other.REF },
  });
  fx.observe(`${api.id} user A with B’s identifiers`, res);
  const leaks = scanResponse(res, { allowKeys: PII_KEYS, known: [b.session.mobileNumber] }).filter(
    (f) => f.kind === 'known test value',
  );
  expect(leaks, `${api.id}: B’s phone number never appears in A’s reply (locations only)`).toEqual([]);
  const after = await selfView(fx, b.session);
  expect(after === before, `${api.id}: B’s own view (status, first name, stage) unchanged`).toBe(true);
}

// ---- DB-ISOL — other fields and users untouched -----------------------------------------------------------
export async function runDbIsol(c: AnyCase, fx: CheckFixtures, db: PiiDb): Promise<void> {
  const api = apiOf(c);
  const a: Caller = await callerFor(api, fx, 'A');
  let aId: string;
  let bId: string;
  if (groupOf(api.id).key === 'G1') {
    aId = a.values.USER_ID!;
    bId = fx.data.userId('B');
  } else {
    if (!a.session) throw new Error(`${api.id}: needs a user account`);
    const b = await callerFor(api, fx, 'B');
    aId = piiUserIdFor(a.session, fx.m2Config);
    bId = piiUserIdFor(b.session!, fx.m2Config);
  }
  const target = (PII_INPUT[api.id] ?? api.fields).map((f) => DB_FIELD[f]).filter(Boolean) as string[];
  const [aBefore, bBefore] = [await db.snapshot(aId), await db.snapshot(bId)];
  const res = await send(api, fx, a, { values: { USER_ID: aId }, retry: false });
  fx.observe(`${api.id} as A`, res);
  const [aAfter, bAfter] = [await db.snapshot(aId), await db.snapshot(bId)];
  noteEvidence(
    `A before ${snapshotSummary(aBefore)} → after ${snapshotSummary(aAfter)}; B ${snapshotSummary(bBefore)}.`,
  );
  expectUnchanged(bBefore, bAfter, 'all', `${api.id}: user B`);
  const others = [...new Set([...Object.keys(aBefore), ...Object.keys(aAfter)])].filter(
    (f) => !target.includes(f),
  );
  expectUnchanged(aBefore, aAfter, others, `${api.id}: A’s non-target fields`);
}

// ---- EXPOSE — no unintended PII exposure ------------------------------------------------------------------
/** Phone forms of an account as they could appear in a reply (national and full). */
export const phoneForms = (n: string) => [n, `+91${n}`, `91${n}`];

export async function runExpose(c: AnyCase, fx: CheckFixtures): Promise<void> {
  const api = apiOf(c);
  if (groupOf(api.id).key === 'G10') fx.accounts.admin();
  if (groupOf(api.id).key === 'G7') blockPrereq(PREREQ.provider.id, PREREQ.provider.reason);
  // A is visible to B in this response (connected pair); B calls the route.
  const [a, b] = await fx.accounts.connectedPair();
  const viewer: Caller = {
    label: 'user B',
    auth: AUTH.user(b.token),
    device: b.device,
    session: b,
    values: valuesFor(fx.m2Config, b, a),
  };
  const res = await send(api, fx, viewer);
  fx.observe(`${api.id} as B (A visible)`, res);
  const known = [
    ...phoneForms(a.mobileNumber),
    ...(fx.m2Config.values[`EMAIL_${a.mobileNumber}`]
      ? [fx.m2Config.values[`EMAIL_${a.mobileNumber}`]!]
      : []),
  ];
  const leaks = scanResponse(res, { allowKeys: PII_KEYS, known }).filter(
    (f) => f.kind === 'known test value',
  );
  expect(
    leaks,
    `${api.id}: A’s phone (national / full) and email never appear in B’s reply (locations only)`,
  ).toEqual([]);
  noteEvidence('A’s email is searched when M2_VALUE_EMAIL_<A’s number> is set (Dev-provided accounts).');
}

// ---- Baseline-backed checks (M2Q-24: approved staging recordings) -----------------------------------------
const ctxOf = (fx: CheckFixtures) => ({ runId: fx.m2Config.runId, record: fx.m2Config.recordContracts });

/** Invariant: no server error (expected "Refused … (no 5xx)"). */
const noServerError = (label: string, res: ApiResponse) =>
  expect(res.status < 500, `${label}: ${res.summary()} — no server error (5xx)`).toBe(true);

/** Invariant: the submitted synthetic values are not echoed back in an error. */
function noEcho(markers: string[]) {
  return (label: string, res: ApiResponse) => {
    if (isSuccess(res.status)) return;
    const echoed = scanResponse(res, { known: markers }).filter((f) => f.kind === 'known test value');
    expect(echoed, `${label}: the error does not echo submitted values (locations only)`).toEqual([]);
  };
}

/** Before/after own view of a user caller ("nothing changed"); no-op for TEST_TOKEN callers. */
async function unchangedAround(fx: CheckFixtures, caller: Caller, run: () => Promise<void>, what: string) {
  const before = caller.session ? await selfView(fx, caller.session) : undefined;
  await run();
  if (caller.session)
    expect((await selfView(fx, caller.session)) === before, `${what}: own profile unchanged`).toBe(true);
}

/** Synthetic marker values a request carries (to detect echo). */
const MARKERS = (fx: CheckFixtures) => [`FT_${fx.m2Config.runId}`, fx.m2Config.runId];

/** Top-level-or-nested request keys of the Dev example, without duplicates. */
const keysOf = (c: AnyCase) => [...new Set(apiOf(c).requestKeys)];

export async function runContract(c: AnyCase, fx: CheckFixtures): Promise<void> {
  requireBaseline(c.id, ctxOf(fx));
  const api = apiOf(c);
  const caller = await callerFor(api, fx);
  await withBaseline(c.id, ctxOf(fx), [{ label: 'valid request', send: () => send(api, fx, caller) }]);
}

export async function runParam(c: AnyCase, fx: CheckFixtures): Promise<void> {
  requireBaseline(c.id, ctxOf(fx));
  const api = apiOf(c);
  const caller = await callerFor(api, fx);
  const request = buildRequest(api, caller.values, syntheticFor(fx, caller.session));
  const variants: Variant[] = keysOf(c).map((key) => ({
    label: `without ${key}`,
    send: async () => {
      const body = request.body === undefined ? undefined : structuredClone(request.body);
      if (body !== undefined) deleteKey(body, key);
      const query = request.query
        ? Object.fromEntries(Object.entries(request.query).filter(([k]) => k !== key))
        : undefined;
      return send(api, fx, caller, {
        ...(body !== undefined ? { body } : {}),
        ...(query ? { query } : {}),
        retry: false,
      });
    },
  }));
  if (/:ref|:user_id/.test(api.path))
    variants.push({
      label: 'unknown path id',
      send: () =>
        send(api, fx, caller, {
          values: { REF: `${fx.m2Config.runId}-none`, USER_ID: `${fx.m2Config.runId}-none` },
        }),
    });
  await unchangedAround(
    fx,
    caller,
    () => withBaseline(c.id, ctxOf(fx), variants, (l, r) => (noServerError(l, r), noEcho(MARKERS(fx))(l, r))),
    'missing / invalid parameters',
  );
}

export async function runBody(c: AnyCase, fx: CheckFixtures): Promise<void> {
  requireBaseline(c.id, ctxOf(fx));
  const api = apiOf(c);
  const caller = await callerFor(api, fx);
  const request = buildRequest(api, caller.values, syntheticFor(fx, caller.session));
  const base = (request.body ?? {}) as Record<string, unknown>;
  const marker = `QaBody${fx.data.firstName()}`;
  const variants: Variant[] = [
    {
      label: 'invalid JSON',
      send: () => send(api, fx, caller, { rawBody: Buffer.from('{"broken": ', 'utf8'), retry: false }),
    },
    {
      label: 'extra keys user_id / tenant_id / first_name',
      send: () =>
        send(api, fx, caller, {
          body: {
            ...base,
            user_id: `${fx.m2Config.runId}-other`,
            tenant_id: 'qa-other-tenant',
            first_name: marker,
          },
          retry: false,
        }),
    },
  ];
  for (const key of Object.keys(base)) {
    const v = base[key];
    const swapped =
      typeof v === 'string'
        ? 12345
        : typeof v === 'number' || typeof v === 'boolean'
          ? 'qa-not-a-number'
          : null;
    variants.push({
      label: `${key} with the wrong type`,
      send: () => send(api, fx, caller, { body: { ...base, [key]: swapped }, retry: false }),
    });
  }
  await unchangedAround(
    fx,
    caller,
    () =>
      withBaseline(
        c.id,
        ctxOf(fx),
        variants,
        (l, r) => (noServerError(l, r), noEcho([marker, ...MARKERS(fx)])(l, r)),
      ),
    'malformed bodies (no PII written via unexpected keys)',
  );
}

export async function runState(c: AnyCase, fx: CheckFixtures): Promise<void> {
  requireBaseline(c.id, ctxOf(fx));
  const api = apiOf(c);
  const caller = await callerFor(api, fx);
  const variants: Variant[] = [
    { label: 'valid request', send: () => send(api, fx, caller, { retry: false }) },
    { label: 'action already done (sent again)', send: () => send(api, fx, caller, { retry: false }) },
    {
      label: 'wrong target (unknown ids)',
      send: () =>
        send(api, fx, caller, {
          values: {
            REF: `${fx.m2Config.runId}-none`,
            OTHER_REF: `${fx.m2Config.runId}-none`,
            USER_ID: `${fx.m2Config.runId}-none`,
          },
          retry: false,
        }),
    },
  ];
  noteEvidence('Deactivated / pending / banned account states need special accounts (M2Q-32) — not sent.');
  const others = fx.accounts.numbersExcept(caller.session);
  await withBaseline(c.id, ctxOf(fx), variants, (l, r) => {
    if (isSuccess(r.status)) return;
    const leaks = scanResponse(r, { known: others }).filter((f) => f.kind === 'known test value');
    expect(leaks, `${l}: no PII in the error (locations only)`).toEqual([]);
  });
}

export async function runRepeat(c: AnyCase, fx: CheckFixtures): Promise<void> {
  requireBaseline(c.id, ctxOf(fx));
  const api = apiOf(c);
  const caller = await callerFor(api, fx);
  let afterFirst: string | undefined;
  const variants: Variant[] = [
    {
      label: 'first request',
      send: async () => {
        const r = await send(api, fx, caller, { retry: false });
        afterFirst = caller.session ? await selfView(fx, caller.session) : undefined;
        return r;
      },
    },
    { label: 'same request again', send: () => send(api, fx, caller, { retry: false }) },
  ];
  await withBaseline(c.id, ctxOf(fx), variants);
  const parallel = await Promise.all([
    send(api, fx, caller, { retry: false }),
    send(api, fx, caller, { retry: false }),
  ]);
  parallel.forEach((r, i) => fx.observe(`${api.id} parallel #${i + 1}`, r));
  if (caller.session)
    expect(
      (await selfView(fx, caller.session)) === afterFirst,
      'repeats change nothing after the first request',
    ).toBe(true);
}

/** Delete a key anywhere in a body. */
function deleteKey(body: unknown, key: string): void {
  if (!body || typeof body !== 'object') return;
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (k === key) delete (body as Record<string, unknown>)[k];
    else deleteKey(v, key);
  }
}

// ---- UNMIG — unmigrated profile with the read gate on --------------------------------------------------------
export async function runUnmig(c: AnyCase, fx: CheckFixtures): Promise<void> {
  const api = apiOf(c);
  if (fx.m2Config.windows.gate !== 'on')
    blockPrereq(PREREQ.gateWindow.id, `${PREREQ.gateWindow.reason} — this case needs the gates ON`);
  const unmigrated = await fx.accounts.special('UNMIGRATED');
  const caller = await callerFor(api, fx);
  const res = await send(api, fx, caller, {
    values: {
      OTHER_REF: unmigrated.ref,
      OTHER_USER_ID: unmigrated.userId,
      ...(caller.session ? {} : { REF: unmigrated.ref }),
    },
  });
  fx.observe(`${api.id} involving the unmigrated profile`, res);
  noServerError(api.id, res);
  expectNoForeignPii(res, fx, caller.session, api.id);
  noteEvidence(`PII keys in the reply: ${piiKeysIn(res).join(', ') || 'none'} (field value rule: M2Q-05).`);
}

// ---- HIDDEN — hidden first name respected -------------------------------------------------------------------
export async function runHidden(c: AnyCase, fx: CheckFixtures): Promise<void> {
  const api = apiOf(c);
  if (groupOf(api.id).key === 'G10') fx.accounts.admin();
  const hidden = await fx.accounts.special('HIDDEN_NAME');
  const known = process.env.M2_VALUE_HIDDEN_NAME_FULL ? [process.env.M2_VALUE_HIDDEN_NAME_FULL] : [];
  if (!known.length)
    blockPrereq(
      PREREQ.states.id,
      'Set M2_VALUE_HIDDEN_NAME_FULL (the hidden profile’s full first name) to search for it',
    );
  const viewer = await fx.accounts.onboarded(1);
  const caller: Caller = {
    label: 'another user',
    auth: AUTH.user(viewer.token),
    device: viewer.device,
    session: viewer,
    values: valuesFor(fx.m2Config, viewer, hidden),
  };
  const res = await send(api, fx, caller, { values: { REF: hidden.ref, OTHER_REF: hidden.ref } });
  fx.observe(`${api.id} with the hidden-name profile`, res);
  const leaks = scanResponse(res, { allowKeys: PII_KEYS, known }).filter(
    (f) => f.kind === 'known test value',
  );
  expect(leaks, `${api.id}: the hidden profile’s full first name never appears (locations only)`).toEqual([]);
}

// ---- CACHE — PII change reflected in later reads ------------------------------------------------------------
export async function runCache(c: AnyCase, fx: CheckFixtures): Promise<void> {
  const api = apiOf(c);
  const n2 = fx.data.firstName();
  let read: () => Promise<ApiResponse>;
  let change: () => Promise<ApiResponse>;
  if (groupOf(api.id).key === 'G1') {
    const tt = await callerFor(api, fx);
    const userId = tt.values.USER_ID!;
    read = () =>
      send(
        api,
        fx,
        tt,
        api.method === 'GET'
          ? { query: { user_id: userId } }
          : { body: { user_ids: [userId], refs: [userId] } },
      );
    change = () =>
      fx.m2.call('API-002', { auth: tt.auth, body: { user_id: userId, first_name: n2 }, retry: false });
  } else {
    const [a, b] = await fx.accounts.connectedPair();
    const viewer: Caller = {
      label: 'user B',
      auth: AUTH.user(b.token),
      device: b.device,
      session: b,
      values: valuesFor(fx.m2Config, b, a),
    };
    read = () => send(api, fx, viewer, { values: { REF: a.ref } });
    change = () =>
      send(
        apiById('API-058'),
        fx,
        {
          label: 'user A',
          auth: AUTH.user(a.token),
          device: a.device,
          session: a,
          values: valuesFor(fx.m2Config, a),
        },
        { synthetic: { firstName: n2 } },
      );
  }
  fx.observe(`${api.id} warm read`, await read());
  const w = await change();
  fx.observe('name change', w);
  expect(isSuccess(w.status), `name change: ${w.summary()}`).toBe(true);
  const start = Date.now();
  let seenAt: number | undefined;
  while (seenAt === undefined && Date.now() - start < 60_000) {
    if ((await read()).rawText().includes(n2)) seenAt = Date.now() - start;
    else await new Promise((r) => setTimeout(r, 5_000));
  }
  noteEvidence(
    `New name ${seenAt === undefined ? 'not seen within 60 s' : `seen after ${Math.round(seenAt / 1000)} s`} (window: M2Q-12).`,
  );
  if (seenAt !== undefined)
    for (let i = 0; i < 2; i++)
      expect((await read()).rawText().includes(n2), 'no reversion afterwards').toBe(true);
}

// ---- FIELD — PII input validation & normalisation -------------------------------------------------------------
const FIELD_VALUES: Record<string, [string, unknown][]> = {
  first_name: [
    ['null', null],
    ['empty', ''],
    ['whitespace', '   '],
    ['padded', '  QaPad  '],
    ['repeated spaces', 'Qa  Two'],
    ['256 characters', 'Q'.repeat(256)],
    ['digits', '12345'],
    ['emoji', '😀'],
    ['Indian script', 'देवा'],
    ['NFD accents', 'José'],
  ],
  personal_email: [
    ['null', null],
    ['empty', ''],
    ['invalid', 'no-at-sign'],
    ['255+ characters', `${'q'.repeat(250)}@example.test`],
    ['mixed case', 'QA.Mixed@Example.Test'],
    ['padded', '  qa.pad@example.test '],
  ],
  text: [
    ['null', null],
    ['empty', ''],
    ['whitespace', '   '],
    ['1 char', 'q'],
    ['multi-line', 'line1\nline2'],
    ['HTML', '<b>x</b><script>y</script>'],
  ],
  about: [
    ['null', null],
    ['empty', ''],
    ['whitespace', '   '],
    ['multi-line', 'line1\nline2'],
    ['HTML', '<b>x</b>'],
  ],
};

export async function runField(c: AnyCase, fx: CheckFixtures): Promise<void> {
  const api = apiOf(c);
  if (api.id === 'API-060') {
    const base = testPhoneNumber(fx.m2Config.runId, 9200);
    for (const [label, raw] of [
      ['spaces', `${base.slice(0, 5)} ${base.slice(5)}`],
      ['dashes', `${base.slice(0, 5)}-${base.slice(5)}`],
      ['+91', `+91${base}`],
      ['leading 0', `0${base}`],
      ['too short', base.slice(0, 7)],
      ['too long', `${base}9`],
      ['letters', 'abcdefghij'],
    ] as const) {
      const { verify } = await fx.accounts.loginVariant(raw, `field-${label.replace(/\W+/g, '-')}`);
      fx.observe(`verify with ${label}`, verify);
    }
    noteEvidence('Accept / refuse rule for phone formats: M2Q-06 (recorded).');
    return;
  }
  const caller = await callerFor(api, fx);
  for (const key of Object.keys(FIELD_VALUES).filter((k) => api.requestKeys.includes(k))) {
    for (const [label, value] of FIELD_VALUES[key]!) {
      const before = caller.session ? await selfView(fx, caller.session) : undefined;
      const body = structuredClone(
        buildRequest(api, caller.values, syntheticFor(fx, caller.session)).body ?? {},
      );
      setKey(body, key, value);
      const res = await send(api, fx, caller, { body, retry: false });
      fx.observe(`${key} ${label}`, res);
      if (!isSuccess(res.status) && caller.session)
        expect(
          (await selfView(fx, caller.session)) === before,
          `${key} ${label}: a refused value changes nothing`,
        ).toBe(true);
    }
  }
}

function setKey(body: unknown, key: string, value: unknown): void {
  if (!body || typeof body !== 'object') return;
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (k === key) (body as Record<string, unknown>)[k] = value;
    else setKey(v, key, value);
  }
}

// ---- GATE — read gate off vs on (Dev-assisted) ------------------------------------------------------------
/** Value-free record of one gate phase: reports/m2/gate/<case>.<off|on>.json. */
const gateFile = (caseId: string, phase: string) =>
  path.join(ROOT, 'reports/m2/gate', `${caseId}.${phase}.json`);

export async function runGate(c: AnyCase, fx: CheckFixtures): Promise<void> {
  const phase = fx.m2Config.windows.gate;
  if (!phase) blockPrereq(PREREQ.gateWindow.id, PREREQ.gateWindow.reason);
  const api = apiOf(c);
  const caller = await callerFor(api, fx);
  const res = await send(api, fx, caller);
  fx.observe(`${api.id} gate ${phase}`, res);
  noServerError(api.id, res);
  expectNoForeignPii(res, fx, caller.session, api.id);
  const obs = observeShape(res);
  mkdirSync(path.dirname(gateFile(c.id, phase)), { recursive: true });
  writeFileSync(gateFile(c.id, phase), JSON.stringify(obs, null, 2));
  const other = phase === 'on' ? 'off' : 'on';
  if (existsSync(gateFile(c.id, other))) {
    const prev = JSON.parse(readFileSync(gateFile(c.id, other), 'utf8')) as ReturnType<typeof observeShape>;
    expect(res.status, 'same status with the gate off and on').toBe(prev.status);
    expect(shapeDiff(prev.shape, obs.shape), 'otherwise identical response (keys and types)').toEqual([]);
    noteEvidence(
      'Gate off → local value, gate on → PII value: values compared in the Dev window review (M2Q-02).',
    );
  } else noteEvidence(`Gate ${phase} recorded; run again in the ${other} window to compare.`);
}

// ---- PIIDOWN — PII service down / slow (Dev-assisted) ------------------------------------------------------
export async function runPiiDown(c: AnyCase, fx: CheckFixtures): Promise<void> {
  if (!fx.m2Config.windows.piiOutage) blockPrereq(PREREQ.outage.id, PREREQ.outage.reason);
  const api = apiOf(c);
  const caller = await callerFor(api, fx);
  const start = Date.now();
  const res = await send(api, fx, caller, { retry: false });
  fx.observe(`${api.id} during the PII outage`, res);
  noteEvidence(
    `Latency during the outage: ${Date.now() - start} ms (degraded behaviour per M2Q-10 / M2Q-11).`,
  );
  expect(INTERNAL_TEXT.test(res.rawText()), `${api.id}: no stack traces / internals in the reply`).toBe(
    false,
  );
  expectNoForeignPii(res, fx, caller.session, api.id);
}

const INTERNAL_TEXT = /\.rb:\d+|backtrace|ActiveRecord|NoMethodError|NameError|Pii::Error|\/app\/|Traceback/;

// ---- DB-SAVE / DB-REFUSE — persisted correctly; refused requests write nothing -----------------------------
/** PII user_id and caller for a DB check (G1: QA's synthetic id; app users: mapping M2Q-37). */
async function dbSubject(c: AnyCase, fx: CheckFixtures): Promise<{ caller: Caller; userId: string }> {
  const api = apiOf(c);
  const caller = await callerFor(api, fx);
  if (groupOf(api.id).key === 'G1') return { caller, userId: caller.values.USER_ID! };
  if (!caller.session) throw new Error(`${api.id}: needs a user account`);
  return { caller, userId: piiUserIdFor(caller.session, fx.m2Config) };
}

const targetFields = (c: AnyCase) =>
  (PII_INPUT[apiOf(c).id] ?? apiOf(c).fields).map((f) => DB_FIELD[f]).filter(Boolean) as string[];

export async function runDbSave(c: AnyCase, fx: CheckFixtures, db: PiiDb): Promise<void> {
  const api = apiOf(c);
  const { caller, userId } = await dbSubject(c, fx);
  const before = await db.snapshot(userId);
  const res = await send(api, fx, caller, { values: { USER_ID: userId }, retry: false });
  fx.observe(`${api.id} valid request`, res);
  expect(isSuccess(res.status), `${api.id}: ${res.summary()} — the write must succeed`).toBe(true);
  const after = await db.snapshot(userId);
  noteEvidence(`Records before ${snapshotSummary(before)} → after ${snapshotSummary(after)}.`);
  if (/delete/.test(api.path)) {
    noteEvidence('Erasure / tombstone rule per M2Q-15: snapshot recorded, not asserted.');
    return;
  }
  for (const f of targetFields(c)) {
    expect(after[f]?.count ?? 0, `${f}: exactly one record for the user (no duplicates)`).toBe(1);
    if (before[f])
      expect(after[f]!.hashes[0] !== before[f]!.hashes[0], `${f}: replaced with a new ciphertext`).toBe(true);
  }
}

export async function runDbRefuse(c: AnyCase, fx: CheckFixtures, db: PiiDb): Promise<void> {
  const api = apiOf(c);
  const { caller, userId } = await dbSubject(c, fx);
  const before = await db.snapshot(userId);
  const body = structuredClone(
    buildRequest(api, { ...caller.values, USER_ID: userId }, syntheticFor(fx, caller.session)).body ?? {},
  );
  const refused: [string, () => Promise<ApiResponse>][] = [
    [
      'no credential',
      () => send(api, fx, { ...caller, auth: AUTH.none }, { values: { USER_ID: userId }, retry: false }),
    ],
    [
      'invalid credential',
      () =>
        send(api, fx, { ...caller, auth: AUTH.invalidBearer }, { values: { USER_ID: userId }, retry: false }),
    ],
    [
      'broken JSON',
      () => send(api, fx, caller, { rawBody: Buffer.from('{"broken": ', 'utf8'), retry: false }),
    ],
  ];
  for (const key of ['first_name', 'personal_email', 'text', 'about'].filter((k) =>
    api.requestKeys.includes(k),
  )) {
    const bad = structuredClone(body);
    setKey(bad, key, { not: 'a string' });
    refused.push([`${key} as an object`, () => send(api, fx, caller, { body: bad, retry: false })]);
  }
  for (const [label, go] of refused) {
    const res = await go();
    fx.observe(`${api.id} ${label}`, res);
    if (isSuccess(res.status))
      noteEvidence(`${label}: accepted (HTTP ${res.status}) — not a refused request.`);
  }
  expectUnchanged(before, await db.snapshot(userId), 'all', `${api.id}: refused requests`);
}
