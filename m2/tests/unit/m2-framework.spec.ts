/**
 * UNIT — Milestone 2 framework self-tests (no network beyond a local capture server, no .env needed):
 * design ↔ test sync, synthetic phone numbers, the PII scanner and what the M2 client puts on the wire.
 */
import { expect, test } from '@playwright/test';
import { ApiResponse } from '../../../core/http/api-response';
import { ExchangeRecorder } from '../../../core/utils/exchange-recorder';
import { Logger } from '../../../core/utils/logger';
import { registerSecretValue, scrubText } from '../../../core/utils/redaction';
import { Secret } from '../../../core/utils/secret';
import { listInventory } from '../../../reporting/generator/inventory';
import { AUTH, expiredFormatJwt, wrongCredentialsFor } from '../../src/auth/credentials';
import { isAllowedTestNumber, testPhoneNumber } from '../../src/auth/test-phone';
import {
  expectRefusedWithoutPii,
  refusalProblem,
  scanForPii,
  scanResponse,
  shapeOf,
  unlistedPii,
} from '../../src/assertions/pii.assertions';
import { statusFromDeps } from '../../scripts/m2-questions';
import { M2Client } from '../../src/clients/m2-client';
import { loadM2Config } from '../../src/config/m2-config';
import { apiById, caseById, design, titleOf } from '../../src/design';
import {
  aboutOf,
  ABOUT_KEY,
  REQUIRED_VIEW_KEYS,
  stableView,
  viewDiff,
  type OwnView,
} from '../../src/checks/own-view';
import {
  combineViews,
  hasIdorTarget,
  isStatusOnlyReply,
  mentionsAccount,
  stateVerdict,
} from '../../src/checks/verdicts';
import { placeholdersIn, tryBuildRequest, questionFor } from '../../src/checks/request-builder';
import { IDOR_OTHER_TARGET, NO_OTHER_USER, OWN_PROFILE_BY_REF } from '../../scripts/m2-code-evidence';
import {
  approvableVariants,
  invalidAcceptedProblem,
  isInvalidVariant,
  piiKeyDiff,
  shapeDiff,
  shapeOf as bodyShape,
  unionShapes,
  type BaselineFile,
} from '../../src/baseline/baseline';
import { DESTRUCTIVE, PAUSED, publicUserName, timeToken } from '../../src/checks/context';
import {
  missingProtectedIn,
  UNSAFE_REASON,
  unsafeIdsIn,
  unsafeVariantLabel,
  variantSafety,
  wrongTypeValue,
} from '../../src/checks/safety';
import { idsIn } from '../../src/checks/catalogue';
import { runsLate } from '../../src/checks/late';
import {
  extendTestTimeout,
  ledgerDisposition,
  silentMp3,
  type LedgerEntry,
} from '../../src/accounts/accounts';
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { submitProfileBody } from '../../src/accounts/onboarding';
import { SessionHelper } from '../../src/auth/session';
import { CaptureServer } from './helpers/capture-server';

/** Synthetic token — NOT a real credential. */
const FAKE_TOKEN = 'fedcba9876543210fedcba9876543210';
registerSecretValue(FAKE_TOKEN, '$AISLE_TEST_TOKEN');

const res = (status: number, body: string, type = 'application/json') =>
  new ApiResponse('raw', 'GET', '/x', status, { 'content-type': type }, 'rid', 1, 'none', body);

test.describe('UNIT M2 framework', () => {
  test('UT-M2-001 Every automatable design case has exactly one test titled with its workbook ID and name', () => {
    const tests = listInventory(['m2-api']);
    const ids = tests.map((t) => t.id);
    expect(new Set(ids).size, 'no duplicate test IDs').toBe(ids.length);
    for (const t of tests)
      expect(t.title, `title of ${t.id} matches the workbook`).toBe(titleOf(caseById(t.id)));
    const expected = design()
      .cases.filter((c) => c.mode !== 'Manual')
      .map((c) => c.id);
    const missing = expected.filter((id) => !ids.includes(id));
    expect(missing, 'design cases without a test').toEqual([]);
    expect(ids.length, 'tests = automatable design cases').toBe(expected.length);
  });

  test('UT-M2-002 Test phone numbers are +91 10xxxxxxxx, never the reserved 106 series, and unique per run', () => {
    const numbers = Array.from({ length: 2000 }, (_, i) => testPhoneNumber('qa-m2-20261023t000000-abcd', i));
    for (const n of numbers) {
      expect(isAllowedTestNumber(n)).toBe(true);
      expect(n.startsWith('106')).toBe(false);
    }
    expect(new Set(numbers).size).toBeGreaterThan(1990);
    expect(isAllowedTestNumber('1061234567')).toBe(false);
    expect(isAllowedTestNumber('9876543210')).toBe(false);
    expect(isAllowedTestNumber('1071234567')).toBe(true);
    expect(testPhoneNumber('run-a', 0)).not.toBe(testPhoneNumber('run-b', 0));
  });

  test('UT-M2-003 The PII scan finds names, emails and phones by location only, and accepts observed refusals', () => {
    expect(scanForPii({ data: { first_name: 'Qa' } })).toEqual([
      { where: '$.data.first_name', kind: 'PII field with a value' },
    ]);
    expect(scanForPii({ note: 'mail qa@example.test' })[0]?.kind).toBe('email address');
    expect(scanForPii({ x: 'call +91 9876543210' })[0]?.kind).toBe('phone number');
    expect(scanForPii({ x: '1012345678' })[0]?.kind).toBe('phone number');
    expect(scanForPii({ x: 'Qaxyz' }, { known: ['Qaxyz'] })[0]?.kind).toBe('known test value');
    expect(JSON.stringify(scanForPii({ email: 'qa@example.test' }))).not.toContain('qa@example.test');
    // Observed refusal and error shapes carry no PII.
    expect(scanForPii({ unauthorized_request: true })).toEqual([]);
    expect(scanForPii({ title: 'Error', message: 'Something went wrong', is_backend_error: true })).toEqual(
      [],
    );
    expect(scanForPii({ status: true, user_id: 'qa-m2-x', first_name: null })).toEqual([]);
    expect(scanForPii({ at: '2026-10-23T10:00:00Z', epoch: '1761200000', ms: '1761200000123' })).toEqual([]);
    expect(scanResponse(res(401, '', 'text/html'))).toEqual([]);
    expect(shapeOf(res(401, '', 'text/html; charset=utf-8'))).toBe('401 empty text/html');
    expect(shapeOf(res(401, '{"unauthorized_request":true}'))).toBe('401 {unauthorized_request}');
    expectRefusedWithoutPii(res(401, '{"unauthorized_request":true}'), 'refusal');
    expect(() => expectRefusedWithoutPii(res(200, '{}'), 'accepted')).toThrow();
    expect(() => expectRefusedWithoutPii(res(401, '{"email":"qa@example.test"}'), 'leak')).toThrow();
  });

  test('UT-M2-014 Status rule: read gates ON → WAITING, DB hold → BLOCKED, unmigrated-profile cases removed (M2Q-05)', () => {
    expect(statusFromDeps(['M2Q-02', 'M2Q-03'])).toBe('NOT RUN'); // M2Q-02 answered: gates OFF
    expect(statusFromDeps(['M2Q-43'])).toBe('WAITING');
    expect(statusFromDeps(['M2Q-43', 'M2Q-04'])).toBe('BLOCKED');
    expect(statusFromDeps(['M2Q-43', 'M2Q-25'])).toBe('NEED DEV CLARIFICATION');
    expect(statusFromDeps(['M2Q-16', 'M2Q-44'])).toBe('BLOCKED');
    const cases = design().cases;
    // Removed 2026-10-25 (M2Q-05: all staging profiles are migrated) — must not come back; IDs are never reused.
    expect(cases.some((c) => c.check === 'UNMIG')).toBe(false);
    for (const id of ['M2-FNAME-014', 'M2-PHONE-003', 'M2-PAY-004'])
      expect(
        cases.some((c) => c.id === id),
        `${id} stays removed`,
      ).toBe(false);
    expect(cases.some((c) => c.status === 'NOT APPLICABLE')).toBe(false);
    const gate = cases.filter((c) => c.check === 'GATE');
    expect(gate.every((c) => c.waiting?.includes('M2Q-43') && c.mode === 'API automation')).toBe(true);
    expect(gate.some((c) => c.status === 'NOT RUN')).toBe(true);
    const db = cases.filter((c) => c.id.startsWith('M2-DB-') || (c.check ?? '').startsWith('DB-'));
    expect(db.every((c) => c.deps.includes('M2Q-44') && c.status !== 'NOT RUN')).toBe(true);
    expect(caseById('M2-FNAME-013').status).toBe('WAITING');
    expect(caseById('M2-FNAME-001').status).toBe('NOT RUN');
  });

  test('UT-M2-015 "No extra PII" flags only real-looking values of unlisted fields, by path', () => {
    const body = {
      user: { first_name: 'Qaxyz', email: 'qa@example.test', mobile_number: '1012345678' },
      settings: { email: true, phone: false },
      interests: [{ name: 'Music' }],
    };
    expect(unlistedPii(body, ['NAME', 'EMAIL', 'PHONE'])).toEqual([]);
    expect(unlistedPii(body, ['NAME'])).toEqual(['$.user.email (email)', '$.user.mobile_number (phone)']);
    expect(unlistedPii(body, ['EMAIL', 'PHONE'])).toEqual(['$.user.first_name (name)']);
    expect(JSON.stringify(unlistedPii(body, []))).not.toContain('qa@example.test');
  });

  test('UT-M2-004 The expired-format JWT is well-formed, expired and never a real credential', () => {
    const jwt = expiredFormatJwt(new Date('2026-10-23T00:00:00Z'));
    const [h, p, s] = jwt.split('.');
    expect(s?.length).toBeGreaterThan(20);
    expect(JSON.parse(Buffer.from(h!, 'base64url').toString()).alg).toBe('HS256');
    const claims = JSON.parse(Buffer.from(p!, 'base64url').toString()) as { exp: number };
    expect(claims.exp * 1000).toBeLessThan(new Date('2026-10-23T00:00:00Z').getTime());
  });
});

test.describe('UNIT M2 request builder', () => {
  const synth = {
    firstName: 'Qaxyz',
    email: 'qa-m2-x@example.test',
    freeText: 'FT_run text',
    mobileNumber: '1071234567',
  };

  test('UT-M2-008 Dev cURL bodies get the run’s synthetic PII and the actor’s ids; Dev sample data never goes out', () => {
    const api = design().inventory.find((a) => a.id === 'API-002')!;
    const { request, missing } = tryBuildRequest(api, { USER_ID: 'qa-m2-unit-a' }, synth);
    expect(missing).toEqual([]);
    expect(request.body).toEqual({ user_id: 'qa-m2-unit-a', first_name: 'Qaxyz' });
    expect(JSON.stringify(request.body)).not.toContain('Asha');
    const onboarding = design().inventory.find((a) => a.id === 'API-057')!;
    const r2 = tryBuildRequest(onboarding, {}, synth);
    expect(r2.missing).toContain('FAITH_ID');
    expect(questionFor('FAITH_ID')).toBe('M2Q-36');
    expect(questionFor('PAYTM_CHECKSUM')).toBe('M2Q-17');
    expect(questionFor('ADMIN_OTP')).toBe('M2Q-04');
  });

  test('UT-M2-009 GET query and path ids are filled; a missing path id is reported, never invented', () => {
    const api = design().inventory.find((a) => a.id === 'API-001')!;
    const r = tryBuildRequest(api, { USER_ID: 'u1' }, synth);
    expect(r.request.query).toEqual({ user_id: 'u1' });
    const withRef = design().inventory.find((a) => a.path.includes(':ref') && a.method === 'GET')!;
    expect(tryBuildRequest(withRef, {}, synth).missing).toContain('REF');
    expect(tryBuildRequest(withRef, { REF: 'r1' }, synth).request.pathParams).toEqual({ ref: 'r1' });
  });
});

test.describe('UNIT M2 baselines and safety', () => {
  test('UT-M2-010 Contract shapes: keys and types compared value-free; null and empty lists are tolerant', () => {
    const a = bodyShape({ status: true, user: { first_name: 'Qa', ids: [1, 2] }, note: null });
    expect(
      shapeDiff(a, bodyShape({ status: false, user: { first_name: 'Other', ids: [] }, note: 'x' })),
    ).toEqual([]);
    expect(shapeDiff(a, bodyShape({ status: true, user: { ids: [3] }, note: null }))).toEqual([
      '$.user.first_name: missing',
    ]);
    expect(
      shapeDiff(a, bodyShape({ status: 'yes', user: { first_name: 'Qa', ids: [1], email: 'x' } })),
    ).toEqual(['$.note: missing', '$.status: boolean → string', '$.user.email: new key']);
    expect(JSON.stringify(a)).not.toContain('Qa');
    // List items: their key set depends on the records returned — only common keys are compared (types still fail).
    const list = bodyShape({
      items: [
        { id: 1, a: 'x' },
        { id: 2, b: 'y' },
      ],
    });
    expect(shapeDiff(list, bodyShape({ items: [{ id: 3, c: 'z' }] }))).toEqual([]);
    expect(shapeDiff(list, bodyShape({ items: [{ id: '3' }] }))).toEqual(['$.items[].id: number → string']);
  });

  test('UT-M2-011 Delete / reset / deactivate / report routes are never sent for Dev-provided accounts', () => {
    const risky = design()
      .inventory.filter(
        (x) => /delete|reset_profile|deactivate|\/report$/.test(x.path) && x.auth.includes('USER_TOKEN'),
      )
      .map((x) => x.id);
    for (const id of risky) expect(DESTRUCTIVE, `${id} is guarded`).toContain(id);
  });
});

test.describe('UNIT M2 request safety and placeholder values', () => {
  test('UT-M2-016 Wrong-type variants never turn an id into another record’s id, and never make a false flag truthy', () => {
    for (const key of [
      'user_id',
      'ref',
      'id',
      'receiver_profile',
      'conversation_id',
      'faith_id',
      'user_ids',
    ]) {
      const v = wrongTypeValue(key, 'qa-m2-unit-1');
      expect(typeof v === 'number' || /^\d/.test(String(v)), `${key}: never a number`).toBe(false);
      expect(wrongTypeValue(key, 7)).toBe('qa-not-a-number');
    }
    expect(wrongTypeValue('is_new_user', false)).toBeNull();
    expect(wrongTypeValue('can_save', true)).toBe('qa-not-a-number');
    expect(wrongTypeValue('about', 'text')).toBe(12345);
    expect(wrongTypeValue('page', 1)).toBe('qa-not-a-number');
  });

  test('UT-M2-017 The safety guard refuses ids that are not the suite’s own, before anything is sent', () => {
    const suite = new Set(['501', 'refA']);
    const catalogue = new Set(['6', '121']);
    const ok = (body: unknown, query?: Record<string, string>) =>
      unsafeIdsIn({ apiId: 'API-X', body, query }, suite, catalogue);
    expect(ok({ user_id: '501', ref: 'refA', faith: { id: 'qa-x' }, trait_id: '121' })).toEqual([]);
    expect(ok({ user_id: 'qa-m2-run-other', tenant_id: 'qa-other-tenant', id: null })).toEqual([]);
    expect(ok({ user_id: { qa: 'wrong-type' } })).toEqual([]);
    expect(ok({ user_id: 12345 })).toEqual(['$body.user_id: not a suite account’s id']);
    expect(ok({ user_id: '6' }), 'a catalogue value is never accepted as a user id').toHaveLength(1);
    expect(ok({ ref: 'someRealRef' })).toHaveLength(1);
    expect(ok({ user_ids: ['501', '502'] })).toEqual(['$body.user_ids[1]: not a suite account’s id']);
    expect(ok({ conversation_id: true })).toHaveLength(1);
    expect(ok({ data: { faith: { id: '6' } }, answer_id: 0 }), 'nested option id = catalogue value').toEqual(
      [],
    );
    expect(ok({ id: '6' }), 'a top-level id names a record: catalogue values are not enough').toHaveLength(1);
    expect(ok({}, { user_id: '999' })).toHaveLength(1);
    expect(
      unsafeIdsIn(
        { apiId: 'API-062', body: { user_id: '501', is_new_user: 'qa-not-a-number' } },
        suite,
        catalogue,
      ),
    ).toEqual(['$body.is_new_user: must never be truthy']);
    expect(
      unsafeIdsIn({ apiId: 'API-062', body: { user_id: '501', is_new_user: null } }, suite, catalogue),
    ).toEqual([]);
  });

  test('UT-M2-018 Placeholder values: config defaults, no identity from the environment, generated values, gender', () => {
    const c = loadM2Config({ M2_VALUE_TRAIT_ID: '7', M2_VALUE_OTHER_REF: 'x', M2_VALUE_USER_ID: '12345' });
    expect(c.values.TRAIT_ID).toBe('7');
    expect(c.values.OTHER_REF, 'identity values never come from the environment').toBeUndefined();
    expect(c.values.USER_ID).toBeUndefined();
    expect(c.defaultValues).toMatchObject({
      FAITH_ID: '6',
      PHONE_CODE_ID: '242',
      MBTI_ID: '8',
      DELETE_REASON_ID: '1',
    });
    expect(c.approvalWaitMs).toBe(900_000); // 15 min from onboarding (approval took 8–20 min, 2026-10-24)
    expect(timeToken(1_790_000_000_000)).toBe('17900000000000000');
    expect(timeToken()).toMatch(/^\d{17}$/);
    expect(publicUserName()).toMatch(/^qa_m2_[0-9a-f]{6}$/);
    expect(publicUserName()).toMatch(/^[a-zA-Z0-9._-]{3,20}$/);
    const api = design().inventory.find((a) => a.id === 'API-057')!;
    const values = {
      FAITH_ID: '6',
      LANGUAGE_ID: '1',
      RELATIONSHIP_GOAL_ID: '2',
      PHOTO_URL_1: 'u1',
      PHOTO_URL_2: 'u2',
    };
    const male = tryBuildRequest(api, values, {
      firstName: 'Qa',
      email: 'e@example.test',
      freeText: 't',
      gender: 'Male',
    });
    expect(male.missing).toEqual([]);
    expect(JSON.stringify(male.request.body)).toContain('"gender":"Male"');
    const unknown = tryBuildRequest(api, values, { firstName: 'Qa', email: 'e@example.test', freeText: 't' });
    expect(JSON.stringify(unknown.request.body), 'unknown gender keeps Dev’s value').toContain(
      '"gender":"Female"',
    );
    expect(questionFor('ROOM_ID')).toBe('M2Q-45');
    expect(idsIn({ data: [{ id: 3 }, { id: '4' }], meta: { id: 9 } }, ['id'])).toEqual({
      all: new Set(['3', '4', '9']),
      first: '3',
    });
    const mp3 = silentMp3();
    expect(mp3.length).toBe(417 * 40);
    expect([...mp3.subarray(0, 4)]).toEqual([0xff, 0xfb, 0x90, 0x64]);
  });

  test('UT-M2-019 Contract lists: nested item data is compared by kind only; a new PII key always fails', () => {
    const approved = bodyShape({
      top: { first_name: 'Qa' },
      items: [{ id: 1, work: { title: 'x', level: 2 }, photos: [{ url: 'u' }], first_name: 'A' }],
    });
    const live = bodyShape({
      top: { first_name: 'Qa' },
      items: [{ id: 2, work: { other: true }, photos: [], drinking_id: 3 }],
    });
    expect(shapeDiff(approved, live)).toEqual([]);
    expect(
      shapeDiff(approved, bodyShape({ top: { first_name: 'Qa' }, items: [{ id: 2, work: [1] }] })),
    ).toEqual(['$.items[].work: type changed']);
    expect(shapeDiff(approved, bodyShape({ top: { first_name: 'Qa' }, items: [{ id: 'x' }] }))).toEqual([
      '$.items[].id: number → string',
    ]);
    const want = { piiKeys: ['first_name'], shape: bodyShape({ items: [{ first_name: 'A' }] }) };
    expect(piiKeyDiff(want, { piiKeys: [] }).failures, 'missing only inside lists = note').toEqual([]);
    expect(piiKeyDiff(want, { piiKeys: [] }).notes).toHaveLength(1);
    expect(piiKeyDiff(want, { piiKeys: ['first_name', 'email'] }).failures).toEqual(['NEW PII key email']);
    const ownTop = { piiKeys: ['first_name'], shape: bodyShape({ user: { first_name: 'Qa' } }) };
    expect(piiKeyDiff(ownTop, { piiKeys: [] }).failures).toEqual(['missing PII key first_name']);
    expect(unionShapes(bodyShape({ a: 1, n: null }), bodyShape({ b: 'x', n: { k: 1 } }))).toEqual({
      a: 'number',
      b: 'string',
      n: { k: 'number' },
    });
  });
});

test.describe('UNIT M2 unsafe variants, approvals and account clean-up', () => {
  const api = (id: string) => design().inventory.find((a) => a.id === id)!;

  test('UT-M2-020 A variant that removes or blanks a target key is never sent; API-196 / API-197 are paused (M2Q-46)', () => {
    expect(variantSafety(api('API-046'), 'without', 'ref')).toBe(UNSAFE_REASON);
    expect(variantSafety(api('API-061'), 'without', 'receiver_profile')).toBe(UNSAFE_REASON);
    expect(variantSafety(api('API-119'), 'without', 'ref'), 'GET reads too').toBe(UNSAFE_REASON);
    expect(variantSafety(api('API-062'), 'without', 'user_id')).toBe(UNSAFE_REASON);
    expect(variantSafety(api('API-062'), 'wrong type', 'user_id')).toBe(UNSAFE_REASON);
    expect(
      variantSafety(api('API-046'), 'wrong type', 'ref'),
      'ref → object: by_ref cannot use it',
    ).toBeUndefined();
    expect(variantSafety(api('API-059'), 'without', 'reason_id')).toBeUndefined();
    expect(unsafeVariantLabel(api('API-046'), 'without ref')).toBe(UNSAFE_REASON);
    expect(unsafeVariantLabel(api('API-046'), 'unknown path id')).toBeUndefined();
    // Send-time guard: a missing / null / blank target is refused; a run-prefixed unknown value is allowed.
    const like = (body: unknown) => missingProtectedIn(api('API-046'), { apiId: 'API-046', body });
    expect(like({ ref: 'qa-m2-unit-none' })).toEqual([]);
    expect(like({})).toHaveLength(1);
    expect(like({ ref: null })).toHaveLength(1);
    expect(like({ ref: '  ' })).toHaveLength(1);
    expect(like({})[0]).toContain('$body.ref');
    expect(missingProtectedIn(api('API-011'), { apiId: 'API-011', query: {} })[0]).toContain('$query.ref');
    expect(missingProtectedIn(api('API-046'), { apiId: 'API-046', rawBody: true }), 'raw body').toEqual([]);
    expect(PAUSED).toEqual(['API-196', 'API-197']);
    const paused = design().cases.filter((c) => c.apis[0] === 'API-196' || c.apis[0] === 'API-197');
    expect(paused.length).toBeGreaterThan(0);
    for (const c of paused) {
      expect(c.deps, `${c.id} waits for M2Q-46`).toContain('M2Q-46');
      expect(c.status, `${c.id} does not run`).not.toBe('NOT RUN');
    }
  });

  test('UT-M2-021 Phone, country code and login OTP are never removed, and never become a non-synthetic number', () => {
    expect(wrongTypeValue('mobile_number', '1071234567')).toBe('qa-not-a-phone');
    expect(wrongTypeValue('phone_number', 1071234567)).toBe('qa-not-a-phone');
    expect(wrongTypeValue('otp', '1234')).toBe('qa-not-an-otp');
    const login = api('API-060');
    expect(variantSafety(login, 'without', 'mobile_number')).toBeDefined();
    expect(variantSafety(login, 'without', 'phone_code_id')).toBeDefined();
    expect(variantSafety(login, 'without', 'otp')).toBeDefined();
    expect(variantSafety(login, 'wrong type', 'phone_code_id')).toBeDefined();
    expect(variantSafety(login, 'wrong type', 'mobile_number')).toBeUndefined();
    expect(variantSafety(login, 'wrong type', 'otp')).toBeUndefined();
    const check = (body: unknown) =>
      unsafeIdsIn({ apiId: 'API-060', body, phoneCodeId: '242' }, new Set(), new Set(['242', '1']));
    expect(check({ phone_code_id: '242', mobile_number: '1071234567', otp: '1234' })).toEqual([]);
    expect(check({ phone_code_id: '242', mobile_number: '+911071234567' })).toEqual([]);
    expect(check({ phone_code_id: '242', mobile_number: 'qa-not-a-phone' })).toEqual([]);
    expect(check({ phone_code_id: '242', mobile_number: 12345 })).toEqual([
      '$body.mobile_number: not a synthetic test number',
    ]);
    expect(check({ phone_code_id: '242', mobile_number: '1061234567' }), 'reserved 106 series').toHaveLength(
      1,
    );
    expect(
      check({ phone_code_id: '242', mobile_number: '9876543210' }),
      'a real-looking number',
    ).toHaveLength(1);
    expect(check({ phone_code_id: '1', mobile_number: '1071234567' }), 'another country').toHaveLength(1);
    expect(check({ phone_code_id: null, mobile_number: '1071234567' })).toHaveLength(1);
    expect(check({ phone_code_id: { qa: 'wrong-type' }, mobile_number: '1071234567' })).toHaveLength(1);
    expect(
      missingProtectedIn(login, {
        apiId: 'API-060',
        body: { phone_code_id: '242', mobile_number: '1071234567' },
      }),
    ).toEqual(['$body.otp: missing or blank — would log in / write with no synthetic number']);
  });

  test('UT-M2-022 A server error or a never-sent variant is never approved; REPEAT and STATE check for server errors', () => {
    const obs = (status: number) => ({ status, contentType: 'application/json', shape: {}, piiKeys: [] });
    const rec: BaselineFile = {
      caseId: 'M2-API-046-PARAM',
      recordedAt: '',
      runId: '',
      build: '',
      note: '',
      variants: { 'without ref': obs(200), 'without page': obs(422), 'first request': obs(500) },
      notSent: { 'without receiver': UNSAFE_REASON },
    };
    const r = approvableVariants(rec, (l) => unsafeVariantLabel(api('API-046'), l));
    expect(Object.keys(r.approve)).toEqual(['without page']);
    expect(r.refused.map((x) => x.label).sort()).toEqual(['first request', 'without ref']);
    // The REPEAT and STATE runners pass the no-server-error invariant to the baseline (structural check).
    const src = readFileSync(path.join(__dirname, '../../src/checks/per-api.ts'), 'utf8');
    const body = (fn: string) =>
      src.slice(src.indexOf(`export async function ${fn}(`)).split('\nexport ')[0]!;
    expect(body('runRepeat')).toContain('withBaseline(c.id, ctxOf(fx), variants, noServerError)');
    expect(body('runRepeat')).toContain('noServerError(`parallel #');
    expect(body('runState')).toContain('noServerError(l, r)');
  });

  test('UT-M2-023 Clean-up: never-created and deleted entries are not logged into; onboarding-failed accounts are deleted', () => {
    const e = (x: Partial<LedgerEntry>): LedgerEntry => ({
      mobileNumber: '1071234567',
      deviceId: 'd',
      createdAt: '',
      deleted: null,
      deleteStatus: null,
      ...x,
    });
    const none = new Set<string>();
    expect(ledgerDisposition(e({ deleted: true }), none)).toBe('alreadyDeleted');
    expect(ledgerDisposition(e({}), new Set(['1071234567']))).toBe('alreadyDeleted');
    expect(ledgerDisposition(e({ note: 'wrong-OTP check — must not create an account' }), none)).toBe(
      'neverCreated',
    );
    expect(ledgerDisposition(e({ neverCreated: true }), none)).toBe('neverCreated');
    expect(
      ledgerDisposition(
        e({ userId: '9', note: 'onboarding failed: submit_profile refused: HTTP 500' }),
        none,
      ),
      'an account that exists is deleted, even when its note says "refused"',
    ).toBe('delete');
    expect(ledgerDisposition(e({ unusable: true }), none)).toBe('unusable');
    expect(ledgerDisposition(e({ mobileNumber: '1061234567' }), none)).toBe('notAllowed');
    const before = test.info().timeout;
    extendTestTimeout(5_000);
    expect(test.info().timeout, 'approval / throwaway waits extend the test timeout').toBe(before + 5_000);
  });
});

test.describe('UNIT M2 client wire behaviour', () => {
  const server = new CaptureServer();
  test.beforeAll(async () => server.start());
  test.afterAll(async () => server.stop());
  test.beforeEach(() => {
    server.requests.length = 0;
  });
  const client = (recorder?: ExchangeRecorder) =>
    new M2Client(
      { ...loadM2Config({ M2_TEST_RUN_ID: 'qa-m2-unit' }), baseUrl: server.baseUrl },
      new Logger({ level: 'debug' }),
      recorder,
    );

  test('UT-M2-005 Method, path and headers come from the inventory; no credential, X-PII-* or tenant_id is added', async () => {
    await client().call('API-013', { auth: AUTH.none });
    const r = server.requests[0]!;
    expect(r.method).toBe('GET');
    expect(r.url).toBe('/V1/users/fetch_own_info');
    expect(r.headers.authorization).toBeUndefined();
    expect(r.headers.accept).toBe('application/json');
    expect(r.headers.device_type).toBe('android');
    expect(r.headers.app_version).toBe('10.0.0');
    expect(r.headers.unique_identifier).toBe('qa-m2-unit-device');
    expect(Object.keys(r.headers).some((h) => h.startsWith('x-pii'))).toBe(false);
    expect(r.body).toBe('');
    expect(r.url).not.toContain('tenant');
  });

  test('UT-M2-006 POST sends {} by default, CMS routes send webcms, path ids are synthetic, redirects are not followed', async () => {
    server.enqueue({ status: 302, headers: { location: '/login' } });
    const first = await client().call('API-136', { auth: AUTH.invalidBearer });
    expect(first.status).toBe(302);
    expect(server.requests).toHaveLength(1); // the redirect was not followed
    expect(server.requests[0]!.url).toBe('/users/qa-m2-unit-none');
    expect(server.requests[0]!.headers.authorization).toBe('Bearer invalid');
    const cms = design().inventory.find((a) => a.headers.includes('webcms') && a.method === 'POST')!;
    await client().call(cms.id, { auth: AUTH.none });
    const r = server.requests[1]!;
    expect(r.headers.webcms).toBe('true');
    expect(r.body).toBe('{}');
    expect(r.headers['content-type']).toBe('application/json');
  });

  test('UT-M2-007 A real credential goes on the wire but reports show only its placeholder', async () => {
    const recorder = new ExchangeRecorder();
    await client(recorder).call('API-001', {
      auth: AUTH.testToken(new Secret(FAKE_TOKEN)),
      query: { user_id: 'u1' },
    });
    expect(server.requests[0]!.headers.authorization).toBe(`Bearer ${FAKE_TOKEN}`);
    expect(server.requests[0]!.url).toBe('/V1/pii_integration/first_name?user_id=u1');
    const text = JSON.stringify(recorder.exchanges());
    expect(text).not.toContain(FAKE_TOKEN);
    expect(text).toContain('$AISLE_TEST_TOKEN');
  });

  test('UT-M2-012 Login sends phone_code_id, device fields and the signature in the body — never logged or recorded', async () => {
    const FAKE_SIG = '-----FAKE-SIGNATURE-----\nnot-a-real-signature-value\n';
    const config = {
      ...loadM2Config({ M2_TEST_RUN_ID: 'qa-m2-unit', M2_LOGIN_SIGNATURE_V1: FAKE_SIG }),
      baseUrl: server.baseUrl,
    };
    const log = new Logger({ level: 'debug' });
    const sessions = new SessionHelper(config, log);
    await sessions.requestOtp('1071234567', sessions.device('qa-m2-unit-dev'));
    const body = JSON.parse(server.requests[0]!.body) as Record<string, unknown>;
    expect(body).toMatchObject({
      mobile_number: '1071234567',
      phone_code_id: 242,
      device_type: 'ios',
      app_version: '7.9.15',
      unique_identifier: 'qa-m2-unit-dev',
      signature_v1: FAKE_SIG,
    });
    expect(log.lines().join('\n')).not.toContain('not-a-real-signature-value');
  });

  test('UT-M2-013 The onboarding body uses synthetic values only: test-domain email, 4 CDN photos, no Dev sample data', () => {
    const photos = loadM2Config({}).onboardingPhotos.Male;
    const body = submitProfileBody({
      firstName: 'Qaxyz',
      email: 'qa-m2-x@example.test',
      gender: 'Male',
      photos,
    });
    const gi = (body.data as { general_information: Record<string, unknown> }).general_information;
    expect(gi.first_name).toBe('Qaxyz');
    expect(gi.ref_id).toBe('');
    const OPTION_KEYS = [
      'answer_id',
      'id',
      'interest_id',
      'is_default',
      'is_hidden',
      'is_mother_tongue',
      'is_open_to_all',
      'is_selected',
      'max_length',
      'min_length',
      'name',
      'opposite_tag_id',
      'order',
      'positon',
      'preference_only',
      'question_id',
      'regions',
      'show_on_profile',
      'tag_id',
      'trait_id',
      'value',
    ];
    for (const key of ['diet', 'drinking_v2', 'faith', 'marital_status_v1', 'smoking_v2', 'workout']) {
      const o = gi[key] as Record<string, unknown>;
      expect(Object.keys(o).sort(), `${key}: full option shape`).toEqual([...OPTION_KEYS].sort());
      expect(o.positon, `${key}: positon is 0`).toBe(0);
    }
    const data = body.data as Record<string, unknown>;
    const goal = data.relationship_goal as Record<string, unknown>;
    expect(goal).toMatchObject({
      id: 2,
      name: 'Settle down',
      positon: 0,
      is_default: true,
      show_on_profile: true,
      optional_relationship_goal_message: '',
      prefix: 'Relationship goals',
    });
    expect(data).toMatchObject({
      about: '',
      can_send_reply: false,
      hide_first_name: false,
      incognito_mode_active: false,
      message: '',
      percentage_profile_complete: 0,
      profile_subtext: '',
      reply_id: 0,
      reply_message: '',
      show_incognito_mode: false,
    });
    expect(Object.keys(data)).toHaveLength(25 + 3); // flags + general_information, photos, relationship_goal
    expect(gi.personal_email).toBe('qa-m2-x@example.test');
    expect((body.data as { photos: unknown[] }).photos).toHaveLength(4);
    for (const p of photos) expect(p).toMatch(/^https:\/\/prodimages\.aisle\.co\/[0-9a-f]+\.png$/);
    expect(JSON.stringify(body)).not.toMatch(/Asha|@gmail|@aisle\.co/);
    const { Male, Female } = loadM2Config({}).onboardingPhotos;
    expect(new Set(Male).size).toBe(4);
    expect(new Set(Female).size).toBe(4);
    expect(
      Male.some((u) => Female.includes(u)),
      'gender sets do not overlap',
    ).toBe(false);
  });
});

interface ListedSuite {
  title: string;
  specs?: { title: string }[];
  suites?: ListedSuite[];
}

test.describe('UNIT M2 account-state and triage fixes (2026-10-24)', () => {
  test('UT-M2-024 Id-keyed maps (user ids / profile refs as keys) are compared by the shape of their values', () => {
    // Other ids come back in a later run: still the same contract.
    const old = bodyShape({
      status: true,
      first_names: { '10234567': 'QaOne', '10234568': 'QaTwo' },
      profiles: { '07D35A0B': { user_id: '10234567', first_name: 'QaOne' }, F3026335: null },
    });
    const now = bodyShape({
      status: true,
      first_names: { '10999999': 'QaThree' },
      profiles: { '4DD39D55': { user_id: '10999999', first_name: 'QaThree' } },
    });
    expect(shapeDiff(old, now)).toEqual([]);
    expect(JSON.stringify(now)).not.toMatch(/10999999|4DD39D55/);
    // A changed VALUE shape is still caught.
    expect(
      shapeDiff(old, bodyShape({ status: true, first_names: { '1': 5 }, profiles: { AAAAAAAA: null } })),
    ).toEqual(['$.first_names.<id>: string → number']);
    // Approved files recorded before the fold (raw ids as keys) compare alike, and approving never accumulates ids.
    const raw = { status: 'boolean', first_names: { '10234567': 'string', '10234568': 'string' } } as const;
    expect(shapeDiff(raw, bodyShape({ status: true, first_names: { '10000001': 'QaX' } }))).toEqual([]);
    expect(JSON.stringify(unionShapes(raw, now))).not.toMatch(/1023456|10999999|4DD39D55/);
    // Ordinary objects keep their keys.
    expect(bodyShape({ status: true })).toEqual({ status: 'boolean' });
  });

  test('UT-M2-025 Only the PII read routes may get a blank user_id / user_ids / refs; the write route never', () => {
    const api = (id: string) => design().inventory.find((x) => x.id === id)!;
    expect(missingProtectedIn(api('API-190'), { apiId: 'API-190', body: { user_ids: [] } })).toEqual([]);
    expect(missingProtectedIn(api('API-003'), { apiId: 'API-003', body: { refs: [] } })).toEqual([]);
    expect(missingProtectedIn(api('API-001'), { apiId: 'API-001', query: {} })).toEqual([]);
    expect(
      missingProtectedIn(api('API-002'), { apiId: 'API-002', body: { user_id: '', first_name: 'Qa' } }),
    ).toEqual(['$body.user_id: missing or blank — would act on an unknown member']);
    // A blank target of any other route stays refused (fail closed).
    expect(
      missingProtectedIn(api('API-046'), { apiId: 'API-046', body: { ref: '' } }).length,
      'like with a blank ref is refused',
    ).toBeGreaterThan(0);
    // Ids that are not the suite's own are still refused on the read routes.
    expect(
      unsafeIdsIn({ apiId: 'API-190', body: { user_ids: [1, 2, 3] } }, new Set(['10234567']), new Set()),
    ).toHaveLength(3);
    expect(
      unsafeIdsIn(
        { apiId: 'API-190', body: { user_ids: [10234567, null] } },
        new Set(['10234567']),
        new Set(),
      ),
    ).toEqual([]);
  });

  test('UT-M2-026 Approval-dependent per-API cases are declared in the late folder, every other case in per-api', () => {
    const late = design().cases.filter((c) => runsLate(c));
    const byCheck = (id: string) => late.some((c) => c.id === id);
    // Conversation route, approved-state route and EXPOSE run last; AUTH / TOKEN and plain routes do not.
    for (const id of ['M2-API-069-POS', 'M2-API-120-POS', 'M2-API-005-EXPOSE', 'M2-API-029-STATE'])
      if (design().cases.some((c) => c.id === id && c.status === 'NOT RUN' && !c.na))
        expect(byCheck(id), `${id} runs late`).toBe(true);
    for (const c of late) expect(['AUTH', 'TOKEN', 'HIDDEN']).not.toContain(c.check);
    expect(late.some((c) => c.id === 'M2-API-013-POS')).toBe(false);
    // Which FILE declares each test (top-level suites of the JSON list are the spec files, in queue order).
    const list = JSON.parse(
      execSync('npx playwright test --list --reporter=json --project=m2-api', {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    ) as { suites: ListedSuite[] };
    const fileOf = new Map<string, string>();
    const walk = (suite: ListedSuite, file: string) => {
      for (const spec of suite.specs ?? []) fileOf.set(spec.title.split(' ')[0]!, file);
      for (const child of suite.suites ?? []) walk(child, file);
    };
    for (const f of list.suites) walk(f, f.title);
    for (const c of late)
      expect(fileOf.get(c.id) ?? '', `${c.id} is declared in m2/tests/zz-late/`).toMatch(/zz-late\//);
    for (const [id, file] of fileOf)
      if (file.includes('zz-late/'))
        expect(byCheck(id), `${id} in the late folder needs an approved account`).toBe(true);
    const files = list.suites.map((x) => x.title);
    expect(files[files.length - 1], 'the late folder is queued last').toMatch(/zz-late\//);
  });

  test('UT-M2-027 Reports keep 8-digit user ids readable but still mask phone numbers', () => {
    expect(scrubText('user_id=10234567 ids 102345678')).toBe('user_id=10234567 ids 102345678');
    for (const phone of ['1023456789', '+911023456789', '911023456789', '+91 10234 56789', '1234-56-78'])
      expect(scrubText(`n ${phone} x`)).toBe('n [REDACTED_PHONE] x');
  });
});

test.describe('UNIT M2 secret hygiene of recorded exchanges (2026-10-24)', () => {
  test('UT-M2-028 Tokens handed out in replies (JWTs, auth_token / access_token / grant_token…) never reach a report', () => {
    // Synthetic, unsigned JWT-shaped strings — NOT real credentials.
    const jwt = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJxYS1zeW50aGV0aWMifQ.qa-fake-signature';
    const opaque = 'qa-opaque-token-value-123';
    const rec = new ExchangeRecorder();
    rec.record({
      requestId: 'rid',
      phase: 'test',
      method: 'POST',
      url: `https://example.test/V1/x?auth_token=${opaque}&page=1`,
      requestHeaders: { Authorization: `Bearer ${jwt}`, token: opaque, Accept: 'application/json' },
      requestBody: Buffer.from(JSON.stringify({ refresh_token: opaque, first_name: 'Qa' })),
      status: 200,
      responseContentType: 'application/json',
      responseBody: JSON.stringify({
        data: {
          auth_token: jwt,
          access_token: opaque,
          grant_token_v2: opaque,
          jwt: opaque,
          user_id: '10234567',
        },
        note: `embedded ${jwt} here`,
      }),
      durationMs: 1,
    });
    const out = JSON.stringify(rec.exchanges());
    expect(out).not.toContain(jwt);
    expect(out).not.toContain(opaque);
    expect(out).toContain('[REDACTED]');
    // Everything else stays readable.
    expect(out).toContain('10234567');
    expect(out).toContain('page=1');
    expect(out).toContain('first_name');
  });
});

test.describe('UNIT M2 audit fixes — no false passes (2026-10-25)', () => {
  test('UT-M2-029 A refusal is a 4xx: a 5xx fails citing M2Q-39, and TOKEN sends a credential of the wrong type that the route can parse', () => {
    expectRefusedWithoutPii(res(401, '{"unauthorized_request":true}'), '401');
    expectRefusedWithoutPii(res(403, '{}'), '403');
    expect(refusalProblem(401)).toBeUndefined();
    expect(refusalProblem(500)).toContain('M2Q-39');
    expect(() => expectRefusedWithoutPii(res(500, '{"title":"Oops!"}'), 'server error')).toThrow(/M2Q-39/);
    expect(() => expectRefusedWithoutPii(res(200, '{}'), 'accepted')).toThrow();
    expect(() => expectRefusedWithoutPii(res(302, '', 'text/html'), 'redirect')).toThrow();
    // Only the admin page's redirect to its login page counts, and only where the caller allows it.
    const toLogin = res(
      302,
      '<html>You are being <a href="https://x.test/admin745/login">redirected</a>.',
      'text/html',
    );
    expect(() => expectRefusedWithoutPii(toLogin, 'login redirect')).toThrow();
    expectRefusedWithoutPii(toLogin, 'login redirect', {}, { loginRedirectOk: true });
    expect(() =>
      expectRefusedWithoutPii(
        res(302, '<a href="/home">x</a>', 'text/html'),
        'other',
        {},
        { loginRedirectOk: true },
      ),
    ).toThrow();
    // Wrong-type credentials (from code): app routes get a web JWT, never TEST_TOKEN.
    expect(wrongCredentialsFor(['USER_TOKEN'])).toEqual(['web JWT']);
    expect(wrongCredentialsFor(['WEB_TOKEN'])).toEqual(['user JWT']);
    expect(wrongCredentialsFor(['TEST_TOKEN'])).toEqual(['user JWT']);
    expect(wrongCredentialsFor(['ADMIN_TOKEN', 'webcms'])).toEqual(['user JWT']);
    expect(wrongCredentialsFor(['ADMIN_SESSION_COOKIE'])).toEqual(['user JWT']);
    expect(wrongCredentialsFor(['INFOEDGE_PROFILE_API_TOKEN'])).toEqual(['TEST_TOKEN']);
    for (const c of design().cases.filter((x) => x.check === 'TOKEN'))
      if (apiById(c.apis[0]!).auth.includes('USER_TOKEN'))
        expect(wrongCredentialsFor(apiById(c.apis[0]!).auth), c.id).not.toContain('TEST_TOKEN');
    // No "known defect" annotation path is left for server errors on bad credentials.
    const fixtures = readFileSync(path.join(__dirname, '../../src/fixtures/m2-fixtures.ts'), 'utf8');
    expect(fixtures).not.toContain('SERVER_ERROR_ON_BAD_CREDENTIAL');
    expect(fixtures).not.toMatch(/res\.status >= 500/);
  });

  test('UT-M2-030 The "unchanged" view is the whole own profile minus volatile keys, plus the about text', () => {
    const own = {
      user_id: 1,
      first_name: 'Qa',
      profile_state: 'approved',
      has_selected_mbti: false,
      percentage_profile_complete: 43,
      hide_first_name: false,
      verification_status: 'not_verified',
      daily_likes_left: 20,
      likes_received_count: 0,
      intro_offer_timer: 10,
      boost_time: { start_time: null },
      selfie_verification_message_v1: 'x',
      show_complete_profile_popup: true,
      success_stories: [{ a: 1 }],
      preferences: [{ id: 21 }, { id: 4 }],
      image_list: [{ photo: 'https://img.test/a.png?sig=1' }],
    };
    const v = stableView(own);
    for (const k of REQUIRED_VIEW_KEYS) expect(Object.keys(v), k).toContain(k);
    for (const k of [
      'daily_likes_left',
      'likes_received_count',
      'intro_offer_timer',
      'boost_time',
      'selfie_verification_message_v1',
      'show_complete_profile_popup',
      'success_stories',
    ])
      expect(Object.keys(v), k).not.toContain(k);
    expect(Object.keys(stableView(own, { keepCounts: true }))).toContain('likes_received_count');
    const view = (b: object, about: unknown = 'bio'): OwnView => ({
      status: 200,
      view: { ...stableView(b), [ABOUT_KEY]: about },
    });
    // Random list order, signed URL query, counters and timers do not count as a change …
    expect(
      viewDiff(
        view(own),
        view({
          ...own,
          preferences: [{ id: 4 }, { id: 21 }],
          image_list: [{ photo: 'https://img.test/a.png?sig=2' }],
          daily_likes_left: 19,
          intro_offer_timer: 9,
        }),
      ),
    ).toEqual([]);
    // … the audit's false passes do: has_selected_mbti (API-039 PARAM) and a deleted bio (API-022 PARAM).
    expect(viewDiff(view(own), view({ ...own, has_selected_mbti: true }))).toEqual(['has_selected_mbti']);
    expect(viewDiff(view(own), view(own, null))).toEqual([ABOUT_KEY]);
    expect(viewDiff(view(own), { status: 401, view: {} })).toContain('status');
    expect(aboutOf({ user: { about: 'x' } })).toBe('x');
    expect(aboutOf({ user: {} })).toBeNull();
  });

  test('UT-M2-031 Baselines: a 2xx to invalid input is accepted only with an acceptedBecause code reference', () => {
    expect(isInvalidVariant('M2-API-005-PARAM', 'without page')).toBe(true);
    expect(isInvalidVariant('M2-API-015-BODY', 'invalid JSON')).toBe(true);
    expect(isInvalidVariant('M2-API-046-STATE', 'valid request')).toBe(false);
    expect(isInvalidVariant('M2-API-046-STATE', 'wrong target (unknown ids)')).toBe(true);
    expect(isInvalidVariant('M2-API-046-CONTRACT', 'valid request')).toBe(false);
    expect(isInvalidVariant('M2-API-046-REPEAT', 'same request again')).toBe(false);
    expect(invalidAcceptedProblem('M2-API-022-PARAM', 'without about', 200, {})).toMatch(
      /invalid input accepted/,
    );
    expect(invalidAcceptedProblem('M2-API-022-PARAM', 'without about', 422, {})).toBeUndefined();
    expect(
      invalidAcceptedProblem('M2-API-005-PARAM', 'without page', 200, {
        acceptedBecause: { 'without page': 'ref' },
      }),
    ).toBeUndefined();
    expect(invalidAcceptedProblem('M2-API-046-STATE', 'valid request', 200, {})).toBeUndefined();
    // Approved files: acceptedBecause only for 2xx invalid-input variants, each with a code reference — only the
    // paging defaults the design documents (no bulk acceptance).
    const dir = path.join(__dirname, '../../contracts/approved');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const file = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as BaselineFile;
      for (const [label, why] of Object.entries(file.acceptedBecause ?? {})) {
        expect(isInvalidVariant(file.caseId, label), `${file.caseId} ${label}`).toBe(true);
        expect(file.variants[label]?.status, `${file.caseId} ${label}`).toBeGreaterThanOrEqual(200);
        expect(why, `${file.caseId} ${label}`).toMatch(/\.rb:\d+/);
        expect(
          ['without page', 'without items_per_page', 'page with the wrong type'],
          `${file.caseId} ${label}`,
        ).toContain(label);
      }
    }
  });

  test('UT-M2-032 STATE is decided by state: double effects and wrong-target changes fail; status-only replies are non-discriminating', () => {
    const v = (x: Record<string, unknown>): OwnView => ({ status: 0, view: x });
    const s0 = v({ 'target.likes_received_count': 0 });
    const s1 = v({ 'target.likes_received_count': 1 });
    const s2 = v({ 'target.likes_received_count': 2 });
    const ok = [200, 200, 200];
    expect(stateVerdict({ before: s0, afterValid: s1, afterAgain: s1, afterWrong: s1 }, ok, false)).toEqual({
      effect: ['target.likes_received_count'],
      failures: [],
      nonDiscriminating: false,
    });
    expect(
      stateVerdict({ before: s0, afterValid: s1, afterAgain: s2, afterWrong: s2 }, ok, false).failures[0],
    ).toMatch(/already done/);
    expect(
      stateVerdict({ before: s0, afterValid: s1, afterAgain: s1, afterWrong: s2 }, ok, false).failures[0],
    ).toMatch(/wrong target/);
    // Toggle: sent twice is back at the start; a target-less third send flips again.
    const on = v({ 'caller.hide_first_name': true });
    const off = v({ 'caller.hide_first_name': false });
    expect(
      stateVerdict({ before: off, afterValid: on, afterAgain: off, afterWrong: on }, ok, true, true).failures,
    ).toEqual([]);
    expect(
      stateVerdict({ before: off, afterValid: on, afterAgain: on, afterWrong: on }, ok, true, true)
        .failures[0],
    ).toMatch(/toggle/);
    // Same status everywhere and nothing observable → non-discriminating; a different status discriminates.
    expect(
      stateVerdict({ before: s0, afterValid: s0, afterAgain: s0, afterWrong: s0 }, ok, false)
        .nonDiscriminating,
    ).toBe(true);
    expect(
      stateVerdict({ before: s0, afterValid: s0, afterAgain: s0, afterWrong: s0 }, [200, 200, 404], false)
        .nonDiscriminating,
    ).toBe(false);
    expect(combineViews({ caller: { status: 200, view: { a: 1 } }, target: undefined }).view).toEqual({
      'caller.status': 200,
      'caller.a': 1,
    });
  });

  test('UT-M2-033 EXPOSE needs the writer in the reply; IDOR needs a target id in the request; status-only replies are recognised', () => {
    const a = { ref: 'AB12CD34', userId: '19849927' };
    expect(mentionsAccount({ data: [{ ref: 'AB12CD34', first_name: 'Qa' }] }, a)).toBe(true);
    expect(mentionsAccount({ data: [{ user_id: 19849927 }] }, a)).toBe(true);
    expect(mentionsAccount({ first_names: { '19849927': 'Qa' } }, a)).toBe(true);
    expect(mentionsAccount({ data: [{ ref: 'FFFFFFFF' }] }, a)).toBe(false);
    expect(mentionsAccount({ status: true }, a)).toBe(false);
    expect(mentionsAccount({ ref: 'AB12CD34' }, {})).toBe(false);
    // Item 2 (2026-10-25): A's ref inside a value (Agora channel name) and A's current first name in a message.
    expect(mentionsAccount({ channel_name: 'channel_FFFFFFFF_AB12CD34' }, a)).toBe(true);
    expect(
      mentionsAccount({ video_call_message: 'Qaxyzb wants to video call' }, { firstName: 'Qaxyzb' }),
    ).toBe(true);
    expect(mentionsAccount({ video_call_message: 'Someone wants to call' }, { firstName: 'Qaxyzb' })).toBe(
      false,
    );
    // User ids only exactly: an 8-digit id inside a longer number / timestamp is not A.
    expect(mentionsAccount({ token: '1198499270000' }, { userId: '19849927' })).toBe(false);
    expect(mentionsAccount({ x: 'ab' }, { firstName: 'ab' })).toBe(false);
    expect(hasIdorTarget(['REF'])).toBe(true);
    expect(hasIdorTarget(['OTHER_USER_ID'])).toBe(true);
    expect(hasIdorTarget(['USER_ID', 'PAGE'])).toBe(true);
    expect(hasIdorTarget(['CONVERSATION_ID', 'MESSAGE_TIME_TOKEN'])).toBe(false);
    expect(hasIdorTarget([])).toBe(false);
    expect(isStatusOnlyReply({ status: true })).toBe(true);
    expect(isStatusOnlyReply({ status: true, message: 'ok' })).toBe(true);
    expect(isStatusOnlyReply({ status: true, user: {} })).toBe(false);
    expect(isStatusOnlyReply([])).toBe(false);
  });

  test('UT-M2-034 Removed for good (2026-10-25): no-target IDOR, EXPOSE / CACHE on routes that never show another member', () => {
    // User decisions 2026-10-25: 132 cases that can never run in any environment (103, then 29 more no-target IDOR
    // cases on routes still held by an open question). Their IDs are never reused.
    const removed: Record<string, string[]> = {
      IDOR: [
        '005',
        '006',
        '007',
        '008',
        '009',
        '010',
        '013',
        '014',
        '015',
        '016',
        '017',
        '019',
        '020',
        '022',
        '023',
        '024',
        '025',
        '026',
        '027',
        '028',
        '029',
        '030',
        '031',
        '032',
        '033',
        '034',
        '035',
        '036',
        '037',
        '038',
        '039',
        '040',
        '041',
        '042',
        '043',
        '044',
        '045',
        '047',
        '048',
        '049',
        '054',
        '057',
        '058',
        '059',
        '063',
        '066',
        '067',
        '068',
        '069',
        '070',
        '071',
        '072',
        '074',
        '075',
        '076',
        '077',
        '078',
        '079',
        '084',
        '085',
        '086',
        '087',
        '088',
        '089',
        '090',
        '091',
        '092',
        '093',
        '096',
        '097',
        '099',
        '100',
        '101',
        '102',
        '105',
        '106',
        '107',
        '108',
        '109',
        '110',
        '111',
        '112',
        '115',
        '116',
        '117',
        '118',
        '121',
        '122',
        '123',
        '124',
        '126',
        '129',
        '130',
        '131',
        '133',
        '134',
        '189',
        '191',
        '193',
        '194',
        '195',
        '198',
      ],
      EXPOSE: [
        '004',
        '009',
        '010',
        '017',
        '018',
        '021',
        '046',
        '050',
        '051',
        '052',
        '053',
        '055',
        '056',
        '064',
        '107',
        '108',
        '117',
        '118',
        '120',
        '125',
        '127',
        '128',
        '132',
        '187',
        '188',
        '191',
      ],
      CACHE: ['017', '018', '107', '191'],
    };
    const ids = Object.entries(removed).flatMap(([check, apis]) => apis.map((a) => `M2-API-${a}-${check}`));
    expect(ids.length).toBe(132);
    const cases = design().cases;
    for (const id of ids)
      expect(
        cases.some((c) => c.id === id),
        `${id} stays removed`,
      ).toBe(false);
    // The rules that removed them still hold for every generated case.
    // Whatever its status (open questions no longer keep a no-target IDOR case alive).
    for (const c of cases.filter((x) => x.check === 'IDOR'))
      expect(
        hasIdorTarget(placeholdersIn(apiById(c.apis[0]!))) || Boolean(IDOR_OTHER_TARGET[c.apis[0]!]),
        `${c.id} names a target id`,
      ).toBe(true);
    // The routes kept for another target key (from code) keep their IDOR case, each with a code reference.
    for (const [api, why] of Object.entries(IDOR_OTHER_TARGET)) {
      expect(
        cases.some((c) => c.id === `M2-API-${api.slice(4)}-IDOR`),
        `${api} keeps its IDOR case`,
      ).toBe(true);
      expect(why).toMatch(/\.rb:\d+/);
    }
    for (const c of cases.filter((x) => x.check === 'EXPOSE'))
      expect(NO_OTHER_USER[c.apis[0]!], `${c.id}: route can show another member`).toBeUndefined();
    for (const c of cases.filter((x) => x.check === 'CACHE' && NO_OTHER_USER[x.apis[0]!]))
      expect(OWN_PROFILE_BY_REF, `${c.id}: only own-profile routes keep a CACHE case`).toContain(c.apis[0]);
    // Every removal reason cites the Aisle code.
    for (const why of Object.values(NO_OTHER_USER)) expect(why).toMatch(/\.rb:\d+/);
  });
});
