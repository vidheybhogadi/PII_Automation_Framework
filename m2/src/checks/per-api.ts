/**
 * Generic runners for the per-API checks of the M2 design (m2/scripts/m2-baseline.ts RULES). Each runner asserts
 * only what the case's expected result evidences; parts that depend on an open question are recorded
 * ("observed" / "assumption" annotations), never guessed. Prerequisites the environment cannot provide block the
 * test (prereq.ts).
 */
import { expect, test } from '@playwright/test';
import type { ApiResponse } from '../../../core/http/api-response';
import type { AnyCase } from '../../scripts/m2-all-cases';
import { PII_INPUT, returnsOthers } from '../../scripts/m2-baseline';
import { groupOf } from '../../scripts/m2-inventory';
import { extendTestTimeout, onboardingValues, type Profile } from '../accounts/accounts';
import { isSuccess, PII_KEYS, scanResponse, unlistedPii } from '../assertions/pii.assertions';
import { AUTH } from '../auth/credentials';
import { testPhoneNumber } from '../auth/test-phone';
import { normalizeFirstName } from '../../scripts/m2-code-evidence';
import type { UserSession } from '../auth/session';
import type { PiiDb } from '../db/pii-db';
import { snapshotSummary } from '../db/pii-db';
import { noteEvidence } from '../fixtures/m2-fixtures';
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
import { buildRequest, placeholdersIn } from './request-builder';
import { variantSafety, wrongTypeValue } from './safety';
import { suiteStateFor } from '../../scripts/m2-code-evidence';
import { DB_FIELD, expectUnchanged, piiUserIdFor } from './db';
import { aboutOf, ABOUT_KEY, normalizeValue, stableView, viewDiff, type OwnView } from './own-view';
import { combineViews, hasIdorTarget, isStatusOnlyReply, mentionsAccount, stateVerdict } from './verdicts';

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
  // For replies that carry only a status flag, the effect is read from the caller's / target's own view.
  const target = targetOf(fx, caller);
  const views = async () =>
    combineViews({
      caller: caller.session ? await selfView(fx, caller.session, { keepCounts: true }) : undefined,
      target: target ? await selfView(fx, target, { keepCounts: true }) : undefined,
    });
  const before = caller.session ? await views() : undefined;
  const res = await send(api, fx, caller);
  fx.observe(`${api.id} ${caller.label}`, res);
  expect(isSuccess(res.status), `${api.id}: ${res.summary()} — a valid request must succeed`).toBe(true);
  expectNoForeignPii(res, fx, caller.session, api.id);
  noteEvidence(`PII keys in the reply: ${piiKeysIn(res).join(', ') || 'none'}.`);
  // Values vs the PII service (M2Q-37 answered: PII user_id = app user id, from code).
  await expectPiiValues(api, fx, res, caller);
  if (res.isJson && isStatusOnlyReply(res.json())) {
    const effect = before ? viewDiff(before, await views()) : [];
    noteEvidence(
      effect.length
        ? `${api.id}: the reply is status-only; observable effect in the own views: ${effect.join(', ')}.`
        : `${api.id}: status-only — the reply carries only a status flag and nothing changed observably in the caller’s or target’s own view; the success status is the only evidence.`,
    );
  }
}

/**
 * POS values (audit fix 2026-10-25): the caller's own first name in the reply (outside lists) and every suite
 * account's entry (inside lists) must equal that account's PII first name (G1 read route, TEST_TOKEN). Read gates
 * are OFF (M2Q-02), so the app value and the PII value are the same store write — a mismatch is a defect.
 */
async function expectPiiValues(
  api: ReturnType<typeof apiOf>,
  fx: CheckFixtures,
  res: ApiResponse,
  caller: Caller,
): Promise<void> {
  if (!res.isJson || !caller.session) {
    noteEvidence(`${api.id}: value part not checkable — no JSON reply or no account behind the caller.`);
    return;
  }
  if (!fx.m2Config.testToken) {
    noteEvidence(`${api.id}: value part not checkable — TEST_TOKEN (the PII read route) is not configured.`);
    return;
  }
  let body = res.json();
  if (api.id === 'API-011') body = (body as { own_info?: unknown } | undefined)?.own_info;
  const checked: string[] = [];
  const self = caller.session;
  if ((!returnsOthers(api) || api.id === 'API-021' || api.id === 'API-011') && self.userId) {
    const shown = valueOutsideLists(body, 'first_name');
    if (typeof shown === 'string') {
      expect(
        shown === (await piiName(fx, self.userId)),
        `${api.id}: the caller’s own first name equals its PII first name`,
      ).toBe(true);
      checked.push('own first name');
    }
  }
  let profiles = 0;
  for (const p of fx.accounts.suiteProfiles()) {
    if (profiles >= 5 || !p.userId) break;
    const items = ownItems(body, p).filter((i) => typeof i.first_name === 'string');
    if (!items.length) continue;
    profiles++;
    const pii = await piiName(fx, p.userId);
    for (const item of items)
      expect(item.first_name === pii, `${api.id}: a suite account’s entry shows its PII first name`).toBe(
        true,
      );
    checked.push('suite account entry');
  }
  noteEvidence(
    checked.length
      ? `${api.id}: compared with the PII first name — ${[...new Set(checked)].join(', ')}.`
      : `${api.id}: value part not checkable — the reply carries no first name of the caller or of a suite account (not value-verified).`,
  );
}

/** The suite profile a request targets (its OTHER_REF / OTHER_USER_ID), if the suite knows it. */
function targetOf(fx: CheckFixtures, caller: Caller): Profile | undefined {
  const ref = caller.values.OTHER_REF;
  return ref ? fx.accounts.profileByRef(ref) : undefined;
}

/**
 * A user's own view for "unchanged" / "what changed" checks (audit fix 2026-10-25): the WHOLE own-profile reply
 * (fetch_own_info; verify_user for sessions without a ref key) minus volatile keys (own-view.ts), plus the own
 * about / story text from GET /V1/users/:ref. `keepCounts` keeps likes / invites / daily counters (STATE / POS).
 */
async function selfView(
  fx: CheckFixtures,
  s: UserSession | Profile,
  opts: { keepCounts?: boolean } = {},
): Promise<OwnView> {
  const id = 'ref' in s ? 'API-013' : 'API-088';
  const res = await fx.m2.call(id, { auth: AUTH.user(s.token), device: s.device });
  const view = stableView(res.status === 200 ? res.json() : undefined, opts);
  if (s.ref && res.status === 200) {
    const owner: Caller = {
      label: 'owner',
      auth: AUTH.user(s.token),
      device: s.device,
      session: s,
      values: valuesFor(fx.m2Config, s),
    };
    const byRef = await send(apiById('API-021'), fx, owner, { values: { REF: s.ref } });
    view[ABOUT_KEY] = byRef.status === 200 ? normalizeValue(aboutOf(byRef.json())) : `HTTP ${byRef.status}`;
  }
  return { status: res.status, view };
}

/**
 * Effects the Aisle code gives a route for an input the check sends (from code — confirm with Dev). The design does
 * not document them as expected, so the "unchanged" check still FAILS — this only explains the finding.
 */
const CODE_EFFECTS: Record<string, string> = {
  'API-039':
    'without mbti_id the route sets the "close" MBTI option (Profile#update_mbti_info_data, app/models/profile.rb:4803-4810, develop_new 944f76a — from code, confirm with Dev); not documented as expected → finding',
  'API-022':
    'without about the route deletes the active story / bio (Account::Story.add_story, app/models/account/story.rb:24, develop_new 944f76a — from code, confirm with Dev); not documented as expected → finding',
};

/** Fail with the changed key names (value-free) when two own views differ. */
function expectSameView(
  before: OwnView | undefined,
  after: OwnView | undefined,
  what: string,
  apiId?: string,
): void {
  if (!before || !after) return;
  const changed = viewDiff(before, after);
  if (changed.length && apiId && CODE_EFFECTS[apiId]) noteEvidence(`${apiId}: ${CODE_EFFECTS[apiId]}`);
  expect(changed, `${what}: own view unchanged (changed keys listed, values never shown)`).toEqual([]);
}

/** Phone forms and the known fake email of a suite account — the values another user must never see. */
function ownPiiOf(fx: CheckFixtures, s: UserSession | Profile): string[] {
  const email =
    ('known' in s ? s.known?.email : undefined) ?? fx.m2Config.values[`EMAIL_${s.mobileNumber}`] ?? undefined;
  return [...phoneForms(s.mobileNumber), ...(email ? [email] : [])];
}

// ---- IDOR — cannot act on / read another user --------------------------------------------------------------
export async function runIdor(c: AnyCase, fx: CheckFixtures): Promise<void> {
  const api = apiOf(c);
  // Audit fix 2026-10-25: a request without any user / profile id cannot carry B's identifiers — never a pass.
  if (!hasIdorTarget(placeholdersIn(api)))
    blockPrereq(PREREQ.noTarget.id, `${api.id}: ${PREREQ.noTarget.reason}`);
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
  const leaks = scanResponse(res, { allowKeys: PII_KEYS, known: ownPiiOf(fx, b.session) }).filter(
    (f) => f.kind === 'known test value',
  );
  expect(
    leaks,
    `${api.id}: B’s phone (national / full) and email never appear in A’s reply (locations only)`,
  ).toEqual([]);
  expectSameView(before, await selfView(fx, b.session), `${api.id}: B’s own profile`);
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
  // A's phone forms and A's known fake email (onboarding values; M2_VALUE_EMAIL_<number> for Dev-provided accounts).
  const leaks = scanResponse(res, { allowKeys: PII_KEYS, known: ownPiiOf(fx, a) }).filter(
    (f) => f.kind === 'known test value',
  );
  expect(
    leaks,
    `${api.id}: A’s phone (national / full) and email never appear in B’s reply (locations only)`,
  ).toEqual([]);
  // Audit fix 2026-10-25: "A's data is not in the reply" proves nothing unless A is in the reply at all.
  if (!mentionsAccount(res.isJson ? res.json() : undefined, { ref: a.ref, userId: a.userId }))
    blockPrereq(
      'M2Q-32',
      `${api.id}: A not in reply — nothing to check (HTTP ${res.status}; A’s ref / user id not in B’s reply — needs A visible to B in this route)`,
    );
  if (!('known' in a && a.known?.email) && !fx.m2Config.values[`EMAIL_${a.mobileNumber}`])
    noteEvidence(
      'A’s email unknown (Dev-provided account without M2_VALUE_EMAIL_<number>) — phone forms searched only.',
    );
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

/**
 * Before/after own view of the caller's account ("nothing changed") — the full own profile minus volatile keys plus
 * the about text (audit fix 2026-10-25). A change the code explains (CODE_EFFECTS) still fails, with that reason.
 */
async function unchangedAround(
  fx: CheckFixtures,
  caller: Caller,
  run: () => Promise<void>,
  what: string,
  apiId?: string,
  /**
   * The VALID request, sent once first: the variants re-send the rest of the valid body, so the reference state is
   * "after the valid request" — then only what a variant changes beyond the valid request is reported.
   */
  settle?: () => Promise<ApiResponse>,
) {
  if (caller.session && settle)
    fx.observe(`${apiId ?? ''} valid request first (reference state)`, await settle());
  const before = caller.session ? await selfView(fx, caller.session) : undefined;
  await run();
  if (caller.session) expectSameView(before, await selfView(fx, caller.session), what, apiId);
}

/** { firstName: <the caller's current own first name> } for a profile caller; {} when it has none / no profile. */
async function currentName(fx: CheckFixtures, caller: Caller): Promise<Partial<Synthetic>> {
  if (!caller.session || !('ref' in caller.session)) return {};
  const res = await fx.m2.call('API-013', {
    auth: AUTH.user(caller.session.token),
    device: caller.session.device,
  });
  const name =
    res.status === 200 ? (res.json() as { first_name?: unknown } | undefined)?.first_name : undefined;
  return typeof name === 'string' && name.trim() ? { firstName: name } : {};
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

/**
 * Delete / reset routes (FRESH_PER_VARIANT): a 2xx variant legitimately consumes its own throwaway account — delete
 * masks and deletes the user (user.rb:649-673), a reset deletes the user and moves the profile to a new one
 * (user.rb:537-591; a refused reset answers 406, sessions_controller.rb:38-45) — develop_new 944f76a, from code,
 * confirm with Dev. So "own profile unchanged" does not apply; instead each 2xx variant's account must be gone
 * afterwards: its own profile read answers 401 (seen on staging after delete / reset, GATE runs 2026-10-25).
 */
interface GoneCheck {
  label: string;
  status: number;
}

/** After a 2xx reply of a delete / reset variant: the own-profile status of that variant's account (asserted later). */
async function recordGone(
  fx: CheckFixtures,
  who: Caller,
  res: ApiResponse,
  label: string,
  out: GoneCheck[],
): Promise<void> {
  if (!isSuccess(res.status) || !who.session) return;
  const own = await fx.m2.call('API-013', { auth: AUTH.user(who.session.token), device: who.session.device });
  fx.observe(`${label}: own profile afterwards`, own);
  out.push({ label, status: own.status });
}

function expectGone(out: GoneCheck[]): void {
  for (const g of out)
    expect(
      g.status,
      `${g.label}: the successful delete / reset left that variant’s account gone (own profile 401)`,
    ).toBe(401);
}

/** Top-level-or-nested request keys of the Dev example, without duplicates. */
const keysOf = (c: AnyCase) => [...new Set(apiOf(c).requestKeys)];

export async function runContract(c: AnyCase, fx: CheckFixtures): Promise<void> {
  requireBaseline(c.id, ctxOf(fx));
  const api = apiOf(c);
  const caller = await callerFor(api, fx);
  // A baseline of a VALID request must be a valid reply: a server error is never recorded as the contract.
  let sent = false;
  try {
    await withBaseline(
      c.id,
      ctxOf(fx),
      [
        {
          label: 'valid request',
          send: async () => {
            const r = await send(api, fx, caller);
            sent = isSuccess(r.status);
            return r;
          },
        },
      ],
      noServerError,
    );
  } finally {
    // Toggle routes (audit fix 2026-10-25): sent a second time so the account is left as it was.
    if (sent && TOGGLES.includes(api.id)) fx.observe(`${api.id} restore`, await send(api, fx, caller));
  }
}

export async function runParam(c: AnyCase, fx: CheckFixtures): Promise<void> {
  requireBaseline(c.id, ctxOf(fx));
  const api = apiOf(c);
  const caller = await callerFor(api, fx);
  // The caller's CURRENT first name goes into the request: a variant the route accepts (2xx) may legitimately write
  // the name (submit_profile writes while pending_not_verified, user.rb:487-492, from code), and with the current
  // name that write is a no-op — so "own profile unchanged" still proves that no variant changed anything else.
  const synthetic = { ...syntheticFor(fx, caller.session), ...(await currentName(fx, caller)) };
  const request = buildRequest(api, caller.values, synthetic);
  const fresh = FRESH_PER_VARIANT.includes(api.id);
  const gone: GoneCheck[] = [];
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
      const res = await send(api, fx, who, {
        ...(body !== undefined ? { body } : {}),
        ...(query ? { query } : {}),
        retry: false,
      });
      if (fresh) await recordGone(fx, who, res, `without ${key}`, gone);
      return res;
    },
  }));
  if (/:ref|:user_id/.test(api.path))
    variants.push({
      label: 'unknown path id',
      send: () =>
        send(api, fx, caller, {
          values: { REF: `${fx.m2Config.runId}-none`, USER_ID: `${fx.m2Config.runId}-none` },
          synthetic,
        }),
    });
  const run = () =>
    withBaseline(c.id, ctxOf(fx), variants, (l, r) => (noServerError(l, r), noEcho(MARKERS(fx))(l, r)));
  if (fresh) {
    await run();
    expectGone(gone);
  } else
    await unchangedAround(fx, caller, run, 'missing / invalid parameters', api.id, () =>
      send(api, fx, caller, { synthetic, retry: false }),
    );
}

export async function runBody(c: AnyCase, fx: CheckFixtures): Promise<void> {
  requireBaseline(c.id, ctxOf(fx));
  const api = apiOf(c);
  const caller = await callerFor(api, fx);
  const synth = syntheticFor(fx, caller.session);
  const request = buildRequest(api, caller.values, synth);
  const base = (request.body ?? {}) as Record<string, unknown>;
  const marker = `QaBody${fx.data.firstName()}`;
  const fresh = FRESH_PER_VARIANT.includes(api.id);
  const gone: GoneCheck[] = [];
  /** Send one variant as `who`; for delete / reset routes, record whether a 2xx left that account gone. */
  const sendAs = async (who: Caller, label: string, opts: Parameters<typeof send>[3]) => {
    const res = await send(api, fx, who, opts);
    if (fresh) await recordGone(fx, who, res, label, gone);
    return res;
  };
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
        sendAs((await target()).who, 'invalid JSON', {
          rawBody: Buffer.from('{"broken": ', 'utf8'),
          retry: false,
        }),
    },
    {
      label: 'extra keys user_id / tenant_id / first_name',
      send: async () => {
        const t = await target();
        return sendAs(t.who, 'extra keys user_id / tenant_id / first_name', {
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
        return sendAs(t.who, `${key} with the wrong type`, {
          body: { ...t.body, [key]: wrongTypeValue(key, t.body[key]) },
          retry: false,
        });
      },
    });
  }
  const run = () =>
    withBaseline(
      c.id,
      ctxOf(fx),
      variants,
      (l, r) => (noServerError(l, r), noEcho([marker, ...MARKERS(fx)])(l, r)),
    );
  if (fresh) {
    await run();
    expectGone(gone);
  } else
    await unchangedAround(
      fx,
      caller,
      run,
      'malformed bodies (no PII written via unexpected keys)',
      api.id,
      () => send(api, fx, caller, { synthetic: synth, retry: false }),
    );
}

export async function runState(c: AnyCase, fx: CheckFixtures): Promise<void> {
  requireBaseline(c.id, ctxOf(fx));
  const api = apiOf(c);
  const caller = await callerFor(api, fx);
  // Audit fix 2026-10-25: "already done" and "wrong target" are verified by STATE (the caller's and the target's own
  // views, counters included), not by the status alone.
  const target = targetOf(fx, caller);
  const views = async () =>
    combineViews({
      caller: caller.session ? await selfView(fx, caller.session, { keepCounts: true }) : undefined,
      target: target ? await selfView(fx, target, { keepCounts: true }) : undefined,
    });
  const toggle = TOGGLES.includes(api.id);
  // Without any id in the request, "wrong target" is the same request again (nothing to swap).
  const targetless = !hasIdorTarget(placeholdersIn(api));
  const seen: Record<string, OwnView> = {};
  const statuses: number[] = [];
  const step = (label: string, go: () => Promise<ApiResponse>) => async () => {
    const res = await go();
    statuses.push(res.status);
    seen[label] = await views();
    return res;
  };
  const before = await views();
  const variants: Variant[] = [
    { label: 'valid request', send: step('valid', () => send(api, fx, caller, { retry: false })) },
    {
      label: 'action already done (sent again)',
      send: step('again', () => send(api, fx, caller, { retry: false })),
    },
    {
      label: 'wrong target (unknown ids)',
      send: step('wrong', () =>
        send(api, fx, caller, {
          values: {
            REF: `${fx.m2Config.runId}-none`,
            OTHER_REF: `${fx.m2Config.runId}-none`,
            USER_ID: `${fx.m2Config.runId}-none`,
          },
          retry: false,
        }),
      ),
    },
  ];
  noteEvidence('Deactivated / pending / banned account states need special accounts (M2Q-32) — not sent.');
  if (targetless)
    noteEvidence(
      `${api.id}: the request names no id, so "wrong target" is the same request sent a third time.`,
    );
  const others = fx.accounts.numbersExcept(caller.session);
  try {
    await withBaseline(c.id, ctxOf(fx), variants, (l, r) => {
      noServerError(l, r);
      if (isSuccess(r.status)) return;
      const leaks = scanResponse(r, { known: others }).filter((f) => f.kind === 'known test value');
      expect(leaks, `${l}: no PII in the error (locations only)`).toEqual([]);
    });
  } finally {
    // A toggle sent an odd number of times (valid, again, and the target-less "wrong target") is flipped back.
    if (toggle && targetless && seen.wrong) fx.observe(`${api.id} restore`, await send(api, fx, caller));
  }
  if (!seen.valid || !seen.again || !seen.wrong) return; // record mode skipped / a variant was not sent
  const verdict = stateVerdict(
    { before, afterValid: seen.valid, afterAgain: seen.again, afterWrong: seen.wrong },
    statuses,
    toggle,
    toggle && targetless,
  );
  noteEvidence(`${api.id}: observable effect of the valid request: ${verdict.effect.join(', ') || 'none'}.`);
  expect(verdict.failures, `${api.id}: state after each variant (changed keys only)`).toEqual([]);
  if (verdict.nonDiscriminating) {
    for (const v of variants.slice(1))
      test.info().annotations.push({
        type: 'blocked-variant',
        description: `${v.label}: status assertion non-discriminating — HTTP ${statuses[0]} for every variant and no observable state change`,
      });
    blockPrereq(PREREQ.statusOnly.id, `${api.id}: ${PREREQ.statusOnly.reason}`);
  }
}

export async function runRepeat(c: AnyCase, fx: CheckFixtures): Promise<void> {
  requireBaseline(c.id, ctxOf(fx));
  const api = apiOf(c);
  const caller = await callerFor(api, fx);
  // The SAME request four times: the synthetic values (name, email, text) are built once and re-used by every send.
  const synthetic = syntheticFor(fx, caller.session);
  const again = () => send(api, fx, caller, { synthetic, retry: false });
  const view = async () => (caller.session ? selfView(fx, caller.session) : undefined);
  // Toggle routes flip a setting on every send (audit fix 2026-10-25): sent twice they must be back at the start,
  // and the account is always left as it was.
  const toggle = TOGGLES.includes(api.id);
  const initial = toggle ? await view() : undefined;
  let afterFirst: OwnView | undefined;
  let afterSecond: OwnView | undefined;
  const variants: Variant[] = [
    {
      label: 'first request',
      send: async () => {
        const r = await again();
        afterFirst = await view();
        return r;
      },
    },
    {
      label: 'same request again',
      send: async () => {
        const r = await again();
        if (toggle) afterSecond = await view();
        return r;
      },
    },
  ];
  // A repeated request is still a valid request: a server error is never recorded or accepted as the contract.
  await withBaseline(c.id, ctxOf(fx), variants, noServerError);
  const parallel = await Promise.all([again(), again()]);
  parallel.forEach((r, i) => fx.observe(`${api.id} parallel #${i + 1}`, r));
  parallel.forEach((r, i) => noServerError(`parallel #${i + 1}`, r));
  if (toggle) {
    expectSameView(initial, afterSecond, `${api.id}: toggle sent twice is back at the start`);
    const end = await view();
    if (initial && end && viewDiff(initial, end).length) {
      noteEvidence(`${api.id}: the two parallel toggles did not cancel out — sent once more to restore.`);
      fx.observe(`${api.id} restore`, await again());
    }
    return;
  }
  expectSameView(afterFirst, await view(), `${api.id}: repeats change nothing after the first request`);
}

/** Delete a key anywhere in a body. */
function deleteKey(body: unknown, key: string): void {
  if (!body || typeof body !== 'object') return;
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (k === key) delete (body as Record<string, unknown>)[k];
    else deleteKey(v, key);
  }
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
/** How long a CACHE case re-reads for the new name (≤ 45 s), the pause between reads, and the test-time margin. */
export const CACHE_WINDOW_MS = 45_000;
const CACHE_POLL_MS = 5_000;
const CACHE_MARGIN_MS = 20_000;

/**
 * Routes that return the CALLER's own profile (no other member in the reply, no ref in the request), e.g.
 * fetch_own_info, verify_user: the writer reads them itself — read by another user they would show that user.
 */
export const readsOwnProfile = (api: ReturnType<typeof apiOf>) =>
  !returnsOthers(api) && !placeholdersIn(api).some((n) => n === 'REF' || n === 'OTHER_REF');

/**
 * CACHE (2026-10-25 fix): warm read → name change by A → re-read up to CACHE_WINDOW_MS.
 * - Own-profile routes are read by A itself; routes about other members by B (TEST_TOKEN routes outside G1, e.g.
 *   API-191 test_profile_list, with the TEST_TOKEN — Dev doc API-191).
 * - The warm read must show A (A's current name or ref); a route that does not surface the writer to the reader is
 *   Blocked (M2Q-32), never polled.
 * - The writer's own reads and the G1 test routes must show the new name within the window: app writes update the
 *   writer's PII cache at once, and the test write clears the caches (M2Q-12 answer, from code — confirm with Dev).
 * - Another user's view has no propagation window in code (profile cache without TTL, M2Q-12 answer): the time is
 *   recorded; not seen within the window → Blocked with that reason, never a silent pass.
 * - Once seen, two more reads must still show it (no reversion).
 */
export async function runCache(c: AnyCase, fx: CheckFixtures): Promise<void> {
  const api = apiOf(c);
  const n2 = fx.data.firstName();
  let read: () => Promise<ApiResponse>;
  let change: () => Promise<ApiResponse>;
  /** Whether the reply shows the writer A at all (checked on the warm read). */
  let showsWriter: (res: ApiResponse) => boolean = () => true;
  let mode: 'test route' | 'own profile' | 'other user' = 'test route';
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
    const own = readsOwnProfile(api);
    // Own-profile routes need no second account: A (suite account 0) writes and reads.
    const [a, b] = own ? [await fx.accounts.onboarded(0), undefined] : await fx.accounts.connectedPair();
    const writer: Caller = {
      label: 'user A',
      auth: AUTH.user(a.token),
      device: a.device,
      session: a,
      values: valuesFor(fx.m2Config, a),
    };
    let reader: Caller;
    if (own) {
      mode = 'own profile';
      reader = { ...writer, label: 'user A (own profile)' };
    } else {
      mode = 'other user';
      reader = api.auth.includes('USER_TOKEN')
        ? {
            label: 'user B',
            auth: AUTH.user(b!.token),
            device: b!.device,
            session: b!,
            values: valuesFor(fx.m2Config, b!, a),
          }
        : await callerFor(api, fx); // the credential the route needs (e.g. API-191: TEST_TOKEN, Dev doc API-191)
    }
    read = () => send(api, fx, reader, own ? {} : { values: { REF: a.ref, OTHER_REF: a.ref } });
    change = () => send(apiById('API-058'), fx, writer, { synthetic: { firstName: n2 } });
    const n1 = (await currentName(fx, writer)).firstName;
    showsWriter = (res) => {
      const raw = res.rawText();
      return Boolean((n1 && raw.includes(n1)) || (!own && a.ref && raw.includes(a.ref)));
    };
  }
  const warm = await read();
  fx.observe(`${api.id} warm read`, warm);
  if (mode === 'own profile' && !(isSuccess(warm.status) && showsWriter(warm)))
    blockPrereq(
      'M2Q-12',
      `${api.id}: the own-profile reply (HTTP ${warm.status}) does not carry the account’s current first name — nothing to compare`,
    );
  if (mode === 'other user' && !(isSuccess(warm.status) && showsWriter(warm)))
    blockPrereq(
      PREREQ.states.id,
      `${api.id}: route does not surface the writer to the reader (warm read HTTP ${warm.status}, writer’s name / ref not in the reply) — needs connected / discoverable accounts (M2Q-32)`,
    );
  const w = await change();
  fx.observe('name change', w);
  expect(isSuccess(w.status), `name change: ${w.summary()}`).toBe(true);
  // The re-reads get their own time on top of the test's (window + margin), so the poll never hits the test timeout.
  extendTestTimeout(CACHE_WINDOW_MS + CACHE_MARGIN_MS);
  const start = Date.now();
  let seenAt: number | undefined;
  while (seenAt === undefined && Date.now() - start < CACHE_WINDOW_MS) {
    if ((await read()).rawText().includes(n2)) seenAt = Date.now() - start;
    else await new Promise((r) => setTimeout(r, CACHE_POLL_MS));
  }
  const window = `${CACHE_WINDOW_MS / 1000} s`;
  noteEvidence(
    `${mode}: new name ${seenAt === undefined ? `not seen within ${window}` : `seen after ${Math.round(seenAt / 1000)} s`} (window: M2Q-12).`,
  );
  if (seenAt === undefined && mode === 'other user')
    blockPrereq(
      'M2Q-12',
      `${api.id}: another user’s view did not show the new name within ${window}; from code the profile cache has no propagation window (M2Q-12 answer — confirm the expected time with Dev)`,
    );
  expect(
    seenAt !== undefined,
    `${api.id}: the new name is shown within ${window} (${mode}: updated at once per M2Q-12, from code)`,
  ).toBe(true);
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
        expectSameView(before, after, `${key} ${label}: a refused value changes nothing`);
      // From code (M2Q-06): blank names are ignored; others are stored normalised (lossy cases only recorded).
      if (key === 'first_name' && caller.session && isSuccess(res.status)) {
        const stored = after?.view.first_name;
        const want = typeof value === 'string' ? normalizeFirstName(value) : undefined;
        if (value === null || want === undefined)
          expect(
            before?.view.first_name === stored,
            `${key} ${label}: a blank name leaves the name unchanged`,
          ).toBe(true);
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
  let body = res.json();
  if (api.id === 'API-011') {
    // profile_info answers {user: <the VIEWED member>, own_info: <the caller>, …} (fetch_own_info, timer.rb:94):
    // only the caller's own object is compared (2026-10-24, M2-API-011-GATE fix).
    body = (body as { own_info?: unknown } | undefined)?.own_info;
    if (!body || typeof body !== 'object') {
      noteEvidence(`${api.id}: no own_info object in the reply — value part not checkable.`);
      return;
    }
  }
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
  const entries = ownItems(body, p).filter((i) => typeof i.first_name === 'string');
  for (const item of entries)
    expect(item.first_name === want.firstName, `${api.id}: the account’s own list entry shows its name`).toBe(
      true,
    );
  // Audit fix 2026-10-25: a reply without the account's own first name is NOT value-verified — said so explicitly;
  // the case still rests on the anchor (own name = PII name) and the own-profile read-back.
  if (typeof shown !== 'string' && !entries.length)
    noteEvidence(
      `${api.id}: value part not checkable — the reply carries no own first name (not value-verified; only the anchor and the own-profile read-back were compared).`,
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

  // Conversation routes need a member of a conversation: the caller is account 0 of the suite's connected pair
  // (its conversation id is only filled for a member), every other GATE case uses the dedicated gate account.
  const conversation = placeholdersIn(api).includes('CONVERSATION_ID');
  const pooled = conversation ? (await fx.accounts.suitePair()).a : await fx.accounts.onboarded(GATE_ACCOUNT);
  const p = state === 'approved' ? await fx.accounts.waitApproved(pooled, 'gate account') : pooled;
  const before = await ownValues(fx, p);
  // Anchor (gate off, M2Q-02): writes go to both stores, so the app's own name equals the PII name.
  expect(before.firstName === (await piiName(fx, p.userId!)), 'own first name = PII first name').toBe(true);
  if (conversation)
    noteEvidence(
      `${api.id}: called by account 0 of the suite's connected pair (a conversation member); its current name and email are the expected values.`,
    );
  else if (fx.accounts.isOwnOnboarded(GATE_ACCOUNT))
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
  // The account's CURRENT name (the throwaway is shared by the API's cases, which may have renamed it); its known
  // onboarding values when the own profile is not readable.
  const now = await fx.m2.call('API-013', { auth: AUTH.user(p.token), device: p.device });
  const current = now.status === 200 ? deepValue(now.json(), 'first_name') : undefined;
  const want: { firstName: unknown; email: unknown } = {
    firstName: typeof current === 'string' ? current : p.known?.firstName,
    email: p.known?.email,
  };
  const input = PII_INPUT[api.id] ?? [];
  const synthetic: Partial<Synthetic> = {};
  // submit_profile_web only creates a profile when the user has none (user.rb:625, 637-641, develop_new 944f76a): for
  // an account that already has one, the submitted name is NOT written — the existing name must stay unchanged.
  const writesName = input.includes('NAME') && !SUBMIT_ONLY_WITHOUT_PROFILE.includes(api.id);
  if (input.includes('NAME')) synthetic.firstName = fx.data.firstName();
  if (writesName) want.firstName = synthetic.firstName;
  else if (input.includes('NAME'))
    noteEvidence(
      `${api.id}: the account already has a profile, so the route does not write the submitted name — the existing name is expected unchanged (user.rb:625, 637-641; from code — confirm with Dev).`,
    );
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
    expect(
      (await piiName(fx, p.userId!)) === want.firstName,
      writesName ? 'PII first name = the written name' : 'PII first name unchanged',
    ).toBe(true);
}

/** Profile submit routes that write only when the user has no profile yet (user.rb:625, 637-641, from code). */
const SUBMIT_ONLY_WITHOUT_PROFILE = ['API-061'];

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
