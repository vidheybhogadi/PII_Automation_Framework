/**
 * Generic runners for the per-API checks of the M2 design (m2/scripts/m2-baseline.ts RULES). Each runner asserts
 * only what the case's expected result evidences; parts that depend on an open question are recorded
 * ("observed" / "assumption" annotations), never guessed. Prerequisites the environment cannot provide block the
 * test (prereq.ts).
 */
import { expect } from '@playwright/test';
import type { ApiResponse } from '../../../core/http/api-response';
import type { AnyCase } from '../../scripts/m2-all-cases';
import { PII_INPUT, returnsOthers } from '../../scripts/m2-baseline';
import { groupOf } from '../../scripts/m2-inventory';
import { onboardingValues, type Profile } from '../accounts/accounts';
import { isSuccess, PII_KEYS, scanResponse, unlistedPii } from '../assertions/pii.assertions';
import { AUTH } from '../auth/credentials';
import { testPhoneNumber } from '../auth/test-phone';
import { normalizeFirstName } from '../../scripts/m2-code-evidence';
import type { UserSession } from '../auth/session';
import type { PiiDb } from '../db/pii-db';
import { snapshotSummary } from '../db/pii-db';
import { notApplicable, noteEvidence } from '../fixtures/m2-fixtures';
import { blockPrereq, PREREQ } from '../prereq';
import { requireBaseline, withBaseline, type Variant } from '../baseline/baseline';
import { apiById } from '../design';
import {
  callerFor,
  DESTRUCTIVE,
  FRESH_PER_VARIANT,
  KEPT_BLOCKED,
  SUBMIT_PROFILE,
  send,
  syntheticFor,
  valuesFor,
  type Caller,
  type CheckFixtures,
} from './context';
import { requireTestToken } from '../config/m2-config';
import type { Synthetic } from './request-builder';
import { buildRequest } from './request-builder';
import { variantSafety, wrongTypeValue } from './safety';
import { suiteStateFor } from '../../scripts/m2-code-evidence';
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
    bId = (await fx.accounts.onboarded(1)).userId!; // a second real account (M2Q-40: existing users only)
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

/**
 * The caller of one variant: the case's caller, or — for routes that consume their throwaway account (delete /
 * reset) — the API's throwaway again, which is a newly onboarded one once the previous variant consumed it.
 */
async function variantCaller(
  api: ReturnType<typeof apiOf>,
  fx: CheckFixtures,
  caller: Caller,
): Promise<Caller> {
  return FRESH_PER_VARIANT.includes(api.id) ? callerFor(api, fx) : caller;
}

/** Top-level-or-nested request keys of the Dev example, without duplicates. */
const keysOf = (c: AnyCase) => [...new Set(apiOf(c).requestKeys)];

export async function runContract(c: AnyCase, fx: CheckFixtures): Promise<void> {
  requireBaseline(c.id, ctxOf(fx));
  const api = apiOf(c);
  const caller = await callerFor(api, fx);
  // A baseline of a VALID request must be a valid reply: a server error is never recorded as the contract.
  await withBaseline(
    c.id,
    ctxOf(fx),
    [{ label: 'valid request', send: () => send(api, fx, caller) }],
    noServerError,
  );
}

export async function runParam(c: AnyCase, fx: CheckFixtures): Promise<void> {
  requireBaseline(c.id, ctxOf(fx));
  const api = apiOf(c);
  const caller = await callerFor(api, fx);
  const request = buildRequest(api, caller.values, syntheticFor(fx, caller.session));
  const variants: Variant[] = keysOf(c).map((key) => ({
    label: `without ${key}`,
    // Safety (M2Q-46): a target / phone / login-OTP key is never removed — the variant is Blocked, not sent.
    ...(variantSafety(api, 'without', key) ? { notSent: variantSafety(api, 'without', key)! } : {}),
    send: async () => {
      const who = await variantCaller(api, fx, caller);
      const req = who === caller ? request : buildRequest(api, who.values, syntheticFor(fx, who.session));
      const body = req.body === undefined ? undefined : structuredClone(req.body);
      if (body !== undefined) deleteKey(body, key);
      const query = req.query
        ? Object.fromEntries(Object.entries(req.query).filter(([k]) => k !== key))
        : undefined;
      return send(api, fx, who, {
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
  /** The variant's caller and its Dev body (rebuilt for a fresh throwaway account). */
  const target = async () => {
    const who = await variantCaller(api, fx, caller);
    const body =
      who === caller
        ? base
        : ((buildRequest(api, who.values, syntheticFor(fx, who.session)).body ?? {}) as Record<
            string,
            unknown
          >);
    return { who, body };
  };
  const variants: Variant[] = [
    {
      label: 'invalid JSON',
      send: async () =>
        send(api, fx, (await target()).who, {
          rawBody: Buffer.from('{"broken": ', 'utf8'),
          retry: false,
        }),
    },
    {
      label: 'extra keys user_id / tenant_id / first_name',
      send: async () => {
        const t = await target();
        return send(api, fx, t.who, {
          body: {
            ...t.body,
            user_id: `${fx.m2Config.runId}-other`,
            tenant_id: 'qa-other-tenant',
            first_name: marker,
          },
          retry: false,
        });
      },
    },
  ];
  for (const key of Object.keys(base)) {
    // Safety (2026-10-24): an id never becomes another record's id; a false flag never becomes truthy; a phone or
    // OTP never becomes a number; a target key other than ref is never swapped (safety.ts, M2Q-46).
    const unsafe = variantSafety(api, 'wrong type', key);
    variants.push({
      label: `${key} with the wrong type`,
      ...(unsafe ? { notSent: unsafe } : {}),
      send: async () => {
        const t = await target();
        return send(api, fx, t.who, {
          body: { ...t.body, [key]: wrongTypeValue(key, t.body[key]) },
          retry: false,
        });
      },
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
    noServerError(l, r);
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
  // A repeated request is still a valid request: a server error is never recorded or accepted as the contract.
  await withBaseline(c.id, ctxOf(fx), variants, noServerError);
  const parallel = await Promise.all([
    send(api, fx, caller, { retry: false }),
    send(api, fx, caller, { retry: false }),
  ]);
  parallel.forEach((r, i) => fx.observe(`${api.id} parallel #${i + 1}`, r));
  parallel.forEach((r, i) => noServerError(`parallel #${i + 1}`, r));
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

// ---- UNMIG — unmigrated profile with the read gate on ---------------------------------------------------------
/**
 * NOT APPLICABLE on staging: every staging profile is migrated and new QA accounts write to PII at creation
 * (M2Q-05, QA lead 2026-10-24). The design marks every UNMIG case NOT APPLICABLE, so blockIfOpen skips it before
 * this runs; the runner only repeats that reason if a case ever reaches it.
 */
export async function runUnmig(c: AnyCase): Promise<void> {
  notApplicable(c.na?.question ?? 'M2Q-05', c.na?.reason ?? 'Unmigrated profiles cannot occur on staging');
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
    // The test-route write needs an existing app user (M2Q-40, from code): a suite-created onboarded account.
    const own = await fx.accounts.onboarded(0);
    const userId = own.userId!;
    read = () =>
      send(
        api,
        fx,
        tt,
        api.method === 'GET'
          ? { query: { user_id: userId } }
          : { body: { user_ids: [userId], refs: [own.ref ?? userId] } },
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
      const after = caller.session ? await selfView(fx, caller.session) : undefined;
      if (!isSuccess(res.status) && caller.session)
        expect(after === before, `${key} ${label}: a refused value changes nothing`).toBe(true);
      // From code (M2Q-06): blank names are ignored; others are stored normalised (lossy cases only recorded).
      if (key === 'first_name' && caller.session && isSuccess(res.status)) {
        const stored = (JSON.parse(after!) as { first_name: unknown }).first_name;
        const want = typeof value === 'string' ? normalizeFirstName(value) : undefined;
        if (value === null || want === undefined)
          expect(after === before, `${key} ${label}: a blank name leaves the name unchanged`).toBe(true);
        else if (/^[A-Za-z\s]*$/.test(value as string) || !/[A-Za-z]/.test(value as string))
          expect(stored === want, `${key} ${label}: stored as the normalised value`).toBe(true);
        else noteEvidence(`${key} ${label}: lossy normalisation recorded (possible defect, M2Q-06).`);
      }
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

// ---- GATE — read gate OFF: same value read back (gate-ON half waits for Dev, M2Q-43) ------------------------
/**
 * Read gates are OFF on testa2 (M2Q-02, QA lead 2026-10-24): writes go to the PII service, reads come from the app
 * database. Each GATE case uses one dedicated suite account (index GATE_ACCOUNT, untouched by the other checks),
 * writes a new fake value where the route writes (otherwise uses the account's current values), and checks:
 *   no 5xx · the value read back equals the value written / onboarded · no other test account's data · no
 *   personal-data field the Dev inventory does not list for the API (unlistedPii, paths only).
 * The gate-ON half ("gate on → PII value") is recorded as waiting (M2Q-43) by blockIfOpen.
 */
export const GATE_ACCOUNT = 3;
/** Routes that flip a setting of the caller's own profile — sent twice so the account is left as it was. */
const TOGGLES = ['API-032', 'API-033', 'API-034', 'API-035'];

interface OwnValues {
  firstName: unknown;
  email: unknown;
  phone: unknown;
}

/** The account's own first name (fetch_own_info) and email / phone (own GET /V1/users/:ref). */
async function ownValues(fx: CheckFixtures, p: Profile): Promise<OwnValues> {
  const caller = { auth: AUTH.user(p.token), device: p.device };
  const own = await fx.m2.call('API-013', caller);
  fx.observe('API-013 own profile', own);
  expect(own.status, `own profile: ${own.summary()}`).toBe(200);
  const byRef = await send(
    apiById('API-021'),
    fx,
    { label: 'owner', ...caller, session: p, values: valuesFor(fx.m2Config, p) },
    {
      values: { REF: p.ref },
    },
  );
  fx.observe('API-021 own profile by ref', byRef);
  expect(byRef.status, `own profile by ref: ${byRef.summary()}`).toBe(200);
  const body = byRef.json();
  return {
    firstName: deepValue(own.json(), 'first_name'),
    email: deepValue(body, 'email') ?? deepValue(body, 'personal_email'),
    phone: deepValue(body, 'phone_number') ?? deepValue(body, 'mobile_number'),
  };
}

function deepValue(body: unknown, key: string): unknown {
  if (Array.isArray(body)) {
    for (const b of body) {
      const v = deepValue(b, key);
      if (v !== undefined) return v;
    }
  } else if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    if (key in o) return o[key];
    for (const v of Object.values(o)) {
      const found = deepValue(v, key);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/**
 * First value under `key` OUTSIDE any list (the caller's own object). Lists of other members (matches, likes, …)
 * are compared only through the account's own entries (ownItems) — M2-API-045-GATE fix, 2026-10-24.
 */
function valueOutsideLists(body: unknown, key: string): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const o = body as Record<string, unknown>;
  if (key in o) return o[key];
  for (const v of Object.values(o)) {
    const found = valueOutsideLists(v, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Value checks of a GATE reply: the caller's own object, and its own entries inside lists (value-free messages). */
function expectReplyValues(
  api: ReturnType<typeof apiOf>,
  res: ApiResponse,
  p: Profile,
  want: { firstName: unknown; email?: unknown },
): void {
  const body = res.json();
  if (returnsOthers(api) && api.id !== 'API-021') {
    // Replies about other members: compare only entries of a suite account whose values are known.
    const mine = ownItems(body, p);
    for (const item of mine.filter((i) => typeof i.first_name === 'string'))
      expect(item.first_name === want.firstName, `${api.id}: the account’s own entry shows its name`).toBe(
        true,
      );
    if (!mine.length)
      noteEvidence(
        `${api.id}: value part not checkable — no suite account appears in this reply (needs connected / discoverable accounts, M2Q-32); generic checks and the own-profile read-back ran.`,
      );
    return;
  }
  const shown = valueOutsideLists(body, 'first_name');
  if (typeof shown === 'string')
    expect(shown === want.firstName, `${api.id}: the reply shows the account’s name`).toBe(true);
  const email = valueOutsideLists(body, 'email') ?? valueOutsideLists(body, 'personal_email');
  if (typeof email === 'string' && want.email !== undefined)
    expect(email === want.email, `${api.id}: the reply shows the account’s email`).toBe(true);
  for (const item of ownItems(body, p).filter((i) => typeof i.first_name === 'string'))
    expect(item.first_name === want.firstName, `${api.id}: the account’s own list entry shows its name`).toBe(
      true,
    );
}

/** Every string under a key containing "first_name" (incl. maps such as first_names: {id: name}). */
function firstNamesIn(body: unknown, under = false, out: string[] = []): string[] {
  if (typeof body === 'string' && under) out.push(body);
  else if (Array.isArray(body)) body.forEach((b) => firstNamesIn(b, under, out));
  else if (body && typeof body === 'object')
    for (const [k, v] of Object.entries(body as Record<string, unknown>))
      firstNamesIn(v, under || k.toLowerCase().includes('first_name'), out);
  return out;
}

/** Items of a reply that belong to the account (by ref or user id). */
function ownItems(body: unknown, p: Profile, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(body)) body.forEach((b) => ownItems(b, p, out));
  else if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    if ((p.ref && String(o.ref) === p.ref) || (p.userId && String(o.user_id) === p.userId)) out.push(o);
    Object.values(o).forEach((v) => ownItems(v, p, out));
  }
  return out;
}

/** PII service first name of a user (G1 read route, TEST_TOKEN). */
async function piiName(fx: CheckFixtures, userId: string): Promise<unknown> {
  const res = await fx.m2.call('API-001', {
    auth: AUTH.testToken(requireTestToken(fx.m2Config)),
    query: { user_id: userId },
  });
  fx.observe('API-001 PII first name', res);
  expect(res.status, `PII first-name read: ${res.summary()}`).toBe(200);
  return (res.json() as { first_name?: unknown } | undefined)?.first_name ?? null;
}

/** The value checks shared by every GATE case (value-free messages). */
async function expectOwnValues(
  fx: CheckFixtures,
  p: Profile,
  want: { firstName: unknown; email?: unknown },
  label: string,
): Promise<void> {
  const now = await ownValues(fx, p);
  expect(now.firstName === want.firstName, `${label}: own profile returns the expected first name`).toBe(
    true,
  );
  if (want.email !== undefined)
    expect(now.email === want.email, `${label}: own profile returns the expected email`).toBe(true);
  expect(
    phoneForms(p.mobileNumber).includes(String(now.phone)),
    `${label}: own profile shows the login number (accepted forms)`,
  ).toBe(true);
}

function expectReplyHygiene(api: ReturnType<typeof apiOf>, fx: CheckFixtures, res: ApiResponse, p: Profile) {
  noServerError(api.id, res);
  expectNoForeignPii(res, fx, p, api.id);
  if (res.isJson)
    expect(
      unlistedPii(res.json(), api.fields),
      `${api.id}: no personal-data field the Dev inventory does not list for this API (paths only)`,
    ).toEqual([]);
}

export async function runGate(c: AnyCase, fx: CheckFixtures): Promise<void> {
  const api = apiOf(c);
  const group = groupOf(api.id).key;

  // Write routes that create the account: login (PHONE) and onboarding submit_profile (NAME + EMAIL).
  if (api.id === 'API-060' || api.id === 'API-057') {
    const domain = (process.env.AISLE_TEST_EMAIL_DOMAIN || 'example.test').toLowerCase();
    const want = {
      firstName: fx.data.firstName(),
      email: `${fx.data.userId('gate').replace(/[^a-z0-9-]/g, '')}@${domain}`,
    };
    const p = await fx.accounts.onboardFresh(want);
    await expectOwnValues(fx, p, want, `${api.id} (new account)`);
    expect((await piiName(fx, p.userId!)) === want.firstName, 'PII first name = the onboarding name').toBe(
      true,
    );
    return;
  }

  // Routes this case cannot call with a user / test token block exactly like their other checks.
  if (!api.auth.includes('USER_TOKEN') && !api.auth.includes('TEST_TOKEN') && api.id !== 'API-062')
    await callerFor(api, fx);
  if (KEPT_BLOCKED.includes(api.id)) await callerFor(api, fx);
  const state = suiteStateFor(api.id);
  if (state === 'image_inappropriate') await callerFor(api, fx);
  // Destructive, deactivated-state and profile-submit routes run on their throwaway account, never the gate account.
  if (DESTRUCTIVE.includes(api.id) || state === 'deactivated' || SUBMIT_PROFILE.includes(api.id))
    return runGateThrowaway(api, fx);

  const pooled = await fx.accounts.onboarded(GATE_ACCOUNT);
  const p = state === 'approved' ? await fx.accounts.waitApproved(pooled, 'gate account') : pooled;
  const before = await ownValues(fx, p);
  // Anchor (gate off, M2Q-02): writes go to both stores, so the app's own name equals the PII name.
  expect(before.firstName === (await piiName(fx, p.userId!)), 'own first name = PII first name').toBe(true);
  if (fx.accounts.isOwnOnboarded(GATE_ACCOUNT))
    expect(
      before.email === onboardingValues(fx.m2Config.runId, GATE_ACCOUNT).email,
      'own email = the fake onboarding email',
    ).toBe(true);
  const want: { firstName: unknown; email: unknown } = { firstName: before.firstName, email: before.email };

  if (group === 'G1') {
    const auth = AUTH.testToken(requireTestToken(fx.m2Config));
    const values = { ...valuesFor(fx.m2Config, p, p), USER_ID: p.userId, REF: p.ref };
    const caller: Caller = { label: 'TEST_TOKEN', auth, session: p, values };
    let res: ApiResponse;
    if (api.id === 'API-002') {
      want.firstName = fx.data.firstName();
      res = await send(api, fx, caller, {
        body: { user_id: p.userId, first_name: want.firstName },
        retry: false,
      });
    } else if (api.id === 'API-208') res = await send(api, fx, caller, { body: { user_id: p.userId } });
    else res = await send(api, fx, caller);
    fx.observe(`${api.id} gate off`, res);
    expect(isSuccess(res.status), `${api.id}: ${res.summary()} — a valid request must succeed`).toBe(true);
    expectReplyHygiene(api, fx, res, p);
    const names = firstNamesIn(res.json());
    expect(names.length > 0, `${api.id}: the reply carries the account’s first name`).toBe(true);
    expect(
      names.every((n) => n === want.firstName),
      `${api.id}: every first name in the reply is the account’s current name`,
    ).toBe(true);
    if (api.id === 'API-002')
      expect((await piiName(fx, p.userId!)) === want.firstName, 'PII first name = the written name').toBe(
        true,
      );
    await expectOwnValues(fx, p, want, `${api.id} afterwards`);
    return;
  }

  const caller: Caller = {
    label: api.id === 'API-062' ? 'no credential (pre-login)' : 'user (gate account)',
    auth: api.id === 'API-062' ? AUTH.none : AUTH.user(p.token),
    device: p.device,
    session: p,
    values: valuesFor(fx.m2Config, p),
  };
  const input = PII_INPUT[api.id] ?? [];
  const synthetic: Partial<Synthetic> = {};
  if (input.includes('NAME')) synthetic.firstName = want.firstName = fx.data.firstName();
  const res = await send(api, fx, caller, { synthetic, retry: input.length === 0 });
  fx.observe(`${api.id} gate off`, res);
  try {
    expectReplyHygiene(api, fx, res, p);
    if (input.length)
      expect(isSuccess(res.status), `${api.id}: ${res.summary()} — the write must succeed`).toBe(true);
    expectReplyValues(api, res, p, want);
  } finally {
    if (TOGGLES.includes(api.id)) fx.observe(`${api.id} restore`, await send(api, fx, caller));
  }
  await expectOwnValues(fx, p, want, `${api.id} afterwards`);
  if (input.includes('NAME'))
    expect((await piiName(fx, p.userId!)) === want.firstName, 'PII first name = the written name').toBe(true);
}

/**
 * GATE on a throwaway account (destructive, deactivated-state and profile-submit routes): the route may delete,
 * reset or deactivate the account, so the values are compared with what the suite onboarded it with (known fake
 * name / email), in the reply and — when the own profile is still readable afterwards — in the read-back.
 */
async function runGateThrowaway(api: ReturnType<typeof apiOf>, fx: CheckFixtures): Promise<void> {
  const caller = await callerFor(api, fx);
  const p = caller.session as Profile;
  const want: { firstName: unknown; email: unknown } = {
    firstName: p.known?.firstName,
    email: p.known?.email,
  };
  const input = PII_INPUT[api.id] ?? [];
  const synthetic: Partial<Synthetic> = {};
  if (input.includes('NAME')) synthetic.firstName = want.firstName = fx.data.firstName();
  if (input.includes('EMAIL')) want.email = undefined; // a new fake email is written; compared via the read-back
  const res = await send(api, fx, caller, { synthetic, retry: false });
  fx.observe(`${api.id} gate off (throwaway account)`, res);
  expectReplyHygiene(api, fx, res, p);
  if (input.length)
    expect(isSuccess(res.status), `${api.id}: ${res.summary()} — the write must succeed`).toBe(true);
  expectReplyValues(api, res, p, want);
  const own = await fx.m2.call('API-013', { auth: AUTH.user(p.token), device: p.device });
  fx.observe('API-013 own profile afterwards', own);
  if (own.status !== 200) {
    noteEvidence(
      `${api.id}: own profile not readable afterwards (HTTP ${own.status}) — the route deleted / reset / deactivated the throwaway account, so the read-back does not apply.`,
    );
    return;
  }
  expect(
    deepValue(own.json(), 'first_name') === want.firstName,
    `${api.id}: own profile afterwards shows the expected first name`,
  ).toBe(true);
  if (input.includes('NAME'))
    expect((await piiName(fx, p.userId!)) === want.firstName, 'PII first name = the written name').toBe(true);
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
