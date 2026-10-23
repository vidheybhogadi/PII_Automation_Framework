/**
 * UNIT — Milestone 2 framework self-tests (no network beyond a local capture server, no .env needed):
 * design ↔ test sync, synthetic phone numbers, the PII scanner and what the M2 client puts on the wire.
 */
import { expect, test } from '@playwright/test';
import { ApiResponse } from '../../../core/http/api-response';
import { ExchangeRecorder } from '../../../core/utils/exchange-recorder';
import { Logger } from '../../../core/utils/logger';
import { registerSecretValue } from '../../../core/utils/redaction';
import { Secret } from '../../../core/utils/secret';
import { listInventory } from '../../../reporting/generator/inventory';
import { AUTH, expiredFormatJwt } from '../../src/auth/credentials';
import { isAllowedTestNumber, testPhoneNumber } from '../../src/auth/test-phone';
import {
  expectRefusedWithoutPii,
  scanForPii,
  scanResponse,
  shapeOf,
} from '../../src/assertions/pii.assertions';
import { M2Client } from '../../src/clients/m2-client';
import { loadM2Config } from '../../src/config/m2-config';
import { caseById, design, titleOf } from '../../src/design';
import { tryBuildRequest, questionFor } from '../../src/checks/request-builder';
import { shapeDiff, shapeOf as bodyShape } from '../../src/baseline/baseline';
import { DESTRUCTIVE } from '../../src/checks/context';
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
