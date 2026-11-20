/**
 * Self-tests of the M2 PII First Name suite (project m2fn-unit; no network, no .env needed; part of npm run verify).
 */
import { expect, test } from '@playwright/test';
import { maskSecretsOnly } from '../../../core/utils/redaction';
import { listInventory } from '../../../reporting/generator/inventory';
import { buildM2fnDesign, designProblems, scopeRows, SWEEP_CASES, titleOf } from '../../scripts/m2fn-design';
import { SWEEP } from '../../scripts/m2fn-sweep';
import {
  VN_APP_NAMES,
  assertLoginAllowed,
  assertVnApp,
  assertVnHost,
  isTeamNumber,
  TEAM_NUMBERS,
  VnGuardError,
} from '../../src/vn/guard';
import { VN_SWEEP } from '../../scripts/m2fn-vernac-sweep';
import { VN_PARAM_CASES } from '../../scripts/m2fn-vernac-cases.data';
import {
  vnAbsentKey,
  vnConversationKey,
  vnKeyRefusal,
  vnPiiNameKey,
  vnProfileKey,
  type VnKeyScope,
} from '../../src/vn/redis';
import { assertVnArgs, assertVnQuery, loadVnCatalog } from '../../src/vn/db';
import { editBody, journalAdd, journalDone, readJournal, type Original } from '../../src/vn/restore';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadM2fnConfig } from '../../src/config';
import {
  absentKey,
  assertSafeValidationQuery,
  piiFirstNameKey,
  profileKey,
  refusal,
  RedisKeyGuardError,
  userPattern,
  type KeyScope,
} from '../../src/redis-keys';
import { base32Decode, totp } from '../../src/totp';

const RUN = 'qa-m2-20261109t120000-abcd';
const SCOPE: KeyScope = {
  runId: RUN,
  suiteIds: new Set(['123456', 'qaRefAbc']),
  nonStringKey: 'qa-dev-hash',
};

test.describe('UNIT M2 PII First Name framework', () => {
  test('UT-M2FN-007 Every Aisle / Aisle CMS / Vernac / Vernac CMS inventory row is covered by a deep case or classified in the sweep', () => {
    const d = buildM2fnDesign();
    const rows = scopeRows();
    expect(rows.length, 'Aisle + Aisle CMS + Vernac + Vernac CMS rows').toBe(179 + 64 + 54);
    const deep = new Set(d.cases.filter((c) => !SWEEP_CASES.has(c.id)).flatMap((c) => c.apis));
    const swept = new Set([...SWEEP, ...VN_SWEEP].map((s) => s.row));
    expect(
      rows.filter((r) => !deep.has(r.id) && !swept.has(r.id)).map((r) => r.id),
      'uncovered rows',
    ).toEqual([]);
    for (const s of [...SWEEP, ...VN_SWEEP])
      if (s.cls === 'cannot') expect(s.reason, `${s.row}: reason`).toBeTruthy();
    expect(
      designProblems(d).filter((p) => p.startsWith('matrix')),
      'coverage matrix complete',
    ).toEqual([]);
  });

  test('UT-M2FN-001 Every automatable design case has exactly one test titled with its workbook ID and name (the sweep: one per callable row)', () => {
    const d = buildM2fnDesign();
    const tests = listInventory(['m2fn-api', 'm2fn-vn-api']);
    const titles = tests.map((t) => t.title);
    expect(new Set(titles).size, 'no duplicate test titles').toBe(titles.length);
    const param = new Set([...SWEEP_CASES, ...VN_PARAM_CASES]);
    const sweep = tests.filter((t) => t.id === 'M2FN-SWP-001');
    const single = tests.filter((t) => !param.has(t.id));
    const ids = single.map((t) => t.id);
    expect(new Set(ids).size, 'no duplicate test IDs').toBe(ids.length);
    for (const t of tests) {
      const c = d.cases.find((x) => x.id === t.id);
      expect(c, `${t.id} is a design case`).toBeDefined();
      if (t.id === 'M2FN-SWP-001' || t.id === 'M2FN-VSWP-001')
        expect(t.title.startsWith(`${titleOf(c!)} — FN-`), `sweep title of ${t.title}`).toBe(true);
      else if (param.has(t.id))
        expect(t.title.startsWith(`${titleOf(c!)} — `), `title of ${t.title}`).toBe(true);
      else expect(t.title, `title of ${t.id} matches the workbook`).toBe(titleOf(c!));
      expect(t.tags, `${t.id} carries @m2fn`).toContain('@m2fn');
    }
    const callable = SWEEP.filter((r) => r.cls !== 'cannot').map((r) => r.row);
    expect(
      sweep.map((t) => t.title.split(' — ')[1]!.split(' ')[0]).sort(),
      'one sweep test per callable inventory row',
    ).toEqual([...callable].sort());
    const vnCallable = VN_SWEEP.filter((r) => r.cls !== 'cannot').map((r) => r.row);
    expect(
      tests
        .filter((t) => t.id === 'M2FN-VSWP-001')
        .map((t) => t.title.split(' — ')[1]!.split(' ')[0])
        .sort(),
      'one vernac sweep test per callable row',
    ).toEqual([...vnCallable].sort());
    expect(tests.filter((t) => t.id === 'M2FN-VAPP-001').length, 'one per-app test per in-scope app').toBe(
      VN_APP_NAMES.length,
    );
    const expected = d.cases.filter((c) => c.mode !== 'Manual' && !param.has(c.id)).map((c) => c.id);
    expect(
      expected.filter((id) => !ids.includes(id)),
      'design cases without a test',
    ).toEqual([]);
    expect(ids.length, 'tests = automatable design cases').toBe(expected.length);
  });

  test('UT-M2FN-002 The design is consistent: known APIs and questions, unique IDs, every suite API covered', () => {
    const d = buildM2fnDesign();
    expect(designProblems(d)).toEqual([]);
    expect(d.apis.map((a) => `${a.id} ${a.method} ${a.path}`)).toEqual([
      'API-213 GET /admin/redis-keys',
      'API-214 DELETE /admin/redis-keys',
    ]);
    for (const c of d.cases)
      expect(c.automation, `${c.id}: automation follows the status`).toBe(
        c.mode === 'Manual' ? 'NOT AUTOMATED' : c.status === 'NOT RUN' ? 'AUTOMATED' : 'AUTOMATION BLOCKED',
      );
  });

  test('UT-M2FN-003 The Redis key guard allows only suite accounts’ keys and run-unique absent keys', () => {
    // Allowed
    expect(refusal(absentKey(RUN, 'absent'), 'delete', SCOPE)).toBeUndefined();
    expect(refusal(piiFirstNameKey('123456'), 'delete', SCOPE)).toBeUndefined();
    expect(refusal(profileKey('qaRefAbc'), 'delete', SCOPE)).toBeUndefined();
    expect(refusal(userPattern('123456'), 'delete', SCOPE, { pattern: true })).toBeUndefined();
    expect(refusal('qa-dev-hash', 'get', SCOPE)).toBeUndefined();
    // Refused: wildcards, foreign ids, config keys, blanks, other run ids
    for (const key of ['*', '**', 'pii:v1:user:*', 'pii:v1:user:123456*', '*:first_name', 'AISLE_staging_*'])
      expect(refusal(key, 'delete', SCOPE), `${key} without the pattern flag`).toBeDefined();
    for (const key of [
      '*',
      'pii:v1:user:*',
      'pii:v1:user:123456*',
      'pii:v1:user:999:*',
      'pii:v1:user:123456:first*',
    ])
      expect(refusal(key, 'delete', SCOPE, { pattern: true }), `${key} as a pattern`).toBeDefined();
    expect(
      refusal(userPattern('123456'), 'get', SCOPE, { pattern: true }),
      'pattern only for DELETE',
    ).toBeDefined();
    expect(refusal(piiFirstNameKey('999'), 'get', SCOPE), 'another user').toBeDefined();
    expect(refusal(profileKey('someoneElse'), 'get', SCOPE), 'another profile').toBeDefined();
    expect(refusal('AISLE_staging_configuration_constant', 'get', SCOPE), 'config key').toBeDefined();
    expect(refusal('AISLE_staging_configuration_constant', 'delete', SCOPE), 'config key').toBeDefined();
    expect(refusal('qa-dev-hash', 'delete', SCOPE), 'non-string key is read only').toBeDefined();
    expect(refusal('', 'get', SCOPE)).toBeDefined();
    expect(refusal('   ', 'get', SCOPE)).toBeDefined();
    expect(refusal(` ${piiFirstNameKey('123456')}`, 'get', SCOPE)).toBeDefined();
    expect(refusal('qa-m2-20200101t000000-zzzz-rdk-x', 'get', SCOPE), 'another run’s key').toBeDefined();
    expect(refusal('pii:v1:user:1061616161:first_name', 'get', SCOPE), 'not a suite id').toBeDefined();
    expect(
      refusal(absentKey(RUN, 'x'), 'get', { ...SCOPE, runId: 'prod-run' }),
      'run id must be qa-m2',
    ).toBeDefined();
    // The message never echoes the key
    try {
      throw new RedisKeyGuardError(refusal('pii:v1:user:999:first_name', 'get', SCOPE)!);
    } catch (e) {
      expect(String(e)).not.toContain('999');
    }
  });

  test('UT-M2FN-004 The validation variants are limited to no key, a blank key or key[] = a run-unique key', () => {
    expect(() => assertSafeValidationQuery(undefined, SCOPE)).not.toThrow();
    expect(() => assertSafeValidationQuery({ key: '' }, SCOPE)).not.toThrow();
    expect(() => assertSafeValidationQuery({ key: '   ' }, SCOPE)).not.toThrow();
    expect(() => assertSafeValidationQuery({ 'key[]': absentKey(RUN, 'array') }, SCOPE)).not.toThrow();
    expect(() => assertSafeValidationQuery({ 'key[]': 'a' }, SCOPE)).toThrow(RedisKeyGuardError);
    expect(() => assertSafeValidationQuery({ 'key[]': piiFirstNameKey('123456') }, SCOPE)).toThrow();
    expect(() => assertSafeValidationQuery({ key: '*' }, SCOPE)).toThrow();
    expect(() => assertSafeValidationQuery({ key: '', other: 'x' }, SCOPE)).toThrow();
  });

  test('UT-M2FN-005 The CMS OTP is a standard TOTP (RFC 6238 SHA1 test vectors)', () => {
    // RFC 6238 appendix B, SHA1 secret "12345678901234567890" (base32 below); 6-digit codes = last 6 of the 8.
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(base32Decode(secret).toString()).toBe('12345678901234567890');
    expect(totp(secret, 59_000, 8)).toBe('94287082');
    expect(totp(secret, 1_111_111_109_000, 8)).toBe('07081804');
    expect(totp(secret, 1_234_567_890_000, 8)).toBe('89005924');
    expect(totp(secret, 59_000)).toBe('287082');
  });

  test('UT-M2FN-006 CMS logins are read from .env names only and every secret is masked in reports', () => {
    const env = {
      M2FN_CMS_ADMIN_EMAIL: 'qa-admin-fake@example.test',
      M2FN_CMS_ADMIN_PASSWORD: 'fake-password-123456',
      M2FN_CMS_ADMIN_TOTP_SECRET: 'GEZDGNBVGY3TQOJQGEZDGNBV',
      M2FN_CMS_ASSOCIATE_EMAIL: 'qa-assoc-fake@example.test',
      M2FN_CMS_ASSOCIATE_PASSWORD: 'fake-assoc-password-1',
    };
    const cfg = loadM2fnConfig(env);
    expect(cfg.admin).toBeDefined();
    expect(cfg.associate).toBeDefined();
    expect(JSON.stringify(cfg)).not.toContain('fake-password-123456');
    const text = Object.values(env).join(' ');
    const masked = maskSecretsOnly(text);
    for (const v of Object.values(env)) expect(masked).not.toContain(v);
    expect(masked).toContain('$M2FN_CMS_ADMIN_PASSWORD');
    const none = loadM2fnConfig({});
    expect(none.admin).toBeUndefined();
    expect(none.associate).toBeUndefined();
    expect(none.redisOutageWindow).toBe(false);
    expect(none.flagWindow).toBeUndefined();
    expect(none.piiOutageWindow).toBe(false);
    expect(none.batchAccounts, 'the 51-account batch case is opt-in').toBe(false);
    expect(loadM2fnConfig({ M2FN_FLAG_WINDOW: 'read_off' }).flagWindow).toBe('read_off');
    expect(loadM2fnConfig({ M2FN_FLAG_WINDOW: 'anything' }).flagWindow).toBeUndefined();
  });

  test('UT-M2FN-008 The vernac guard allows only the nine team numbers, the vernac host and the four in-scope apps', () => {
    expect(TEAM_NUMBERS).toEqual([
      '1061616161',
      '1062626262',
      '1063636363',
      '1064646464',
      '1065656565',
      '1066666666',
      '1067676767',
      '1068686868',
      '1069696969',
    ]);
    for (const n of TEAM_NUMBERS) expect(isTeamNumber(n), n).toBe(true);
    for (const n of [
      '1060000000',
      '1061616162',
      '1069999999',
      '1012345678',
      '9876543210',
      '+911061616161',
      1061616161,
    ])
      expect(isTeamNumber(n), String(n)).toBe(false);
    expect(() => assertVnHost('https://testapp.koode.co/')).not.toThrow();
    for (const h of [
      'https://testa2.aisle.co',
      'http://testapp.koode.co',
      'https://testapp.koode.co.evil.test',
    ])
      expect(() => assertVnHost(h), h).toThrow(VnGuardError);
    for (const a of VN_APP_NAMES) expect(() => assertVnApp(a)).not.toThrow();
    for (const a of ['HeyDil', 'Aisle', 'arike', '']) expect(() => assertVnApp(a), a).toThrow(VnGuardError);
    const ok = { baseUrl: 'https://testapp.koode.co', app: 'Arike', number: '1069696969' };
    expect(() =>
      assertLoginAllowed({ ...ok, knownUser: { app: 'Arike', number: '1069696969', hasProfile: true } }),
    ).not.toThrow();
    expect(
      () => assertLoginAllowed({ ...ok, knownUser: undefined }),
      'no user in the DB → would create one',
    ).toThrow(VnGuardError);
    expect(
      () =>
        assertLoginAllowed({ ...ok, knownUser: { app: 'Neene', number: '1069696969', hasProfile: true } }),
      'other app',
    ).toThrow();
    expect(
      () =>
        assertLoginAllowed({ ...ok, knownUser: { app: 'Arike', number: '1069696969', hasProfile: false } }),
      'no profile',
    ).toThrow();
    expect(() =>
      assertLoginAllowed({
        ...ok,
        app: 'HeyDil',
        knownUser: { app: 'HeyDil', number: '1069696969', hasProfile: true },
      }),
    ).toThrow();
    expect(() =>
      assertLoginAllowed({
        ...ok,
        baseUrl: 'https://testa2.aisle.co',
        knownUser: { app: 'Arike', number: '1069696969', hasProfile: true },
      }),
    ).toThrow();
    try {
      assertLoginAllowed({ ...ok, number: '1061616162', knownUser: undefined });
    } catch (e) {
      expect(String(e)).not.toContain('1061616162');
    }
  });

  test('UT-M2FN-009 The vernac Redis key guard allows only suite team users’ keys and never configuration keys', () => {
    const scope: VnKeyScope = {
      runId: RUN,
      env: 'staging',
      callerId: 'desiapp-rails',
      tenants: new Set(['desiapp-arike']),
      userIds: new Set(['11739264']),
      refs: new Set(['294D67F1']),
      conversations: new Set(['7226922']),
    };
    expect(vnKeyRefusal(vnProfileKey('staging', '294D67F1'), scope)).toBeUndefined();
    expect(vnKeyRefusal(vnConversationKey('staging', '7226922'), scope)).toBeUndefined();
    expect(
      vnKeyRefusal(vnPiiNameKey('staging', 'desiapp-rails', 'desiapp-arike', '11739264'), scope),
    ).toBeUndefined();
    expect(
      vnPiiNameKey('staging', 'desiapp-rails', 'desiapp-arike', '11739264').startsWith(
        'pii:v1:c3RhZ2luZw:ZGVzaWFwcC1yYWlscw:',
      ),
    ).toBe(true);
    expect(vnKeyRefusal(vnAbsentKey(RUN, 'absent'), scope)).toBeUndefined();
    for (const key of [
      'DESIAPP_staging_config_constants',
      'DESIAPP_staging_configuration_constant',
      vnProfileKey('staging', 'SOMEONE1'),
      vnProfileKey('production', '294D67F1'),
      vnConversationKey('staging', '1'),
      vnPiiNameKey('staging', 'desiapp-rails', 'desiapp-arike', '999'),
      vnPiiNameKey('staging', 'desiapp-rails', 'desiapp-heydil', '11739264'),
      vnPiiNameKey('staging', 'other-caller', 'desiapp-arike', '11739264'),
      'pii:v1:*',
      'DESIAPP_staging_profile_*',
      '',
      ' x',
      'qa-m2-20200101t000000-zzzz-vrdk-x',
    ])
      expect(vnKeyRefusal(key, scope), key).toBeDefined();
  });

  test('UT-M2FN-010 The vernac SQL catalog is read-only and limited to the suite team users; the restore journal round-trips', () => {
    const cat = loadVnCatalog();
    for (const [n, q] of [...Object.entries(cat.appQueries), ...Object.entries(cat.piiQueries)])
      expect(() => assertVnQuery(n, q), n).not.toThrow();
    const suite = new Set(['11739264', '11739151']);
    const q = cat.appQueries.profileNameIs!;
    expect(() =>
      assertVnArgs('profileNameIs', q, [['11739264', '11739151'], '11739264', 'x'], suite),
    ).not.toThrow();
    expect(
      () => assertVnArgs('profileNameIs', q, [['11739264', '1'], '11739264', 'x'], suite),
      'foreign id',
    ).toThrow();
    expect(
      () => assertVnArgs('profileNameIs', q, [['11739264'], '999', 'x'], suite),
      'foreign user param',
    ).toThrow();
    expect(() =>
      assertVnArgs('teamUsers', cat.appQueries.teamUsers!, [[...TEAM_NUMBERS]], suite),
    ).not.toThrow();
    expect(() => assertVnArgs('teamUsers', cat.appQueries.teamUsers!, [['1012345678']], suite)).toThrow();
    expect(() => assertVnArgs('tenants', cat.appQueries.tenants!, [[3]], suite), 'HeyDil app id').toThrow();
    expect(() => assertVnQuery('x', { kind: 'suite', sql: 'DELETE FROM account_profiles' })).toThrow();
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'm2fn-vn-')), 'journal.json');
    const o: Original = {
      key: 'Arike:1',
      app: 'Arike',
      userId: '1',
      ref: 'R1',
      label: '…9',
      firstName: 'Fake',
      gender: 'Female',
      dateOfBirth: '2000-01-01',
      phoneCodeId: 1,
      number: '1069696969',
      hide: false,
      savedAt: 'now',
    };
    journalAdd(o, file);
    expect(journalAdd({ ...o, firstName: 'Later' }, file).firstName, 'the first saved original wins').toBe(
      'Fake',
    );
    expect(readJournal(file)).toHaveLength(1);
    expect(editBody(o, 'New')).toEqual({
      ref: 'R1',
      first_name: 'New',
      gender: 'Female',
      date_of_birth: '2000-01-01',
      phone_code_id: 1,
      fetch_only_number: '1069696969',
    });
    journalDone('Arike:1', file);
    expect(readJournal(file)).toEqual([]);
  });
});
