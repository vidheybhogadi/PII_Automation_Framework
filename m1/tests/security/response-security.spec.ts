/**
 * Security checks: no leaks into our own logs/reports, no internal details in PII-service errors, and no-store on
 * PII replies, and no echo of submitted values or the tenant in 422 replies. Facade-only checks
 * (token, tenant injection, token scope) were removed on 2026-10-01. Assertion messages never contain the values.
 */
import { randomUUID } from 'node:crypto';
import { expectStatus, expectValidationError } from '../../src/assertions/response.assertions';
import { expectNoSecretsIn, expectNoStore } from '../../src/assertions/security.assertions';
import type { ApiResponse } from '../../src/clients/api-response';
import { requireToken } from '../../src/config/config';
import { BLOCKERS, seedField } from '../../src/fixtures/steps';
import {
  blockIfAccessDenied,
  expect,
  noteAssumption,
  noteObserved,
  test,
} from '../../src/fixtures/test-fixtures';
import { LIMITS, PII_FIELDS } from '../../src/models/pii.models';

test.describe('Aisle facade — response and data security', { tag: ['@security'] }, () => {
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

  test('AISLE-SEC-005 PII-service error replies (403, 404, 422) reveal no internal service details', async ({
    aisle,
    data,
    config,
  }) => {
    noteAssumption('BQ-29', 'tenant_id / key_version in success replies are not judged here (open question)');
    const userId = data.userId('sec5');
    const errors: [string, ApiResponse][] = [
      [
        '403 unknown field',
        await aisle.call('writePii', {
          user_id: userId,
          field: config.testData.unsupportedField,
          value: data.name(),
        }),
      ],
      ['404 never-saved user', await aisle.readPii({ user_id: userId, field_names: [PII_FIELDS.NAME] })],
      [
        '422 empty value',
        await aisle.call('writePii', { user_id: userId, field: PII_FIELDS.NAME, value: '' }),
      ],
    ];
    expect(errors.map(([, res]) => res.status)).toEqual([403, 404, 422]);

    // Only the pattern NAME and the reply label are reported — never the body text.
    const leaks = errors.flatMap(([label, res]) =>
      INTERNAL_DETAIL_PATTERNS.filter(([, re]) => re.test(res.rawText())).map(
        ([kind]) => `${label}: ${kind}`,
      ),
    );
    expect(leaks, 'error replies expose internal service details').toEqual([]);
  });

  test('AISLE-SEC-006 Replies that contain personal data (read, bulk read, search with values) tell browsers and proxies not to keep a copy (“no-store”)', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved(
      '2026-11-19',
      'read, bulk read and search replies carry "Cache-Control: no-store, no-cache, must-revalidate, max-age=0" (facade fix of 16 Nov)',
    );
    const userId = data.userId('sec6');
    const email = data.email('sec6');
    await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: data.name() });
    await seedField(aisle, cleanup, {
      userId,
      field: PII_FIELDS.EMAIL,
      value: email,
      blocker: BLOCKERS.email,
    });

    const read = await aisle.readPii({ user_id: userId, field_names: [PII_FIELDS.NAME] });
    expectStatus(read, 200, 'read');
    expectNoStore(read);

    const bulk = await aisle.batchRead({ user_ids: [userId], fields: [PII_FIELDS.NAME] });
    expectStatus(bulk, 200, 'bulk read');
    expectNoStore(bulk);

    for (const includeValues of [true, false]) {
      const search = await aisle.searchPii(PII_FIELDS.EMAIL, {
        value: email,
        limit: 10,
        include_values: includeValues,
      });
      blockIfAccessDenied(search, BLOCKERS.search.id, BLOCKERS.search.reason);
      expectStatus(search, 200, `search (include_values ${includeValues})`);
      expectNoStore(search);
    }
  });

  test('AISLE-SEC-007 A refused request (422) never repeats the submitted value or the tenant', async ({
    aisle,
    data,
  }) => {
    noteObserved(
      '2026-11-19',
      '422 replies list only field locations and error types — no submitted values, no tenant_id (Dev fix ClickUp 14zmk4dnunb)',
    );
    const marker = () => `QaMarker${randomUUID().replace(/-/g, '')}`;

    const longName = marker();
    const save = await aisle.call('writePii', {
      user_id: data.userId('sec7'),
      field: PII_FIELDS.NAME,
      value: `${longName} ${'x'.repeat(LIMITS.value.max)}`,
    });
    expectValidationError(save, 'value', { type: 'string_too_long', notEchoed: [longName] });

    const extra = marker();
    const read = await aisle.call('readPii', {
      user_id: data.userId('sec7'),
      field_names: [PII_FIELDS.NAME],
      qa_extra_key: extra,
    });
    expectValidationError(read, 'unknown', { type: 'extra_forbidden', notEchoed: [extra] });

    const users = data.userIds(LIMITS.batchUserIds.max, 'sec7');
    const markedUser = marker();
    const bulk = await aisle.call('batchReadPii', {
      user_ids: [markedUser, ...users],
      fields: [PII_FIELDS.NAME],
    });
    expectValidationError(bulk, 'user_ids', { type: 'too_long', notEchoed: [markedUser, users[0]!] });
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
