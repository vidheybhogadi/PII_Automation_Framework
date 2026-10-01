/**
 * Aisle token (Bearer) checks. Observed on staging: a missing, wrong or malformed token gets 401 with an
 * empty text/html body. The real token is NEVER used in a tamper value, and no token is ever printed.
 */
import { randomUUID } from 'node:crypto';
import { expectUnauthorized } from '../../src/assertions/response.assertions';
import { expectResponseDoesNotEcho, expectSecretEquals } from '../../src/assertions/security.assertions';
import { readValue, seedField } from '../../src/fixtures/steps';
import { ENDPOINT_KEYS, type EndpointKey } from '../../src/clients/endpoints';
import { expect, noteAssumption, test } from '../../src/fixtures/test-fixtures';
import { PII_FIELDS } from '../../src/models/pii.models';

/** A made-up token: clearly fake, never the real one. */
const FAKE_TOKEN = 'Bearer qa-auto-not-a-real-token';

test.describe('Aisle facade — token authentication', { tag: ['@security'] }, () => {
  test(
    'AISLE-AUTH-001 A save without a token is refused (401) and the saved name stays the same',
    { tag: ['@smoke', '@phase1'] },
    async ({ aisle, data, cleanup }) => {
      const userId = data.userId('auth1');
      const original = data.name();
      await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: original });

      const res = await aisle.call(
        'writePii',
        { user_id: userId, field: PII_FIELDS.NAME, value: data.name() },
        { tamper: { authorization: null } },
      );
      expectUnauthorized(res);

      expectSecretEquals(
        await readValue(aisle, { userId, field: PII_FIELDS.NAME }),
        original,
        'NAME unchanged',
      );
    },
  );

  test(
    'AISLE-AUTH-002 A wrong token is refused (401) and no data is returned',
    { tag: ['@smoke', '@phase1'] },
    async ({ aisle, data, cleanup }) => {
      const userId = data.userId('auth2');
      const name = data.name();
      await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: name });

      const res = await aisle.call(
        'readPii',
        { user_id: userId, field_names: [PII_FIELDS.NAME] },
        { tamper: { authorization: FAKE_TOKEN } },
      );
      expectUnauthorized(res);
      expectResponseDoesNotEcho(res, name);
    },
  );

  test('AISLE-AUTH-003 A badly formed Authorization header is refused (401)', async ({ aisle, data }) => {
    noteAssumption(
      'BQ-17',
      'not covered: the facade also accepts the token without "Bearer" or with "bearer"',
    );
    const payload = { user_id: data.userId('auth3'), field_names: [PII_FIELDS.NAME] };
    const malformed = ['Token abc', 'Bearer ', 'Basic Zm9vOmJhcg=='];
    for (const [index, authorization] of malformed.entries()) {
      const res = await aisle.call('readPii', payload, { tamper: { authorization } });
      expectUnauthorized(res, `malformed header #${index + 1}`);
    }
  });

  test('AISLE-AUTH-004 Every Aisle PII endpoint refuses a request without a token (401)', async ({
    aisle,
    data,
  }) => {
    noteAssumption('BQ-09', 'observed 401 on health, read and save; this run confirms the other endpoints');
    const userId = data.userId('auth4');
    // Harmless fake bodies: no real phone number, no real IDs.
    const payloads: Record<EndpointKey, unknown> = {
      healthReady: undefined,
      writePii: { user_id: userId, field: PII_FIELDS.NAME, value: data.name() },
      readPii: { user_id: userId, field_names: [PII_FIELDS.NAME] },
      searchPii: { value: data.email('auth4'), limit: 1, include_values: false },
      batchReadPii: { user_ids: [userId], fields: [PII_FIELDS.NAME] },
      createTransientPhone: { phone: 'not-a-phone', ttl_seconds: 900 },
      resolveTransientPhone: { transient_id: randomUUID() },
      promoteTransientPhone: { transient_id: randomUUID(), user_id: userId },
      createFreeTextKey: {},
      readFreeTextKey: { key_id: randomUUID() },
      revokeFreeTextKey: { key_id: randomUUID() },
    };

    const notRefused: string[] = [];
    for (const key of ENDPOINT_KEYS) {
      const res = await aisle.call(key, payloads[key], {
        tamper: { authorization: null },
        ...(key === 'searchPii' ? { pathParams: { field: PII_FIELDS.EMAIL } } : {}),
      });
      const body = res.json() as { data?: unknown } | undefined;
      const hasData = body !== undefined && body.data !== undefined && body.data !== null;
      if (res.status !== 401 || hasData)
        notRefused.push(`${key}: HTTP ${res.status}${hasData ? ' with data' : ''}`);
    }
    expect(notRefused, 'endpoints that did not refuse a request without a token').toEqual([]);
  });
});
