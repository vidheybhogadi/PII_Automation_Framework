/**
 * Security checks on what the Aisle facade exposes: tenant injection, leaks into our own logs/reports, error
 * details and user isolation. The 422 echo of submitted values is known finding BQ-08 (no active test).
 * Assertion messages never contain the values.
 */
import { expectStatus, expectSuccess } from '../../src/assertions/response.assertions';
import { expectNoSecretsIn, expectSecretEquals } from '../../src/assertions/security.assertions';
import type { ApiResponse } from '../../src/clients/api-response';
import { requireToken } from '../../src/config/config';
import { expectNotPersisted, seedField } from '../../src/fixtures/steps';
import { blockedBy, expect, noteAssumption, test } from '../../src/fixtures/test-fixtures';
import { PII_FIELDS, readPiiDataSchema, writePiiDataSchema } from '../../src/models/pii.models';

/** Tenant set by the facade itself (observed on staging). */
const AISLE_TENANT = 'aisle';
/** A clearly made-up tenant, used only to check that the caller cannot choose the tenant. */
const FAKE_TENANT = 'qa-auto-fake-tenant';

test.describe('Aisle facade — response and data security', { tag: ['@security'] }, () => {
  test('AISLE-SEC-001 A tenant ID sent by the caller is ignored or refused: data can never land in another tenant', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteAssumption('BQ-06', 'observed: the made-up tenant is ignored; ignoring vs refusing is Dev’s call');
    const userId = data.userId('sec1');
    const name = data.name();

    const write = await aisle.call('writePii', {
      user_id: userId,
      field: PII_FIELDS.NAME,
      value: name,
      tenant_id: FAKE_TENANT,
    });
    if (write.status === 400 || write.status === 422) {
      // Refused is also safe: nothing may have been saved.
      await expectNotPersisted(aisle, { userId, field: PII_FIELDS.NAME });
      return;
    }
    cleanup.leaveBehind('PII NAME', userId);
    const saved = expectSuccess(write, [201, 200], writePiiDataSchema);
    expect(saved.tenant_id, 'save reply tenant').toBe(AISLE_TENANT);

    const injectedRead = await aisle.call('readPii', {
      user_id: userId,
      field_names: [PII_FIELDS.NAME],
      tenant_id: FAKE_TENANT,
    });
    if (injectedRead.status !== 400 && injectedRead.status !== 422) {
      const read = expectSuccess(injectedRead, 200, readPiiDataSchema);
      expect(read.tenant_id, 'read reply tenant (tenant sent by caller)').toBe(AISLE_TENANT);
      expect(read.items.every((i) => i.tenant_id === AISLE_TENANT)).toBe(true);
    }

    const normalRead = expectSuccess(
      await aisle.readPii({ user_id: userId, field_names: [PII_FIELDS.NAME] }),
      200,
      readPiiDataSchema,
    );
    expect(normalRead.tenant_id, 'normal read tenant').toBe(AISLE_TENANT);
    expect(normalRead.items[0]?.tenant_id).toBe(AISLE_TENANT);
    expectSecretEquals(normalRead.items[0]?.value, name, 'NAME saved under the aisle tenant');
  });

  test(
    'AISLE-SEC-003 Test logs and reports never contain the Aisle token; the call log holds no personal data',
    { tag: ['@smoke', '@phase1'] },
    async ({ aisle, data, cleanup, log, config }) => {
      const token = requireToken(config).reveal();
      const userId = data.userId('sec3');
      const name = data.name();

      await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: name });
      expectStatus(await aisle.readPii({ user_id: userId, field_names: [PII_FIELDS.NAME] }), 200);
      expectStatus(
        await aisle.call(
          'writePii',
          { user_id: userId, field: PII_FIELDS.NAME, value: name },
          { tamper: { authorization: null } },
        ),
        401,
      );

      const lines = log.lines();
      expect(lines.length, 'the calls were logged').toBeGreaterThan(0);
      expect(
        lines.some((l) => l.includes('requestId')),
        'request IDs are still visible',
      ).toBe(true);
      // The redacted call log keeps no personal data and never the token.
      expectNoSecretsIn(lines, [token, name], 'api-calls.log');

      // Reports show exact requests/responses with FAKE data by design (debugging); only the token must never
      // appear there (it is shown as $AISLE_TEST_TOKEN). The api-exchanges.json attachment is added at fixture
      // teardown and is guarded by the collector/report self-check, which refuses the real token.
      const info = test.info();
      const attachments = info.attachments
        .filter((a) => a.body !== undefined)
        .map((a) => a.body!.toString('utf8'));
      expectNoSecretsIn(
        [JSON.stringify(info.annotations), ...attachments],
        [token],
        'report annotations and attachments',
      );
    },
  );

  test('AISLE-SEC-004 The test token cannot read another user’s data', async () => {
    blockedBy('BQ-07', 'Whether one token may read any user ID is Dev’s decision (today it can)');
  });

  test('AISLE-SEC-005 Error replies reveal no internal service details', async ({ aisle, data, config }) => {
    noteAssumption('BQ-29', 'tenant_id / key_version in success replies are not judged here (open question)');
    const userId = data.userId('sec5');
    const errors: [string, ApiResponse][] = [
      [
        '401 no token',
        await aisle.call(
          'readPii',
          { user_id: userId, field_names: [PII_FIELDS.NAME] },
          { tamper: { authorization: null } },
        ),
      ],
      [
        '400 broken JSON',
        await aisle.call('writePii', undefined, {
          tamper: { bodyBytes: Buffer.from('{"user_id": ', 'utf8') },
        }),
      ],
      [
        '403 unknown field',
        await aisle.call('writePii', {
          user_id: userId,
          field: config.testData.unsupportedField,
          value: data.name(),
        }),
      ],
      ['404 never-saved user', await aisle.readPii({ user_id: userId, field_names: [PII_FIELDS.NAME] })],
      ['422 missing value', await aisle.call('writePii', { user_id: userId, field: PII_FIELDS.NAME })],
    ];
    expect(errors.map(([, res]) => res.status)).toEqual([401, 400, 403, 404, 422]);

    // Only the pattern NAME and the reply label are reported — never the body text.
    const leaks = errors.flatMap(([label, res]) =>
      INTERNAL_DETAIL_PATTERNS.filter(([, re]) => re.test(res.rawText())).map(
        ([kind]) => `${label}: ${kind}`,
      ),
    );
    expect(leaks, 'error replies expose internal service details').toEqual([]);
  });
});

/** Signs of internal details that must never appear in a reply to QA (BQ-29). */
const INTERNAL_DETAIL_PATTERNS: readonly [string, RegExp][] = [
  ['stack trace', /Traceback|File "[^"]*", line \d+/],
  ['exception class name', /\b[A-Z][A-Za-z0-9]*(?:Error|Exception)\b/],
  [
    'private IP address',
    /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/,
  ],
  ['localhost', /localhost|127\.0\.0\.1/i],
  ['internal host name', /pii[-_]service/i],
  ['server banner', /\b(?:uvicorn|gunicorn)\b|nginx\/\d|apache\/\d/i],
  ['database driver', /sqlalchemy|psycopg|postgres/i],
];
